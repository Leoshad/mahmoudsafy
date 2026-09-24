import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function transport({initialState={who:'Mahmoud'},load=async()=>{},probe=async c=>c.state}={}){
 let now=0,watchdog,syncs=0,drains=0,polls=0;const streams=[],windowEvents={},documentEvents={},timers=[];
 class Stream{constructor(){this.readyState=0;this.events={};this.closed=false;streams.push(this);}addEventListener(t,f){this.events[t]=f;}close(){this.closed=true;this.readyState=2;}emit(t,data={}){if(t==='open')this.readyState=1;this.events[t]?.({data:JSON.stringify(data)});}}
 const c={AbortController,snapshotSerial:0,api:async()=>{polls++;return probe(c);},state:initialState,source:null,lastEvent:0,reconnectTimer:null,sessionEpoch:0,connectionWanted:true,recoveryTask:null,recoveryAfter:0,recoveryFailures:0,typingUntil:0,online:[],presenceReceivedAt:0,receivePresence(){},EventSource:Stream,Date:{now:()=>now},navigator:{onLine:true},document:{hidden:false,addEventListener:(t,f)=>documentEvents[t]=f},window:{addEventListener:(t,f)=>windowEvents[t]=f},setInterval:f=>watchdog=f,setTimeout:(fn,delay)=>(timers.push({fn,delay}),timers.length),clearTimeout(){},paintPresence(){},paintTyping(){},receiveTyping(){},absorb(s){c.state=s;},signOutUI(){c.connectionWanted=false;},drainOutbox:async()=>{drains++;},sync:async()=>{syncs++;await load(c);},older:[],paintFeed(){}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function connect(){'),source.indexOf("$('#login-form').onsubmit")),c);
 vm.runInContext(source.slice(source.indexOf('let connectionProbe='),source.indexOf('window.OurComfort?.init')),c);
 return {c,streams,windowEvents,documentEvents,get polls(){return polls;},get syncs(){return syncs;},get drains(){return drains;},time:n=>now=n,runTimers:delay=>{for(const t of timers.splice(0))if(t.delay===delay)t.fn();},tick:()=>watchdog()};
}
test('a slow 10-second connection survives the 8-second watchdog and opens',async()=>{
 const h=transport();h.c.connect();h.time(8000);h.tick();assert.equal(h.streams.length,1);assert.equal(h.streams[0].closed,false);
 h.time(10000);h.streams[0].emit('open');h.time(16000);h.tick();assert.equal(h.streams.length,1);assert.equal(h.c.source.readyState,1);
});
test('failed initial load recovers without a pre-existing state; a rejected session stops retrying',async()=>{
 let tries=0;const h=transport({initialState:null,load:async c=>{if(++tries===1)throw Error('offline');c.state={who:'Safy'};}});
 await h.c.recoverConnection();assert.equal(h.streams.length,0);h.time(8000);await h.c.recoverConnection();assert.equal(h.streams.length,1);assert.equal(h.c.state.who,'Safy');
 const loggedOut=transport({initialState:null,load:async c=>{c.connectionWanted=false;throw Object.assign(Error('Sign in'),{status:401});}});await loggedOut.c.recoverConnection();loggedOut.time(60000);await loggedOut.c.recoverConnection();assert.equal(loggedOut.syncs,1);
});
test('visibility and online events share one recovery request and do not replace healthy transport',async()=>{
 let release;const h=transport({load:()=>new Promise(r=>release=r)});h.c.connect();h.streams[0].emit('open');
 h.windowEvents.online();h.documentEvents.visibilitychange();assert.equal(h.syncs,1);release();await h.c.recoveryTask;assert.equal(h.streams.length,1);
});
test('offline closes the transport; online reopens it; stale events cannot alter the active session',async()=>{
 const h=transport();h.c.connect();const old=h.streams[0];h.c.navigator.onLine=false;h.windowEvents.offline();assert.equal(old.closed,true);h.tick();assert.equal(h.syncs,0);
 h.c.navigator.onLine=true;await h.c.recoverConnection(true);assert.equal(h.streams.length,2);old.emit('snapshot',{who:'Wrong account'});assert.equal(h.c.state.who,'Mahmoud');
 h.c.sessionEpoch++;h.streams[1].emit('snapshot',{who:'Wrong account'});assert.equal(h.c.state.who,'Mahmoud');
});
test('native reconnect is allowed; a silent stuck connection is replaced after the heartbeat deadline',async()=>{
 const h=transport();h.c.connect();h.streams[0].emit('open');h.time(15000);h.streams[0].emit('heartbeat');h.c.source.readyState=0;h.time(24000);h.tick();assert.equal(h.streams.length,1);
 h.time(32000);await h.c.recoverConnection();assert.equal(h.streams.length,2);assert.equal(h.streams[0].closed,true);
});

function storage(){const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function outbox(who='Mahmoud',disk=storage(),send=async()=>{}){
 const c={state:{who},sessionEpoch:0,outboxOwner:null,outboxDraining:false,delivering:new Set(),pending:new Map(),localStorage:disk,navigator:{onLine:true},document:{hidden:false},crypto:{randomUUID:()=> 'stable-ai-key'},Date,paintFeed(){},info(){},errors:[],error:e=>c.errors.push(e),command:send,sync:async()=>{}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function outboxKey('),source.indexOf("$('#composer').onsubmit")),c);return c;
}
const message=who=>({id:'a-message',author:who,text:'Keep this message',payload:{text:'Keep this message'},createdAt:'2026-09-19T00:00:00Z',status:'sending',aiId:'one-ai-request'});
for(const who of ['Mahmoud','Safy'])test(who+' outbox survives reload and retries with the original request id',async()=>{
 const disk=storage(),first=outbox(who,disk,async()=>{throw Error('offline');}),m=message(who);await first.deliver(m);assert.equal(disk.length,1);assert.equal(m.status,'failed-local');
 const calls=[],reopened=outbox(who,disk,async(type,data,id)=>calls.push({type,data,id}));reopened.restoreOutbox();assert.equal(reopened.pending.size,1);reopened.pending.get(m.id).retryAt=0;await reopened.drainOutbox();assert.equal(calls.length,1);assert.equal(calls[0].id,m.id);assert.equal(calls[0].data.text,m.text);assert.equal(disk.length,0);
});
test('outboxes are isolated by account and a late failed request after sign-out is retained',async()=>{
 const disk=storage();let reject;const c=outbox('Mahmoud',disk,()=>new Promise((_,r)=>reject=r)),m=message('Mahmoud');const task=c.deliver(m);
 c.state={who:'Safy'};c.sessionEpoch++;c.pending.clear();reject(Error('offline'));await task;assert.equal(disk.length,1);
 const safy=outbox('Safy',disk);safy.restoreOutbox();assert.equal(safy.pending.size,0);const mahmoud=outbox('Mahmoud',disk);mahmoud.restoreOutbox();assert.equal(mahmoud.pending.size,1);
});
test('concurrent retries send once; realtime acknowledgement wins over a lost HTTP response',async()=>{
 const disk=storage();let reject,calls=0;const c=outbox('Mahmoud',disk,()=>{calls++;return new Promise((_,r)=>reject=r);}),m=message('Mahmoud');
 const task=c.deliver(m);await c.deliver(m);assert.equal(calls,1);m.confirmed=true;c.pending.delete(m.id);reject(Error('response lost'));await task;assert.equal(disk.length,0);
});
test('offline and permanent failures do not cause automatic resend loops; auth failure remains recoverable',async()=>{
 let calls=0;const c=outbox('Safy',storage(),async()=>{calls++;throw Object.assign(Error('invalid'),{status:400});}),m=message('Safy');c.saveOutbox(m);c.pending.set(m.id,m);c.navigator.onLine=false;await c.drainOutbox();assert.equal(calls,0);c.navigator.onLine=true;await c.drainOutbox();await c.drainOutbox();assert.equal(calls,1);assert.equal(m.autoRetry,false);assert.equal(c.errors.length,1);
 const auth=outbox('Safy',storage(),async()=>{throw Object.assign(Error('Sign in'),{status:401});}),n=message('Safy');await auth.deliver(n);assert.equal(n.autoRetry,true);
});


test('returning from background probes then replaces a silent transport without waiting for a slow snapshot',async()=>{let release;const h=transport({load:()=>new Promise(r=>release=r)});h.c.connect();const old=h.streams[0];old.emit('open');h.c.document.hidden=true;h.documentEvents.visibilitychange();h.time(2000);h.c.document.hidden=false;h.documentEvents.visibilitychange();assert.equal(old.closed,false);h.time(4000);h.runTimers(1500);assert.equal(old.closed,true);assert.equal(h.streams.length,2);h.windowEvents.focus();h.windowEvents.online();assert.equal(h.streams.length,2);assert.equal(h.syncs,1);release();await h.c.recoveryTask;assert.equal(h.streams.length,2);});
test('a pending snapshot does not block foreground transport recovery',async()=>{let release;const h=transport({load:()=>new Promise(r=>release=r)});h.c.connect();h.streams[0].emit('open');const pending=h.c.recoverConnection();h.c.document.hidden=true;h.documentEvents.visibilitychange();h.c.document.hidden=false;h.documentEvents.visibilitychange();h.time(2000);h.runTimers(1500);assert.equal(h.streams.length,2);release();await pending;});
test('presence is refreshed on return and stream open without claiming optimistic online state',async()=>{const h=transport();let calls=0;h.c.window.OurNotifications={refreshPresence:()=>calls++};await h.c.recoverConnection(true);assert.equal(calls,2);h.streams[0].emit('open');assert.equal(calls,3);assert.deepEqual(h.c.online,[]);});


test('resume retrieves real messages independently of a suspended snapshot and EventSource',async()=>{
 let release;const h=transport({load:()=>new Promise(r=>release=r),probe:async()=>({who:'Mahmoud',messages:[{id:'from-safy',text:'I am here'}]})});
 const proofs=[];h.c.window.OurNotifications={connection:ok=>proofs.push(ok),refreshPresence(){}};
 h.c.connect();const old=h.streams[0];old.emit('open');const stuck=h.c.recoverConnection();
 h.c.document.hidden=true;h.documentEvents.visibilitychange();h.c.document.hidden=false;h.documentEvents.visibilitychange();
 await new Promise(r=>setImmediate(r));assert.equal(h.c.state.messages[0].id,'from-safy');assert.ok(proofs.includes(true));assert.equal(old.closed,false);h.time(2000);h.runTimers(1500);assert.equal(old.closed,true);assert.equal(h.syncs,1);
 release();await stuck;
});
test('fallback continues receiving with blocked SSE, stops after live events, and ignores late background replies',async()=>{
 const h=transport();h.c.connect();await h.c.probeConnection();assert.equal(h.polls,1);
 h.time(2000);await h.c.probeConnection();assert.equal(h.polls,2);
 h.streams[0].emit('open');h.streams[0].emit('heartbeat');await h.c.probeConnection();assert.equal(h.polls,2);
 let resolve;const late=transport({probe:()=>new Promise(r=>resolve=r)});const task=late.c.probeConnection(true);late.c.document.hidden=true;late.documentEvents.visibilitychange();resolve({who:'Wrong',messages:[]});await task;assert.equal(late.c.state.who,'Mahmoud');
});

test('a live socket survives returning from background when its next real event arrives',async()=>{
 const h=transport();h.c.connect();const old=h.streams[0];old.emit('open');h.c.document.hidden=true;h.documentEvents.visibilitychange();h.time(30000);h.c.document.hidden=false;h.documentEvents.visibilitychange();
 assert.equal(old.closed,false);h.time(30500);old.emit('heartbeat');await new Promise(r=>setImmediate(r));h.time(32000);h.runTimers(1500);assert.equal(old.closed,false);assert.equal(h.streams.length,1);
});
