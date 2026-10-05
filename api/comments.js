const { Comment } = require("../models/comment.js"), { Document } = require("../models/document.js"), { App } = require("../models/app.js");
const { User, Session } = require("../models/user.js"), { FieldTranslation } = require("../models/translation.js");
const { subjectOfUser, subjectOfApp, scopeOf } = require("../services/casbin.js"), { notify } = require("../services/notifications.js");
const { Logger } = require("../services/logger.js"), { ObjectId } = require("../services/connector.js").Types;

const PAGE_SIZE = 30;

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the user (of the session) or otherwise the app writing a comment
const authorOf = async (req) =>
{
    if(req.auth?.session_id)
    {
        const session = await Session.findOne({ _id: req.auth.session_id }, "user").lean();
        if(session?.user)
            return { type: "user", id: session.user };
    }

    if(req.auth?.app_id)
        return { type: "app", id: new ObjectId(req.auth.app_id) };

    return null;
};

// whether a user or app (not the requesting one) may read the documents of a business; only those can be mentioned,
// as they could not follow the notification's link otherwise
const mayReadDocuments = async (req, mention, business) =>
{
    const subject = mention.type === "user" ? subjectOfUser(mention.id) : subjectOfApp(mention.id);
    return await req.permissions.enforce(subject, scopeOf(business), "documents", "read");
};

// display names of users (their individual's full name, or email address) and apps by "<type>:<id>"
const namesOf = async (references) =>
{
    const ids = (type) => [ ...new Set(references.filter(ref => ref.type === type).map(ref => String(ref.id))) ];
    const names = new Map();

    const users = await User.aggregate([
        { $match: { _id: { $in: ids("user").map(id => new ObjectId(id)) } } },
        { $lookup: { from: "identities", localField: "individual", foreignField: "_id", as: "individual_identity" } },
        { $project: { email: 1, full_name: { $arrayElemAt: [ "$individual_identity.full_name", 0 ] } } }
    ]);
    for(let user of users)
        names.set(`user:${user._id}`, { name: user.full_name || user.email, email: user.email });

    for(let app of await App.find({ _id: { $in: ids("app") } }, "name icon").lean())
        names.set(`app:${app._id}`, { name: app.name, icon: app.icon });

    return names;
};

// adds the author's display name (and app icon) to comments
const describeAuthors = async (comments) =>
{
    const names = await namesOf(comments.map(comment => ({ type: comment.author_type, id: comment.author })));
    return comments.map(comment => ({ ...comment, author_name: names.get(`${comment.author_type}:${comment.author}`)?.name ?? null,
        ...(comment.author_type === "app" ? { author_icon: names.get(`app:${comment.author}`)?.icon ?? null } : {}) }));
};

// translation of the notification title in a language, with "en" as fallback
const translate = async (code, language, fallback) =>
{
    const translations = await FieldTranslation.find({ code, language: { $in: [ language, "en" ] } }, "language text").lean();
    return (translations.find(t => t.language === language) ?? translations.find(t => t.language === "en"))?.text ?? fallback;
};

// notifies mentioned users with a user notification, and mentioned apps with an app notification and their
// "comment.mentioned" webhook
const notifyMentioned = async (req, comment, doc, author) =>
{
    const names = await namesOf([ author, ...comment.mentions ]);
    const authorName = names.get(`${author.type}:${author.id}`)?.name ?? "?";
    const text = comment.comment.replace(Comment.mentionPattern, (_, name) => `@${name}`);
    const link = `/documents/editor/?${doc._id}#comments`;

    const mentionedUsers = await User.find({ _id: { $in: comment.mentions.filter(m => m.type === "user").map(m => m.id) }, active: { $ne: false } },
        "preferred_language").lean();

    for(let user of mentionedUsers)
        try
        {
            const title = (await translate("comments.notification.mentioned", user.preferred_language, "{name} mentioned you in a comment"))
                .split("{name}").join(authorName);

            await notify({ user: user._id, type: "user_notification", title, text: text.length > 280 ? text.substring(0, 279) + "…" : text,
                icon: "💬", link, business: doc.business, tags: [ "comment" ] });
        }
        catch(x) { Logger.log("error", "could not notify mentioned user", String(user._id), x?.message || x); }

    const mentionedApps = comment.mentions.filter(m => m.type === "app").map(m => String(m.id));
    if(!mentionedApps.length)
        return;

    const payload = { comment_id: comment._id, referenced_entity: comment.referenced_entity, referenced_id: comment.referenced_id,
        document_id: doc._id, author: comment.author, author_type: comment.author_type, comment: comment.comment };

    const webhooks = (await App.findWebhooks("comment.mentioned")).filter(webhook => mentionedApps.includes(String(webhook.app_id)));

    for(let app_id of mentionedApps)
        try
        {
            await notify({ app: app_id, type: "app_notification", title: `${authorName} mentioned the app in a comment`, text, link,
                business: doc.business, tags: [ "comment" ] });
        }
        catch(x) { Logger.log("error", "could not notify mentioned app", app_id, x?.message || x); }

    await Promise.all(webhooks.map(async webhook =>
    {
        try
        {
            const response = await App.sendWebhook(webhook, { event: "comment.mentioned", payload });
            if(!response.ok)
                Logger.log("error", `webhook ${webhook.event} of app ${webhook.app_id} responded with http status ${response.status}`);
        }
        catch(x) { Logger.log("error", `webhook ${webhook.event} of app ${webhook.app_id} could not be called`, x?.message || x); }
    }));
};

module.exports = function(api)
{
    /**
     * @openapi
     * /api/v1/documents/{id}/comments:
     *   get:
     *     summary: List comments on a document
     *     description: >-
     *       Returns the comments on a document page by page, starting with the newest ones. Within a page, comments are
     *       ordered chronologically (oldest first), as in a chat. To load older comments, pass the _id of the oldest
     *       comment loaded so far as `before`.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the document
     *       - in: query
     *         name: before
     *         schema:
     *           type: string
     *         description: Only return comments older than the comment with this ID
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           default: 30
     *         description: Maximum number of comments to return (at most 100)
     *     responses:
     *       200:
     *         description: >-
     *           Comments, with the display name of their authors
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   type: array
     *                   items:
     *                     allOf:
     *                       - $ref: '#/components/schemas/Comment'
     *                       - properties:
     *                           author_name: { type: string }
     *                           author_icon: { type: string, description: icon of an app author }
     *                 has_more:
     *                   type: boolean
     *                   description: whether there are older comments
     */
    api.get("/api/v1/documents/:id/comments", async (req, res, next) =>
    {
        try
        {
            await req.permissions.requirePermission(req, "read", "documents", await req.permissions.businessOf(Document, req.params.id), res);

            const limit = Math.min(Math.max(parseInt(req.query.limit) || PAGE_SIZE, 1), 100);
            const filter = { referenced_entity: "Document", referenced_id: req.params.id };

            if(req.query.before)
            {
                if(!req.ObjectId.isValid(req.query.before))
                    return res.status(400).send({ error: "invalid before" });
                filter._id = { $lt: new req.ObjectId(req.query.before) };
            }

            const comments = await Comment.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
            const has_more = comments.length > limit;

            res.send({ data: await describeAuthors(comments.slice(0, limit).reverse()), has_more });
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/comments:
     *   post:
     *     summary: Comment on a document
     *     description: >-
     *       Adds a comment written by the user of the session (or the app, if there is no session) to a document.
     *       Requires permission to read the document. Users and apps can be mentioned with tokens like
     *       `@[Jane Doe](user:<user id>)` or `@[Some App](app:<app id>)`. Mentioned users receive a user notification
     *       and mentioned apps an app notification and a call of their `comment.mentioned` webhook. Only users and apps
     *       that may read the document can be mentioned.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the document
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - comment
     *             properties:
     *               comment:
     *                 type: string
     *                 description: Comment text, possibly including mentions
     *     responses:
     *       200:
     *         description: >-
     *           The created comment
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Comment'
     *       400:
     *         description: >-
     *           The comment is empty, or a mentioned user or app does not exist or may not read the document
     *       404:
     *         description: >-
     *           Document not found
     */
    api.post("/api/v1/documents/:id/comments", async (req, res, next) =>
    {
        try
        {
            const business = await req.permissions.businessOf(Document, req.params.id);
            await req.permissions.requirePermission(req, "read", "documents", business, res);

            const doc = req.ObjectId.isValid(req.params.id) ? await Document.findOne({ _id: req.params.id }, "business owned_by").lean() : null;
            if(!doc)
                return res.status(404).send({ error: "not found" });

            const text = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
            if(!text)
                return res.status(400).send({ error: "comment must not be empty" });

            const author = await authorOf(req);
            if(!author)
                return res.status(400).send({ error: "comments need to be written by a user or an app" });

            // authors do not need to be notified about mentioning themselves
            const mentions = Comment.parseMentions(text).filter(m => !(m.type === author.type && m.id === String(author.id)));

            const exists = (m) => m.type === "user" ? User.exists({ _id: m.id, active: { $ne: false } }) : App.exists({ _id: m.id });
            for(let mention of mentions)
                if(!await exists(mention) || !await mayReadDocuments(req, mention, business))
                    return res.status(400).send({ error: `mentioned ${mention.type} ${mention.id} does not exist or may not read the document` });

            const comment = new Comment({ referenced_entity: "Document", referenced_id: doc._id, comment: text,
                author: author.id, author_type: author.type, mentions });
            await comment.save();

            res.send((await describeAuthors([ comment.toObject() ]))[0]);

            notifyMentioned(req, comment, doc, author).catch(x => Logger.log("error", "could not notify mentioned users and apps", x?.message || x));
            App.callWebhooks("comment.created", { comment_id: comment._id, document_id: doc._id }, doc.owned_by);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/documents/{id}/comments/mentionable:
     *   get:
     *     summary: Search users and apps that can be mentioned in comments on a document
     *     description: >-
     *       Returns active users and apps that may read the document, matching the query by name or email address;
     *       the requesting user or app is left out. Meant to suggest mentions while typing a comment.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the document
     *       - in: query
     *         name: q
     *         schema:
     *           type: string
     *         description: Text the name or email address has to contain
     *     responses:
     *       200:
     *         description: >-
     *           Users and apps, at most ten
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 type: object
     *                 properties:
     *                   type: { type: string, enum: [ user, app ] }
     *                   _id: { type: string }
     *                   name: { type: string }
     *                   email: { type: string }
     *                   icon: { type: string }
     */
    api.get("/api/v1/documents/:id/comments/mentionable", async (req, res, next) =>
    {
        try
        {
            const business = await req.permissions.businessOf(Document, req.params.id);
            await req.permissions.requirePermission(req, "read", "documents", business, res);

            const regex = { $regex: escapeRegex(String(req.query.q ?? "").trim()), $options: "i" };
            const self = await authorOf(req);
            const isSelf = (type, id) => self?.type === type && String(self.id) === String(id);

            const [ users, apps ] = await Promise.all([
                User.aggregate([
                    { $match: { active: { $ne: false } } },
                    { $lookup: { from: "identities", localField: "individual", foreignField: "_id", as: "individual_identity" } },
                    { $project: { email: 1, full_name: { $arrayElemAt: [ "$individual_identity.full_name", 0 ] } } },
                    { $match: { $or: [ { email: regex }, { full_name: regex } ] } },
                    { $sort: { full_name: 1, email: 1 } },
                    { $limit: 50 }
                ]),
                App.find({ name: regex }, "name icon").sort({ name: 1 }).limit(20).lean()
            ]);

            const candidates = [
                ...users.map(user => ({ type: "user", _id: user._id, name: user.full_name || user.email, email: user.email })),
                ...apps.map(app => ({ type: "app", _id: app._id, name: app.name, icon: app.icon }))
            ];

            const result = [];
            for(let candidate of candidates)
                if(result.length < 10 && !isSelf(candidate.type, candidate._id) && await mayReadDocuments(req, { type: candidate.type, id: candidate._id }, business))
                    result.push(candidate);

            res.send(result);
        }
        catch(x) { next(x) }
    });

    /**
     * @openapi
     * /api/v1/comments/{id}:
     *   delete:
     *     summary: Delete a comment
     *     description: >-
     *       Permanently deletes a comment. Only the author (user or app) of a comment may delete it.
     *     tags:
     *       - documents
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: ID of the comment
     *     responses:
     *       200:
     *         description: >-
     *           Comment deleted
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *       403:
     *         description: >-
     *           The comment was written by someone else
     *       404:
     *         description: >-
     *           Comment not found
     */
    api.delete("/api/v1/comments/:id", async (req, res, next) =>
    {
        try
        {
            const comment = req.ObjectId.isValid(req.params.id) ? await Comment.findOne({ _id: req.params.id }, "author author_type").lean() : null;
            if(!comment)
                return res.status(404).send({ error: "not found" });

            const author = await authorOf(req);
            if(author?.type !== comment.author_type || String(author.id) !== String(comment.author))
                return res.status(403).send({ error: "permission denied", details: "only the author may delete a comment" });

            await Comment.deleteOne({ _id: req.params.id });
            res.send({ success: true });
        }
        catch(x) { next(x) }
    });
};
