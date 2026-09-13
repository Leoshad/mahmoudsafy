import {randomUUID,randomInt} from 'node:crypto';
import {check,names} from './domain.mjs';
const opponent=(g,who)=>g.players.find(n=>n!==who);
const sum=hand=>hand.reduce((n,t)=>n+t.a+t.b,0);
export function tiles(){const all=[];for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)all.push({id:a+'-'+b,a,b});return all;}
function shuffled(){const all=tiles();for(let i=all.length-1;i>0;i--){const j=randomInt(i+1);[all[i],all[j]]=[all[j],all[i]];}return all;}
export function legalMoves(hand,chain){
 const out=[];for(const t of hand){if(!chain.length)out.push({tile:t.id,side:'right'});else {if(t.a===chain[0].a||t.b===chain[0].a)out.push({tile:t.id,side:'left'});if(t.a===chain.at(-1).b||t.b===chain.at(-1).b)out.push({tile:t.id,side:'right'});}}return out;
}
// The bot receives only its own hand and the public chain: no opponent tiles or stock.
export function botChoice(hand,chain,difficulty){
 const moves=legalMoves(hand,chain);if(!moves.length)return null;
 if(difficulty==='easy')return moves[randomInt(moves.length)];
 const score=m=>{const t=hand.find(t=>t.id===m.tile);let n=t.a+t.b+(t.a===t.b?1:0);
 if(difficulty==='hard'){const end=!chain.length?t.b:m.side==='left'?(t.b===chain[0].a?t.a:t.b):(t.a===chain.at(-1).b?t.b:t.a);n+=hand.filter(x=>x.id!==t.id&&(x.a===end||x.b===end)).length*5;n+=(t.a===t.b?3:0);}
 return n;};
 return moves.reduce((best,m)=>score(m)>score(best)?m:best);
}
function deal(g){
 const deck=shuffled();g.hands={[g.players[0]]:deck.splice(0,7),[g.players[1]]:deck.splice(0,7)};g.stock=deck;g.chain=[];g.passes=0;g.result=null;g.lastMove=null;g.moveNumber=0;g.botDueAt=null;g.turn=g.players[(g.round-1)%2];g.status='active';g.last={text:g.turn+' starts the round.'};
}
function finish(g,winner,reason){
 g.status='finished';g.turn=null;const totals=Object.fromEntries(g.players.map(n=>[n,sum(g.hands[n])]));
 const points=winner?reason==='blocked'?Math.abs(totals[g.players[0]]-totals[g.players[1]]):totals[opponent(g,winner)]:0;
 if(winner)g.scores[winner]+=points;
 g.result={winner,reason,points,totals};g.last={text:winner?winner+' wins '+points+' points.':'The round is a draw.'};
}
function play(g,who,tile,side){
 const hand=g.hands[who];check(legalMoves(hand,g.chain).some(m=>m.tile===tile&&m.side===side),'Choose a matching tile and end.');
 const t=hand.splice(hand.findIndex(t=>t.id===tile),1)[0];let {a,b}=t;
 if(g.chain.length){if(side==='left'&&b!==g.chain[0].a)[a,b]=[b,a];if(side==='right'&&a!==g.chain.at(-1).b)[a,b]=[b,a];}
 g.moveNumber=(g.moveNumber??0)+1;const laid={id:t.id,a,b,by:who,order:g.moveNumber};g.lastMove={...laid,side};if(side==='left')g.chain.unshift(laid);else g.chain.push(laid);
 g.passes=0;g.last={text:who+' played '+t.a+'–'+t.b+'.',side};
 if(!hand.length)finish(g,who,'empty');else g.turn=opponent(g,who);
}
function pass(g,who){
 check(!g.stock.length&&!legalMoves(g.hands[who],g.chain).length,'Draw or play a matching tile first.');
 g.passes++;g.last={text:who+' passed.'};
 if(g.passes>=2){const a=sum(g.hands[g.players[0]]),b=sum(g.hands[g.players[1]]);finish(g,a===b?null:g.players[a<b?0:1],'blocked');}else g.turn=opponent(g,who);
}
function bots(g){
 let drawn=0;
 for(let n=0;g.status==='active'&&g.turn==='Computer'&&n<30;n++){
  const move=botChoice(g.hands.Computer,g.chain,g.difficulty);
  if(move){play(g,'Computer',move.tile,move.side);if(g.status==='finished')g.last.text='Computer played '+move.tile.replace('-','–')+'. '+g.last.text;if(drawn)g.last.text='Computer drew '+drawn+' tile'+(drawn===1?'':'s')+'. '+g.last.text;break;}
  if(g.stock.length){g.hands.Computer.push(g.stock.pop());drawn++;}else{pass(g,'Computer');if(drawn)g.last.text='Computer drew '+drawn+' tiles. '+g.last.text;break;}
 }
}
function ledger(s,g){
 s.domino.records??={shared:{wins:{Mahmoud:0,Safy:0},history:[]},solo:{}};
 if(g.mode==='shared')return s.domino.records.shared;
 return s.domino.records.solo[g.players[0]]??=( {wins:{[g.players[0]]:0,Computer:0},history:[]} );
}
function archive(s,g,now,completed){
 if(g.archived)return;
 const records=ledger(s,g);g.archived=true;
 const winner=completed?g.result.winner:null;
 if(winner)records.wins[winner]=(records.wins[winner]??0)+1;
 records.history.unshift({id:g.id,date:new Date(now).toISOString(),winner,status:completed?'completed':'abandoned',target:g.target??100,scores:{...g.scores},rounds:g.round,difficulty:g.difficulty});
 records.history=records.history.slice(0,100);
}
function settleMatch(s,g,now){
 if(g.status==='finished'&&g.result?.winner&&g.scores[g.result.winner]>=(g.target??100)){g.status='complete';g.matchWinner=g.result.winner;archive(s,g,now,true);}
}
function scheduleBot(g,now){g.botDueAt=g.status==='active'&&g.turn==='Computer'?now+1100:null;}
export function dominoTick(s,now=Date.now()){
 let changed=false;for(const g of Object.values(s.domino?.solo??{})){
  if(g.status==='active'&&g.turn==='Computer'&&(g.botDueAt??0)<=now){bots(g);g.botDueAt=null;g.revision++;settleMatch(s,g,now);changed=true;}
 }
 if(changed)s.version++;return changed;
}
function get(s,id){return [s.domino?.shared,...Object.values(s.domino?.solo??{})].find(g=>g?.id===id);}
export function dominoChange(s,who,type,p={},now=Date.now()){
 check(names.includes(who),'Not invited.',403);s.domino??={solo:{},shared:null};
 if(type==='domino.create'){
  check(['solo','shared'].includes(p.mode),'Choose solo or together.');
  check(p.target===undefined||[50,100].includes(p.target),'Choose a target of 50 or 100 points.');
  if(p.mode==='solo')check(['easy','medium','hard'].includes(p.difficulty),'Choose a difficulty.');
  const old=p.mode==='solo'?s.domino.solo[who]:s.domino.shared;
  check(!old||['complete','ended','declined'].includes(old.status)||old.status==='waiting'&&old.expires<=now,'Finish or leave your current game first.',409);
  const players=[who,p.mode==='solo'?'Computer':names.find(n=>n!==who)];
  const g={target:p.target??50,id:randomUUID(),revision:1,owner:who,mode:p.mode,difficulty:p.mode==='solo'?p.difficulty:null,players,status:'waiting',expires:now+600000,round:1,scores:Object.fromEntries(players.map(n=>[n,0])),hands:{},chain:[],stock:[],turn:null,result:null,last:{text:'Invitation sent.'}};
  if(p.mode==='solo'){deal(g);s.domino.solo[who]=g;}else s.domino.shared=g;
 }else{
  const g=get(s,p.game);check(g,'This game is no longer available.',409);check(g.players.includes(who),'This game is private.',403);
  check(p.revision===g.revision,'The game changed. Try again.',409);
  if(type==='domino.accept'||type==='domino.decline'){
   check(g.mode==='shared'&&g.owner!==who&&g.status==='waiting'&&g.expires>now,'This invitation has expired or changed.',409);
   if(type==='domino.accept')deal(g);else{g.status='declined';g.last={text:who+' declined the invitation.'};}
  }else if(type==='domino.leave'){
   check(g.status==='active'||g.status==='waiting'||g.status==='finished'||g.status==='complete','This game has ended.',409);
   check(g.status!=='waiting'||g.owner===who,'Accept or decline this invitation.',403);
   if(g.status!=='complete'&&(g.status!=='waiting'||g.round>1))archive(s,g,now,false);g.status='ended';g.botDueAt=null;g.turn=null;g.last={text:who+' left the game.'};
  }else if(type==='domino.rematch'){
   check(g.status==='finished','Finish this round first.',409);g.round++;g.result=null;
   if(g.mode==='shared'){g.owner=who;g.status='waiting';g.expires=now+600000;g.hands={};g.stock=[];g.chain=[];g.last={text:who+' invited you to another round.'};}
   else{deal(g);scheduleBot(g,now);}
  }else{
   check(g.status==='active'&&g.turn===who,'Wait for your turn.',409);
   if(type==='domino.play')play(g,who,p.tile,p.side);
   else if(type==='domino.draw'){check(!legalMoves(g.hands[who],g.chain).length,'Play a matching tile first.');check(g.stock.length,'No tiles left to draw. Pass instead.');g.hands[who].push(g.stock.pop());g.last={text:who+' drew a tile.'};}
   else if(type==='domino.pass')pass(g,who);
   else check(false,'Unknown domino action.');
   settleMatch(s,g,now);scheduleBot(g,now);
  }
  g.revision++;
 }
 s.version++;
}
function view(g,who,now){
 if(!g||!g.players.includes(who))return null;
 const status=g.status==='waiting'&&g.expires<=now?'expired':g.status;
 const hand=g.hands[who]??[],other=opponent(g,who),legal=status==='active'&&g.turn===who?legalMoves(hand,g.chain):[];
 return {id:g.id,revision:g.revision,target:g.target??100,matchWinner:g.matchWinner??null,lastMove:g.lastMove??null,botDueAt:g.botDueAt??null,owner:g.owner,mode:g.mode,difficulty:g.difficulty,players:g.players,status,expires:g.expires,round:g.round,scores:g.scores,chain:g.chain,turn:g.turn,result:g.result,last:g.last,hand:status==='waiting'||status==='expired'?[]:hand,opponent:other,opponentCount:g.hands[other]?.length??0,stockCount:g.stock.length,legal,canDraw:status==='active'&&g.turn===who&&!legal.length&&!!g.stock.length,canPass:status==='active'&&g.turn===who&&!legal.length&&!g.stock.length};
}
export function dominoSnapshot(s,who,now=Date.now()){return {solo:view(s.domino?.solo?.[who],who,now),shared:view(s.domino?.shared,who,now),records:{shared:s.domino?.records?.shared??{wins:{Mahmoud:0,Safy:0},history:[]},solo:s.domino?.records?.solo?.[who]??{wins:{[who]:0,Computer:0},history:[]}}};}
