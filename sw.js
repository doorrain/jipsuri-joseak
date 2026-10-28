// 앱 화면 파일을 저장해 두어 현장에서 신호가 약해도 열리게 합니다.
// 파일을 고친 뒤에는 CACHE 숫자를 올려야 휴대폰에 새 버전이 들어갑니다.
const CACHE = 'joseak-v7';
const SHELL = [
  './', './index.html', './css/style.css', './css/joseak.css', './manifest.webmanifest', './config.js',
  './js/app.js', './js/store.js', './js/seed.js', './js/util.js', './js/color.js', './js/visual.js',
  './js/photos.js', './js/ai.js', './js/icons.js', './js/solver.js',
  './icons/icon.svg', './icons/icon-192.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('joseak-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
// 인터넷이 되면 항상 최신 파일, 안 되면 저장해 둔 파일
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.href);
  if (!cacheable || /supabase\.co/.test(url.href)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
