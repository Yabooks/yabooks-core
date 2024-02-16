let session = {};

const loadSession = async () =>
{
    // always load from server, context could have been changed
    let res = await axios.get("/api/v1/session");
    return session = res.data;
};

const getSelectedBusinessId = async () =>
{
    await loadSession();
    return session.data?.business;
};

/*const getSelectedBusinessCurrency = async () =>
{
    let res = await axios.get(`/api/v1/businesses/${await getSelectedBusinessId()}`);
    return res.data.default_currency;
};*/

const getUserLanguage = () =>
{
    return session.data?.language || navigator.language || navigator.userLanguage;
};

// allow apps in iFrames to ask for the user's session token and altering the page URL
window.addEventListener("message", async (event) =>
{
    if(event.source === frames.main && event.data === "what_is_user_session_token")
        try
        {
            let session = await loadSession();
            console.info("app in iframe asked for user token, replying");
            event.source.postMessage({ user_token: session.user_token }, "*");
        }
        catch(x)
        {
            console.error("could not send message to app", x);
        }

    if([ window, frames.main ].includes(event.source) && event.data?.main_url)
        self.location.hash = event.data.main_url.split("http://").join("").split("https://").join("");// TODO
});
