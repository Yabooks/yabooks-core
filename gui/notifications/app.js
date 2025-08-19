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
            let res = await axios.get(`/api/v1/notifications?type=user_notification`);
            this.notifications = res.data.data;
            this.error = null;
            this.$forceUpdate();
        },

        isTask(notification)
        {
            return notification.type === "user_task";
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
            }
            catch(x)
            {
                console.error(x);
                alert(x?.message ?? x);
            }
        },

        async deleteNotification(notification)
        {
            // hide notification in user interface
            notification.deleted = true;
            this.$forceUpdate();

            try
            {
                // delete notification from database
                await axios.delete(`/api/v1/notifications/${notification._id}`);
            }
            catch(x)
            {
                console.error(x);
                alert(x?.message ?? x);
            }
        }
    }
});

app.config.globalProperties.$filters = { ...filters };
app.mount("#notification_center");