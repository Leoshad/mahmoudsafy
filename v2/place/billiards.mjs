import {randomUUID} from 'node:crypto';
import {check,names} from './domain.mjs';
import {rack,simulateShot,TABLE} from './billiards-physics.mjs';
import {recordCompetitiveResult} from './crown.mjs';
const other=(g,n)=>g.players.find(p=>p!==n);
const group=id=>id>=1&&id<=7?'solids':id>=9&&id<=15?'stripes':null;
const alive=(g,kind)=>g.balls.some(b=>!b.pocketed&&group(b.id)===kind);
function settle(s,g,who,shot,now){
 const before=structuredClone(g.balls),assigned=g.groups[who]||null;
 const out=simulateShot(g.balls,shot);g.balls=out.balls;
 const scratch=out.sunk.includes(0),firstGroup=group(out.firstHit),remaining=assigned&&alive({balls:before},assigned);
 const wrong=out.firstHit===null||(!assigned&&out.firstHit===8)||(assigned&&(remaining?firstGroup!==assigned:out.firstHit!==8));
 const foul=!!(scratch||wrong||(!out.sunk.length&&!out.railAfterHit));const sunkGroups=out.sunk.filter(n=>group(n));
 if(out.sunk.includes(8)){
  const legal=!!assigned&&!remaining&&!foul;
  g.winner=legal?who:other(g,who);g.status='complete';g.turn=null;g.last=legal?`${who} wins the game.`:`${who} pocketed the 8 illegally. ${g.winner} wins.`;
  recordCompetitiveResult(s,{game:'billiards',title:'Billiards',matchId:g.id,participants:g.players,mode:g.mode,status:'complete',winner:g.winner},now);
 }else{
  if(!assigned&&!foul&&sunkGroups.length){g.groups[who]=group(sunkGroups[0]);g.groups[other(g,who)]=g.groups[who]==='solids'?'stripes':'solids';}
  const scored=sunkGroups.some(n=>group(n)===g.groups[who]);
  g.turn=!foul&&scored?who:other(g,who);g.ballInHand=foul;g.last=foul?`${who} fouled. ${g.turn} has ball in hand.`:scored?`${who} pockets a ball and plays again.`:`${g.turn}'s turn.`;
 }
 g.lastShot={number:(g.lastShot?.number||0)+1,by:who,before,angle:shot.angle,power:shot.power,spin:shot.spin||0,sunk:out.sunk,frames:out.frames};
}
function computer(s,g,now){let attempts=0;while(g.status==='active'&&g.turn==='Computer'&&attempts++<1){if(g.ballInHand){const c=g.balls.find(b=>b.id===0);let spot=null;for(let y=TABLE.height-60;y>=60&&!spot;y-=30)for(let x=60;x<=TABLE.width-60;x+=30){if(g.balls.every(b=>b.id===0||b.pocketed||Math.hypot(b.x-x,b.y-y)>=TABLE.radius*2)){spot={x,y};break;}}if(!spot)break;Object.assign(c,spot,{vx:0,vy:0,pocketed:false});g.ballInHand=false;}
 const cue=g.balls.find(b=>b.id===0),kind=g.groups.Computer,targets=g.balls.filter(b=>!b.pocketed&&b.id!==0&&(kind?(alive(g,kind)?group(b.id)===kind:b.id===8):b.id!==8));if(!targets.length)break;const target=targets.sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-Math.hypot(b.x-cue.x,b.y-cue.y))[0];const error={easy:.22,medium:.1,hard:.025}[g.difficulty]||.1;settle(s,g,'Computer',{angle:Math.atan2(target.y-cue.y,target.x-cue.x)+(Math.random()-.5)*error,power:.55},now);}}
export function billiardsChange(s,who,type,p={},now=Date.now()){
 check(names.includes(who),'Not invited.',403);s.billiards??={solo:{},shared:null};
 if(type==='billiards.create'){
  check(['solo','shared'].includes(p.mode),'Choose solo or together.');if(p.mode==='solo')check(['easy','medium','hard'].includes(p.difficulty),'Choose difficulty.');const prior=p.mode==='solo'?s.billiards.solo[who]:s.billiards.shared;check(!prior||['ended','declined','complete'].includes(prior.status)||prior.status==='waiting'&&prior.expires<=now,'Finish the current game first.',409);
  const g={id:randomUUID(),revision:1,owner:who,players:[who,p.mode==='solo'?'Computer':names.find(n=>n!==who)],mode:p.mode,difficulty:p.difficulty,status:p.mode==='solo'?'active':'waiting',expires:now+600000,balls:rack(),turn:who,groups:{},ballInHand:false,winner:null,last:p.mode==='solo'?`${who} breaks.`:'Invitation sent.',lastShot:null};if(p.mode==='solo')s.billiards.solo[who]=g;else s.billiards.shared=g;
 }else{
  const g=[s.billiards.shared,...Object.values(s.billiards.solo)].find(x=>x?.id===p.game);check(g&&g.players.includes(who),'Game not available.',409);check(g.revision===p.revision,'The game changed. Try again.',409);
  if(type==='billiards.accept'){check(g.status==='waiting'&&g.owner!==who&&g.expires>now,'Invitation expired.',409);g.status='active';g.last=`${g.owner} breaks.`;}
  else if(type==='billiards.decline'){check(g.status==='waiting'&&g.owner!==who,'Cannot decline.',409);g.status='declined';}
  else if(type==='billiards.leave'){check(['waiting','active','complete'].includes(g.status),'Game ended.',409);g.status='ended';g.turn=null;g.last=`${who} left the game.`;}
  else if(type==='billiards.place'){check(g.status==='active'&&g.turn===who&&g.ballInHand,'Ball placement unavailable.',409);const {x,y}=p;check(Number.isFinite(x)&&Number.isFinite(y)&&x>=TABLE.radius&&x<=TABLE.width-TABLE.radius&&y>=TABLE.radius&&y<=TABLE.height-TABLE.radius,'Choose a place on the table.');check([[0,0],[TABLE.width,0],[0,TABLE.height/2],[TABLE.width,TABLE.height/2],[0,TABLE.height],[TABLE.width,TABLE.height]].every(([px,py])=>Math.hypot(px-x,py-y)>TABLE.pocket+TABLE.radius),'Place away from pockets.');check(g.balls.every(b=>b.id===0||b.pocketed||Math.hypot(b.x-x,b.y-y)>=TABLE.radius*2),'Place away from other balls.');const b=g.balls.find(b=>b.id===0);Object.assign(b,{x,y,vx:0,vy:0,pocketed:false});g.ballInHand=false;}
  else if(type==='billiards.shoot'){check(g.status==='active'&&g.turn===who&&!g.ballInHand,'Wait for your turn or place the cue ball.',409);check(Number.isFinite(p.angle)&&Number.isFinite(p.power)&&p.power>=.05&&p.power<=1&&Number.isFinite(p.spin??0)&&Math.abs(p.spin??0)<=1,'Invalid shot.');settle(s,g,who,{angle:p.angle,power:p.power,spin:p.spin??0},now);if(g.mode==='solo'&&g.turn==='Computer')g.botDueAt=now+4000;}
  else check(false,'Unknown billiards command.');g.revision++;
 }
 s.version=(s.version||0)+1;
}
export function billiardsSnapshot(s,who,now=Date.now()){const view=g=>!g||!g.players.includes(who)?null:{...g,status:g.status==='waiting'&&g.expires<=now?'expired':g.status};return {solo:view(s.billiards?.solo?.[who]),shared:view(s.billiards?.shared)};}

export function billiardsDue(s,now=Date.now()){return Object.values(s.billiards?.solo??{}).some(g=>g?.status==='active'&&g.turn==='Computer'&&g.botDueAt&&g.botDueAt<=now);}
export function billiardsTick(s,now=Date.now()){if(!billiardsDue(s,now))return false;for(const g of Object.values(s.billiards.solo)){if(g.status==='active'&&g.turn==='Computer'&&g.botDueAt<=now){g.botDueAt=null;computer(s,g,now);if(g.status==='active'&&g.turn==='Computer')g.botDueAt=now+4000;g.revision++;}}s.version++;return true;}
