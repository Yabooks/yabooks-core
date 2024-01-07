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
    let business = localStorage.getItem("business");

    if(!business)
    {
        await loadSession();
        business = session.data?.business;
    }

    return business;
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
