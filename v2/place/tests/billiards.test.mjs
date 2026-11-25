import test from 'node:test';import assert from 'node:assert/strict';
import {TABLE,rack,simulate,Shot,speedFor,aimGuide,placeable,GROUP} from '../public/billiards-physics.mjs';
import {billiardsChange,billiardsSnapshot,billiardsTick,billiardsDue,botShot} from '../billiards.mjs';
import {crownSnapshot} from '../crown.mjs';
import {attentionEvents} from '../push-events.mjs';
const T=1e12;
const ballsOf=(...list)=>list.map(([id,x,y])=>({id,x,y,in:false}));
function shared(){const s={version:0};billiardsChange(s,'Mahmoud','billiards.create',{mode:'shared',shotSeconds:0},T);const g=s.billiards.shared;billiardsChange(s,'Safy','billiards.accept',{game:g.id,revision:g.revision},T);return {s,g};}
const shoot=(s,g,who,p,now=T)=>billiardsChange(s,who,'billiards.shoot',{game:g.id,revision:g.revision,...p},now);
const toward=(from,to)=>Math.atan2(to[1]-from[1],to[0]-from[0]);

test('rack: 15 balls, 8 in the middle, a solid and a stripe in the back corners, apex on the foot spot',()=>{
 for(let i=0;i<20;i++){const b=rack();assert.equal(b.length,16);assert.equal(new Set(b.map(x=>x.id)).size,16);
  const rows=[...new Set(b.filter(x=>x.id).map(x=>Math.round(x.y)))].sort((a,c)=>c-a);assert.equal(rows.length,5);assert.equal(Math.round(b.find(x=>x.id&&Math.round(x.y)===rows[0]).y),TABLE.footSpot);
  const eight=b.find(x=>x.id===8);assert.equal(Math.round(eight.y),rows[2]);assert.equal(Math.round(eight.x),TABLE.width/2);
  const back=b.filter(x=>Math.round(x.y)===rows[4]).sort((a,c)=>a.x-c.x);assert.notEqual(GROUP(back[0].id),GROUP(back[4].id));}
});
test('physics is deterministic, so phones replay exactly what the server decided',()=>{
 const start=rack(()=>.3),shot={vx:15,vy:-speedFor(1),follow:.2,side:-.3};const a=simulate(start,shot),b=new Shot(start,shot);while(b.step());
 assert.deepEqual(b.result(),a);
});
test('a straight shot pots the object ball; follow runs through, draw comes back',()=>{
 const pocket=[TABLE.width-9,9],obj=[400,120],cue=[250,420],ang=toward(cue,[obj[0]+(obj[0]-pocket[0])/Math.hypot(obj[0]-pocket[0],obj[1]-pocket[1])*2*TABLE.radius,obj[1]+(obj[1]-pocket[1])/Math.hypot(obj[0]-pocket[0],obj[1]-pocket[1])*2*TABLE.radius]);
 const s=speedFor(.45),r=simulate(ballsOf([0,...cue],[3,...obj]),{vx:Math.cos(ang)*s,vy:Math.sin(ang)*s});assert.deepEqual(r.sunk,[3]);
 const straight=(follow)=>simulate(ballsOf([0,250,700],[5,250,560]),{vx:0,vy:-speedFor(.4),follow}).balls[0].y;
 assert.ok(straight(1)<straight(0)-60,'follow carries the cue ball forward');assert.ok(straight(-1)>straight(0)+60,'draw pulls it back');
});
test('aim guide finds the first ball and placement rules keep the cue ball clear',()=>{
 const b=ballsOf([0,250,700],[9,250,400],[2,250,300]);const g=aimGuide(b,-Math.PI/2);assert.equal(g.ball.id,9);assert.ok(Math.abs(g.end.y-(400+2*TABLE.radius))<1);
 assert.equal(placeable(b,250,410),false);assert.equal(placeable(b,100,800,true),true);assert.equal(placeable(b,100,600,true),false);
});

test('together: invite, accept, only the player on turn shoots, revisions guard double taps',()=>{
 const {s,g}=shared();assert.equal(g.status,'active');assert.equal(g.turn,'Mahmoud');assert.equal(g.ballInHand,'kitchen');
 assert.throws(()=>shoot(s,g,'Safy',{angle:0,power:.5}),/turn/);
 assert.throws(()=>billiardsChange(s,'Mahmoud','billiards.shoot',{game:g.id,revision:g.revision-1,angle:0,power:.5},T),/changed/);
 assert.throws(()=>shoot(s,g,'Mahmoud',{angle:-Math.PI/2,power:1,x:250,y:500}),/below the line/);
 shoot(s,g,'Mahmoud',{angle:-Math.PI/2,power:1,x:250,y:810});
 assert.equal(g.breakShot,false);assert.ok(g.lastShot.steps>0);const v=billiardsSnapshot(s,'Safy',T);assert.equal(v.shared.lastShot.n,1);assert.ok(JSON.stringify(v).length<6000);
});
test('fouls: scratch and wrong ball first give ball in hand; the 8 early loses; legal 8 wins and counts for the crown',()=>{
 let {s,g}=shared();g.breakShot=false;g.ballInHand=null;g.open=false;g.groups={Mahmoud:'solids',Safy:'stripes'};
 g.balls=ballsOf([0,250,600],[1,100,300],[9,250,300]);for(let id of [2,3,4,5,6,7,10,11,12,13,14,15])g.balls.push({id,x:0,y:0,in:true});g.balls.push({id:8,x:400,y:200,in:false});
 shoot(s,g,'Mahmoud',{angle:-Math.PI/2,power:.4});assert.equal(g.turn,'Safy');assert.equal(g.ballInHand,'table');assert.match(g.last,/other group first/);
 ({s,g}=shared());g.breakShot=false;g.ballInHand=null;g.open=false;g.groups={Mahmoud:'solids',Safy:'stripes'};
 const pocket=[9,9],eight=[90,90],cue=[250,250];const d=Math.hypot(eight[0]-pocket[0],eight[1]-pocket[1]),ghost=[eight[0]+(eight[0]-pocket[0])/d*2*TABLE.radius,eight[1]+(eight[1]-pocket[1])/d*2*TABLE.radius];
 g.balls=ballsOf([0,...cue],[8,...eight],[2,400,800]);for(const id of [1,3,4,5,6,7,9,10,11,12,13,14,15])g.balls.push({id,x:0,y:0,in:true});
 const p={angle:toward(cue,ghost),power:.4};const copy=structuredClone({s,g});shoot(s,g,'Mahmoud',p);assert.equal(g.status,'complete');assert.equal(g.winner,'Safy','8 before clearing your group loses');
 ({s,g}=copy);g.balls.find(b=>b.id===2).in=true;shoot(s,s.billiards.shared,'Mahmoud',p);const done=s.billiards.shared;assert.equal(done.status,'complete');assert.equal(done.winner,'Mahmoud');
 assert.deepEqual(crownSnapshot(s,'Mahmoud').breakdown.billiards,{Mahmoud:1,Safy:0});assert.equal(s.billiards.records.shared.wins.Mahmoud,1);
 billiardsChange(s,'Safy','billiards.rematch',{game:done.id,revision:done.revision},T+1);assert.equal(s.billiards.shared.status,'active');assert.equal(s.billiards.shared.turn,'Safy','the other player breaks the rematch');
});
test('the 8 on the break never loses: the breaker chooses to spot it or re-rack',()=>{
 const {s,g}=shared();g.balls=ballsOf([0,250,810],[8,250,120]);for(const id of [1,2,3,4,5,6,7,9,10,11,12,13,14,15])g.balls.push({id,x:0,y:0,in:true});
 const pocket=[TABLE.width-9,9],d=Math.hypot(250-pocket[0],120-pocket[1]),ghost=[250+(250-pocket[0])/d*2*TABLE.radius,120+(120-pocket[1])/d*2*TABLE.radius];
 shoot(s,g,'Mahmoud',{angle:toward([250,810],ghost),power:.85,x:250,y:810});assert.equal(g.status,'active');assert.equal(g.choice.who,'Mahmoud');
 assert.throws(()=>billiardsChange(s,'Safy','billiards.choose',{game:g.id,revision:g.revision,option:'spot'},T),/Nothing to choose/);
 billiardsChange(s,'Mahmoud','billiards.choose',{game:g.id,revision:g.revision,option:'spot'},T);assert.equal(g.balls.find(b=>b.id===8).in,false);assert.equal(g.turn,'Mahmoud');
});
test('shot clock: running out passes the turn with ball in hand; leaving gives no win',()=>{
 const s={version:0};billiardsChange(s,'Mahmoud','billiards.create',{mode:'shared',shotSeconds:30},T);const g=s.billiards.shared;billiardsChange(s,'Safy','billiards.accept',{game:g.id,revision:g.revision},T);
 assert.equal(billiardsDue(s,T+29000),false);assert.equal(billiardsDue(s,T+30001),true);billiardsTick(s,T+30001);assert.equal(g.turn,'Safy');assert.equal(g.ballInHand,'kitchen');
 billiardsChange(s,'Safy','billiards.leave',{game:g.id,revision:g.revision},T+31000);assert.equal(g.status,'ended');assert.deepEqual(crownSnapshot(s,'Safy').breakdown.billiards,{Mahmoud:0,Safy:0});
});
test('solo: the computer plays its turns and solo never touches the crown',()=>{
 const s={version:0};let now=T;billiardsChange(s,'Safy','billiards.create',{mode:'solo',difficulty:'hard'},now);const g=s.billiards.solo.Safy;
 for(let i=0;i<500&&g.status==='active';i++){now+=60000;if(g.turn==='Computer'){assert.ok(billiardsDue(s,now));billiardsTick(s,now);continue;}if(g.choice){billiardsChange(s,'Safy','billiards.choose',{game:g.id,revision:g.revision,option:'spot'},now);continue;}billiardsChange(s,'Safy','billiards.shoot',{game:g.id,revision:g.revision,...botShot(structuredClone(g),Math.random,'Safy')},now);}
 assert.equal(g.status,'complete');assert.deepEqual(crownSnapshot(s,'Safy').breakdown.billiards,{Mahmoud:0,Safy:0});assert.equal(s.billiards.records.solo.Safy.history.length,1);
});
test('notifications: invite, your turn and result',()=>{
 const a={version:0},b=structuredClone(a);billiardsChange(b,'Mahmoud','billiards.create',{mode:'shared'},T);assert.ok(attentionEvents(a,b,'Mahmoud').some(e=>e.to==='Safy'&&/invited you to Billiards/.test(e.body)));
 const c=structuredClone(b);billiardsChange(c,'Safy','billiards.accept',{game:c.billiards.shared.id,revision:c.billiards.shared.revision},T);
 const d=structuredClone(c),g=d.billiards.shared;billiardsChange(d,'Mahmoud','billiards.shoot',{game:g.id,revision:g.revision,angle:Math.PI/2,power:.05,x:250,y:810},T);
 if(g.turn==='Safy')assert.ok(attentionEvents(c,d,'Mahmoud').some(e=>e.to==='Safy'&&/your turn in Billiards/.test(e.body)));
});
