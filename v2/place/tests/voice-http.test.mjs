import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Store} from '../store.mjs';import {createApp} from '../server.mjs';
for(const format of ['audio/webm','audio/mpeg'])test(format+' uploads are private until sent, durable in messages, seekable and included in export',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:'),cookies={};
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test-only-secret-more-than-thirty-two-characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const req=(who,path,data,extra={})=>fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:cookies[who]||'',Origin:'http://localhost','Content-Type':'application/json',...extra},body:data?JSON.stringify(data):undefined});
 try{
  assert.equal((await req('','/api/voices',{data:'x'})).status,401);
  for(const who of ['mahmoud','safy']){const r=await req(who,'/api/login',{email:who+'@example.test',password:'test-only'});cookies[who]=r.headers.get('set-cookie').split(';')[0];await r.json();}
  assert.equal((await req('mahmoud','/api/voices',{mime:'audio/webm',data:Buffer.from('not a recording long enough').toString('base64')})).status,400);
  const bytes=Buffer.concat([Buffer.from(format==='audio/mpeg'?[255,251,144,0]:[0x1a,0x45,0xdf,0xa3]),Buffer.alloc(60,7)]);
  const upload=await req('mahmoud','/api/voices',{mime:format,data:bytes.toString('base64')});assert.equal(upload.status,201);const {id}=await upload.json();
  assert.equal((await req('safy','/api/voices/'+id)).status,404);
  const command={id:randomUUID(),type:'message',data:{text:'',audio:id}};
  assert.equal((await req('safy','/api/command',command)).status,403);
  command.id=randomUUID();assert.equal((await req('mahmoud','/api/command',command)).status,200);assert.equal((await req('mahmoud','/api/command',command)).status,200);
  const state=await (await req('safy','/api/state')).json();assert.equal(state.messages.length,1);assert.equal(state.messages[0].audio,id);assert.equal(state.messages[0].audioMime,format);
  const sound=await req('safy','/api/voices/'+id,null,{Range:'bytes=4-9'});assert.equal(sound.status,206);assert.equal((await sound.arrayBuffer()).byteLength,6);assert.equal(sound.headers.get('content-type'),format);
  assert.equal((await req('','/api/voices/'+id)).status,401);
  const archive=await (await req('mahmoud','/api/export')).json();assert.equal(archive.voices[id].data,bytes.toString('base64'));
  const html=await req('','/');assert.match(html.headers.get('permissions-policy'),/microphone=\(self\)/);assert.match(html.headers.get('content-security-policy'),/media-src 'self' blob:/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
