import test from 'node:test';import assert from 'node:assert/strict';import {createMemoryExportJobs} from '../memory-export-jobs.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('background chat export preserves messages and produces restricted downloadable parts',async()=>{
 const seen=[];const jobs=createMemoryExportJobs({store:{},origin:'http://localhost',retentionMs:60000,renderer:async part=>{seen.push(part.messages.map(x=>x.id));return Buffer.from('%PDF-test');}});
 const messages=Array.from({length:12},(_,i)=>({id:'m'+i,createdAt:new Date(1700000000000+i*1000).toISOString(),image:'p'+i}));
 try{const j=jobs.start({scope:'chat',messages,invitations:[],listening:[]},'Mahmoud','session-a');assert.equal(j.state,'working');assert.throws(()=>jobs.status(j.id,'Safy','session-a'));assert.throws(()=>jobs.status(j.id,'Mahmoud','other'));let s;for(let i=0;i<100;i++){s=jobs.status(j.id,'Mahmoud','session-a');if(s.state!=='working')break;await wait(10);}assert.equal(s.state,'ready');assert.equal(s.total,3);assert.deepEqual(seen.flat(),messages.map(m=>m.id));}finally{await jobs.close();}
});
test('renderer failure does not claim success',async()=>{const jobs=createMemoryExportJobs({store:{},origin:'http://localhost',renderer:async()=>{throw Error('private detail');}});try{const j=jobs.start({scope:'chat',messages:[]},'Mahmoud','a');let s;for(let i=0;i<100;i++){s=jobs.status(j.id,'Mahmoud','a');if(s.state!=='working')break;await wait(10);}assert.equal(s.state,'failed');assert.ok(!s.error.includes('private detail'));}finally{await jobs.close();}});
