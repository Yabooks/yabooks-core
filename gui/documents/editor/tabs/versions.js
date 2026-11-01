/**
 * previous versions of the edited document's binary content as archived in the database, newest first, preceded by a
 * placeholder for the current version; archived versions can be downloaded and deleted, which takes effect immediately,
 * independent of saving the document
 */
const VersionsTab = (
{
    props: [ "doc" ],

    template: `
        <div class="item">
            <h3>{{ $filters.translate("documents.editor.versions") }}</h3>
            <p class="note">{{ $filters.translate("documents.editor.versions.note") }}</p>
            <table class="records versions">
                <tr>
                    <th class="date">{{ $filters.translate("documents.editor.versions.replaced-at") }}</th>
                    <th>{{ $filters.translate("documents.editor.versions.replaced-by") }}</th>
                    <th>{{ $filters.translate("documents.editor.versions.type") }}</th>
                    <th class="size">{{ $filters.translate("documents.editor.versions.size") }}</th>
                    <th class="actions"></th>
                </tr>
                <tr class="current">
                    <td colspan="5">{{ $filters.translate("documents.editor.versions.current") }}</td>
                </tr>
                <tr v-for="version in versions" :key="version._id">
                    <td class="date">{{ version.createdAt ? $filters.formatDateTime(version.createdAt) : "" }}</td>
                    <td>{{ version.invalidated_by?.email || $filters.translate("documents.editor.versions.app") }}</td>
                    <td>{{ version.mime_type || doc.mime_type || "" }}</td>
                    <td class="size">{{ formatSize(version.size) }}</td>
                    <td class="actions">
                        <a class="button" :href="downloadUrl(version)" download :title="$filters.translate('documents.editor.versions.download')">&#x2B07;&#xFE0F;</a>
                        <button class="delete" @click="remove(version)" :title="$filters.translate('documents.editor.versions.delete')">&#x2715;</button>
                    </td>
                </tr>
                <tr v-if="loaded && !versions.length">
                    <td class="empty" colspan="5">{{ $filters.translate("documents.editor.versions.none") }}</td>
                </tr>
            </table>
        </div>
    `,

    data()
    {
        return {
            versions: [],
            loaded: false
        };
    },

    watch:
    {
        "doc._id": { immediate: true, handler(id) { if(id) this.load(); } }
    },

    methods:
    {
        async load()
        {
            try { this.versions = (await axios.get(`/api/v1/documents/${this.doc._id}/versions`)).data; }
            catch(x) { console.error(x); this.versions = []; }
            this.loaded = true;
        },

        downloadUrl(version)
        {
            return `/api/v1/documents/${this.doc._id}/versions/${version._id}/binary`;
        },

        formatSize(bytes)
        {
            if(typeof bytes !== "number")
                return "";

            const units = [ "B", "KB", "MB", "GB" ];
            let index = 0;
            while(bytes >= 1024 && index < units.length - 1)
            {
                bytes /= 1024;
                index++;
            }
            return `${index ? bytes.toFixed(1) : bytes} ${units[index]}`;
        },

        async remove(version)
        {
            const message = this.$filters.translate("documents.editor.versions.confirm-delete")
                .split("{date}").join(version.createdAt ? this.$filters.formatDateTime(version.createdAt) : "");

            if(!confirm(message))
                return;

            try
            {
                await axios.delete(`/api/v1/documents/${this.doc._id}/versions/${version._id}`);
                await this.load();
            }
            catch(x) { alert(x?.response?.data?.error || x?.message || x); }
        }
    }
});
