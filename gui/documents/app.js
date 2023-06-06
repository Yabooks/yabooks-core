new Vue(
{
    el: "#doc_list",

    data:
    {
        docs: [],
        error: null
    },

    created()
    {
        this.loadDocuments();
    },

    methods:
    {
        async loadDocuments()
        {
            try
            {
                let business = await getSelectedBusinessId();

                res = await axios.get(`/api/v1/businesses/${business}/documents${self.location.search}`);
                this.docs = res.data.data;
                this.error = null;
                this.$forceUpdate();
            }
            catch(x)
            {
                this.docs = [];
                this.error = "Please select a business first.";
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
                    this.loadDocuments();
                }
                catch(x) {}
        },

        uploadFile()
        {
            let docSelector = document.querySelector("#upload_file_selector");
            docSelector.click();

            docSelector.onchange = async (event) =>
            {
                for(let file of event.target.files)
                    try
                    {
                        let doc = await axios.post(`/api/v1/businesses/${await getSelectedBusinessId()}/documents`, {
                            name: file.name,
                            mime_type: file.type
                        });

                        await axios.put(`/api/v1/documents/${doc.data._id}/binary`, file);
                        this.loadDocuments();
                    }
                    catch(x)
                    {
                        console.error(x);
                    }
            };
        }
    }
});
