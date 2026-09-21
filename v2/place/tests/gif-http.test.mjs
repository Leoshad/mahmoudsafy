import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../store.mjs';import {createApp} from '../server.mjs';
test('animated GIF bytes survive upload and retrieval by either partner',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:');
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test secret with over thirty characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={},controllers=[];
 const post=async(who,path,data)=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:'http://localhost',Cookie:cookies[who]||'','Content-Type':'application/json'},body:JSON.stringify(data)});
 try{for(const who of ['mahmoud','safy']){const r=await post(who,'login',{email:who+'@example.test',password:'test'});cookies[who]=r.headers.get('set-cookie').split(';')[0];await r.json();}

 const bytes=Buffer.from('R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQADAAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBDAABACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7','base64');
 for(const who of ['mahmoud','safy']){
 const uploaded=await post(who,'photos',{data:bytes.toString('base64')});assert.equal(uploaded.status,201);const {id}=await uploaded.json();
 const other=who==='mahmoud'?'safy':'mahmoud';
 const response=await fetch(base+'/api/photos/'+id,{headers:{Cookie:cookies[other]}});
 assert.equal(response.headers.get('content-type'),'image/gif');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 }
 const large=Buffer.alloc(5*1024*1024+1);large.write('GIF89a');
 assert.equal((await post('mahmoud','photos',{data:large.toString('base64')})).status,400);
 assert.equal((await post('safy','photos',{data:Buffer.from('not an image').toString('base64')})).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
