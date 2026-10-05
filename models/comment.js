const mongoose = require("../services/connector.js");
const registerAuditLog = require("../services/audit-log.js");

// entities that can be commented on, mapped to their mongoose model names
const commentableEntities = [ "Document" ];

// a chat-style comment on a record of another entity (e.g. a document); the comment text may mention users and apps
// with tokens like @[Jane Doe](user:<id>) or @[Some App](app:<id>), which are also kept in the mentions field
const Comment = mongoose.model("Comment", (function()
{
    const mentionSchema = new mongoose.Schema(
    {
        type: { type: String, enum: [ "user", "app" ], required: true },
        id: { type: mongoose.Schema.Types.ObjectId, required: true }
    }, { _id: false });

    const schemaDefinition = (
    {
        referenced_entity: { type: String, enum: commentableEntities, required: true },
        referenced_id: { type: mongoose.Schema.Types.ObjectId, required: true },
        comment: { type: String, required: true, maxlength: 10000 },
        author: { type: mongoose.Schema.Types.ObjectId, required: true }, // id of a user or an app, see author_type
        author_type: { type: String, enum: [ "user", "app" ], required: true },
        mentions: [ mentionSchema ]
    });

    const schema = new mongoose.Schema(schemaDefinition, { id: false, timestamps: { updatedAt: "last_updated_at" }, autoIndex: false });
    schema.index({ referenced_entity: 1, referenced_id: 1, _id: -1 });
    schema.path("author").index(true);
    registerAuditLog(schema, "Comment");
    return schema;
})());

// matches mention tokens in comment texts; groups: display name, type ("user" or "app"), id
Comment.mentionPattern = /@\[([^\]\n]*)\]\((user|app):([0-9a-f]{24})\)/g;

// returns the distinct mentions of a comment text as [ { type, id } ]
Comment.parseMentions = function(text)
{
    const mentions = new Map();
    for(let [ , , type, id ] of String(text ?? "").matchAll(Comment.mentionPattern))
        mentions.set(`${type}:${id}`, { type, id });
    return [ ...mentions.values() ];
};

module.exports = { Comment };
