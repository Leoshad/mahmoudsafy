(()=>{'use strict';
let who=null,registration=null,bound=null,pending=null,busy=false,epoch=0,sequence=0,presenceFlight=null,realtime=false,realtimeAt=0,bindFlight=null,bindAfter=0;
const client=crypto.randomUUID(),supported='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
const $=s=>document.querySelector(s),dialog=$('#notifications-dialog'),status=$('#notifications-status'),enable=$('#notifications-enable'),disable=$('#notifications-disable'),testButton=$('#notifications-test');
const iphone=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const ready=supported?navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready).then(r=>(registration=r,r)).catch(()=>null):Promise.resolve(null);
async function request(path,data,keepalive=false,signal){const r=await fetch('/api/notifications'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,keepalive,signal:signal||AbortSignal.timeout(10000)});if(!r.ok){const v=await r.json();throw Error(v.error||'Could not update notifications. Try again.');}return r.json();}
// hasFocus includes focused descendants (including the embedded player).
// Do not infer focus from a remembered iframe or fullscreen element.
function foreground(){return document.visibilityState==='visible'&&document.hasFocus()&&navigator.onLine!==false;}
function presence(){
 const visible=foreground()&&realtime&&Date.now()-realtimeAt<5000;if(foreground())clearShown().catch(()=>{});if(!who)return;
 if(presenceFlight?.visible===visible)return;
 presenceFlight?.controller.abort();const controller=new AbortController(),current=epoch,owner=who,order=++sequence;
 const flight={controller,visible};presenceFlight=flight;const timer=setTimeout(()=>controller.abort(),4000);
 request('/presence',{client,visible,sequence:order},true,controller.signal).then(data=>{
  if(current===epoch&&owner===who&&order===sequence&&visible&&foreground()&&Array.isArray(data.online))window.dispatchEvent(new CustomEvent('our-place-presence',{detail:data}));
 }).catch(()=>{}).finally(()=>{clearTimeout(timer);if(presenceFlight===flight)presenceFlight=null;});
}
async function clearShown(){const r=await ready;if(r)for(const n of await r.getNotifications())n.close();}
async function refresh(){
 const r=await ready,sub=r?await r.pushManager.getSubscription():null;
 const device=sub?await request('/status',{endpoint:sub.endpoint}):null,registered=!!device?.registered;
 testButton.hidden=!(sub&&registered);testButton.disabled=busy;enable.hidden=!!sub&&registered;disable.hidden=!sub;enable.disabled=busy||!supported||(iphone&&!installed)||Notification.permission==='denied';disable.disabled=busy;
 status.textContent=iphone&&!installed?'On iPhone, add Our Place to your Home Screen from Safari. Open that icon, then enable notifications here.':!supported?'This browser does not support notifications. Open Our Place in an up-to-date browser.':Notification.permission==='denied'?'Notifications are blocked. Allow them in your phone or browser settings, then return here.':sub&&!registered?'This device is not connected for notifications yet. Tap Enable to reconnect.':sub?'On for this device. You’ll only be alerted while Our Place is in the background.':'Off for this device.';
 if(sub&&registered&&device.delivery){const d=device.delivery;
  status.textContent+=' '+(d.result==='shown'?'Last notification: this browser confirmed display. If it was silent, check notification sound and Do Not Disturb on this phone.':d.result==='foreground'?'Last notification was muted because Our Place was open on this device.':d.result==='display-failed'?'This browser could not display the last notification. Check this phone’s notification permissions.':d.result==='expired'?'The last notification reached this device too late. Check background activity and battery restrictions.':d.accepted?'Last notification was accepted for delivery, but this device has not confirmed display. Run Test notification, lock your phone, then return here to check.':'No delivery confirmation yet. Run Test notification and leave Our Place.');
 }
}
$('#notifications-open').onclick=()=>{dialog.showModal();refresh().catch(e=>status.textContent=e.message);};
$('#notifications-close').onclick=()=>dialog.close();
enable.onclick=async()=>{
 if(busy||!who)return;busy=true;enable.disabled=true;const current=epoch;let stage='permission';
 try{
  // Request permission directly from the tap, including on iPhone.
  const permission=await Notification.requestPermission();if(permission!=='granted'){await refresh();return;}
  stage='worker';const r=await ready;if(!r)throw Error('Reload Our Place to start notifications.');
  stage='server';const config=await request('');if(current!==epoch)return;
  const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-config.publicKey.length%4)%4)),c=>c.charCodeAt(0));
  stage='device';let sub=await r.pushManager.getSubscription();if(current!==epoch)return;
  // Missing server binding does not mean the browser subscription is broken.
  // Replace only an explicitly different application key, never on a network failure.
  const oldKey=sub?.options?.applicationServerKey;
  if(oldKey){const previous=new Uint8Array(oldKey);if(previous.length!==bytes.length||previous.some((v,i)=>v!==bytes[i])){await sub.unsubscribe();sub=null;}}
  const subscribe=()=>r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  try{sub=sub||await subscribe();}
  catch(first){
   if(first?.name!=='AbortError')throw first;
   sub=await r.pushManager.getSubscription();if(current!==epoch)return;
   sub=sub||await subscribe();
  }
  if(current!==epoch)return;
  stage='save';await request('/subscribe',sub.toJSON());if(current!==epoch)return;
  bound=who;bindAfter=Date.now()+60000;stage='verify';await refresh();
 }catch(e){
  if(current!==epoch)return;
  const detail=String(e?.message||'Please try again.').slice(0,220),code=String(e?.name||'Error');
  status.textContent=Notification.permission==='denied'?'Notifications are blocked. Allow them in your phone or browser settings, then return here.':stage==='device'?'Your browser could not register this device for push notifications ('+code+'): '+detail:stage==='save'?'Your device subscription is saved in this browser, but Our Place could not connect it yet. Tap Enable to retry. '+detail:'Could not enable notifications ('+stage+'): '+detail;
 }finally{busy=false;enable.disabled=!supported||Notification.permission==='denied';disable.disabled=false;}
};
disable.onclick=async()=>{if(busy)return;busy=true;disable.disabled=true;try{const r=await ready,sub=r&&await r.pushManager.getSubscription();if(sub){await request('/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}bound=null;await clearShown();await refresh();}catch(e){status.textContent=e.message;}finally{busy=false;disable.disabled=false;}};
testButton.onclick=async()=>{
 if(busy||!who)return;busy=true;testButton.disabled=true;
 try{const r=await ready,sub=r&&await r.pushManager.getSubscription();if(!sub)throw Error('Enable notifications on this device first.');await request('/test',{endpoint:sub.endpoint});status.textContent='Test scheduled. Leave Our Place now; it will be sent in 5 seconds.';}catch(e){status.textContent=e.message;}finally{busy=false;testButton.disabled=false;}
};
async function bind(){
 if(!who||busy||bindFlight||navigator.onLine===false||Date.now()<bindAfter)return;
 const current=epoch,name=who;bindAfter=Date.now()+15000;
 const flight=(async()=>{const r=await ready;if(!r||current!==epoch)return;const sub=await r.pushManager.getSubscription();if(current!==epoch)return;
  if(sub){const status=await request('/status',{endpoint:sub.endpoint});if(current!==epoch)return;if(!status.registered)await request('/subscribe',sub.toJSON());if(current!==epoch)return;bound=name;}
  bindAfter=Date.now()+60000;
 })();bindFlight=flight;try{await flight;}finally{if(bindFlight===flight)bindFlight=null;}
}
function recoverBinding(){if(!document.hidden){bindAfter=0;bind().catch(()=>{});if(dialog.open)refresh().catch(e=>status.textContent=e.message);}}
window.addEventListener('online',recoverBinding);window.addEventListener('focus',recoverBinding);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)recoverBinding();});
setInterval(()=>{if(who&&!document.hidden)bind().catch(()=>{});},15000);
function receive(url){try{const u=new URL(url,location.origin);if(u.origin!==location.origin)return;const value=JSON.parse(u.searchParams.get('notice'));if(value&&['chat','space','together'].includes(value.tab))pending=value;}catch{}deliver();}
function deliver(){if(who&&pending){const value=pending;pending=null;window.dispatchEvent(new CustomEvent('our-place-notification',{detail:value}));}}
if(supported)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='notification-open')receive(e.data.url);});
window.addEventListener('focus',presence);window.addEventListener('blur',()=>queueMicrotask(presence));window.addEventListener('online',presence);window.addEventListener('offline',presence);document.addEventListener('fullscreenchange',()=>queueMicrotask(presence));
document.addEventListener('visibilitychange',presence);window.addEventListener('pageshow',presence);window.addEventListener('pagehide',()=>{if(who)request('/presence',{client,visible:false,sequence:++sequence},true).catch(()=>{});});
setInterval(()=>{if(who&&!document.hidden)presence();},1500);
window.OurNotifications={connection(ok){const changed=realtime!==!!ok;realtime=!!ok;if(ok)realtimeAt=Date.now();if(changed)presence();},refreshPresence:presence,sync(state){if(who!==state.who){presenceFlight?.controller.abort();presenceFlight=null;who=state.who;epoch++;bound=null;bindAfter=0;presence();bind().catch(()=>{});}deliver();},reset(){if(who)request('/presence',{client,visible:false,sequence:++sequence},true).catch(()=>{});presenceFlight?.controller.abort();presenceFlight=null;realtime=false;who=null;bound=null;bindAfter=0;epoch++;dialog.close();clearShown().catch(()=>{});}};
receive(location.href);if(new URL(location.href).searchParams.has('notice'))history.replaceState(history.state,'','/');
})();

