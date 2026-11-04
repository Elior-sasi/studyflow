const CACHE='studyflow-v2';
const CORE=['/','/index.html','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok&&response.type==='basic'){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}return response}catch{const cached=await caches.match(request);if(cached)return cached;if(request.mode==='navigate'){const shell=await caches.match('/index.html');if(shell)return shell}return Response.error()}})())});
