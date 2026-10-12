/* Cache di Friday: i file pesanti (voce, riconoscimento voce) si scaricano una volta sola. */
var V="friday-v2";
var SHELL=["./","index.html","hub.html","bridge.js","voce.js","spk.js","ascolto.js","manifest.webmanifest","icon-192.png","icon-512.png"];

self.addEventListener("install",function(e){
  /* ogni file a parte: se una manca, il resto si installa lo stesso (il sito deve restare installabile) */
  e.waitUntil(caches.open(V).then(function(c){ return Promise.all(SHELL.map(function(u){ return c.add(u).catch(function(){}); })); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate",function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k!==V; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener("fetch",function(e){
  var r=e.request;
  if(r.method!=="GET") return;
  var u=new URL(r.url);
  if(u.origin!==location.origin) return;
  var pesante=/\/(data|ort|ph)\//.test(u.pathname);
  if(pesante){
    /* file pesanti: prima la copia salvata */
    e.respondWith(caches.match(r).then(function(h){ return h||fetch(r).then(function(n){ if(n.ok){ var c=n.clone(); caches.open(V).then(function(x){ x.put(r,c); }); } return n; }); }));
  } else {
    /* pagina e script: prima la rete (cosi gli aggiornamenti arrivano), copia salvata se offline */
    e.respondWith(fetch(r).then(function(n){ if(n.ok){ var c=n.clone(); caches.open(V).then(function(x){ x.put(r,c); }); } return n; }).catch(function(){ return caches.match(r); }));
  }
});
