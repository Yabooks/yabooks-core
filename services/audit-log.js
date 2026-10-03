// query operations that return the affected document(s) directly, so no extra lookup is needed to know the "after" state
const updateOpsReturningDoc = [ "findOneAndUpdate", "findOneAndReplace" ];

// query operations that only return a write result (matched/modified/upserted counts), the affected documents have to
// be looked up separately
const updateOpsReturningWriteResult = [ "updateOne", "updateMany", "replaceOne" ];

const deleteOps = [ "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove" ];

const plainObject = (doc) => doc?.toObject ? doc.toObject({ getters: false }) : doc ?? null;

const redactFields = (data, redact) =>
{
    if(!data || !redact?.length)
        return data ?? null;

    data = { ...data };
    for(let field of redact)
        if(data[field] !== undefined)
            data[field] = "[redacted]";
    return data;
};

const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Registers hooks on the given schema that write an AuditLogEntry for every create, update and delete performed
 * through it - via document instances (save, deleteOne) as well as via queries (updateOne, findOneAndUpdate,
 * insertMany, deleteMany, ...) - regardless of which route or code path performed the change. `redact` names top
 * level fields (e.g. password hashes or secrets) whose values are replaced with a placeholder before being stored.
 */
module.exports = function registerAuditLog(schema, entityName, { redact = [] } = {})
{
    const record = async (before, after) =>
    {
        before = redactFields(before, redact);
        after = redactFields(after, redact);

        if(sameData(before, after))
            return;

        try
        {
            const { AuditLogEntry } = require("../models/log.js");
            const actor = require("./audit-context.js").getActor();

            await AuditLogEntry.create({
                entity: entityName,
                before: before ?? undefined,
                after: after ?? undefined,
                created_by_app: actor.app_id || undefined,
                created_by_user: actor.user_id || undefined
            });
        }
        catch(x)
        {
            require("./logger.js").Logger.log("error", `could not write audit log entry for ${entityName}`, x?.message || x);
        }
    };

    // creating or updating a single document via doc.save()
    schema.pre("save", async function()
    {
        this.$locals.auditBefore = this.isNew ? null : await this.constructor.findById(this._id).lean();
    });

    schema.post("save", function(doc)
    {
        record(this.$locals.auditBefore ?? null, plainObject(doc));
    });

    // bulk creation
    schema.post("insertMany", function(docs)
    {
        for(let doc of [].concat(docs ?? []))
            record(null, plainObject(doc));
    });

    // deleting a single document via doc.deleteOne()
    schema.pre("deleteOne", { document: true, query: false }, function()
    {
        this.$locals.auditBefore = plainObject(this);
    });

    schema.post("deleteOne", { document: true, query: false }, function(doc)
    {
        record(this.$locals?.auditBefore ?? plainObject(doc), null);
    });

    // updating or deleting documents by query: the affected documents are looked up before the operation runs, since
    // afterwards there is no other way to know what they looked like (in particular once they are deleted)
    schema.pre([ ...updateOpsReturningDoc, ...updateOpsReturningWriteResult, ...deleteOps ], { query: true, document: false }, async function()
    {
        this._auditBefore = await this.model.find(this.getFilter()).lean();
    });

    schema.post(updateOpsReturningDoc, function(result)
    {
        if(!result)
            return;

        const before = (this._auditBefore ?? []).find(d => String(d._id) === String(result._id)) ?? null;
        record(before, plainObject(result));
    });

    schema.post(updateOpsReturningWriteResult, function(result)
    {
        const before = this._auditBefore ?? [];
        const ids = before.map(d => d._id);

        if(result?.upsertedId)
            ids.push(result.upsertedId);

        if(!ids.length)
            return;

        const model = this.model;
        (async () =>
        {
            const after = await model.find({ _id: { $in: ids } }).lean();
            const afterById = new Map(after.map(d => [ String(d._id), d ]));
            const beforeById = new Map(before.map(d => [ String(d._id), d ]));

            for(let id of ids)
                await record(beforeById.get(String(id)) ?? null, afterById.get(String(id)) ?? null);
        })().catch(x => require("./logger.js").Logger.log("error", `could not write audit log entries for ${entityName}`, x?.message || x));
    });

    schema.post(deleteOps, function()
    {
        for(let doc of this._auditBefore ?? [])
            record(doc, null);
    });
};
