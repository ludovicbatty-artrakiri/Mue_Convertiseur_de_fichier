/* Mue — convertisseur de fichiers 100 % navigateur.
   Les bibliothèques sont chargées à la demande depuis jsDelivr. */
(() => {
  "use strict";

  // ---------- Bibliothèques (chargées uniquement si besoin) ----------
  const CDN = "https://cdn.jsdelivr.net/npm/";
  const LIBS = {
    xlsx: { url: CDN + "xlsx@0.18.5/dist/xlsx.full.min.js", global: "XLSX" },
    jspdf: { url: CDN + "jspdf@2.5.1/dist/jspdf.umd.min.js", global: "jspdf" },
    pdfworker: { url: CDN + "pdfjs-dist@3.11.174/build/pdf.worker.min.js", global: "pdfjsWorker" },
    pdfjs: { url: CDN + "pdfjs-dist@3.11.174/build/pdf.min.js", global: "pdfjsLib" },
    marked: { url: CDN + "marked@12.0.2/marked.min.js", global: "marked" },
    turndown: { url: CDN + "turndown@7.1.2/lib/turndown.browser.umd.js", global: "TurndownService" },
    mammoth: { url: CDN + "mammoth@1.6.0/mammoth.browser.min.js", global: "mammoth" },
    yaml: { url: CDN + "js-yaml@4.1.0/dist/js-yaml.min.js", global: "jsyaml" },
    jszip: { url: CDN + "jszip@3.10.1/dist/jszip.min.js", global: "JSZip" },
  };
  const loading = {};
  function lib(name) {
    const L = LIBS[name];
    if (window[L.global]) return Promise.resolve(window[L.global]);
    if (!loading[name]) {
      loading[name] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = L.url;
        s.async = true;
        s.onload = () => (window[L.global] ? resolve(window[L.global]) : reject(new Error("Bibliothèque " + name + " introuvable")));
        s.onerror = () => { delete loading[name]; reject(new Error("Impossible de charger " + name + ". Vérifiez votre connexion.")); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }
  async function pdfjs() {
    await lib("pdfworker"); // exécuté dans la page : pas besoin de Worker séparé
    const p = await lib("pdfjs");
    p.GlobalWorkerOptions.workerSrc = LIBS.pdfworker.url;
    return p;
  }

  // ---------- Formats ----------
  const GROUPS = [
    { id: "image", label: "Image", in: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico", "avif"], out: ["png", "jpg", "webp", "bmp", "ico", "pdf"] },
    { id: "sheet", label: "Tableur", in: ["csv", "tsv", "xlsx", "xls", "xlsm", "ods"], out: ["xlsx", "csv", "tsv", "ods", "json", "html", "md", "xml"] },
    { id: "pdf", label: "PDF", in: ["pdf"], out: ["png", "jpg", "txt"] },
    { id: "docx", label: "Word", in: ["docx"], out: ["html", "md", "txt", "pdf"] },
    { id: "markdown", label: "Markdown", in: ["md", "markdown"], out: ["html", "txt", "pdf"] },
    { id: "html", label: "HTML", in: ["html", "htm"], out: ["md", "txt", "pdf"] },
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

  // ---------- Outils communs ----------
  function htmlDoc(title, body, extraCss) {
    return `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(title)}</title>\n<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b1b1b}img{max-width:100%}pre{background:#f4f4f4;padding:1rem;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.35rem .6rem}${extraCss || ""}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  }
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
    doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
    doc.querySelectorAll("p,div,section,article,header,footer,li,tr,h1,h2,h3,h4,h5,h6,blockquote,pre,table,ul,ol").forEach((n) => n.append("\n"));
    doc.querySelectorAll("li").forEach((n) => n.prepend("• "));
    doc.querySelectorAll("td,th").forEach((n) => n.append("\t"));
    return (doc.body ? doc.body.textContent : "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  async function htmlToMd(html) {
    const T = await lib("turndown");
    const td = new T({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
    td.remove(["script", "style"]);
    return td.turndown(html);
  }
  async function textToPdf(text, title) {
    const { jsPDF } = await lib("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 56, LH = 15;
    doc.setProperties({ title: title || "" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    // jsPDF (police standard) ne gère que le Latin-1 : on remplace le reste.
    const clean = text.replace(/\t/g, "    ").replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "-").replace(/[^\x00-\xFF\n]/g, "?");
    const lines = doc.splitTextToSize(clean, W - 2 * M);
    let y = M;
    for (const line of lines) {
      if (y > H - M) { doc.addPage(); y = M; }
      doc.text(line, M, y);
      y += LH;
    }
    return doc.output("blob");
  }
  function rowsToMd(rows) {
    if (!rows.length) return "";
    const w = Math.max(...rows.map((r) => r.length));
    const cell = (v) => String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\n/g, " ");
    const line = (r) => "| " + Array.from({ length: w }, (_, i) => cell(r[i])).join(" | ") + " |";
    return [line(rows[0]), "| " + Array(w).fill("---").join(" | ") + " |", ...rows.slice(1).map(line)].join("\n") + "\n";
  }
  const xmlName = (k) => { let n = String(k).replace(/[^A-Za-z0-9_.-]/g, "_"); if (!/^[A-Za-z_]/.test(n)) n = "_" + n; return n; };
  function objToXml(v, name, depth) {
    const pad = "  ".repeat(depth);
    const tag = xmlName(name);
    if (Array.isArray(v)) return v.map((x) => objToXml(x, name, depth)).join("");
    if (v && typeof v === "object") {
      const inner = Object.keys(v).map((k) => objToXml(v[k], k, depth + 1)).join("");
      return `${pad}<${tag}>\n${inner}${pad}</${tag}>\n`;
    }
    return `${pad}<${tag}>${esc(v == null ? "" : v)}</${tag}>\n`;
  }
  function toXml(v, root) {
    const body = Array.isArray(v) ? v.map((x) => objToXml(x, "item", 1)).join("") : v && typeof v === "object" ? Object.keys(v).map((k) => objToXml(v[k], k, 1)).join("") : objToXml(v, "value", 1);
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
    let arr = Array.isArray(data) ? data : data && typeof data === "object" ? (Object.values(data).find(Array.isArray) || [data]) : [{ valeur: data }];
    return arr.map((r) => {
      if (r === null || typeof r !== "object") return { valeur: r };
      const o = {};
      for (const k in r) o[k] = r[k] !== null && typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k];
      return o;
    });
  }

  // ---------- Images ----------
  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      let w = img.naturalWidth || 512, h = img.naturalHeight || 512;
      return { img, w, h, url };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw new Error("Image illisible par ce navigateur.");
    }
  }
  function drawToCanvas(src, w, h, maxW, background) {
    if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    const c = document.createElement("canvas");
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    const ctx = c.getContext("2d");
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
  async function canvasToIco(src, w, h) {
    const s = Math.min(256, Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const k = s / Math.max(w, h), dw = Math.round(w * k), dh = Math.round(h * k);
    c.getContext("2d").drawImage(src, (s - dw) / 2, (s - dh) / 2, dw, dh);
    const png = new Uint8Array(await (await canvasBlob(c, "image/png")).arrayBuffer());
    const head = new ArrayBuffer(22), v = new DataView(head);
    v.setUint16(2, 1, true); v.setUint16(4, 1, true);
    v.setUint8(6, s === 256 ? 0 : s); v.setUint8(7, s === 256 ? 0 : s);
    v.setUint16(10, 1, true); v.setUint16(12, 32, true);
    v.setUint32(14, png.length, true); v.setUint32(18, 22, true);
    return new Blob([head, png], { type: MIME.ico });
  }
  async function convertCanvasSource(src, w, h, to, o, title) {
    if (to === "ico") return canvasToIco(src, w, h);
    const opaque = to === "jpg" || to === "bmp" || to === "pdf";
    const c = drawToCanvas(src, w, h, o.maxW, opaque ? "#ffffff" : null);
    if (to === "png") return canvasBlob(c, "image/png");
    if (to === "jpg") return canvasBlob(c, "image/jpeg", o.quality);
    if (to === "webp") {
      const b = await canvasBlob(c, "image/webp", o.quality);
      if (b.type !== "image/webp") throw new Error("Ce navigateur ne sait pas encoder le WEBP.");
      return b;
    }
    if (to === "bmp") return canvasToBmp(c);
    if (to === "pdf") {
      const { jsPDF } = await lib("jspdf");
      const doc = new jsPDF({ unit: "px", format: [c.width, c.height], orientation: c.width > c.height ? "l" : "p", hotfixes: ["px_scaling"] });
      doc.setProperties({ title: title || "" });
      doc.addImage(c.toDataURL("image/jpeg", Math.max(o.quality, 0.85)), "JPEG", 0, 0, c.width, c.height);
      return doc.output("blob");
    }
    throw new Error("Sortie inconnue");
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
    const ctx = new AC();
    try {
      const ab = await ctx.decodeAudioData(await file.arrayBuffer());
      return audioBufferToWav(ab);
    } catch (e) {
      throw new Error("Piste audio illisible par ce navigateur.");
    } finally { ctx.close && ctx.close(); }
  }
  function videoFrame(file) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(file);
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      const fail = () => { URL.revokeObjectURL(url); reject(new Error("Vidéo illisible par ce navigateur.")); };
      v.onerror = fail;
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 2); };
      v.onseeked = () => resolve({ v, w: v.videoWidth, h: v.videoHeight, url });
      setTimeout(fail, 20000);
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
      case "image": {
        const { img, w, h, url } = await loadImage(file);
        try { return one(await convertCanvasSource(img, w, h, to, o, base), to); }
        finally { URL.revokeObjectURL(url); }
      }
      case "video": {
        if (to === "wav") return one(await toWav(file), "wav");
        const { v, w, h, url } = await videoFrame(file);
        try { return one(await convertCanvasSource(v, w, h, to, o, base), to); }
        finally { URL.revokeObjectURL(url); }
      }
      case "audio":
        return one(await toWav(file), "wav");

      case "sheet": {
        const X = await lib("xlsx");
        const e = extOf(file.name);
        const wb = e === "csv" || e === "tsv"
          ? X.read(await file.text(), { type: "string", FS: e === "tsv" ? "\t" : undefined, raw: false })
          : X.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        return sheetOut(X, wb, to, base);
      }
      case "json":
      case "yaml":
      case "xml": {
        const text = await file.text();
        let data;
        if (g.id === "json") { try { data = JSON.parse(text); } catch (err) { throw new Error("JSON invalide : " + err.message); } }
        else if (g.id === "yaml") data = (await lib("yaml")).load(text);
        else data = parseXml(text);
        if (to === "json") return one(JSON.stringify(data, null, 2) + "\n", "json");
        if (to === "yaml") return one((await lib("yaml")).dump(data, { lineWidth: 120 }), "yaml");
        if (to === "xml") return one(toXml(data, "root"), "xml");
        const X = await lib("xlsx");
        const ws = X.utils.json_to_sheet(flatRows(data));
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, "Données");
        return sheetOut(X, wb, to, base);
      }

      case "markdown": {
        const md = await file.text();
        const html = (await lib("marked")).parse(md);
        if (to === "html") return one(htmlDoc(base, html), "html");
        if (to === "txt") return one(htmlToText(html), "txt");
        if (to === "pdf") return one(await textToPdf(htmlToText(html), base), "pdf");
        break;
      }
      case "html": {
        const html = await file.text();
        if (to === "md") return one(await htmlToMd(html), "md");
        if (to === "txt") return one(htmlToText(html), "txt");
        if (to === "pdf") return one(await textToPdf(htmlToText(html), base), "pdf");
        break;
      }
      case "text": {
        const txt = await file.text();
        if (to === "pdf") return one(await textToPdf(txt, base), "pdf");
        if (to === "html") return one(htmlDoc(base, `<pre>${esc(txt)}</pre>`), "html");
        if (to === "md") return one(txt, "md");
        break;
      }
      case "docx": {
        const M = await lib("mammoth");
        const buf = await file.arrayBuffer();
        if (to === "txt" || to === "pdf") {
          const { value } = await M.extractRawText({ arrayBuffer: buf });
          return to === "txt" ? one(value, "txt") : one(await textToPdf(value, base), "pdf");
        }
        const { value: html } = await M.convertToHtml({ arrayBuffer: buf });
        if (to === "html") return one(htmlDoc(base, html), "html");
        if (to === "md") return one(await htmlToMd(html), "md");
        break;
      }
      case "pdf": {
        const P = await pdfjs();
        const pdf = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        try {
          if (to === "txt") {
            let out = "";
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const tc = await page.getTextContent();
              let line = "";
              for (const it of tc.items) { line += it.str + (it.hasEOL ? "\n" : ""); }
              out += line.trim() + (i < pdf.numPages ? "\n\n" : "\n");
            }
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
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            const b = await canvasBlob(c, to === "png" ? "image/png" : "image/jpeg", o.quality);
            const name = pdf.numPages === 1 ? `${base}.${to}` : `${base}-page-${String(i).padStart(pad, "0")}.${to}`;
            files.push({ name, blob: b });
          }
          return files;
        } finally { pdf.destroy(); }
      }
    }
    throw new Error("Conversion non disponible.");
  }

  function sheetOut(X, wb, to, base) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const one = (data, ext) => [{ name: `${base}.${ext}`, blob: blobOf(data, ext) }];
    switch (to) {
      case "xlsx": return one(X.write(wb, { bookType: "xlsx", type: "array" }), "xlsx");
      case "ods": return one(X.write(wb, { bookType: "ods", type: "array" }), "ods");
      case "csv": return one("﻿" + X.utils.sheet_to_csv(ws), "csv");
      case "tsv": return one("﻿" + X.utils.sheet_to_csv(ws, { FS: "\t" }), "tsv");
      case "json": return one(JSON.stringify(X.utils.sheet_to_json(ws, { defval: "" }), null, 2) + "\n", "json");
      case "html": return one(htmlDoc(base, X.utils.sheet_to_html(ws, { header: "", footer: "" }).replace(/^[\s\S]*?<body>|<\/body>[\s\S]*$/g, "")), "html");
      case "md": return one(rowsToMd(X.utils.sheet_to_json(ws, { header: 1, defval: "" })), "md");
      case "xml": return one(toXml(X.utils.sheet_to_json(ws, { defval: "" }).map((r) => { const o = {}; for (const k in r) o[xmlName(k)] = r[k]; return o; }), "rows").replace(/<item>/g, "<row>").replace(/<\/item>/g, "</row>"), "xml");
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
