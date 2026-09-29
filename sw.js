// Κρατάει τα αρχεία του app για να ανοίγει γρήγορα και χωρίς internet.
// Αλλάζεις τον αριθμό σε κάθε νέα έκδοση ώστε να ανανεωθεί η cache.
const CACHE = 'household-v24';
// Η σύνδεση (διεύθυνση + PIN) για τις ειδοποιήσεις· τη γράφει το app όταν συνδέεσαι.
const CFG_CACHE = 'household-cfg';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icons/icon-192.png?v=2', 'icons/icon-512.png?v=2', 'icons/apple-touch-icon.png?v=2', 'icons/favicon.png?v=2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CFG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Chart.js από το CDN: πρώτα cache.
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }

  // Αρχεία του app: πρώτα δίκτυο (για να φαίνονται οι αλλαγές), αλλιώς cache.
  // no-cache: ο browser ρωτάει πάντα τον server αν άλλαξε κάτι, ώστε να μη μένουν μισά παλιά αρχεία.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
  }
});

// ---------- ειδοποιήσεις ----------
// Ο server στέλνει ένα «ξύπνα» χωρίς κείμενο· το μήνυμα (τι έμεινε για σήμερα) το ζητάμε από τον server.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let title = '📝 Household Desk', body = 'Πέρασες τις σημερινές σου κινήσεις;';
    try {
      const hit = await (await caches.open(CFG_CACHE)).match('cfg');
      const cfg = hit ? await hit.json() : null;
      if (cfg && cfg.url && cfg.pin) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(cfg.url, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'reminder', pin: cfg.pin }), signal: ctrl.signal,
        });
        clearTimeout(timer);
        const j = await res.json();
        if (j.ok) { title = j.data.title; body = j.data.body; }
      }
    } catch (err) { /* χωρίς internet ή αργό: μένει το γενικό μήνυμα */ }
    await self.registration.showNotification(title, {
      body, icon: 'icons/icon-192.png?v=2', badge: 'icons/favicon.png?v=2', tag: 'daily', data: { url: './' },
    });
  })());
});

// Πάτημα στην ειδοποίηση: ανοίγει (ή φέρνει μπροστά) το app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.includes(self.registration.scope));
    if (open) return open.focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
