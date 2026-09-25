import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,change,project} from '../domain.mjs';
import {normalizeActivityTarget,repairSharedActivities} from '../activity-participants.mjs';
import {respond} from '../ai.mjs';
import {attentionEvents} from '../push-events.mjs';
const questions=[{q:'Choose a sound.',options:[],correct:-1},{q:'Pick a number.',options:['One','Two'],correct:1}];
for(const actor of ['Mahmoud','Safy'])for(const prompt of ['Ask us a strange question','اسألنا سؤال احنا الاتنين','Es2lna so2al 3\'reb lena e7na el etnen yad'])test('shared request overrides a single AI target: '+actor+' '+prompt,async()=>{
 process.env.OPENAI_API_KEY='test-only';
 const result=await respond({actor,prompt,context:'',onText(){},fetcher:async(_,opts)=>{
  const body=JSON.parse(opts.body);assert.ok(body.tools.find(t=>t.name==='start_quiz').parameters.properties.target.enum.includes('Both'));
  return new Response('data: '+JSON.stringify({type:'response.completed',response:{output:[{type:'function_call',name:'start_quiz',arguments:JSON.stringify({target:'Safy',title:'Together',questions})}],usage:{input_tokens:1,output_tokens:1}}})+'\n\n');
 }});assert.equal(result.proposals[0].target,'Both');
});
for(const first of ['Mahmoud','Safy'])test('both accounts answer once, wait, resume persisted state, and finish with correct score: '+first,()=>{
 let s=initial();change(s,first,'quiz.launch',{host:'Echo',target:'Both',questions});const id=s.activity.id,second=first==='Mahmoud'?'Safy':'Mahmoud';
 const answer=(who,index,data)=>change(s,who,'quiz.answer',{activity:id,index,...data});
 assert.equal(project(s,first).activity.canAnswer,true);assert.equal(project(s,second).activity.canAnswer,true);
 answer(first,0,{answer:'Secret first response'});assert.equal(s.activity.index,0);assert.equal(s.activity.status,'active');
 assert.equal(project(s,first).activity.canAnswer,false);assert.equal(project(s,second).activity.canAnswer,true);
 assert.deepEqual(project(s,second).activity.answeredBy,[first]);assert.doesNotMatch(JSON.stringify(project(s,second)),/Secret first response/);
 assert.throws(()=>answer(first,0,{answer:'Duplicate'}),/already saved/);
 s=JSON.parse(JSON.stringify(s));answer(second,0,{answer:'Second response'});assert.equal(s.activity.index,1);
 assert.throws(()=>answer(first,0,{answer:'Stale'}),/changed/);
 change(s,first,'quiz.pause',{activity:id,value:true});assert.throws(()=>answer(second,1,{option:1}),/paused/);change(s,first,'quiz.pause',{activity:id,value:false});
 answer(second,1,{option:1});assert.equal(project(s,first).activity.score,0);answer(first,1,{option:0});
 assert.equal(s.activity.status,'completed');assert.equal(s.activity.answers.length,4);assert.equal(project(s,first).activity.max,2);assert.equal(project(s,first).activity.score,1);
 assert.ok(project(s,second).activity.answers.some(a=>a.answer==='Secret first response'));
 change(s,first,'quiz.share',{activity:id});change(s,second,'quiz.share',{activity:id});assert.equal(s.items.length,1);assert.match(s.items[0].title,/Mahmoud & Safy/);
});
test('legacy repair only affects untouched active Echo questions explicitly addressed to both',()=>{
 const s=initial();change(s,'Mahmoud','quiz.launch',{host:'Echo',target:'Safy',questions:[{q:'Mahmoud and Safy: A tiny alien asks you a question.',options:[],correct:-1}]});
 const id=s.activity.id,at=s.activity.createdAt;s.activity.afterSequence=42;assert.equal(repairSharedActivities(s),true);assert.equal(s.activity.target,'Both');assert.equal(s.activity.id,id);assert.equal(s.activity.createdAt,at);assert.equal(s.activity.afterSequence,42);assert.equal(repairSharedActivities(s),false);
 for(const status of ['completed','abandoned']){const legacy=structuredClone(s);legacy.activity=legacy.activities[0];legacy.activity.target='Safy';legacy.activity.status=status;assert.equal(repairSharedActivities(legacy),false);}
 assert.equal(normalizeActivityTarget('Ask me','Mahmoud',{target:'Safy',questions}), 'Mahmoud');
});
test('shared activity notifications go to real participants, never the Both label',()=>{
 const before=initial(),after=initial();change(after,'Mahmoud','quiz.launch',{host:'Echo',target:'Both',questions});
 assert.deepEqual(attentionEvents(before,after,'Mahmoud').map(e=>e.to),['Safy']);
 assert.deepEqual(attentionEvents(before,after).map(e=>e.to),['Mahmoud','Safy']);
});

test('an explicitly single recipient takes precedence over names mentioned in the subject',()=>{
 const args={target:'Both',questions:[{q:'Mahmoud and Safy: What is your favourite shared memory?',options:[],correct:-1}]};
 assert.equal(normalizeActivityTarget('Ask Safy about Mahmoud and Safy','Mahmoud',args),'Safy');
 assert.match(args.questions[0].q,/^Safy:/);
 assert.equal(normalizeActivityTarget('Ask Mahmoud and Safy','Mahmoud',{target:'Safy',questions:[]}),'Both');
});
