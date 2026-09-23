/* global getSelectedBusinessId, filters, FilterBar, loadTranslations */

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
            hasMore: false, // becomes true once the initial load determines more documents are available
            loadingMore: false,
            latestRequest: 0,
            translationsLoaded: false,
            businessPartners: {}, // identity ID -> identity (or null while loading / if not resolvable)

            params: self.location.search,
            searchOptions: {
                keys: [
                    "type",
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
                    "text", // type
                    "text", // name
                    "text", // mime_type
                    "text", // uri
                    "text", // search_text
                    "text", // tags
                    "checkbox", // posted
                    "datetime-local", // date
                    "text", // internal_reference
                    "text" // external_reference
                ]
            }
        };
    },

    computed:
    {
        filterBarLabels()
        {
            if(!this.translationsLoaded) // filter bar falls back to its own labels
                return null;

            return this.searchOptions.keys.map(key => this.$filters.translate(`documents.list.field.${key}`, null, key));
        },

        filterBarTexts()
        {
            if(!this.translationsLoaded) // filter bar falls back to its English default texts
                return {};

            const t = (code) => this.$filters.translate(`filter-bar.${code}`);

            return {
                and: t("and"),
                or: t("or"),
                combineWithAnd: t("combine-with-and"),
                combineWithOr: t("combine-with-or"),
                field: t("field"),
                operator: t("operator"),
                value: t("value"),
                yes: t("yes"),
                no: t("no"),
                addCondition: t("add-condition"),
                addConditionTitle: t("add-condition-title"),
                addGroup: t("add-group"),
                addGroupTitle: t("add-group-title"),
                removeCondition: t("remove-condition"),
                removeGroup: t("remove-group"),
                filter: t("filter"),
                clear: t("clear"),
                clearTitle: t("clear-title"),
                search: t("search"),
                searchTitle: t("search-title"),
                operatorLabels: { $regex: t("operator.regex") },
                operatorTitles: {
                    $eq: t("operator.eq"),
                    $ne: t("operator.ne"),
                    $lt: t("operator.lt"),
                    $lte: t("operator.lte"),
                    $gt: t("operator.gt"),
                    $gte: t("operator.gte"),
                    $regex: t("operator.regex-title")
                }
            };
        },

        /** the current search expressed as Mongo query so that the filter bar can show it */
        filterBarQuery()
        {
            let params = new URLSearchParams(this.params);
            if(params.has("q"))
                try { return JSON.parse(params.get("q")); }
                catch(x) { return null; }

            let query = {}; // simple filters like ?tags=invoice
            for(let [ key, value ] of params)
                if(this.searchOptions.keys.includes(key))
                    query[key] = value;
            return query;
        }
    },

    async created()
    {
        try
        {
            await Promise.all([
                loadTranslations({ "code*": "documents.list." }),
                loadTranslations({ "code*": "filter-bar." })
            ]);
            this.translationsLoaded = true;
            this.$forceUpdate();
        }
        catch(x) { console.error("could not load translations", x); }
    },

    mounted()
    {
        // remember params of the initial entry for when history.back() returns to it
        history.replaceState({ params: this.params }, "", self.location.href);
        this.loadDocuments();

        new IntersectionObserver((entries) =>
        {
            if(entries[0].isIntersecting)
                this.loadMoreDocuments();
        }, { rootMargin: "200px" }).observe(document.querySelector("#scroll_sentinel"));

        addEventListener("popstate", (event) => // on history.back() and history.forward()
        {
            this.params = event.state?.params ?? self.location.search;
            this.hasMore = false;
            this.loadDocuments(false, true);
            this.notifyParentFrameOfUrl();
        });
    },

    methods:
    {
        async loadDocuments(loadMore = false, newSearch = false)
        {
            const request = ++this.latestRequest;

            try
            {
                this.business = await getSelectedBusinessId();
                if(this.business)
                {
                    let params = new URLSearchParams(this.params);

                    if(loadMore) params.set("skip", this.docs.length);
                    else if(!newSearch && this.docs.length > 100) params.set("limit", this.docs.length);

                    let res = await axios.get(`/api/v1/businesses/${this.business}/documents?${params}`);
                    if(request !== this.latestRequest)
                        return; // another search was started in the meantime

                    if(loadMore) this.docs.push(...res.data.data);
                    else this.docs = res.data.data;
                    this.hasMore = this.docs.length < res.data.total;
                    this.error = null;

                    this.loadBusinessPartners(res.data.data);
                }
                else
                {
                    this.docs = [];
                    this.hasMore = false;

                    await loadTranslations({ "code": "home.alerts.select-business" });
                    this.error = this.$filters.translate("home.alerts.select-business");
                }
            }
            catch(x)
            {
                if(request !== this.latestRequest)
                    return;

                this.docs = [];
                this.hasMore = false;
                this.error = x?.message || x;
            }
            finally
            {
                this.$forceUpdate();
            }
        },

        /** resolves the names of the business partners referenced by the given documents with a single request */
        async loadBusinessPartners(docs)
        {
            let ids = [ ...new Set(docs.map(doc => doc.business_partner).filter(Boolean)) ]
                .filter(id => !(id in this.businessPartners));

            if(ids.length === 0)
                return;

            ids.forEach(id => this.businessPartners[id] = null); // prevent loading the same partner twice

            try
            {
                let q = JSON.stringify({ _id: { $in: ids.map(id => ({ $oid: id })) } });
                let res = await axios.get(`/api/v1/identities?limit=${ids.length}&q=${encodeURIComponent(q)}`);
                for(let identity of res.data.data)
                    this.businessPartners[identity._id] = identity;
            }
            catch(x)
            {
                console.error("could not load business partners", x);
                ids.forEach(id => delete this.businessPartners[id]); // retry with the next load
            }
        },

        async loadMoreDocuments()
        {
            if(this.loadingMore || !this.hasMore)
                return;

            this.loadingMore = true;
            try { await this.loadDocuments(true); }
            finally { this.loadingMore = false; }
        },

        /** starts a new search and adds it to the browsing history, so that history.back() restores the previous search */
        search(params)
        {
            params = params ? `?${params}` : "";
            if(params !== this.params)
            {
                history.pushState({ params }, "", params || self.location.pathname);
                this.params = params;
                this.notifyParentFrameOfUrl();
            }
            this.hasMore = false; // prevent infinite scrolling from appending to the previous search's results
            this.loadDocuments(false, true);
        },

        notifyParentFrameOfUrl()
        {
            // tell parent frame that the current state uses another URL, so that reloading the page keeps the search
            if(parent !== self)
                parent.postMessage({ main_url: self.location.href }, self.location.origin);
        },

        filterForDocType(docType)
        {
            this.search(new URLSearchParams({ type: docType }));
        },

        filterForBusinessPartner(id)
        {
            this.search(new URLSearchParams({ business_partner: id }));
        },

        filterForTag(tag)
        {
            this.search(new URLSearchParams({ tags: tag }));
        },

        applyFilterFromBar(filter)
        {
            this.search(Object.keys(filter).length > 0 ? new URLSearchParams({ q: JSON.stringify(filter) }) : "");
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
                self.location = editor.data.url;
            }
            catch(x) { self.location = `/documents/editor/?${doc._id}`; }
        },

        async deleteDocument(doc)
        {
            if(confirm(this.$filters.translate("documents.list.confirm-delete")))
                try
                {
                    await axios.delete(`/api/v1/documents/${doc._id}`);
                    this.showNotification(this.$filters.translate("documents.list.deleted").split(">NAME<").join(doc.name), true);
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
                this.showUploadedNotification(doc);
                this.loadDocuments();
            });
            docSelector.click();
        },

        handleDrop(event)
        {
            event.preventDefault();
            uploadFiles(event.dataTransfer.files, doc =>
            {
                this.showUploadedNotification(doc);
                this.loadDocuments();
            });
        },

        showUploadedNotification(doc)
        {
            let name = doc.name ?? this.$filters.translate("documents.list.unnamed");
            this.showNotification(this.$filters.translate("documents.list.uploaded").split(">NAME<").join(name), true);
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
                const headers = { "Content-Type": file.type ?? "application/octet-stream" };
                await axios.put(`/api/v1/documents/${doc.data._id}/binary`, new Uint8Array(reader.result), { headers });
                callback(doc.data);
            };
            reader.readAsArrayBuffer(file);
        }
        catch(x)
        {
            console.error(x);
            alert(filters.translate("documents.list.upload-failed"));
        }
}
