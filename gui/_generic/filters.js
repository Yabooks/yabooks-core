const parseDecimal = function(number)
{
    if(!number)
        return 0;

    if(typeof number === "number")
        return number;

    if(number.$numberDecimal)
        return parseFloat(number.$numberDecimal);

    return parseFloat(number);
};

const filters = (
{
    absolute: (number) =>
    {
        if(typeof number === "object" && number.$numberDecimal)
            number = number.$numberDecimal;

        return Math.abs(number);
    },

    formatNumber: (number) =>
    {
        if(typeof number === "object" && number.$numberDecimal)
            number = number.$numberDecimal;

        return Intl.NumberFormat(getUserLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
    },

    formatDate: (timestamp, language = getUserLanguage()) =>
    {
        return new Date(timestamp).toLocaleDateString(language);
    },

    formatTaxCode: (tax_code) =>
    {
        if(tax_code && tax_code.length > 1)
        {
            let codePoints = tax_code.substring(0, 2).toUpperCase().split('').map(char => char.charCodeAt() + 127397);
            return String.fromCodePoint(...codePoints);
        }
        return "";
    },

    toTaxName: (tax_code) =>
    {
        window.taxCodes = window.taxCodes || {};

        /*if(!window.taxCodes[tax_code] && window.app)
            (async function () =>
            {
                let data = await axios.get("");
                window.taxCodes[tax_code] = data.data.data[0].name;
                window.app.$forceUpdate();
            })();*/

        return window.taxCodes[tax_code] || tax_code;
    }
});

if(Vue)
    for(let filter in filters)
        Vue.filter(filter, filters[filter]);
