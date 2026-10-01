/* Service worker de Mue : fonctionnement hors connexion + réception de fichiers partagés. */
const VERSION = "mue-v3";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.svg",
];
// Outils de conversion, mis en cache au premier usage (ou d'un coup quand l'appli est installée)
const LIBS = [
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js",
  "https://cdn.jsdelivr.net/npm/turndown@7.1.2/lib/turndown.browser.umd.js",
  "https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js",
  "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/docx-preview@0.3.6/dist/docx-preview.min.js",
  "https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "mue-libs" && k !== "mue-share").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "warm") {
    e.waitUntil(caches.open("mue-libs").then((c) =>
      Promise.all(LIBS.map((u) => c.match(u).then((hit) => hit || fetch(u, { mode: "cors" }).then((r) => r.ok && c.put(u, r)).catch(() => {}))))
    ));
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Fichiers envoyés vers Mue depuis le menu Partager d'Android
  if (req.method === "POST" && url.pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      const data = await req.formData();
      const cache = await caches.open("mue-share");
      let i = 0;
      for (const f of data.getAll("files")) {
        if (!(f instanceof File)) continue;
        await cache.put(new Request("./shared/" + Date.now() + "-" + i++), new Response(f, {
          headers: { "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name || "fichier") },
        }));
      }
      return Response.redirect("./?share=1", 303);
    })());
    return;
  }
  if (req.method !== "GET") return;

  // Bibliothèques et polices : cache d'abord, réseau ensuite
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open("mue-libs").then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Pages et fichiers du site : réseau d'abord pour rester à jour, cache si hors connexion
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
    );
  }
});
