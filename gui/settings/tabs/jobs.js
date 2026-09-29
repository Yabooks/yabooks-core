/** jobs of all queues, with retry and cancel */
const JobsTab = (
{
    template: `
        <div>
            <div class="toolbar">
                <h1>{{ $filters.translate("settings.menu.jobs") }}</h1>
                <span class="grow"></span>
                <select id="jobs-queue" v-model="queue" @change="reload()">
                    <option value="">{{ $filters.translate("settings.jobs.all-queues") }}</option>
                    <option v-for="name in queues" :value="name">{{ name }}</option>
                </select>
                <button @click="reload()">&#x27F3;</button>
            </div>

            <div class="stats">
                <button v-for="state in states" :class="{ selected: status === state }" @click="filterStatus(state)">
                    <b>{{ counts[state] ?? 0 }}</b> {{ $filters.translate("settings.jobs.status." + state) }}
                </button>
            </div>

            <table class="list">
                <thead><tr>
                    <th>{{ $filters.translate("settings.jobs.queue") }}</th>
                    <th>{{ $filters.translate("settings.jobs.status") }}</th>
                    <th>{{ $filters.translate("settings.jobs.priority") }}</th>
                    <th>{{ $filters.translate("settings.jobs.tries") }}</th>
                    <th>{{ $filters.translate("settings.jobs.enqueued") }}</th>
                    <th>{{ $filters.translate("settings.jobs.handled-by") }}</th>
                    <th></th>
                </tr></thead>
                <tbody>
                    <template v-for="job in jobs" :key="job._id">
                        <tr class="clickable" :class="{ selected: expanded === job._id }" @click="expanded = expanded === job._id ? null : job._id">
                            <td class="mono">{{ job.queue }}</td>
                            <td><span class="pill" :class="job.status">{{ $filters.translate("settings.jobs.status." + job.status) }}</span></td>
                            <td>{{ job.priority }}</td>
                            <td>{{ job.retries }} / {{ job.max_retries }}</td>
                            <td>{{ new Date(job.enqueued_at).toLocaleString() }}</td>
                            <td>{{ job.accepted_by ? $settings.appName(job.accepted_by) : "–" }}</td>
                            <td @click.stop>
                                <button v-if="canWrite && [ 'failed', 'cancelled' ].includes(job.status)" @click="act(job, 'retry')">{{ $filters.translate("settings.jobs.retry") }}</button>
                                <button v-if="canWrite && job.status === 'queued'" @click="act(job, 'cancel')">{{ $filters.translate("settings.jobs.cancel") }}</button>
                            </td>
                        </tr>
                        <tr v-if="expanded === job._id">
                            <td colspan="7" class="detail">
                                <h2>{{ $filters.translate("settings.jobs.payload") }}</h2>
                                <pre class="mono">{{ JSON.stringify(job.payload, null, 2) }}</pre>
                                <h2>{{ $filters.translate("settings.jobs.calls") }}</h2>
                                <div v-for="call in job.calls" class="mono">
                                    {{ new Date(call.called_at).toLocaleString() }} · {{ $settings.appName(call.app) }} ·
                                    {{ call.accepted ? "accepted" : "declined" }} {{ call.http_status ? "(HTTP " + call.http_status + ")" : "" }} {{ call.error ?? "" }}
                                </div>
                                <div v-if="!job.calls?.length" class="secondary">–</div>
                                <h2>{{ $filters.translate("settings.jobs.reports") }}</h2>
                                <div v-for="report in job.reports" class="mono">
                                    {{ new Date(report.reported_at).toLocaleString() }} · {{ $settings.appName(report.app) }} · {{ report.outcome }} {{ report.message ?? "" }}
                                </div>
                                <div v-if="!job.reports?.length" class="secondary">–</div>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
            <p class="empty" v-if="!jobs.length">{{ $filters.translate("settings.jobs.empty") }}</p>
            <div v-if="jobs.length < total"><button @click="reload(jobs.length)">{{ $filters.translate("settings.load-more") }}</button></div>
        </div>
    `,

    data()
    {
        return {
            states: [ "queued", "accepted", "succeeded", "failed", "cancelled" ],
            queue: "",
            status: "",
            queues: [],
            counts: {},
            jobs: [],
            total: 0,
            expanded: null
        };
    },

    computed:
    {
        canWrite()
        {
            return this.$settings.may("jobs", "write");
        }
    },

    async created()
    {
        await this.reload();
    },

    methods:
    {
        async reload(skip = 0)
        {
            try
            {
                const params = Object.fromEntries(Object.entries({ queue: this.queue, status: this.status, skip, limit: 100 }).filter(([ , value ]) => value !== ""));
                const res = await axios.get("/api/v1/jobs", { params });

                this.jobs = skip ? [ ...this.jobs, ...res.data.data ] : res.data.data;
                this.total = res.data.total;
                this.counts = res.data.counts;
                this.queues = res.data.queues;
            }
            catch(x) { this.$settings.alertError(x); }
        },

        filterStatus(state)
        {
            this.status = this.status === state ? "" : state;
            this.reload();
        },

        async act(job, action)
        {
            try
            {
                await axios.post(`/api/v1/jobs/${job._id}/${action}`);
                await this.reload();
            }
            catch(x) { this.$settings.alertError(x); }
        }
    }
});
