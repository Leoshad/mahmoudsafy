'use strict';
// Deliberately no fetch handler or private-content cache.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function destination(target){
 if(!target||!['chat','space','together'].includes(target.tab))return '/';
 const clean={tab:target.tab};for(const key of ['message','activity','post','caseId'])if(typeof target[key]==='string'&&/^[\w-]{1,80}$/.test(target[key]))clean[key]=target[key];
 if(['ocho','domino','draw','media','court'].includes(target.game))clean.game=target.game;
 return '/?notice='+encodeURIComponent(JSON.stringify(clean));
}
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 if(!data||!['Mahmoud','Safy'].includes(data.owner)||!Number.isFinite(data.expires)||data.expires<Date.now())return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 if(windows.some(w=>w.visibilityState==='visible'))return;
 // Also check account and other foreground devices immediately before displaying.
 try{const r=await fetch('/api/notifications',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(r.status===401)return;if(r.ok){const status=await r.json();if(status.who!==data.owner||status.visible)return;}}catch{}
 const options={body:String(data.body||'You have an update.').slice(0,180),icon:'/icon-192.png',tag:String(data.tag||'our-place').slice(0,64),renotify:false,data:{url:destination(data.target)}};
 if(data.quiet)options.silent=true;else options.vibrate=[180];
 await self.registration.showNotification('Our Place',options);
})()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
 const raw=event.notification.data?.url;const url=new URL(typeof raw==='string'?raw:'/',self.location.origin);
 if(url.origin!==self.location.origin||url.pathname!=='/')return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const app=windows.find(w=>new URL(w.url).pathname==='/');
 if(app){await app.focus();app.postMessage({type:'notification-open',url:url.href});}else await self.clients.openWindow(url.href);
 })());
});
