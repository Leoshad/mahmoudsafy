'use strict';
// Deliberately no fetch handler or private-content cache.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function destination(target){
 if(!target||!['chat','space','together'].includes(target.tab))return '/';
 const clean={tab:target.tab};for(const key of ['message','activity','post','comment','caseId','session','invitation'])if(typeof target[key]==='string'&&/^[\w-]{1,80}$/.test(target[key]))clean[key]=target[key];
 if(['ocho','domino','draw','media','court','race'].includes(target.game))clean.game=target.game;
 return '/?notice='+encodeURIComponent(JSON.stringify(clean));
}
async function receipt(data,result){
 if(!data?.tag)return;
 try{
  if(data.receiptToken){await fetch('/api/push-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:data.receiptToken,result}),signal:AbortSignal.timeout(3000)});return;}
  const subscription=await self.registration.pushManager?.getSubscription();
  await fetch('/api/notifications/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag:data.tag,result,createdAt:data.createdAt,endpoint:subscription?.endpoint}),signal:AbortSignal.timeout(3000)});
 }catch{}
}
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{data={};}
 if(!data||typeof data!=='object')data={};
 const arrival=receipt(data,'received');
 let reason=null,verified=false,foreground=false;
 if(!['Mahmoud','Safy'].includes(data.owner)||!Number.isFinite(data.expires))reason='invalid-payload';
 else if(data.expires<Date.now())reason='expired';
 try{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});foreground=windows.some(w=>w.visibilityState==='visible'&&w.focused===true);}catch{}
 if(!reason){
  try{
   const r=await fetch('/api/notifications',{cache:'no-store',signal:AbortSignal.timeout(1500)});
   if(r.status===401)reason='auth-required';
   else if(r.ok){const status=await r.json();if(status.who!==data.owner)reason='wrong-account';else verified=true;}
   else reason='auth-unavailable';
  }catch{reason='auth-unavailable';}
 }
 // Never consume a push silently: WebKit can revoke the subscription.
 // Foreground devices are filtered on the server. A foreground race is silent,
 // but still visible; account failures use generic content and no private link.
 const quiet=!!data.quiet||foreground||!!reason;
 const options={body:verified?String(data.body||'You have an update.').slice(0,180):'Open Our Place to check your updates.',icon:'/icon-192.png',tag:String(data.tag||'our-place').slice(0,64),renotify:!quiet,data:{url:verified?destination(data.target):'/'}};
 if(quiet)options.silent=true;else options.vibrate=[180];
 try{
  await self.registration.showNotification('Our Place',options);
  await Promise.all([arrival,...(reason?[receipt(data,reason)]:[]),...(foreground?[receipt(data,'foreground')]:[])]);
  await receipt(data,'shown');
 }catch{await Promise.all([arrival,receipt(data,'display-failed')]);}
})()));
self.addEventListener('pushsubscriptionchange',event=>event.waitUntil((async()=>{
 // Preserve browser-provided rotation when supported. Foreground repair retries
 // server binding if this fetch fails offline. Never request permission here.
 try{
  let sub=event.newSubscription;
  if(!sub&&event.oldSubscription?.options)sub=await self.registration.pushManager.subscribe(event.oldSubscription.options);
  if(sub)await fetch('/api/notifications/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...sub.toJSON(),previousEndpoint:event.oldSubscription?.endpoint}),signal:AbortSignal.timeout(10000)});
 }catch{}
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
