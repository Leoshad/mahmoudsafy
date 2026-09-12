import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../store.mjs';
import { createEngine } from '../engine.mjs';
import { initialState,validateProposal,contextForAI,publicState } from '../domain.mjs';
import { createApp } from '../server.mjs';
import { makeProvider } from '../provider.mjs';
const cmd=(type,rest={})=>({id:randomUUID(),type,...rest});
const reply={dialogue:'A bridge opens.',actions:[{kind:'bridge',target:'arch',value:'open',label:''}]};
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'world-test-')),path=join(dir,'state.db'),store=new Store(path);t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {store,path};}
test('invalid action rolls back entire proposal and cannot move a human',()=>{
 const s=initialState();assert.throws(()=>validateProposal(s,{dialogue:'Done',actions:[reply.actions[0],{kind:'move',target:'world',value:'',label:''}]}));assert.equal(s.bridge,false);
 assert.throws(()=>validateProposal(s,{dialogue:'Done',actions:[{kind:'move',target:'center',value:'',label:'',actor:'Safy'}]}));
});
test('bridge rules prevent inaccessible movement and stranding someone',()=>{
 const s=initialState();assert.throws(()=>validateProposal(s,{dialogue:'Moved',actions:[{kind:'move',target:'arch',value:'',label:''}]}));
 s.bridge=true;s.positions.Safy='arch';assert.throws(()=>validateProposal(s,{dialogue:'Closed',actions:[{kind:'bridge',target:'arch',value:'close',label:''}]}));
});
test('commands authenticate actor and reject actor spoofing',async t=>{
 const {store}=fixture(t),run=createEngine(store,null);
 await assert.rejects(run('Echo',cmd('move',{target:'edge'})));
 await assert.rejects(run('Mahmoud',{...cmd('move',{target:'edge'}),actor:'Safy'}));
 await run('Mahmoud',cmd('move',{target:'mirror'}));assert.equal(store.read().positions.Safy,'edge');
});
test('same command ID calls the provider once and different payload is rejected',async t=>{
 const {store}=fixture(t);let count=0;const run=createEngine(store,async()=>{count++;return reply;});const input=cmd('message',{to:'ai',text:'Open a bridge'});
 assert.equal((await run('Mahmoud',input)).status,'done');await run('Mahmoud',input);assert.equal(count,1);assert.equal(store.read().budget.requests,1);
 await assert.rejects(run('Mahmoud',{...input,text:'Different'}));
});
test('parallel AI turns are serialized without losing shared messages',async t=>{
 const {store}=fixture(t);let resolve;const run=createEngine(store,()=>new Promise(r=>resolve=r));const first=run('Mahmoud',cmd('message',{to:'ai',text:'Open a bridge'}));
 await assert.rejects(run('Safy',cmd('message',{to:'ai',text:'Something else'})),/answering/);
 await run('Safy',cmd('message',{to:'partner',text:'I am here'}));resolve(reply);await first;
 assert.equal(store.read().messages.some(m=>m.text==='I am here'),true);assert.equal(store.read().bridge,true);
});
test('Just Us cancels an in-flight response; neither person can clear the other pause',async t=>{
 const {store}=fixture(t);let resolve;const run=createEngine(store,()=>new Promise(r=>resolve=r));const first=run('Mahmoud',cmd('message',{to:'ai',text:'Open a bridge'}));
 await run('Safy',cmd('pause',{value:true}));await run('Mahmoud',cmd('pause',{value:false}));resolve(reply);
 assert.equal((await first).status,'cancelled');assert.equal(store.read().bridge,false);assert.equal(store.read().paused.Safy,true);
 assert.equal(store.read().messages.some(m=>m.actor==='Echo'),false);
});
test('partner messages never enter AI context, including after resume',async t=>{
 const {store}=fixture(t),run=createEngine(store,async()=>reply);
 await run('Safy',cmd('pause',{value:true}));await run('Safy',cmd('message',{to:'partner',text:'PRIVATE-CANARY'}));await run('Safy',cmd('pause',{value:false}));
 assert.equal(JSON.stringify(contextForAI(store.read(),'Mahmoud','Hi')).includes('PRIVATE-CANARY'),false);
 assert.equal(JSON.stringify(publicState(store.read(),'Mahmoud',true)).includes('receipts'),false);
});
test('test budget persists across reopening and failed requests stay reserved',async t=>{
 const {store,path}=fixture(t),run=createEngine(store,async()=>{throw Error('secret provider details');});
 const result=await run('Mahmoud',cmd('message',{to:'ai',text:'Hi'}));assert.equal(result.status,'failed');assert.equal(JSON.stringify(result).includes('secret'),false);
 const reopened=new Store(path);assert.equal(reopened.read().budget.reservedMicro,20000);reopened.close();
 store.transaction(s=>s.budget.reservedMicro=3000000);await assert.rejects(run('Mahmoud',cmd('message',{to:'ai',text:'Hi'})),/allowance/);
});
test('invalid AI output cannot publish a reply or change world state',async t=>{
 const {store}=fixture(t),run=createEngine(store,async()=>({dialogue:'I moved you',actions:[{kind:'teleport',target:'Safy',value:'moon',label:''}]}));
 assert.equal((await run('Mahmoud',cmd('message',{to:'ai',text:'Surprise us'}))).status,'failed');assert.equal(store.read().messages.filter(m=>m.actor==='Echo').length,0);
});
test('provider uses bounded structured output and rejects incomplete responses without retry',async()=>{
 let calls=0;const provider=makeProvider('test-only',async(url,init)=>{calls++;const b=JSON.parse(init.body);assert.equal(b.store,false);assert.equal(b.max_output_tokens,900);assert.equal(b.text.format.strict,true);return {ok:true,json:async()=>({status:'incomplete',output:[]})};});
 await assert.rejects(provider({request:'Hi'}),/incomplete/);assert.equal(calls,1);
});
test('HTTP enforces authentication, origin and server-issued actor',async t=>{
 const {store}=fixture(t),origin='http://127.0.0.1:4174',credentials={Mahmoud:'m'.repeat(32),Safy:'s'.repeat(32)};
 const app=createApp({store,origin,secret:'x'.repeat(40),credentials});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/state')).status,401);
 assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor:'Mahmoud',passphrase:credentials.Mahmoud})})).status,403);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({actor:'Mahmoud',passphrase:credentials.Mahmoud})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const state=await fetch(base+'/api/state',{headers:{Cookie:cookie}});assert.equal((await state.json()).actor,'Mahmoud');
 const send=await fetch(base+'/api/command',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(cmd('message',{to:'ai',text:'Hi'}))});assert.equal(send.status,503);assert.equal(store.read().budget.requests,0);
});
