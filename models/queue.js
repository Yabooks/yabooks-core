const mongoose = require("../services/connector.js"), { App } = require("./app.js");

// queue job schema
const QueueJob = mongoose.model("QueueJob", (function()
{
    // an attempt to hand the job over to an app listening to event "queue.<queue name>"
    const callSchema = new mongoose.Schema(
    {
        app: { type: mongoose.Schema.Types.ObjectId, ref: "App", required: true },
        called_at: { type: Date, required: true },
        accepted: { type: Boolean, required: true },
        http_status: Number,
        error: String
    });

    // an outcome reported back by the app that accepted the job
    const reportSchema = new mongoose.Schema(
    {
        app: { type: mongoose.Schema.Types.ObjectId, ref: "App", required: true },
        reported_at: { type: Date, required: true, default: () => new Date() },
        outcome: { type: String, enum: [ "success", "temporary_error", "permanent_error" ], required: true },
        message: String,
        result: mongoose.Schema.Types.Mixed
    });

    const schemaDefinition = (
    {
        queue: { type: String, required: true },
        payload: mongoose.Schema.Types.Mixed,
        priority: { type: Number, default: 5 }, // higher priority jobs are dispatched first
        max_retries: { type: Number, default: 3, min: 0 },
        retries: { type: Number, default: 0 },
        status: { type: String, enum: [ "queued", "dispatching", "accepted", "succeeded", "failed" ], default: "queued" },
        enqueued_at: { type: Date, default: () => new Date() },
        queued_at: { type: Date, default: () => new Date() }, // position within priority; reset when re-queued after a temporary error
        enqueued_by: {
            app: { type: mongoose.Schema.Types.ObjectId, ref: "App" },
            user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
        },
        dispatching_to: { type: mongoose.Schema.Types.ObjectId, ref: "App" }, // app currently being called
        accepted_by: { type: mongoose.Schema.Types.ObjectId, ref: "App" },
        accepted_at: Date,
        finished_at: Date,
        calls: [ callSchema ],
        reports: [ reportSchema ]
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false });
    schema.index({ queue: 1, status: 1, priority: -1, queued_at: 1 });
    return schema;
})());

const runningQueues = new Set(), pendingQueues = new Set();

// hands the job over to the first app listening to "queue.<queue name>" that responds with a 2xx status; returns true if an app accepted
QueueJob.dispatch = async function(job)
{
    const event = "queue." + job.queue;

    for(let webhook of await App.findWebhooks(event))
    {
        let call = { app: webhook.app_id, called_at: new Date() };

        try
        {
            await QueueJob.updateOne({ _id: job._id }, { $set: { dispatching_to: webhook.app_id } });

            let response = await App.sendWebhook(webhook, {
                event,
                payload: job.payload,
                job: { _id: job._id, queue: job.queue, priority: job.priority, retries: job.retries, max_retries: job.max_retries, enqueued_at: job.enqueued_at }
            });

            call.http_status = response.status;
            call.accepted = response.ok;

            if(!response.ok)
                call.error = (await response.text()).substring(0, 1000);
        }
        catch(x)
        {
            call.accepted = false;
            call.error = String(x?.message || x);
        }

        await QueueJob.updateOne({ _id: job._id }, { $push: { calls: call } });

        if(call.accepted)
        {
            // the app might already have reported an outcome while its webhook was still being called
            await QueueJob.updateOne({ _id: job._id, status: "dispatching" },
                { $set: { status: "accepted", accepted_by: webhook.app_id, accepted_at: new Date() }, $unset: { dispatching_to: true } });
            return true;
        }
    }

    // no app accepted the job, leave it at its position in the queue
    await QueueJob.updateOne({ _id: job._id, status: "dispatching" }, { $set: { status: "queued" }, $unset: { dispatching_to: true } });
    return false;
};

// dispatches queued jobs of a queue in order of priority and queue position until the queue is empty or no app accepts a job
QueueJob.processQueue = async function(queue)
{
    if(runningQueues.has(queue))
        return pendingQueues.add(queue);

    runningQueues.add(queue);

    try
    {
        do
        {
            pendingQueues.delete(queue);

            for(;;)
            {
                let job = await QueueJob.findOneAndUpdate({ queue, status: "queued" }, { $set: { status: "dispatching" } },
                    { sort: { priority: -1, queued_at: 1 }, new: true });

                if(!job || !await QueueJob.dispatch(job))
                    break;
            }
        }
        while(pendingQueues.has(queue));
    }
    catch(x)
    {
        console.error(`${ new Date().toLocaleString() } could not process queue ${queue}`, x);
    }
    finally
    {
        runningQueues.delete(queue);
    }
};

// records an app's reported outcome; temporary errors re-add the job to the back of its queue until max_retries is exceeded
QueueJob.report = async function(job, app_id, outcome, message, result)
{
    const now = new Date(), report = { app: app_id, reported_at: now, outcome, message, result };
    let update;

    if(outcome === "success")
        update = { $set: { status: "succeeded", finished_at: now } };

    else if(outcome === "permanent_error" || job.retries >= job.max_retries)
        update = { $set: { status: "failed", finished_at: now } };

    else update = { $set: { status: "queued", queued_at: now }, $inc: { retries: 1 } };

    update.$set.accepted_by = app_id;
    update.$set.accepted_at = job.accepted_at || now;
    update.$unset = { dispatching_to: true };
    update.$push = { reports: report };

    // only the app that accepted the job (or is currently being handed the job) may report its outcome
    let { matchedCount } = await QueueJob.updateOne({ _id: job._id, $or: [
        { status: "accepted", accepted_by: app_id },
        { status: "dispatching", dispatching_to: app_id }
    ] }, update);

    if(matchedCount && update.$set.status === "queued")
        QueueJob.processQueue(job.queue);

    return matchedCount > 0;
};

// recovers jobs interrupted by a restart and periodically retries dispatching queues that no app accepted jobs of
QueueJob.startDispatcher = async function(interval = 30000)
{
    await QueueJob.updateMany({ status: "dispatching" }, { $set: { status: "queued" }, $unset: { dispatching_to: true } });

    const sweep = async () =>
    {
        try
        {
            for(let queue of await QueueJob.distinct("queue", { status: "queued" }))
                QueueJob.processQueue(queue);
        }
        catch(x)
        {
            console.error(`${ new Date().toLocaleString() } could not sweep queues`, x);
        }
    };

    await sweep();
    setInterval(sweep, interval).unref();
};

module.exports = { QueueJob };
