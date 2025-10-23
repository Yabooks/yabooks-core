/* global TagsInput */

const GeneralTab = (
{
    props: [ "doc" ],

    components: { TagsInput },

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
                        {{ doc.mime_type }}
                        <button @click="upload">replace</button>
                    </td>
                </tr>
                <tr>
                    <td>Link</td>
                    <td>
                        <input type="text" v-model="doc.uri" />
                        <button @click="openUri">open</button>
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
                    <td><business-selector :model="doc.business_partner" /></td>
                </tr>
                <tr>
                    <td>Intra-Company?</td>
                    <td><input type="checkbox" v-model="doc.intracompany" /></td>
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
            // TODO
        }
    }
});