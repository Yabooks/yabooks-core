/* global filters */

let app = Vue.createApp(
{
    data()
    {
        return {
            notifications: []
        };
    },

    mounted()
    {
        this.loadNotifications();
    },

    methods:
    {
        async loadNotifications()
        {
            await loadTranslations({ "code*": "home.notifications." });

            let res = await axios.get(`/api/v1/notifications?type=user_notification`);
            this.notifications = res.data.data;
            this.error = null;
            this.$forceUpdate();
        },

        isTask(notification)
        {
            return notification.type === "user_task";
        },

        isLocalLink(url)
        {
            url = new URL(url);
            return url.host === self.location.host && url.protocol === self.location.protocol;
        },

        async toggleRead(notification, read = undefined)
        {
            // determine opposite state
            if(typeof read === "undefined")
                read = !notification.read;

            // set notification's read state in user interface
            notification.read = read;
            this.$forceUpdate();

            try
            {
                // send new read state to backend
                await axios.put(`/api/v1/notifications/${notification._id}/${read ? "read" : "unread"}`);

                // update notification counter in main frame
                this.updateNotificationCounterBadge(read ? -1 : +1);
            }
            catch(x)
            {
                console.error(x);
                alert(x?.message ?? x);
            }
        },

        async deleteNotification(notification)
        {
            // ask if user is sure
            if(!confirm(this.$filters.translate("home.notifications.confirm-delete")))
                return;

            // hide notification in user interface
            notification.deleted = true;
            this.$forceUpdate();

            try
            {
                // delete notification from database
                await axios.delete(`/api/v1/notifications/${notification._id}`);

                // update notification counter in main frame
                if(!notification.read)
                    this.updateNotificationCounterBadge(-1);
            }
            catch(x)
            {
                console.error(x);
                alert(x?.message ?? x);
            }
        },

        updateNotificationCounterBadge(increment)
        {
            if(!Number.isInteger(increment))
                return;

            try
            {
                parent.document.app.notifications += increment;
                parent.document.app.$forceUpdate();
            }
            catch(x) {}
        },

        hideNotificationsModal()
        {
            setTimeout(_ => parent.document.app.openModal(false), 0);
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("#notification_center");