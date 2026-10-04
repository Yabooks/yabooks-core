/* global IdentityPicker */

/**
 * widget listing the relationships of an identity, with buttons to delete them and a modal to add new ones;
 * relationship types already in use are suggested, but any other type may be entered as well
 */
const RelationshipsWidget = (
{
    components: { IdentityPicker },

    props: [ "identity" ], // { _id, full_name } of the individual or organization the page shows

    template: `
        <div class="widget">
            <span class="title">{{ $filters.translate("people.relationships") }}</span>
            <button class="plus" @click="openModal()" :title="$filters.translate('people.relationships.add')">+</button>
            <ul>
                <li class="relationship" v-for="rel in relationships" :key="rel._id" :class="{ ended: hasEnded(rel) }">
                    <span class="description">
                        {{ rel.icon || "🔗" }}
                        <span class="tag" v-if="isOutgoing(rel)">{{ rel.type }}</span>
                        <a :href="partnerUrl(rel)">{{ partnerOf(rel).full_name }}</a>
                        <span class="tag" v-if="!isOutgoing(rel)">{{ rel.type }}</span>
                        <small v-if="rel.valid_from || rel.valid_to">{{ period(rel) }}</small>
                    </span>
                    <button class="remove" @click="remove(rel)" :title="$filters.translate('people.relationships.delete')">&#x2715;</button>
                </li>
                <li class="empty" v-if="loaded && !relationships.length">{{ $filters.translate("people.relationships.none") }}</li>
            </ul>

            <div class="modal-shadow" v-if="modal" @click.self="modal = null">
                <div class="modal" @keydown.esc="modal = null">
                    <h3>{{ $filters.translate("people.relationships.new") }}</h3>

                    <div class="fields">
                        <label>
                            {{ $filters.translate("people.relationships.partner") }}
                            <identity-picker ref="picker" :exclude="identity._id" @select="modal.partner = $event"
                                :placeholder="$filters.translate('people.relationships.search')"
                                :no-results-text="$filters.translate('people.relationships.no-results')"></identity-picker>
                        </label>

                        <!-- no label element: clicking a suggestion inside it would focus the icon field -->
                        <div class="field">
                            {{ $filters.translate("people.relationships.type") }}
                            <span class="row">
                                <input type="text" class="icon" v-model="modal.icon" maxlength="8" :placeholder="'🔗'" :title="$filters.translate('people.relationships.icon')" />
                                <span class="type-input">
                                    <input type="text" v-model="modal.type" autocomplete="off"
                                        :placeholder="$filters.translate('people.relationships.type-placeholder')"
                                        @input="typeSuggestionsOpen = true; highlightedType = 0" @focus="typeSuggestionsOpen = true"
                                        @blur="typeSuggestionsOpen = false; suggestIcon()"
                                        @keydown.down.prevent="moveTypeHighlight(1)" @keydown.up.prevent="moveTypeHighlight(-1)"
                                        @keydown.enter.prevent="pickType(typeSuggestions[highlightedType])" @keydown.esc="closeTypeSuggestions($event)" />
                                    <span class="suggestions" role="listbox" v-if="typeSuggestionsOpen && typeSuggestions.length">
                                        <span class="suggestion" role="option" v-for="(type, index) in typeSuggestions" :key="type.type"
                                            :class="{ highlighted: index === highlightedType }" :aria-selected="index === highlightedType"
                                            @mousedown.prevent="pickType(type)" @mouseenter="highlightedType = index">
                                            <span class="emoji">{{ type.icon || "" }}</span>
                                            <span>{{ type.type }}</span>
                                        </span>
                                    </span>
                                </span>
                            </span>
                        </div>

                        <div class="direction">
                            <span>{{ (modal.reversed ? modal.partner?.full_name : identity.full_name) || "…" }}</span>
                            <span class="tag">{{ modal.type || "…" }}</span>
                            <span>{{ (modal.reversed ? identity.full_name : modal.partner?.full_name) || "…" }}</span>
                            <button class="swap" @click="modal.reversed = !modal.reversed" :title="$filters.translate('people.relationships.swap')">&#x21C4;</button>
                        </div>

                        <div class="row">
                            <label>
                                {{ $filters.translate("people.relationships.valid-from") }}
                                <input type="date" v-model="modal.valid_from" :max="modal.valid_to || undefined" />
                            </label>
                            <label>
                                {{ $filters.translate("people.relationships.valid-to") }}
                                <input type="date" v-model="modal.valid_to" :min="modal.valid_from || undefined" />
                            </label>
                        </div>
                    </div>

                    <span class="error" v-if="modal.error">{{ modal.error }}</span>

                    <div class="actions">
                        <button @click="create()" :disabled="modal.saving || !modal.partner || !modal.type.trim()">{{ $filters.translate("people.relationships.create") }}</button>
                        <button @click="modal = null">{{ $filters.translate("people.cancel") }}</button>
                    </div>
                </div>
            </div>
        </div>
    `,

    data()
    {
        return {
            relationships: [],
            types: [],
            typeSuggestionsOpen: false,
            highlightedType: 0,
            loaded: false,
            modal: null // { partner, type, icon, reversed, valid_from, valid_to, saving, error }
        };
    },

    computed:
    {
        // known types containing the typed text, most used first; any other type may be entered as well
        typeSuggestions()
        {
            const query = this.modal?.type.trim().toLowerCase() ?? "";
            return this.types.filter(type => type.type.toLowerCase().includes(query) && type.type !== this.modal.type.trim());
        }
    },

    watch:
    {
        "identity._id": { immediate: true, handler(id) { if(id) this.load(); } }
    },

    methods:
    {
        async load()
        {
            this.relationships = (await axios.get(`/api/v1/identities/${this.identity._id}/relationships`)).data;
            this.loaded = true;
        },

        isOutgoing(rel)
        {
            return String(rel.from._id) === String(this.identity._id);
        },

        partnerOf(rel)
        {
            return this.isOutgoing(rel) ? rel.to : rel.from;
        },

        partnerUrl(rel)
        {
            const partner = this.partnerOf(rel);
            return `${partner.kind?.toLowerCase()}.html?${partner._id}`;
        },

        hasEnded(rel)
        {
            return !!rel.valid_to && new Date(rel.valid_to) < new Date();
        },

        period(rel)
        {
            return [ rel.valid_from, rel.valid_to ].map(date => date ? this.$filters.formatDate(date) : "").join(" – ");
        },

        async remove(rel)
        {
            const message = this.$filters.translate("people.relationships.confirm-delete")
                .split("{type}").join(rel.type).split("{name}").join(this.partnerOf(rel).full_name);

            if(!confirm(message))
                return;

            try
            {
                await axios.delete(`/api/v1/relationships/${rel._id}`);
                await this.load();
            }
            catch(x) { alert(x?.response?.data?.error || x?.message || x); }
        },

        async openModal()
        {
            this.modal = { partner: null, type: "", icon: "", reversed: false, valid_from: "", valid_to: "", saving: false, error: null };
            this.$nextTick(() => this.$refs.picker?.focus());

            try { this.types = (await axios.get("/api/v1/relationships/types")).data; }
            catch(x) { this.types = []; } // suggestions are optional
        },

        pickType(type)
        {
            if(!type)
                return;

            this.modal.type = type.type;
            this.typeSuggestionsOpen = false;
            this.suggestIcon();
        },

        // escape closes the open suggestions first, and the modal only after that
        closeTypeSuggestions(event)
        {
            if(this.typeSuggestionsOpen && this.typeSuggestions.length)
                event.stopPropagation();
            this.typeSuggestionsOpen = false;
        },

        moveTypeHighlight(step)
        {
            this.typeSuggestionsOpen = true;
            const count = this.typeSuggestions.length;
            if(count)
                this.highlightedType = (this.highlightedType + step + count) % count;
        },

        // takes over the icon that is usually used with a known type, unless an icon was entered already
        suggestIcon()
        {
            const known = this.types.find(type => type.type === this.modal.type.trim());
            if(known?.icon && !this.modal.icon)
                this.modal.icon = known.icon;
        },

        async create()
        {
            const modal = this.modal;
            modal.saving = true;
            modal.error = null;

            try
            {
                const [ from, to ] = modal.reversed ? [ modal.partner._id, this.identity._id ] : [ this.identity._id, modal.partner._id ];

                await axios.post(`/api/v1/identities/${from}/relationships`, {
                    to,
                    type: modal.type.trim(),
                    icon: modal.icon.trim() || undefined,
                    valid_from: modal.valid_from || undefined,
                    valid_to: modal.valid_to || undefined
                });

                this.modal = null;
                await this.load();
            }
            catch(x)
            {
                modal.error = x?.response?.data?.error || x?.message || String(x);
                modal.saving = false;
            }
        }
    }
});
