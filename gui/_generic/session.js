let session = {};

const loadSession = async () =>
{
    if(session && session.user && session.data)
        return session;

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

// allow iFrames to ask for the user's session token
window.addEventListener("message", async (event) =>
{
    try
    {
        let session = await loadSession();
        if(frames?.main?.postMessage && event.data === "what_is_user_session_token" && session?._id)
            frames.main.postMessage({ user_token: session._id });
    }
    catch(x)
    {
        console.error("could not send message to app", x);
    }
});
