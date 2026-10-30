import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createECDH,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Store} from '../store.mjs';
import {PushNotifications,validateSubscription} from '../push.mjs';
import {attentionEvents} from '../push-events.mjs';
import {createApp} from '../server.mjs';
const secret='test secret with more than thirty two characters';
function subscription(id='a'){const key=createECDH('prime256v1');key.generateKeys();return {endpoint:'https://fcm.googleapis.com/fcm/send/'+id,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};}
function fixture(t){const store=new Store(':memory:');t.after(()=>store.close());let now=Date.now(),sent=[];for(const name of ['Mahmoud','Safy'])store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(name,now+86400000);const push=new PushNotifications(store,{secret,origin:'https://example.test',now:()=>now,send:async(s,b,o)=>sent.push({sub:s,body:JSON.parse(b),options:o})});return {store,push,sent,advance:n=>now+=n};}
const event=(to='Safy',key=randomUUID())=>({key,to,body:'A new message.',kind:'message',target:{tab:'chat',message:key}});
test('subscriptions reject arbitrary hosts, malformed keys and non-HTTPS endpoints',()=>{const valid=subscription();assert.deepEqual(validateSubscription(valid),valid);for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://fcm.googleapis.com.attacker.test/x','https://fcm.googleapis.com:8000/x','https://user@fcm.googleapis.com/x'])assert.throws(()=>validateSubscription({...valid,endpoint}));assert.throws(()=>validateSubscription({...valid,keys:{p256dh:'x',auth:'x'}}));});
test('messages reach every registered device even while another device is foreground',async t=>{
 const {push,store,sent,advance}=fixture(t);store.db.prepare('INSERT INTO sessions VALUES(?,?)').run('desktop',Date.now()+86400000);push.subscribe('Safy','Safy',subscription('phone'));push.subscribe('Safy','desktop',subscription('desktop'));
 const client=randomUUID();push.presence('Safy','desktop',{client,visible:true,sequence:1});const e=event();push.enqueue(e);push.enqueue(e);
 push.presence('Safy','desktop',{client,visible:true,sequence:2});advance(400);await push.drain();await push.drain();assert.equal(sent.length,1);assert.ok(sent[0].sub.endpoint.endsWith('phone'));assert.ok(sent.every(x=>x.body.deviceOnly&&x.options.urgency==='high'));
});
test('expired alerts and logged-out sessions cannot deliver',async t=>{const {push,sent,advance}=fixture(t);push.subscribe('Safy','Safy',subscription());push.enqueue(event());advance(3600001);await push.drain();assert.equal(sent.length,0);push.enqueue(event());push.logout('Safy');advance(2000);await push.drain();assert.equal(sent.length,0);});
test('keys and endpoints are encrypted at rest; restart keeps the same VAPID identity',t=>{const {push,store}=fixture(t),sub=subscription();push.subscribe('Safy','Safy',sub);const raw=store.db.prepare('SELECT body FROM push_subscriptions').get().body;assert.ok(!raw.includes(sub.endpoint));assert.deepEqual(push.open(raw),sub);const again=new PushNotifications(store,{secret,origin:'https://example.test'});assert.equal(again.vapid.publicKey,push.vapid.publicKey);assert.ok(!store.db.prepare('SELECT body FROM push_meta').get().body.includes(push.vapid.privateKey));});
test('retries do not notify successful devices again, and expired subscriptions are removed',async t=>{const {push,store,advance}=fixture(t);push.subscribe('Safy','Safy',subscription('good'));push.subscribe('Safy','Safy',subscription('retry'));let good=0,retry=0;push.send=async sub=>{if(sub.endpoint.endsWith('good'))good++;else if(++retry===1)throw Object.assign(Error(),{statusCode:503});};push.enqueue(event());advance(2000);await push.drain();advance(16000);await push.drain();assert.equal(good,1);assert.equal(retry,2);push.send=async()=>{throw Object.assign(Error(),{statusCode:410});};push.enqueue(event());advance(2000);await push.drain();assert.equal(store.db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);});
test('chat scan skips history and own actions, waits for completed Echo replies',async t=>{const store=new Store(':memory:');t.after(()=>store.close());store.message({id:randomUUID(),author:'Mahmoud',text:'Old private text'});let now=Date.now(),sent=[];store.db.prepare('INSERT INTO sessions VALUES(?,?)').run('s',now+86400000);const push=new PushNotifications(store,{secret,origin:'https://example.test',now:()=>now,send:async(s,b)=>sent.push(JSON.parse(b))});push.subscribe('Safy','s',subscription());push.scan();now+=2000;await push.drain();assert.equal(sent.length,0);store.message({id:randomUUID(),author:'Safy',text:'Own'});push.scan('Safy');now+=2000;await push.drain();assert.equal(sent.length,0);const id=randomUUID();store.message({id,author:'Echo',text:'secret text',status:'streaming'});push.scan();now+=2000;await push.drain();assert.equal(sent.length,0);store.db.prepare("UPDATE messages SET status='sent' WHERE id=?").run(id);push.scan();now+=2000;await push.drain();assert.equal(sent.length,1);assert.ok(!JSON.stringify(sent).includes('secret text'));});
test('event policy: invitations and turns need attention; strokes and own actions do not; likes are quiet',()=>{const before={items:[{id:'p',by:'Mahmoud',comments:[],likes:[]}],draw:{strokes:[]}},after=structuredClone(before);after.draw.strokes.push({points:[1,2]});assert.deepEqual(attentionEvents(before,after,'Safy'),[]);after.items[0].likes.push('Safy');const like=attentionEvents(before,after,'Safy');assert.equal(like[0].quiet,true);assert.equal(like[0].to,'Mahmoud');after.ocho={shared:{id:'g',owner:'Mahmoud',status:'waiting'}};assert.equal(attentionEvents(before,after,'Mahmoud').find(e=>e.to==='Safy').target.game,'ocho');const active={ocho:{shared:{id:'g',owner:'Mahmoud',status:'active',turn:'Safy',revision:3}}};assert.equal(attentionEvents(after,active,'Mahmoud').filter(e=>e.to==='Safy').length,1);});
function worker({visible=false,focused=visible,remoteVisible=false,owner='Safy',statusCode=200,networkError=false}={}){
 const handlers={},shown=[],posted=[],requests=[];
 const self={location:{origin:'https://example.test'},addEventListener:(n,f)=>{handlers[n]=f;},registration:{showNotification:async(...v)=>shown.push(v)},clients:{matchAll:async()=>[{url:'https://example.test/',visibilityState:visible?'visible':'hidden',focused,focus:async()=>{},postMessage:v=>posted.push(v)}],openWindow:async u=>posted.push(u)}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Date,AbortSignal,fetch:async(path,options)=>{requests.push({path,options});if(networkError&&path==='/api/notifications')throw Error('offline');return {status:statusCode,ok:statusCode===200,json:async()=>({who:owner,visible:remoteVisible})};}});
 return {shown,posted,requests,async push(data){await new Promise((resolve,reject)=>handlers.push({data:{json:()=>data},waitUntil:p=>p.then(resolve,reject)}));},async click(url){await new Promise((resolve,reject)=>handlers.notificationclick({notification:{close(){},data:{url}},waitUntil:p=>p.then(resolve,reject)}));}};
}
test('received push always displays; unverified or expired content is replaced by a private generic fallback',async()=>{
 const data={owner:'Safy',expires:Date.now()+120000,body:'Private sender',target:{tab:'chat',message:'private-id'}};
 for(const opts of [{owner:'Mahmoud'},{statusCode:401},{statusCode:503},{networkError:true}]){
  const w=worker(opts);await w.push(data);assert.equal(w.shown.length,1);assert.equal(w.shown[0][1].body,'Open Our Place to check your updates.');assert.equal(w.shown[0][1].data.url,'/');
 }
 const expired=worker();await expired.push({...data,expires:0});assert.equal(expired.shown.length,1);assert.equal(expired.shown[0][1].data.url,'/');
 const malformed=worker();await malformed.push(null);assert.equal(malformed.shown.length,1);
 const w=worker();await w.push(data);assert.equal(w.shown.length,1);assert.deepEqual([...w.shown[0][1].vibrate],[180]);
});
test('worker keeps likes silent and notification navigation same-origin',async()=>{const w=worker();await w.push({owner:'Safy',expires:Date.now()+120000,quiet:true,target:{tab:'space',post:'abc'}});assert.equal(w.shown[0][1].silent,true);assert.equal(w.shown[0][1].vibrate,undefined);await w.click('https://evil.test/');assert.equal(w.posted.length,0);await w.click(w.shown[0][1].data.url);assert.ok(w.posted[0].url.startsWith('https://example.test/?notice='));});
test('HTTP notification endpoints require auth and same origin; expose no stored keys; logout removes registration',async t=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';const store=new Store(':memory:');const user={id:'m',email:'mahmoud@example.test',email_confirmed_at:'2026-01-01'};const server=createApp({store,origin:'http://localhost',secret,testing:true,authFetch:async url=>Response.json(url.includes('/token?')?{user,access_token:'m',refresh_token:'m',expires_in:3600}:user),pushSend:async()=>{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));store.close();});const base='http://127.0.0.1:'+server.address().port;let cookie='';const req=(path,data,origin='http://localhost')=>fetch(base+path,{method:data?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});assert.equal((await req('/api/notifications')).status,401);
 const receiptService=new PushNotifications(store,{secret,origin:'http://localhost'}),proof=receiptService.seal({purpose:'push-receipt-v1',owner:'Mahmoud',device:'test-device',delivery:'test-delivery',created:Date.now(),expires:Date.now()+60000});
 assert.equal((await req('/api/push-receipt',{token:proof,result:'shown'})).status,200);
 assert.equal((await req('/api/push-receipt',{token:proof,result:'shown'},'http://evil.test')).status,403);
 assert.equal((await req('/api/push-receipt',{token:'forged',result:'shown'})).status,403);
 assert.equal((await req('/api/notifications')).status,401);
 const login=await req('/api/login',{email:user.email,password:'test-password'});cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await req('/api/notifications/subscribe',subscription(),'http://evil.test')).status,403);const device=subscription();assert.equal((await req('/api/notifications/subscribe',device)).status,200);assert.equal((await req('/api/notifications/test',{endpoint:device.endpoint},'http://evil.test')).status,403);assert.equal((await req('/api/notifications/test',{endpoint:device.endpoint})).status,200);assert.equal((await req('/api/notifications/test',{endpoint:subscription('not-mine').endpoint})).status,400);assert.equal((await req('/api/notifications/receipt',{tag:'a'.repeat(24),result:'shown'})).status,200);assert.equal((await req('/api/notifications/receipt',{tag:'invalid',result:'shown'})).status,400);const config=await (await req('/api/notifications')).json();assert.deepEqual(Object.keys(config).sort(),['publicKey','visible','who']);assert.equal((await req('/api/notifications/presence',{client:randomUUID(),visible:true})).status,200);assert.equal((await(await req('/api/notifications')).json()).visible,true);assert.equal((await req('/sw.js')).status,200);const diag={stage:'device',name:'AbortError',reason:'push-service-error',deviceId:randomUUID(),version:'push-client-test',permission:'granted'};assert.equal((await req('/api/notifications/client-event',diag,'http://evil.test')).status,403);for(let i=0;i<20;i++)assert.equal((await req('/api/notifications/client-event',diag)).status,200);assert.equal((await req('/api/notifications/client-event',diag)).status,429);await req('/api/logout',{});assert.equal(store.db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);assert.equal((await req('/api/notifications')).status,401);
});
test('a quiet like cannot replace an already queued comment alert',async t=>{const {push,sent,advance}=fixture(t);push.subscribe('Safy','Safy',subscription());push.enqueue({...event(),kind:'wall',target:{tab:'space',post:'p'},body:'A comment'});push.enqueue({...event(),kind:'wall',target:{tab:'space',post:'p'},quiet:true,body:'A like'});advance(2000);await push.drain();assert.equal(sent[0].body.body,'A comment');assert.equal(sent[0].body.quiet,false);});
test('wall replies notify the other participant even when the post owner replies',()=>{const before={items:[{id:'p',by:'Mahmoud',comments:[],likes:[]}]},after=structuredClone(before);after.items[0].comments.push({id:'c',by:'Mahmoud',text:'Reply'});const result=attentionEvents(before,after,'Mahmoud');assert.equal(result[0].to,'Safy');assert.equal(result[0].target.post,'p');});
function clientFixture({supported=true,iphone=false,installed=false,existing=false,failBind=false,subscribeError=null,delivery=null,permission='default',optIn}={}){
 const nodes=new Map(),handlers={},requests=[];let permissionCalls=0,subscriptionCalls=0,unsubscribeCalls=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,showModal(){},close(){}});return nodes.get(id);};
 const sub=subscription(),registration={pushManager:{getSubscription:async()=>existing?{...sub,toJSON:()=>sub,unsubscribe:async()=>{unsubscribeCalls++;}}:null,subscribe:async()=>{subscriptionCalls++;if(subscribeError)throw subscribeError;return {...sub,toJSON:()=>sub,unsubscribe:async()=>{}};}},getNotifications:async()=>[]};
 const document={visibilityState:'visible',hidden:false,hasFocus:()=>true,querySelector:node,addEventListener:(n,f)=>{const prev=handlers[n];handlers[n]=(...args)=>{prev?.(...args);f(...args);};}};
 const navigator={userAgent:iphone?'iPhone':'Android',platform:'',standalone:installed};
 if(supported)navigator.serviceWorker={register:async()=>registration,ready:Promise.resolve(registration),addEventListener(){}};
 const saved=new Map(optIn?[['our-place-push:Safy',optIn]]:[]);
 const window={localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},addEventListener:(n,f)=>{const prev=handlers[n];handlers[n]=(...args)=>{prev?.(...args);f(...args);};},dispatchEvent(){},...(supported?{PushManager:{},Notification:{}}:{})};
 const Notification={permission,requestPermission:async()=>{permissionCalls++;Notification.permission='granted';return 'granted';}};
 const context={AbortController,AbortSignal,setTimeout,clearTimeout,queueMicrotask,window,document,navigator,crypto:{randomUUID},matchMedia:()=>({matches:installed}),location:{href:'https://example.test/',origin:'https://example.test'},history:{replaceState(){}},URL,Uint8Array,atob,CustomEvent:class{},setInterval(){},fetch:async(path,options)=>{requests.push({path,options});if(path.endsWith('/subscribe')&&failBind){failBind=false;throw Error('offline');}return {ok:true,json:async()=>path==='/api/notifications'?{publicKey:sub.keys.p256dh}:path.endsWith('/status')&&delivery?{registered:true,delivery}:{ok:true}};},...(supported?{Notification}:{})};
 vm.runInNewContext(readFileSync(new URL('../public/notifications.js',import.meta.url),'utf8'),context);window.OurNotifications.connection(true);
 return {window,document,navigator,nodes,node,handlers,requests,get unsubscribeCalls(){return unsubscribeCalls;},get permissionCalls(){return permissionCalls;},get subscriptionCalls(){return subscriptionCalls;}};
}
test('client never prompts on sign-in; explicit Enable opts in and visibility updates are sent',async()=>{const c=clientFixture();c.window.OurNotifications.sync({who:'Mahmoud'});await new Promise(setImmediate);assert.equal(c.permissionCalls,0);assert.ok(c.requests.some(r=>r.path.endsWith('/presence')&&JSON.parse(r.options.body).visible));await c.node('#notifications-enable').onclick();assert.equal(c.permissionCalls,1);assert.equal(c.subscriptionCalls,1);assert.ok(c.requests.some(r=>r.path.endsWith('/subscribe')));c.window.OurNotifications.reset();assert.equal(JSON.parse(c.requests.at(-1).options.body).visible,false);});
test('unsupported browsers and non-installed iPhones show usable guidance without permission prompts',async()=>{for(const opts of [{supported:false},{iphone:true}]){const c=clientFixture(opts);c.node('#notifications-open').onclick();await new Promise(setImmediate);assert.equal(c.node('#notifications-enable').disabled,true);assert.ok(c.node('#notifications-status').textContent.length>20);assert.equal(c.permissionCalls,0);}});

test('Echo replies are not lost to another device foreground heartbeat',async t=>{
 const {push,store,sent,advance}=fixture(t);push.subscribe('Safy','Safy',subscription());const client=randomUUID();
 store.db.prepare('INSERT INTO sessions VALUES(?,?)').run('desktop',Date.now()+86400000);
 push.presence('Safy','desktop',{client,visible:true,sequence:1});store.message({id:randomUUID(),author:'Echo',text:'Hello'});push.scan();
 push.presence('Safy','desktop',{client,visible:true,sequence:2});advance(400);await push.drain();assert.equal(sent.length,1);assert.equal(sent[0].body.deviceOnly,true);
});
test('subscription status checks the current account and login session, not just browser permission',t=>{
 const {push}=fixture(t),sub=subscription();assert.equal(push.registered('Safy','Safy',sub.endpoint),false);push.subscribe('Safy','Safy',sub);assert.equal(push.registered('Safy','Safy',sub.endpoint),true);assert.equal(push.registered('Safy','old-session',sub.endpoint),false);assert.equal(push.registered('Mahmoud','Mahmoud',sub.endpoint),false);push.logout('Safy');assert.equal(push.registered('Safy','Safy',sub.endpoint),false);
});

test('a hidden recipient needs no long debounce before urgent provider delivery',async t=>{
 const {push,sent,advance}=fixture(t);push.subscribe('Safy','Safy',subscription());push.enqueue(event());advance(350);await push.drain();assert.equal(sent.length,1);assert.equal(sent[0].options.urgency,'high');
});

test('daily post reaches both registered devices despite another visible device, with offline delivery time',async t=>{
 const {push,store,sent,advance}=fixture(t);
 push.subscribe('Mahmoud','Mahmoud',subscription('m'));push.subscribe('Safy','Safy',subscription('s'));
 const client=randomUUID();push.presence('Mahmoud','Mahmoud',{client,visible:true,sequence:1});
 const s=store.state();s.items.unshift({id:'daily-new',by:'Echo',daily:{notify:true},comments:[],likes:[]});store.save(s);push.scan();
 push.presence('Mahmoud','Mahmoud',{client,visible:true,sequence:2});advance(5*60000);await push.drain();
 assert.equal(sent.length,2);assert.ok(sent.every(x=>x.body.deviceOnly&&x.body.kind==='daily'&&x.options.TTL>36000));
 push.scan();advance(1000);await push.drain();assert.equal(sent.length,2);
 const off=store.state();off.items.unshift({id:'daily-off',by:'Echo',daily:{notify:false}});store.save(off);push.scan();advance(1000);await push.drain();assert.equal(sent.length,2);
});
test('daily worker displays quietly if foreground changes after send',async()=>{
 const data={owner:'Safy',deviceOnly:true,kind:'daily',expires:Date.now()+43200000,target:{tab:'space',post:'daily'}};
 const background=worker({remoteVisible:true});await background.push(data);assert.equal(background.shown.length,1);
 const foreground=worker({visible:true});await foreground.push(data);assert.equal(foreground.shown.length,1);assert.equal(foreground.shown[0][1].silent,true);
});
test('notification test is delayed and restricted to the requesting registered device',async t=>{
 const {push,sent,advance}=fixture(t),mine=subscription('mine');push.subscribe('Mahmoud','Mahmoud',mine);push.subscribe('Mahmoud','Mahmoud',subscription('other'));
 assert.throws(()=>push.test('Safy','Safy',mine.endpoint),/Enable/);
 push.test('Mahmoud','Mahmoud',mine.endpoint);advance(4000);await push.drain();assert.equal(sent.length,0);
 advance(1001);await push.drain();assert.equal(sent.length,1);assert.equal(sent[0].sub.endpoint,mine.endpoint);assert.equal(sent[0].body.kind,'test');
});


for(const owner of ['Mahmoud','Safy'])test('court invitation reaches partner device despite another active device: '+owner,async t=>{
 const {push,store,sent,advance}=fixture(t),other=owner==='Mahmoud'?'Safy':'Mahmoud';
 push.subscribe(other,other,subscription(other));store.db.prepare('INSERT INTO sessions VALUES(?,?)').run('desktop',Date.now()+86400000);push.presence(other,'desktop',{client:randomUUID(),visible:true});
 const state=store.state();state.court={cases:[{id:'invite-case',owner,stage:'invited',round:1,questions:[]}]};store.save(state);
 push.scan(owner);advance(400);await push.drain();assert.equal(sent.length,1);assert.equal(sent[0].body.owner,other);assert.equal(sent[0].body.target.caseId,'invite-case');assert.equal(sent[0].body.kind,'invitation');assert.ok(sent[0].options.TTL>36000);
 push.scan(owner);await push.drain();assert.equal(sent.length,1);
});

test('comment notification preserves exact target through service worker URL',()=>{
 const before={items:[{id:'post-1',by:'Mahmoud',comments:[]}]},after=structuredClone(before);
 after.items[0].comments.push({id:'reply-1',by:'Safy',text:'Hello'});
 const event=attentionEvents(before,after,'Safy')[0];
 assert.deepEqual(event.target,{tab:'space',post:'post-1',comment:'reply-1'});
 const src=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 const context={URL,URLSearchParams,self:{addEventListener(){}}};vm.createContext(context);vm.runInContext(src,context);
 const target=JSON.parse(new URL(context.destination(event.target),'https://example.test').searchParams.get('notice'));
 assert.deepEqual(target,event.target);
});

test('visible but unfocused app reports offline; internal player and fullscreen retain document focus',async()=>{const c=clientFixture();c.window.OurNotifications.sync({who:'Mahmoud'});await new Promise(setImmediate);const last=()=>JSON.parse(c.requests.filter(r=>r.path.endsWith('/presence')).at(-1).options.body).visible;assert.equal(last(),true);c.document.hasFocus=()=>false;c.handlers.blur();await new Promise(setImmediate);assert.equal(last(),false);c.document.hasFocus=()=>true;c.handlers.focus();assert.equal(last(),true);c.document.activeElement={tagName:'IFRAME'};c.handlers.blur();await new Promise(setImmediate);assert.equal(last(),true);c.document.fullscreenElement={};c.handlers.fullscreenchange();await new Promise(setImmediate);assert.equal(last(),true);c.document.hasFocus=()=>false;c.handlers.blur();await new Promise(setImmediate);assert.equal(last(),false);c.document.hasFocus=()=>true;c.navigator.onLine=false;c.handlers.offline();assert.equal(last(),false);c.navigator.onLine=true;c.handlers.online();assert.equal(last(),true);});
test('worker displays notification when app is visible but not focused',async()=>{const w=worker({visible:true,focused:false});await w.push({owner:'Safy',expires:Date.now()+120000,body:'Update'});assert.equal(w.shown.length,1);});
test('lost presence expires after five seconds without a background event',t=>{const {push,advance}=fixture(t);push.presence('Safy','Safy',{client:randomUUID(),visible:true,sequence:1});advance(4999);assert.equal(push.visible('Safy'),true);advance(2);assert.equal(push.visible('Safy'),false);});


test('existing push registration recovers after a failed bind on network return without prompting',async()=>{
 const c=clientFixture({existing:true,failBind:true});c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);
 assert.equal(c.requests.filter(r=>r.path.endsWith('/subscribe')).length,1);
 c.handlers.online();await new Promise(setImmediate);
 assert.equal(c.requests.filter(r=>r.path.endsWith('/subscribe')).length,2);assert.equal(c.permissionCalls,0);assert.equal(c.subscriptionCalls,0);
 c.window.OurNotifications.reset();c.handlers.online();await new Promise(setImmediate);assert.equal(c.requests.filter(r=>r.path.endsWith('/subscribe')).length,2);
});
test('chat push survives a short offline period and still expires after an hour',async t=>{
 const {push,sent,advance}=fixture(t);push.subscribe('Safy','Safy',subscription());push.enqueue(event());advance(5*60000);await push.drain();assert.equal(sent.length,1);assert.ok(sent[0].options.TTL>=3299);
});
test('new messages alert again on a collapsed notification while quiet updates stay silent',async()=>{
 const w=worker(),data={owner:'Safy',expires:Date.now()+60000,tag:'same-chat',body:'Message'};await w.push(data);await w.push({...data,body:'Next message'});assert.equal(w.shown.length,2);assert.equal(w.shown[1][1].tag,w.shown[0][1].tag);assert.equal(w.shown[1][1].renotify,true);
 await w.push({...data,quiet:true});assert.equal(w.shown[2][1].renotify,false);assert.equal(w.shown[2][1].silent,true);
});

test('Enable reconnects an existing browser subscription without deleting or recreating it',async()=>{
 const c=clientFixture({existing:true});c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);await c.node('#notifications-enable').onclick();assert.equal(c.unsubscribeCalls,0);assert.equal(c.subscriptionCalls,0);assert.ok(c.requests.some(r=>r.path.endsWith('/subscribe')));
});
test('Enable preserves the browser subscription when server registration fails',async()=>{
 const c=clientFixture({existing:true,failBind:true});c.navigator.onLine=false;c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);await c.node('#notifications-enable').onclick();assert.equal(c.unsubscribeCalls,0);assert.equal(c.subscriptionCalls,0);assert.match(c.node('#notifications-status').textContent,/subscription is saved/);
 await c.node('#notifications-enable').onclick();assert.equal(c.unsubscribeCalls,0);assert.equal(c.requests.filter(r=>r.path.endsWith('/subscribe')).length,2);
});
test('Enable shows the actual browser registration failure instead of blaming the connection',async()=>{
 const c=clientFixture({subscribeError:Object.assign(Error('Registration failed - push service error'),{name:'AbortError'})});c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);await c.node('#notifications-enable').onclick();assert.equal(c.subscriptionCalls,2);assert.match(c.node('#notifications-status').textContent,/AbortError/);assert.match(c.node('#notifications-status').textContent,/push service error/);
});

test('message worker retains visible delivery for a foreground race without sound',async()=>{
 const data={owner:'Safy',deviceOnly:true,kind:'message',expires:Date.now()+60000};
 const background=worker({remoteVisible:true});await background.push(data);assert.equal(background.shown.length,1);
 const foreground=worker({visible:true});await foreground.push(data);assert.equal(foreground.shown.length,1);assert.equal(foreground.shown[0][1].silent,true);
 const otherAccount=worker({owner:'Mahmoud'});await otherAccount.push(data);assert.equal(otherAccount.shown.length,1);assert.equal(otherAccount.shown[0][1].data.url,'/');
});
test('device diagnostics distinguish provider acceptance from display and reject stale or other-device receipts',async t=>{
 const {push,sent,advance}=fixture(t),sub=subscription();push.subscribe('Safy','Safy',sub);push.enqueue(event());advance(400);await push.drain();
 let status=push.deliveryStatus('Safy','Safy',sub.endpoint);assert.ok(status.accepted);assert.equal(status.result,null);
 assert.equal(push.deliveryStatus('Mahmoud','Mahmoud',sub.endpoint),null);
 const data={endpoint:sub.endpoint,createdAt:sent[0].body.createdAt,result:'shown'};
 assert.throws(()=>push.receipt('Mahmoud','Mahmoud',data));push.receipt('Safy','Safy',data);assert.equal(push.deliveryStatus('Safy','Safy',sub.endpoint).result,'shown');
 push.enqueue(event());advance(400);await push.drain();push.receipt('Safy','Safy',data);assert.equal(push.deliveryStatus('Safy','Safy',sub.endpoint).result,null);
 push.logout('Safy');assert.equal(push.deliveryStatus('Safy','Safy',sub.endpoint),null);
});

test('notification settings distinguish accepted and displayed delivery on the current device',async()=>{
 for(const [delivery,expected] of [[{accepted:1,result:null},/has not confirmed display/],[{accepted:1,result:'shown'},/browser confirmed display/],[{accepted:1,result:'display-failed'},/could not display/]]){
 const c=clientFixture({existing:true,delivery});c.node('#notifications-open').onclick();await new Promise(setImmediate);assert.match(c.node('#notifications-status').textContent,expected);
 }
});

test('a lost opted-in subscription is recreated without asking permission; explicit off stays off',async()=>{
 const c=clientFixture({permission:'granted',optIn:'on'});c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);
 assert.equal(c.permissionCalls,0);assert.equal(c.subscriptionCalls,1);assert.ok(c.requests.some(r=>r.path.endsWith('/subscribe')));
 const off=clientFixture({permission:'granted',optIn:'off'});off.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);assert.equal(off.subscriptionCalls,0);
});
test('failed automatic recreation is visible instead of silently leaving notifications off',async()=>{
 const c=clientFixture({permission:'granted',optIn:'on',subscribeError:Object.assign(Error('Gesture required'),{name:'NotAllowedError'})});c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);
 assert.equal(c.permissionCalls,0);assert.match(c.node('#notifications-open').textContent,/reconnect/);assert.match(c.node('#notifications-status').textContent,/Gesture required/);
});
test('notification evidence survives session loss, rejects forged and expired proofs, and deduplicates receipts',async t=>{
 const {push,store,sent,advance}=fixture(t),sub=subscription();push.subscribe('Safy','Safy',sub);push.enqueue(event());advance(400);await push.drain();
 const token=sent[0].body.receiptToken;assert.ok(token);push.logout('Safy');store.db.prepare('DELETE FROM sessions WHERE id=?').run('Safy');
 push.tokenReceipt(token,'received');push.tokenReceipt(token,'shown');push.tokenReceipt(token,'shown');
 const history=push.history('Safy',sub.endpoint);assert.equal(history.filter(e=>e.event==='shown').length,1);assert.ok(history.some(e=>e.event==='provider-accepted'));assert.ok(history.some(e=>e.event==='logged-out'));
 assert.equal(push.history('Mahmoud',sub.endpoint).length,0);assert.throws(()=>push.tokenReceipt(token.slice(0,-5)+'AAAAA','shown'));assert.throws(()=>push.tokenReceipt(token,'made-up'));
 advance(86400001);assert.throws(()=>push.tokenReceipt(token,'shown'));
});
test('worker receipt uses its restricted proof without relying on cookies or a fresh push subscription',async()=>{
 const w=worker({statusCode:401});await w.push({owner:'Safy',tag:'a'.repeat(24),expires:Date.now()+60000,receiptToken:'restricted-proof'});
 const reports=w.requests.filter(r=>r.path==='/api/push-receipt').map(r=>JSON.parse(r.options.body));
 assert.ok(reports.some(r=>r.result==='received'));assert.ok(reports.some(r=>r.result==='auth-required'));assert.ok(reports.some(r=>r.result==='shown'));assert.ok(reports.every(r=>r.token==='restricted-proof'));
});
test('inactive and expired device sessions produce a specific recorded reason',async t=>{
 const {push,store,sent,advance}=fixture(t),sub=subscription();push.subscribe('Safy','Safy',sub);
 store.db.prepare('UPDATE sessions SET expires=0 WHERE id=?').run('Safy');push.enqueue(event());advance(400);await push.drain();
 assert.equal(sent.length,0);assert.ok(push.history('Safy',sub.endpoint).some(e=>e.event==='session-expired'));
});
test('temporary provider outage keeps retrying beyond the old nine-second cutoff',async t=>{
 const {push,sent,advance}=fixture(t);push.subscribe('Safy','Safy',subscription());let attempts=0;push.send=async(s,b)=>{if(++attempts<=3)throw Object.assign(Error('Unavailable'),{statusCode:503});sent.push(JSON.parse(b));};
 push.enqueue(event());advance(400);await push.drain();advance(3000);await push.drain();advance(6000);await push.drain();assert.equal(sent.length,0);advance(12000);await push.drain();assert.equal(sent.length,1);
});
test('same-device foreground is filtered before provider delivery, while a later background message is delivered',async t=>{
 const {push,sent,advance}=fixture(t),client=randomUUID();push.subscribe('Safy','Safy',subscription());
 push.presence('Safy','Safy',{client,visible:true,sequence:1});push.enqueue(event());advance(400);await push.drain();assert.equal(sent.length,0);
 push.presence('Safy','Safy',{client,visible:false,sequence:2});push.enqueue(event());advance(400);await push.drain();assert.equal(sent.length,1);
});

test('full legacy registry with seven expired sessions accepts the current phone and delivers',async t=>{
 const {push,store,sent,advance}=fixture(t);
 for(let i=0;i<10;i++){const sid='legacy-'+i;store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(sid,Date.now()+86400000);push.subscribe('Safy',sid,subscription(sid));}
 store.db.prepare("UPDATE sessions SET expires=0 WHERE id IN ('legacy-0','legacy-1','legacy-2','legacy-3','legacy-4','legacy-5','legacy-6')").run();
 const phone=subscription('current-phone');push.subscribe('Safy','Safy',phone);
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE owner='Safy'").get().n,4);
 assert.equal(push.registered('Safy','Safy',phone.endpoint),true);
 push.enqueue(event());advance(400);await push.drain();assert.equal(sent.length,4);assert.ok(sent.some(s=>s.sub.endpoint===phone.endpoint));
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM push_audit WHERE event='subscription-pruned' AND code='session-expired'").get().n,7);
});
test('repeated token rotation on one installation never fills device capacity or removes another phone',t=>{
 const {push,store}=fixture(t),deviceId=randomUUID(),other=subscription('other-phone');push.subscribe('Safy','Safy',other);
 for(let i=0;i<25;i++)push.subscribe('Safy','Safy',{...subscription('rotation-'+i),deviceId});
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE owner='Safy'").get().n,2);
 assert.equal(push.registered('Safy','Safy',other.endpoint),true);
 assert.equal(push.registered('Safy','Safy',subscription('rotation-24').endpoint),true);
});

test('startup and periodic cleanup remove revoked/expired bindings without touching active registrations',t=>{
 const {push,store,advance}=fixture(t),live=subscription('live'),dead=subscription('dead');push.subscribe('Safy','Safy',live);push.subscribe('Mahmoud','Mahmoud',dead);
 store.db.prepare("DELETE FROM sessions WHERE id='Mahmoud'").run();
 const restarted=new PushNotifications(store,{secret,origin:'https://example.test'});
 assert.equal(restarted.registered('Safy','Safy',live.endpoint),true);assert.equal(restarted.registered('Mahmoud','Mahmoud',dead.endpoint),false);
 assert.ok(restarted.history('Mahmoud',dead.endpoint).some(e=>e.event==='subscription-pruned'&&e.code==='session-revoked'));
 advance(86400001);push.pruneSubscriptions();assert.equal(store.db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
});
test('rotation preserves installation identity; previous endpoint cannot remove another owner or session',t=>{
 const {push,store}=fixture(t),old=subscription('old'),next=subscription('next'),other=subscription('other'),deviceId=randomUUID();
 push.subscribe('Safy','Safy',{...old,deviceId});push.subscribe('Mahmoud','Mahmoud',other);
 push.subscribe('Safy','Safy',{...next,previousEndpoint:old.endpoint});assert.equal(push.registered('Safy','Safy',old.endpoint),false);
 assert.equal(store.db.prepare('SELECT installation FROM push_subscriptions WHERE owner=?').get('Safy').installation,deviceId);
 push.subscribe('Safy','Safy',{...subscription('new'),previousEndpoint:other.endpoint});assert.equal(push.registered('Mahmoud','Mahmoud',other.endpoint),true);
 store.db.prepare('INSERT INTO sessions VALUES(?,?)').run('other-session',Date.now()+86400000);
 push.subscribe('Safy','other-session',{...subscription('separate'),previousEndpoint:next.endpoint});assert.equal(push.registered('Safy','Safy',next.endpoint),true);
});
test('a genuinely full active registry preserves all devices and records capacity rejection; rebinding still succeeds',t=>{
 const {push,store}=fixture(t),subs=Array.from({length:10},(_,i)=>subscription('active-'+i));for(const sub of subs)push.subscribe('Safy','Safy',sub);
 const rejected=subscription('eleven');assert.throws(()=>push.subscribe('Safy','Safy',rejected),e=>e.status===409);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,10);assert.ok(subs.every(sub=>push.registered('Safy','Safy',sub.endpoint)));
 assert.ok(push.history('Safy',rejected.endpoint).some(e=>e.event==='registration-blocked'));
 push.subscribe('Safy','Safy',{...subs[0],deviceId:randomUUID()});assert.equal(store.db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,10);
});
test('client sends one stable installation identity on automatic recovery and explicit enable',async()=>{
 const c=clientFixture({existing:true,permission:'granted'});c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);await c.node('#notifications-enable').onclick();
 const registrations=c.requests.filter(r=>r.path.endsWith('/subscribe')).map(r=>JSON.parse(r.options.body));assert.ok(registrations.length>=2);assert.match(registrations[0].deviceId,/^[\w-]{16,80}$/);assert.ok(registrations.every(r=>r.deviceId===registrations[0].deviceId));
});

test('generic notifications remain audible on account-check failure or clock expiry, without exposing content',async()=>{
 const data={owner:'Safy',expires:Date.now()+120000,body:'Private',target:{tab:'chat',message:'private-id'}};
 for(const opts of [{networkError:true},{statusCode:401},{statusCode:503}]){const w=worker(opts);await w.push(data);assert.equal(w.shown[0][1].body,'Open Our Place to check your updates.');assert.equal(w.shown[0][1].data.url,'/');assert.notEqual(w.shown[0][1].silent,true);}
 const late=worker();await late.push({...data,expires:Date.now()-1000});assert.notEqual(late.shown[0][1].silent,true);assert.equal(late.shown[0][1].data.url,'/');
});
test('wrong-account and malformed pushes remain silent, as do likes and foreground races',async()=>{
 const data={owner:'Safy',expires:Date.now()+120000,body:'Private'};
 for(const [opts,payload] of [[{owner:'Mahmoud'},data],[{},null],[{},{...data,quiet:true}],[{visible:true},data]]){const w=worker(opts);await w.push(payload);assert.equal(w.shown[0][1].silent,true);}
});


test('client registration failure reports bounded diagnostic metadata without endpoint or raw error',async()=>{
 const c=clientFixture({subscribeError:Object.assign(Error('Registration failed - push service error'),{name:'AbortError'})});c.window.OurNotifications.sync({who:'Safy'});await new Promise(setImmediate);await c.node('#notifications-enable').onclick();
 const reports=c.requests.filter(r=>r.path.endsWith('/client-event')).map(r=>JSON.parse(r.options.body));assert.equal(reports.length,1);assert.equal(reports[0].stage,'device');assert.equal(reports[0].name,'AbortError');assert.equal(reports[0].reason,'push-service-error');assert.match(reports[0].version,/^push-client-/);assert.ok(reports[0].deviceId);assert.equal(reports[0].endpoint,undefined);assert.equal(reports[0].message,undefined);
});
test('diagnostics validate input and discard untrusted URLs, messages and browser text',t=>{
 const {push,store}=fixture(t),data={stage:'device',deviceId:randomUUID(),version:'push-client-test',name:'AbortError',reason:'push-service-error',message:'https://secret.invalid/token',browser:'https://secret.invalid/token'};
 for(const bad of [null,{...data,stage:'made-up'},{...data,deviceId:'short'},{...data,version:'https://secret.invalid'}])assert.throws(()=>push.clientEvent('Safy',bad));
 const messages=[],original=console.info;try{console.info=v=>messages.push(String(v));push.clientEvent('Safy',data);}finally{console.info=original;}
 assert.ok(messages.some(v=>v.includes('push_client')));assert.ok(messages.every(v=>!v.includes('secret.invalid')&&!v.includes(data.deviceId)));
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM push_audit WHERE event='client-device'").get().n,1);
});
test('worker receipts carry version and backend retains it while accepting legacy workers',async t=>{
 const w=worker();await w.push({owner:'Safy',tag:'a'.repeat(24),expires:Date.now()+60000,receiptToken:'proof'});const reports=w.requests.filter(r=>r.path==='/api/push-receipt').map(r=>JSON.parse(r.options.body));assert.ok(reports.length>=2);assert.ok(reports.every(r=>/^push-worker-/.test(r.version)));
 const {push,sent,advance}=fixture(t),sub=subscription();push.subscribe('Safy','Safy',sub);push.enqueue(event());advance(400);await push.drain();const proof=sent[0].body.receiptToken;push.tokenReceipt(proof,'received');push.tokenReceipt(proof,'shown','push-worker-test');assert.ok(push.history('Safy',sub.endpoint).some(e=>e.event==='shown'&&e.code==='push-worker-test'));assert.throws(()=>push.tokenReceipt(proof,'foreground','https://secret.invalid'));
});
test('registration evidence classifies provider and groups sessions without revealing credentials',t=>{
 const {push}=fixture(t),sub=subscription(),messages=[],original=console.info;try{console.info=v=>messages.push(String(v));push.subscribe('Safy','Safy',sub);}finally{console.info=original;}
 assert.ok(push.history('Safy',sub.endpoint).some(e=>e.event==='registered'&&e.code==='fcm'));const inventory=messages.map(v=>JSON.parse(v)).find(v=>v.event==='push_binding');assert.equal(inventory.provider,'fcm');assert.equal(inventory.rowsInSession,1);assert.match(inventory.sessionGroup,/^[a-f0-9]{12}$/);assert.ok(!messages.join('').includes(sub.endpoint));assert.ok(!messages.join('').includes(sub.keys.auth));
});
