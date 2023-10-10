let session = {};

const loadSession = async () =>
{
    if(session && session.user && session.data)
        return;

    let res = await axios.get("/api/v1/session");
    session = res.data;console.log(session);
};

const getSelectedBusinessId = async () =>
{
    let business = localStorage.getItem("business");

    if(!business)
    {
        await loadSession();
        business = session.data?.business;
    }

    return business;
};

const getUserLanguage = () =>
{
    return (session.data ? session.data.language : null) || navigator.language || navigator.userLanguage;
};
