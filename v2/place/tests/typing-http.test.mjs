import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../store.mjs';import {createApp} from '../server.mjs';
test('authenticated typing reaches the other account over SSE in both directions without draft text',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:');
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test secret with over thirty characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={},controllers=[];
 const post=async(who,path,data)=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:'http://localhost',Cookie:cookies[who]||'','Content-Type':'application/json'},body:JSON.stringify(data)});
 try{for(const who of ['mahmoud','safy']){const r=await post(who,'login',{email:who+'@example.test',password:'test'});cookies[who]=r.headers.get('set-cookie').split(';')[0];await r.json();}
 assert.equal((await post('nobody','typing',{active:true})).status,401);assert.equal((await post('mahmoud','typing',{active:'yes'})).status,400);
 for(const who of ['mahmoud','safy']){const other=who==='mahmoud'?'safy':'mahmoud',controller=new AbortController();controllers.push(controller);const timeout=setTimeout(()=>controller.abort(),5000);const r=await fetch(base+'/api/events',{headers:{Cookie:cookies[other]},signal:controller.signal}),reader=r.body.getReader();await reader.read();
 for(const active of [true,false]){const sent=await post(who,'typing',{active,text:'private draft',who:'Echo'});assert.equal(sent.status,200);await sent.json();let text='';while(!text.includes('event: typing'))text+=new TextDecoder().decode((await reader.read()).value);const event=JSON.parse(text.match(/event: typing\ndata: ([^\n]+)/)[1]);assert.deepEqual(event,{who:who==='mahmoud'?'Mahmoud':'Safy',active});assert.ok(!text.includes('private draft'));}
 clearTimeout(timeout);controller.abort();await reader.cancel().catch(()=>{});}
 }finally{controllers.forEach(c=>c.abort());server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
