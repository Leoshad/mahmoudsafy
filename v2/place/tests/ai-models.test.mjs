import test from 'node:test';
import assert from 'node:assert/strict';
import {modelFor,STRONG_MODEL,LIGHT_MODEL,verifyEchoModels} from '../ai-models.mjs';
import {respond} from '../ai.mjs';
import {Store} from '../store.mjs';
test('routes expensive reasoning to Sol and lightweight jobs to Luna',()=>{
 for(const p of ['chat','wall','space','wall-auto','daily','court'])assert.equal(modelFor(p),STRONG_MODEL);
 for(const p of ['activity','draw'])assert.equal(modelFor(p),LIGHT_MODEL);
});
test('actual activity requests stay on Luna',async()=>{
 process.env.OPENAI_API_KEY='test-only';
 await respond({actor:'Mahmoud',prompt:'React',purpose:'activity',context:'{}',onText:()=>{},fetcher:async(_,o)=>{
 const b=JSON.parse(o.body);assert.equal(b.model,LIGHT_MODEL);assert.equal(b.tools.length,0);
 return new Response('data: '+JSON.stringify({type:'response.completed',response:{output:[],usage:{input_tokens:10,output_tokens:10}}})+'\n\n');
 }});
});
test('model-specific usage survives job body replacement and cannot settle twice',()=>{
 const s=new Store(':memory:');try{
 for(const [purpose,model,cost] of [['chat',STRONG_MODEL,3750],['draw',LIGHT_MODEL,400]]){
 const id=s.tx(()=>s.reserve('Mahmoud','shared',{purpose}));
 s.tx(()=>s.settle(id,{input_tokens:1000,output_tokens:100,web_search_calls:0}));
 const before=s.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used;
 s.tx(()=>s.settle(id,{input_tokens:1000,output_tokens:100,web_search_calls:0}));
 assert.equal(s.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,before);
 s.db.prepare("UPDATE jobs SET status='done',body='{}' WHERE id=?").run(id);
 const row=s.db.prepare('SELECT * FROM echo_usage WHERE job=?').get(id);assert.equal(row.model,model);assert.equal(row.budgetMicroUSD,cost);assert.equal(row.inputTokens,1000);
 }
 }finally{s.close();}
});
test('availability probe is read-only and logs no secret or response body',async()=>{
 process.env.OPENAI_API_KEY='test-only';const logs=[];
 await verifyEchoModels({log:x=>logs.push(JSON.parse(x)),fetcher:async(_,o)=>{assert.equal(o.method,undefined);assert.equal(o.body,undefined);return new Response('',{status:200});}});
 assert.equal(logs.length,2);assert.ok(logs.every(x=>x.available));assert.ok(!JSON.stringify(logs).includes('test-only'));
});
