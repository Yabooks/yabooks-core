// helpers for serving stored files safely

/** escapes text for use within xml/svg markup */
const escapeXml = (text) => String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

/** content-disposition header for downloading a file under its name, including names with non-ascii characters */
const attachment = (name) =>
{
    name = String(name || "download").replace(/[\r\n]/g, " ");
    const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/** detects the type of a picture from its content; null if it is not a picture type that is served */
const pictureType = (buffer) =>
{
    const starts = (...bytes) => bytes.every((byte, i) => buffer[i] === byte);

    if(starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
    if(starts(0xff, 0xd8, 0xff)) return "image/jpeg";
    if(starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
    if(starts(0x52, 0x49, 0x46, 0x46) && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
    if(/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(buffer.subarray(0, 1024).toString("utf8"))) return "image/svg+xml";
    return null;
};

/**
 * sends a stored picture (profile picture, logo) with the type detected from its content; svg pictures may contain
 * scripts, which the content security policy keeps from running if the picture is opened directly
 */
const sendPicture = (res, buffer) =>
{
    const type = pictureType(buffer);
    if(!type)
        return res.status(415).send({ error: "unsupported media type", details: "the stored picture is not a supported image" });

    res.set({
        "Content-Type": type,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff"
    }).send(buffer);
};

/** whether an uploaded picture is of a type that can be served */
const isPicture = (buffer) => !!buffer?.length && pictureType(buffer) !== null;

module.exports = { escapeXml, attachment, pictureType, sendPicture, isPicture };
