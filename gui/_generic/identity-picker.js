/**
 * search field to pick an individual or organization by any part of its name, searching on the server while typing
 *
 * <identity-picker v-model="doc.business_partner" :exclude="ownId" placeholder="Search..." no-results-text="No matches"
 *     @select="identity => ..."></identity-picker>
 *
 * v-model holds the id of the picked identity (null if none), @select receives the whole identity (or null);
 * arrow keys move through the results, enter picks the highlighted one, escape restores the previous choice
 */
const IdentityPicker = (
{
    props:
    {
        modelValue: { default: null },
        exclude: { default: null }, // id of an identity not to offer, e.g. the one a relationship starts from
        placeholder: { type: String, default: "" },
        noResultsText: { type: String, default: "–" },
        disabled: { type: Boolean, default: false }
    },

    emits: [ "update:modelValue", "select" ],

    template: `
        <span class="identity-picker">
            <img class="avatar" v-if="selected" :src="pictureUrl(selected._id)" alt="" />
            <input type="text" ref="input" v-model="query" :placeholder="placeholder" :disabled="disabled" autocomplete="off"
                :style="selected ? { paddingLeft: '36px' } : null"
                @input="search()" @focus="open = true" @blur="close()"
                @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="pick(results[highlighted])"
                @keydown.esc="restore()" />
            <span class="results" role="listbox" v-if="open && query.trim() && query !== selected?.full_name && (results.length || searched)">
                <span class="result" role="option" v-for="(result, index) in results" :key="result._id" :class="{ highlighted: index === highlighted }"
                    :aria-selected="index === highlighted" @mousedown.prevent="pick(result)" @mouseenter="highlighted = index">
                    <img :src="pictureUrl(result._id)" alt="" loading="lazy" />
                    <span>{{ result.full_name }}</span>
                </span>
                <span class="none" v-if="searched && !results.length">{{ noResultsText }}</span>
            </span>
        </span>
    `,

    data()
    {
        return {
            query: "",
            selected: null, // { _id, full_name } of the picked identity
            results: [],
            searched: false,
            highlighted: 0,
            open: false
        };
    },

    watch:
    {
        // show the name of an identity set from outside, e.g. when a document is loaded
        modelValue: { immediate: true, async handler(id)
        {
            if(!id)
                return this.selected && this.select(null, false);

            if(String(id) === String(this.selected?._id))
                return;

            try
            {
                const identity = (await axios.get(`/api/v1/identities/${id}`)).data;
                if(String(this.modelValue) === String(id)) // not changed meanwhile
                    this.select(identity, false);
            }
            catch(x) { this.select({ _id: id, full_name: String(id) }, false); }
        } }
    },

    created()
    {
        IdentityPicker.injectStyle();
    },

    methods:
    {
        pictureUrl(id)
        {
            return `/api/v1/identities/${id}/picture`;
        },

        select(identity, emit = true)
        {
            this.selected = identity ? { _id: identity._id, full_name: identity.full_name } : null;
            this.query = identity?.full_name ?? "";
            this.results = [];
            this.searched = false;

            if(emit)
            {
                this.$emit("update:modelValue", identity?._id ?? null);
                this.$emit("select", identity);
            }
        },

        pick(identity)
        {
            if(identity)
                this.select(identity);
        },

        // clearing the field removes the choice; typed text that was not picked is reverted on blur
        restore()
        {
            if(!this.query.trim() && this.selected)
                this.select(null);
            else this.query = this.selected?.full_name ?? "";
            this.results = [];
        },

        close()
        {
            this.open = false;
            this.restore();
        },

        move(step)
        {
            if(this.results.length)
                this.highlighted = (this.highlighted + step + this.results.length) % this.results.length;
        },

        search()
        {
            clearTimeout(this.searchTimeout);
            this.open = true;
            this.searched = false;
            this.highlighted = 0;

            const query = this.query.trim();
            if(!query)
                return this.results = [];

            this.searchTimeout = setTimeout(async () =>
            {
                const q = { full_name: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } };
                if(this.exclude)
                    q._id = { $ne: { $oid: String(this.exclude) } };

                try
                {
                    const res = await axios.get("/api/v1/identities", { params: { q: JSON.stringify(q), limit: 8, sort_asc: "full_name" } });
                    if(this.query.trim() === query) // ignore responses of outdated queries
                    {
                        this.results = res.data.data;
                        this.searched = true;
                    }
                }
                catch(x) { console.error("could not search identities", x); }
            }, 250);
        },

        focus()
        {
            this.$refs.input?.focus();
        }
    }
});

// styles are part of the component, as it is used on pages with different style sheets; colors and fonts are inherited
IdentityPicker.injectStyle = () =>
{
    if(document.getElementById("identity-picker-style"))
        return;

    const style = document.createElement("style");
    style.id = "identity-picker-style";
    style.textContent = `
        .identity-picker { position: relative; display: block; }
        .identity-picker input { width: 100%; box-sizing: border-box; }
        .identity-picker .avatar { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px;
            border-radius: 50%; object-fit: cover; pointer-events: none; }
        .identity-picker .results { position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; margin-top: 4px;
            display: flex; flex-direction: column; max-height: 260px; overflow-y: auto; background: white;
            border: 1px solid #ffe4d6; border-radius: 8px; box-shadow: 0 8px 24px rgba(249, 143, 94, 0.2); }
        .identity-picker .result { display: flex; align-items: center; gap: 10px; padding: 8px 12px; color: #1e293b; cursor: pointer; }
        .identity-picker .result.highlighted { background: #fff7f4; }
        .identity-picker .results img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .identity-picker .results .none { padding: 8px 12px; color: #94a3b8; }
    `;
    document.head.appendChild(style);
};
