// Our Word: a Wordle-style rivalry for Mahmoud and Safy.
// Two kinds of match: one shared daily word, and a challenge where each writes a word for the other.
// Secret words never leave the server until the player who solves them has finished.
import {readFileSync} from 'node:fs';
import {randomUUID,randomInt} from 'node:crypto';
import {check,names} from './domain.mjs';
import {recordCompetitiveResult} from './crown.mjs';

export const MAX_TRIES=6,MIN_LENGTH=4,MAX_LENGTH=7;
const TITLE='Our Word',CHALLENGE_WAIT=48*3600000;
const other=n=>names.find(p=>p!==n);
const list=file=>readFileSync(new URL('./word-lists/'+file,import.meta.url),'utf8').split('\n').map(w=>w.trim()).filter(Boolean);

// Arabic: no diacritics or tatweel; hamza-on-alef forms are one alef, ة is ه, ى is ي.
export function normalize(text,lang){
 let w=String(text??'').trim();
 if(lang==='ar'){w=w.replace(/[ً-ْٰـ\s]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');return w;}
 return w.toLowerCase().replace(/\s/g,'');
}
const letters={ar:/^[ء-غف-ي]+$/,en:/^[a-z]+$/};
export function letterCount(word){return [...word].length;}
function validShape(word,lang){return letters[lang]?.test(word)&&letterCount(word)>=MIN_LENGTH&&letterCount(word)<=MAX_LENGTH;}

let dictionaries=null;
function words(){
 if(dictionaries)return dictionaries;
 const answers={en:list('answers-en.txt'),ar:list('answers-ar.txt')};
 const valid={en:new Set(list('dict-en.txt')),ar:new Set(list('dict-ar.txt').map(w=>normalize(w,'ar')))};
 for(const lang of ['en','ar'])for(const w of answers[lang])valid[lang].add(normalize(w,lang));
 return dictionaries={answers,valid};
}
export function isWord(word,lang){return words().valid[lang]?.has(normalize(word,lang))??false;}

// Standard Wordle marking, duplicates included: exact matches first, then
// each remaining letter of the answer can mark at most one "present" letter.
export function score(guess,answer){
 const g=[...guess],a=[...answer],marks=g.map(()=>'absent'),left={};
 g.forEach((ch,i)=>{if(ch===a[i])marks[i]='correct';else left[a[i]]=(left[a[i]]??0)+1;});
 g.forEach((ch,i)=>{if(marks[i]!=='correct'&&left[ch]){marks[i]='present';left[ch]--;}});
 return marks;
}

// The daily word changes at midnight Riyadh time (UTC+3, no daylight saving).
export function dayKey(now=Date.now()){return new Date(now+3*3600000).toISOString().slice(0,10);}
export function nextDayAt(now=Date.now()){const d=new Date(dayKey(now)+'T00:00:00Z');return d.getTime()+86400000-3*3600000;}

function board(){return {startedAt:null,finishedAt:null,solved:false,guesses:[]};}
function ensure(s){s.word??={daily:null,challenge:null,records:{wins:{Mahmoud:0,Safy:0},ties:0,history:[]}};s.word.records??={wins:{Mahmoud:0,Safy:0},ties:0,history:[]};return s.word;}
const finished=b=>!!b?.finishedAt;
const elapsed=b=>b?.startedAt&&b.finishedAt?b.finishedAt-b.startedAt:null;

// Solved beats unsolved, then fewer tries, then the faster clock. Anything else is a tie.
export function decide(a,b){
 if(a.solved!==b.solved)return a.solved?-1:1;
 if(!a.solved)return 0;
 if(a.guesses.length!==b.guesses.length)return a.guesses.length<b.guesses.length?-1:1;
 const ta=elapsed(a),tb=elapsed(b);if(ta===tb||ta===null||tb===null)return 0;return ta<tb?-1:1;
}
function settle(s,m,kind,now,{voidIfMissing=false}={}){
 if(m.status!=='active')return false;
 const [first,second]=names,a=m.players[first],b=m.players[second];
 if(voidIfMissing&&(!a.startedAt||!b.startedAt)){m.status='void';m.winner=null;m.settledAt=now;return true;}
 for(const p of [a,b])if(p.startedAt&&!p.finishedAt){p.finishedAt=now;p.solved=false;}
 const order=decide(a,b);m.winner=order<0?first:order>0?second:null;m.status='complete';m.settledAt=now;
 const w=ensure(s);
 recordCompetitiveResult(s,{game:'word',title:TITLE,matchId:m.id,participants:names,mode:'shared',status:'complete',winner:m.winner},now);
 if(m.winner)w.records.wins[m.winner]=(w.records.wins[m.winner]??0)+1;else w.records.ties=(w.records.ties??0)+1;
 w.records.history.unshift({id:m.id,kind,date:new Date(now).toISOString(),day:m.date??null,lang:m.lang,winner:m.winner,...(kind==='daily'?{answer:m.answer.word,answerDisplay:m.answer.display}:{}),results:Object.fromEntries(names.map(n=>[n,{solved:m.players[n].solved,tries:m.players[n].guesses.length,ms:elapsed(m.players[n])}]))});
 w.records.history=w.records.history.slice(0,60);
 return true;
}
function maybeSettle(s,m,kind,now){if(m.status==='active'&&names.every(n=>finished(m.players[n])))settle(s,m,kind,now);}

function pickDaily(w,lang){
 const pool=words().answers[lang],recent=new Set(w.records.history.filter(h=>h.kind==='daily'&&h.lang===lang).slice(0,40).map(h=>h.answer).filter(Boolean));
 const fresh=pool.filter(x=>!recent.has(normalize(x,lang)));const options=fresh.length?fresh:pool;return options[randomInt(options.length)];
}
function secretFor(m,kind,who){return kind==='daily'?m.answer:m.words[other(who)];}

function guess(s,m,kind,who,raw,now){
 const me=m.players[who],secret=secretFor(m,kind,who);
 check(me.startedAt,'Start the word first.',409);check(!me.finishedAt,'You already finished this word.',409);
 const g=normalize(raw,m.lang),length=letterCount(secret.word);
 check(letters[m.lang].test(g),m.lang==='ar'?'Use Arabic letters only.':'Use English letters only.');
 check(letterCount(g)===length,'Use exactly '+length+' letters.');
 if(kind==='daily')check(isWord(g,m.lang),'Not in our word list. Try another word.');
 const marks=score(g,secret.word);me.guesses.push({word:g,marks,at:now});
 if(marks.every(x=>x==='correct')){me.solved=true;me.finishedAt=now;}
 else if(me.guesses.length>=MAX_TRIES){me.solved=false;me.finishedAt=now;}
}
function secretInput(p,lang){
 const word=normalize(p.word,lang);
 check(validShape(word,lang),'Write one '+(lang==='ar'?'Arabic':'English')+' word of '+MIN_LENGTH+' to '+MAX_LENGTH+' letters, without spaces.');
 const hint=String(p.hint??'').trim(),note=String(p.note??'').trim();
 check(hint.length<=40,'Keep the hint under 40 characters.');check(note.length<=400,'Keep the surprise message under 400 characters.');
 check(p.photo===undefined||p.photo===null||typeof p.photo==='string'&&/^[a-f0-9-]{36}$/.test(p.photo),'That photo is not available.');
 return {word,display:String(p.word).trim(),hint,note,photo:p.photo||null};
}

export function wordChange(s,who,type,p={},now=Date.now()){
 check(names.includes(who),'Not invited.',403);const w=ensure(s);
 wordTick(s,now);
 if(type==='word.daily'){
  const today=dayKey(now);
  if(!w.daily||w.daily.date!==today){
   check(['ar','en'].includes(p.lang),'Choose Arabic or English.');
   const pick=pickDaily(w,p.lang);
   w.daily={id:randomUUID(),date:today,lang:p.lang,startedBy:who,answer:{word:normalize(pick,p.lang),display:pick},status:'active',winner:null,revision:0,players:Object.fromEntries(names.map(n=>[n,board()]))};
  }
  const m=w.daily;check(m.status==='active','Today’s word is finished. A new one arrives at midnight Riyadh time.',409);
  m.players[who].startedAt??=now;m.revision++;
 }else if(type==='word.guess'||type==='word.giveup'){
  const kind=p.match==='challenge'?'challenge':'daily',m=w[kind];
  check(m&&m.id===p.id,'This word changed. Try again.',409);check(m.status==='active','This match has ended.',409);
  if(kind==='daily')check(m.date===dayKey(now),'Today’s word has changed.',409);
  if(type==='word.guess')guess(s,m,kind,who,p.guess,now);
  else{const me=m.players[who];check(me.startedAt&&!me.finishedAt,'Nothing to give up.',409);me.finishedAt=now;me.solved=false;}
  maybeSettle(s,m,kind,now);m.revision++;
 }else if(type==='word.challenge'){
  const old=w.challenge;
  check(!old||['complete','declined','cancelled'].includes(old.status)||old.status==='waiting'&&old.expires<=now,'Finish your current challenge first.',409);
  check(['ar','en'].includes(p.lang),'Choose Arabic or English.');
  w.challenge={id:randomUUID(),owner:who,lang:p.lang,status:'waiting',expires:now+CHALLENGE_WAIT,winner:null,revision:1,words:{[who]:secretInput(p,p.lang)},players:Object.fromEntries(names.map(n=>[n,board()]))};
 }else if(['word.answer','word.decline','word.cancel','word.start'].includes(type)){
  const m=w.challenge;check(m&&m.id===p.id,'This challenge is no longer available.',409);
  if(type==='word.answer'){check(m.status==='waiting'&&m.owner!==who&&m.expires>now,'This challenge has expired or changed.',409);m.words[who]=secretInput(p,m.lang);m.status='active';m.startedAt=now;}
  else if(type==='word.decline'){check(m.status==='waiting'&&m.owner!==who,'This challenge has changed.',409);m.status='declined';}
  else if(type==='word.cancel'){check(m.status==='waiting'&&m.owner===who,'Only a waiting challenge can be cancelled.',409);m.status='cancelled';}
  else{check(m.status==='active','This challenge has not started.',409);m.players[who].startedAt??=now;}
  m.revision++;
 }else check(false,'Unknown word action.');
 s.version++;
}

// Closes yesterday's daily word: unfinished boards count as unsolved, and a day
// where only one of you played gives no point.
export function wordDue(s,now=Date.now()){const d=s.word?.daily;return !!d&&d.status==='active'&&d.date!==dayKey(now);}
export function wordTick(s,now=Date.now()){
 const d=s.word?.daily;if(!d||d.status!=='active'||d.date===dayKey(now))return false;
 settle(s,d,'daily',now,{voidIfMissing:true});d.revision++;s.version++;return true;
}

function publicBoard(b){return {started:!!b.startedAt,startedAt:b.startedAt,finished:!!b.finishedAt,solved:b.solved,tries:b.guesses.length,ms:elapsed(b),guesses:b.guesses.map(g=>({word:g.word,marks:g.marks}))};}
function rivalBoard(b){return {started:!!b.startedAt,finished:!!b.finishedAt};}
function dailyView(d,who,now){
 const today=dayKey(now),current=d&&d.date===today?d:null,closed=d&&!['active'].includes(d.status)?d:null;
 const view={today,nextAt:nextDayAt(now),current:null,last:null};
 if(current){const ended=current.status!=='active',mine=current.players[who];
  view.current={id:current.id,date:current.date,lang:current.lang,length:letterCount(current.answer.word),startedBy:current.startedBy,status:current.status,revision:current.revision,winner:current.winner,
   me:publicBoard(mine),rival:ended?publicBoard(current.players[other(who)]):{...rivalBoard(current.players[other(who)]),...(finished(mine)?{tries:current.players[other(who)].finishedAt?current.players[other(who)].guesses.length:null,solved:current.players[other(who)].finishedAt?current.players[other(who)].solved:null}:{})},
   answer:ended||finished(mine)?current.answer.display:null};}
 if(closed&&closed!==current)view.last={id:closed.id,date:closed.date,lang:closed.lang,status:closed.status,winner:closed.winner,answer:closed.answer.display,me:publicBoard(closed.players[who]),rival:publicBoard(closed.players[other(who)])};
 return view;
}
function challengeView(c,who,now){
 if(!c)return null;
 const status=c.status==='waiting'&&c.expires<=now?'expired':c.status,ended=['complete'].includes(status),mine=c.players[who],rival=c.players[other(who)];
 const theirs=c.words[other(who)],mineWord=c.words[who];
 const solvedTheirs=finished(mine);
 return {id:c.id,owner:c.owner,lang:c.lang,status,expires:c.expires,revision:c.revision,winner:c.winner,
  length:theirs?letterCount(theirs.word):null,hint:theirs?.hint||null,
  wroteMine:!!mineWord,myWord:mineWord?{display:mineWord.display,hint:mineWord.hint,hasNote:!!mineWord.note,hasPhoto:!!mineWord.photo}:null,
  me:publicBoard(mine),rival:ended?publicBoard(rival):{...rivalBoard(rival),...(solvedTheirs&&finished(rival)?{tries:rival.guesses.length,solved:rival.solved}:{})},
  reveal:solvedTheirs&&theirs?{word:theirs.display,note:theirs.note||null,photo:theirs.photo||null}:null};
}
export function wordSnapshot(s,who,now=Date.now()){
 if(!names.includes(who))return null;const w=s.word;
 return {daily:dailyView(w?.daily,who,now),challenge:challengeView(w?.challenge,who,now),records:w?.records??{wins:{Mahmoud:0,Safy:0},ties:0,history:[]},limits:{min:MIN_LENGTH,max:MAX_LENGTH,tries:MAX_TRIES}};
}
