/* global getSelectedBusinessId, filters, FilterBar */

let app = Vue.createApp(
{
    components: { FilterBar },

    data()
    {
        return {
            docs: [],
            error: null,
            business: null,
            notifications: [],

            params: "",
            searchOptions: {
                keys: [
                    "name",
                    "mime_type",
                    "uri",
                    "search_text",
                    "tags",
                    "posted",
                    "date",
                    "internal_reference",
                    "external_reference"
                ],
                types: [
                    String, // name
                    String, // mime_type
                    String, // uri
                    String, // search_text
                    String, // tags
                    "checkbox", // posted
                    "datetime-local", // date
                    "text", // internal_reference
                    "text" // external_reference
                ]
            }
        };
    },

    mounted()
    {
        this.loadDocuments();
    },

    methods:
    {
        async loadDocuments(loadMore = false)
        {
            try
            {
                this.business = await getSelectedBusinessId();
                if(this.business)
                {
                    let params = (this.params ?? self.location.search).substring(1);

                    if(loadMore) params += `&skip=${this.docs.length}`;
                    else if(this.docs.length > 100) params += `&limit=${this.docs.length}`;

                    let res = await axios.get(`/api/v1/businesses/${this.business}/documents?${params}`);
                    if(loadMore) this.docs.push(...res.data.data);
                    else this.docs = res.data.data;
                    this.error = null;

                    // TODO history.pushState({}, "", `?${params}`);
                }
                else
                {
                    this.docs = [];

                    await loadTranslations({ "code": "home.alerts.select-business" });
                    this.error = this.$filters.translate("home.alerts.select-business");
                }
            }
            catch(x)
            {
                this.docs = [];
                this.error = x?.message || x;
            }
            finally
            {
                this.$forceUpdate();
            }
        },

        filterForDocType(docType)
        {
            self.location = `?type=${encodeURIComponent(docType)}`;
        },

        filterForTag(tag)
        {
            self.location = `?tags=${encodeURIComponent(tag)}`;
        },

        applyFilterFromBar(filter)
        {
            this.params = `?q=${encodeURIComponent(JSON.stringify(filter))}`;
            this.loadDocuments();
        },

        downloadDocument(doc)
        {
            self.location = `/api/v1/documents/${doc._id}/binary`;
        },

        showLedgerRecords(doc)
        {
            self.location = `/ledger/?business=${doc.business}&document_id=${doc._id}`;
        },

        async editDocument(doc)
        {
            try
            {
                let editor = await axios.get(`/api/v1/documents/${doc._id}/editor`);
                self.location = editor.request.res.responseUrl;
            }
            catch(x) { self.location = `/documents/editor/?${doc._id}`; }
        },

        async deleteDocument(doc)
        {
            if(confirm("Are you sure you would like to delete this document?"))
                try
                {
                    await axios.delete(`/api/v1/documents/${doc._id}`);
                    this.showNotification(`${doc.name} was successfully deleted.`, true);
                    this.loadDocuments();
                }
                catch(x)
                {
                    console.error(x);
                    this.error = x?.message;
                    this.$forceUpdate();
                }
        },

        uploadFile()
        {
            let docSelector = document.querySelector("#upload_file_selector");
            docSelector.onchange = async (event) => uploadFiles(event.target.files, doc =>
            {
                this.showNotification(`${doc.name} was successfully uploaded.`, true);
                this.loadDocuments();
            });
            docSelector.click();
        },

        handleDrop(event)
        {
            event.preventDefault();
            uploadFiles(event.dataTransfer.files, doc =>
            {
                this.showNotification(`${doc.name ?? "Unnamed document"} was successfully uploaded.`, true);
                this.loadDocuments();
            });
        },

        showNotification(message, good = true)
        {
            this.notifications.push({ message, good });
            this.$forceUpdate();

            setTimeout(_ => {
                this.notifications.pop();
                this.$forceUpdate();
            }, 5000);
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("#doc_list");

async function uploadFiles(files, callback)
{
    for(let file of files)
        try
        {
            let doc = await axios.post(`/api/v1/businesses/${await getSelectedBusinessId()}/documents`, {
                name: file.name,
                mime_type: file.type
            });

            let reader = new FileReader();
            reader.onload = async () =>
            {
                const headers = { "Content-Type": "application/octet-stream" };
                await axios.put(`/api/v1/documents/${doc.data._id}/binary`, new Uint8Array(reader.result), { headers });
                callback(doc.data);
            };
            reader.readAsArrayBuffer(file);
        }
        catch(x)
        {
            console.error(x);
            alert("Could not upload file");
        }
}