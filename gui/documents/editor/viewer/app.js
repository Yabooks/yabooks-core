/* global loadSession, loadTranslations, sleep, filters, Page */

const app = Vue.createApp(
{
    components: { Page },

    data()
    {
        return {
            _id: null,
            file_name: "",
            mime_type: "",
            has_binary: false,
            annotations_supported: false,
            annotations: [],
            pages: null,
            zoom: 0.5,
            isZoomedByUser: false,
            scale: 2.0,
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
            document.cookie = `user_token=${reqParams.get("auth")}; path=/api/v1/documents`;

            document.title = "YaBooks Second Screen";
            document.body.style.background = "#f2f2f2";

            // TODO connect websocket and consume incoming app notifications on tablets
        }

        loadTranslations({ "code*": "documents.editor." }).then(() => this.$forceUpdate());

        if(reqParams.get("doc_id"))
            this.loadDocument(reqParams.get("doc_id"));
    },

    methods:
    {
        async loadDocument(doc_id)
        {
            let doc = await axios.get(`/api/v1/documents/${doc_id}/preview`);

            this._id = doc_id;
            this.file_name = doc.data.name ?? doc.data.mime_type ?? "";
            this.mime_type = doc.data.mime_type ?? "";
            this.has_binary = doc.data.has_binary !== false;
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
            if(this.has_binary)
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
                this.tool = { lineWidth: 1, type: "eraser" };
        },

        adaptZoomLevel(change)
        {
            const el = document.scrollingElement;

            // x offset measured from the left edge (scrollLeft is 0 at the right edge and negative towards the left in rtl)
            const left = () => el.scrollWidth - el.clientWidth + el.scrollLeft;

            // remember which point of the document is in the center of the viewport
            const fx = (left() + el.clientWidth / 2) / el.scrollWidth;
            const fy = (el.scrollTop + el.clientHeight / 2) / el.scrollHeight;

            this.isZoomedByUser = true;
            this.zoom *= (1 + change);

            // keep that point centered after zooming
            this.$nextTick(() =>
            {
                el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2 - (el.scrollWidth - el.clientWidth);
                el.scrollTop = fy * el.scrollHeight - el.clientHeight / 2;
            });
        },

        // zoom out automatically so that large pages fit into the viewport (never zooms in beyond the default)
        fitZoom({ width, height })
        {
            if(this.isZoomedByUser || !width || !height)
                return;

            // measure the viewport, not #preview, as #preview grows with pages wider than the screen
            const availableWidth = document.scrollingElement.clientWidth - 40 - 40; // main padding, breathing room
            const availableHeight = self.innerHeight - 20 - 40 - 70; // #preview margin, .page margins, toolbar

            let fit = availableWidth / width;

            // single images should be fully visible, so fit their height too
            if(this.mime_type.indexOf("image/") === 0)
                fit = Math.min(fit, availableHeight / height);

            if(fit > 0 && fit < this.zoom)
                this.zoom = fit;
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
});

app.config.globalProperties.$filters = { ...filters };
app.mount("main");
