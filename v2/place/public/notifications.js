(()=>{'use strict';
let who=null,registration=null,bound=null,pending=null,busy=false,epoch=0,sequence=0;
const client=crypto.randomUUID(),supported='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
const $=s=>document.querySelector(s),dialog=$('#notifications-dialog'),status=$('#notifications-status'),enable=$('#notifications-enable'),disable=$('#notifications-disable'),testButton=$('#notifications-test');
const iphone=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const ready=supported?navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready).then(r=>(registration=r,r)).catch(()=>null):Promise.resolve(null);
async function request(path,data,keepalive=false){const r=await fetch('/api/notifications'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,keepalive});if(!r.ok){const v=await r.json();throw Error(v.error||'Could not update notifications. Try again.');}return r.json();}
function presence(){if(who)request('/presence',{client,visible:document.visibilityState==='visible',sequence:++sequence},true).catch(()=>{});if(document.visibilityState==='visible')clearShown();}
async function clearShown(){const r=await ready;if(r)for(const n of await r.getNotifications())n.close();}
async function refresh(){
 const r=await ready,sub=r?await r.pushManager.getSubscription():null;
 const registered=sub?(await request('/status',{endpoint:sub.endpoint})).registered:false;
 testButton.hidden=!(sub&&registered);testButton.disabled=busy;enable.hidden=!!sub&&registered;disable.hidden=!sub;enable.disabled=busy||!supported||(iphone&&!installed)||Notification.permission==='denied';disable.disabled=busy;
 status.textContent=iphone&&!installed?'On iPhone, add Our Place to your Home Screen from Safari. Open that icon, then enable notifications here.':!supported?'This browser does not support notifications. Open Our Place in an up-to-date browser.':Notification.permission==='denied'?'Notifications are blocked. Allow them in your phone or browser settings, then return here.':sub&&!registered?'This device is not connected for notifications yet. Tap Enable to reconnect.':sub?'On for this device. You’ll only be alerted while Our Place is in the background.':'Off for this device.';
}
$('#notifications-open').onclick=()=>{dialog.showModal();refresh().catch(e=>status.textContent=e.message);};
$('#notifications-close').onclick=()=>dialog.close();
enable.onclick=async()=>{
 if(busy||!who)return;busy=true;enable.disabled=true;const current=epoch;
 try{
  // Permission must be requested directly from the tap, including on iPhone.
  const permission=await Notification.requestPermission();if(permission!=='granted'){await refresh();return;}
  const r=await ready;if(!r)throw Error('Notifications could not start. Reload Our Place and try again.');
  const config=await request('');const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-config.publicKey.length%4)%4)),c=>c.charCodeAt(0));
  let sub=await r.pushManager.getSubscription();sub=sub||await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  if(current!==epoch){await sub.unsubscribe();return;}await request('/subscribe',sub.toJSON());bound=who;await refresh();
 }catch(e){status.textContent=e.message;}finally{busy=false;enable.disabled=!supported||Notification.permission==='denied';disable.disabled=false;}
};
disable.onclick=async()=>{if(busy)return;busy=true;disable.disabled=true;try{const r=await ready,sub=r&&await r.pushManager.getSubscription();if(sub){await request('/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}bound=null;await clearShown();await refresh();}catch(e){status.textContent=e.message;}finally{busy=false;disable.disabled=false;}};
testButton.onclick=async()=>{
 if(busy||!who)return;busy=true;testButton.disabled=true;
 try{const r=await ready,sub=r&&await r.pushManager.getSubscription();if(!sub)throw Error('Enable notifications on this device first.');await request('/test',{endpoint:sub.endpoint});status.textContent='Test scheduled. Leave Our Place now; it will be sent in 5 seconds.';}catch(e){status.textContent=e.message;}finally{busy=false;testButton.disabled=false;}
};
async function bind(){const current=epoch,name=who,r=await ready;if(!name||!r||bound===name)return;const sub=await r.pushManager.getSubscription();if(sub&&current===epoch){await request('/subscribe',sub.toJSON());if(current===epoch)bound=name;}}
function receive(url){try{const u=new URL(url,location.origin);if(u.origin!==location.origin)return;const value=JSON.parse(u.searchParams.get('notice'));if(value&&['chat','space','together'].includes(value.tab))pending=value;}catch{}deliver();}
function deliver(){if(who&&pending){const value=pending;pending=null;window.dispatchEvent(new CustomEvent('our-place-notification',{detail:value}));}}
if(supported)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='notification-open')receive(e.data.url);});
document.addEventListener('visibilitychange',presence);window.addEventListener('pageshow',presence);window.addEventListener('pagehide',()=>{if(who)request('/presence',{client,visible:false,sequence:++sequence},true).catch(()=>{});});
setInterval(()=>{if(who&&!document.hidden)presence();},2000);
window.OurNotifications={sync(state){if(who!==state.who){who=state.who;epoch++;bound=null;presence();bind().catch(()=>{});}deliver();},reset(){if(who)request('/presence',{client,visible:false,sequence:++sequence},true).catch(()=>{});who=null;bound=null;epoch++;dialog.close();clearShown().catch(()=>{});}};
receive(location.href);if(new URL(location.href).searchParams.has('notice'))history.replaceState(history.state,'','/');
})();
