import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../store.mjs';import {createApp} from '../server.mjs';
test('chat export HTTP returns ordered parts only to the authenticated session',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const store=new Store(':memory:');const user={id:'muid',email:'mahmoud@example.test',email_confirmed_at:'2026-01-01'};const captured=[];
 const server=createApp({store,origin:'http://localhost',secret:'test secret more than thirty two characters',testing:true,authFetch:async url=>Response.json(url.includes('/token?')?{user,access_token:'mahmoud',refresh_token:'mahmoud',expires_in:3600}:user),memoryRenderer:async data=>{captured.push(data.messages.map(m=>m.text));return Buffer.from('%PDF-test');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{for(let i=0;i<11;i++)store.message({id:'m'+i,author:'Mahmoud',text:'message-'+i,image:'p'+i,status:'sent'});
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'test-password'})});const cookie=login.headers.get('set-cookie').split(';')[0];
 const denied=await fetch(base+'/api/memory-exports?scope=chat',{method:'POST',headers:{Origin:'http://localhost'}});assert.equal(denied.status,401);
 const start=await fetch(base+'/api/memory-exports?scope=chat',{method:'POST',headers:{Cookie:cookie,Origin:'http://localhost'}});assert.equal(start.status,202);const id=(await start.json()).id;let job;for(let i=0;i<100;i++){const response=await fetch(base+'/api/memory-exports/'+id,{headers:{Cookie:cookie}});job=await response.json();if(job.state!=='working')break;await new Promise(r=>setTimeout(r,10));}assert.equal(job.state,'ready');assert.equal(job.total,3);assert.deepEqual(captured.flat(),Array.from({length:11},(_,i)=>'message-'+i));
 const part=await fetch(base+'/api/memory-exports/'+id+'/1',{headers:{Cookie:cookie}});assert.equal(part.status,200);assert.equal(part.headers.get('content-type'),'application/pdf');assert.equal(await part.text(),'%PDF-test');const noCookie=await fetch(base+'/api/memory-exports/'+id+'/1');assert.equal(noCookie.status,401);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
