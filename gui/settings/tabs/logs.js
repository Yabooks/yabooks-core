/** system log, audit trail and api request log */
const LogsTab = (
{
    template: `
        <div>
            <div class="toolbar">
                <h1>{{ $filters.translate("settings.menu.logs") }}</h1>
                <span class="grow"></span>
                <button class="chip" v-for="view in views" :class="{ selected: view === selectedView }" @click="selectView(view)">
                    {{ $filters.translate("settings.logs.view." + view) }}
                </button>
            </div>

            <div class="toolbar">
                <template v-if="selectedView === 'system'">
                    <button class="chip" :class="{ selected: source === '' }" @click="setSource('')">{{ $filters.translate("settings.logs.all") }}</button>
                    <button class="chip" :class="{ selected: source === 'core' }" @click="setSource('core')">Core</button>
                    <button class="chip" v-for="app in $settings.apps" :class="{ selected: source === app._id }" @click="setSource(app._id)">
                        {{ $settings.appName(app._id) }}
                    </button>
                    <span class="grow"></span>
                    <select id="logs-min-level" v-model="minLevel" @change="reload()">
                        <option v-for="level in levels" :value="level">≥ {{ level }}</option>
                    </select>
                </template>
                <template v-if="selectedView === 'audit'">
                    <input id="logs-entity" v-model="entity" @change="reload()" :placeholder="$filters.translate('settings.logs.entity')" />
                    <input id="logs-record" v-model="record" @change="reload()" :placeholder="$filters.translate('settings.logs.record')" />
                    <span class="grow"></span>
                </template>
                <template v-if="selectedView !== 'audit'">
                    <input id="logs-search" v-model="search" @change="reload()" :placeholder="$filters.translate('settings.logs.search')" />
                </template>
                <button @click="toggleLive()" :class="{ primary: live }">&#x27F3; {{ $filters.translate("settings.logs.live") }}</button>
            </div>

            <table class="list">
                <thead v-if="selectedView === 'system'"><tr>
                    <th>{{ $filters.translate("settings.logs.time") }}</th><th>{{ $filters.translate("settings.logs.level") }}</th>
                    <th>{{ $filters.translate("settings.logs.source") }}</th><th>{{ $filters.translate("settings.logs.message") }}</th>
                </tr></thead>
                <thead v-if="selectedView === 'audit'"><tr>
                    <th>{{ $filters.translate("settings.logs.time") }}</th><th>{{ $filters.translate("settings.logs.entity") }}</th>
                    <th>{{ $filters.translate("settings.logs.change") }}</th><th>{{ $filters.translate("settings.logs.by") }}</th>
                </tr></thead>
                <thead v-if="selectedView === 'requests'"><tr>
                    <th>{{ $filters.translate("settings.logs.time") }}</th><th>{{ $filters.translate("settings.logs.request") }}</th>
                    <th>{{ $filters.translate("settings.logs.by") }}</th>
                </tr></thead>
                <tbody>
                    <template v-for="entry in entries" :key="entry._id">
                        <tr v-if="selectedView === 'system'">
                            <td class="mono secondary">{{ time(entry) }}</td>
                            <td class="mono" :class="'level-' + entry.level">{{ entry.level.toUpperCase() }}</td>
                            <td>{{ entry.source === "core" ? "Core" : $settings.appName(entry.source) }}</td>
                            <td class="mono">{{ entry.message }}</td>
                        </tr>
                        <tr v-if="selectedView === 'audit'" class="clickable" @click="expanded = expanded === entry._id ? null : entry._id">
                            <td class="mono secondary">{{ time(entry) }}</td>
                            <td>{{ entry.entity }} <span class="secondary mono">{{ (entry.after ?? entry.before)?._id }}</span></td>
                            <td>{{ $filters.translate("settings.logs.change." + (!entry.before ? "created" : !entry.after ? "deleted" : "changed")) }}</td>
                            <td>{{ actor(entry.created_by_user, entry.created_by_app) }}</td>
                        </tr>
                        <tr v-if="selectedView === 'audit' && expanded === entry._id">
                            <td colspan="4" class="detail"><pre class="mono">{{ JSON.stringify({ before: entry.before, after: entry.after }, null, 2) }}</pre></td>
                        </tr>
                        <tr v-if="selectedView === 'requests'">
                            <td class="mono secondary">{{ time(entry) }}</td>
                            <td class="mono">{{ entry.method }} {{ entry.path }}</td>
                            <td>{{ entry.app_id ? $settings.appName(entry.app_id) : entry.session_id ? $filters.translate("settings.logs.user-session") : "–" }}</td>
                        </tr>
                    </template>
                </tbody>
            </table>
            <p class="empty" v-if="!entries.length">{{ $filters.translate("settings.logs.empty") }}</p>
            <div v-if="entries.length < total"><button @click="loadMore()">{{ $filters.translate("settings.load-more") }}</button></div>
        </div>
    `,

    data()
    {
        return {
            views: [ "system", "audit", "requests" ],
            levels: [ "debug", "info", "warn", "error" ],
            selectedView: "system",
            source: "",
            minLevel: "info",
            search: "",
            entity: "",
            record: "",
            entries: [],
            total: 0,
            expanded: null,
            live: false,
            timer: null
        };
    },

    async created()
    {
        await this.reload();
    },

    unmounted()
    {
        clearInterval(this.timer);
    },

    methods:
    {
        query(skip = 0)
        {
            const params = { skip, limit: 100 };

            if(this.selectedView === "system")
                Object.assign(params, { source: this.source, min_level: this.minLevel, search: this.search });
            if(this.selectedView === "audit")
                Object.assign(params, { entity: this.entity, record: this.record });
            if(this.selectedView === "requests")
                Object.assign(params, { search: this.search });

            const path = { system: "logs", audit: "audit-log", requests: "api-requests" }[this.selectedView];
            return axios.get(`/api/v1/system/${path}`, { params: Object.fromEntries(Object.entries(params).filter(([ , value ]) => value !== "")) });
        },

        async reload()
        {
            try
            {
                const res = await this.query();
                this.entries = res.data.data;
                this.total = res.data.total;
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async loadMore()
        {
            try
            {
                const res = await this.query(this.entries.length);
                this.entries.push(...res.data.data);
                this.total = res.data.total;
            }
            catch(x) { this.$settings.alertError(x); }
        },

        selectView(view)
        {
            this.selectedView = view;
            this.entries = [];
            this.reload();
        },

        setSource(source)
        {
            this.source = source;
            this.reload();
        },

        toggleLive()
        {
            this.live = !this.live;
            clearInterval(this.timer);
            if(this.live)
                this.timer = setInterval(() => this.reload(), 5000);
        },

        idTime(id)
        {
            return new Date(parseInt(String(id).substring(0, 8), 16) * 1000);
        },

        time(entry)
        {
            return this.idTime(entry._id).toLocaleString();
        },

        actor(user, app)
        {
            return [ user ? `${this.$filters.translate("settings.logs.user")} ${user}` : null, app ? this.$settings.appName(app) : null ].filter(Boolean).join(" · ") || "–";
        }
    }
});
