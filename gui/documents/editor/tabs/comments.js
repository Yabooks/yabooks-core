/* global loadSession */

/**
 * chat-style comments on the edited document, newest at the bottom; older comments are loaded when scrolling to the
 * top; users and apps can be mentioned by typing "@", which notifies them; comments are saved immediately,
 * independent of saving the document
 */
const CommentsTab = (
{
    props: [ "doc" ],

    template: `
        <div class="item comments-item">
            <h3>{{ $filters.translate("documents.editor.comments") }}</h3>
            <div class="comments" ref="list" @scroll="onScroll()">
                <div class="comments-status" v-if="loadingOlder">{{ $filters.translate("documents.editor.comments.loading") }}</div>
                <div class="comments-status" v-else-if="loaded && !hasMore && comments.length">{{ $filters.translate("documents.editor.comments.beginning") }}</div>
                <div class="comments-empty" v-if="loaded && !comments.length">{{ $filters.translate("documents.editor.comments.none") }}</div>
                <template v-for="(comment, index) in comments" :key="comment._id">
                    <div class="comments-day" v-if="startsDay(index)">{{ $filters.formatDate(timestampOf(comment)) }}</div>
                    <div class="comment" :class="{ own: isOwn(comment), continued: continuesPrevious(index) }">
                        <span class="avatar" :class="comment.author_type">
                            <img v-if="avatarOf(comment)" :src="avatarOf(comment)" alt="" @error="$event.target.style.display = 'none'" />
                            <span v-else>{{ initialsOf(comment) }}</span>
                        </span>
                        <div class="bubble">
                            <div class="meta">
                                <span class="author">{{ comment.author_name || $filters.translate("documents.editor.comments.unknown-author") }}</span>
                                <span class="app-badge" v-if="comment.author_type === 'app'">{{ $filters.translate("documents.editor.comments.app") }}</span>
                                <span class="time" :title="$filters.formatDateTime(timestampOf(comment))">{{ formatTime(timestampOf(comment)) }}</span>
                                <button class="remove" v-if="isOwn(comment)" @click="remove(comment)" :title="$filters.translate('documents.editor.comments.delete')">&#x2715;</button>
                            </div>
                            <div class="text"><template v-for="segment in segmentsOf(comment.comment)"><span v-if="segment.mention" class="mention" :class="segment.mention">@{{ segment.text }}</span><template v-else>{{ segment.text }}</template></template></div>
                        </div>
                    </div>
                </template>
            </div>

            <div class="comment-input">
                <span class="mention-suggestions" role="listbox" v-if="mention && suggestions.length">
                    <span class="suggestion" role="option" v-for="(candidate, index) in suggestions" :key="candidate.type + candidate._id"
                        :class="{ highlighted: index === highlighted }" :aria-selected="index === highlighted"
                        @mousedown.prevent="pickMention(candidate)" @mouseenter="highlighted = index">
                        <span class="avatar small" :class="candidate.type">
                            <img v-if="candidate.type === 'user' || candidate.icon" :src="candidate.type === 'user' ? '/api/v1/users/' + candidate._id + '/profile-picture' : candidate.icon" alt="" @error="$event.target.style.display = 'none'" />
                        </span>
                        <span class="name">{{ candidate.name }}</span>
                        <span class="detail">{{ candidate.type === "app" ? $filters.translate("documents.editor.comments.app") : candidate.email }}</span>
                    </span>
                </span>
                <textarea ref="input" v-model="text" rows="2" :placeholder="$filters.translate('documents.editor.comments.placeholder')"
                    @input="detectMention()" @click="detectMention()" @keyup.left="detectMention()" @keyup.right="detectMention()" @blur="mention = null"
                    @keydown="onKeydown($event)"></textarea>
                <button class="send" @click="send()" :disabled="sending || !text.trim()" :title="$filters.translate('documents.editor.comments.send')">&#x27A4;</button>
            </div>
            <span class="error" v-if="error">{{ error }}</span>
        </div>
    `,

    data()
    {
        return {
            comments: [],
            hasMore: false,
            loaded: false,
            loadingOlder: false,
            me: null, // user id of the session
            text: "",
            picked: [], // mentions picked while typing: { type, _id, name }
            mention: null, // { start, query } of the mention being typed
            suggestions: [],
            highlighted: 0,
            sending: false,
            error: null
        };
    },

    watch:
    {
        "doc._id": { immediate: true, handler(id) { if(id) this.load(); } }
    },

    async mounted()
    {
        try { this.me = (await loadSession())?.user ?? null; }
        catch(x) { this.me = null; }
    },

    methods:
    {
        async load()
        {
            try
            {
                const res = await axios.get(`/api/v1/documents/${this.doc._id}/comments`);
                this.comments = res.data.data;
                this.hasMore = res.data.has_more;
            }
            catch(x) { console.error(x); this.comments = []; this.hasMore = false; }

            this.loaded = true;
            this.$nextTick(() => this.scrollToBottom());
        },

        // endless scrolling: load older comments when scrolled (almost) to the top, keeping the visible comments in place
        async onScroll()
        {
            const list = this.$refs.list;
            if(!list || list.scrollTop > 40 || !this.hasMore || this.loadingOlder || !this.comments.length)
                return;

            this.loadingOlder = true;
            try
            {
                const res = await axios.get(`/api/v1/documents/${this.doc._id}/comments`, { params: { before: this.comments[0]._id } });
                const previousHeight = list.scrollHeight, previousTop = list.scrollTop;

                this.comments = [ ...res.data.data, ...this.comments ];
                this.hasMore = res.data.has_more;

                await this.$nextTick();
                list.scrollTop = previousTop + list.scrollHeight - previousHeight;
            }
            catch(x) { console.error(x); }
            finally { this.loadingOlder = false; }

            // the loaded comments might not fill the list, so it cannot be scrolled up any further
            this.$nextTick(() => this.onScroll());
        },

        scrollToBottom()
        {
            const list = this.$refs.list;
            if(list)
                list.scrollTop = list.scrollHeight;

            // the list may not have been scrollable yet, which also needs older comments to be loaded
            this.$nextTick(() => this.onScroll());
        },

        timestampOf(comment)
        {
            return comment.createdAt ?? this.$filters.id2timestamp(comment._id);
        },

        formatTime(timestamp)
        {
            return new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        },

        startsDay(index)
        {
            if(index === 0)
                return true;
            const day = (comment) => new Date(this.timestampOf(comment)).toDateString();
            return day(this.comments[index]) !== day(this.comments[index - 1]);
        },

        // consecutive comments of the same author within a few minutes are shown as one block
        continuesPrevious(index)
        {
            const previous = this.comments[index - 1], comment = this.comments[index];
            return !!previous && !this.startsDay(index) && previous.author === comment.author && previous.author_type === comment.author_type
                && new Date(this.timestampOf(comment)) - new Date(this.timestampOf(previous)) < 5 * 60 * 1000;
        },

        isOwn(comment)
        {
            return comment.author_type === "user" && !!this.me && String(comment.author) === String(this.me);
        },

        avatarOf(comment)
        {
            return comment.author_type === "user" ? `/api/v1/users/${comment.author}/profile-picture` : comment.author_icon;
        },

        initialsOf(comment)
        {
            return (comment.author_name || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("");
        },

        // splits a comment text into plain text and mentions, e.g. "hi @[Jane](user:<id>)" into "hi " and the mention of Jane
        segmentsOf(text)
        {
            const segments = [], pattern = /@\[([^\]\n]*)\]\((user|app):([0-9a-f]{24})\)/g;
            let last = 0;

            for(let match of String(text ?? "").matchAll(pattern))
            {
                if(match.index > last)
                    segments.push({ text: text.substring(last, match.index) });
                segments.push({ text: match[1], mention: match[2] });
                last = match.index + match[0].length;
            }

            if(last < String(text ?? "").length)
                segments.push({ text: text.substring(last) });

            return segments;
        },

        // detects a mention being typed right before the cursor, like "@jan", and searches matching users and apps
        detectMention()
        {
            const input = this.$refs.input;
            const before = this.text.substring(0, input?.selectionStart ?? this.text.length);
            const match = before.match(/(^|\s)@([^\s@]{0,30})$/);

            if(!match)
                return this.mention = null;

            const query = match[2];
            if(this.mention?.query === query)
                return;

            this.mention = { start: before.length - query.length - 1, query };
            this.highlighted = 0;

            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(async () =>
            {
                try
                {
                    const res = await axios.get(`/api/v1/documents/${this.doc._id}/comments/mentionable`, { params: { q: query } });
                    if(this.mention?.query === query) // ignore responses of outdated queries
                        this.suggestions = res.data;
                }
                catch(x) { console.error("could not search users and apps to mention", x); }
            }, 150);
        },

        // replaces the typed "@query" with "@Name " and remembers whom the name refers to
        pickMention(candidate)
        {
            if(!candidate || !this.mention)
                return;

            const input = this.$refs.input;
            const end = input?.selectionStart ?? this.text.length;
            const inserted = `@${candidate.name} `;

            this.text = this.text.substring(0, this.mention.start) + inserted + this.text.substring(end);
            if(!this.picked.some(p => p.type === candidate.type && String(p._id) === String(candidate._id)))
                this.picked.push({ type: candidate.type, _id: candidate._id, name: candidate.name });

            const cursor = this.mention.start + inserted.length;
            this.mention = null;
            this.suggestions = [];
            this.$nextTick(() => { input?.focus(); input?.setSelectionRange(cursor, cursor); });
        },

        onKeydown(event)
        {
            const suggesting = this.mention && this.suggestions.length;

            if(suggesting && [ "ArrowDown", "ArrowUp" ].includes(event.key))
            {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                this.highlighted = (this.highlighted + step + this.suggestions.length) % this.suggestions.length;
            }
            else if(suggesting && [ "Enter", "Tab" ].includes(event.key))
            {
                event.preventDefault();
                this.pickMention(this.suggestions[this.highlighted]);
            }
            else if(suggesting && event.key === "Escape")
            {
                event.stopPropagation();
                this.mention = null;
            }
            else if(event.key === "Enter" && !event.shiftKey && !event.isComposing)
            {
                event.preventDefault();
                this.send();
            }
        },

        // turns the "@Name" of picked mentions into mention tokens, longest names first so they are not cut short
        encode(text)
        {
            const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const picked = [ ...this.picked ].sort((a, b) => b.name.length - a.name.length);
            if(!picked.length)
                return text;

            const pattern = new RegExp(`@(${picked.map(p => escape(p.name)).join("|")})(?![^\\s.,;:!?)])`, "g");
            return text.replace(pattern, (_, name) =>
            {
                const p = picked.find(p => p.name === name);
                return `@[${name.replace(/[\]\n]/g, "")}](${p.type}:${p._id})`;
            });
        },

        async send()
        {
            const text = this.text.trim();
            if(!text || this.sending)
                return;

            this.sending = true;
            this.error = null;

            try
            {
                const res = await axios.post(`/api/v1/documents/${this.doc._id}/comments`, { comment: this.encode(text) });
                this.comments.push(res.data);
                this.text = "";
                this.picked = [];
                this.$nextTick(() => this.scrollToBottom());
            }
            catch(x) { this.error = x?.response?.data?.error || x?.message || String(x); }
            finally { this.sending = false; }
        },

        async remove(comment)
        {
            if(!confirm(this.$filters.translate("documents.editor.comments.confirm-delete")))
                return;

            try
            {
                await axios.delete(`/api/v1/comments/${comment._id}`);
                this.comments = this.comments.filter(c => c._id !== comment._id);
            }
            catch(x) { alert(x?.response?.data?.error || x?.message || x); }
        }
    }
});
