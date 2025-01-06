Vue.createApp(
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

        async toggleRead(notification, read)
        {
            if(typeof read === "undefined")
                read = !notification.read;

            // TODO

            notification.read = read;
            this.$forceUpdate();
        },

        async deleteNotification(id)
        {
            // TODO
        }
    },

    filters:
    {
        id2timestamp(id)
        {
            return new Date(parseInt(id.substring(0, 8), 16) * 1000).toLocaleString();
        }
    }
}).mount("#notification_center");