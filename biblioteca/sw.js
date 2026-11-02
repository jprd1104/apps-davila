// Service worker do app Biblioteca D'Ávila: funciona offline e atualiza sozinho.
const CACHE="biblioteca-v1";
const SHELL=["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "../shared/store.js", "../shared/config.js", "./acervo.json"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("biblioteca-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  // Firebase e Google: sempre pela rede (o próprio SDK guarda o cache dos dados).
  if(u.origin!==location.origin&&!u.hostname.endsWith("fonts.googleapis.com")&&!u.hostname.endsWith("fonts.gstatic.com"))return;
  // Rede primeiro para os arquivos do app (pega atualizações), cache se estiver offline.
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("./index.html"))));
});
