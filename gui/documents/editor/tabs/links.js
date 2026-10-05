/**
 * relationships (links) of the edited document to other documents, with buttons to delete them and a modal to add new ones;
 * link types already in use are suggested, but any other type may be entered as well; changes take effect immediately,
 * independent of saving the document
 */
const LinksTab = (
{
    props: [ "doc" ],

    template: `
        <div class="item">
            <h3>{{ $filters.translate("documents.editor.links") }}</h3>
            <p class="note">{{ $filters.translate("documents.editor.links.note") }}</p>
            <table class="records links">
                <tr v-for="link in links" :key="link._id">
                    <td class="icon">{{ link.icon || "🔗" }}</td>
                    <td>
                        <template v-if="isOutgoing(link)">
                            <span class="link-type">{{ link.type }}</span>
                            <a v-if="!partnerOf(link).restricted" :href="partnerUrl(link)">{{ describe(partnerOf(link)) }}</a>
                            <span v-else class="restricted">{{ $filters.translate("documents.editor.links.restricted") }}</span>
                        </template>
                        <template v-else>
                            <a v-if="!partnerOf(link).restricted" :href="partnerUrl(link)">{{ describe(partnerOf(link)) }}</a>
                            <span v-else class="restricted">{{ $filters.translate("documents.editor.links.restricted") }}</span>
                            <span class="link-type">{{ link.type }}</span>
                            <span>{{ $filters.translate("documents.editor.links.this-document") }}</span>
                        </template>
                    </td>
                    <td class="actions">
                        <button class="delete" @click="remove(link)" :title="$filters.translate('documents.editor.links.delete')">&#x2715;</button>
                    </td>
                </tr>
                <tr v-if="loaded && !links.length">
                    <td class="empty" colspan="3">{{ $filters.translate("documents.editor.links.none") }}</td>
                </tr>
            </table>
            <div class="records-footer">
                <button class="add" @click="openModal()">{{ $filters.translate("documents.editor.links.add") }}</button>
            </div>

            <teleport to="body">
                <div class="modal-overlay" v-if="modal" @click.self="modal = null" @keydown.esc="modal = null">
                    <div class="modal-dialog links-modal">
                        <h3>{{ $filters.translate("documents.editor.links.new") }}</h3>
                        <table class="form">
                            <tr>
                                <td>{{ $filters.translate("documents.editor.links.document") }}</td>
                                <td>
                                    <span class="picker">
                                        <input type="text" ref="search" v-model="modal.query" autocomplete="off"
                                            :placeholder="$filters.translate('documents.editor.links.search')"
                                            @input="search()" @focus="modal.resultsOpen = true" @blur="modal.resultsOpen = false"
                                            @keydown.down.prevent="moveHighlight('result', 1)" @keydown.up.prevent="moveHighlight('result', -1)"
                                            @keydown.enter.prevent="pickDocument(modal.results[modal.highlightedResult])" />
                                        <span class="suggestions" role="listbox" v-if="modal.resultsOpen && modal.query.trim() && (modal.results.length || modal.searched)">
                                            <span class="suggestion" role="option" v-for="(result, index) in modal.results" :key="result._id"
                                                :class="{ highlighted: index === modal.highlightedResult }" :aria-selected="index === modal.highlightedResult"
                                                @mousedown.prevent="pickDocument(result)" @mouseenter="modal.highlightedResult = index">
                                                {{ describe(result) }}
                                            </span>
                                            <span class="none" v-if="modal.searched && !modal.results.length">{{ $filters.translate("documents.editor.links.no-results") }}</span>
                                        </span>
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td>{{ $filters.translate("documents.editor.links.type") }}</td>
                                <td>
                                    <span class="type-row">
                                        <input type="text" class="icon" v-model="modal.icon" maxlength="8" placeholder="🔗"
                                            :title="$filters.translate('documents.editor.links.icon')" />
                                        <span class="picker">
                                            <input type="text" v-model="modal.type" autocomplete="off"
                                                :placeholder="$filters.translate('documents.editor.links.type-placeholder')"
                                                @input="modal.typesOpen = true; modal.highlightedType = 0" @focus="modal.typesOpen = true"
                                                @blur="modal.typesOpen = false; suggestIcon()"
                                                @keydown.down.prevent="moveHighlight('type', 1)" @keydown.up.prevent="moveHighlight('type', -1)"
                                                @keydown.enter.prevent="pickType(typeSuggestions[modal.highlightedType])" @keydown.esc="closeTypeSuggestions($event)" />
                                            <span class="suggestions" role="listbox" v-if="modal.typesOpen && typeSuggestions.length">
                                                <span class="suggestion" role="option" v-for="(type, index) in typeSuggestions" :key="type.type"
                                                    :class="{ highlighted: index === modal.highlightedType }" :aria-selected="index === modal.highlightedType"
                                                    @mousedown.prevent="pickType(type)" @mouseenter="modal.highlightedType = index">
                                                    <span class="emoji">{{ type.icon || "" }}</span>
                                                    <span>{{ type.type }}</span>
                                                </span>
                                            </span>
                                        </span>
                                    </span>
                                </td>
                            </tr>
                        </table>

                        <div class="direction">
                            <span>{{ modal.reversed ? (modal.partner ? describe(modal.partner) : "…") : $filters.translate("documents.editor.links.this-document") }}</span>
                            <span class="link-type">{{ modal.type.trim() || "…" }}</span>
                            <span>{{ modal.reversed ? $filters.translate("documents.editor.links.this-document") : (modal.partner ? describe(modal.partner) : "…") }}</span>
                            <button class="swap" @click="modal.reversed = !modal.reversed" :title="$filters.translate('documents.editor.links.swap')">&#x21C4;</button>
                        </div>

                        <span class="error" v-if="modal.error">{{ modal.error }}</span>

                        <div class="modal-actions">
                            <button @click="create()" :disabled="modal.saving || !modal.partner || !modal.type.trim()">{{ $filters.translate("documents.editor.links.create") }}</button>
                            <button @click="modal = null">{{ $filters.translate("documents.editor.links.cancel") }}</button>
                        </div>
                    </div>
                </div>
            </teleport>
        </div>
    `,

    data()
    {
        return {
            links: [],
            types: [],
            loaded: false,
            modal: null // { query, results, searched, resultsOpen, highlightedResult, partner, type, icon, typesOpen, highlightedType, reversed, saving, error }
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
        "doc._id": { immediate: true, handler(id) { if(id) this.load(); } }
    },

    methods:
    {
        async load()
        {
            try { this.links = (await axios.get(`/api/v1/documents/${this.doc._id}/links`)).data; }
            catch(x) { console.error(x); this.links = []; }
            this.loaded = true;
        },

        isOutgoing(link)
        {
            return String(link.from._id) === String(this.doc._id);
        },

        partnerOf(link)
        {
            return this.isOutgoing(link) ? link.to : link.from;
        },

        partnerUrl(link)
        {
            return `?${this.partnerOf(link)._id}`;
        },

        describe(doc)
        {
            const date = doc.date ? this.$filters.formatDate(doc.date) : null;
            return [ date, doc.type, doc.internal_reference || doc.external_reference, doc.name ].filter(Boolean).join(" · ")
                || this.$filters.translate("documents.editor.links.unnamed");
        },

        async remove(link)
        {
            const partner = this.partnerOf(link);
            const message = this.$filters.translate("documents.editor.links.confirm-delete")
                .split("{type}").join(link.type)
                .split("{name}").join(partner.restricted ? this.$filters.translate("documents.editor.links.restricted") : this.describe(partner));

            if(!confirm(message))
                return;

            try
            {
                await axios.delete(`/api/v1/document-links/${link._id}`);
                await this.load();
            }
            catch(x) { alert(x?.response?.data?.error || x?.message || x); }
        },

        async openModal()
        {
            this.modal = {
                query: "", results: [], searched: false, resultsOpen: false, highlightedResult: 0, partner: null,
                type: "", icon: "", typesOpen: false, highlightedType: 0, reversed: false, saving: false, error: null
            };
            this.$nextTick(() => this.$refs.search?.focus());

            try { this.types = (await axios.get(`/api/v1/businesses/${this.doc.business}/document-links/types`)).data; }
            catch(x) { this.types = []; } // suggestions are optional
        },

        // searches the documents of the same business by type, references and name while typing
        search()
        {
            const modal = this.modal;
            clearTimeout(this.searchTimeout);
            modal.resultsOpen = true;
            modal.searched = false;
            modal.highlightedResult = 0;

            const query = modal.query.trim();
            if(!query)
                return modal.results = [];

            this.searchTimeout = setTimeout(async () =>
            {
                const regex = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
                const q = {
                    _id: { $ne: { $oid: String(this.doc._id) } },
                    $or: [ "name", "type", "internal_reference", "external_reference" ].map(field => ({ [field]: regex }))
                };

                try
                {
                    const res = await axios.get(`/api/v1/businesses/${this.doc.business}/documents`,
                        { params: { q: JSON.stringify(q), limit: 8, sort_desc: "date" } });

                    if(this.modal === modal && modal.query.trim() === query) // ignore responses of outdated queries
                    {
                        modal.results = res.data.data;
                        modal.searched = true;
                    }
                }
                catch(x) { console.error("could not search documents", x); }
            }, 250);
        },

        pickDocument(doc)
        {
            if(!doc)
                return;

            this.modal.partner = doc;
            this.modal.query = this.describe(doc);
            this.modal.results = [];
            this.modal.resultsOpen = false;
        },

        pickType(type)
        {
            if(!type)
                return;

            this.modal.type = type.type;
            this.modal.typesOpen = false;
            this.suggestIcon();
        },

        // escape closes the open suggestions first, and the modal only after that
        closeTypeSuggestions(event)
        {
            if(this.modal.typesOpen && this.typeSuggestions.length)
                event.stopPropagation();
            this.modal.typesOpen = false;
        },

        moveHighlight(list, step)
        {
            const [ open, highlighted, items ] = list === "type"
                ? [ "typesOpen", "highlightedType", this.typeSuggestions ]
                : [ "resultsOpen", "highlightedResult", this.modal.results ];

            this.modal[open] = true;
            if(items.length)
                this.modal[highlighted] = (this.modal[highlighted] + step + items.length) % items.length;
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
                const [ from, to ] = modal.reversed ? [ modal.partner._id, this.doc._id ] : [ this.doc._id, modal.partner._id ];

                await axios.post(`/api/v1/documents/${from}/links`, {
                    to,
                    type: modal.type.trim(),
                    icon: modal.icon.trim() || undefined
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
