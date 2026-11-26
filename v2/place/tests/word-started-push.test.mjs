import test from 'node:test';import assert from 'node:assert/strict';import {attentionEvents} from '../push-events.mjs';
const p=(started,finished)=>({startedAt:started?1:null,finishedAt:finished?2:null,guesses:[]});
const daily=(m,s)=>({word:{daily:{id:'d1',startedBy:'Mahmoud',status:'active',players:{Mahmoud:m,Safy:s}},challenge:null}});
const texts=(before,after,actor)=>attentionEvents(before,after,actor).map(e=>[e.recipient??e.to??e.who,e.body??e.text??e.message]);
test('when the other one starts today’s word, the one who started it hears about it',()=>{
 const out=JSON.stringify(attentionEvents(daily(p(1,0),p(0,0)),daily(p(1,0),p(1,0)),'Safy'));
 assert.match(out,/Safy started today’s word/);assert.match(out,/Mahmoud/);
});
test('starting a challenge word tells the other one',()=>{
 const ch=(m,s)=>({word:{daily:null,challenge:{id:'c1',owner:'Mahmoud',status:'active',players:{Mahmoud:m,Safy:s}}}});
 const out=JSON.stringify(attentionEvents(ch(p(0,0),p(0,0)),ch(p(0,0),p(1,0)),'Safy'));assert.match(out,/Safy started solving your word/);
});
test('no "started" ping when nothing new started',()=>{
 const out=JSON.stringify(attentionEvents(daily(p(1,0),p(1,0)),daily(p(1,0),p(1,0)),'Safy'));assert.doesNotMatch(out,/started/);
});
