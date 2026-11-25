import test from 'node:test';import assert from 'node:assert/strict';
import {score,normalize,isWord,decide,dayKey,nextDayAt,wordChange,wordSnapshot,wordTick,wordDue} from '../word.mjs';
import {crownSnapshot} from '../crown.mjs';
import {attentionEvents} from '../push-events.mjs';
const T=Date.parse('2026-11-25T18:00:00Z');// 21:00 Riyadh
const fresh=()=>({version:0});
const ids=()=>'11111111-2222-3333-4444-555555555555';

test('marks repeated letters like Wordle: exact first, then one present per remaining letter',()=>{
 assert.deepEqual(score('apple','paper'),['present','present','correct','absent','present']);
 assert.deepEqual(score('lolly','hello'),['absent','present','correct','correct','absent']);
 assert.deepEqual(score('crane','crane'),Array(5).fill('correct'));
 assert.deepEqual(score('قهوه','قهوه'),Array(4).fill('correct'));
});
test('Arabic normalization treats hamza alef forms, taa marbuta and alef maqsura as one letter',()=>{
 assert.equal(normalize('أُمْنِيَة','ar'),'امنيه');assert.equal(normalize('إلى','ar'),'الي');assert.equal(normalize('مرحباً','ar'),'مرحبا');assert.equal(normalize(' Coffee ','en'),'coffee');
 assert.ok(isWord('قهوة','ar'));assert.ok(isWord('سيارة','ar'));assert.ok(isWord('apple','en'));assert.equal(isWord('qzxqv','en'),false);
});
test('the day changes at midnight Riyadh time',()=>{
 assert.equal(dayKey(Date.parse('2026-11-25T20:59:00Z')),'2026-11-25');assert.equal(dayKey(Date.parse('2026-11-25T21:00:00Z')),'2026-11-26');
 assert.equal(nextDayAt(T),Date.parse('2026-11-25T21:00:00Z'));
});
test('winner: solved beats unsolved, then fewer tries, then faster clock; otherwise a tie',()=>{
 const b=(solved,n,ms)=>({solved,guesses:Array(n).fill({}),startedAt:1,finishedAt:1+ms});
 assert.equal(decide(b(true,5,9e5),b(false,6,1)),-1);assert.equal(decide(b(true,3,9e5),b(true,4,1)),-1);assert.equal(decide(b(true,4,2000),b(true,4,1000)),1);
 assert.equal(decide(b(false,6,1),b(false,6,9)),0);assert.equal(decide(b(true,4,1000),b(true,4,1000)),0);
});

function playDaily(s,answer){wordChange(s,'Mahmoud','word.daily',{lang:'en'},T);s.word.daily.answer={word:answer,display:answer};return s.word.daily;}
test('daily: same secret for both, hidden until you finish, rival guesses hidden until the end',()=>{
 const s=fresh(),d=playDaily(s,'crane');
 let view=wordSnapshot(s,'Safy',T).daily.current;assert.equal(view.me.started,false);assert.equal(view.answer,null);assert.equal(view.length,5);assert.equal(JSON.stringify(view).includes('crane'),false);
 assert.throws(()=>wordChange(s,'Mahmoud','word.guess',{match:'daily',id:d.id,guess:'qzxqv'},T+1000),/word list/);
 assert.throws(()=>wordChange(s,'Mahmoud','word.guess',{match:'daily',id:d.id,guess:'cranes'},T+1000),/exactly 5/);
 wordChange(s,'Mahmoud','word.guess',{match:'daily',id:d.id,guess:'apple'},T+5000);
 view=wordSnapshot(s,'Safy',T+5000).daily.current;assert.equal(view.rival.started,true);assert.equal(view.rival.guesses,undefined);assert.equal(JSON.stringify(view).includes('apple'),false);
 wordChange(s,'Mahmoud','word.guess',{match:'daily',id:d.id,guess:'crane'},T+60000);
 const mine=wordSnapshot(s,'Mahmoud',T+60000).daily.current;assert.equal(mine.me.solved,true);assert.equal(mine.answer,'crane');assert.equal(mine.status,'active');
 assert.equal(wordSnapshot(s,'Safy',T+60000).daily.current.answer,null);
 wordChange(s,'Safy','word.daily',{lang:'ar'},T+70000);assert.equal(s.word.daily.lang,'en','second player keeps the first player’s language');
 for(const g of ['apple','crane'])wordChange(s,'Safy','word.guess',{match:'daily',id:d.id,guess:g},T+80000);
 const done=wordSnapshot(s,'Safy',T+80000).daily.current;assert.equal(done.status,'complete');assert.equal(done.winner,'Safy','same tries, faster clock wins');assert.equal(done.rival.guesses.length,2);
 assert.deepEqual(crownSnapshot(s,'Mahmoud').breakdown.word,{Mahmoud:0,Safy:1});assert.equal(s.word.records.history[0].kind,'daily');
 assert.throws(()=>wordChange(s,'Mahmoud','word.daily',{lang:'en'},T+90000),/finished/);
});
test('daily: six misses ends your board; midnight settles; a day with one player gives no point',()=>{
 const s=fresh(),d=playDaily(s,'crane');
 for(let i=0;i<6;i++)wordChange(s,'Mahmoud','word.guess',{match:'daily',id:d.id,guess:'apple'},T+i);
 assert.equal(s.word.daily.players.Mahmoud.solved,false);assert.ok(s.word.daily.players.Mahmoud.finishedAt);
 assert.equal(wordDue(s,T+3600000),false);assert.equal(wordDue(s,T+3*3600000+1),true);wordTick(s,T+3*3600000+1);
 assert.equal(s.word.daily.status,'void');assert.equal(s.word.records.history.length,0);
 const view=wordSnapshot(s,'Mahmoud',T+3*3600000+2).daily;assert.equal(view.current,null);assert.equal(view.last.status,'void');assert.equal(view.last.answer,'crane');
 const crown=crownSnapshot(s,'Mahmoud');assert.deepEqual(crown.breakdown.word,{Mahmoud:0,Safy:0});
});
test('daily: an unfinished started board counts as not solved at midnight',()=>{
 const s=fresh(),d=playDaily(s,'crane');wordChange(s,'Safy','word.daily',{},T);
 wordChange(s,'Safy','word.guess',{match:'daily',id:d.id,guess:'crane'},T+1000);wordChange(s,'Mahmoud','word.guess',{match:'daily',id:d.id,guess:'apple'},T+1000);
 wordTick(s,T+4*3600000);assert.equal(s.word.daily.status,'complete');assert.equal(s.word.daily.winner,'Safy');assert.equal(s.word.daily.players.Mahmoud.solved,false);
});

test('challenge: each writes a word; any letters allowed; surprise opens only after you finish',()=>{
 const s=fresh();
 assert.throws(()=>wordChange(s,'Mahmoud','word.challenge',{lang:'ar',word:'صا'},T),/4 to 7/);
 assert.throws(()=>wordChange(s,'Mahmoud','word.challenge',{lang:'ar',word:'cafe'},T),/Arabic/);
 wordChange(s,'Mahmoud','word.challenge',{lang:'ar',word:'صافيتي',hint:'اسم دلع',note:'بحبك',photo:ids()},T);
 const c=s.word.challenge;let safy=wordSnapshot(s,'Safy',T).challenge;
 assert.equal(safy.status,'waiting');assert.equal(JSON.stringify(safy).includes('صافيتي'),false);assert.equal(JSON.stringify(safy).includes('بحبك'),false);
 assert.throws(()=>wordChange(s,'Mahmoud','word.answer',{id:c.id,word:'قهوة'},T),/expired or changed/);
 wordChange(s,'Safy','word.answer',{id:c.id,word:'محمودي'},T+1000);
 let m=wordSnapshot(s,'Mahmoud',T+1000).challenge;assert.equal(m.status,'active');assert.equal(m.length,6);assert.equal(m.reveal,null);assert.equal(JSON.stringify(m).includes('محمودي'),false);
 assert.throws(()=>wordChange(s,'Mahmoud','word.guess',{match:'challenge',id:c.id,guess:'محمودي'},T),/Start/);
 wordChange(s,'Mahmoud','word.start',{id:c.id},T+2000);wordChange(s,'Safy','word.start',{id:c.id},T+2000);
 wordChange(s,'Mahmoud','word.guess',{match:'challenge',id:c.id,guess:'ابجدهو'},T+3000);// not a dictionary word: allowed in challenges
 wordChange(s,'Mahmoud','word.guess',{match:'challenge',id:c.id,guess:'محمودى'},T+9000);
 m=wordSnapshot(s,'Mahmoud',T+9000).challenge;assert.equal(m.me.solved,true);assert.equal(m.reveal.word,'محمودي');
 safy=wordSnapshot(s,'Safy',T+9000).challenge;assert.equal(safy.reveal,null);assert.equal(safy.hint,'اسم دلع');
 wordChange(s,'Safy','word.guess',{match:'challenge',id:c.id,guess:'صافيتى'},T+20000);
 safy=wordSnapshot(s,'Safy',T+20000).challenge;assert.equal(safy.status,'complete');assert.equal(safy.winner,'Safy','one try beats two');assert.equal(safy.reveal.note,'بحبك');assert.equal(safy.reveal.photo,ids());
 assert.equal(crownSnapshot(s,'Safy').breakdown.word.Safy,1);
 wordChange(s,'Mahmoud','word.challenge',{lang:'en',word:'coffee'},T+30000);assert.equal(s.word.challenge.status,'waiting');
});
test('challenge: only one open at a time; decline, cancel and give up',()=>{
 const s=fresh();wordChange(s,'Safy','word.challenge',{lang:'en',word:'qena'},T);
 assert.throws(()=>wordChange(s,'Mahmoud','word.challenge',{lang:'en',word:'riyadh'},T),/current challenge/);
 wordChange(s,'Mahmoud','word.decline',{id:s.word.challenge.id},T);assert.equal(s.word.challenge.status,'declined');
 wordChange(s,'Mahmoud','word.challenge',{lang:'en',word:'riyadh'},T);assert.throws(()=>wordChange(s,'Safy','word.cancel',{id:s.word.challenge.id},T),/Only a waiting challenge/);
 wordChange(s,'Mahmoud','word.cancel',{id:s.word.challenge.id},T);assert.equal(s.word.challenge.status,'cancelled');
 wordChange(s,'Mahmoud','word.challenge',{lang:'en',word:'riyadh'},T);const c=s.word.challenge;wordChange(s,'Safy','word.answer',{id:c.id,word:'qena'},T);
 for(const n of ['Mahmoud','Safy'])wordChange(s,n,'word.start',{id:c.id},T);
 wordChange(s,'Safy','word.giveup',{match:'challenge',id:c.id},T+5);wordChange(s,'Mahmoud','word.guess',{match:'challenge',id:c.id,guess:'zzzz'},T+9);
 for(let i=0;i<5;i++)wordChange(s,'Mahmoud','word.guess',{match:'challenge',id:c.id,guess:'zzzz'},T+10+i);
 assert.equal(c.status,'complete');assert.equal(c.winner,null,'neither solved: tie');assert.equal(s.word.records.ties,1);
});
test('notifications name events only, never the secret word',()=>{
 const before=fresh(),after=structuredClone(before);wordChange(after,'Mahmoud','word.challenge',{lang:'en',word:'secret'},T);
 const events=attentionEvents(before,after,'Mahmoud');assert.equal(events.length,1);assert.equal(events[0].to,'Safy');assert.match(events[0].body,/Our Word challenge/);assert.equal(JSON.stringify(events).includes('secret'),false);
 const b2=structuredClone(after);wordChange(after,'Safy','word.answer',{id:after.word.challenge.id,word:'answer'},T);
 assert.ok(attentionEvents(b2,after,'Safy').some(e=>e.to==='Mahmoud'&&/started/.test(e.body)));
 const d0=fresh(),d1=structuredClone(d0);wordChange(d1,'Safy','word.daily',{lang:'ar'},T);assert.ok(attentionEvents(d0,d1,'Safy').some(e=>e.to==='Mahmoud'&&/today’s word/.test(e.body)));
});
