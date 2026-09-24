import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/notifications.js',import.meta.url),'utf8');
function harness(){
 const requests=[],events=[],timers=[];
 const c={realtime:true,realtimeAt:Date.now(),Date,who:'Mahmoud',epoch:1,sequence:0,client:'presence-client',presenceFlight:null,AbortController,document:{visibilityState:'visible',hasFocus:()=>true},navigator:{onLine:true},clearShown:async()=>{},setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){},CustomEvent:class{constructor(type,data){this.type=type;Object.assign(this,data);}},window:{dispatchEvent:e=>events.push(e)},request:(path,data,keepalive,signal)=>new Promise(resolve=>requests.push({data,signal,resolve}))};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function foreground()'),source.indexOf('async function clearShown()')),c);
 return {c,requests,events,timers,flush:()=>new Promise(r=>setImmediate(r))};
}
test('verified presence acknowledgement updates without waiting for an event stream; duplicate heartbeats coalesce',async()=>{
 const h=harness();h.c.presence();h.c.presence();assert.equal(h.requests.length,1);
 h.requests[0].resolve({who:'Mahmoud',online:['Mahmoud','Safy'],serverNow:123});await h.flush();assert.equal(h.events.length,1);assert.deepEqual(h.events[0].detail.online,['Mahmoud','Safy']);h.c.presence();assert.equal(h.requests.length,2);
});
test('background departure aborts pending foreground request and never paints its late acknowledgement',async()=>{
 const h=harness();h.c.presence();h.c.document.visibilityState='hidden';h.c.presence();assert.equal(h.requests[0].signal.aborted,true);assert.equal(h.requests[1].data.visible,false);
 h.requests[0].resolve({online:['Mahmoud']});h.requests[1].resolve({online:[]});await h.flush();assert.equal(h.events.length,0);
});
test('a stuck presence request times out and an old account response cannot update a new session',async()=>{
 const h=harness();h.c.presence();h.timers[0]();assert.equal(h.requests[0].signal.aborted,true);h.c.epoch++;h.c.who='Safy';h.requests[0].resolve({online:['Mahmoud']});await h.flush();assert.equal(h.events.length,0);
});

test('foreground alone cannot announce online when receive transport is unverified or stale',()=>{
 const h=harness();h.c.realtime=false;h.c.presence();assert.equal(h.requests[0].data.visible,false);
 const stale=harness();stale.c.realtimeAt=Date.now()-6000;stale.c.presence();assert.equal(stale.requests[0].data.visible,false);
});
