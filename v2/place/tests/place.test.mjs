import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../store.mjs';
import {change,initial,project,questions} from '../domain.mjs';
import {createApp} from '../server.mjs';
import {events,respond} from '../ai.mjs';

const quiz=[{q:'Secret first question',options:['A','B'],correct:1},{q:'What would you like to try?',options:[],correct:-1}];
test('server projection omits removed preparation, solutions and future questions',()=>{
 const s=initial();assert.equal(project(s,'Mahmoud').draft,undefined);change(s,'Safy','quiz.launch',{target:'Mahmoud',questions:quiz});const view=project(s,'Mahmoud');assert.equal(view.activity.current.q,quiz[0].q);assert.ok(!JSON.stringify(view).includes('correct'));assert.ok(!JSON.stringify(view).includes(quiz[1].q));
});
test('quiz enforces target, question identity, both pauses and distinct completion',()=>{
 const s=initial();change(s,'Safy','quiz.launch',{target:'Mahmoud',questions:quiz});const p={activity:s.activity.id,index:0,option:1};
 assert.throws(()=>change(s,'Safy','quiz.answer',p),/partner/);change(s,'Mahmoud','quiz.pause',{value:true});change(s,'Safy','quiz.pause',{value:true});change(s,'Mahmoud','quiz.pause',{value:false});assert.throws(()=>change(s,'Mahmoud','quiz.answer',p),/paused/);change(s,'Safy','quiz.pause',{value:false});change(s,'Mahmoud','quiz.answer',p);assert.equal(s.activity.score,1);assert.throws(()=>change(s,'Mahmoud','quiz.answer',p),/changed/);change(s,'Mahmoud','quiz.answer',{activity:s.activity.id,index:1,answer:'A walk'});assert.equal(s.items.length,0);change(s,'Mahmoud','quiz.share');assert.equal(s.items[0].status,'completed');assert.equal(s.items[0].done,true);
 change(s,'Safy','quiz.launch',{target:'Mahmoud',questions:quiz});change(s,'Safy','quiz.end');assert.equal(s.items.length,1);change(s,'Mahmoud','quiz.share');assert.equal(s.items[0].status,'abandoned');assert.equal(s.items[0].done,false);
});
test('agreements need independent consent and stale edits cannot overwrite',()=>{
 const s=initial();change(s,'Mahmoud','item.save',{type:'Agreement',title:'A quiet hour'});const i=s.items[0];change(s,'Mahmoud','item.approve',{id:i.id,revision:1,value:true});assert.deepEqual(i.approvals,['Mahmoud']);assert.throws(()=>change(s,'Safy','item.approve',{id:i.id,revision:1,value:true}),/changed/);change(s,'Safy','item.approve',{id:i.id,revision:2,value:true});assert.equal(i.approvals.length,2);change(s,'Mahmoud','item.save',{id:i.id,revision:3,type:'Agreement',title:'A quiet evening'});assert.equal(i.approvals.length,0);
 change(s,'Safy','item.save',{type:'Plan',title:'Trip one'});change(s,'Safy','item.save',{type:'Plan',title:'Trip two'});change(s,'Mahmoud','item.done',{id:s.items[0].id,revision:1,value:true});assert.equal(s.items[1].done,false);
});
test('malformed quizzes are rejected before publication',()=>{for(const v of [[],[{q:'x',options:['one'],correct:-1}],[{q:'x',options:['a','b'],correct:2}],[{q:'x',options:[],correct:0}]])assert.throws(()=>questions(v));});
test('durable receipts bind actor and payload, and rollback failed actions',()=>{
 const s=new Store(':memory:'),id=randomUUID();let times=0;const call=()=>s.once('Mahmoud',id,{x:1},()=>({n:++times}));assert.deepEqual(call(),call());assert.equal(times,1);assert.throws(()=>s.once('Safy',id,{x:1},()=>({})),/already used/);assert.throws(()=>s.once('Mahmoud',id,{x:2},()=>({})),/already used/);const broken=randomUUID();assert.throws(()=>s.once('Mahmoud',broken,{},()=>{s.message({id:broken,author:'Mahmoud',text:'no',aiAllowed:false});throw Error('rollback');}));assert.equal(s.messages().length,0);s.close();
});
test('restart retains legacy drafts outside the API while preserving chat, pauses and budget',()=>{
 const dir=mkdtempSync(join(tmpdir(),'place-')),path=join(dir,'db');let s=new Store(path);const state=initial();state.drafts={Safy:quiz,Mahmoud:[]};change(state,'Mahmoud','pause',{value:true});s.save(state);s.message({id:randomUUID(),author:'Safy',text:'Still here',aiAllowed:false});const job=s.tx(()=>s.reserve('Safy','private',{prompt:'x'}));s.close();s=new Store(path);assert.equal(s.state().drafts.Safy.length,2);assert.equal(s.snapshot('Safy').draft,undefined);assert.equal(s.snapshot('Mahmoud').draft,undefined);assert.deepEqual(s.state().pauses,['Mahmoud']);assert.equal(s.messages()[0].text,'Still here');assert.equal(s.job(job).status,'interrupted');assert.equal(s.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,50000);s.close();rmSync(dir,{recursive:true});
});
test('one-time and monthly budgets enforce reservations and settle known usage',()=>{
 const s=new Store(':memory:');let id=s.tx(()=>s.reserve('Safy','shared',{}));s.tx(()=>{s.settle(id,{input_tokens:1000,output_tokens:100});s.status(id,'done');});assert.equal(s.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,400);s.db.prepare("UPDATE budget SET used=2990000 WHERE key='lifetime'").run();assert.throws(()=>s.tx(()=>s.reserve('Safy','shared',{})),/budget/);s.db.prepare("UPDATE budget SET used=0 WHERE key='lifetime'").run();s.db.prepare("UPDATE budget SET used=3990000 WHERE key<>'lifetime'").run();assert.throws(()=>s.tx(()=>s.reserve('Safy','shared',{})),/budget/);s.close();
});
test('message pagination does not skip messages with the same timestamp',()=>{const s=new Store(':memory:');for(let i=0;i<65;i++)s.message({id:randomUUID(),author:'Mahmoud',text:String(i),aiAllowed:true});const latest=s.messages(),prior=s.messages(latest[0].sequence);assert.equal(latest.length,60);assert.equal(prior.length,5);assert.equal(new Set([...latest,...prior].map(x=>x.id)).size,65);s.close();});
test('SSE parser handles fragmented UTF-8 and multiline events',async()=>{
 const b=Buffer.from('event: response.output_text.delta\ndata: {"delta":"أهلاً"}\n\ndata: {"done":true}\n\n');async function* chunks(){for(let i=0;i<b.length;i+=3)yield b.subarray(i,i+3);}const output=[];for await(const e of events(chunks()))output.push(e);assert.deepEqual(output,[{delta:'أهلاً'},{done:true}]);
});
test('provider streams text immediately and validates quiz tool output',async()=>{
 process.env.OPENAI_API_KEY='test-only';let observed='';const eventList=[{type:'response.output_text.delta',delta:'Hello'},{type:'response.completed',response:{usage:{input_tokens:10,output_tokens:20},output:[{type:'function_call',name:'start_quiz',arguments:JSON.stringify({title:'Play',questions:quiz,target:'Mahmoud'})}]}}];
 const r=await respond({actor:'Safy',prompt:'Quiz',context:'',onText:t=>observed+=t,fetcher:async(_url,opts)=>{const p=JSON.parse(opts.body);assert.equal(p.stream,true);assert.equal(p.store,false);assert.equal(p.model,'gpt-5.6-luna');return new Response(eventList.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));}});assert.equal(observed,'Hello');assert.equal(r.proposals[0].questions.length,2);
});
test('Our Space creation requests a usable item proposal without changing the model or adding a second AI call',async()=>{
 process.env.OPENAI_API_KEY='test-only';let calls=0;
 const result=await respond({actor:'Mahmoud',prompt:'Plan our evening',purpose:'space',context:'',onText(){},fetcher:async(_url,opts)=>{
  calls++;const body=JSON.parse(opts.body);assert.equal(body.tool_choice.name,'propose_item');assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.parallel_tool_calls,false);assert.match(body.instructions,/ready-to-use/);
  return new Response('data: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:10,output_tokens:10},output:[{type:'function_call',name:'propose_item',arguments:JSON.stringify({type:'Plan',title:'Our evening\n1. Choose a film\n2. Play a quiz'})}]}})+'\n\n');
 }});
 assert.equal(calls,1);assert.equal(result.proposals[0].itemType,'Plan');assert.match(result.proposals[0].title,/Choose a film/);
});

test('two authenticated HTTP clients: shared chat, private preparation, live stream and cancellation',async t=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';process.env.OPENAI_API_KEY='test-only';
 const s=new Store(':memory:');let activeAI,release,nextProposals=[];const ai=async args=>{activeAI=args;args.onText('Beginning');return new Promise(resolve=>{release=()=>resolve({proposals:nextProposals,usage:{input_tokens:20,output_tokens:10}});args.signal.addEventListener('abort',()=>{args.onText('MUST NOT PUBLISH');release();},{once:true});});};
 const authFetch=async(url,opts)=>{let name;if(url.includes('/token?')){const b=JSON.parse(opts.body);if(b.password!=='test-password')return new Response('{}',{status:400});name=b.email.split('@')[0];}else name=opts.headers.Authorization.split(' ')[1];const user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store:s,origin:'http://localhost',secret:'test secret with more than thirty two characters',testing:true,authFetch,ai});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const cookies={};
 const request=async(name,path,data,headers={})=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:'http://localhost',Cookie:cookies[name]??'','Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});const c=r.headers.get('set-cookie');if(c)cookies[name]=c.split(';')[0];return {status:r.status,body:await r.json()};};
 const cmd=(who,type,data={},id=randomUUID())=>request(who,'command',{id,type,data});
 const waitJob=async id=>{for(let i=0;i<100&&s.job(id).status==='running';i++)await new Promise(r=>setTimeout(r,5));};
 try{
 await t.test('reject unauthenticated and forged-origin requests',async()=>{assert.equal((await request('none','state')).status,401);assert.equal((await request('none','login',{email:'mahmoud@example.test',password:'test-password'},{Origin:'http://evil.test'})).status,403);});
 for(const who of ['mahmoud','safy'])assert.equal((await request(who,'login',{email:who+'@example.test',password:'test-password'})).status,200);
 await t.test('journey progress is private, durable, revision checked and authenticated',async()=>{
 const d={revision:0,unlocked:5,current:4,complete:false,who:'Safy'};
 assert.equal((await cmd('mahmoud','journey.save',d)).status,200);
 assert.equal(s.state().journeys.Mahmoud.unlocked,5);assert.equal(s.state().journeys.Safy,undefined);
 assert.equal((await cmd('mahmoud','journey.save',d)).status,409);
 assert.equal((await cmd('safy','journey.save',{revision:0,unlocked:11,current:null,complete:false})).status,400);
 assert.ok(!JSON.stringify((await request('safy','state')).body).includes('journeys'));
 const unauth=await fetch(base+'/api/journey/play');assert.equal(unauth.status,401);
 const page=await fetch(base+'/api/journey/play',{headers:{Cookie:cookies.mahmoud}});assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('"unlocked":5,"current":4'));assert.ok(!html.includes('__JOURNEY_PROGRESS__'));assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'self'"));
 const other=await fetch(base+'/api/journey/play',{headers:{Cookie:cookies.safy}});assert.ok((await other.text()).includes('"unlocked":1,"current":null'));
 });
 await t.test('same room; message receipt deduplicates retries',async()=>{const id=randomUUID();await cmd('mahmoud','message',{text:'Hello Safy'},id);await cmd('mahmoud','message',{text:'Hello Safy'},id);const v=(await request('safy','state')).body;assert.equal(v.who,'Safy');assert.equal(v.messages.length,1);assert.equal(v.messages[0].text,'Hello Safy');});
 await t.test('private draft is absent from partner API and export',async()=>{assert.equal((await cmd('safy','draft.save',{questions:quiz})).status,400);assert.equal((await cmd('safy','quiz.start')).status,400);assert.equal((await request('mahmoud','state')).body.draft,undefined);assert.ok(!JSON.stringify((await request('mahmoud','export')).body).includes('Secret first question'));});
 await t.test('SSE carries a saved message to a second authenticated connection',async()=>{const controller=new AbortController();const response=await fetch(base+'/api/events',{headers:{Cookie:cookies.safy},signal:controller.signal});const reader=response.body.getReader();await reader.read();await cmd('mahmoud','message',{text:'Stream delivery'});let received='';for(let i=0;i<5&&!received.includes('Stream delivery');i++)received+=new TextDecoder().decode((await reader.read()).value);assert.ok(received.includes('Stream delivery'));controller.abort();});
 await t.test('slow AI does not hold the human chat transaction; other person can stop it',async()=>{const r=await cmd('mahmoud','ai.ask',{prompt:'Talk to us'});assert.equal(r.status,200);const id=r.body.job;for(let i=0;i<100&&!activeAI;i++)await new Promise(r=>setTimeout(r,5));assert.ok(activeAI);assert.ok(!activeAI.context.includes('Secret first question'));const human=await cmd('safy','message',{text:'While Echo thinks'});assert.equal(human.status,200);assert.equal(s.job(id).status,'running');await cmd('safy','pause',{value:true});await waitJob(id);await new Promise(r=>setImmediate(r));assert.equal(s.job(id).status,'cancelled');assert.ok(!s.messages().find(m=>m.id===id).text.includes('MUST NOT PUBLISH'));});
 await t.test('Just Us messages are excluded; Ask once does not resume AI',async()=>{await cmd('safy','message',{text:'Private pause text'});assert.equal((await cmd('mahmoud','ai.ask',{prompt:'No explicit once'})).status,409);activeAI=null;const r=await cmd('mahmoud','ai.ask',{prompt:'One answer',once:true});for(let i=0;i<100&&!activeAI;i++)await new Promise(r=>setTimeout(r,5));assert.equal(activeAI.context,'');release();await waitJob(r.body.job);assert.deepEqual(s.state().pauses,['Safy']);await cmd('safy','pause',{value:false});});
 await t.test('Ocho HTTP actions persist, hide hands, enforce revisions and deduplicate receipts',async()=>{
  const createId=randomUUID();let r=await cmd('mahmoud','ocho.create',{mode:'shared',turnSeconds:0},createId);assert.equal(r.status,200);
  const first=(await request('mahmoud','state')).body.ocho.shared;
  assert.equal((await cmd('mahmoud','ocho.create',{mode:'shared',turnSeconds:0},createId)).status,200);
  assert.equal((await request('mahmoud','state')).body.ocho.shared.id,first.id);
  assert.equal((await cmd('safy','ocho.accept',{game:first.id,revision:first.revision})).status,200);
  const a=(await request('mahmoud','state')).body.ocho.shared,b=(await request('safy','state')).body.ocho.shared;
  assert.equal(a.hand.length,8);assert.equal(b.hand.length,8);assert.equal(a.opponentCount,8);
  assert.equal(a.hand.some(c=>b.hand.some(d=>d.id===c.id)),false);assert.equal('stock' in a,false);assert.equal('hands' in a,false);
  assert.equal((await cmd('safy','ocho.draw',{game:a.id,revision:a.revision})).status,409);
  const card=a.hand.find(c=>a.legal.includes(c.id)),move=card?'play':'draw',data={game:a.id,revision:a.revision,...(card?{card:card.id,color:'blue'}:{})},receipt=randomUUID();
  assert.equal((await cmd('mahmoud','ocho.'+move,data,receipt)).status,200);
  const after=(await request('mahmoud','state')).body.ocho.shared;
  assert.equal((await cmd('mahmoud','ocho.'+move,data,receipt)).status,200);
  assert.equal((await request('mahmoud','state')).body.ocho.shared.revision,after.revision);
  assert.equal((await cmd('mahmoud','ocho.pause',{game:a.id,revision:a.revision})).status,409);
  assert.equal((await cmd('mahmoud','ocho.pause',{game:after.id,revision:after.revision})).status,200);
  assert.deepEqual((await request('safy','state')).body.ocho.shared.pausedBy,['Mahmoud']);
 });
 await t.test('private proposals require owner and never expose solutions',async()=>{const id=randomUUID();s.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run(id,'Safy','private','done',JSON.stringify({proposals:[{type:'quiz',title:'New quiz',questions:quiz}]}),new Date().toISOString());assert.ok(!(await request('mahmoud','state')).body.proposals.some(p=>p.job===id));assert.equal((await cmd('mahmoud','proposal.accept',{job:id})).status,403);assert.ok(!JSON.stringify((await request('safy','state')).body.proposals).includes('correct'));assert.equal((await cmd('safy','proposal.accept',{job:id})).status,410);});
 await t.test('media requires authentication, sniffs bytes and rejects HTML',async()=>{assert.equal((await request('safy','photos',{data:Buffer.from('<script>alert(1)</script>').toString('base64')})).status,400);const png=Buffer.from([137,80,78,71,13,10,26,10,0,0]);const p=await request('safy','photos',{data:png.toString('base64')});assert.equal(p.status,201);const r=await fetch(base+'/api/photos/'+p.body.id);assert.equal(r.status,401);});
 await t.test('source lookup requires authentication and returns the exact shared message',async()=>{
  const id=randomUUID();await cmd('mahmoud','message',{text:'Source of our plan'},id);
  assert.equal((await request('none','messages/'+id)).status,401);
  const found=await request('safy','messages/'+id);assert.equal(found.status,200);assert.equal(found.body.text,'Source of our plan');assert.ok(found.body.sequence>0);
  assert.equal((await request('safy','messages/'+randomUUID())).status,404);
 });
 await t.test('dismissal removes only the chosen suggestion persistently and enforces ownership',async()=>{
  const id=randomUUID();s.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run(id,'Safy','shared','done',JSON.stringify({proposals:[{type:'item',itemType:'Idea',title:'Dismiss me'},{type:'item',itemType:'Plan',title:'Keep me'}]}),new Date().toISOString());
  const before=s.state().items.length;
  assert.equal((await cmd('mahmoud','proposal.dismiss',{job:id,index:0})).status,403);
  assert.equal((await cmd('safy','proposal.dismiss',{job:id,index:2})).status,404);
  assert.equal((await cmd('safy','proposal.dismiss',{job:id,index:0})).status,200);
  assert.equal(s.state().items.length,before);
  assert.deepEqual(JSON.parse(s.job(id).body).dismissedIndices,[0]);
  for(let i=0;i<2;i++)assert.deepEqual((await request('safy','state')).body.proposals.filter(p=>p.job===id).map(p=>p.index),[1]);
  assert.equal((await cmd('safy','proposal.accept',{job:id,index:0})).status,409);
  assert.equal((await cmd('safy','proposal.accept',{job:id,index:1})).status,200);
  assert.equal(s.state().items.length,before+1);
  assert.ok(!(await request('safy','state')).body.proposals.some(p=>p.job===id));
 });
 await t.test('each proposal accepts its own index once and remains private to its requester',async()=>{
  const id=randomUUID();s.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run(id,'Safy','shared','done',JSON.stringify({proposals:[{type:'item',itemType:'Idea',title:'First idea'},{type:'item',itemType:'Plan',title:'Second plan'}]}),new Date().toISOString());
  assert.equal((await cmd('mahmoud','proposal.accept',{job:id,index:1})).status,403);
  assert.equal((await cmd('safy','proposal.accept',{job:id,index:2})).status,404);
  assert.equal((await cmd('safy','proposal.accept',{job:id,index:1})).status,200);
  assert.equal(s.state().items[0].title,'Second plan');
  const remaining=(await request('safy','state')).body.proposals.filter(p=>p.job===id);assert.equal(remaining.length,1);assert.equal(remaining[0].index,0);assert.equal(remaining[0].title,'First idea');
  assert.equal((await cmd('safy','proposal.accept',{job:id,index:1})).status,409);
  assert.equal((await cmd('safy','proposal.accept',{job:id,index:0})).status,200);
  assert.equal(s.state().items[0].title,'First idea');
  assert.ok(!(await request('safy','state')).body.proposals.some(p=>p.job===id));
 });
 await t.test('pins use server message text and are shared, reversible and idempotent',async()=>{
 const id=randomUUID();await cmd('mahmoud','message',{text:'Our pinned plan'},id);
 const key=randomUUID();const payload={id,value:true,text:'spoofed',author:'Echo'};
 assert.equal((await cmd('mahmoud','message.pin',payload,key)).status,200);
 assert.equal((await cmd('mahmoud','message.pin',payload,key)).status,200);
 const view=(await request('safy','state')).body;assert.equal(view.pins[0].text,'Our pinned plan');assert.equal(view.pins[0].author,'Mahmoud');
 assert.equal((await cmd('safy','message.pin',{id:randomUUID(),value:true})).status,404);
 await cmd('safy','message.pin',{id,value:false});assert.equal((await request('mahmoud','state')).body.pins.length,0);
 });
 await t.test('shared invitation persists and either partner can stop it and rejects removed private preparation',async()=>{
 await cmd('mahmoud','echo.invite',{value:true});
 assert.equal((await request('safy','state')).body.echoInvited,true);
 await cmd('safy','message',{text:'Still invited'});assert.equal((await request('mahmoud','state')).body.echoInvited,true);
 const response=await cmd('mahmoud','ai.ask',{prompt:'Join us',session:true});assert.equal(response.status,200);
 await cmd('safy','echo.invite',{value:false});await waitJob(response.body.job);
 assert.equal(s.job(response.body.job).status,'cancelled');
 assert.equal((await cmd('mahmoud','ai.ask',{prompt:'Stale request',session:true})).status,409);
 const prep=await cmd('mahmoud','ai.ask',{prompt:'Private prep',private:true});assert.equal(prep.status,410);
 });
 await t.test('delete removes only the selected space item and rejects stale revisions',async()=>{
 await cmd('mahmoud','item.save',{type:'Plan',title:'Delete test'});
 const item=(await request('safy','state')).body.items.find(i=>i.title==='Delete test');
 const count=s.messages().length;
 assert.equal((await cmd('safy','item.delete',{id:item.id,revision:item.revision+1})).status,409);
 assert.equal((await cmd('safy','item.delete',{id:item.id,revision:item.revision})).status,200);
 assert.ok(!(await request('mahmoud','state')).body.items.some(i=>i.id===item.id));assert.equal(s.messages().length,count);
 });
 await t.test('completed shared AI tool starts a real activity without proposal acceptance',async()=>{
 nextProposals=[{type:'start',target:'Safy',title:'Live',questions:quiz}];
 const job=await cmd('mahmoud','ai.ask',{prompt:'Ask Safy now',once:true});assert.equal(job.status,200);release();await waitJob(job.body.job);
 const view=(await request('safy','state')).body;assert.equal(view.activity.status,'active');assert.equal(view.activity.target,'Safy');assert.equal(view.activity.current.q,quiz[0].q);
 assert.ok(!view.proposals.some(p=>p.type==='start'));nextProposals=[];await cmd('mahmoud','quiz.end');
 });
 await t.test('background is shared, revision guarded and references only stored photos',async()=>{
 const photo=randomUUID();s.db.prepare('INSERT INTO photos VALUES(?,?,?,?)').run(photo,'image/png',Buffer.from([137,80,78,71,13,10,26,10]),new Date().toISOString());
 assert.equal((await cmd('mahmoud','wallpaper.set',{image:randomUUID(),revision:0})).status,404);
 assert.equal((await cmd('mahmoud','wallpaper.set',{image:photo,revision:0})).status,200);
 assert.equal((await request('safy','state')).body.wallpaper.image,photo);
 assert.equal((await cmd('safy','wallpaper.set',{image:null,revision:0})).status,409);
 assert.equal((await cmd('safy','wallpaper.set',{image:null,revision:1})).status,200);
 assert.equal((await request('mahmoud','state')).body.wallpaper.image,null);
 assert.ok(s.db.prepare('SELECT id FROM photos WHERE id=?').get(photo));
 });
 await t.test('post questions stay in their own thread with streaming, follow-up context, and deletion',async()=>{
  nextProposals=[];await cmd('mahmoud','item.save',{type:'Idea',title:'WALL TEST: keep it here'});let item=s.state().items[0];const before=s.messages().length;
  const receipt=randomUUID(),payload={id:item.id,question:'What would make this fun?',once:true};const response=await cmd('mahmoud','item.ask',payload,receipt);assert.equal(response.status,200);assert.equal((await cmd('mahmoud','item.ask',payload,receipt)).body.job,response.body.job);
  assert.equal(activeAI.purpose,'wall');assert.ok(activeAI.context.includes('WALL TEST'));assert.equal(s.messages().length,before);let view=(await request('safy','state')).body.items.find(i=>i.id===item.id);assert.equal(view.comments.length,2);assert.equal(view.comments[0].by,'Mahmoud');assert.equal(view.comments[1].text,'Beginning');
  release();await waitJob(response.body.job);view=(await request('safy','state')).body.items.find(i=>i.id===item.id);assert.equal(view.comments[1].status,'sent');assert.equal(s.messages().length,before);
  const follow=await cmd('safy','item.ask',{id:item.id,question:'Tell me more',once:true});assert.equal(follow.status,200);assert.ok(activeAI.context.includes('What would make this fun?'));assert.ok(activeAI.context.includes('Beginning'));
  item=s.state().items.find(i=>i.id===item.id);assert.equal((await cmd('mahmoud','item.delete',{id:item.id,revision:item.revision})).status,200);await waitJob(follow.body.job);assert.equal(s.job(follow.body.job).status,'cancelled');assert.equal((await request('safy','state')).body.items.some(i=>i.id===item.id),false);assert.equal((await cmd('mahmoud','item.ask',{id:item.id,question:'Gone?',once:true})).status,404);
 });
 await t.test('wall assets load and gallery references are checked before saving',async()=>{
  for(const path of ['/wall.js','/wall.css'])assert.equal((await fetch(base+path)).status,200);
  const before=(await request('mahmoud','state')).body.items.length;
  const result=await cmd('mahmoud','item.save',{type:'Photo',title:'Missing photo',images:[randomUUID()]});
  assert.equal(result.status,404);assert.equal((await request('mahmoud','state')).body.items.length,before);
 });
 await t.test('quiz reactions follow actual answers, catch up after fast completion, and never publish',async()=>{
 const state=s.state();change(state,'Mahmoud','quiz.launch',{host:'Echo',target:'Mahmoud',title:'Clouds',questions:quiz});s.save(state);const activity=state.activity.id,before=s.state().items.length;
 const receipt=randomUUID(),payload={activity,index:0,option:1};let answer=await cmd('mahmoud','quiz.answer',payload,receipt);
 assert.equal(answer.status,200);assert.ok(answer.body.job);const reaction=answer.body.job;
 assert.equal((await cmd('mahmoud','quiz.answer',payload,receipt)).body.job,reaction);
 assert.equal(activeAI.purpose,'activity');assert.ok(activeAI.context.includes('Secret first question'));assert.ok(!activeAI.context.includes('What would you like to try?'));
 assert.equal((await cmd('mahmoud','quiz.answer',{activity,index:1,answer:'A walk'})).status,200);
 assert.equal(s.state().items.length,before);release();await waitJob(reaction);
 for(let i=0;i<100&&!JSON.parse(activeAI.context).final;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(JSON.parse(activeAI.context).final,true);assert.match(activeAI.context,/A walk/);
 const finalJob=s.state().activities.find(a=>a.id===activity).feedback.find(f=>f.final).id;release();await waitJob(finalJob);
 const a=s.state().activities.find(a=>a.id===activity);assert.equal(a.feedback.find(f=>f.final).status,'sent');assert.equal(s.state().items.length,before);
 assert.equal((await cmd('safy','quiz.share',{activity})).status,403);
 assert.equal((await cmd('mahmoud','quiz.share',{activity})).status,200);assert.equal((await cmd('mahmoud','quiz.share',{activity})).status,200);assert.equal(s.state().items.length,before+1);
 });
 await t.test('budget exhaustion cannot discard an answer or publish an ended activity',async()=>{
 const state=s.state();change(state,'Mahmoud','quiz.launch',{host:'Echo',target:'Mahmoud',questions:quiz});s.save(state);const activity=state.activity.id,before=state.items.length;
 const old=s.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used;s.db.prepare("UPDATE budget SET used=3000000 WHERE key='lifetime'").run();
 assert.equal((await cmd('mahmoud','quiz.answer',{activity,index:0,option:0})).status,200);
 assert.equal(s.state().activity.answers.length,1);assert.equal((await cmd('mahmoud','quiz.end',{activity})).status,200);
 assert.equal(s.state().activity.status,'abandoned');assert.equal(s.state().items.length,before);
 s.db.prepare("UPDATE budget SET used=? WHERE key='lifetime'").run(old);
 });
 await t.test('logout revokes the old cookie server-side',async()=>{const old=cookies.mahmoud;await request('mahmoud','logout',{});cookies.mahmoud=old;assert.equal((await request('mahmoud','state')).status,401);});
 }finally{release?.();server.closeAllConnections();await new Promise(r=>server.close(r));s.close();}
});

test('shared pins support old state, both profiles, deduplication and unpin',()=>{
 const s=initial();assert.deepEqual(project(s,'Safy').pins,[]);
 change(s,'Mahmoud','message.pin',{id:'one',value:true,text:'Meet at eight',author:'Safy'});
 change(s,'Mahmoud','message.pin',{id:'one',value:true,text:'Meet at eight',author:'Safy'});
 assert.equal(project(s,'Safy').pins.length,1);
 change(s,'Safy','message.pin',{id:'one',value:false});assert.equal(project(s,'Mahmoud').pins.length,0);
});

test('live ten-question round saves every answer and shares once',()=>{
 const s=initial();
 const qs=Array.from({length:10},(_,i)=>({q:'Question '+i,options:['A','B'],correct:0}));
 change(s,'Mahmoud','quiz.launch',{target:'Safy',questions:qs});const id=s.activity.id;
 assert.equal(s.drafts,undefined);

 for(let i=0;i<10;i++){assert.equal(project(s,'Safy').activity.current.q,'Question '+i);change(s,'Safy','quiz.answer',{activity:id,index:i,option:0});}
 assert.equal(s.activity.answers.length,10);assert.equal(s.activity.score,10);assert.equal(s.items.length,0);change(s,'Safy','quiz.share',{activity:id});assert.equal(s.items[0].type,'Result');
 assert.throws(()=>change(s,'Safy','quiz.answer',{activity:id,index:9,option:0}),/changed/);assert.equal(s.items.length,1);
});
test('provider offers live surprises without a private preparation tool',async()=>{
 process.env.OPENAI_API_KEY='test-only';
 const result=await respond({actor:'Mahmoud',prompt:'Surprise us',context:'',onText(){},fetcher:async(_url,opts)=>{
 const body=JSON.parse(opts.body);assert.match(body.instructions,/Use English by default/);assert.match(body.instructions,/Private preparation has been removed/);
 assert.equal(body.tools.some(t=>t.name==='start_quiz'),true);assert.equal(body.tools.some(t=>t.name==='prepare_quiz'),false);
 return new Response('data: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:1,output_tokens:1},output:[{type:'function_call',name:'start_quiz',arguments:JSON.stringify({title:'Round',questions:quiz,target:'Safy'})}]}})+'\n\n');
 }});assert.equal(result.proposals[0].type,'start');
});

test('multiple activities survive serialization with separate progress, controls and results',()=>{
 let s=initial();change(s,'Mahmoud','quiz.launch',{target:'Safy',questions:quiz,afterSequence:5});const first=s.activity.id;
 change(s,'Safy','quiz.launch',{target:'Mahmoud',questions:quiz,afterSequence:10});const second=s.activity.id;
 s=JSON.parse(JSON.stringify(s));
 change(s,'Safy','quiz.answer',{activity:first,index:0,option:1,afterSequence:15});
 assert.equal(s.activities.find(a=>a.id===first).index,1);assert.equal(s.activities.find(a=>a.id===first).afterSequence,15);
 assert.equal(s.activities.find(a=>a.id===second).index,0);
 change(s,'Mahmoud','quiz.pause',{activity:first,value:true});
 assert.equal(s.activities.find(a=>a.id===second).pauses.length,0);
 change(s,'Mahmoud','quiz.end',{activity:second});assert.equal(s.items.length,0);change(s,'Mahmoud','quiz.share',{activity:second});assert.equal(s.items[0].source,second);
 assert.equal(s.activities.find(a=>a.id===first).status,'active');
 const view=project(s,'Safy');assert.ok(view.activities.every(a=>!('qs' in a)));assert.ok(!JSON.stringify(view.activities).includes('correct'));
});

test('Echo hosts self-directed rounds; completion is private to chat until target shares once',()=>{
 const s=initial();change(s,'Mahmoud','quiz.launch',{host:'Echo',target:'Mahmoud',title:'Silly questions',questions:[{q:'What would a cloud keep?',options:['Socks','Spoons'],correct:-1}]});
 const id=s.activity.id;assert.equal(project(s,'Mahmoud').activity.host,'Echo');
 assert.throws(()=>change(s,'Mahmoud','quiz.share',{activity:id}),/Finish/);
 change(s,'Mahmoud','quiz.answer',{activity:id,index:0,option:0});
 assert.equal(s.items.length,0);assert.equal(project(s,'Safy').activity.max,0);
 assert.throws(()=>change(s,'Safy','quiz.share',{activity:id}),/answering/);
 s.activity.feedback=[{final:true,status:'sent',text:'A cloud sock drawer!'}];
 change(s,'Mahmoud','quiz.share',{activity:id});change(s,'Mahmoud','quiz.share',{activity:id});
 assert.equal(s.items.length,1);assert.match(s.items[0].title,/Echo → Mahmoud/);assert.match(s.items[0].title,/cloud sock drawer/);assert.doesNotMatch(s.items[0].title,/points/);
});
test('activity reactions have no action tools and bounded output',async()=>{
 process.env.OPENAI_API_KEY='test-only';await respond({actor:'Mahmoud',prompt:'React',context:'{}',purpose:'activity',onText(){},fetcher:async(_,opts)=>{
 const b=JSON.parse(opts.body);assert.deepEqual(b.tools,[]);assert.equal(b.tool_choice,'none');assert.equal(b.max_output_tokens,350);assert.match(b.instructions,/no right answer/);
 return new Response('data: '+JSON.stringify({type:'response.completed',response:{output:[],usage:{input_tokens:1,output_tokens:1}}})+'\n\n');
 }});
});
