import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {connectionRecords} from '../connection-report.mjs';
import {observeConnection} from '../connection-http.mjs';
const code=readFileSync(new URL('../public/connection-trace.js',import.meta.url),'utf8');
function client(storage=new Map(),fetcher=async()=>({ok:true,status:200})){
 const intervals=[],events={},calls=[];let clock=Date.now();
 const context={window:null,crypto:{randomUUID},URL,location:{href:'https://place.test/',origin:'https://place.test'},document:{hidden:false,hasFocus:()=>true,addEventListener:(n,f)=>events[n]=f},navigator:{onLine:true},performance:{now:()=>clock},Date:class extends Date{static now(){return clock;}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},AbortSignal,setInterval:f=>intervals.push(f),fetch:async(...args)=>{calls.push(args);return fetcher(...args);},addEventListener:(n,f)=>events[n]=f};context.window=context;vm.runInNewContext(code,context);
 return {context,storage,calls,flush:()=>intervals[0](),advance:()=>clock+=16000,rows:()=>JSON.parse(storage.get('our-place-connection-trace-v1'))};
}
test('failed diagnostics persist across reload and are delivered after connection recovers',async()=>{
 const storage=new Map(),c=client(storage,async()=>{throw Error('offline');});
 await assert.rejects(c.context.fetch('/api/state'));await c.flush();assert.ok(c.rows().some(x=>x.phase==='failed'));
 const restored=client(storage);await restored.flush();const report=JSON.parse(restored.calls[0][1].body);assert.ok(report.records.some(x=>x.phase==='failed'&&x.route==='/api/state'));assert.equal(restored.rows().length,0);
});
test('a request still in flight is not acknowledged before its eventual timeout',async()=>{
 let reject;const c=client(new Map(),url=>url.includes('/api/state')?new Promise((_,r)=>reject=r):Promise.resolve({ok:true,status:200}));
 const pending=c.context.fetch('/api/state');await c.flush();assert.ok(c.rows().some(x=>x.phase==='started'));
 reject(Object.assign(Error('timeout'),{name:'TimeoutError'}));await assert.rejects(pending);assert.ok(c.rows().some(x=>x.phase==='timeout'));c.advance();await c.flush();assert.equal(c.rows().length,0);
});
test('trace preserves payload and records no chat text, password or full URL',async()=>{
 const c=client(),options={method:'POST',body:'private message',headers:{Authorization:'private-token'}};
 await c.context.fetch('/api/command',options);assert.equal(c.calls[0][1],options);assert.ok(new URL(c.calls[0][0]).searchParams.get('connection_trace'));
 await c.context.fetch('/api/login',{body:'secret-password'});assert.equal(c.calls[1][0],'/api/login');assert.doesNotMatch(JSON.stringify(c.rows()),/private|secret-password|Authorization/);
});
test('server logs the same client trace at arrival and completion, including fast requests',()=>{
 const trace=randomUUID(),records=[],req={url:'/api/state?connection_trace='+trace},res=new EventEmitter();res.statusCode=200;res.setHeader=()=>{};
 observeConnection(req,res,r=>records.push(r));res.emit('finish');assert.deepEqual(records.map(x=>x.phase),['received','finished']);assert.ok(records.every(x=>x.client_request===trace));
});
test('batch validation strips unapproved fields and rejects unsafe values',()=>{
 const row={id:randomUUID(),attempt:randomUUID(),at:Date.now(),focused:true,online:true,kind:'request',phase:'headers',route:'/api/state',elapsed:10,password:'never log me'};
 assert.equal(connectionRecords({version:2,records:[row]})[0].password,undefined);
 assert.equal(connectionRecords({version:2,records:[{...row,route:'/api/login?password=secret'}]}),null);
 assert.equal(connectionRecords({version:2,records:[{...row,elapsed:Infinity}]}),null);
});
