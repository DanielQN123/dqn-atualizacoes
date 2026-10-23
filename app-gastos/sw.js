// Permite abrir o app sem internet. Ao mudar qualquer arquivo, aumente a versão.
const CACHE = "gastos-v7";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/logo-dqn.png",
  "./nuvem.js",
  "./supabase-config.js",
  "./vendor/supabase.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Busca na rede primeiro (pega atualizações); sem internet, usa a cópia guardada.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Avisos de vencimento (enviados pela Edge Function gastos-push do Supabase).
self.addEventListener("push", e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch {}
  const d = msg.data || msg, n = msg.notification || {};
  e.waitUntil(self.registration.showNotification(d.titulo || n.title || "Meus Gastos", {
    body: d.corpo || n.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.tag || "vencimentos",
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(janelas => {
    const aberta = janelas.find(w => new URL(w.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    return aberta ? aberta.focus() : self.clients.openWindow(e.notification.data?.url || "./");
  }));
});
