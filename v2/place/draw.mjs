import {randomUUID} from 'node:crypto';
import {check} from './domain.mjs';
import {recordCompetitiveResult} from './crown.mjs';
const names=['Mahmoud','Safy'],other=n=>names.find(x=>x!==n);
const board=()=>({id:randomUUID(),strokes:[],revision:0});
export function drawState(s){return s.draw??= {countCrown:false,settingsRevision:0,shared:board(),match:null,history:[]};}
const norm=s=>s.normalize('NFKD').replace(/[\p{M}ـ]/gu,'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]/gu,'');
const text=(v,max)=>{check(typeof v==='string'&&v.trim().length>0&&v.length<=max,'Invalid text.');return v.trim();};
export function drawDeck(result){check(Array.isArray(result)&&result.length===6,'Echo must prepare six words.');const used=new Set();return result.map(w=>{const word=text(w.word,60),hint=text(w.hint,120);check(norm(word).length>=2&&!used.has(norm(word)),'Use distinct drawable words.');used.add(norm(word));check(!norm(hint).includes(norm(word)),'The hint must not reveal the word.');check(Array.isArray(w.answers)&&w.answers.length<=6,'Invalid accepted answers.');return {word,hint,answers:[word,...w.answers.map(a=>text(a,60))]};});}
function round(m){m.board=board();m.ready=[];m.drawer=m.round%2?other(m.first):m.first;m.guesser=other(m.drawer);m.status='ready';m.guesses=[];m.hinted=false;m.pauses=[];m.remaining=m.seconds*1000;m.deadline=null;}
function finishRound(s,success,now){const d=drawState(s),m=d.match;const points=success?(m.hinted?5:10):0;m.scores[m.guesser]+=points;m.results.push({round:m.round+1,drawer:m.drawer,guesser:m.guesser,word:m.deck[m.round].word,points,hinted:m.hinted,success});m.status='review';m.deadline=null;if(m.round===5){m.status='complete';m.winner=m.scores.Mahmoud===m.scores.Safy?null:m.scores.Mahmoud>m.scores.Safy?'Mahmoud':'Safy';const result={id:m.id,scores:{...m.scores},winner:m.winner,countCrown:m.countCrown,at:new Date(now).toISOString(),status:'complete'};d.history.unshift(result);d.history=d.history.slice(0,60);if(m.countCrown)recordCompetitiveResult(s,{game:'draw',title:'Draw & Guess',matchId:m.id,participants:names,mode:'shared',status:'complete',winner:m.winner},now);}}
export function drawDue(s,now=Date.now()){const m=s.draw?.match;return m?.status==='active'&&!m.pauses.length&&m.deadline<=now;}
export function drawTick(s,now=Date.now()){if(!drawDue(s,now))return false;finishRound(s,false,now);s.version++;return true;}
export function drawView(s,who){const d=drawState(s),m=d.match;return {countCrown:d.countCrown,settingsRevision:d.settingsRevision,shared:d.shared,history:d.history,match:m?{id:m.id,owner:m.owner,first:m.first,status:m.status,countCrown:m.countCrown,language:m.language,difficulty:m.difficulty,seconds:m.seconds,round:m.round,drawer:m.drawer,guesser:m.guesser,ready:m.ready,scores:m.scores,board:m.board,guesses:m.guesses,hinted:m.hinted,hint:m.hinted?m.deck?.[m.round]?.hint:null,word:m.status==='active'&&who===m.drawer?m.deck[m.round].word:null,results:m.results,pauses:m.pauses,remaining:m.remaining,deadline:m.deadline,pending:!!m.pending,error:m.error,winner:m.winner}:null};}
export function drawApply(s,id,job,result){const m=drawState(s).match;if(m?.id!==id||m.pending!==job||m.status!=='preparing')return false;m.deck=drawDeck(result);m.pending=null;m.error=null;round(m);s.version++;return true;}
export function drawFailure(s,id,job){const m=s.draw?.match;if(m?.id===id&&m.pending===job){m.pending=null;m.error='Echo could not finish. Retry when ready.';s.version++;}}
export function drawChange(s,who,type,p={},now=Date.now()){
 check(names.includes(who),'Unknown player.',403);const d=drawState(s);let m=d.match;
 if(type==='draw.settings'){check(p.revision===d.settingsRevision,'Settings changed. Try again.',409);check(typeof p.value==='boolean','Choose on or off.');d.countCrown=p.value;d.settingsRevision++;}
 else if(type==='draw.create'){check(!m||['complete','closed'].includes(m.status),'Finish or end the current match first.',409);check(p.settingsRevision===d.settingsRevision,'Crown setting changed. Review it first.',409);check(['Arabic','English'].includes(p.language)&&['Easy','Medium','Hard'].includes(p.difficulty)&&[60,90,120].includes(p.seconds),'Choose match options.');m=d.match={id:randomUUID(),owner:who,first:who,status:'invited',countCrown:d.countCrown,language:p.language,difficulty:p.difficulty,seconds:p.seconds,round:0,ready:[],scores:{Mahmoud:0,Safy:0},board:board(),guesses:[],results:[],pauses:[],pending:null,error:null};}
 else if(['draw.stroke','draw.undo','draw.clear'].includes(type)){
  check(['shared','guess'].includes(p.mode),'Choose a drawing mode.');
  const b=p.mode==='shared'?d.shared:(check(m&&p.matchId===m.id,'Match changed.',409),m.board);check(b&&b.id===p.boardId,'Canvas changed. Start a new stroke.',409);
  if(p.mode!=='shared'){check(m.status==='active'&&!m.pauses.length&&m.deadline>now&&who===m.drawer,'Only the current artist can draw.',409);}
  if(type==='draw.undo'){const i=b.strokes.findLastIndex(v=>v.by===who);if(i>=0)b.strokes.splice(i,1);}
  if(type==='draw.clear'){check(p.revision===b.revision,'Drawing changed. Review it before clearing.',409);b.id=randomUUID();b.strokes=[];}
  if(type==='draw.stroke'){
   check(typeof p.strokeId==='string'&&/^[a-f0-9-]{36}$/.test(p.strokeId),'Invalid stroke ID.');check(Array.isArray(p.points)&&p.points.length>0&&p.points.length<=80,'Use a short stroke segment.');const points=p.points.map(t=>{check(Array.isArray(t)&&t.length===2&&t.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Invalid drawing point.');return t.map(v=>Math.round(v*10000)/10000);});
   let stroke=b.strokes.find(v=>v.id===p.strokeId);if(stroke){check(stroke.by===who&&p.offset===stroke.points.length,'Stroke changed.',409);}else{check(p.offset===0&&b.strokes.length<400,'Canvas is full. Save it and clear to continue.',409);check(/^#[0-9a-f]{6}$/i.test(p.color)&&[2,5,10,20,36].includes(p.width)&&['pen','eraser'].includes(p.tool),'Choose a drawing tool.');stroke={id:p.strokeId,by:who,color:p.color,width:p.width,tool:p.tool,points:[]};b.strokes.push(stroke);}
   check(b.strokes.reduce((n,v)=>n+v.points.length,0)+points.length<=16000,'Canvas is full. Save it and clear to continue.',409);stroke.points.push(...points);
  }b.revision++;
 }else{
  check(m&&p.id===m.id,'Match changed.',409);
  if(['draw.ready','draw.guess','draw.hint','draw.next','draw.pause'].includes(type))check(p.round===m.round,'Round changed. Review the current round.',409);
  if(type==='draw.accept'){check(m.status==='invited'&&who!==m.owner,'Waiting for the other player.',409);m.status='preparing';}
  else if(type==='draw.ready'){check(m.status==='ready','The round already started.',409);if(!m.ready.includes(who))m.ready.push(who);if(m.ready.length===2){m.status='active';m.deadline=now+m.remaining;}}
  else if(type==='draw.guess'){check(m.status==='active'&&!m.pauses.length&&m.deadline>now&&who===m.guesser,'Only the guesser can answer during the round.',409);check(m.guesses.length<60,'Guess limit reached for this round.');const guess=text(p.text,80);const correct=m.deck[m.round].answers.some(a=>norm(a)===norm(guess));m.guesses.push({by:who,text:guess,correct});if(correct)finishRound(s,true,now);}
  else if(type==='draw.hint'){check(m.status==='active'&&!m.pauses.length&&m.deadline>now&&who===m.guesser,'Only the guesser can request a hint.',409);m.hinted=true;}
  else if(type==='draw.next'){check(m.status==='review','Finish this round first.',409);m.round++;round(m);}
  else if(type==='draw.pause'){check(m.status==='active'&&typeof p.value==='boolean','No active round.',409);if(p.value){if(!m.pauses.length)m.remaining=Math.max(0,m.deadline-now);if(!m.pauses.includes(who))m.pauses.push(who);}else{m.pauses=m.pauses.filter(n=>n!==who);if(!m.pauses.length)m.deadline=now+m.remaining;}}
  else if(type==='draw.end'){check(!['complete','closed'].includes(m.status),'Match already ended.',409);m.status='closed';m.pending=null;m.deadline=null;m.deck=null;}
  else check(false,'Unknown drawing action.');
 }
 s.version++;return {ok:true};
}
