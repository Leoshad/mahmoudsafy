import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {gunzipSync} from 'node:zlib';import {readFileSync} from 'node:fs';
import {Store} from '../store.mjs';import {createApp} from '../server.mjs';

// Raw requests so we see exactly what travels over the network (fetch would hide gzip).
function raw(base,path,headers={}){return new Promise((resolve,reject)=>{http.get(base+path,{headers},res=>{const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));}).on('error',reject);});}

test('built-in files are gzipped, revalidated with ETag, and arrive byte-identical',async()=>{
 const store=new Store(':memory:');const server=createApp({store,origin:'http://localhost',secret:'test secret with over thirty characters',testing:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const original=readFileSync(new URL('../public/app.js',import.meta.url));
  const first=await raw(base,'/app.js',{'Accept-Encoding':'gzip, br'});
  assert.equal(first.status,200);assert.equal(first.headers['content-encoding'],'gzip');assert.equal(first.headers['cache-control'],'no-cache');
  assert.ok(first.body.length<original.length/2,'compressed transfer is much smaller');
  assert.deepEqual(gunzipSync(first.body),original,'browser gets the exact same file');
  const again=await raw(base,'/app.js',{'Accept-Encoding':'gzip','If-None-Match':first.headers.etag});
  assert.equal(again.status,304);assert.equal(again.body.length,0,'unchanged file sends no body');
  const plain=await raw(base,'/app.js');
  assert.equal(plain.status,200);assert.equal(plain.headers['content-encoding'],undefined);assert.deepEqual(plain.body,original,'clients without gzip still work');
  const stale=await raw(base,'/app.js',{'If-None-Match':'"old-version"'});
  assert.equal(stale.status,200);assert.deepEqual(stale.body,original,'a new version is always delivered');
  const icon=await raw(base,'/icon-192.png',{'Accept-Encoding':'gzip'});
  assert.equal(icon.headers['content-encoding'],undefined);assert.equal(icon.headers['cache-control'],'public, max-age=86400');
  const page=await raw(base,'/',{'Accept-Encoding':'gzip'});
  assert.equal(page.status,200);assert.equal(page.headers['content-encoding'],'gzip');assert.match(page.headers['content-security-policy'],/default-src 'self'/);
  const video=await raw(base,'/hold-hands-motion.mp4');
  assert.equal(video.status,200);assert.equal(video.headers['cache-control'],'public, max-age=86400');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});

test('JSON responses are gzipped only when accepted and decode to the same data',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:');
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name+'-refresh',expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test secret with over thirty characters',testing:true,authFetch});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:'mahmoud@example.test',password:'test'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];await login.json();
  const zipped=await raw(base,'/api/state',{Cookie:cookie,'Accept-Encoding':'gzip'});
  const plain=await raw(base,'/api/state',{Cookie:cookie});
  assert.equal(zipped.status,200);assert.equal(plain.status,200);
  assert.equal(zipped.headers['content-encoding'],'gzip');assert.equal(plain.headers['content-encoding'],undefined);
  assert.equal(zipped.headers['cache-control'],'no-store','private data is still never cached');
  const strip=t=>JSON.parse(t,(k,v)=>k==='serverNow'?undefined:v);assert.deepEqual(strip(gunzipSync(zipped.body)),strip(plain.body));
  const viaFetch=await fetch(base+'/api/state',{headers:{Cookie:cookie}});assert.equal(viaFetch.status,200);assert.equal(typeof (await viaFetch.json()),'object');
  const photo=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
  const up=await fetch(base+'/api/photos',{method:'POST',headers:{Origin:'http://localhost',Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({data:photo.toString('base64')})});
  assert.equal(up.status,201);const {id}=await up.json();
  const got=await raw(base,'/api/photos/'+id,{Cookie:cookie,'Accept-Encoding':'gzip'});
  assert.equal(got.status,200);assert.equal(got.headers['cache-control'],'private, max-age=31536000, immutable');assert.equal(got.headers['content-encoding'],undefined);assert.deepEqual(got.body,photo);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
