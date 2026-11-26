import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import {snapshotWire,wireToken,parseWireToken} from '../snapshot-wire.mjs';

test('wire receipts round-trip and reject anything malformed',()=>{
 const {hashes}=snapshotWire({who:'Mahmoud',items:[1],messages:[{id:'a'}],playlist:{}});
 assert.deepEqual(parseWireToken(wireToken(hashes)),hashes);
 for(const bad of [null,'','items','items.xyz','nope.0123456789abcdef','items.0123456789abcdef~x','a'.repeat(1300)])assert.equal(parseWireToken(bad),null);
});

test('a reconnect with a valid receipt receives only what changed; songs are cached by the phone',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:'),cookies={};
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test-only-secret-more-than-thirty-two-characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const req=(who,path,data)=>fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:cookies[who]||'',Origin:'http://localhost','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 const open=async path=>{const controller=new AbortController(),r=await fetch(base+path,{headers:{Cookie:cookies.mahmoud},signal:controller.signal}),reader=r.body.getReader();let text='';while(!/event: wire\ndata: [^\n]*\n\n/.test(text)&&!(text.includes('event: snapshot\n')&&!path.includes('patch=1')))text+=new TextDecoder().decode((await reader.read()).value);controller.abort();await reader.cancel().catch(()=>{});return text;};
 try{
  for(const who of ['mahmoud','safy']){const r=await req(who,'/api/login',{email:who+'@example.test',password:'test-only'});cookies[who]=r.headers.get('set-cookie').split(';')[0];await r.json();}
  const first=await open('/api/events?patch=1');assert.match(first,/event: snapshot\ndata: /);const full=JSON.parse(first.match(/event: snapshot\ndata: ([^\n]+)/)[1]);assert.ok(Array.isArray(full.messages));
  const token=first.match(/event: wire\ndata: ([^\n]+)/)[1];
  const resumed=await open('/api/events?patch=1&known='+encodeURIComponent(token));assert.match(resumed,/event: snapshot-patch\ndata: /);const patch=JSON.parse(resumed.match(/event: snapshot-patch\ndata: ([^\n]+)/)[1]);
  assert.equal(patch.who,'Mahmoud');assert.equal(patch.messages,undefined);assert.equal(patch.items,undefined);assert.ok(resumed.length<first.length);
  const sent=await req('safy','/api/command',{id:crypto.randomUUID(),type:'message',data:{text:'while you were away'}});assert.equal(sent.status,200,await sent.text());
  const caught=await open('/api/events?patch=1&known='+encodeURIComponent(token));const caughtPatch=JSON.parse(caught.match(/event: snapshot-patch\ndata: ([^\n]+)/)[1]);assert.ok(caughtPatch.messages.some(m=>m.text==='while you were away'));assert.equal(caughtPatch.items,undefined);
  const state=await (await req('mahmoud','/api/state')).json();assert.ok(parseWireToken(state.wireReceipt));
  const partial=await (await req('mahmoud','/api/state?known='+encodeURIComponent(state.wireReceipt))).json();assert.equal(partial.wirePartial,true);assert.equal(partial.messages,undefined);assert.equal(partial.who,'Mahmoud');assert.ok(parseWireToken(partial.wireReceipt));
  const fullAgain=await (await req('mahmoud','/api/state?known=junk')).json();assert.equal(fullAgain.wirePartial,undefined);assert.ok(Array.isArray(fullAgain.messages));
  const garbage=await open('/api/events?patch=1&known=junk');assert.match(garbage,/event: snapshot\ndata: /);
  const legacy=await open('/api/events?known='+encodeURIComponent(token));assert.match(legacy,/event: snapshot\ndata: /);
  const bytes=Buffer.concat([Buffer.from([255,251,144,0]),Buffer.alloc(60,7)]);const up=await req('mahmoud','/api/voices',{mime:'audio/mpeg',data:bytes.toString('base64')});assert.equal(up.status,201);const {id}=await up.json();
  const song=await req('mahmoud','/api/voices/'+id);assert.equal(song.status,200);assert.match(song.headers.get('cache-control'),/private, max-age=31536000, immutable/);await song.arrayBuffer();
 }finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
});
