/* HEREMS_PLUS — Online-only. Every refresh fetches fresh from network. No offline fallback. */
const CACHE = 'herems-plus-v2.1.14-R220-secrets-finance';

const ASSETS = [
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', 
  './icons/debt-icon.png'
];

/* Install: cache icons only (index.html is NEVER cached) */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u =>
    fetch(new Request(u, { cache: 'reload' })).then(r => { 
      if(r && r.ok) return c.put(u, r.clone()); 
    }).catch(()=>{})
  ))).then(() => self.skipWaiting()));
});

/* Activate: clean old caches */
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

/* Fetch: ALWAYS from network. Never serve stale index.html. */
self.addEventListener('fetch', e => {
  const req = e.request;
  
  /* Navigation (page load/refresh): ALWAYS fetch from network — no cache fallback */
  if(req.mode === 'navigate'){
    e.respondWith(fetch(req).catch(() => new Response(
      '<html><body style="font-family:system-ui;text-align:center;padding:40px"><h1>🌐 No internet connection</h1><p>HEREMS_PLUS requires an internet connection. Please connect and refresh.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    )));
    return;
  }
  
  /* Icons: cache-first (these don't change often) */
  e.respondWith(caches.match(req).then(hit => {
    if(hit) return hit;
    return fetch(req).then(r => {
      if(r && r.ok && r.type === 'basic'){
        caches.open(CACHE).then(c => c.put(req, r.clone())).catch(()=>{});
      }
      return r;
    }).catch(() => Response.error());
  }));
});