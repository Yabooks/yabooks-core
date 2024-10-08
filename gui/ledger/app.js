new Vue(
{
    el: "#table",

    data:
    {
        records: [],
        error: null,
        session: null
    },

    async created()
    {
        try
        {
            let business = await getSelectedBusinessId();
            res = await axios.get(`/api/v1/businesses/${business}/general-ledger${self.location.search}`);
            this.records = res.data.data;
        }
        catch(x)
        {
            this.docs = [];
            this.error = "Please select a business first.";
        }
    },

    methods:
    {
        async goToAccount(id)
        {
            self.location = `/ledger/?business=${await getSelectedBusinessId()}&account._id=${id}`;
        },

        async goToDocument(id)
        {
            self.location = `/ledger/?business=${await getSelectedBusinessId()}&document_id=${id}`;
        }
    }
});
