/** roles and what they may do, edited as a matrix of areas and actions */
const RolesTab = (
{
    template: `
        <div>
            <div class="toolbar">
                <h1>{{ $filters.translate("settings.menu.roles") }}</h1>
            </div>

            <div class="roles">
                <div class="role-list">
                    <button v-for="role in $settings.roles" :class="{ selected: String(role._id) === String(selectedId) }" @click="select(role)">
                        <span>{{ role.built_in ? "\u{1F512} " : "" }}{{ $settings.roleName(role._id) }}</span>
                        <span class="secondary">{{ role.holders }}</span>
                    </button>
                    <div class="add" v-if="canWrite" style="margin-top: 8px">
                        <input id="roles-new-name" v-model="newName" :placeholder="$filters.translate('settings.roles.new-name')" @keyup.enter="create()" />
                        <button :disabled="!newName.trim()" @click="create()">+ {{ $filters.translate("settings.roles.new") }}</button>
                    </div>
                </div>

                <div class="editor" v-if="role">
                    <p v-if="role.built_in" class="hint">{{ $filters.translate("settings.roles.administrator-hint") }}</p>
                    <template v-else>
                        <div class="toolbar">
                            <input id="role-name" v-model="name" :disabled="!canWrite" />
                            <span class="grow"></span>
                            <button class="danger" v-if="canWrite" @click="remove()">{{ $filters.translate("settings.roles.delete") }}</button>
                            <button class="primary" v-if="canWrite" :disabled="!changed" @click="save()">{{ $filters.translate("settings.save") }}</button>
                        </div>
                        <input id="role-description" v-model="description" :disabled="!canWrite" :placeholder="$filters.translate('settings.roles.description')" />

                        <table class="list matrix">
                            <thead><tr>
                                <th>{{ $filters.translate("settings.roles.area") }}</th>
                                <th class="cell" v-for="action in standardActions">{{ $settings.actionLabel(action) }}</th>
                                <th>{{ $filters.translate("settings.roles.other-actions") }}</th>
                            </tr></thead>
                            <tbody>
                                <template v-for="group in groups">
                                    <tr class="group"><td colspan="5">{{ group.label }}</td></tr>
                                    <tr v-for="entry in group.entries">
                                        <td>{{ $settings.areaLabel(entry.object) }}</td>
                                        <td class="cell" v-for="action in standardActions">
                                            <button v-if="entry.actions.includes(action)" class="toggle" :class="state(entry, action)" :disabled="!canWrite"
                                                @click="cycle(entry, action)" :title="$filters.translate('settings.roles.cycle')">{{ symbol(entry, action) }}</button>
                                        </td>
                                        <td>
                                            <button v-for="action in entry.actions.filter(action => !standardActions.includes(action))" class="toggle named"
                                                :class="state(entry, action)" :disabled="!canWrite" @click="cycle(entry, action)">
                                                {{ $settings.actionLabel(action) }} {{ symbol(entry, action) }}
                                            </button>
                                        </td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                        <div class="legend">
                            <span><span class="toggle allow">&#10003;</span> {{ $filters.translate("settings.access.effect.allow") }}</span>
                            <span><span class="toggle deny">&#10005;</span> {{ $filters.translate("settings.roles.deny-hint") }}</span>
                            <span><span class="toggle">–</span> {{ $filters.translate("settings.roles.not-granted") }}</span>
                        </div>
                        <p class="hint">{{ $filters.translate("settings.roles.scope-hint") }}</p>
                    </template>
                </div>
            </div>
        </div>
    `,

    data()
    {
        return {
            standardActions: [ "read", "write", "delete" ],
            selectedId: null,
            name: "",
            description: "",
            permissions: {}, // "<object>|<action>" -> "allow" | "deny"
            original: null,
            newName: ""
        };
    },

    computed:
    {
        canWrite()
        {
            return this.$settings.may("permissions", "write");
        },

        role()
        {
            return this.$settings.roles.find(role => String(role._id) === String(this.selectedId));
        },

        groups()
        {
            const catalog = this.$settings.catalog, apps = [ ...new Set(catalog.filter(entry => entry.app).map(entry => String(entry.app._id))) ];
            return [
                { label: this.$filters.translate("settings.roles.group.business"), entries: catalog.filter(entry => !entry.app && entry.scope === "business") },
                { label: this.$filters.translate("settings.roles.group.system"), entries: catalog.filter(entry => !entry.app && entry.scope === "system") },
                ...apps.map(app_id => ({
                    label: this.$filters.translate("settings.roles.group.app").split("APP").join(this.$settings.appName(app_id)),
                    entries: catalog.filter(entry => String(entry.app?._id) === app_id)
                }))
            ].filter(group => group.entries.length);
        },

        changed()
        {
            return JSON.stringify({ name: this.name, description: this.description, permissions: this.permissions }) !== this.original;
        }
    },

    created()
    {
        const first = this.$settings.roles.find(role => !role.built_in) ?? this.$settings.roles[0];
        if(first)
            this.select(first);
    },

    methods:
    {
        select(role)
        {
            this.selectedId = role._id;
            this.name = role.name;
            this.description = role.description ?? "";
            this.permissions = Object.fromEntries(role.permissions.map(permission => [ `${permission.object}|${permission.action}`, permission.effect ]));
            this.original = JSON.stringify({ name: this.name, description: this.description, permissions: this.permissions });
        },

        state(entry, action)
        {
            return this.permissions[`${entry.object}|${action}`] ?? "";
        },

        symbol(entry, action)
        {
            return { allow: "✓", deny: "✕" }[this.state(entry, action)] ?? "–";
        },

        // cycles not granted -> allowed -> denied -> not granted; allowing to write or delete also allows to read
        cycle(entry, action)
        {
            const key = `${entry.object}|${action}`, next = { "": "allow", allow: "deny", deny: "" }[this.state(entry, action)];
            const permissions = { ...this.permissions };

            if(next)
                permissions[key] = next;
            else delete permissions[key];

            if(next === "allow" && action !== "read" && entry.actions.includes("read") && !permissions[`${entry.object}|read`])
                permissions[`${entry.object}|read`] = "allow";

            this.permissions = permissions;
        },

        async reloadRoles(selectId)
        {
            await this.$settings.loadAccessData();
            const role = this.$settings.roles.find(role => String(role._id) === String(selectId)) ?? this.$settings.roles[0];
            if(role)
                this.select(role);
        },

        async create()
        {
            try
            {
                const role = (await axios.post("/api/v1/roles", { name: this.newName.trim() })).data;
                this.newName = "";
                await this.reloadRoles(role._id);
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async save()
        {
            try
            {
                const permissions = Object.entries(this.permissions).map(([ key, effect ]) =>
                {
                    const [ object, action ] = key.split("|");
                    return { object, action, effect };
                });

                await axios.patch(`/api/v1/roles/${this.selectedId}`, { name: this.name, description: this.description, permissions });
                await this.reloadRoles(this.selectedId);
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async remove()
        {
            const question = this.$filters.translate("settings.roles.confirm-delete").split("ROLE").join(this.name).split("COUNT").join(this.role.holders);
            if(!confirm(question))
                return;

            try
            {
                await axios.delete(`/api/v1/roles/${this.selectedId}`);
                await this.reloadRoles(null);
            }
            catch(x) { this.$settings.alertError(x); }
        }
    }
});
