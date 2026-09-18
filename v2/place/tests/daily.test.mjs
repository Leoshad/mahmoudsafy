import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../store.mjs';
import {DailyWall,dailyDefaults,dueSlots,updateDaily} from '../daily.mjs';
import {parseDaily} from '../daily-ai.mjs';
import {change} from '../domain.mjs';
const base=Date.parse('2026-09-17T05:00:00Z'),usage={input_tokens:100,output_tokens:100,web_search_calls:0};
function fixture(generate){const store=new Store(':memory:');let clock=base;const wall=new DailyWall(store,{now:()=>clock,connected:()=>true,generate});return {store,wall,set:v=>clock=v,close:()=>{wall.stop();store.close();}};}
test('Riyadh times, future-only activation, grace window and settings validation',()=>{const cfg=dailyDefaults(base);assert.equal(dueSlots(cfg,base).length,0);assert.equal(dueSlots(cfg,base+3600000)[0].id,'morning');assert.equal(dueSlots(cfg,base+7200000).length,0);const s={daily:cfg,version:0};updateDaily(s,{...cfg,enabled:false},base+3600001);assert.equal(dueSlots(s.daily,base+3600002).length,0);assert.throws(()=>updateDaily(s,{...s.daily,slots:[]}),/three/);assert.throws(()=>updateDaily(s,{...cfg}),/changed/);});
test('at most one post/debit across overlapping ticks, deletion and worker restart',async()=>{let calls=0,resolve;const f=fixture(async()=>{calls++;await new Promise(r=>resolve=r);return {value:{title:'An original thoughtful post for two people.',sources:[]},usage};});f.set(base+3600000);const task=f.wall.tick();await f.wall.tick();assert.equal(calls,1);resolve();await task;assert.equal(f.store.state().items.length,1);const spent=f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used;f.store.tx(()=>{const s=f.store.state();s.items=[];f.store.save(s);});const replacement=new DailyWall(f.store,{now:()=>base+3600010,connected:()=>true,generate:()=>{throw Error('duplicate');}});await replacement.tick();assert.equal(f.store.state().items.length,0);assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,spent);replacement.stop();f.close();});
test('settings prevent pending result publication',async()=>{let resolve;const f=fixture(async()=>new Promise(r=>resolve=r));f.set(base+3600000);const task=f.wall.tick();f.store.tx(()=>{const s=f.store.state();updateDaily(s,{...s.daily,enabled:false},base+3600001);f.store.save(s);});resolve({value:{title:'Do not publish me',sources:[]},usage});await task;assert.equal(f.store.state().items.length,0);assert.equal(f.wall.view().runs[0].status,'cancelled');f.close();});
test('budget cap skips without spending or raising cap',async()=>{const f=fixture(async()=>{throw Error('must not call');});f.set(base+3600000);f.store.db.prepare("INSERT INTO budget VALUES('lifetime',3000000)").run();await f.wall.tick();assert.equal(f.wall.view().runs[0].status,'skipped');assert.match(f.wall.view().runs[0].detail,/budget/);assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,3000000);f.close();});
test('research requires successful search, safe citations and fresh news date',()=>{const now=Date.parse('2026-09-17T13:00Z'),text='DATE: 2026-09-17\nA concrete event was announced today. [source]';const r={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text,annotations:[{type:'url_citation',url:'https://example.org/report',title:'Report',start_index:54,end_index:62}]}]}]};assert.equal(parseDaily(r,'afternoon',now).publishedDate,'2026-09-17');const old=structuredClone(r);old.output[1].content[0].text=text.replace('2026-09-17','2026-09-01');assert.throws(()=>parseDaily(old,'afternoon',now),/recent/);assert.throws(()=>parseDaily({...r,output:r.output.slice(1)},'night',now),/sources/);r.output[1].content[0].annotations[0].url='javascript:alert(1)';assert.throws(()=>parseDaily(r,'night',now),/sources/);});
test('settlement includes search fees; interrupted requests retain reservation',()=>{const f=fixture();const id=f.store.tx(()=>f.store.reserve('Echo','shared',{searchBudget:true}));assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,100000);f.store.tx(()=>f.store.settle(id,{...usage,web_search_calls:2}));assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,25175);f.store.status(id,'done');const next=f.store.tx(()=>f.store.reserve('Echo','shared',{searchBudget:true}));f.store.status(next,'interrupted');assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,125175);f.close();});
test('consent and disabling pending reply preserve human comments',async()=>{let calls=0,resolve;const f=fixture(async()=>{calls++;return new Promise(r=>resolve=r);});const s=f.store.state();change(s,'Mahmoud','item.save',{type:'Discussion',title:'A topic'});const id=s.items[0].id;change(s,'Safy','item.comment',{id,text:'Echo, what do you think of this?'});f.store.save(s);await f.wall.comment(id);assert.equal(calls,0);change(s,'Mahmoud','item.echo',{id,value:true});f.store.save(s);const task=f.wall.comment(id);await f.wall.comment(id);assert.equal(calls,1);const current=f.store.state();change(current,'Safy','item.echo',{id,value:false});f.store.save(current);resolve({value:'A pending answer.',usage});await task;assert.equal(f.store.state().items[0].comments.length,1);assert.equal(f.store.state().items[0].comments[0].by,'Safy');f.close();});
test('enabled comments reply once without loops',async()=>{const f=fixture(async()=>({value:'A relevant answer.',usage})),s=f.store.state();change(s,'Mahmoud','item.save',{type:'Discussion',title:'A topic'});const id=s.items[0].id;change(s,'Mahmoud','item.echo',{id,value:true});change(s,'Safy','item.comment',{id,text:'Echo, could you explain this?'});f.store.save(s);await f.wall.comment(id);await f.wall.comment(id);assert.equal(f.store.state().items[0].comments.length,2);f.close();});

test('morning formats cycle without repeating until the other formats have appeared',async()=>{
 const {morningKinds}=await import('../daily-ai.mjs');const picked=[];
 const f=fixture(async args=>{picked.push(args.variant);return {value:{title:'An original post number '+picked.length+' in format '+args.variant,sources:[]},usage:{input_tokens:0,output_tokens:0}};});
 for(let day=0;day<morningKinds.length+1;day++){f.set(base+3600000+day*86400000);await f.wall.tick();}
 assert.equal(picked.length,morningKinds.length+1);assert.equal(new Set(picked.slice(0,morningKinds.length)).size,morningKinds.length);assert.equal(picked.at(-1),picked[0]);f.close();
});


test('night retries once then publishes sourced reserve exactly once and keeps notification consent',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;const e=new Error('No sources');e.usage=usage;throw e;});
 const s=f.store.state();s.daily.notifications=true;f.store.save(s);f.set(Date.parse('2026-09-17T19:00:00Z'));
 await f.wall.tick();await f.wall.tick();assert.equal(calls,2);assert.equal(f.store.state().items.length,1);
 const p=f.store.state().items[0];assert.ok(p.sources.length);assert.equal(p.daily.notify,true);assert.equal(f.wall.view().runs[0].status,'posted');f.close();
});
test('second attempt may succeed with a different topic',async()=>{
 const variants=[];const f=fixture(async a=>{variants.push(a.variant);if(variants.length===1)return {value:null,usage};return {value:{title:'A verified and original replacement.',sources:[]},usage};});
 f.set(Date.parse('2026-09-17T19:00:00Z'));await f.wall.tick();assert.equal(variants.length,2);assert.notEqual(variants[0],variants[1]);assert.equal(f.store.state().items[0].title,'A verified and original replacement.');f.close();
});
test('failed night recovers after grace without AI calls, duplication or changing budget',async()=>{
 const f=fixture(async()=>{throw Error('must not call');});f.set(Date.parse('2026-09-17T20:30:00Z'));
 f.store.db.prepare('INSERT INTO echo_daily_runs VALUES(?,?,?,?,?)').run('2026-09-17:night','failed',null,'No verified sources',new Date(base).toISOString());
 await f.wall.tick();await f.wall.tick();assert.equal(f.store.state().items.length,1);assert.equal(f.wall.view().runs[0].status,'posted');assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);f.close();
});
test('paused Echo blocks recovery and old news is never replaced with evergreen content',async()=>{
 const f=fixture();f.set(Date.parse('2026-09-17T20:30:00Z'));const s=f.store.state();s.pauses=['Mahmoud'];f.store.save(s);
 for(const id of ['night','afternoon'])f.store.db.prepare('INSERT INTO echo_daily_runs VALUES(?,?,?,?,?)').run('2026-09-17:'+id,'failed',null,'No sources',new Date(base).toISOString());
 await f.wall.tick();assert.equal(f.store.state().items.length,0);s.pauses=[];f.store.save(s);await f.wall.tick();assert.equal(f.store.state().items.length,1);assert.equal(f.store.state().items[0].daily.slot,'night');f.close();
});
