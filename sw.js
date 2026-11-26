/* SunMirror service worker: offline app shell */
const CACHE='sunmirror-v3';
const ASSETS=['./','index.html','manifest.webmanifest','lib/three.min.js','lib/OrbitControls.js','lib/momentkh.js',
'fonts/kp-khmer-400.woff2','fonts/kp-khmer-600.woff2','fonts/kp-khmer-700.woff2','fonts/kp-latin-400.woff2','fonts/kp-latin-600.woff2','fonts/kp-latin-700.woff2',
'icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','icons/favicon-32.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  if(e.request.mode==='navigate'){ // network first for the page, so updates arrive
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(ca=>ca.put('index.html',c));return r}).catch(()=>caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c))}return r})));
});
