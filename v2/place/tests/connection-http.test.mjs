import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';

test('real HTTP reconnect catches missed messages for both accounts and retrying a committed request does not duplicate it',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const store=new Store(':memory:'),cookies={},controllers=[];
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test-only-secret-more-than-thirty-two-characters',testing:true,authFetch});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(who,path,data)=>fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookies[who]||'',Origin:'http://localhost','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 async function stream(who){const controller=new AbortController();controllers.push(controller);const r=await fetch(base+'/api/events',{headers:{Cookie:cookies[who]},signal:controller.signal});assert.equal(r.status,200);const reader=r.body.getReader();let buffer='';return {close:()=>controller.abort(),snapshot:async()=>{while(true){const end=buffer.indexOf('\n\n');if(end>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.startsWith('event: snapshot'))return JSON.parse(frame.split('data: ')[1]);continue;}const chunk=await reader.read();assert.equal(chunk.done,false);buffer+=new TextDecoder().decode(chunk.value);}}};}
 try{
  for(const who of ['mahmoud','safy']){const r=await request(who,'login',{email:who+'@example.test',password:'test-only'});cookies[who]=r.headers.get('set-cookie').split(';')[0];await r.json();}
  for(const who of ['mahmoud','safy']){
   const other=who==='mahmoud'?'safy':'mahmoud',before=await stream(other);await before.snapshot();before.close();
   const id=randomUUID(),payload={id,type:'message',data:{text:'message sent during disconnect '+who}};
   const accepted=await request(who,'command',payload);assert.equal(accepted.status,200);await accepted.arrayBuffer(); // Treat this response as lost at the client.
   const retry=await request(who,'command',JSON.parse(JSON.stringify(payload)));assert.equal(retry.status,200);await retry.json();
   const fallback=await (await request(other,'state')).json();assert.equal(fallback.messages.filter(m=>m.id===id).length,1);assert.equal(fallback.messages.find(m=>m.id===id).text,payload.data.text);
   const resumed=await stream(other),view=await resumed.snapshot();assert.equal(view.messages.filter(m=>m.id===id).length,1);assert.equal(view.messages.find(m=>m.id===id).text,payload.data.text);
   assert.equal(store.db.prepare('SELECT count(*) AS n FROM messages WHERE id=?').get(id).n,1);resumed.close();
  }
  const logout=await request('mahmoud','logout',{});await logout.json();const rejected=await request('mahmoud','state');assert.equal(rejected.status,401);await rejected.json();
 }finally{for(const c of controllers)c.abort();await new Promise(r=>server.close(r));store.close();}
});

