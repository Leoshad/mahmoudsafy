import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../store.mjs';import {initMemories,memoryData,memoryOptions,recordListening} from '../memories.mjs';import {memoryHTML} from '../memory-document.mjs';import {mediaChange} from '../media.mjs';
const options=q=>memoryOptions(new URLSearchParams(q)),song={videoId:'abcdefghijk',title:'Our song',channel:'Artist',duration:240};
test('date validation and local midnight boundaries',()=>{
 assert.throws(()=>options('from=2026-02-30'),/valid/);assert.throws(()=>options('zone=invalid'),/zone/);assert.throws(()=>options('from=2026-09-23&to=2026-09-22'),/valid/);
 const s=new Store(':memory:');initMemories(s);try{for(const [id,at]of [['a','2026-09-21T20:59:59Z'],['b','2026-09-21T21:00:00Z'],['c','2026-09-22T21:00:00Z']])s.message({id,author:'Mahmoud',text:id,status:'sent',createdAt:at});
 // Store assigns server timestamps; fixture sets known historical dates explicitly.
 for(const [id,at]of [['a','2026-09-21T20:59:59Z'],['b','2026-09-21T21:00:00Z'],['c','2026-09-22T21:00:00Z']])s.db.prepare('UPDATE messages SET createdAt=? WHERE id=?').run(at,id);
 assert.deepEqual(memoryData(s,'Mahmoud',options('from=2026-09-22&to=2026-09-22&zone=Asia/Riyadh')).messages.map(m=>m.id),['b']);
 }finally{s.close();}
});
test('export reads full chat, preserves replies, excludes quiz answers not yet revealed',()=>{
 const s=new Store(':memory:');initMemories(s);try{for(let i=0;i<75;i++)s.message({id:'m'+i,author:'Safy',text:'hello',status:'sent',reply:i===74?'m0':null});const state=s.state();state.activities=[{id:'a',title:'Quiz',qs:[{q:'SECRET FUTURE',correct:1}],index:0,status:'active',answers:[],target:'Safy'}];s.save(state);const d=memoryData(s,'Mahmoud',options('scope=all'));assert.equal(d.messages.length,75);assert.equal(d.messages[74].source.id,'m0');const h=memoryHTML(d);assert.ok(!h.includes('SECRET FUTURE'));assert.match(h,/href="#m-m0"/);
 }finally{s.close();}
});
test('invites and paused joins are not listening; play tracked once and queue creates next memory',()=>{
 const db=new Store(':memory:');initMemories(db);try{const s=db.state();mediaChange(s,'Mahmoud','media.create',{mode:'music',track:song},1000);recordListening(db,s,1000);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM shared_listening').get().n,0);
 mediaChange(s,'Safy','media.join',{session:s.media.id,invitation:s.media.invitation.id},1100);recordListening(db,s,1100);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM shared_listening').get().n,0);
 mediaChange(s,'Mahmoud','media.control',{session:s.media.id,revision:s.media.revision,playing:true,position:0},1200);recordListening(db,s,1200);recordListening(db,s,1300);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM shared_listening').get().n,1);
 mediaChange(s,'Safy','media.play',{session:s.media.id,revision:s.media.revision,track:{...song,videoId:'lmnopqrstuv'}},1400);recordListening(db,s,1400);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM shared_listening').get().n,2);
 }finally{db.close();}
});
test('HTML escapes untrusted text and rejects active markup while preserving safe links',()=>{
 const s=new Store(':memory:');initMemories(s);try{s.message({id:'m1',author:'Mahmoud',text:'<script>alert(1)</script> https://example.com',status:'sent'});const html=memoryHTML(memoryData(s,'Mahmoud',options('')));assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/href="https:\/\/example.com\/"/);}finally{s.close();}
});
test('PDF endpoint requires login, validates dates and returns a download without changing chat',async()=>{
 const {createApp}=await import('../server.mjs');process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const s=new Store(':memory:');let rendered=0;const user={id:'mahmoud-uid',email:'mahmoud@example.test',email_confirmed_at:'2026-01-01'};
 const server=createApp({store:s,origin:'http://localhost',secret:'test secret more than thirty two characters',testing:true,authFetch:async url=>Response.json(url.includes('/token?')?{user,access_token:'mahmoud',refresh_token:'mahmoud',expires_in:3600}:user),memoryRenderer:async d=>{rendered++;assert.equal(d.scope,'chat');return Buffer.from('%PDF-test');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/api/memories.pdf')).status,401);assert.equal(rendered,0);const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'test-password'})});const cookie=login.headers.get('set-cookie').split(';')[0];
 const bad=await fetch(base+'/api/memories.pdf?from=oops',{headers:{Cookie:cookie}});assert.equal(bad.status,400);assert.equal(rendered,0);
 const r=await fetch(base+'/api/memories.pdf?scope=chat',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(r.headers.get('content-disposition'),/attachment/);assert.equal(await r.text(),'%PDF-test');assert.equal(s.messages().length,0);assert.equal(rendered,1);
 }finally{await new Promise(r=>server.close(r));s.close();}
});
