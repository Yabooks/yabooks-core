/** list of users; opens the access drawer to create or edit one */
const UsersTab = (
{
    template: `
        <div>
            <div class="toolbar">
                <h1>{{ $filters.translate("settings.menu.users") }}</h1>
                <span class="grow"></span>
                <input id="users-search" v-model="search" :placeholder="$filters.translate('settings.users.search')" />
                <select id="users-role" v-model="roleFilter" v-if="$settings.may('permissions', 'read')">
                    <option value="">{{ $filters.translate("settings.users.all-roles") }}</option>
                    <option v-for="role in $settings.roles" :value="role._id">{{ $settings.roleName(role._id) }}</option>
                </select>
                <label><input id="users-show-inactive" type="checkbox" v-model="showInactive" /> {{ $filters.translate("settings.users.show-deactivated") }}</label>
                <button class="primary" v-if="$settings.may('users', 'write')" @click="selected = null; creating = true">
                    + {{ $filters.translate("settings.users.new") }}
                </button>
            </div>

            <table class="list">
                <thead><tr>
                    <th>{{ $filters.translate("settings.users.user") }}</th>
                    <th>{{ $filters.translate("settings.users.sign-in") }}</th>
                    <th v-if="$settings.may('permissions', 'read')">{{ $filters.translate("settings.access.roles") }}</th>
                    <th>{{ $filters.translate("settings.users.last-sign-in") }}</th>
                    <th>{{ $filters.translate("settings.users.status") }}</th>
                </tr></thead>
                <tbody>
                    <tr v-for="user in visibleUsers" :key="user._id" class="clickable"
                        :class="{ selected: selected?._id === user._id, inactive: !user.active }" @click="creating = false; selected = user">
                        <td>{{ user.full_name || user.email }}<br v-if="user.full_name" /><span class="secondary" v-if="user.full_name">{{ user.email }}</span></td>
                        <td>{{ $filters.translate("settings.users.auth." + user.auth_type) }}</td>
                        <td v-if="$settings.may('permissions', 'read')">
                            <span class="chip" v-for="assignment in user.roles">
                                {{ $settings.roleName(assignment.role) }} <span class="scope">· {{ $settings.scopeLabel(assignment.scope) }}</span>
                            </span>
                            <span class="secondary" v-if="!user.roles?.length">–</span>
                        </td>
                        <td>{{ user.last_sign_in ? new Date(user.last_sign_in).toLocaleString() : "–" }}</td>
                        <td><span class="pill" :class="{ active: user.active }">{{ $filters.translate(user.active ? "settings.users.active" : "settings.users.deactivated") }}</span></td>
                    </tr>
                </tbody>
            </table>
            <p class="empty" v-if="!visibleUsers.length">{{ $filters.translate("settings.users.empty") }}</p>

            <access-drawer v-if="selected || creating" kind="users" :subject="selected" @close="close()" @saved="saved()"></access-drawer>
        </div>
    `,

    data()
    {
        return {
            users: [],
            search: "",
            roleFilter: "",
            showInactive: false,
            selected: null,
            creating: false
        };
    },

    computed:
    {
        visibleUsers()
        {
            const search = this.search.toLowerCase();
            return this.users.filter(user =>
                (this.showInactive || user.active) &&
                (!search || `${user.full_name ?? ""} ${user.email}`.toLowerCase().includes(search)) &&
                (!this.roleFilter || user.roles?.some(assignment => String(assignment.role) === String(this.roleFilter))));
        }
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
                this.users = (await axios.get("/api/v1/users", { params: { limit: 10000, sort_asc: "email" } })).data.data;
            }
            catch(x) { this.$settings.alertError(x); }
        },

        close()
        {
            this.selected = null;
            this.creating = false;
        },

        async saved()
        {
            this.close();
            await this.reload();
            await this.$settings.loadAccessData(); // role holder counts
        }
    }
});
