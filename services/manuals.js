const fs = require("node:fs"), path = require("node:path");

// markdown help pages are stored as ./assets/manuals/<page>.<language>.md, screenshots in ./assets/manuals/screenshots/
const MANUALS_DIR = path.join(__dirname, "..", "assets", "manuals");
const LANGUAGES = { en: "English", de: "Deutsch" };
const TEXTS = {
    en: { help: "YaBooks Help", contents: "On this page", overview: "All help topics", back: "Back to top" },
    de: { help: "YaBooks Hilfe", contents: "Auf dieser Seite", overview: "Alle Hilfethemen", back: "Nach oben" }
};

const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

// heading anchor, e.g. "Booking Date" -> "booking-date"
const slugify = (text) => String(text).toLowerCase()
    .replace(/<[^>]*>/g, "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^\w\s-]/g, "")
    .trim().replace(/[\s_]+/g, "-") || "section";

const fileOf = (page) => path.join(MANUALS_DIR, `${page}.md`);

/** splits a page name like "balances.de" into its base name and language */
const parsePageName = (page) =>
{
    const match = /^(?<base>[\w-]+)\.(?<lang>[a-z]{2})$/.exec(page);
    return match ? match.groups : { base: page, lang: "en" };
};

/** renders a help page as a complete html page, or returns null if it does not exist */
const renderManualPage = async (page) =>
{
    if(!/^[\w.-]+$/.test(page) || page.includes(".."))
        return null;

    let { base, lang } = parsePageName(page);
    if(!fs.existsSync(fileOf(page)))
        return null;

    const { Marked } = await import("marked");
    const markdown = fs.readFileSync(fileOf(page), "utf8");

    // headings get anchors, so that pages can link to sections of other pages, and level 2 and 3 ones make up the table of contents
    const toc = [], usedSlugs = new Map();
    let title = "YaBooks";

    const marked = new Marked();
    marked.use({
        renderer: {
            heading({ tokens, depth, text })
            {
                const html = this.parser.parseInline(tokens);
                let slug = slugify(text);
                const count = usedSlugs.get(slug) ?? 0;
                usedSlugs.set(slug, count + 1);
                if(count)
                    slug += `-${count}`;

                if(depth === 1 && title === "YaBooks")
                    title = text.replace(/[`*_]/g, "");
                if(depth === 2 || depth === 3)
                    toc.push({ depth, slug, html });

                return `<h${depth} id="${slug}"><a class="anchor" href="#${slug}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
            },

            // screenshots are shown as framed figures, the image title (if any) becomes the caption; click to enlarge
            image({ href, title, text })
            {
                const caption = title || "";
                return `<figure><a href="${escapeHtml(href)}" target="_blank"><img src="${escapeHtml(href)}" alt="${escapeHtml(text)}" loading="lazy" /></a>` +
                    (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "") + `</figure>`;
            },

            // a paragraph holding nothing but a screenshot becomes the figure itself, as figures may not be nested in paragraphs
            paragraph({ tokens })
            {
                const html = this.parser.parseInline(tokens);
                return tokens.length === 1 && tokens[0].type === "image" ? `${html}\n` : `<p>${html}</p>\n`;
            },

            // tip, warning and note boxes: a blockquote starting with an emoji is styled according to it
            blockquote({ tokens })
            {
                const body = this.parser.parse(tokens);
                const kind = /^<p>\s*(💡|Tip|Tipp)/.test(body) ? "tip" : /^<p>\s*(⚠️|Warning|Achtung)/.test(body) ? "warning" : "note";
                return `<blockquote class="${kind}">${body}</blockquote>\n`;
            }
        }
    });

    const content = marked.parse(markdown);
    const texts = TEXTS[lang] ?? TEXTS.en;

    // links to the same page in the other languages
    const languages = Object.entries(LANGUAGES)
        .filter(([ code ]) => fs.existsSync(fileOf(`${base}.${code}`)))
        .map(([ code, name ]) => code === lang ?
            `<span class="current" title="${name}">${code.toUpperCase()}</span>` :
            `<a href="${base}.${code}" title="${name}" hreflang="${code}">${code.toUpperCase()}</a>`)
        .join("");

    const tocHtml = toc.length < 2 ? "" : `<aside class="toc"><nav>
            <h2>${texts.contents}</h2>
            <ul>${toc.map(entry => `<li class="level-${entry.depth}"><a href="#${entry.slug}">${entry.html.replace(/<a [^>]*>|<\/a>/g, "")}</a></li>`).join("")}</ul>
            <a class="top" href="#">&uarr; ${texts.back}</a>
        </nav></aside>`;

    return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)} – ${texts.help}</title>
        <link rel="icon" type="image/png" href="/_generic/icon.png" />
        <link rel="stylesheet" href="/_generic/help_page.css" />
    </head>
    <body>
        <header class="topbar">
            <a class="brand" href="index.${lang}"><img src="/_generic/icon.png" alt="" /> ${texts.help}</a>
            ${base !== "index" ? `<a class="overview" href="index.${lang}">&#x1F4DA; ${texts.overview}</a>` : ""}
            <span class="languages">${languages}</span>
        </header>
        <div class="layout${tocHtml ? "" : " no-toc"}">
            <main>${content}</main>
            ${tocHtml}
        </div>
    </body>
</html>`;
};

module.exports = { renderManualPage, MANUALS_DIR };
