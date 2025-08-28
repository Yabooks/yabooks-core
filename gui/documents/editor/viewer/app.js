Vue.createApp(
{
    components: { Page },

    mounted()
    {
        const reqParams = new URLSearchParams(self.location.search);

        if(reqParams.get("doc_id"))
            this.loadDocument(reqParams.get("doc_id"));

        if(reqParams.get("transparent"))
            ; // TODO

        if(reqParams.get("websocket"))
            ; // TODO
    },

    data()
    {
        return {
            _id: null,
            annotations_supported: false,
            annotations: [],
            pages: 0,
            zoom: 0.5,
            tool: { color: [ 255, 255, 0 ], opacity: .5, lineWidth: 10 }
        };
    },

    methods:
    {
        async loadDocument(doc_id)
        {
            let doc = await axios.get(`/api/v1/documents/${doc_id}/preview`);
            this._id = doc_id;
            this.annotations_supported = doc.data.annotations_supported;
            this.annotations = doc.data.annotations ?? [];
            this.pages = doc.data.pages;

            // assure there is an annotations array available for every page
            if(this.annotations_supported && this.pages > this.annotations.length)
                for(let i = this.annotations.length - 1; i < this.pages; ++i)
                    this.annotations[i] = [];

            this.$forceUpdate();
        },

        downloadDocument()
        {
            self.location = `/api/v1/documents/${this._id}/binary`;
        },

        pagePreviewSrc(page)
        {
            return `/api/v1/documents/${this._id}/preview/pages/${page}?annotations=false`;
        },

        adaptZoomLevel(change)
        {
            this.zoom = Math.min(Math.max(this.zoom + change, 0.2), 1.5);
        },

        chooseTool(tool)
        {
            if(tool == "pencil")
                this.tool = { color: [ 100, 100, 100 ], opacity: 1, lineWidth: 1 };

            if(tool == "pen")
                this.tool = { color: [ 0, 0, 255 ], opacity: 1, lineWidth: 2 };
            
            if(tool == "fountain-pen")
                this.tool = { color: [ 0, 0, 100 ], opacity: 1, lineWidth: 4 };
            
            if(tool == "paintbrush")
                this.tool = { color: [ 255, 0, 0 ], opacity: .8, lineWidth: 8 };
            
            if(tool == "crayon")
                this.tool = { color: [ 255, 255, 0 ], opacity: .4, lineWidth: 16 };
            
            if(tool == "eraser")
                this.tool = null; // TODO
        },

        useSecondScreen()
        {
            // TODO
        },

        async saveAnnotations()
        {
            try
            {
                await axios.put(`/api/v1/documents/${this._id}/annotations`, this.annotations);
            }
            catch(x)
            {
                console.error(x);
                
                this.annotations_supported = false;
                this.$forceUpdate();
            }
        }
    }
}).mount("main");