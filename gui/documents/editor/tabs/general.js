/* global TagsInput, SearchableDropdown */

const GeneralTab = (
{
    props: [ "doc" ],

    components: { TagsInput, SearchableDropdown },

    data()
    {
        return {
            identities: []
        };
    },

    async mounted()
    {
        try
        {
            let data = await axios.get("/api/v1/identities?limit=1000");
            this.identities = data.data.data;
        }
        catch(x)
        {
            console.error(x);
        }
    },

    template: `
        <div class="item">
            <h3>Meta data</h3>
            <table>
                <tr>
                    <td>Posted?</td>
                    <td><input type="checkbox" v-model="doc.posted" /></td>
                </tr>
                <tr>
                    <td>Document Date</td>
                    <td><input type="datetime-local" v-model="doc.date" /></td>
                </tr>
                <tr>
                    <td>Document Type</td>
                    <td><input type="text" v-model="doc.type" /></td>
                </tr>
                <tr>
                    <td>Internal Reference Number</td>
                    <td><input type="text" v-model="doc.internal_reference" /></td>
                </tr>
                <tr>
                    <td>External Invoice Number</td>
                    <td><input type="text" v-model="doc.external_reference" /></td>
                </tr>
                <tr>
                    <td>Document Name</td>
                    <td><input type="text" v-model="doc.name" /></td>
                </tr>
                <tr>
                    <td>File</td>
                    <td>
                        <div class="field-with-button">
                            <span>{{ doc.mime_type }}</span>
                            <button @click="upload">replace</button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>Link</td>
                    <td>
                        <div class="field-with-button">
                            <input type="text" v-model="doc.uri" />
                            <button @click="openUri">open</button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>Classification</td>
                    <td>
                        <select v-model="doc.classification">
                            <option>top secret</option>
                            <option>secret</option>
                            <option>confidential</option>
                            <option>restricted</option>
                            <option>official</option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>Tags</td>
                    <td><tags-input v-model="doc.tags"></tags-input></td>
                </tr>
                <tr>
                    <td>Business Partner</td>
                    <td>
                        <searchable-dropdown v-model:selected="doc.business_partner" value="_id" label="full_name"
                            :options="identities" :autoSelectFirstMatch="true" placeholder="Search business partner..." />
                    </td>
                </tr>
            </table>
        </div>
    `,

    methods:
    {
        upload()
        {
            // TODO
        },

        openUri()
        {
            if(this.doc.uri)
                window.open(this.doc.uri, "_blank");
        }
    }
});
