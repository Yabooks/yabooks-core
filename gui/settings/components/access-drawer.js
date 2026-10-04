/* global SearchableDropdown */

/**
 * drawer to create or edit a user (kind "users") or to edit the access of an app (kind "apps"): account details, role
 * assignments with their scope, exceptions (direct allow/deny policies) and the resulting effective permissions
 */
const AccessDrawer = (
{
    components: { SearchableDropdown },

    props: [ "kind", "subject" ], // subject is null when creating a new user

    emits: [ "close", "saved" ],

    template: `
        <div class="drawer">
            <button class="close" :title="$filters.translate('settings.close')" @click="$emit('close')">&rsaquo;</button>
            <div class="content">
                <div class="header">
                    <img :src="picture" :class="{ app: kind === 'apps' }" alt="" />
                    <div class="title">
                        <b>{{ title }}</b>
                        <span class="secondary" v-if="kind === 'users' && subject?.full_name">{{ subject.email }}</span>
                    </div>
                    <span v-if="kind === 'users' && subject" class="pill" :class="{ active: subject.active }">
                        {{ $filters.translate(subject.active ? "settings.users.active" : "settings.users.deactivated") }}
                    </span>
                </div>

                <div class="section" v-if="kind === 'users'">
                    <h2>{{ $filters.translate("settings.users.account") }}</h2>
                    <div class="fields">
                        <label for="user-email">{{ $filters.translate("settings.users.email") }}</label>
                        <input id="user-email" type="email" v-model="account.email" :disabled="!mayWriteUsers" />
                        <template v-if="!subject">
                            <label for="user-password">{{ $filters.translate("settings.users.initial-password") }}</label>
                            <input id="user-password" type="password" v-model="account.password" autocomplete="new-password" />
                        </template>
                        <label for="user-language">{{ $filters.translate("settings.users.language") }}</label>
                        <searchable-dropdown id="user-language" class="language" :options="languages" v-model:selected="account.preferred_language"
                            :disabled="!mayWriteUsers"></searchable-dropdown>
                        <template v-if="subject && mayWriteUsers && subject.auth_type?.includes('authenticator')">
                            <span>{{ $filters.translate("settings.users.authenticator") }}</span>
                            <div class="add">
                                <span class="pill active">{{ $filters.translate("settings.users.authenticator-active") }}</span>
                                <button class="danger" @click="resetAuthenticator()">{{ $filters.translate("settings.users.reset-authenticator") }}</button>
                            </div>
                        </template>
                        <template v-if="subject && mayWriteUsers">
                            <label for="user-new-password">{{ $filters.translate("settings.users.new-password") }}</label>
                            <div class="add">
                                <input id="user-new-password" type="password" v-model="newPassword" autocomplete="new-password" />
                                <button :disabled="!newPassword" @click="setPassword()">{{ $filters.translate("settings.users.set-password") }}</button>
                            </div>
                        </template>
                    </div>
                </div>

                <template v-if="$settings.may('permissions', 'read')">
                    <div class="section">
                        <h2>{{ $filters.translate("settings.access.roles") }}</h2>
                        <div class="rows">
                            <template v-for="(assignment, index) in access.roles">
                                <span><span class="chip">{{ $settings.roleName(assignment.role) }}</span> <span class="secondary">{{ $settings.scopeLabel(assignment.scope) }}</span></span>
                                <button class="link" v-if="mayWritePermissions" @click="access.roles.splice(index, 1)">&#10006;</button>
                                <span v-else></span>
                            </template>
                        </div>
                        <p class="hint" v-if="!access.roles.length">{{ $filters.translate("settings.access.no-roles") }}</p>
                        <div class="add" v-if="mayWritePermissions">
                            <select id="access-new-role" v-model="newRole.role">
                                <option v-for="role in $settings.roles" :value="role._id">{{ $settings.roleName(role._id) }}</option>
                            </select>
                            <select id="access-new-role-scope" v-model="newRole.scope">
                                <option value="business::*">{{ $settings.scopeLabel("business::*") }}</option>
                                <option v-for="business in $settings.businesses" :value="'business::' + business._id">{{ business.name }}</option>
                                <option value="*">{{ $settings.scopeLabel("*") }}</option>
                            </select>
                            <button :disabled="!newRole.role" @click="addRole()">{{ $filters.translate("settings.access.add") }}</button>
                        </div>
                    </div>

                    <div class="section">
                        <h2>{{ $filters.translate("settings.access.exceptions") }}</h2>
                        <div class="rows">
                            <template v-for="(exception, index) in access.exceptions">
                                <span>
                                    <span class="effect" :class="exception.effect">{{ $filters.translate("settings.access.effect." + exception.effect) }}</span>
                                    {{ $settings.areaLabel(exception.object) }} · {{ $settings.actionLabel(exception.action) }}
                                    <span class="secondary">· {{ $settings.scopeLabel(exception.scope) }}</span>
                                </span>
                                <button class="link" v-if="mayWritePermissions" @click="access.exceptions.splice(index, 1)">&#10006;</button>
                                <span v-else></span>
                            </template>
                        </div>
                        <p class="hint" v-if="!access.exceptions.length">{{ $filters.translate("settings.access.no-exceptions") }}</p>
                        <div class="add" v-if="mayWritePermissions">
                            <select id="access-new-exception-effect" v-model="newException.effect">
                                <option value="allow">{{ $filters.translate("settings.access.effect.allow") }}</option>
                                <option value="deny">{{ $filters.translate("settings.access.effect.deny") }}</option>
                            </select>
                            <select id="access-new-exception-object" v-model="newException.object" @change="newException.action = ''; newException.scope = newExceptionEntry?.scope === 'system' ? 'system' : 'business::*'">
                                <option v-for="entry in $settings.catalog" :value="entry.object">{{ $settings.areaLabel(entry.object) }}</option>
                            </select>
                            <select id="access-new-exception-action" v-model="newException.action" :disabled="!newExceptionEntry">
                                <option v-for="action in newExceptionEntry?.actions ?? []" :value="action">{{ $settings.actionLabel(action) }}</option>
                            </select>
                            <select id="access-new-exception-scope" v-model="newException.scope" v-if="newExceptionEntry?.scope === 'business'">
                                <option value="business::*">{{ $settings.scopeLabel("business::*") }}</option>
                                <option v-for="business in $settings.businesses" :value="'business::' + business._id">{{ business.name }}</option>
                            </select>
                            <button :disabled="!newException.action" @click="addException()">{{ $filters.translate("settings.access.add") }}</button>
                        </div>
                    </div>

                    <div class="section" v-if="subject">
                        <div class="add">
                            <button @click="loadEffective()">{{ $filters.translate("settings.access.show-effective") }}</button>
                            <select id="access-effective-business" v-model="effectiveBusiness" @change="loadEffective()">
                                <option value="">{{ $settings.scopeLabel("business::*") }}</option>
                                <option v-for="business in $settings.businesses" :value="business._id">{{ business.name }}</option>
                            </select>
                        </div>
                        <p class="hint" v-if="effective && changed">{{ $filters.translate("settings.access.effective-unsaved") }}</p>
                        <div class="effective" v-if="effective">
                            <template v-for="(actions, object) in effective">
                                <template v-if="Object.values(actions).some(Boolean)">
                                    <span>{{ $settings.areaLabel(object) }}</span>
                                    <span><span v-for="(allowed, action) in actions" v-show="allowed" class="chip">{{ $settings.actionLabel(action) }}</span></span>
                                </template>
                            </template>
                        </div>
                        <p class="hint" v-if="effective && !Object.values(effective).some(actions => Object.values(actions).some(Boolean))">
                            {{ $filters.translate("settings.access.no-permissions") }}
                        </p>
                    </div>
                </template>
            </div>

            <div class="footer">
                <span>
                    <template v-if="kind === 'users' && subject && mayWriteUsers">
                        <button class="danger" v-if="subject.active" @click="setActive(false)">{{ $filters.translate("settings.users.deactivate") }}</button>
                        <button v-else @click="setActive(true)">{{ $filters.translate("settings.users.reactivate") }}</button>
                    </template>
                </span>
                <button class="primary" :disabled="!changed || saving" @click="save()">
                    {{ $filters.translate(subject ? "settings.save" : "settings.users.create") }}
                </button>
            </div>
        </div>
    `,

    data()
    {
        return {
            account: { email: "", password: "", preferred_language: "en" },
            originalAccount: null,
            access: { roles: [], exceptions: [] },
            originalAccess: null,
            languages: [],
            newPassword: "",
            newRole: { role: "", scope: "business::*" },
            newException: { effect: "deny", object: "", action: "", scope: "business::*" },
            effective: null,
            effectiveBusiness: "",
            saving: false
        };
    },

    computed:
    {
        mayWriteUsers()
        {
            return this.$settings.may("users", "write");
        },

        mayWritePermissions()
        {
            return this.$settings.may("permissions", "write");
        },

        title()
        {
            if(this.kind === "apps")
                return this.$settings.appName(this.subject._id);
            return this.subject ? this.subject.full_name || this.subject.email : this.$filters.translate("settings.users.new");
        },

        picture()
        {
            if(this.kind === "apps")
                return this.subject.icon || "/apps/icon.png";
            return this.subject ? `/api/v1/users/${this.subject._id}/profile-picture` : "/people/individual.svg";
        },

        newExceptionEntry()
        {
            return this.$settings.catalog.find(entry => entry.object === this.newException.object);
        },

        changed()
        {
            return JSON.stringify(this.account) !== JSON.stringify(this.originalAccount) ||
                JSON.stringify(this.access) !== JSON.stringify(this.originalAccess);
        }
    },

    watch:
    {
        subject: { immediate: true, handler() { this.load(); } }
    },

    methods:
    {
        async load()
        {
            try
            {
                this.effective = null;
                this.newPassword = "";

                if(this.kind === "users")
                {
                    this.account = { email: this.subject?.email ?? "", preferred_language: this.subject?.preferred_language || "en", ...(this.subject ? {} : { password: "" }) };
                    this.languages = (await axios.get("/api/v1/translations/languages")).data.data.map(language => ({
                        value: language.language,
                        label: this.$filters.toLanguageLabel(language.language)
                    }));
                }

                if(this.subject && this.$settings.may("permissions", "read"))
                    this.access = (await axios.get(`/api/v1/${this.kind}/${this.subject._id}/access`)).data;
                else this.access = { roles: [], exceptions: [] };

                this.originalAccount = JSON.parse(JSON.stringify(this.account));
                this.originalAccess = JSON.parse(JSON.stringify(this.access));

                // a new user starts with the default role for new users, if one is configured
                if(!this.subject && this.mayWritePermissions && this.$settings.may("settings", "read"))
                {
                    const defaultRole = (await axios.get("/api/v1/system/settings")).data.data.find(setting => setting.key === "default_role")?.value;
                    if(defaultRole && this.$settings.roles.some(role => String(role._id) === String(defaultRole)))
                        this.access.roles.push({ role: defaultRole, scope: "business::*" });
                }
            }
            catch(x) { this.$settings.alertError(x); }
        },

        addRole()
        {
            if(!this.access.roles.some(assignment => String(assignment.role) === String(this.newRole.role) && assignment.scope === this.newRole.scope))
                this.access.roles.push({ ...this.newRole });
        },

        addException()
        {
            const exception = { scope: this.newException.scope, object: this.newException.object, action: this.newException.action, effect: this.newException.effect };
            if(!this.access.exceptions.some(existing => JSON.stringify(existing) === JSON.stringify(exception)))
                this.access.exceptions.push(exception);
        },

        async loadEffective()
        {
            try
            {
                const params = this.effectiveBusiness ? { business: this.effectiveBusiness } : {};
                this.effective = (await axios.get(`/api/v1/${this.kind}/${this.subject._id}/effective-permissions`, { params })).data;
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async setPassword()
        {
            try
            {
                await axios.post(`/api/v1/users/${this.subject._id}/password`, { password: this.newPassword });
                this.newPassword = "";
                alert(this.$filters.translate("settings.users.password-set"));
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async resetAuthenticator()
        {
            if(!confirm(this.$filters.translate("settings.users.confirm-reset-authenticator")))
                return;

            try
            {
                await axios.delete(`/api/v1/users/${this.subject._id}/mfa`);
                this.$emit("saved");
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async setActive(active)
        {
            if(!active && !confirm(this.$filters.translate("settings.users.confirm-deactivate")))
                return;

            try
            {
                await axios.post(`/api/v1/users/${this.subject._id}/${active ? "reactivate" : "deactivate"}`);
                this.$emit("saved");
            }
            catch(x) { this.$settings.alertError(x); }
        },

        async save()
        {
            this.saving = true;

            try
            {
                let id = this.subject?._id;

                if(this.kind === "users" && !id)
                    id = (await axios.post("/api/v1/users", this.account)).data._id;

                else if(this.kind === "users" && JSON.stringify(this.account) !== JSON.stringify(this.originalAccount))
                    await axios.patch(`/api/v1/users/${id}`, this.account);

                if(this.mayWritePermissions && JSON.stringify(this.access) !== JSON.stringify(this.originalAccess))
                    await axios.put(`/api/v1/${this.kind}/${id}/access`, this.access);

                this.$emit("saved");
            }
            catch(x) { this.$settings.alertError(x); }
            finally { this.saving = false; }
        }
    }
});
