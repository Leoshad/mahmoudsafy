import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decide,wordChange,wordSnapshot,wordTick,wordDue,topicFor,MAX_HINTS} from '../word.mjs';
const T=Date.parse('2026-11-27T10:00:00Z');
const fresh=()=>({version:0,word:{daily:null,challenge:null,records:{wins:{Mahmoud:0,Safy:0},ties:0,history:[]},resets:['daily-2026-11-26']}});
const secretOf=s=>s.word.daily.answer.word;

test('every answer word has a topic in both languages',()=>{
 for(const lang of ['en','ar']){const words=readFileSync(new URL(`../word-lists/answers-${lang}.txt`,import.meta.url),'utf8').split('\n').map(w=>w.trim()).filter(Boolean);
  for(const w of words)assert.ok(topicFor(w,lang)?.label,lang+': '+w);}
});

test('today’s word shows its topic from the start and never the word itself',()=>{
 const s=fresh();wordChange(s,'Mahmoud','word.daily',{lang:'en'},T);
 const v=wordSnapshot(s,'Mahmoud',T).daily.current;assert.ok(v.topic&&/\p{L}/u.test(v.topic));assert.equal(v.answer,null);
 assert.ok(!JSON.stringify(wordSnapshot(s,'Safy',T)).includes('"'+secretOf(s)+'"'));
});

test('letter hints reveal real letters in place, at most two, never repeated, and only to you',()=>{
 const s=fresh();wordChange(s,'Mahmoud','word.daily',{lang:'en'},T);const id=s.word.daily.id,word=[...secretOf(s)];
 wordChange(s,'Mahmoud','word.hint',{id},T+1000);wordChange(s,'Mahmoud','word.hint',{id},T+2000);
 const me=wordSnapshot(s,'Mahmoud',T+2000).daily.current.me;assert.equal(me.hints.length,MAX_HINTS);
 assert.notEqual(me.hints[0].i,me.hints[1].i);for(const h of me.hints)assert.equal(h.letter,word[h.i]);
 assert.throws(()=>wordChange(s,'Mahmoud','word.hint',{id},T+3000),/No letter hints left/);
 wordChange(s,'Safy','word.daily',{lang:'en'},T+4000);const rival=wordSnapshot(s,'Safy',T+4000).daily.current.rival;assert.equal(rival.hints,undefined);
});

test('a hint never shows a letter you already have in gold',()=>{
 const s=fresh();wordChange(s,'Mahmoud','word.daily',{lang:'en'},T);const m=s.word.daily,word=[...m.answer.word];
 m.players.Mahmoud.guesses.push({word:word.join(''),marks:word.map((_,i)=>i===word.length-1?'absent':'correct'),at:T});
 m.players.Mahmoud.guesses[0].marks[0]='absent';
 wordChange(s,'Mahmoud','word.hint',{id:m.id},T+1000);const h=m.players.Mahmoud.hints[0];assert.ok(h.i===0||h.i===word.length-1);
});

test('equal tries: fewer letters shown wins before the clock',()=>{
 const b=(tries,hints,ms)=>({solved:true,startedAt:1,finishedAt:1+ms,guesses:Array(tries).fill({}),hints:Array(hints).fill({})});
 assert.equal(decide(b(3,0,90000),b(3,1,10000)),-1);
 assert.equal(decide(b(2,2,90000),b(3,0,10000)),-1);
 assert.equal(decide(b(3,1,5000),b(3,1,9000)),-1);
});

test('one-time clean slate clears the 26 Nov daily word once and never again',()=>{
 const s={version:0,word:{daily:{id:'x',date:'2026-11-26',status:'active',players:{Mahmoud:{},Safy:{}}},challenge:null,records:{wins:{},ties:0,history:[]}}};
 assert.equal(wordDue(s,T),true);assert.equal(wordTick(s,T),true);assert.equal(s.word.daily,null);assert.deepEqual(s.word.resets,['daily-2026-11-26']);
 s.word.daily={id:'y',date:'2026-11-27',status:'active',players:{Mahmoud:{},Safy:{}}};assert.equal(wordDue(s,T),false);assert.equal(wordTick(s,T),false);assert.equal(s.word.daily.id,'y');
});
