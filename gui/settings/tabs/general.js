/** system settings and read-only information about the installation */
const GeneralTab = (
{
    template: `
        <div>
            <div class="toolbar">
                <h1>{{ $filters.translate("settings.menu.general") }}</h1>
                <span class="grow"></span>
                <button class="primary" v-if="$settings.may('settings', 'write')" :disabled="!changed" @click="save()">
                    {{ $filters.translate("settings.save") }}
                </button>
            </div>

            <h2>{{ $filters.translate("settings.general.settings") }}</h2>
            <div class="form">
                <template v-for="setting in settings" :key="setting.key">
                    <label :for="'setting-' + setting.key">{{ $filters.translate("settings.general." + setting.key) }}</label>
                    <div>
                        <select v-if="setting.key === 'default_role'" :id="'setting-' + setting.key" v-model="values[setting.key]" :disabled="readonly(setting)">
                            <option value="">{{ $filters.translate("settings.general.no-role") }}</option>
                            <option v-for="role in $settings.roles" :value="role._id">{{ $settings.roleName(role._id) }}</option>
                        </select>
                        <select v-else-if="setting.type === 'enum'" :id="'setting-' + setting.key" v-model="values[setting.key]" :disabled="readonly(setting)">
                            <option v-for="value in setting.values" :value="value">{{ value }}</option>
                        </select>
                        <input v-else :id="'setting-' + setting.key" :type="setting.type === 'number' ? 'number' : 'text'" v-model="values[setting.key]" :disabled="readonly(setting)" />
                        <div class="locked" v-if="setting.locked">
                            &#x1F512; {{ $filters.translate("settings.general.locked").split("ENV").join(setting.env) }}
                        </div>
                    </div>
                </template>
            </div>

            <h2>{{ $filters.translate("settings.general.info") }}</h2>
            <div class="form mono" v-if="info">
                <span>{{ $filters.translate("settings.general.version") }}</span><span>{{ info.version }} · Node {{ info.node }} · {{ info.platform }}</span>
                <span>{{ $filters.translate("settings.general.instance") }}</span><span>{{ info.instance }} · {{ $filters.translate("settings.general.running-since") }} {{ new Date(info.started_at).toLocaleString() }}</span>
                <span>{{ $filters.translate("settings.general.base-url") }}</span><span>{{ info.base_url || "–" }} (port {{ info.port }})</span>
                <span>{{ $filters.translate("settings.general.database") }}</span><span>{{ info.database.host }}:{{ info.database.port }} ({{ info.database.user }})</span>
                <span>{{ $filters.translate("settings.general.data-dir") }}</span><span>{{ info.data_dir }}</span>
                <span>{{ $filters.translate("settings.general.ai-keys") }}</span><span>Claude: {{ keyState(info.ai_keys.claude) }} · OpenAI: {{ keyState(info.ai_keys.openai) }}</span>
                <span>{{ $filters.translate("settings.general.fair-use") }}</span><span>{{ info.fair_use_this_month.toFixed(2) }} lakh</span>
            </div>
        </div>
    `,

    data()
    {
        return {
            settings: [],
            values: {},
            info: null
        };
    },

    computed:
    {
        changed()
        {
            return this.settings.some(setting => String(this.values[setting.key]) !== String(setting.value));
        }
    },

    async created()
    {
        try
        {
            await this.reload();
            this.info = (await axios.get("/api/v1/system/info")).data;
        }
        catch(x) { this.$settings.alertError(x); }
    },

    methods:
    {
        async reload()
        {
            this.settings = (await axios.get("/api/v1/system/settings")).data.data;
            this.values = Object.fromEntries(this.settings.map(setting => [ setting.key, setting.value ]));
        },

        readonly(setting)
        {
            return setting.locked || !this.$settings.may("settings", "write");
        },

        keyState(set)
        {
            return this.$filters.translate(set ? "settings.general.key-set" : "settings.general.key-not-set");
        },

        async save()
        {
            try
            {
                const changes = {};
                for(let setting of this.settings)
                    if(!setting.locked && String(this.values[setting.key]) !== String(setting.value))
                        changes[setting.key] = this.values[setting.key];

                await axios.patch("/api/v1/system/settings", changes);
                await this.reload();
            }
            catch(x) { this.$settings.alertError(x); }
        }
    }
});
