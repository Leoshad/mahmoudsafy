import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../store.mjs';
import {searchChat} from '../chat-search.mjs';
import {createApp} from '../server.mjs';
test('shared chat search covers old Arabic and English messages, literal symbols, and all result pages',()=>{
 const s=new Store(':memory:');try{
 for(let i=0;i<125;i++)s.message({id:'m'+i,author:i%2?'Mahmoud':'Safy',text:'HELLO وحشتيني '+i});
 s.message({id:'literal',author:'Echo',text:'100% a_b <script>'});
 assert.equal(s.messages().some(m=>m.id==='m0'),false);
 const first=searchChat(s,'hello');assert.equal(first.total,125);assert.equal(first.matches.length,50);assert.equal(first.matches[0].id,'m124');
 assert.equal(searchChat(s,'وحشتيني',100).matches.at(-1).id,'m0');
 assert.equal(searchChat(s,'%',0).total,1);assert.equal(searchChat(s,'a_b',0).total,1);
 assert.equal(searchChat(s,"' OR 1=1 --").total,0);assert.equal(searchChat(s,'   ').total,0);
 assert.throws(()=>searchChat(s,'x'.repeat(201)),/200/);assert.throws(()=>searchChat(s,'hello',-1),/position/);
 }finally{s.close();}
});
test('search route requires login and returns only shared matches; new client asset is served',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const store=new Store(':memory:');store.message({id:'old',author:'Mahmoud',text:'وحشتيني Safy'});
 const user={id:'mahmoud-uid',email:'mahmoud@example.test',email_confirmed_at:'2026-01-01'};
 const authFetch=async url=>Response.json(url.includes('/token?')?{user,access_token:'mahmoud',refresh_token:'mahmoud',expires_in:3600}:user);
 const server=createApp({store,origin:'http://localhost',secret:'test-secret-with-more-than-thirty-two-characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/api/chat-search?q=Safy')).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'testing'})});const cookie=login.headers.get('set-cookie').split(';')[0];await login.json();
 const result=await fetch(base+'/api/chat-search?q=Safy',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(result.total,1);assert.equal(result.matches[0].id,'old');assert.deepEqual(Object.keys(result.matches[0]).sort(),['id','sequence']);
 const asset=await fetch(base+'/chat-tools.js');assert.equal(asset.status,200);assert.match(await asset.text(),/OurChatTools/);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
