/* Mue — convertisseur de fichiers 100 % navigateur.
   Les bibliothèques sont chargées à la demande depuis jsDelivr. */
(() => {
  "use strict";

  // ---------- Bibliothèques (chargées uniquement si besoin) ----------
  const CDN = window.MUE_CDN || "https://cdn.jsdelivr.net/npm/";
  const LIBS = {
    xlsx: { url: CDN + "xlsx@0.18.5/dist/xlsx.full.min.js", global: "XLSX" },
    jspdf: { url: CDN + "jspdf@2.5.1/dist/jspdf.umd.min.js", global: "jspdf" },
    html2canvas: { url: CDN + "html2canvas@1.4.1/dist/html2canvas.min.js", global: "html2canvas" },
    pdfworker: { url: CDN + "pdfjs-dist@3.11.174/build/pdf.worker.min.js", global: "pdfjsWorker" },
    pdfjs: { url: CDN + "pdfjs-dist@3.11.174/build/pdf.min.js", global: "pdfjsLib", deps: ["pdfworker"] },
    marked: { url: CDN + "marked@12.0.2/marked.min.js", global: "marked" },
    turndown: { url: CDN + "turndown@7.1.2/lib/turndown.browser.umd.js", global: "TurndownService" },
    gfm: { url: CDN + "turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js", global: "turndownPluginGfm" },
    mammoth: { url: CDN + "mammoth@1.6.0/mammoth.browser.min.js", global: "mammoth" },
    yaml: { url: CDN + "js-yaml@4.1.0/dist/js-yaml.min.js", global: "jsyaml" },
    jszip: { url: CDN + "jszip@3.10.1/dist/jszip.min.js", global: "JSZip" },
    docx: { url: CDN + "docx-preview@0.3.6/dist/docx-preview.min.js", global: "docx", deps: ["jszip"] },
  };
  const loading = {};
  function lib(name) {
    const L = LIBS[name];
    if (window[L.global]) return Promise.resolve(window[L.global]);
    if (!loading[name]) {
      loading[name] = Promise.all((L.deps || []).map(lib)).then(() => new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = L.url;
        s.async = true;
        s.onload = () => (window[L.global] ? resolve(window[L.global]) : reject(new Error("Outil " + name + " introuvable.")));
        s.onerror = () => { delete loading[name]; reject(new Error("Impossible de charger l'outil de conversion. Vérifiez votre connexion.")); };
        document.head.appendChild(s);
      }));
    }
    return loading[name];
  }
  async function pdfjs() {
    const p = await lib("pdfjs"); // le worker est chargé dans la page : pas de Worker séparé
    p.GlobalWorkerOptions.workerSrc = LIBS.pdfworker.url;
    return p;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Formats ----------
  const GROUPS = [
    { id: "image", label: "Image", in: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico", "avif"], out: ["png", "jpg", "webp", "pdf", "bmp", "ico"] },
    { id: "sheet", label: "Tableur", in: ["csv", "tsv", "xlsx", "xls", "xlsm", "ods"], out: ["xlsx", "pdf", "csv", "ods", "tsv", "json", "html", "md", "xml"] },
    { id: "pdf", label: "PDF", in: ["pdf"], out: ["png", "jpg", "txt"] },
    { id: "docx", label: "Word", in: ["docx"], out: ["pdf", "html", "md", "txt"] },
    { id: "markdown", label: "Markdown", in: ["md", "markdown"], out: ["html", "pdf", "txt"] },
    { id: "html", label: "HTML", in: ["html", "htm"], out: ["pdf", "md", "txt"] },
    { id: "text", label: "Texte", in: ["txt", "log", "ini", "cfg", "conf", "js", "ts", "css", "py", "java", "c", "cpp", "sql", "sh", "php", "rb", "go", "rs"], out: ["pdf", "html", "md"] },
    { id: "json", label: "JSON", in: ["json"], out: ["yaml", "xml", "csv", "xlsx", "md"] },
    { id: "yaml", label: "YAML", in: ["yaml", "yml"], out: ["json", "xml"] },
    { id: "xml", label: "XML", in: ["xml"], out: ["json", "yaml"] },
    { id: "audio", label: "Audio", in: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "weba"], out: ["wav"] },
    { id: "video", label: "Vidéo", in: ["mp4", "webm", "mov", "mkv", "ogv", "m4v"], out: ["wav", "png", "jpg"] },
  ];
  const MIME = {
    png: "image/png", jpg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon",
    pdf: "application/pdf", txt: "text/plain;charset=utf-8", html: "text/html;charset=utf-8",
    md: "text/markdown;charset=utf-8", csv: "text/csv;charset=utf-8", tsv: "text/tab-separated-values;charset=utf-8",
    json: "application/json", yaml: "text/yaml;charset=utf-8", xml: "application/xml",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ods: "application/vnd.oasis.opendocument.spreadsheet", wav: "audio/wav", zip: "application/zip",
  };
  const LABEL = { b64: "Base64" };

  const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; };
  const baseOf = (name) => (name || "fichier").replace(/\.[^.]+$/, "") || "fichier";
  function groupOf(file) {
    const e = extOf(file.name);
    let g = GROUPS.find((G) => G.in.includes(e));
    if (!g && file.type) {
      const t = file.type.split("/")[0];
      if (t === "image") g = GROUPS[0];
      else if (t === "audio") g = GROUPS.find((G) => G.id === "audio");
      else if (t === "video") g = GROUPS.find((G) => G.id === "video");
      else if (t === "text") g = GROUPS.find((G) => G.id === "text");
    }
    return g || null;
  }
  function targetsFor(file) {
    const g = groupOf(file);
    let e = extOf(file.name);
    if (e === "jpeg") e = "jpg";
    const out = g ? g.out.filter((o) => o !== e) : [];
    return out.concat("b64");
  }

  const fmtSize = (n) => n < 1024 ? n + " o" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0).replace(".", ",") + " Ko" : (n / 1048576).toFixed(1).replace(".", ",") + " Mo";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const blobOf = (data, ext) => data instanceof Blob ? data : new Blob([data], { type: MIME[ext] || "application/octet-stream" });

  // ---------- Options ----------
  const $ = (id) => document.getElementById(id);
  const opt = () => ({
    quality: Number($("quality").value) / 100,
    maxW: Number($("maxW").value) || 0,
    pdfScale: Number($("pdfScale").value) || 2,
  });

  // ---------- Documents HTML produits ----------
  const DOC_CSS = `
html{background:#fff}
body{margin:0;padding:48px 56px;color:#1f2328;font:15px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;word-wrap:break-word}
h1,h2,h3,h4,h5,h6{margin:1.4em 0 .6em;line-height:1.25;font-weight:600}
h1{font-size:2em;padding-bottom:.3em;border-bottom:1px solid #d1d9e0}
h2{font-size:1.5em;padding-bottom:.3em;border-bottom:1px solid #d1d9e0}
h3{font-size:1.25em}h4{font-size:1em}
body>:first-child{margin-top:0}
p,ul,ol,blockquote,pre,table{margin:0 0 1em}
ul,ol{padding-left:2em}li+li{margin-top:.25em}
a{color:#0969da}
blockquote{margin-left:0;padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0}
code{font:.875em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#eff1f3;padding:.2em .4em;border-radius:4px}
pre{background:#f6f8fa;padding:14px 16px;border-radius:6px;overflow:auto}
pre code{background:none;padding:0;font-size:13px;white-space:pre-wrap}
table{border-collapse:collapse;display:table;max-width:100%}
th,td{border:1px solid #d1d9e0;padding:6px 12px;vertical-align:top}
th{background:#f6f8fa;font-weight:600}
tr:nth-child(2n) td{background:#fbfcfd}
img{max-width:100%;height:auto}
hr{border:0;border-top:1px solid #d1d9e0;margin:1.5em 0}`;
  function htmlDoc(title, body, css) {
    return `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(title)}</title>\n<style>${css == null ? DOC_CSS : css}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  }
  const TEXT_CSS = `html{background:#fff}body{margin:0;padding:48px 56px;color:#1b1b1b}pre{margin:0;font:12.5px/1.55 ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;white-space:pre-wrap;word-wrap:break-word;tab-size:4}`;
  const SHEET_CSS = `html{background:#fff}body{margin:0;padding:40px 44px;color:#1b1b1b;font:12px/1.4 Calibri,Carlito,"Segoe UI",Arial,sans-serif}
h2{font-size:15px;margin:22px 0 8px}h2:first-child{margin-top:0}
table{border-collapse:collapse;margin-bottom:18px}
td,th{border:1px solid #c8ccd0;padding:3px 7px;white-space:nowrap;vertical-align:bottom}
tr:first-child td{background:#f2f4f5;font-weight:600}
td[data-t="n"]{text-align:right;font-variant-numeric:tabular-nums}`;

  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());
    doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
    doc.querySelectorAll("li").forEach((n) => n.prepend(n.parentElement && n.parentElement.tagName === "OL" ? [...n.parentElement.children].indexOf(n) + 1 + ". " : "• "));
    doc.querySelectorAll("td,th").forEach((n) => { if (n.nextElementSibling) n.append("\t"); });
    doc.querySelectorAll("p,div,section,article,header,footer,li,tr,h1,h2,h3,h4,h5,h6,blockquote,pre,table,ul,ol,dt,dd,figure,hr").forEach((n) => n.append("\n"));
    doc.querySelectorAll("p,h1,h2,h3,h4,h5,h6,table,ul,ol,blockquote,pre").forEach((n) => n.append("\n"));
    return (doc.body ? doc.body.textContent : "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  async function htmlToMd(html) {
    const [T, G] = await Promise.all([lib("turndown"), lib("gfm")]);
    const td = new T({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
    td.use(G.gfm);
    td.remove(["script", "style", "noscript", "title"]);
    // Tableaux sans ligne d'en-tête : la première ligne devient l'en-tête pour rester un vrai tableau Markdown
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("table").forEach((t) => {
      if (t.querySelector("th")) return;
      const first = t.querySelector("tr");
      if (!first) return;
      first.querySelectorAll("td").forEach((td0) => { const th = doc.createElement("th"); th.innerHTML = td0.innerHTML; td0.replaceWith(th); });
    });
    doc.querySelectorAll("td p, th p").forEach((p) => { p.insertAdjacentText("afterend", " "); p.replaceWith(...p.childNodes); });
    return td.turndown(doc.body ? doc.body.innerHTML : html).trim() + "\n";
  }

  // ---------- Rendu fidèle en PDF ----------
  // Le document est mis en page par le navigateur (polices, tableaux, images, couleurs),
  // puis découpé en pages A4 entre deux lignes, jamais au milieu d'une ligne ou d'une image.
  const A4_W = 794, A4_H = 1123; // en px CSS (96 dpi)
  const stripScripts = (h) => h.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  async function makeFrame(html, width) {
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${A4_H}px;border:0;pointer-events:none;`;
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open(); d.write(html); d.close();
    await settle(d);
    return f;
  }
  async function settle(d) {
    try { if (d.fonts && d.fonts.ready) await Promise.race([d.fonts.ready, sleep(4000)]); } catch (e) {}
    const imgs = [...d.images].filter((i) => !i.complete);
    if (imgs.length) await Promise.race([Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), sleep(8000)]);
    await sleep(60);
  }
  // Zones qu'on ne doit pas couper : chaque ligne de texte, chaque image, chaque ligne de tableau
  function keepTogether(d, root, originY) {
    const iv = [];
    const range = d.createRange();
    const walker = d.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.height > 0 && r.width > 0) iv.push([r.top - originY, r.bottom - originY]);
    }
    root.querySelectorAll("img,svg,canvas,video,tr,hr,math").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) iv.push([r.top - originY, r.bottom - originY]);
    });
    return iv;
  }
  function forcedBreaks(d, root, originY) {
    const out = [];
    const win = d.defaultView;
    root.querySelectorAll("*").forEach((el) => {
      const s = win.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (s.breakBefore === "page" || s.pageBreakBefore === "always") out.push(r.top - originY);
      if (s.breakAfter === "page" || s.pageBreakAfter === "always") out.push(r.bottom - originY);
    });
    return out.sort((a, b) => a - b);
  }
  // Renvoie les tranches [début, fin] de chaque page ; heightFor(i) = hauteur utile de la page i
  function slicePages(total, heightFor, iv, forced) {
    const cands = [...new Set(iv.flat().map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
    const cuts = [];
    let top = 0;
    for (let i = 0; i < 2000; i++) {
      const H = heightFor(i);
      const limit = top + H;
      const f = forced.find((y) => y > top + 8 && y < Math.min(limit, total - 4));
      if (f != null) { cuts.push([top, f]); top = f; continue; }
      if (total - top <= H + 1) break;
      let cut = limit;
      let j = cands.length - 1;
      while (j >= 0 && cands[j] > limit) j--;
      for (; j >= 0 && cands[j] > top + H * 0.3; j--) {
        const y = cands[j];
        if (!iv.some(([a, b]) => a < y - 0.75 && b > y + 0.75)) { cut = y; break; }
      }
      cuts.push([top, cut]);
      top = cut;
    }
    cuts.push([top, total]);
    return cuts.filter(([a, b]) => b - a > 0.5);
  }
  function bgOf(d) {
    const win = d.defaultView;
    for (const el of [d.body, d.documentElement]) {
      if (!el) continue;
      const c = win.getComputedStyle(el).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
    }
    return "#ffffff";
  }
  function rgbOf(css) {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(css);
    return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
  }
  // Prépare un « appareil photo » : une seule capture si le document est raisonnable, sinon page par page
  async function camera(d, W, total, bg) {
    const h2c = await lib("html2canvas");
    const scale = Math.min(2, window.devicePixelRatio > 1 ? 2 : 2);
    const base = { windowWidth: W, windowHeight: Math.max(total, 1), scrollX: 0, scrollY: 0, scale, backgroundColor: bg, useCORS: true, logging: false, imageTimeout: 8000 };
    let full = null;
    if (total * scale <= 16000 && W * total * scale * scale <= 140e6) {
      full = await h2c(d.documentElement, { ...base, x: 0, y: 0, width: W, height: total });
    }
    return async (x, y, w, h) => {
      if (full) {
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext("2d");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(full, x * scale, y * scale, w * scale, h * scale, 0, 0, c.width, c.height);
        return c;
      }
      return h2c(d.documentElement, { ...base, x, y, width: w, height: h });
    };
  }
  async function newPdf(w, h, title) {
    const { jsPDF } = await lib("jspdf");
    const pdf = new jsPDF({ unit: "px", format: [w, h], orientation: w > h ? "l" : "p", hotfixes: ["px_scaling"], compress: true });
    pdf.setProperties({ title: title || "", creator: "Mue" });
    return pdf;
  }
  const addPage = (pdf, i, w, h) => { if (i > 0) pdf.addPage([w, h], w > h ? "l" : "p"); };
  const putImage = (pdf, canvas, x, y, w, h) => pdf.addImage(canvas.toDataURL("image/jpeg", 0.86), "JPEG", x, y, w, h, undefined, "FAST");

  // Document « coulant » (HTML, Markdown, texte, tableur) → pages A4
  async function flowToPdf(html, title) {
    const f = await makeFrame(stripScripts(html), A4_W);
    try {
      const d = f.contentDocument, root = d.documentElement;
      let W = Math.max(A4_W, Math.ceil(root.scrollWidth), d.body ? Math.ceil(d.body.scrollWidth) : 0);
      if (W > A4_W) { f.style.width = W + "px"; await sleep(40); W = Math.max(W, Math.ceil(root.scrollWidth)); }
      // Hauteur réelle du contenu, mesurée avec une fenêtre basse (sinon la hauteur d'écran crée une page vide)
      f.style.height = "200px";
      await sleep(40);
      const total = Math.ceil(Math.max(root.scrollHeight, d.body ? d.body.scrollHeight : 0));
      f.style.height = total + "px";
      await sleep(40);
      const pageH = Math.round(W * A4_H / A4_W);
      const M = Math.round(W * 36 / A4_W);
      const bg = bgOf(d);
      const iv = keepTogether(d, d.body || root, 0);
      const slices = slicePages(total, () => pageH - 2 * M, iv, forcedBreaks(d, d.body || root, 0))
        .filter(([a, b], i) => i === 0 || iv.some(([t, u]) => u > a + 1 && t < b - 1)); // pas de page blanche finale
      const shoot = await camera(d, W, total, bg);
      const pdf = await newPdf(W, pageH, title);
      const [r, g, b] = rgbOf(bg);
      for (let i = 0; i < slices.length; i++) {
        const [s0, s1] = slices[i];
        addPage(pdf, i, W, pageH);
        if (r + g + b < 762) { pdf.setFillColor(r, g, b); pdf.rect(0, 0, W, pageH, "F"); }
        putImage(pdf, await shoot(0, s0, W, s1 - s0), 0, M, W, s1 - s0);
      }
      return pdf.output("blob");
    } finally { f.remove(); }
  }

  // Word : rendu page par page avec les marges, en-têtes, pieds de page et sauts de page du document
  const OFFICE_FONTS = [
    [/Calibri( Light)?|Aptos[\w ]*/i, "Carlito, 'Segoe UI', Arial, sans-serif"],
    [/Cambria/i, "Caladea, Georgia, serif"],
    [/Arial|Helvetica/i, "Arimo, 'Liberation Sans', Helvetica, sans-serif"],
    [/Times New Roman|Times/i, "Tinos, 'Liberation Serif', 'Times New Roman', serif"],
    [/Courier New|Courier/i, "Cousine, 'Liberation Mono', monospace"],
    [/Georgia/i, "Gelasio, Georgia, serif"],
  ];
  function withFallback(family) {
    return family.split(",").map((f) => f.trim()).filter(Boolean).flatMap((f) => {
      const clean = f.replace(/["']/g, "");
      const hit = OFFICE_FONTS.find(([re]) => re.test(clean));
      return hit ? [f, hit[1]] : [f];
    }).join(", ");
  }
  // Puces Word dessinées avec les polices Symbol / Wingdings : converties en caractères Unicode
  const PUA_BULLETS = { "\uf0b7": "•", "\uf0a7": "▪", "\uf0a8": "□", "\uf0d8": "➢", "\uf0fc": "✓", "\uf076": "❖", "\uf06e": "■", "\uf06c": "●", "\uf0e0": "➔", "\uf0f0": "⇨", "\uf02d": "–", "\uf0be": "—" };
  function fixOfficeFonts(d) {
    d.querySelectorAll("style").forEach((s) => {
      s.textContent = s.textContent
        .replace(/[\uf000-\uf0ff]/g, (c) => PUA_BULLETS[c] || "•")
        .replace(/font-family:\s*["']?(Symbol|Wingdings[\w ]*)["']?\s*;/gi, "font-family: 'Segoe UI Symbol', 'DejaVu Sans', Arial, sans-serif;")
        .replace(/font-family:\s*([^;}]+)/gi, (m, fam) => "font-family: " + withFallback(fam));
    });
    d.querySelectorAll("[style*='font-family']").forEach((el) => { el.style.fontFamily = withFallback(el.style.fontFamily); });
  }
  const FONT_LINKS = ["Carlito:ital,wght@0,400;0,700;1,400;1,700", "Caladea:ital,wght@0,400;0,700;1,400;1,700", "Arimo:ital,wght@0,400;0,700;1,400;1,700", "Tinos:ital,wght@0,400;0,700;1,400;1,700", "Cousine:ital,wght@0,400;0,700;1,400;1,700", "Gelasio:ital,wght@0,400;0,700;1,400;1,700"]
    .map((f) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${f}&display=block">`).join("");

  async function renderDocx(buf, wrapper, title) {
    const D = await lib("docx");
    const f = await makeFrame(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || "")}</title>${FONT_LINKS}</head><body style="margin:0;background:#fff"></body></html>`, 1200);
    const d = f.contentDocument;
    try {
      await D.renderAsync(buf, d.body, d.head, {
        inWrapper: wrapper, className: "docx", breakPages: true, ignoreLastRenderedPageBreak: false,
        ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, experimental: true,
        useBase64URL: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
        renderChanges: false, renderComments: false,
      });
    } catch (e) { f.remove(); throw new Error("Document Word illisible."); }
    fixOfficeFonts(d);
    if (!wrapper) {
      const st = d.createElement("style");
      st.textContent = "section.docx{margin:0 0 24px!important;box-shadow:none!important}";
      d.head.appendChild(st);
    }
    await settle(d);
    return f;
  }
  const ptToPx = (v) => { const m = /([\d.]+)\s*(pt|px)/.exec(v || ""); return m ? (m[2] === "pt" ? parseFloat(m[1]) * 96 / 72 : parseFloat(m[1])) : 0; };

  async function docxToPdf(buf, title) {
    const f = await renderDocx(buf, false, title);
    try {
      const d = f.contentDocument, root = d.documentElement;
      const sections = [...d.querySelectorAll("section.docx")];
      if (!sections.length) throw new Error("Aucune page trouvée dans ce document.");
      const total = Math.ceil(root.scrollHeight);
      f.style.height = total + "px";
      await sleep(40);
      const W = Math.ceil(Math.max(root.scrollWidth, ...sections.map((s) => s.getBoundingClientRect().right)));
      f.style.width = W + "px";
      await sleep(40);
      const shoot = await camera(d, W, total, "#ffffff");
      let pdf = null, n = 0;
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        const cs = d.defaultView.getComputedStyle(s);
        const pw = Math.round(r.width);
        const ph = Math.round(ptToPx(s.style.minHeight) || ptToPx(cs.minHeight) || r.height);
        const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
        const art = s.querySelector(":scope > article");
        if (r.height <= ph + 2 || !art) {
          // Page normale : capturée telle quelle
          if (!pdf) pdf = await newPdf(pw, ph, title); else addPage(pdf, n, pw, ph);
          n++;
          putImage(pdf, await shoot(r.left, r.top, pw, Math.min(r.height, ph)), 0, 0, pw, Math.min(r.height, ph));
          continue;
        }
        // Section plus longue qu'une page (fichier jamais paginé par Word) : on la découpe entre deux lignes
        // et on répète l'en-tête et le pied de page sur chaque page, aux mêmes positions.
        const ar = art.getBoundingClientRect();
        const ftr = s.querySelector(":scope > footer");
        const fr = ftr ? ftr.getBoundingClientRect() : null;
        const fmb = ftr ? parseFloat(d.defaultView.getComputedStyle(ftr).marginBottom) || 0 : 0;
        const usable = Math.max(100, ph - padT - padB);
        const slices = slicePages(ar.height, () => usable, keepTogether(d, art, ar.top), forcedBreaks(d, art, ar.top));
        const head = padT > 0 ? await shoot(r.left, r.top, pw, padT) : null;
        const foot = fr && fr.height > 0 ? await shoot(r.left, fr.top, pw, fr.height) : null;
        for (const [s0, s1] of slices) {
          if (!pdf) pdf = await newPdf(pw, ph, title); else addPage(pdf, n, pw, ph);
          n++;
          if (head) putImage(pdf, head, 0, 0, pw, padT);
          putImage(pdf, await shoot(r.left, ar.top + s0, pw, s1 - s0), 0, padT, pw, s1 - s0);
          if (foot) putImage(pdf, foot, 0, ph - padB - fmb - fr.height, pw, fr.height);
        }
      }
      return pdf.output("blob");
    } finally { f.remove(); }
  }
  async function docxToHtml(buf, title) {
    const f = await renderDocx(buf, true, title);
    try {
      const d = f.contentDocument;
      const st = d.createElement("style");
      st.textContent = "body{margin:0}.docx-wrapper{min-height:100vh}@media (max-width:860px){.docx-wrapper{padding:12px!important}.docx-wrapper>section.docx{transform-origin:top left}}";
      d.head.appendChild(st);
      return "<!doctype html>\n" + d.documentElement.outerHTML;
    } finally { f.remove(); }
  }

  // ---------- Données ----------
  function rowsToMd(rows) {
    rows = rows.filter((r) => r.some((v) => v !== "" && v != null));
    if (!rows.length) return "";
    const w = Math.max(...rows.map((r) => r.length));
    const cell = (v) => String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
    const line = (r) => "| " + Array.from({ length: w }, (_, i) => cell(r[i])).join(" | ") + " |";
    return [line(rows[0]), "|" + Array(w).fill(" --- ").join("|") + "|", ...rows.slice(1).map(line)].join("\n") + "\n";
  }
  const xmlName = (k) => { let n = String(k).trim().replace(/[^A-Za-z0-9_.\-À-ɏ]/g, "_"); if (!/^[A-Za-z_À-ɏ]/.test(n)) n = "_" + n; return n || "_"; };
  function objToXml(v, name, depth) {
    const pad = "  ".repeat(depth);
    const tag = xmlName(name);
    if (Array.isArray(v)) return v.map((x) => objToXml(x, name, depth)).join("");
    if (v && typeof v === "object") {
      const attrs = Object.keys(v).filter((k) => k.startsWith("@")).map((k) => ` ${xmlName(k.slice(1))}="${esc(v[k])}"`).join("");
      const keys = Object.keys(v).filter((k) => !k.startsWith("@") && k !== "#text");
      const text = v["#text"] != null ? esc(v["#text"]) : "";
      if (!keys.length) return `${pad}<${tag}${attrs}>${text}</${tag}>\n`;
      return `${pad}<${tag}${attrs}>\n${text ? pad + "  " + text + "\n" : ""}${keys.map((k) => objToXml(v[k], k, depth + 1)).join("")}${pad}</${tag}>\n`;
    }
    return `${pad}<${tag}>${esc(v == null ? "" : v)}</${tag}>\n`;
  }
  function toXml(v, root) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length === 1 && v[keys[0]] && typeof v[keys[0]] === "object" && !Array.isArray(v[keys[0]])) return `<?xml version="1.0" encoding="UTF-8"?>\n${objToXml(v[keys[0]], keys[0], 0)}`;
      return `<?xml version="1.0" encoding="UTF-8"?>\n${objToXml(v, root, 0)}`;
    }
    const body = Array.isArray(v) ? v.map((x) => objToXml(x, "item", 1)).join("") : objToXml(v, "value", 1);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}</${root}>\n`;
  }
  function xmlToObj(node) {
    const obj = {};
    for (const a of node.attributes || []) obj["@" + a.name] = a.value;
    const kids = [...node.children];
    if (!kids.length) {
      const t = node.textContent.trim();
      return Object.keys(obj).length ? (t ? { ...obj, "#text": t } : obj) : t;
    }
    for (const k of kids) {
      const v = xmlToObj(k);
      if (k.tagName in obj) { if (!Array.isArray(obj[k.tagName])) obj[k.tagName] = [obj[k.tagName]]; obj[k.tagName].push(v); }
      else obj[k.tagName] = v;
    }
    return obj;
  }
  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) throw new Error("XML invalide : " + err.textContent.split("\n")[0]);
    return { [doc.documentElement.tagName]: xmlToObj(doc.documentElement) };
  }
  function flatRows(data) {
    const arr = Array.isArray(data) ? data : data && typeof data === "object" ? (Object.values(data).find(Array.isArray) || [data]) : [{ valeur: data }];
    return arr.map((r) => {
      if (r === null || typeof r !== "object") return { valeur: r };
      const o = {};
      const walk = (obj, pre) => {
        for (const k in obj) {
          const v = obj[k], key = pre ? pre + "." + k : k;
          if (v && typeof v === "object" && !Array.isArray(v)) walk(v, key);
          else o[key] = Array.isArray(v) ? (v.every((x) => x === null || typeof x !== "object") ? v.join(", ") : JSON.stringify(v)) : v;
        }
      };
      walk(r, "");
      return o;
    });
  }

  // CSV : détection du séparateur, guillemets, zéros en tête et décimales françaises conservés
  function detectDelim(text) {
    const lines = text.slice(0, 50000).split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
    let best = ",", bestScore = -1;
    for (const d of [",", ";", "\t", "|"]) {
      const counts = lines.map((l) => { let n = 0, q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) n++; } return n; });
      if (!counts.length || !counts[0]) continue;
      const same = counts.filter((c) => c === counts[0]).length / counts.length;
      const score = same * 10 + Math.min(counts[0], 50) / 50;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }
  function parseCSV(text, d) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === "") q = true;
      else if (ch === d) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function typedCell(v, decComma) {
    const s = v.trim();
    if (!s) return v;
    if (/^[-+]?0\d/.test(s) || /^\+/.test(s) || /^\d{16,}$/.test(s)) return v; // codes, téléphones, identifiants
    let n = s;
    if (decComma) {
      if (/^-?\d{1,3}([   ]\d{3})+(,\d+)?$/.test(n)) n = n.replace(/[   ]/g, "");
      if (/^-?\d+,\d+$/.test(n)) n = n.replace(",", ".");
    }
    if (/^-?\d+(\.\d+)?$/.test(n) && n.replace(/[-.]/g, "").length <= 15) return Number(n);
    return v;
  }
  function autoWidth(ws, aoa) {
    const w = [];
    for (const r of aoa) r.forEach((v, i) => { const l = String(v == null ? "" : v).split("\n").reduce((m, x) => Math.max(m, x.length), 0); w[i] = Math.max(w[i] || 6, Math.min(60, l + 2)); });
    ws["!cols"] = w.map((wch) => ({ wch }));
  }
  function csvToWorkbook(X, text, delim) {
    text = text.replace(/^﻿/, "");
    const sep = /^sep=(.)\r?\n/i.exec(text);
    if (sep) { delim = sep[1]; text = text.slice(sep[0].length); }
    delim = delim || detectDelim(text);
    const raw = parseCSV(text, delim);
    while (raw.length && raw[raw.length - 1].every((c) => !c.trim())) raw.pop();
    // Une colonne qui contient un code à zéro initial (code postal, référence) reste entièrement en texte
    const textCols = new Set();
    raw.slice(1).forEach((r) => r.forEach((c, i) => { if (/^\s*[-+]?0\d/.test(c) || /^\s*\+/.test(c)) textCols.add(i); }));
    const aoa = raw.map((r, ri) => r.map((c, i) => (ri === 0 || textCols.has(i) ? c : typedCell(c, delim !== ","))));
    const ws = X.utils.aoa_to_sheet(aoa);
    autoWidth(ws, aoa);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, "Feuille1");
    return wb;
  }
  // Valeur d'une cellule telle qu'affichée (dates, pourcentages) ou typée (nombres, booléens)
  function cellVal(X, c) {
    if (!c) return "";
    if (c.t === "n") return c.z && X.SSF.is_date(c.z) ? (c.w || String(c.v)) : c.v;
    if (c.t === "b") return c.v;
    if (c.t === "d") return c.w || (c.v instanceof Date ? c.v.toISOString().slice(0, 10) : String(c.v));
    if (c.t === "e") return c.w || "#ERREUR";
    return c.w != null ? c.w : c.v == null ? "" : String(c.v);
  }
  function sheetAoa(X, ws) {
    if (!ws || !ws["!ref"]) return [];
    const r = X.utils.decode_range(ws["!ref"]);
    const out = [];
    for (let R = r.s.r; R <= r.e.r; R++) {
      const row = [];
      for (let C = r.s.c; C <= r.e.c; C++) row.push(cellVal(X, ws[X.utils.encode_cell({ r: R, c: C })]));
      out.push(row);
    }
    while (out.length && out[out.length - 1].every((v) => v === "")) out.pop();
    return out;
  }
  function aoaToObjects(aoa) {
    if (!aoa.length) return [];
    const seen = {};
    const head = aoa[0].map((h, i) => { let k = String(h).trim() || "colonne_" + (i + 1); if (seen[k]) k += "_" + ++seen[k]; else seen[k] = 1; return k; });
    return aoa.slice(1).filter((r) => r.some((v) => v !== "")).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] === undefined ? "" : r[i]])));
  }
  function sheetsHtml(X, wb) {
    const names = wb.SheetNames.filter((n) => wb.Sheets[n] && wb.Sheets[n]["!ref"]);
    return names.map((n) => {
      const t = X.utils.sheet_to_html(wb.Sheets[n], { header: "", footer: "" }).replace(/^[\s\S]*?<table/i, "<table").replace(/<\/table>[\s\S]*$/i, "</table>");
      return (names.length > 1 ? `<h2>${esc(n)}</h2>\n` : "") + t;
    }).join("\n");
  }
  async function sheetOut(X, wb, to, base) {
    const one = (data, ext) => [{ name: `${base}.${ext}`, blob: blobOf(data, ext) }];
    const names = wb.SheetNames.filter((n) => wb.Sheets[n] && wb.Sheets[n]["!ref"]);
    if (!names.length) throw new Error("Le classeur est vide.");
    const multi = names.length > 1;
    const safe = (n) => n.replace(/[\\/:*?"<>|]+/g, "-").trim() || "feuille";
    switch (to) {
      case "xlsx": return one(X.write(wb, { bookType: "xlsx", type: "array", cellStyles: true, compression: true }), "xlsx");
      case "ods": return one(X.write(wb, { bookType: "ods", type: "array", cellStyles: true }), "ods");
      case "csv":
      case "tsv":
        return names.map((n) => ({
          name: multi ? `${base} - ${safe(n)}.${to}` : `${base}.${to}`,
          blob: blobOf("﻿" + X.utils.sheet_to_csv(wb.Sheets[n], { FS: to === "tsv" ? "\t" : ",", blankrows: true }).replace(/\n+$/, "") + "\n", to),
        }));
      case "json": {
        const data = multi ? Object.fromEntries(names.map((n) => [n, aoaToObjects(sheetAoa(X, wb.Sheets[n]))])) : aoaToObjects(sheetAoa(X, wb.Sheets[names[0]]));
        return one(JSON.stringify(data, null, 2) + "\n", "json");
      }
      case "md": return one(names.map((n) => (multi ? `## ${n}\n\n` : "") + rowsToMd(sheetAoa(X, wb.Sheets[n]))).join("\n"), "md");
      case "xml": {
        const sheetXml = (n, d) => aoaToObjects(sheetAoa(X, wb.Sheets[n])).map((r) => objToXml(Object.fromEntries(Object.entries(r).map(([k, v]) => [xmlName(k), v])), "row", d)).join("");
        const body = multi ? names.map((n) => `  <sheet name="${esc(n)}">\n${sheetXml(n, 2)}  </sheet>\n`).join("") : sheetXml(names[0], 1);
        return one(`<?xml version="1.0" encoding="UTF-8"?>\n<${multi ? "workbook" : "rows"}>\n${body}</${multi ? "workbook" : "rows"}>\n`, "xml");
      }
      case "html": return one(htmlDoc(base, sheetsHtml(X, wb), SHEET_CSS.replace("html{background:#fff}", "html{background:#fff}body{overflow-x:auto}")), "html");
      case "pdf": return one(await flowToPdf(htmlDoc(base, sheetsHtml(X, wb), SHEET_CSS), base), "pdf");
    }
    throw new Error("Conversion non disponible.");
  }

  // ---------- Images ----------
  const SVG_UNITS = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
  const svgLen = (v) => { const m = /^\s*([\d.]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(v || ""); return m ? parseFloat(m[1]) * SVG_UNITS[(m[2] || "px").toLowerCase()] : 0; };
  function imgFromUrl(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Image illisible par ce navigateur.")); i.src = url; });
  }
  async function loadSvg(file) {
    const doc = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") throw new Error("SVG invalide.");
    const aw = svg.getAttribute("width"), ah = svg.getAttribute("height");
    let w = svgLen(aw), h = svgLen(ah);
    const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
    if (hasVb) { if (w && !h) h = w * vb[3] / vb[2]; else if (h && !w) w = h * vb[2] / vb[3]; else if (!w && !h) { w = vb[2]; h = vb[3]; } }
    if (!w || !h) { w = w || 512; h = h || 512; }
    if (!hasVb) svg.setAttribute("viewBox", `0 0 ${parseFloat(aw) || w} ${parseFloat(ah) || h}`);
    // Un SVG est vectoriel : on le rend net (au moins 2×, et 1024 px sur le grand côté)
    const k = Math.min(Math.max(2, 1024 / Math.max(w, h)), 4096 / Math.max(w, h));
    const W = Math.round(w * k), H = Math.round(h * k);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    if (!svg.getAttribute("preserveAspectRatio")) svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    try { return { src: await imgFromUrl(url), w: W, h: H, alpha: true, done: () => URL.revokeObjectURL(url) }; }
    catch (e) { URL.revokeObjectURL(url); throw e; }
  }
  async function loadVisual(file) {
    const e = extOf(file.name);
    if (e === "svg" || file.type === "image/svg+xml") return loadSvg(file);
    const alpha = !/^(jpe?g|bmp)$/.test(e);
    if (window.createImageBitmap && e !== "ico") {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { src: bmp, w: bmp.width, h: bmp.height, alpha, done: () => bmp.close && bmp.close() };
      } catch (err) { /* repli ci-dessous */ }
    }
    const url = URL.createObjectURL(file);
    try { const img = await imgFromUrl(url); return { src: img, w: img.naturalWidth, h: img.naturalHeight, alpha, done: () => URL.revokeObjectURL(url) }; }
    catch (err) { URL.revokeObjectURL(url); throw err; }
  }
  function drawToCanvas(src, w, h, maxW, background) {
    if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    const c = document.createElement("canvas");
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  const canvasBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Format non pris en charge par ce navigateur."))), type, q));
  function canvasToBmp(c) {
    const { width: w, height: h } = c;
    const px = c.getContext("2d").getImageData(0, 0, w, h).data;
    const row = Math.ceil((w * 3) / 4) * 4, size = 54 + row * h;
    const buf = new ArrayBuffer(size), v = new DataView(buf);
    v.setUint16(0, 0x4d42, true); v.setUint32(2, size, true); v.setUint32(10, 54, true);
    v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
    v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true);
    v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
    let o = 54;
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; v.setUint8(o++, px[i + 2]); v.setUint8(o++, px[i + 1]); v.setUint8(o++, px[i]); }
      o += row - w * 3;
    }
    return new Blob([buf], { type: MIME.bmp });
  }
  // ICO multi-tailles (16 → 256) : l'icône reste nette partout, proportions conservées
  async function canvasToIco(src, w, h) {
    const sizes = [16, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(16, Math.max(w, h)));
    const pngs = [];
    for (const s of sizes) {
      const c = document.createElement("canvas");
      c.width = c.height = s;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      const k = s / Math.max(w, h), dw = Math.round(w * k), dh = Math.round(h * k);
      ctx.drawImage(src, Math.round((s - dw) / 2), Math.round((s - dh) / 2), dw, dh);
      pngs.push(new Uint8Array(await (await canvasBlob(c, "image/png")).arrayBuffer()));
    }
    const head = new ArrayBuffer(6 + 16 * sizes.length), v = new DataView(head);
    v.setUint16(2, 1, true); v.setUint16(4, sizes.length, true);
    let off = head.byteLength;
    sizes.forEach((s, i) => {
      const o = 6 + 16 * i;
      v.setUint8(o, s === 256 ? 0 : s); v.setUint8(o + 1, s === 256 ? 0 : s);
      v.setUint16(o + 4, 1, true); v.setUint16(o + 6, 32, true);
      v.setUint32(o + 8, pngs[i].length, true); v.setUint32(o + 12, off, true);
      off += pngs[i].length;
    });
    return new Blob([head, ...pngs], { type: MIME.ico });
  }
  async function convertVisual(vis, to, o, title) {
    const { src, w, h, alpha } = vis;
    if (to === "ico") return canvasToIco(src, w, h);
    const opaque = to === "jpg" || to === "bmp" || (to === "pdf" && !alpha);
    const c = drawToCanvas(src, w, h, o.maxW, opaque ? "#ffffff" : null);
    if (to === "png") return canvasBlob(c, "image/png");
    if (to === "jpg") return canvasBlob(c, "image/jpeg", o.quality);
    if (to === "webp") {
      const b = await canvasBlob(c, "image/webp", o.quality);
      if (b.type !== "image/webp") throw new Error("Ce navigateur ne sait pas encoder le WEBP. Essayez avec Chrome ou Firefox.");
      return b;
    }
    if (to === "bmp") return canvasToBmp(c);
    if (to === "pdf") {
      // Page aux dimensions exactes de l'image ; transparence conservée en PNG, sinon JPEG haute qualité
      const pdf = await newPdf(c.width, c.height, title);
      if (alpha) pdf.addImage(c, "PNG", 0, 0, c.width, c.height, undefined, "FAST");
      else pdf.addImage(c.toDataURL("image/jpeg", Math.max(o.quality, 0.92)), "JPEG", 0, 0, c.width, c.height);
      return pdf.output("blob");
    }
    throw new Error("Sortie inconnue");
  }

  // ---------- PDF → texte : colonnes et retraits conservés ----------
  function layoutText(items) {
    const its = items.filter((i) => i.str && i.str.trim() !== "" || (i.str && i.str.length > 1))
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 10 }));
    if (!its.length) return "";
    const widths = its.filter((i) => i.s.length > 2 && i.w > 0).map((i) => i.w / i.s.length).sort((a, b) => a - b);
    const cw = widths.length ? widths[Math.floor(widths.length / 2)] : 5;
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of its) {
      const L = lines[lines.length - 1];
      if (L && Math.abs(L.y - it.y) < Math.max(2, Math.min(L.h, it.h) * 0.45)) L.items.push(it);
      else lines.push({ y: it.y, h: it.h, items: [it] });
    }
    const minX = Math.min(...its.map((i) => i.x));
    const gaps = [];
    for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
    const lh = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 12;
    let out = "";
    lines.forEach((L, i) => {
      if (i > 0 && lines[i - 1].y - L.y > lh * 1.6) out += "\n";
      L.items.sort((a, b) => a.x - b.x);
      let t = "", end = null;
      for (const it of L.items) {
        const col = Math.round((it.x - minX) / cw);
        if (col > t.length + 1) t += " ".repeat(col - t.length);
        else if (end != null && it.x - end > cw * 0.25 && !t.endsWith(" ") && !it.s.startsWith(" ")) t += " ";
        t += it.s;
        end = it.x + it.w;
      }
      out += t.replace(/\s+$/, "") + "\n";
    });
    return out;
  }

  // ---------- Audio / vidéo ----------
  function audioBufferToWav(ab) {
    const ch = ab.numberOfChannels, sr = ab.sampleRate, len = ab.length;
    const data = 44 + len * ch * 2, buf = new ArrayBuffer(data), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, data - 8, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, len * ch * 2, true);
    const chans = Array.from({ length: ch }, (_, i) => ab.getChannelData(i));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Blob([buf], { type: MIME.wav });
  }
  async function toWav(file) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Audio non pris en charge par ce navigateur.");
    // Décodage à la fréquence d'origine (sinon le navigateur rééchantillonne, souvent à 48 kHz)
    const buf = await file.arrayBuffer();
    const rate = sniffSampleRate(new Uint8Array(buf));
    let ctx;
    try { ctx = rate >= 8000 && rate <= 192000 ? new AC({ sampleRate: rate }) : new AC(); } catch (e) { ctx = new AC(); }
    try { return audioBufferToWav(await ctx.decodeAudioData(buf)); }
    catch (e) { throw new Error("Piste audio illisible par ce navigateur."); }
    finally { ctx.close && ctx.close(); }
  }
  // Fréquence d'origine pour WAV, MP3, FLAC et OGG (les plus courants)
  function sniffSampleRate(b) {
    const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
    if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return b[24] | b[25] << 8 | b[26] << 16 | b[27] << 24;
    if (s(0, 4) === "fLaC") return (b[18] << 12 | b[19] << 4 | b[20] >> 4) >>> 0;
    if (s(0, 4) === "OggS") { const i = s(0, 200).indexOf("vorbis"); if (i > 0) return b[i + 11] | b[i + 12] << 8 | b[i + 13] << 16 | b[i + 14] << 24; if (s(0, 200).indexOf("OpusHead") > 0) return 48000; }
    let o = 0;
    if (s(0, 3) === "ID3") o = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
    for (let i = o; i < Math.min(b.length - 4, o + 8192); i++) {
      if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
        const ver = (b[i + 1] >> 3) & 3, idx = (b[i + 2] >> 2) & 3;
        if (idx === 3 || ver === 1) continue;
        return [[11025, 12000, 8000], null, [22050, 24000, 16000], [44100, 48000, 32000]][ver][idx];
      }
    }
    return 0;
  }
  function videoFrame(file) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(file);
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      const t = setTimeout(() => fail(), 20000);
      const fail = () => { clearTimeout(t); URL.revokeObjectURL(url); reject(new Error("Vidéo illisible par ce navigateur.")); };
      v.onerror = fail;
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 2); };
      v.onseeked = () => { clearTimeout(t); resolve({ src: v, w: v.videoWidth, h: v.videoHeight, alpha: false, done: () => URL.revokeObjectURL(url) }); };
    });
  }

  // ---------- Conversion principale ----------
  // Renvoie une liste [{ name, blob }]
  async function convert(file, to) {
    const o = opt();
    const base = baseOf(file.name);
    const one = (data, ext) => [{ name: `${base}.${ext}`, blob: blobOf(data, ext) }];

    if (to === "b64") {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      return [{ name: `${file.name}.base64.txt`, blob: blobOf(String(url).split(",")[1] || "", "txt") }];
    }

    const g = groupOf(file);
    if (!g) throw new Error("Type de fichier non reconnu.");

    switch (g.id) {
      case "image":
      case "video": {
        if (to === "wav") return one(await toWav(file), "wav");
        const vis = g.id === "video" ? await videoFrame(file) : await loadVisual(file);
        try { return one(await convertVisual(vis, to, o, base), to); }
        finally { vis.done && vis.done(); }
      }
      case "audio":
        return one(await toWav(file), "wav");

      case "sheet": {
        const X = await lib("xlsx");
        const e = extOf(file.name);
        const wb = e === "csv" || e === "tsv"
          ? csvToWorkbook(X, await file.text(), e === "tsv" ? "\t" : null)
          : X.read(await file.arrayBuffer(), { type: "array", cellDates: true, cellNF: true, cellStyles: true });
        return sheetOut(X, wb, to, base);
      }
      case "json":
      case "yaml":
      case "xml": {
        const text = (await file.text()).replace(/^﻿/, "");
        let data;
        if (g.id === "json") { try { data = JSON.parse(text); } catch (err) { throw new Error("JSON invalide : " + err.message); } }
        else if (g.id === "yaml") { try { data = (await lib("yaml")).load(text); } catch (err) { throw new Error("YAML invalide : " + err.message.split("\n")[0]); } }
        else data = parseXml(text);
        if (to === "json") return one(JSON.stringify(data, null, 2) + "\n", "json");
        if (to === "yaml") return one((await lib("yaml")).dump(data, { lineWidth: -1, noRefs: true }), "yaml");
        if (to === "xml") return one(toXml(data, "root"), "xml");
        const X = await lib("xlsx");
        const rows = flatRows(data);
        const ws = X.utils.json_to_sheet(rows);
        autoWidth(ws, [Object.keys(rows[0] || {}), ...rows.map(Object.values)]);
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, "Données");
        return sheetOut(X, wb, to, base);
      }

      case "markdown": {
        const md = (await file.text()).replace(/^﻿/, "");
        const M = await lib("marked");
        const html = htmlDoc(base, M.parse(md, { gfm: true, breaks: false }));
        if (to === "html") return one(html, "html");
        if (to === "txt") return one(htmlToText(html), "txt");
        if (to === "pdf") return one(await flowToPdf(html, base), "pdf");
        break;
      }
      case "html": {
        const html = await file.text();
        if (to === "md") return one(await htmlToMd(html), "md");
        if (to === "txt") return one(htmlToText(html), "txt");
        if (to === "pdf") {
          // Une page sans fond ni largeur prévue pour l'écran reçoit des marges blanches lisibles
          const page = /<html[\s>]/i.test(html) ? html : htmlDoc(base, html);
          return one(await flowToPdf(page.replace(/<head([^>]*)>/i, `<head$1><style>html{background:#fff}</style>`), base), "pdf");
        }
        break;
      }
      case "text": {
        const txt = (await file.text()).replace(/^﻿/, "");
        const html = htmlDoc(base, `<pre>${esc(txt)}</pre>`, TEXT_CSS);
        if (to === "pdf") return one(await flowToPdf(html, base), "pdf");
        if (to === "html") return one(html, "html");
        if (to === "md") return one(txt, "md");
        break;
      }
      case "docx": {
        const buf = await file.arrayBuffer();
        if (to === "pdf") return one(await docxToPdf(buf, base), "pdf");
        if (to === "html") return one(await docxToHtml(buf, base), "html");
        const M = await lib("mammoth");
        const mopts = { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Titre'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Sous-titre'] => h2:fresh"] };
        const mhtml = async () => (await M.convertToHtml({ arrayBuffer: buf }, mopts)).value;
        if (to === "txt") return one(htmlToText(await mhtml()), "txt");
        if (to === "md") return one(await htmlToMd(await mhtml()), "md");
        break;
      }
      case "pdf": {
        const P = await pdfjs();
        const pdf = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        try {
          if (to === "txt") {
            const pages = [];
            for (let i = 1; i <= pdf.numPages; i++) pages.push(layoutText((await (await pdf.getPage(i)).getTextContent()).items));
            const out = pages.join("\n\f\n").replace(/\n{3,}/g, "\n\n");
            if (!out.trim()) throw new Error("Ce PDF ne contient pas de texte (document scanné).");
            return one(out, "txt");
          }
          const files = [];
          const pad = String(pdf.numPages).length;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const vp = page.getViewport({ scale: o.pdfScale });
            const c = document.createElement("canvas");
            c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvasContext: ctx, viewport: vp, annotationMode: P.AnnotationMode ? P.AnnotationMode.ENABLE_FORMS : undefined }).promise;
            const b = await canvasBlob(c, to === "png" ? "image/png" : "image/jpeg", Math.max(o.quality, 0.9));
            const name = pdf.numPages === 1 ? `${base}.${to}` : `${base}-page-${String(i).padStart(pad, "0")}.${to}`;
            files.push({ name, blob: b });
            page.cleanup();
          }
          return files;
        } finally { pdf.destroy(); }
      }
    }
    throw new Error("Conversion non disponible.");
  }

  // ---------- Téléchargement ----------
  // Dans un aperçu Claude, on passe par la capacité "downloads" ; ailleurs, par un lien classique.
  const dlReady = window.claude && typeof window.claude.use === "function"
    ? window.claude.use("downloads").catch(() => null)
    : Promise.resolve(null);
  async function save(name, blob) {
    const dl = await dlReady;
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); toast("Fichier enregistré : " + name); }
      catch (e) {
        if (e && e.code === "declined") return;
        if (e && e.code === "rejected_extension") toast("Ce format ne peut pas être téléchargé dans l'aperçu. Il fonctionne sur votre propre site.");
        else toast("Téléchargement impossible ici.");
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function zipOf(list) {
    const Z = await lib("jszip");
    const z = new Z();
    const seen = {};
    for (const f of list) {
      let n = f.name;
      if (seen[n]) { n = baseOf(n) + "-" + (++seen[n]) + "." + extOf(n); } else seen[n] = 1;
      z.file(n, f.blob);
    }
    return z.generateAsync({ type: "blob", mimeType: MIME.zip });
  }

  // ---------- Interface ----------
  const jobs = [];
  let uid = 0;
  const list = $("jobs");

  function addFiles(files, sample) {
    for (const f of files) {
      if (!f) continue;
      const targets = targetsFor(f);
      const job = { id: ++uid, file: f, targets, to: targets[0], state: "idle", out: null, msg: "", sample: !!sample };
      jobs.push(job);
      list.appendChild(renderJob(job));
    }
    refresh();
  }
  function renderJob(job) {
    const li = document.createElement("li");
    li.className = "job";
    li.dataset.id = job.id;
    const g = groupOf(job.file);
    const ext = extOf(job.file.name) || "?";
    const opts = job.targets.map((t) => `<option value="${t}">${LABEL[t] || t}</option>`).join("");
    li.innerHTML = `
      <span class="ext" title="${esc(ext)}">${esc(ext.slice(0, 5))}</span>
      <div class="meta"><b title="${esc(job.file.name)}">${esc(job.file.name)}</b><small class="info"></small></div>
      <label class="target"><span>vers</span><select id="to-${job.id}" aria-label="Format de sortie pour ${esc(job.file.name)}">${opts}</select></label>
      <div class="acts">
        <button type="button" class="btn primary act"></button>
        <button type="button" class="btn ghost share" hidden>Partager</button>
      </div>
      <button type="button" class="remove" aria-label="Retirer ${esc(job.file.name)}">×</button>`;
    li.querySelector("select").value = job.to;
    li.querySelector("select").addEventListener("change", (e) => { job.to = e.target.value; job.state = "idle"; job.out = null; updateJob(job); refresh(); });
    li.querySelector(".act").addEventListener("click", () => (job.state === "done" ? download(job) : run(job)));
    li.querySelector(".share").addEventListener("click", () => shareJob(job));
    li.querySelector(".remove").addEventListener("click", () => removeJob(job));
    job.el = li;
    job.kind = g ? g.label : "Autre";
    updateJob(job);
    return li;
  }
  function updateJob(job) {
    const li = job.el;
    if (!li) return;
    li.classList.toggle("done", job.state === "done");
    li.classList.toggle("error", job.state === "error");
    const info = li.querySelector(".info");
    const btn = li.querySelector(".act");
    const sel = li.querySelector("select");
    const base = `${fmtSize(job.file.size)} · ${job.kind}`;
    const tag = job.sample ? '<span class="tag">Exemple</span>' : "";
    sel.disabled = job.state === "busy";
    btn.disabled = job.state === "busy";
    li.querySelector(".share").hidden = !(job.state === "done" && shareFiles(job.out));
    btn.classList.toggle("ok", job.state === "done");
    btn.classList.toggle("primary", job.state !== "done");
    if (job.state === "busy") { info.innerHTML = `<span class="spin" aria-hidden="true"></span>Conversion…`; btn.textContent = "Patientez"; }
    else if (job.state === "done") {
      const total = job.out.reduce((s, f) => s + f.blob.size, 0);
      info.innerHTML = `${base} → <span class="status-ok">${job.out.length > 1 ? job.out.length + " fichiers, " : ""}${fmtSize(total)}</span>${tag}`;
      btn.textContent = job.out.length > 1 ? "Télécharger (.zip)" : "Télécharger";
    } else if (job.state === "error") {
      info.innerHTML = `<span class="status-bad">${esc(job.msg)}</span>`;
      btn.textContent = "Réessayer";
    } else { info.innerHTML = base + tag; btn.textContent = "Convertir"; }
  }
  async function run(job) {
    job.state = "busy"; updateJob(job);
    try { job.out = await convert(job.file, job.to); job.state = "done"; }
    catch (e) { job.state = "error"; job.msg = (e && e.message) || "Échec de la conversion."; console.error(e); }
    updateJob(job); refresh();
  }
  async function download(job) {
    if (!job.out) return;
    if (job.out.length === 1) return save(job.out[0].name, job.out[0].blob);
    toast("Préparation de l'archive…");
    save(baseOf(job.file.name) + ".zip", await zipOf(job.out));
  }
  function removeJob(job) {
    const i = jobs.indexOf(job);
    if (i > -1) jobs.splice(i, 1);
    if (job.el) job.el.remove();
    refresh();
  }

  // Partage natif (téléphones) : envoyer le résultat vers WhatsApp, Mail, Fichiers…
  let canShare = false;
  dlReady.then((dl) => {
    canShare = !dl && typeof navigator.canShare === "function" && matchMedia("(pointer: coarse)").matches;
    if (canShare) jobs.forEach(updateJob);
  });
  function shareFiles(out) {
    if (!canShare || !out) return null;
    const files = out.map((f) => new File([f.blob], f.name, { type: f.blob.type || "application/octet-stream" }));
    try { return navigator.canShare({ files }) ? files : null; } catch (e) { return null; }
  }
  async function shareJob(job) {
    const files = shareFiles(job.out);
    if (!files) { toast("Ce format ne peut pas être partagé. Utilisez Télécharger."); return; }
    try { await navigator.share({ files, title: files[0].name }); }
    catch (e) { if (!e || e.name !== "AbortError") toast("Partage impossible. Utilisez Télécharger."); }
  }
  function refresh() {
    $("count").textContent = jobs.length;
    $("empty").hidden = jobs.length > 0;
    $("zipAll").disabled = !jobs.some((j) => j.state === "done");
    $("convertAll").disabled = !jobs.some((j) => j.state === "idle" || j.state === "error");
    $("clearAll").disabled = !jobs.length;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  // Glisser-déposer, sélection, collage
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => addFiles([...(e.dataTransfer.files || [])]));
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => { if (!drop.contains(e.target)) { e.preventDefault(); addFiles([...(e.dataTransfer.files || [])]); } });
  $("picker").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
  document.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { addFiles(files.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `colle-${Date.now()}-${i}.${extOf(f.name) || (f.type.split("/")[1] || "png")}`, { type: f.type }))); toast("Fichier collé ajouté."); }
  });

  $("convertAll").addEventListener("click", async () => {
    const todo = jobs.filter((j) => j.state === "idle" || j.state === "error");
    let i = 0;
    const worker = async () => { while (i < todo.length) await run(todo[i++]); };
    await Promise.all([worker(), worker(), worker()]);
  });
  $("zipAll").addEventListener("click", async () => {
    const all = jobs.filter((j) => j.state === "done").flatMap((j) => j.out);
    if (!all.length) return;
    toast("Préparation de l'archive…");
    save("conversions-mue.zip", await zipOf(all));
  });
  $("clearAll").addEventListener("click", () => { jobs.length = 0; list.innerHTML = ""; refresh(); });
  $("quality").addEventListener("input", (e) => { $("qualityOut").textContent = e.target.value + " %"; });

  // Formats affichés
  const chip = (t, cls) => `<span class="chip ${cls || ""}">${esc(t)}</span>`;
  $("dropExts").innerHTML = ["png", "jpg", "webp", "svg", "pdf", "docx", "xlsx", "csv", "json", "yaml", "xml", "md", "html", "mp3", "mp4"].map((t) => chip(t)).join("") + chip("+40");
  $("fmtTable").innerHTML = GROUPS.map((G) => `<tr><td data-label="Type">${G.label}</td><td data-label="Entrée"><div class="chips">${G.in.map((t) => chip(t)).join("")}</div></td><td data-label="Sortie"><div class="chips">${G.out.map((t) => chip(t, "out")).join("")}</div></td></tr>`).join("");

  // Fichier d'exemple : on montre l'outil en action dès l'ouverture
  const sample = [
    "Mois;Ville;Ventes (€);Commandes",
    "Janvier;Lyon;12450;318", "Janvier;Paris;20980;512", "Février;Lyon;11870;301",
    "Février;Paris;22310;547", "Mars;Lyon;14020;355", "Mars;Paris;24760;601",
  ].join("\n").replace(/;/g, ",");
  addFiles([new File([sample], "ventes-trimestre.csv", { type: "text/csv" })], true);
  const first = jobs[0];
  if (first) { first.to = "xlsx"; first.el.querySelector("select").value = "xlsx"; }

  // ---------- Appli mobile (PWA) ----------
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const inClaude = !!(window.claude && typeof window.claude.use === "function");

  // Hors connexion : le service worker garde l'appli et ses outils en cache
  if (!inClaude && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
      const saveData = navigator.connection && navigator.connection.saveData;
      if (standalone && !saveData && reg.active) reg.active.postMessage({ type: "warm" });
    }).catch(() => {});
  }

  // Bouton « Installer l'appli » (Android, Chrome, Edge)
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("install").hidden = false; });
  $("install").addEventListener("click", async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) {}
    installEvt = null; $("install").hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    $("install").hidden = true;
    toast("Mue est installée sur votre appareil.");
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: "warm" });
  });
  // iPhone / iPad : pas de bouton système, on explique le geste
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone && !inClaude) $("iosHint").hidden = false;

  // Fichiers partagés depuis une autre appli vers Mue (Android : menu Partager)
  if (/[?&]share=1/.test(location.search) && "caches" in window) {
    (async () => {
      try {
        const cache = await caches.open("mue-share");
        const keys = await cache.keys();
        const files = [];
        for (const req of keys) {
          const res = await cache.match(req);
          const name = decodeURIComponent(res.headers.get("X-File-Name") || "fichier");
          files.push(new File([await res.blob()], name, { type: res.headers.get("Content-Type") || "" }));
          await cache.delete(req);
        }
        if (files.length) {
          jobs.filter((j) => j.sample).forEach(removeJob);
          addFiles(files);
          toast(files.length > 1 ? files.length + " fichiers reçus." : "Fichier reçu.");
        }
      } catch (e) { console.error(e); }
      history.replaceState(null, "", location.pathname);
    })();
  }

})();
