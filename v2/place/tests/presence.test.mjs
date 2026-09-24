import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';

test('online requires foreground lease; background SSE, buzz and receipts do not revive it',async t=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const store=new Store(':memory:');
 const user=name=>({id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'});
 const server=createApp({store,origin:'http://localhost',secret:'test secret with more than thirty two characters',testing:true,pushSend:async()=>{},authFetch:async(url,opts)=>{if(url.includes('/token?')){const name=JSON.parse(opts.body).email.split('@')[0];return Response.json({user:user(name),access_token:name,refresh_token:name,expires_in:3600});}return Response.json(user((opts.headers.Authorization||opts.headers.authorization).split(' ')[1]));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,abort=new AbortController();
 t.after(async()=>{abort.abort();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();});
 const cookies={};
 const req=(who,path,data)=>fetch(base+path,{method:data?'POST':'GET',headers:{Origin:'http://localhost',Cookie:cookies[who]||'','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 for(const name of ['mahmoud','safy']){const r=await req(name,'/api/login',{email:name+'@example.test',password:'test-password'});assert.equal(r.status,200);cookies[name]=r.headers.get('set-cookie').split(';')[0];}
 const stream=await fetch(base+'/api/events',{headers:{Cookie:cookies.safy},signal:abort.signal});
 const reader=stream.body.getReader(),decoder=new TextDecoder();let buffer='';
 async function presence(){for(;;){let split=buffer.indexOf('\n\n');if(split<0){const chunk=await reader.read();assert.equal(chunk.done,false);buffer+=decoder.decode(chunk.value);continue;}const event=buffer.slice(0,split);buffer=buffer.slice(split+2);if(event.startsWith('event: presence'))return JSON.parse(event.split('data: ')[1]).online;}}
 async function expectOnline(expected){const until=Date.now()+3500;do{const current=await presence();if(JSON.stringify(current)===JSON.stringify(expected))return;}while(Date.now()<until);assert.fail('presence did not become '+JSON.stringify(expected));}
 await expectOnline([]);
 const client=randomUUID(),update=async(visible,sequence)=>{const response=await req('safy','/api/notifications/presence',{client,visible,sequence});assert.equal(response.status,200);const ack=await response.json();assert.equal(ack.who,'Safy');assert.ok(Array.isArray(ack.online));assert.ok(ack.serverNow>0);if(sequence===1)assert.deepEqual(ack.online,['Safy']);if(sequence===3)assert.deepEqual(ack.online,[]);};
 await update(true,1);await expectOnline(['Safy']);
 await update(false,3);await expectOnline([]);
 await update(true,2);await expectOnline([]);
 const buzz=await req('mahmoud','/api/buzz',{id:randomUUID(),kind:'electric'});assert.equal(buzz.status,200);
 await req('safy','/api/notifications');await req('safy','/api/notifications/receipt',{tag:'a'.repeat(24),result:'shown'});await expectOnline([]);
 await update(true,4);await expectOnline(['Safy']);
 store.db.prepare('UPDATE push_presence SET updated=? WHERE client=?').run(Date.now()-9000,client);await expectOnline([]);
 const other=randomUUID();await req('safy','/api/notifications/presence',{client:other,visible:true,sequence:1});await expectOnline(['Safy']);
 await update(false,5);await expectOnline(['Safy']);
 await req('safy','/api/notifications/presence',{client:other,visible:false,sequence:2});await expectOnline([]);
});

