import {randomUUID,randomInt} from 'node:crypto';
import {check,names} from './domain.mjs';
export const COLORS=['red','blue','green','yellow'];
const wild=c=>['wild','draw4','shield','xray'].includes(c.kind);
const other=(g,n)=>g.players.find(p=>p!==n);
export function ochoDeck(){
 const cards=[];const add=(color,kind,value=null)=>cards.push({id:String(cards.length),color,kind,value});
 for(const color of COLORS){add(color,'number',0);for(let v=1;v<=9;v++)for(let n=0;n<2;n++)add(color,'number',v);for(const kind of ['skip','reverse','draw2'])for(let n=0;n<2;n++)add(color,kind);}
 for(const kind of ['wild','draw4'])for(let n=0;n<4;n++)add(null,kind);
 for(const kind of ['shield','xray'])for(let n=0;n<2;n++)add(null,kind);
 for(let n=0;n<2;n++){add('red','deadred');add('blue','booblue');}return cards;
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function ochoLegal(g,who){
 if(g.status!=='active'||g.pausedBy.length||g.turn!==who)return [];
 return g.hands[who].filter(c=>{
  if(g.drawn&&c.id!==g.drawn)return false;
  if(g.pending)return ['draw2','draw4','shield'].includes(c.kind);
  const top=g.pile.at(-1);return wild(c)||c.color===g.color||(c.kind==='number'&&top.kind==='number'?c.value===top.value:c.kind!=='number'&&c.kind===top.kind);
 }).map(c=>c.id);
}
function draw(g,who,count){let n=0;while(n<count){if(!g.stock.length){if(g.pile.length<=1)break;const top=g.pile.pop();g.stock=shuffle(g.pile);g.pile=[top];}g.hands[who].push(g.stock.pop());n++;}return n;}
function clock(g,now){g.deadline=g.status==='active'&&!g.pausedBy.length&&g.turnSeconds?now+g.turnSeconds*1000:null;g.botDue=g.status==='active'&&!g.pausedBy.length&&g.turn==='Computer'?now+1400:null;}
function record(s,g,now){if(g.recorded)return;g.recorded=true;const r=g.mode==='shared'?s.ocho.records.shared:s.ocho.records.solo[g.owner]??=( {wins:{[g.owner]:0,Computer:0},history:[]} );if(g.winner)r.wins[g.winner]=(r.wins[g.winner]||0)+1;r.history.unshift({id:g.id,winner:g.winner??null,status:g.status,at:new Date(now).toISOString()});r.history=r.history.slice(0,100);}
function finish(s,g,now){const winner=g.players.find(n=>g.hands[n].length===0);if(winner){g.status='complete';g.winner=winner;g.turn=null;g.last+=' '+winner+' wins!';record(s,g,now);}clock(g,now);}
function deal(g,now){g.stock=shuffle(ochoDeck());g.hands=Object.fromEntries(g.players.map(n=>[n,g.stock.splice(0,8)]));const i=g.stock.findIndex(c=>c.kind==='number');g.pile=[g.stock.splice(i,1)[0]];g.color=g.pile[0].color;g.status='active';g.turn=g.owner;g.last=g.owner+' starts.';clock(g,now);}
export function ochoLabel(c){return c.kind==='number'?c.color+' '+c.value:({draw2:'+2',draw4:'Wild +4',deadred:'Dead Red',booblue:'Boo Blue',xray:'X-Ray',shield:'Shield',wild:'Wild',skip:'Skip',reverse:'Reverse'}[c.kind]);}
function play(s,g,who,id,color,now){
 check(ochoLegal(g,who).includes(id),'Choose a playable card.',409);const c=g.hands[who].find(c=>c.id===id);if(wild(c))check(COLORS.includes(color),'Choose a color.');
 g.hands[who].splice(g.hands[who].indexOf(c),1);g.pile.push(c);g.color=wild(c)?color:c.color;g.drawn=null;g.passes=0;g.move++;g.lastCard={...c,by:who,move:g.move};g.last=who+' played '+ochoLabel(c)+'.';g.turn=other(g,who);
 if(c.kind==='skip'||c.kind==='reverse'){g.turn=who;g.last+=' '+other(g,who)+' misses a turn.';}
 if(c.kind==='draw2'||c.kind==='draw4'){g.pending+=c.kind==='draw2'?2:4;g.lastDrawBy=who;g.last+=' Draw penalty: '+g.pending+'.';}
 if(c.kind==='shield'&&g.pending){g.turn=g.lastDrawBy;g.lastDrawBy=who;g.last+=' '+g.pending+' cards reflected back to '+g.turn+'.';}
 if(c.kind==='xray'){const hand=g.hands[other(g,who)];g.peeks[who]=hand.length?hand[randomInt(hand.length)].id:null;}
 if(c.kind==='deadred'){for(const n of g.players)if(!g.hands[n].some(c=>c.color==='red')){const count=draw(g,n,2);g.last+=' '+n+' drew '+count+'.';}}
 if(c.kind==='booblue'){const min=Math.min(...g.players.map(n=>g.hands[n].length));const targets=g.players.filter(n=>g.hands[n].length===min);for(const n of targets){const count=draw(g,n,2);g.last+=' '+n+' drew '+count+'.';}}
 finish(s,g,now);
}
function take(s,g,who,now){
 check(!g.drawn,'Play the drawn card or pass.',409);check(g.pending||!ochoLegal(g,who).length,'Play a matching card first.',409);
 const penalty=g.pending,n=draw(g,who,penalty||1);g.last=who+' drew '+n+' card'+(n===1?'':'s')+'.';g.pending=0;g.lastDrawBy=null;
 if(!penalty&&n){g.drawn=g.hands[who].at(-1).id;if(ochoLegal(g,who).length){clock(g,now);return;}g.drawn=null;}
 g.turn=other(g,who);g.passes=n?0:g.passes+1;
 if(g.passes>=2){g.status='complete';g.winner=null;g.turn=null;g.last='No moves remain. This game is a draw.';record(s,g,now);}clock(g,now);
}
// Computer sees its own cards and public state, never the opponent's hand or stock order.
function automatic(s,g,now){const who=g.turn,legal=ochoLegal(g,who),hand=g.hands[who];if(legal.length){const c=hand.find(c=>c.id===legal[0]);const color=COLORS.reduce((a,b)=>hand.filter(c=>c.color===a).length>=hand.filter(c=>c.color===b).length?a:b);play(s,g,who,c.id,color,now);}else take(s,g,who,now);}
export function ochoDue(s,now=Date.now()){return [s.ocho?.shared,...Object.values(s.ocho?.solo??{})].some(g=>g?.status==='active'&&!g.pausedBy.length&&(g.botDue&&g.botDue<=now||g.deadline&&g.deadline<=now));}
export function ochoTick(s,now=Date.now()){let changed=false;for(const g of [s.ocho?.shared,...Object.values(s.ocho?.solo??{})]){if(!g||g.status!=='active'||g.pausedBy.length)continue;if(!(g.botDue&&g.botDue<=now||g.deadline&&g.deadline<=now))continue;automatic(s,g,now);g.revision++;changed=true;}if(changed)s.version++;return changed;}
export function ochoChange(s,who,type,p={},now=Date.now()){
 check(names.includes(who),'Not invited.',403);s.ocho??={solo:{},shared:null,records:{shared:{wins:{Mahmoud:0,Safy:0},history:[]},solo:{}}};
 if(type==='ocho.create'){
  check(['solo','shared'].includes(p.mode),'Choose Solo or Together.');check([0,15,30,45,60].includes(p.turnSeconds??0),'Choose a supported timer.');
  const old=p.mode==='solo'?s.ocho.solo[who]:s.ocho.shared;check(!old||['complete','ended','declined'].includes(old.status)||old.status==='waiting'&&old.expires<=now,'Resume or leave the existing game first.',409);
  const g={id:randomUUID(),owner:who,players:[who,p.mode==='solo'?'Computer':other({players:names},who)],mode:p.mode,status:'waiting',revision:1,expires:now+600000,turnSeconds:p.turnSeconds??0,pausedBy:[],stock:[],pile:[],hands:{},turn:null,drawn:null,pending:0,lastDrawBy:null,passes:0,move:0,peeks:{},last:'Invitation sent.'};
  if(p.mode==='solo'){deal(g,now);s.ocho.solo[who]=g;}else s.ocho.shared=g;
 }else{
  const g=[s.ocho.shared,...Object.values(s.ocho.solo)].find(g=>g?.id===p.game);check(g&&g.players.includes(who),'This game is private or unavailable.',403);check(g.revision===p.revision,'The game changed. Try again.',409);
  if(type==='ocho.accept'||type==='ocho.decline'){check(g.status==='waiting'&&g.owner!==who&&g.expires>now,'This invitation expired or changed.',409);if(type==='ocho.accept')deal(g,now);else g.status='declined';}
  else if(type==='ocho.leave'){check(['waiting','active'].includes(g.status),'This game has ended.',409);g.status='ended';g.turn=null;g.last=who+' left the game.';record(s,g,now);clock(g,now);}
  else if(type==='ocho.pause'){check(g.status==='active','Only active games can pause.',409);if(!g.pausedBy.length)g.remaining=g.deadline?Math.max(0,g.deadline-now):null;g.pausedBy=[...new Set([...g.pausedBy,who])];clock(g,now);}
  else if(type==='ocho.resume'){check(g.status==='active'&&g.pausedBy.includes(who),'No pause to resume.',409);g.pausedBy=g.pausedBy.filter(n=>n!==who);clock(g,now);if(!g.pausedBy.length&&g.turnSeconds)g.deadline=now+(g.remaining??g.turnSeconds*1000);}
  else{
   check(g.status==='active'&&!g.pausedBy.length&&g.turn===who,'Wait for your turn or resume the game.',409);check(!g.deadline||now<g.deadline,'Your time ran out.',409);
   if(type==='ocho.play')play(s,g,who,p.card,p.color,now);
   else if(type==='ocho.draw')take(s,g,who,now);
   else if(type==='ocho.pass'){check(g.drawn,'Draw before passing.',409);g.drawn=null;g.turn=other(g,who);g.last=who+' passed.';clock(g,now);}
   else check(false,'Unknown Ocho action.');
  }g.revision++;
 }s.version++;
}
function view(g,who,now){if(!g||!g.players.includes(who))return null;const opponent=other(g,who),hand=g.hands[who]??[],status=g.status==='waiting'&&g.expires<=now?'expired':g.status;const legal=ochoLegal(g,who);return {id:g.id,revision:g.revision,mode:g.mode,owner:g.owner,players:g.players,status,turn:g.turn,turnSeconds:g.turnSeconds,deadline:g.deadline,pausedBy:g.pausedBy,hand,opponent,opponentCount:g.hands[opponent]?.length??0,top:g.pile.at(-1)??null,color:g.color,pending:g.pending,stockCount:g.stock.length,last:g.last,lastCard:g.lastCard??null,winner:g.winner??null,legal,canDraw:status==='active'&&!g.pausedBy.length&&g.turn===who&&!g.drawn&&(!!g.pending||!legal.length),canPass:status==='active'&&!g.pausedBy.length&&g.turn===who&&!!g.drawn,peek:(g.hands[opponent]??[]).find(c=>c.id===g.peeks[who])??null};}
export function ochoSnapshot(s,who,now=Date.now()){return {solo:view(s.ocho?.solo?.[who],who,now),shared:view(s.ocho?.shared,who,now),records:{solo:s.ocho?.records.solo[who]??{wins:{[who]:0,Computer:0},history:[]},shared:s.ocho?.records.shared??{wins:{Mahmoud:0,Safy:0},history:[]}}};}
