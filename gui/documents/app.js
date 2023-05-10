new Vue(
{
    el: "#doc_list",

    data:
    {
        docs: [],
        error: null
    },

    async created()
    {
        try
        {
            let business = await getSelectedBusinessId();

            res = await axios.get(`/api/v1/businesses/${business}/documents`);
            this.docs = res.data.data;
            this.error = null;
        }
        catch(x)
        {
            this.docs = [];
            this.error = "Please select a business first.";
        }
    },

    methods:
    {
        showLedgerRecords(doc)
        {
            self.location = `/ledger/?business=${doc.business}&document_id=${doc._id}`;
        }
    }
});
