// open notification websocket connections per user id, to deliver notifications in real time
const listeners = {};

/** registers a websocket connection of a user to receive the user's notifications from now on */
module.exports.addListener = function(user_id, ws)
{
    (listeners[user_id] ??= []).push(ws);
    ws.on("close", () => listeners[user_id] = listeners[user_id]?.filter(listener => listener !== ws));
};

/** pushes a stored notification to all open websocket connections of its user */
module.exports.push = function(notification)
{
    for(let ws of listeners[notification.user] ?? [])
        if(ws.readyState == 1) // connected and open
            ws.send(JSON.stringify(notification));
};

/** stores a notification and pushes it to its user in real time */
module.exports.notify = async function(data)
{
    const { Notification } = require("../models/notification.js");

    const notification = new Notification(data);
    await notification.save();

    if(notification.user)
        module.exports.push(notification);

    return notification;
};
