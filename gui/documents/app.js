new Vue(
{
    el: "#doc_list",

    data:
    {
        docs: [],
        error: null,
        notifications: []
    },

    created()
    {
        this.loadDocuments();
    },

    methods:
    {
        async loadDocuments(loadMore = false)
        {
            try
            {
                let business = await getSelectedBusinessId();
                if(business)
                {
                    let params = self.location.search.substring(1);
                    if(loadMore) params += `&skip=${this.docs.length}`;
                    else if(this.docs.length > 100) params += `&limit=${this.docs.length}`;

                    res = await axios.get(`/api/v1/businesses/${business}/documents?${params}`);
                    if(loadMore) this.docs.push(...res.data.data);
                    else this.docs = res.data.data;
                    this.error = null;
                    this.$forceUpdate();
                }
                else
                {
                    this.docs = [];
                    this.error = "Please select a business first.";
                }
            }
            catch(x)
            {
                this.docs = [];
                this.error = x?.message || x;
            }
        },

        filterForDocType(docType)
        {
            self.location = `?type=${encodeURIComponent(docType)}`;
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
                this.showNotification(`${doc.name} was successfully uploaded.`, true);
                this.loadDocuments();
            });
        },

        showNotification(message, good = true)
        {
            this.notifications.push({ message, good });
            this.$forceUpdate();

            setTimeout(_ =>
            {
                for(let i in this.notifications)
                    if(this.notifications[i].message === message)
                        this.notifications.pop();
                this.$forceUpdate();
            }, 5000);
        }
    }
});

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
