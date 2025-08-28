/* global loadSession, sleep */

Vue.createApp(
{
    components: { Page },

    data()
    {
        return {
            _id: null,
            file_name: "",
            annotations_supported: false,
            annotations: [],
            pages: 0,
            zoom: 0.5,
            isSecondScreen: false,
            isPreparingSecondScreen: false,
            tool: { color: [ 255, 255, 0 ], opacity: .5, lineWidth: 10 }
        };
    },

    mounted()
    {
        const reqParams = new URLSearchParams(self.location.search);

        if(reqParams.get("second_screen"))
        {
            this.isSecondScreen = true;
            document.cookie = `user_token=${reqParams.get("auth")}; path=/`;

            document.title = "YaBooks Second Screen";
            document.body.style.background = "#f2f2f2";

            // TODO connect websocket and consume incoming app notifications
        }

        if(reqParams.get("doc_id"))
            this.loadDocument(reqParams.get("doc_id"));
    },

    methods:
    {
        async loadDocument(doc_id)
        {
            let doc = await axios.get(`/api/v1/documents/${doc_id}/preview`);

            this._id = doc_id;
            this.file_name = doc.data.name ?? doc.data.mime_type ?? "no preview available";
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

        thumbnailSrc()
        {
            return `/api/v1/documents/${this._id}/thumbnail`;
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

        async useSecondScreen()
        {
            try
            {
                this.isPreparingSecondScreen = true;
                this.$forceUpdate();

                const session = await loadSession();

                // send app notification to second screen about which document should be opened in editor
                let notification = await axios.post("/api/v1/notifications?optical_code=true", {
                    link: `${self.location.href}&second_screen=true&auth=${encodeURIComponent(session.user_token)}`, // TODO security
                    title: "open second screen",
                    type: "app_notification",
                    user: session.user
                });

                const optical_code = notification.data.optical_code;

                // wait for three seconds
                await sleep(3000);

                // check if notification was consumed by an active second screen
                notification = await axios.get(`/api/v1/notifications/${notification.data._id}`);
                if(!notification.data.read)
                    parent.parent.document.app.openModal(optical_code);
            }
            catch(x)
            {
                console.error(x);
            }
            finally
            {
                this.isPreparingSecondScreen = false;
                this.$forceUpdate();
            }
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