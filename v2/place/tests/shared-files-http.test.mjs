import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {Script} from 'node:vm';import {Store} from '../store.mjs';import {createApp} from '../server.mjs';
test('folder assets parse and are wired into existing header, snapshots, logout and event stream',()=>{new Script(readFileSync(new URL('../public/files.js',import.meta.url),'utf8'));const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');assert.match(html,/id="our-files-open"[\s\S]*?id="wall-search-open"/);assert.match(html,/src="\/files.js"/);assert.match(app,/OurFiles\?\.reset\(\)/);assert.match(app,/OurFiles\?\.sync\(state\)/);assert.match(app,/listen\('files-changed'/);});
test('authenticated shared folder HTTP actions, SSE changes and private file downloads work for both participants',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:'),cookies={};
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test-only-secret-more-than-thirty-two-characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(who,path,data,origin='http://localhost')=>fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:cookies[who]||'',Origin:origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const controller=new AbortController();
 try{
  for(const path of ['/files.js','/files.css','/notes.js','/notes.css','/note-format.mjs','/note-pdf.mjs']){const r=await request('',path);assert.equal(r.status,200);assert.ok((await r.text()).length>100);}
  assert.equal((await request('','/api/files')).status,401);
  for(const who of ['mahmoud','safy']){const r=await request(who,'/api/login',{email:who+'@example.test',password:'test-only'});cookies[who]=r.headers.get('set-cookie').split(';')[0];await r.json();}
  const stream=await fetch(base+'/api/events',{headers:{Cookie:cookies.safy},signal:controller.signal}),reader=stream.body.getReader();await reader.read();
  const payload={id:randomUUID(),action:'create',kind:'folder',name:'Together'};assert.equal((await request('mahmoud','/api/files/action',payload,'https://wrong.test')).status,403);
  const created=await request('mahmoud','/api/files/action',payload);assert.equal(created.status,200);const folder=(await created.json()).id;
  let frames='';while(!frames.includes('event: files-changed'))frames+=new TextDecoder().decode((await reader.read()).value);assert.match(frames,/revision/);
  let r=await request('safy','/api/files');assert.equal((await r.json()).items[0].id,folder);
  const up={id:randomUUID(),action:'upload',parent:folder,name:'project.html',data:Buffer.from('<h1>Saved safely</h1>').toString('base64')};r=await request('safy','/api/files/action',up);const file=(await r.json()).id;
  r=await request('mahmoud','/api/files/content/'+file);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(r.headers.get('content-type'),'application/octet-stream');assert.equal(await r.text(),'<h1>Saved safely</h1>');assert.equal((await request('','/api/files/content/'+file)).status,401);
  const state=await (await request('safy','/api/state')).json();assert.equal(state.filesRevision,2);
  const nr=await request('mahmoud','/api/files/action',{id:randomUUID(),action:'create',parent:folder,kind:'note',name:'Shared note',note:'Link https://example.com'});const nid=(await nr.json()).id;
  assert.equal((await request('','/api/files/note/'+nid+'?format=docx')).status,401);
  for(const who of ['mahmoud','safy']){const doc=await request(who,'/api/files/note/'+nid+'?format=docx');assert.equal(doc.status,200);assert.match(doc.headers.get('content-type'),/wordprocessingml/);assert.equal(Buffer.from(await doc.arrayBuffer()).readUInt32LE(0),0x04034b50);}
  r=await request('safy','/api/files/action',{id:randomUUID(),action:'delete',item:folder,revision:1});assert.equal(r.status,200);assert.equal((await (await request('mahmoud','/api/files')).json()).items.length,0);assert.equal((await request('safy','/api/files/content/'+file)).status,404);
 }finally{controller.abort();await new Promise(r=>server.close(r));store.close();}
});
