/** apps and what they may do on their own; opens the access drawer to edit an app's roles and exceptions */
const AppsTab = (
{
    template: `
        <div>
            <div class="toolbar">
                <h1>{{ $filters.translate("settings.menu.apps") }}</h1>
            </div>
            <p class="hint">{{ $filters.translate("settings.apps.hint") }}</p>

            <table class="list">
                <thead><tr>
                    <th>{{ $filters.translate("settings.apps.app") }}</th>
                    <th>{{ $filters.translate("settings.access.roles") }}</th>
                    <th>{{ $filters.translate("settings.access.exceptions") }}</th>
                </tr></thead>
                <tbody>
                    <tr v-for="app in $settings.apps" :key="app._id" class="clickable" :class="{ selected: selected?._id === app._id }" @click="selected = app">
                        <td>{{ $settings.appName(app._id) }}<br /><span class="secondary mono">{{ app.bundle_id }}</span></td>
                        <td>
                            <span class="chip" v-for="assignment in access[app._id]?.roles">
                                {{ $settings.roleName(assignment.role) }} <span class="scope">· {{ $settings.scopeLabel(assignment.scope) }}</span>
                            </span>
                        </td>
                        <td>{{ access[app._id]?.exceptions.length ?? "" }}</td>
                    </tr>
                </tbody>
            </table>
            <p class="empty" v-if="!$settings.apps.length">{{ $filters.translate("settings.apps.empty") }}</p>

            <access-drawer v-if="selected" kind="apps" :subject="selected" @close="selected = null" @saved="saved()"></access-drawer>
        </div>
    `,

    data()
    {
        return {
            access: {},
            selected: null
        };
    },

    async created()
    {
        await this.reload();
    },

    methods:
    {
        async reload()
        {
            try
            {
                const entries = await Promise.all(this.$settings.apps.map(async app =>
                    [ app._id, (await axios.get(`/api/v1/apps/${app._id}/access`)).data ]));
                this.access = Object.fromEntries(entries);
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async saved()
        {
            this.selected = null;
            await this.reload();
            await this.$settings.loadAccessData();
        }
    }
});
