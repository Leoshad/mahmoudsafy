import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';
import {ChatVideos,videoType,VIDEO_MAX,VIDEO_TOTAL} from '../chat-videos.mjs';
import {clip} from './video-fixture.mjs';

test('video validation, upload limits, total quota and bounded concurrent uploads',async()=>{
 const store=new Store(':memory:'),v=new ChatVideos(store);
 try{
 assert.equal(videoType(clip),'video/mp4');assert.equal(videoType(Buffer.from('not video')) ,null);
 const audio=Buffer.from(clip);audio.write('soun',audio.indexOf('vide'));assert.equal(videoType(audio),null);
 const request=bytes=>Object.assign(Readable.from([bytes]),{headers:{'content-length':String(bytes.length)}});
 await assert.rejects(v.upload(request(Buffer.alloc(VIDEO_MAX+1)),'Mahmoud',randomUUID()),/20 MB/);
 const used=v.used.bind(v);v.used=()=>VIDEO_TOTAL;assert.throws(()=>v.capacity(1),/storage is full/);v.used=used;
 let release;const pending=Object.assign(Readable.from((async function*(){await new Promise(r=>release=r);yield clip;})()),{headers:{}}),id=randomUUID();
 const a=v.upload(pending,'Mahmoud',id);await new Promise(r=>setImmediate(r));await assert.rejects(v.upload(request(clip),'Mahmoud',randomUUID()),/already uploading/);release();await a;
 assert.equal(v.used(),clip.length);await v.upload(request(clip),'Mahmoud',id);assert.equal(v.used(),clip.length);v.remove(id,'Mahmoud',true);assert.equal(v.used(),0);
 }finally{store.close();}
});

test('two-account video upload, private drafts, byte ranges, persistence, deletion and export',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const store=new Store(':memory:'),cookies={};
 const server=createApp({store,origin:'http://localhost',secret:'video-tests-only-secret-over-thirty-two',testing:true,authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1],user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const req=(who,path,data,headers={})=>fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookies[who]||'',Origin:'http://localhost','Content-Type':Buffer.isBuffer(data)?'video/mp4':'application/json',...headers},body:Buffer.isBuffer(data)?data:data?JSON.stringify(data):undefined});
 try{
 for(const name of ['mahmoud','safy']){const r=await req(name,'login',{email:name+'@example.test',password:'test-only'});cookies[name]=r.headers.get('set-cookie').split(';')[0];await r.json();}
 const id=randomUUID(),uploaded=await req('mahmoud','videos?id='+id,clip,{'X-Video-Name':'our-video.mp4'});assert.equal(uploaded.status,201);await uploaded.json();
 assert.equal((await req('safy','videos/'+id)).status,404);assert.equal((await (await req('safy','videos')).json()).items.length,0);
 assert.equal((await req('safy','command',{id:randomUUID(),type:'message',data:{video:id,text:''}})).status,404);
 const message=randomUUID(),sent=await req('mahmoud','command',{id:message,type:'message',data:{video:id,text:'Our video'}});assert.equal(sent.status,200);await sent.json();
 const state=await (await req('safy','state')).json();assert.equal(state.messages.find(m=>m.id===message).video,id);
 const part=await req('safy','videos/'+id,undefined,{Range:'bytes=12-29'});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),`bytes 12-29/${clip.length}`);assert.deepEqual(Buffer.from(await part.arrayBuffer()),clip.subarray(12,30));
 const suffix=await req('safy','videos/'+id,undefined,{Range:'bytes=-12'});assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),clip.subarray(-12));
 assert.equal((await req('safy','videos/'+id,undefined,{Range:'bytes=99999999-'})).status,416);
 const archive=await (await req('mahmoud','export')).json();assert.equal(archive.videos[id].data,clip.toString('base64'));
 assert.equal((await req('safy','videos/'+id+'/delete',{})).status,403);
 assert.equal((await req('mahmoud','videos/'+id+'/discard',{})).status,409);
 const removed=await req('mahmoud','videos/'+id+'/delete',{});assert.equal(removed.status,200);await removed.json();
 assert.equal((await req('safy','videos/'+id)).status,404);assert.equal((await (await req('mahmoud','videos')).json()).used,0);
 const after=await (await req('safy','state')).json();assert.ok(after.deletedVideos.includes(id));assert.equal(after.messages.find(m=>m.id===message).text,'Our video');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
