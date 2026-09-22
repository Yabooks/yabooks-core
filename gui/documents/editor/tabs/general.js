/* global TagsInput, SearchableDropdown */

const GeneralTab = (
{
    props: [ "doc", "options" ],

    emits: [ "file-replaced" ],

    components: { TagsInput, SearchableDropdown },

    data()
    {
        return {
            uploading: false
        };
    },

    template: `
        <div class="item">
            <h3>{{ $filters.translate("documents.editor.meta-data") }}</h3>
            <table class="form">
                <tr>
                    <td>{{ $filters.translate("documents.editor.posted") }}</td>
                    <td><input type="checkbox" v-model="doc.posted" /></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.date") }}</td>
                    <td><input type="date" v-model="doc.date" /></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.type") }}</td>
                    <td><input type="text" v-model="doc.type" /></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.internal-reference") }}</td>
                    <td><input type="text" v-model="doc.internal_reference" /></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.external-reference") }}</td>
                    <td><input type="text" v-model="doc.external_reference" /></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.name") }}</td>
                    <td><input type="text" v-model="doc.name" /></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.file") }}</td>
                    <td>
                        <div class="field-with-button">
                            <span>{{ doc.mime_type || $filters.translate("documents.editor.no-file") }}</span>
                            <input type="file" ref="fileSelector" @change="upload" hidden />
                            <button @click="$refs.fileSelector.click()" :disabled="uploading">
                                {{ uploading ? "…" : $filters.translate(doc.mime_type ? "documents.editor.replace" : "documents.editor.upload") }}
                            </button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.link") }}</td>
                    <td>
                        <div class="field-with-button">
                            <input type="text" v-model="doc.uri" />
                            <button @click="openUri" :disabled="!doc.uri">{{ $filters.translate("documents.editor.open") }}</button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.classification") }}</td>
                    <td>
                        <select v-model="doc.classification">
                            <option v-for="classification in [ 'top secret', 'secret', 'confidential', 'restricted', 'official' ]" :value="classification">
                                {{ $filters.translate("documents.editor.classification." + classification) }}
                            </option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.tags") }}</td>
                    <td><div class="tags"><tags-input v-model="doc.tags"></tags-input></div></td>
                </tr>
                <tr>
                    <td>{{ $filters.translate("documents.editor.business-partner") }}</td>
                    <td>
                        <searchable-dropdown v-model:selected="doc.business_partner" @emptied="doc.business_partner = null"
                            value="_id" label="full_name" :options="options.identities" :autoSelectFirstMatch="true"
                            :placeholder="$filters.translate('documents.editor.search-business-partner')" />
                    </td>
                </tr>
            </table>
        </div>
    `,

    methods:
    {
        async upload(event)
        {
            const file = event.target.files?.[0];
            event.target.value = ""; // allow selecting the same file again later
            if(!file)
                return;

            // overwriting the binary is immediate and independent of saving the meta data
            if(this.doc.mime_type && !confirm(this.$filters.translate("documents.editor.replace-warning").split("{name}").join(file.name)))
                return;

            try
            {
                this.uploading = true;

                const content_type = file.type || "application/octet-stream";
                await axios.put(`/api/v1/documents/${this.doc._id}/binary`, new Uint8Array(await file.arrayBuffer()),
                    { headers: { "Content-Type": content_type } });

                this.doc.mime_type = content_type;
                this.$emit("file-replaced");
            }
            catch(x)
            {
                console.error(x);
                alert(this.$filters.translate("documents.editor.replace-failed"));
            }
            finally
            {
                this.uploading = false;
            }
        },

        openUri()
        {
            if(this.doc.uri)
                window.open(this.doc.uri, "_blank");
        }
    }
});
