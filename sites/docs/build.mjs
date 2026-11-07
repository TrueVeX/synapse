// Builds the SYNAPSE documentation site: content/*.md -> dist/*.html
// Run with `npm run build`. Output is plain static files (no server needed).

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const root = dirname(fileURLToPath(import.meta.url));
const contentDir = join(root, "content");
const staticDir = join(root, "static");
const outDir = join(root, "dist");

const SITE = {
  name: "SYNAPSE Docs",
  url: "https://synapse-humanform-docs.vercel.app",
  app: "https://synapse-humanform.vercel.app",
  home: "https://synapse-download.vercel.app",
  repo: "https://github.com/TrueVeX/synapse",
  editBase: "https://github.com/TrueVeX/synapse/blob/main/sites/docs/content/",
};

// Sidebar order. Each page is content/<slug>.md ("index" is the home page).
const NAV = [
  { section: "Get started", pages: ["index", "getting-started", "reading-answers", "research-modes", "files-and-images"] },
  { section: "Plans and account", pages: ["plans-and-credits", "billing", "settings", "accounts"] },
  { section: "Apps", pages: ["apps"] },
  { section: "Trust and help", pages: ["privacy", "faq", "troubleshooting"] },
  { section: "Developers", pages: ["architecture", "api-reference", "self-hosting"] },
  { section: "About", pages: ["story", "changelog", "credits", "about"] },
];

// ---------------------------------------------------------------------------

const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stripTags = (html) =>
  html
    .replace(/<\/?(?:strong|em|b|i|code|a|span|mark|kbd|sup|sub)\b[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

const slugify = (text) =>
  text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");

const urlFor = (slug) => (slug === "index" ? "/" : `/${slug}`);

function parseFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta = {};
  if (!match) return { meta, body: source };
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: source.slice(match[0].length) };
}

const CALLOUTS = { NOTE: "Note", TIP: "Tip", IMPORTANT: "Important", WARNING: "Warning" };

function renderMarkdown(body) {
  const used = new Map();
  const toc = [];
  const marked = new Marked({ gfm: true });

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        let id = slugify(stripTags(html)) || `section-${depth}`;
        const count = used.get(id) || 0;
        used.set(id, count + 1);
        if (count) id = `${id}-${count}`;
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: stripTags(html) });
        if (depth === 1) return `<h1>${html}</h1>\n`;
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${html}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const language = (lang || "").trim().split(/\s+/)[0];
        const label = language ? `<span class="code__lang">${escapeHtml(language)}</span>` : "<span></span>";
        return `<div class="code">${"<div class=\"code__bar\">"}${label}<button type="button" class="code__copy" aria-label="Copy code">Copy</button></div><pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(text)}</code></pre></div>\n`;
      },
      blockquote({ tokens }) {
        let inner = this.parser.parse(tokens);
        const match = inner.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING)\]\s*/);
        if (match) {
          const kind = match[1];
          inner = inner.replace(match[0], "<p>");
          return `<div class="callout callout--${kind.toLowerCase()}"><p class="callout__title">${CALLOUTS[kind]}</p>${inner}</div>\n`;
        }
        return `<blockquote>${inner}</blockquote>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href) && !href.startsWith(SITE.url);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(href)}"${titleAttr}${external ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
      },
      table(token) {
        // Render with marked's default, then wrap so wide tables scroll on phones.
        const header = token.header.map((cell, i) => `<th${token.align[i] ? ` style="text-align:${token.align[i]}"` : ""}>${this.parser.parseInline(cell.tokens)}</th>`).join("");
        const rows = token.rows
          .map((row) => `<tr>${row.map((cell, i) => `<td${token.align[i] ? ` style="text-align:${token.align[i]}"` : ""}>${this.parser.parseInline(cell.tokens)}</td>`).join("")}</tr>`)
          .join("\n");
        return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });

  const html = marked.parse(body);
  return { html, toc };
}

// Splits a rendered page into searchable chunks at each h2/h3.
function searchChunks(html, title) {
  const parts = html.replace(/<div class="code__bar">[\s\S]*?<\/div>/g, "").split(/(?=<h[23] id=")/);
  return parts
    .map((part) => {
      const heading = part.match(/^<h[23] id="([^"]+)">(?:<a[^>]*>#<\/a>)?([\s\S]*?)<\/h[23]>/);
      const text = stripTags(part.replace(/^<h[23][\s\S]*?<\/h[23]>/, "")).slice(0, 700);
      return { id: heading ? heading[1] : "", heading: heading ? stripTags(heading[2]) : title, text };
    })
    .filter((chunk) => chunk.text);
}

// ---------------------------------------------------------------------------

const MARK = `<svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><line x1="16" y1="11.6" x2="16" y2="6.4"/><line x1="19.81" y1="13.8" x2="24.31" y2="11.2"/><line x1="19.81" y1="18.2" x2="24.31" y2="20.8"/><line x1="16" y1="20.4" x2="16" y2="25.6"/><line x1="12.19" y1="18.2" x2="7.69" y2="20.8"/><line x1="12.19" y1="13.8" x2="7.69" y2="11.2"/><circle cx="16" cy="3.8" r="2.4" stroke="none"/><circle cx="26.57" cy="9.9" r="1.8" stroke="none"/><circle cx="26.57" cy="22.1" r="2.4" stroke="none"/><circle cx="16" cy="28.2" r="1.8" stroke="none"/><circle cx="5.43" cy="22.1" r="2.4" stroke="none"/><circle cx="5.43" cy="9.9" r="1.8" stroke="none"/><circle cx="16" cy="16" r="3" stroke="none"/></g></svg>`;

const THEME_BOOT = `try{var t=localStorage.getItem("synapse_docs_theme");if(t==="light"||(!t&&matchMedia("(prefers-color-scheme: light)").matches))document.documentElement.dataset.theme="light"}catch(e){}`;

function layout({ page, pages, sidebar, prev, next }) {
  const { slug, meta, html, toc } = page;
  const title = slug === "index" ? `${SITE.name}` : `${meta.title} · ${SITE.name}`;
  const description = meta.description || "Documentation for SYNAPSE, the AI research assistant by HumanForm Studios.";
  const tocHtml = toc.length
    ? `<nav class="toc" aria-label="On this page"><p class="toc__title">On this page</p><ul>${toc
        .map((item) => `<li class="toc__item toc__item--${item.depth}"><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`)
        .join("")}</ul></nav>`
    : "";
  // Phones and tablets: the same contents as a dropdown at the top of the page.
  const tocMobile = toc.length > 2
    ? `<details class="toc-mobile"><summary>On this page</summary><ul>${toc
        .map((item) => `<li class="toc__item--${item.depth}"><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`)
        .join("")}</ul></details>`
    : "";
  const pager = `<nav class="pager" aria-label="Previous and next pages">${
    prev ? `<a class="pager__link" href="${urlFor(prev.slug)}"><span>Previous</span><strong>${escapeHtml(prev.meta.title)}</strong></a>` : "<span></span>"
  }${next ? `<a class="pager__link pager__link--next" href="${urlFor(next.slug)}"><span>Next</span><strong>${escapeHtml(next.meta.title)}</strong></a>` : ""}</nav>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="theme-color" content="#1f1e1d" />
<link rel="canonical" href="${SITE.url}${urlFor(slug)}" />
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/assets/apple-icon.png" />
<meta property="og:title" content="${escapeHtml(meta.title || SITE.name)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${SITE.url}/assets/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<script>${THEME_BOOT}</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,500;8..60,600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/docs.css" />
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
  <div class="top__inner">
    <button class="top__menu" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar"><span></span><span></span></button>
    <a class="brand" href="/">${MARK}<span class="brand__word">SYNAPSE</span><span class="brand__docs">Docs</span></a>
    <button class="search-btn" type="button" aria-label="Search the docs"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Search docs</span><kbd>Ctrl K</kbd></button>
    <nav class="top__links" aria-label="SYNAPSE sites">
      <a href="${SITE.home}">Home</a>
      <a href="${SITE.home}/#download">Download</a>
      <a class="top__cta" href="${SITE.app}">Open SYNAPSE</a>
    </nav>
    <button class="theme-btn" type="button" aria-label="Switch between light and dark theme"><svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
  </div>
</header>
<div class="shell">
  <aside class="sidebar" id="sidebar" aria-label="Documentation">
    <nav>${sidebar(slug)}</nav>
    <div class="sidebar__foot"><a href="${SITE.app}">Open SYNAPSE →</a></div>
  </aside>
  <div class="scrim" hidden></div>
  <main class="content" id="content">
    <article class="doc">
      <p class="crumb">${escapeHtml(page.section)}</p>
      <h1 class="doc__title">${escapeHtml(meta.title)}</h1>
      ${meta.description ? `<p class="doc__lede">${escapeHtml(meta.description)}</p>` : ""}
      ${tocMobile}
      <div class="doc__body">
${html}
      </div>
      <p class="doc__edit"><a href="${SITE.editBase}${slug}.md" target="_blank" rel="noopener">Suggest an edit on GitHub</a></p>
      ${pager}
    </article>
    <footer class="foot">
      <p>SYNAPSE · Created by <strong>Revoori Ashwath Reddy</strong> · <strong>HumanForm Studios</strong></p>
      <p><a href="${SITE.home}">Home</a> · <a href="${SITE.app}">Open SYNAPSE</a> · <a href="/credits">Credits</a> · <a href="${SITE.repo}" target="_blank" rel="noopener">GitHub</a></p>
    </footer>
  </main>
  ${tocHtml ? `<aside class="toc-wrap">${tocHtml}</aside>` : ""}
</div>
<a class="to-top" href="#content" aria-label="Back to top" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
<div class="search" hidden role="dialog" aria-modal="true" aria-label="Search the docs">
  <div class="search__panel">
    <div class="search__field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="search" placeholder="Search the documentation" aria-label="Search" autocomplete="off" /><button type="button" class="search__close" aria-label="Close search">Esc</button></div>
    <ul class="search__results" role="listbox" aria-label="Results"></ul>
    <p class="search__hint">Try “credits”, “UPI”, “delete account” or “API”.</p>
  </div>
</div>
<script src="/assets/docs.js" defer></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------

function build() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "assets"), { recursive: true });

  const order = NAV.flatMap((group) => group.pages.map((slug) => ({ slug, section: group.section })));
  const files = new Set(readdirSync(contentDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)));
  for (const { slug } of order) if (!files.has(slug)) throw new Error(`Missing content/${slug}.md`);

  const pages = order.map(({ slug, section }) => {
    const { meta, body } = parseFrontMatter(readFileSync(join(contentDir, `${slug}.md`), "utf8"));
    if (!meta.title) throw new Error(`content/${slug}.md needs a title`);
    const { html, toc } = renderMarkdown(body);
    return { slug, section, meta, html, toc };
  });

  const sidebar = (current) =>
    NAV.map(
      (group) =>
        `<div class="nav-group"><p class="nav-group__title">${escapeHtml(group.section)}</p><ul>${group.pages
          .map((slug) => {
            const page = pages.find((p) => p.slug === slug);
            const active = slug === current;
            return `<li><a href="${urlFor(slug)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(page.meta.nav || page.meta.title)}</a></li>`;
          })
          .join("")}</ul></div>`
    ).join("");

  const index = [];
  pages.forEach((page, i) => {
    const html = layout({ page, pages, sidebar, prev: pages[i - 1], next: pages[i + 1] });
    writeFileSync(join(outDir, page.slug === "index" ? "index.html" : `${page.slug}.html`), html);
    for (const chunk of searchChunks(page.html, page.meta.title)) {
      index.push({ t: page.meta.title, s: page.section, u: urlFor(page.slug) + (chunk.id ? `#${chunk.id}` : ""), h: chunk.heading, x: chunk.text });
    }
  });

  // 404 page
  const notFound = { slug: "404", section: "Not found", meta: { title: "Page not found", description: "This page doesn't exist. Use the sidebar or search to find what you need." }, html: `<p><a href="/">Go to the documentation home</a></p>`, toc: [] };
  writeFileSync(join(outDir, "404.html"), layout({ page: notFound, pages, sidebar }));

  writeFileSync(join(outDir, "search-index.json"), JSON.stringify(index));
  writeFileSync(
    join(outDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((p) => `  <url><loc>${SITE.url}${urlFor(p.slug)}</loc></url>`)
      .join("\n")}\n</urlset>\n`
  );
  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);

  for (const file of readdirSync(staticDir)) copyFileSync(join(staticDir, file), join(outDir, "assets", file));

  const words = pages.reduce((sum, p) => sum + stripTags(p.html).split(/\s+/).length, 0);
  console.log(`Built ${pages.length} pages (${words.toLocaleString("en-US")} words) into dist/`);
}

build();
