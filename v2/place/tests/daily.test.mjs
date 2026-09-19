import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../store.mjs';
import {DailyWall,dailyDefaults,dueSlots,updateDaily} from '../daily.mjs';
import {parseDaily} from '../daily-ai.mjs';
import {change} from '../domain.mjs';
const base=Date.parse('2026-09-17T05:00:00Z'),usage={input_tokens:100,output_tokens:100,web_search_calls:0};
function fixture(generate){const store=new Store(':memory:');let clock=base;const wall=new DailyWall(store,{now:()=>clock,connected:()=>true,generate});return {store,wall,set:v=>clock=v,close:()=>{wall.stop();store.close();}};}
test('Riyadh times, future-only activation, grace window and settings validation',()=>{const cfg=dailyDefaults(base);assert.equal(dueSlots(cfg,base).length,0);assert.equal(dueSlots(cfg,base+5400000)[0].id,'morning');assert.equal(dueSlots(cfg,base+9000000).length,0);const s={daily:cfg,version:0};updateDaily(s,{...cfg,enabled:false},base+5400001);assert.equal(dueSlots(s.daily,base+5400002).length,0);assert.throws(()=>updateDaily(s,{...s.daily,slots:[]}),/three/);assert.throws(()=>updateDaily(s,{...cfg}),/changed/);});
test('at most one post/debit across overlapping ticks, deletion and worker restart',async()=>{let calls=0,resolve;const f=fixture(async()=>{calls++;await new Promise(r=>resolve=r);return {value:{title:'An original thoughtful post for two people.',sources:[]},usage};});f.set(base+5400000);const task=f.wall.tick();await f.wall.tick();assert.equal(calls,1);resolve();await task;assert.equal(f.store.state().items.length,1);const spent=f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used;f.store.tx(()=>{const s=f.store.state();s.items=[];f.store.save(s);});const replacement=new DailyWall(f.store,{now:()=>base+5400010,connected:()=>true,generate:()=>{throw Error('duplicate');}});await replacement.tick();assert.equal(f.store.state().items.length,0);assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,spent);replacement.stop();f.close();});
test('settings prevent pending result publication',async()=>{let resolve;const f=fixture(async()=>new Promise(r=>resolve=r));f.set(base+5400000);const task=f.wall.tick();f.store.tx(()=>{const s=f.store.state();updateDaily(s,{...s.daily,enabled:false},base+5400001);f.store.save(s);});resolve({value:{title:'Do not publish me',sources:[]},usage});await task;assert.equal(f.store.state().items.length,0);assert.equal(f.wall.view().runs[0].status,'cancelled');f.close();});
test('budget cap skips without spending or raising cap',async()=>{const f=fixture(async()=>{throw Error('must not call');});f.set(base+5400000);f.store.db.prepare("INSERT INTO budget VALUES('lifetime',3000000)").run();await f.wall.tick();assert.equal(f.wall.view().runs[0].status,'skipped');assert.match(f.wall.view().runs[0].detail,/budget/);assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,3000000);f.close();});
test('research requires successful search, safe citations and fresh news date',()=>{const now=Date.parse('2026-09-17T13:00Z'),text='DATE: 2026-09-17\nA concrete event was announced today. [source]';const r={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text,annotations:[{type:'url_citation',url:'https://example.org/report',title:'Report',start_index:54,end_index:62}]}]}]};assert.equal(parseDaily(r,'afternoon',now).publishedDate,'2026-09-17');const old=structuredClone(r);old.output[1].content[0].text=text.replace('2026-09-17','2026-09-01');assert.throws(()=>parseDaily(old,'afternoon',now),/recent/);assert.throws(()=>parseDaily({...r,output:r.output.slice(1)},'night',now),/sources/);r.output[1].content[0].annotations[0].url='javascript:alert(1)';assert.throws(()=>parseDaily(r,'night',now),/sources/);});
test('settlement includes search fees; interrupted requests retain reservation',()=>{const f=fixture();const id=f.store.tx(()=>f.store.reserve('Echo','shared',{searchBudget:true}));assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,100000);f.store.tx(()=>f.store.settle(id,{...usage,web_search_calls:2}));assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,25175);f.store.status(id,'done');const next=f.store.tx(()=>f.store.reserve('Echo','shared',{searchBudget:true}));f.store.status(next,'interrupted');assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,125175);f.close();});
test('consent and disabling pending reply preserve human comments',async()=>{let calls=0,resolve;const f=fixture(async()=>{calls++;return new Promise(r=>resolve=r);});const s=f.store.state();change(s,'Mahmoud','item.save',{type:'Discussion',title:'A topic'});const id=s.items[0].id;change(s,'Safy','item.comment',{id,text:'Echo, what do you think of this?'});f.store.save(s);await f.wall.comment(id);assert.equal(calls,0);change(s,'Mahmoud','item.echo',{id,value:true});f.store.save(s);const task=f.wall.comment(id);await f.wall.comment(id);assert.equal(calls,1);const current=f.store.state();change(current,'Safy','item.echo',{id,value:false});f.store.save(current);resolve({value:'A pending answer.',usage});await task;assert.equal(f.store.state().items[0].comments.length,1);assert.equal(f.store.state().items[0].comments[0].by,'Safy');f.close();});
test('enabled comments reply once without loops',async()=>{const f=fixture(async()=>({value:'A relevant answer.',usage})),s=f.store.state();change(s,'Mahmoud','item.save',{type:'Discussion',title:'A topic'});const id=s.items[0].id;change(s,'Mahmoud','item.echo',{id,value:true});change(s,'Safy','item.comment',{id,text:'Echo, could you explain this?'});f.store.save(s);await f.wall.comment(id);await f.wall.comment(id);assert.equal(f.store.state().items[0].comments.length,2);f.close();});

test('morning formats cycle without repeating until the other formats have appeared',async()=>{
 const {morningKinds}=await import('../daily-ai.mjs');const picked=[];
 const f=fixture(async args=>{picked.push(args.variant);return {value:{title:'An original post number '+picked.length+' in format '+args.variant,sources:[]},usage:{input_tokens:0,output_tokens:0}};});
 for(let day=0;day<morningKinds.length+1;day++){f.set(base+5400000+day*86400000);await f.wall.tick();}
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

test('prepares five minutes early, publishes only at schedule, survives restart and notifies once',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return {value:{title:'Prepared morning question about a weekend together.',sources:[]},usage};});
 f.set(base+5400000-240000);await f.wall.tick();assert.equal(calls,1);assert.equal(f.store.state().items.length,0);assert.equal(f.wall.view().runs[0].status,'ready');
 const restarted=new DailyWall(f.store,{now:()=>base+5400000,connected:()=>true,generate:()=>{throw Error('Do not regenerate');}});await restarted.tick();await restarted.tick();assert.equal(f.store.state().items.length,1);assert.equal(f.wall.view().runs[0].status,'posted');restarted.stop();f.close();
});
test('preparation is invalidated by settings changes',async()=>{
 let calls=0;const f=fixture(async()=>({value:{title:'New version of the prepared post '+(++calls),sources:[]},usage}));f.set(base+5400000-120000);await f.wall.tick();const s=f.store.state();updateDaily(s,{...s.daily,comments:true},base+5400000-60000);f.store.save(s);f.set(base+5400000);await f.wall.tick();assert.equal(calls,2);assert.equal(f.store.state().items[0].echoComments,true);f.close();
});
test('rescheduling a deleted post replaces once; deletion alone never does',async()=>{
 let calls=0;const f=fixture(async()=>({value:{title:'A different useful couple post '+(++calls),sources:[]},usage}));f.set(base+5400000);await f.wall.tick();let s=f.store.state();s.items=[];f.store.save(s);await f.wall.tick();assert.equal(calls,1);updateDaily(s,{...s.daily,slots:s.daily.slots.map(x=>x.id==='morning'?{...x,time:'09:45'}:x)},base+5400001);f.store.save(s);f.set(base+6300000);await f.wall.tick();assert.equal(calls,2);assert.equal(f.store.state().items.length,1);f.close();
});
test('failed early night preparation does not publish a reserve before its time',async()=>{
 const f=fixture(async()=>{throw Error('search failure');});f.set(Date.parse('2026-09-17T18:57:00Z'));await f.wall.tick();assert.equal(f.store.state().items.length,0);await f.wall.tick();assert.equal(f.store.state().items.length,0);f.set(Date.parse('2026-09-17T19:00:00Z'));await f.wall.tick();assert.equal(f.store.state().items.length,1);f.close();
});
test('editorial migration changes only morning schedule and replaces a deleted legacy morning once',async()=>{
 const store=new Store(':memory:');const s=store.state();s.daily={...dailyDefaults(base),editorialVersion:undefined,notifications:true,slots:[{id:'morning',time:'09:00',enabled:true},{id:'afternoon',time:'16:00',enabled:true},{id:'night',time:'21:00',enabled:true}]};store.save(s);store.db.exec('CREATE TABLE echo_daily_runs(key TEXT PRIMARY KEY,status TEXT NOT NULL,job TEXT,detail TEXT,createdAt TEXT NOT NULL)');store.db.prepare('INSERT INTO echo_daily_runs VALUES(?,?,?,?,?)').run('2026-09-17:morning','posted',null,null,new Date(base+3600000).toISOString());const wall=new DailyWall(store,{now:()=>base+5500000,connected:()=>true,generate:async()=>({value:{title:'A reviewed replacement for the deleted morning post.',sources:[]},usage})});await wall.tick();assert.equal(store.state().daily.slots[0].time,'09:30');assert.equal(store.state().daily.slots[2].time,'21:00');assert.equal(store.state().daily.notifications,true);assert.equal(store.state().items.length,1);await wall.tick();assert.equal(store.state().items.length,1);wall.stop();store.close();
});
test('afternoon always requests news rather than a night format',async()=>{let format;const f=fixture(async a=>{format=a.variant;return {value:{title:'A verified current event with an interesting detail.',sources:[]},usage};});f.set(Date.parse('2026-09-17T13:00:00Z'));await f.wall.tick();assert.equal(format,'a current verified non-negative world news report');f.close();});

test('news retries after cooldown, survives restart, prepares early and publishes once at schedule',async()=>{
 let calls=0,clock=Date.parse('2026-09-17T12:45Z');const seen=[];
 const generate=async a=>{seen.push(a);if(++calls<=2){const e=Error('Editorial review: source date missing');e.usage=usage;throw e;}return {value:{title:'A fresh verified event selected on retry.',sources:[{url:'https://example.org/news'}],publishedDate:'2026-09-17'},usage};};
 const f=fixture(generate);f.set(clock);const s=f.store.state();s.daily.notifications=true;f.store.save(s);
 await f.wall.tick();assert.equal(calls,2);assert.equal(f.wall.view().runs[0].status,'retrying');assert.equal(f.store.state().items.length,0);await f.wall.tick();assert.equal(calls,2);
 const restarted=new DailyWall(f.store,{now:()=>clock,connected:()=>true,generate});clock+=5*60000;await restarted.tick();assert.equal(calls,3);assert.equal(f.wall.view().runs[0].status,'ready');assert.match(seen[2].previousFailure,/source date/);assert.notEqual(seen[0].signal,seen[1].signal);
 clock=Date.parse('2026-09-17T13:00Z');await restarted.tick();await restarted.tick();assert.equal(f.store.state().items.length,1);assert.equal(f.store.state().items[0].daily.notify,true);assert.equal(calls,3);restarted.stop();f.close();
});
test('news retry count is bounded across restarts and never publishes invented fallback',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;const e=Error('No verified sources');e.usage=usage;throw e;});const at=Date.parse('2026-09-17T13:00Z');f.set(at);await f.wall.tick();f.set(at+5*60000);await f.wall.tick();assert.equal(calls,4);assert.equal(f.wall.view().runs[0].status,'failed');
 const restarted=new DailyWall(f.store,{now:()=>at+10*60000,connected:()=>true,generate:async()=>{calls++;throw Error('Must not retry');}});await restarted.tick();assert.equal(calls,4);assert.equal(f.store.state().items.length,0);restarted.stop();f.close();
});
test('legacy failed afternoon recovers after the old one-hour window with notification consent',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return {value:{title:'A current sourced event after recovery.',sources:[{url:'https://example.org/news'}],publishedDate:'2026-09-17'},usage};});
 f.set(Date.parse('2026-09-17T14:10Z'));f.store.db.prepare('INSERT INTO echo_daily_runs VALUES(?,?,?,?,?)').run('2026-09-17:afternoon','failed',null,'Legacy failure',new Date(base).toISOString());await f.wall.tick();await f.wall.tick();assert.equal(calls,1);assert.equal(f.store.state().items.length,1);assert.equal(f.store.state().items[0].daily.slot,'afternoon');f.close();
});
test('news retry respects pause, disabled slot and budget without raising caps',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;const e=Error('No sources');e.usage=usage;throw e;});const at=Date.parse('2026-09-17T13:00Z');f.set(at);await f.wall.tick();f.set(at+5*60000);
 let s=f.store.state();s.pauses=['Safy'];f.store.save(s);await f.wall.tick();assert.equal(calls,2);
 s.pauses=[];s.daily.slots.find(x=>x.id==='afternoon').enabled=false;f.store.save(s);await f.wall.tick();assert.equal(calls,2);
 s.daily.slots.find(x=>x.id==='afternoon').enabled=true;f.store.save(s);f.store.db.prepare("UPDATE budget SET used=3000000 WHERE key='lifetime'").run();await f.wall.tick();assert.equal(calls,2);assert.equal(f.store.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,3000000);f.close();
});
