// 8-ball pool for Mahmoud and Safy: rules, turns, shot clock, computer opponent and crown results.
// The server simulates every shot with the shared physics; phones replay the same shot to animate it.
import {randomUUID} from 'node:crypto';
import {check,names} from './domain.mjs';
import {recordCompetitiveResult} from './crown.mjs';
import {TABLE,GROUP,rack,spotEight,placeable,simulate,speedFor,SPEED} from './public/billiards-physics.mjs';

const R=TABLE.radius,W=TABLE.width,H=TABLE.height;
const opponent=(g,who)=>g.players.find(n=>n!==who);
const remaining=(balls,group)=>balls.filter(b=>!b.in&&GROUP(b.id)===group).length;
const animationMs=steps=>Math.ceil(steps/240*1000)+700;
const SHOT_CLOCKS=[0,30,45,60],INVITE_MS=600000;

function freshRack(g,breaker){g.balls=rack();g.groups={};g.open=true;g.breakShot=true;g.turn=breaker;g.breaker=breaker;g.ballInHand='kitchen';g.choice=null;}
function startClock(g,now,delay=0){g.deadline=g.status==='active'&&g.shotSeconds&&g.turn!=='Computer'?now+delay+g.shotSeconds*1000:null;g.botDueAt=g.status==='active'&&g.turn==='Computer'?now+delay+900:null;}
function ledger(s,g){
 s.billiards.records??={shared:{wins:{Mahmoud:0,Safy:0},history:[]},solo:{}};
 return g.mode==='shared'?s.billiards.records.shared:(s.billiards.records.solo[g.players[0]]??={wins:{[g.players[0]]:0,Computer:0},history:[]});
}
function archive(s,g,now,completed){
 if(g.archived)return;g.archived=true;
 recordCompetitiveResult(s,{game:'billiards',title:'Billiards',matchId:g.id,participants:g.players,mode:g.mode,status:completed?'complete':'ended',winner:completed?g.winner:null},now);
 const book=ledger(s,g);if(completed&&g.winner)book.wins[g.winner]=(book.wins[g.winner]??0)+1;
 book.history.unshift({id:g.id,date:new Date(now).toISOString(),winner:completed?g.winner:null,status:completed?'completed':'abandoned',shots:g.shotNumber,difficulty:g.difficulty});book.history=book.history.slice(0,100);
}
function finish(s,g,winner,text,now){g.status='complete';g.winner=winner;g.turn=null;g.deadline=null;g.botDueAt=null;g.ballInHand=null;g.last=text;archive(s,g,now,true);}

// WPA-style 8-ball judgement of one finished shot.
function judge(s,g,who,before,out,now){
 const opp=opponent(g,who),mine=g.groups[who],objects=out.sunk.filter(id=>id!==0),scratch=out.sunk.includes(0),eight=objects.includes(8);
 const ownBefore=mine?remaining(before,mine):null;
 if(g.breakShot){
  g.breakShot=false;
  if(eight){// 8 on the break is never a loss: spot it or re-rack.
   g.choice={who:scratch?opp:who,scratch};g.turn=g.choice.who;g.ballInHand=null;
   return `${who} pocketed the 8 on the break${scratch?' and scratched':''}. ${g.turn} chooses: spot the 8 or re-rack.`;
  }
  if(scratch||out.firstHit===null){g.turn=opp;g.ballInHand='kitchen';return `${who} ${scratch?'scratched':'missed'} on the break. ${opp} has the cue ball behind the line.`;}
  if(objects.length){g.turn=who;g.ballInHand=null;return `${who} pocketed ${objects.length} on the break and shoots again. The table is open.`;}
  g.turn=opp;g.ballInHand=null;return `${opp}’s turn. The table is open.`;
 }
 let foul=null;
 if(scratch)foul='scratched';
 else if(out.firstHit===null)foul='missed every ball';
 else if(g.open&&out.firstHit===8)foul='hit the 8 first';
 else if(!g.open&&ownBefore>0&&GROUP(out.firstHit)!==mine)foul='hit the other group first';
 else if(!g.open&&ownBefore===0&&out.firstHit!==8)foul='had to hit the 8 first';
 if(!foul&&!objects.length&&!out.railAfterContact)foul='sent no ball to a rail';
 if(eight){
  const won=!foul&&!g.open&&ownBefore===0;
  finish(s,g,won?who:opp,won?`${who} sinks the 8 and wins!`:`${who} ${foul?foul+' on the 8':'sank the 8 too early'}. ${opp} wins.`,now);return g.last;
 }
 if(foul){g.turn=opp;g.ballInHand='table';return `${who} ${foul}. ${opp} has ball in hand.`;}
 if(g.open){const first=objects.map(GROUP).find(Boolean);if(first){g.groups[who]=first;g.groups[opp]=first==='solids'?'stripes':'solids';g.open=false;}}
 const scored=objects.some(id=>GROUP(id)===g.groups[who]);g.ballInHand=null;
 if(scored){g.turn=who;return `${who} pots ${objects.length===1?'one':objects.length}${g.open?'':' · '+g.groups[who]} and plays again.`;}
 g.turn=opp;return `${opp}’s turn.`;
}

function takeShot(s,g,who,p,now){
 check(g.status==='active'&&g.turn===who&&!g.choice,'Wait for your turn.',409);
 check(!g.deadline||g.deadline>now,'Your time ran out.',409);
 const direct=p.vx!==undefined||p.vy!==undefined;
 check((direct?[p.vx,p.vy]:[p.angle,p.power]).concat([p.follow??0,p.side??0]).every(Number.isFinite),'Invalid shot.');
 const power=direct?0:Math.min(1,Math.max(.02,p.power)),follow=Math.max(-1,Math.min(1,p.follow??0)),side=Math.max(-1,Math.min(1,p.side??0));
 check(follow*follow+side*side<=1.0001,'Spin must stay on the ball.');
 const cue=g.balls.find(b=>b.id===0);
 if(g.ballInHand){check(placeable(g.balls,p.x,p.y,g.ballInHand==='kitchen'),g.ballInHand==='kitchen'?'Place the cue ball below the line, clear of other balls.':'Place the cue ball on the table, clear of other balls.');Object.assign(cue,{x:p.x,y:p.y,in:false});}
 check(!cue.in,'Place the cue ball first.',409);
 // Phones send the exact velocity they are already animating, so both replays match the server bit for bit.
 let shot;if(direct){const sp=Math.sqrt(p.vx*p.vx+p.vy*p.vy);check(sp>=SPEED.min*.999&&sp<=SPEED.max*1.001,'Invalid shot power.');shot={vx:p.vx,vy:p.vy,follow,side};}
 else{const speed=speedFor(power);shot={vx:Math.cos(p.angle)*speed,vy:Math.sin(p.angle)*speed,follow,side};}
 const before=g.balls.map(b=>({...b})),out=simulate(before,shot);
 g.balls=out.balls;g.shotNumber=(g.shotNumber??0)+1;g.ballInHand=null;
 const text=judge(s,g,who,before,out,now);if(g.status==='active')g.last=text;
 g.lastShot={n:g.shotNumber,by:who,start:before,vx:shot.vx,vy:shot.vy,follow,side,steps:out.steps,sunk:out.sunk,text:g.last};
 startClock(g,now,animationMs(out.steps));
}

// ---------- computer opponent ----------
const AIM=[[9,9],[W-9,9],[-4,H/2],[W+4,H/2],[9,H-9],[W-9,H-9]];
function clearPath(balls,ax,ay,bx,by,skip){const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1;return balls.every(b=>{if(b.in||skip.includes(b.id))return true;const t=Math.max(0,Math.min(1,((b.x-ax)*dx+(b.y-ay)*dy)/L2)),px=ax+t*dx-b.x,py=ay+t*dy-b.y;return px*px+py*py>=(2*R-1)**2;});}
function candidates(g,who,cue){
 const mine=g.groups[who],targets=g.balls.filter(b=>!b.in&&b.id!==0&&(g.open?b.id!==8:remaining(g.balls,mine)?GROUP(b.id)===mine:b.id===8)),out=[];
 for(const t of targets)for(const [px,py] of AIM){
  const tx=px-t.x,ty=py-t.y,tl=Math.sqrt(tx*tx+ty*ty),gx=t.x-tx/tl*2*R,gy=t.y-ty/tl*2*R,cx=gx-cue.x,cy=gy-cue.y,cl=Math.sqrt(cx*cx+cy*cy);if(cl<1)continue;
  const cut=(cx*tx+cy*ty)/(cl*tl);if(cut<.3)continue;
  if(!clearPath(g.balls,cue.x,cue.y,gx,gy,[0,t.id])||!clearPath(g.balls,t.x,t.y,px,py,[0,t.id]))continue;
  out.push({angle:Math.atan2(cy,cx),power:Math.min(.92,Math.max(.32,.26+(cl+tl)/2300+(1-cut)*.25)),score:cut*cut/(1+(cl+tl)/900),target:t.id});
 }
 return {targets,list:out.sort((a,b)=>b.score-a.score)};
}
function placeForBot(g,who){
 const kitchen=g.ballInHand==='kitchen',cue=g.balls.find(b=>b.id===0);let best=null;
 for(let y=kitchen?TABLE.headString+20:60;y<=H-40;y+=kitchen?25:55)for(let x=40;x<=W-40;x+=40){if(!placeable(g.balls,x,y,kitchen))continue;Object.assign(cue,{x,y,in:false});const c=candidates(g,who,cue).list[0];if(c&&(!best||c.score>best.score))best={x,y,score:c.score};}
 return best??(()=>{for(let y=H-60;y>60;y-=20)for(let x=60;x<W-60;x+=20)if(placeable(g.balls,x,y,kitchen))return {x,y};return {x:W/2,y:H-40};})();
}
export function botShot(g,rand=Math.random,who='Computer'){
 const cue=g.balls.find(b=>b.id===0);let place=null;
 if(g.ballInHand){place=g.breakShot?{x:W/2+(rand()-.5)*120,y:TABLE.headString+60}:placeForBot(g,who);Object.assign(cue,{x:place.x,y:place.y,in:false});}
 if(g.breakShot)return {...place,angle:Math.atan2(TABLE.footSpot-cue.y,W/2-cue.x)+(rand()-.5)*.02,power:1,follow:0,side:0};
 const {targets,list}=candidates(g,who,cue),error={easy:.07,medium:.026,hard:.007}[g.difficulty]??.026;
 let pick=list[0];
 if(g.difficulty==='hard'&&list.length){// Test the best few lines and keep the one that pots cleanly.
  for(const c of list.slice(0,6)){const sp=speedFor(c.power),r=simulate(g.balls,{vx:Math.cos(c.angle)*sp,vy:Math.sin(c.angle)*sp});if(!r.sunk.includes(0)&&r.sunk.includes(c.target)){pick=c;break;}}
 }
 if(!pick){const t=targets.sort((a,b)=>(a.x-cue.x)**2+(a.y-cue.y)**2-((b.x-cue.x)**2+(b.y-cue.y)**2))[0]??g.balls.find(b=>!b.in&&b.id!==0);pick={angle:Math.atan2(t.y-cue.y,t.x-cue.x),power:.45};}
 return {...place,angle:pick.angle+(rand()-.5)*2*error,power:pick.power,follow:g.difficulty==='easy'?0:.15,side:0};
}

// ---------- commands ----------
function all(s){return [s.billiards?.shared,...Object.values(s.billiards?.solo??{})].filter(Boolean);}
export function billiardsChange(s,who,type,p={},now=Date.now()){
 check(names.includes(who),'Not invited.',403);s.billiards??={solo:{},shared:null};s.billiards.solo??={};
 if(type==='billiards.create'){
  check(['solo','shared'].includes(p.mode),'Choose solo or together.');
  if(p.mode==='solo')check(['easy','medium','hard'].includes(p.difficulty),'Choose a difficulty.');
  check(p.shotSeconds===undefined||SHOT_CLOCKS.includes(p.shotSeconds),'Choose no timer, 30, 45 or 60 seconds.');
  const prior=p.mode==='solo'?s.billiards.solo[who]:s.billiards.shared;
  check(!prior||['complete','ended','declined'].includes(prior.status)||prior.status==='waiting'&&prior.expires<=now,'Finish or leave the current game first.',409);
  const players=[who,p.mode==='solo'?'Computer':names.find(n=>n!==who)];
  const g={id:randomUUID(),revision:1,owner:who,mode:p.mode,players,difficulty:p.mode==='solo'?p.difficulty:null,shotSeconds:p.mode==='solo'?0:(p.shotSeconds??0),status:p.mode==='solo'?'active':'waiting',expires:now+INVITE_MS,winner:null,shotNumber:0,lastShot:null,deadline:null,botDueAt:null,last:p.mode==='solo'?`${who} breaks.`:'Invitation sent.'};
  freshRack(g,p.breaker&&players.includes(p.breaker)?p.breaker:who);
  if(p.mode==='solo')s.billiards.solo[who]=g;else s.billiards.shared=g;startClock(g,now);
 }else{
  const g=all(s).find(x=>x.id===p.game);check(g,'This game is no longer available.',409);check(g.players.includes(who),'This game is private.',403);
  check(p.revision===g.revision,'The game changed. Try again.',409);
  if(type==='billiards.accept'||type==='billiards.decline'){
   check(g.mode==='shared'&&g.status==='waiting'&&g.owner!==who&&g.expires>now,'This invitation has expired or changed.',409);
   if(type==='billiards.accept'){g.status='active';g.last=`${g.turn} breaks.`;startClock(g,now);}else{g.status='declined';g.last=`${who} declined.`;}
  }else if(type==='billiards.shoot')takeShot(s,g,who,p,now);
  else if(type==='billiards.choose'){
   check(g.status==='active'&&g.choice?.who===who,'Nothing to choose now.',409);check(['spot','rerack'].includes(p.option),'Choose spot or re-rack.');
   const scratch=g.choice.scratch;g.choice=null;
   if(p.option==='spot'){spotEight(g.balls);g.turn=who;g.ballInHand=scratch?'kitchen':null;g.last=`${who} spotted the 8${scratch?' and has the cue ball behind the line':' and keeps shooting'}.`;}
   else{freshRack(g,who);g.last=`Re-rack. ${who} breaks.`;}
   startClock(g,now);
  }else if(type==='billiards.leave'){
   check(['waiting','active','complete'].includes(g.status),'This game has ended.',409);check(g.status!=='waiting'||g.owner===who,'Accept or decline this invitation.',403);
   if(g.status==='active'&&g.shotNumber)archive(s,g,now,false);g.status='ended';g.turn=null;g.deadline=null;g.botDueAt=null;g.last=`${who} left the game.`;
  }else if(type==='billiards.rematch'){
   check(g.status==='complete','Finish this game first.',409);
   const nextBreaker=opponent(g,g.breaker)??who;
   billiardsChange(s,who,'billiards.create',{mode:g.mode,difficulty:g.difficulty??undefined,shotSeconds:g.mode==='shared'?g.shotSeconds:undefined,breaker:nextBreaker},now);
   const next=g.mode==='shared'?s.billiards.shared:s.billiards.solo[who];if(g.mode==='shared'){next.status='active';next.last=`Rematch. ${next.turn} breaks.`;startClock(next,now);}return;
  }else check(false,'Unknown billiards action.');
  g.revision++;
 }
 s.version=(s.version??0)+1;
}

// Shot clock and computer turns.
export function billiardsDue(s,now=Date.now()){return all(s).some(g=>g.status==='active'&&(g.deadline&&g.deadline<=now||g.botDueAt&&g.botDueAt<=now));}
export function billiardsTick(s,now=Date.now()){
 let changed=false;
 for(const g of all(s)){
  if(g.status!=='active')continue;
  if(g.botDueAt&&g.botDueAt<=now&&g.turn==='Computer'){g.botDueAt=null;try{takeShot(s,g,'Computer',botShot(g),now);}catch{const c=g.balls.find(b=>b.id===0);if(c.in)Object.assign(c,{x:W/2,y:H-60,in:false});takeShot(s,g,'Computer',{angle:-Math.PI/2,power:.5},now);}g.revision++;changed=true;}
  else if(g.deadline&&g.deadline<=now){
   const who=g.turn,opp=opponent(g,who);g.deadline=null;
   if(g.choice){g.choice=null;spotEight(g.balls);g.ballInHand=null;g.last=`${who} ran out of time. The 8 is spotted.`;}
   else{g.turn=opp;g.ballInHand=g.breakShot?'kitchen':'table';g.last=`${who} ran out of time. ${opp} has ball in hand.`;}
   startClock(g,now);g.revision++;changed=true;
  }
 }
 if(changed)s.version=(s.version??0)+1;return changed;
}

function view(g,who,now){
 if(!g||!g.players.includes(who))return null;
 const status=g.status==='waiting'&&g.expires<=now?'expired':g.status;
 return {id:g.id,revision:g.revision,owner:g.owner,mode:g.mode,players:g.players,difficulty:g.difficulty,shotSeconds:g.shotSeconds,status,expires:g.expires,balls:g.balls,turn:g.turn,breaker:g.breaker,groups:g.groups,open:g.open,breakShot:g.breakShot,ballInHand:g.ballInHand,choice:g.choice,winner:g.winner,deadline:g.deadline,shotNumber:g.shotNumber,lastShot:g.lastShot,last:g.last};
}
export function billiardsSnapshot(s,who,now=Date.now()){
 const r=s.billiards?.records;
 return {solo:view(s.billiards?.solo?.[who],who,now),shared:view(s.billiards?.shared,who,now),records:{shared:r?.shared??{wins:{Mahmoud:0,Safy:0},history:[]},solo:r?.solo?.[who]??{wins:{[who]:0,Computer:0},history:[]}}};
}
