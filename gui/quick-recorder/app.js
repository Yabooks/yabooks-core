new Vue(
{
    el: "main",

    data:
    {
        input: "",
        file: null,
        wildguess: {},
        input_status: {}
    },

    filters:
    {
        date(timestamp)
        {
            return new Date(timestamp).toLocaleDateString(getUserLanguage());
        }
    },

    methods:
    {
        async guess(event)
        {
            this.wildguess = await wildguess(this.input);

            this.input_status = (this.wildguess.date && this.wildguess.account_debit && this.wildguess.account_credit && this.wildguess.amount ?
                { green: true } : this.input ? { yellow: true } : {});

            if(event.code == "Enter" || event.code == "NumpadEnter")
                try
                {
                    if(!this.wildguess.date || !this.wildguess.account_debit || !this.wildguess.account_credit || !this.wildguess.amount)
                        return;

                    let doc = { ...this.wildguess };
                    doc.name = this.file?.name;
                    doc.mime_type = this.file?.type;

                    let business = await getSelectedBusinessId();
                    if(!business) return void alert("Select a business first!");
                    doc = await axios.post(`/api/v1/businesses/${business}/documents`, doc);
                    if(this.file) await axios.put(`/api/v1/documents/${doc.data._id}/binary`, this.file.bytes);

                    this.input_status = {};
                    this.wildguess = {};
                    this.file = null;
                    this.input = "";
                    this.$forceUpdate();
                }
                catch(x)
                {
                    alert("Error!");
                    console.error(x);
                }
        },

        acceptFile(event)
        {
            event.preventDefault();
        },

        fileDropped(event)
        {
            try
            {
                event.preventDefault();
                this.file = event.dataTransfer.items[0].getAsFile();

                let reader = new FileReader();
                reader.onload = (e) => this.file.bytes = e.target.result;
                reader.readAsArrayBuffer(this.file);
            }
            catch(x)
            {
                alert("Error!");
                console.error(x);
            }
        }
    }
});
