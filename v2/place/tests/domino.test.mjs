import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initial} from '../domain.mjs';
import {dominoChange,dominoSnapshot,dominoTick,legalMoves,botChoice,tiles} from '../domino.mjs';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';
const act=(s,who,type,data={},g=s.domino.shared??s.domino.solo[who])=>{dominoChange(s,who,'domino.'+type,{game:g?.id,revision:g?.revision,...data});dominoTick(s,Date.now()+2000);};
function conservation(g){
 const all=[...g.stock,...Object.values(g.hands).flat(),...g.chain];assert.equal(all.length,28);assert.equal(new Set(all.map(t=>t.id)).size,28);
 for(let i=1;i<g.chain.length;i++)assert.equal(g.chain[i-1].b,g.chain[i].a);
}
test('shared invite requires recipient consent; projections hide opponent and stock; stale move rejected',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'shared'});
 assert.equal(dominoSnapshot(s,'Safy').shared.hand.length,0);
 assert.throws(()=>act(s,'Mahmoud','accept'),/invitation/);
 act(s,'Safy','accept');const g=s.domino.shared;conservation(g);
 assert.equal(g.hands.Mahmoud.length,7);assert.equal(g.stock.length,14);
 const projected=dominoSnapshot(s,'Mahmoud').shared;
 assert.equal(projected.hand.length,7);assert.equal(projected.opponentCount,7);
 assert.equal(Object.hasOwn(projected,'hands'),false);assert.equal(Object.hasOwn(projected,'stock'),false);
 assert.throws(()=>act(s,'Safy','play',{tile:g.hands.Safy[0].id,side:'right'}),/turn/);
 assert.throws(()=>act(s,'Mahmoud','draw'),/matching/);
 const revision=g.revision;act(s,'Mahmoud','play',{tile:g.hands.Mahmoud[0].id,side:'right'});
 assert.throws(()=>dominoChange(s,'Safy','domino.pass',{game:g.id,revision}),e=>e.status===409);
 conservation(g);
});
test('solo games finish at all difficulties with 28 unique tiles, legal chains and no private opponent exposure',()=>{
 for(const difficulty of ['easy','medium','hard'])for(let round=0;round<10;round++){
  const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'solo',difficulty});const g=s.domino.solo.Mahmoud;
  assert.equal(dominoSnapshot(s,'Safy').solo,null);assert.throws(()=>act(s,'Safy','leave',{},g),e=>e.status===403);
  for(let n=0;g.status==='active'&&n<160;n++){
   const v=dominoSnapshot(s,'Mahmoud').solo;conservation(g);assert.equal(g.turn,'Mahmoud');
   if(v.legal.length)act(s,'Mahmoud','play',v.legal[0],g);else act(s,'Mahmoud',v.canDraw?'draw':'pass',{},g);
  }
  assert.ok(['finished','complete'].includes(g.status));conservation(g);assert.ok(g.result);
  if(g.status==='complete')continue;act(s,'Mahmoud','rematch',{},g);assert.equal(g.round,2);assert.equal(g.turn,'Mahmoud');conservation(g);
 }
});
test('blocked score, empty-hand win, both-end orientations, and illegal draw/pass',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'shared'});act(s,'Safy','accept');const g=s.domino.shared;
 g.chain=[{id:'2-3',a:2,b:3}];g.hands={Mahmoud:[{id:'1-2',a:1,b:2},{id:'5-6',a:5,b:6}],Safy:[{id:'3-4',a:3,b:4},{id:'0-0',a:0,b:0}]};g.stock=[];
 act(s,'Mahmoud','play',{tile:'1-2',side:'left'});assert.equal(g.chain[0].a,1);
 act(s,'Safy','play',{tile:'3-4',side:'right'});assert.equal(g.chain.at(-1).b,4);
 act(s,'Mahmoud','pass');act(s,'Safy','pass');assert.equal(g.result.reason,'blocked');assert.equal(g.result.winner,'Safy');assert.equal(g.result.points,11);
 act(s,'Safy','rematch');assert.equal(g.status,'waiting');assert.equal(g.hands.Mahmoud,undefined);act(s,'Mahmoud','accept');
 g.chain=[];g.hands={Mahmoud:[{id:'1-1',a:1,b:1}],Safy:[{id:'4-6',a:4,b:6}]};g.turn='Mahmoud';
 act(s,'Mahmoud','play',{tile:'1-1',side:'right'});assert.equal(g.result.winner,'Mahmoud');assert.equal(g.result.points,10);
});
test('expired invitations cannot be accepted; declined or ended games can be replaced',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'shared'},1000);const g=s.domino.shared;
 assert.equal(dominoSnapshot(s,'Safy',601001).shared.status,'expired');
 assert.throws(()=>dominoChange(s,'Safy','domino.accept',{game:g.id,revision:g.revision},601001),/expired/);
 dominoChange(s,'Safy','domino.create',{mode:'shared'},Date.now());act(s,'Mahmoud','decline');
 act(s,'Mahmoud','create',{mode:'shared'});act(s,'Safy','accept');act(s,'Mahmoud','leave');assert.equal(s.domino.shared.status,'ended');
});
test('bot choices use only own tiles and public ends; hard prefers supported ends',()=>{
 const hand=[{id:'0-6',a:0,b:6},{id:'1-6',a:1,b:6},{id:'1-2',a:1,b:2},{id:'1-3',a:1,b:3}],chain=[{a:6,b:6}];
 for(const level of ['easy','medium','hard']){const choice=botChoice(hand,chain,level);assert.ok(legalMoves(hand,chain).some(m=>JSON.stringify(m)===JSON.stringify(choice)));}
 assert.equal(botChoice(hand,chain,'hard').tile,'1-6');assert.equal(tiles().length,28);
});
test('HTTP two accounts: idempotent moves, private snapshots/SSE and saved game survives server restart',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const folder=mkdtempSync(join(tmpdir(),'domino-test-')),path=join(folder,'state.sqlite');let store=new Store(path),server;
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1];const user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const cookies={};let base;
 const start=async()=>{server=createApp({store,origin:'http://localhost',secret:'test domino secret at least thirty two chars',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;};
 const request=async(who,path,data)=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:'http://localhost',Cookie:cookies[who]??'','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
 const command=(who,type,data={},id=randomUUID())=>request(who,'command',{id,type:'domino.'+type,data:{game:store.state().domino?.shared?.id,revision:store.state().domino?.shared?.revision,...data}});
 try{
 await start();assert.equal((await request('none','state')).status,401);
 for(const who of ['mahmoud','safy'])assert.equal((await request(who,'login',{email:who+'@example.test',password:'test'})).status,200);
 await command('mahmoud','create',{mode:'shared'});await command('safy','accept');
 const before=(await request('mahmoud','state')).data.domino.shared;
 const payload={id:randomUUID(),type:'domino.play',data:{game:before.id,revision:before.revision,...before.legal[0]}};
 assert.equal((await request('mahmoud','command',payload)).status,200);assert.equal((await request('mahmoud','command',payload)).status,200);
 assert.equal(store.state().domino.shared.chain.length,1);
 const a=(await request('mahmoud','state')).data.domino.shared,b=(await request('safy','state')).data.domino.shared;
 assert.equal(a.hand.length,6);assert.equal(b.hand.length,7);assert.ok(!a.hand.some(x=>b.hand.some(y=>x.id===y.id)));
 const ctl=new AbortController(),stream=await fetch(base+'/api/events',{headers:{Cookie:cookies.safy},signal:ctl.signal}),reader=stream.body.getReader();
 const data=new TextDecoder().decode((await reader.read()).value);assert.match(data,/"domino":/);assert.ok(!data.includes('"hands"'));assert.ok(!data.includes('"stock":'));ctl.abort();
 await new Promise(r=>server.close(r));store.close();store=new Store(path);await start();
 const restored=(await request('safy','state')).data.domino.shared;assert.equal(restored.id,b.id);assert.deepEqual(restored.hand,b.hand);assert.equal(restored.chain.length,1);
 }finally{if(server?.listening)await new Promise(r=>server.close(r));store.close();rmSync(folder,{recursive:true,force:true});}
});

test('50/100 match targets archive one win, survive persistence, and separate solo records',()=>{
 const s=initial();assert.throws(()=>dominoChange(s,'Mahmoud','domino.create',{mode:'shared',target:75}),/50 or 100/);
 dominoChange(s,'Mahmoud','domino.create',{mode:'shared',target:50});act(s,'Safy','accept');let g=s.domino.shared;
 g.scores.Mahmoud=49;g.hands={Mahmoud:[{id:'1-1',a:1,b:1}],Safy:[{id:'3-4',a:3,b:4}]};g.chain=[];g.turn='Mahmoud';
 act(s,'Mahmoud','play',{tile:'1-1',side:'right'});
 assert.equal(g.status,'complete');assert.equal(g.matchWinner,'Mahmoud');assert.equal(s.competition.totals.Mahmoud,1);assert.equal(s.competition.holder,'Mahmoud');
 assert.equal(s.domino.records.shared.wins.Mahmoud,1);assert.equal(s.domino.records.shared.history[0].scores.Mahmoud,56);
 assert.throws(()=>act(s,'Mahmoud','rematch'),/Finish/);dominoTick(s,Date.now()+5000);
 assert.equal(s.domino.records.shared.history.length,1);
 const store=new Store(':memory:');store.save(s);const recovered=store.state();store.close();
 assert.equal(dominoSnapshot(recovered,'Safy').records.shared.wins.Mahmoud,1);
 act(s,'Mahmoud','create',{mode:'shared',target:100});g=s.domino.shared;assert.equal(g.target,100);assert.equal(g.scores.Mahmoud,0);
 dominoChange(s,'Mahmoud','domino.create',{mode:'solo',difficulty:'easy',target:50});const solo=s.domino.solo.Mahmoud;
 solo.scores.Mahmoud=49;solo.hands={Mahmoud:[{id:'1-1',a:1,b:1}],Computer:[{id:'3-4',a:3,b:4}]};
 act(s,'Mahmoud','play',{tile:'1-1',side:'right'},solo);
 assert.equal(dominoSnapshot(s,'Mahmoud').records.solo.wins.Mahmoud,1);assert.equal(dominoSnapshot(s,'Safy').records.solo.history.length,0);
 assert.equal(s.domino.records.shared.wins.Mahmoud,1);
});
test('computer waits, resumes a persisted pending turn, and ticks only once',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'solo',difficulty:'medium',target:100},1000);
 const g=s.domino.solo.Mahmoud,move=legalMoves(g.hands.Mahmoud,g.chain)[0];
 dominoChange(s,'Mahmoud','domino.play',{game:g.id,revision:g.revision,...move},2000);
 assert.equal(g.turn,'Computer');assert.equal(g.chain.length,1);assert.equal(g.botDueAt,3100);
 assert.equal(dominoTick(s,3000),false);
 const recovered=JSON.parse(JSON.stringify(s));assert.equal(dominoTick(recovered,3100),true);
 const after=recovered.domino.solo.Mahmoud;assert.equal(after.turn,'Mahmoud');assert.equal(after.chain.length,2);assert.equal(after.lastMove.by,'Computer');
 assert.equal(dominoTick(recovered,8000),false);conservation(after);
});
test('leaving a started match records no win and counts neither cancellation nor replay as a win',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'shared',target:50});act(s,'Safy','accept');act(s,'Mahmoud','leave');
 assert.equal(s.domino.records.shared.history[0].status,'abandoned');assert.equal(s.domino.records.shared.wins.Mahmoud,0);assert.equal(s.domino.records.shared.wins.Safy,0);
 assert.throws(()=>act(s,'Safy','leave'),/ended/);assert.equal(s.domino.records.shared.history.length,1);
});
test('turn timer starts on acceptance, survives reload and expires once with legal automatic play',()=>{
 const s=initial(),now=100000;
 dominoChange(s,'Mahmoud','domino.create',{mode:'shared',turnSeconds:30},now);let g=s.domino.shared;
 assert.equal(g.turnDeadline,null);
 dominoChange(s,'Safy','domino.accept',{game:g.id,revision:g.revision},now+1000);
 assert.equal(g.turnDeadline,now+31000);assert.equal(dominoTick(s,now+30999),false);
 const copy=JSON.parse(JSON.stringify(s));g=copy.domino.shared;
 assert.throws(()=>dominoChange(copy,'Mahmoud','domino.play',{game:g.id,revision:g.revision,...legalMoves(g.hands.Mahmoud,g.chain)[0]},now+31000),/time ran out/);
 assert.equal(dominoTick(copy,now+31000),true);assert.equal(g.chain.length,1);assert.equal(g.turn,'Safy');assert.equal(g.turnDeadline,now+61000);conservation(g);
 const revision=g.revision;assert.equal(dominoTick(copy,now+31000),false);assert.equal(g.revision,revision);
 assert.equal(dominoSnapshot(copy,'Safy',now+31000).shared.turnSeconds,30);
});
test('no timer remains unlimited; timer settings are validated and drawing does not reset the deadline',()=>{
 const s=initial();assert.throws(()=>dominoChange(s,'Mahmoud','domino.create',{mode:'shared',turnSeconds:9}),/timer/);
 dominoChange(s,'Mahmoud','domino.create',{mode:'shared',turnSeconds:0},100);
 let g=s.domino.shared;dominoChange(s,'Safy','domino.accept',{game:g.id,revision:g.revision},200);
 assert.equal(g.turnDeadline,null);assert.equal(dominoTick(s,1e12),false);
 const timed=initial();dominoChange(timed,'Mahmoud','domino.create',{mode:'shared',turnSeconds:15},100);
 g=timed.domino.shared;dominoChange(timed,'Safy','domino.accept',{game:g.id,revision:g.revision},200);
 g.chain=[{id:'6-6',a:6,b:6}];g.hands.Mahmoud=[{id:'0-0',a:0,b:0}];g.stock=[{id:'0-6',a:0,b:6}];
 const deadline=g.turnDeadline;dominoChange(timed,'Mahmoud','domino.draw',{game:g.id,revision:g.revision},1000);assert.equal(g.turnDeadline,deadline);
 dominoChange(timed,'Mahmoud','domino.leave',{game:g.id,revision:g.revision},1100);assert.equal(g.turnDeadline,null);assert.equal(dominoTick(timed,99999),false);
});
test('pause freezes human clock and bot across restart; each participant resumes their own pause',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'shared',turnSeconds:30},1000);let g=s.domino.shared;
 const change=(who,type,now)=>dominoChange(s,who,'domino.'+type,{game:g.id,revision:g.revision},now);
 change('Safy','accept',1000);change('Mahmoud','pause',11000);change('Safy','pause',12000);
 assert.equal(g.clockRemaining,20000);assert.equal(dominoTick(s,999999),false);assert.deepEqual(dominoSnapshot(s,'Mahmoud').shared.legal,[]);
 change('Mahmoud','resume',30000);assert.equal(g.paused,true);change('Safy','resume',40000);assert.equal(g.paused,false);assert.equal(g.turnDeadline,60000);
 const solo=initial();dominoChange(solo,'Mahmoud','domino.create',{mode:'solo',difficulty:'medium'},1000);g=solo.domino.solo.Mahmoud;g.turn='Computer';g.botDueAt=2100;
 dominoChange(solo,'Mahmoud','domino.pause',{game:g.id,revision:g.revision},1500);const loaded=JSON.parse(JSON.stringify(solo));g=loaded.domino.solo.Mahmoud;
 assert.equal(dominoTick(loaded,9000),false);dominoChange(loaded,'Mahmoud','domino.resume',{game:g.id,revision:g.revision},9000);assert.equal(g.botDueAt,9600);assert.equal(dominoTick(loaded,9599),false);assert.equal(dominoTick(loaded,9600),true);
});


test('one draw action stops at the first legal tile without playing it or resetting the clock',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'shared',turnSeconds:30});act(s,'Safy','accept');const g=s.domino.shared;
 g.chain=[{id:'6-6',a:6,b:6}];g.hands={Mahmoud:[{id:'0-0',a:0,b:0}],Safy:[{id:'3-3',a:3,b:3}]};g.stock=[{id:'4-4',a:4,b:4},{id:'1-6',a:1,b:6},{id:'2-2',a:2,b:2},{id:'1-1',a:1,b:1}];g.turn='Mahmoud';const deadline=g.turnDeadline,revision=g.revision;
 dominoChange(s,'Mahmoud','domino.draw',{game:g.id,revision});assert.deepEqual(g.hands.Mahmoud.map(t=>t.id),['0-0','1-1','2-2','1-6']);assert.equal(g.stock.length,1);assert.equal(g.turn,'Mahmoud');assert.equal(g.chain.length,1);assert.equal(g.turnDeadline,deadline);assert.equal(g.revision,revision+1);assert.equal(dominoSnapshot(s,'Mahmoud').shared.canDraw,false);assert.equal(dominoSnapshot(s,'Mahmoud').shared.result,null);assert.throws(()=>dominoChange(s,'Mahmoud','domino.draw',{game:g.id,revision}),/changed/);
});
test('draw exhaustion enables pass and blocked ties award no points; revealed result hands are frozen',()=>{
 const s=initial();dominoChange(s,'Mahmoud','domino.create',{mode:'shared'});act(s,'Safy','accept');const g=s.domino.shared;
 g.chain=[{id:'6-6',a:6,b:6}];g.hands={Mahmoud:[{id:'0-0',a:0,b:0}],Safy:[{id:'0-2',a:0,b:2}]};g.stock=[{id:'1-1',a:1,b:1}];g.turn='Mahmoud';act(s,'Mahmoud','draw');assert.equal(g.stock.length,0);assert.equal(dominoSnapshot(s,'Mahmoud').shared.canPass,true);
 act(s,'Mahmoud','pass');act(s,'Safy','pass');assert.equal(g.result.winner,null);assert.equal(g.result.points,0);assert.deepEqual(g.scores,{Mahmoud:0,Safy:0});assert.deepEqual(dominoSnapshot(s,'Mahmoud').shared.result.hands.Safy,[{id:'0-2',a:0,b:2}]);g.hands.Safy[0].a=5;assert.equal(g.result.hands.Safy[0].a,0);
});
