import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initial,change,project} from '../domain.mjs';
import {Store} from '../store.mjs';

test('old photos survive edits and conversion to a plan retains social history',()=>{
 const s=initial(),photo=randomUUID();s.items.push({id:'old',type:'Photo',title:'Our day',image:photo,by:'Safy',revision:1,approvals:[],createdAt:new Date().toISOString()});
 change(s,'Mahmoud','item.like',{id:'old',value:true});change(s,'Safy','item.comment',{id:'old',text:'Let us go again'});
 change(s,'Mahmoud','item.save',{id:'old',revision:3,type:'Plan',title:'Return together',steps:[{text:'Pick a day'}]});
 const i=s.items[0];assert.deepEqual(i.images,[photo]);assert.equal(i.comments[0].text,'Let us go again');assert.deepEqual(i.likes,['Mahmoud']);assert.equal(i.by,'Safy');
 change(s,'Safy','item.step',{id:i.id,revision:i.revision,step:i.steps[0].id,value:true});assert.equal(i.done,true);assert.equal(project(s,'Mahmoud').items[0].steps[0].done,true);
});
test('photo posts allow captions to be empty and validate gallery size and IDs',()=>{
 const s=initial(),images=[randomUUID(),randomUUID()];change(s,'Safy','item.save',{type:'Photo',title:'',images});assert.equal(s.items[0].title,'');assert.deepEqual(s.items[0].images,images);
 for(const imgs of [['https://evil.example'],Array.from({length:7},randomUUID),'bad'])assert.throws(()=>change(s,'Safy','item.save',{type:'Photo',title:'x',images:imgs}));
 assert.throws(()=>change(s,'Safy','item.save',{type:'Idea',title:'',images:[]}));
});
test('likes are idempotent, comments enforce authorship and preserve agreement consent',()=>{
 const s=initial();change(s,'Mahmoud','item.save',{type:'Agreement',title:'Friday together'});const i=s.items[0];
 for(const who of ['Mahmoud','Safy'])change(s,who,'item.approve',{id:i.id,revision:i.revision,value:true});
 for(let n=0;n<2;n++)change(s,'Safy','item.like',{id:i.id,value:true});assert.deepEqual(i.likes,['Safy']);
 change(s,'Safy','item.comment',{id:i.id,text:'Looking forward to it'});assert.equal(i.approvals.length,2);
 assert.throws(()=>change(s,'Mahmoud','item.comment.delete',{id:i.id,comment:i.comments[0].id}),/own comment/);
 change(s,'Safy','item.comment.delete',{id:i.id,comment:i.comments[0].id});assert.equal(i.comments.length,0);
 change(s,'Mahmoud','item.save',{id:i.id,revision:i.revision,type:i.type,title:'Saturday together'});assert.equal(i.approvals.length,0);
});
test('wall operations persist through storage and duplicate command receipts do not add comments twice',()=>{
 const store=new Store(':memory:');let s=initial();change(s,'Mahmoud','item.save',{type:'Plan',title:'Our visit',steps:[{text:'Book tickets'}],aiAllowed:false});store.save(s);const id=s.items[0].id,receipt=randomUUID();
 const add=()=>store.once('Safy',receipt,{type:'item.comment'},()=>{s=store.state();change(s,'Safy','item.comment',{id,text:'Ready'});change(s,'Safy','item.pin',{id,value:true});store.save(s);return {ok:true};});add();add();
 const saved=project(store.state(),'Mahmoud').items[0];assert.equal(saved.comments.length,1);assert.equal(saved.pinned,true);assert.equal(saved.aiAllowed,false);assert.equal(saved.steps.length,1);store.close();
});

test('reactions preserve legacy hearts, switch only the actor and survive storage',()=>{
 const store=new Store(':memory:'),s=initial();change(s,'Mahmoud','item.save',{type:'Idea',title:'A moment'});const i=s.items[0];i.likes=['Safy'];
 change(s,'Mahmoud','item.react',{id:i.id,value:'😂',who:'Safy'});assert.deepEqual(i.reactions,{Safy:'❤️',Mahmoud:'😂'});
 change(s,'Mahmoud','item.react',{id:i.id,value:'🔥'});assert.equal(i.reactions.Mahmoud,'🔥');assert.deepEqual(i.likes,['Safy']);
 assert.throws(()=>change(s,'Mahmoud','item.react',{id:i.id,value:'invalid'}));
 store.save(s);assert.equal(store.state().items[0].reactions.Mahmoud,'🔥');
 change(s,'Mahmoud','item.react',{id:i.id,value:null});assert.deepEqual(i.reactions,{Safy:'❤️'});
 change(s,'Safy','item.like',{id:i.id,value:false});assert.deepEqual(i.reactions,{});store.close();
});
