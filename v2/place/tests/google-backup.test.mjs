import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {googleBackup} from '../google-backup.mjs';
const recoverySecret="test recovery secret with over 32 characters";
function setup(fetcher,extra={}){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE sessions(id TEXT,expires INTEGER)');db.prepare('INSERT INTO sessions VALUES(?,?)').run('owner',Date.now()+60000);const backup=googleBackup({store:{db},origin:'https://example.com',seal:JSON.stringify,open:JSON.parse,secret:recoverySecret,...extra,env:{GOOGLE_BACKUP_CLIENT_ID:'client',GOOGLE_BACKUP_CLIENT_SECRET:'secret',...extra.env},fetcher});return {db,backup};}
test('OAuth state is browser-bound and single-use',async()=>{
 const {db,backup}=setup(async()=>new Response(JSON.stringify({refresh_token:'refresh',scope:'https://www.googleapis.com/auth/drive.file'})));
 const first=backup.start('owner');const state=new URL(first.url).searchParams.get('state');const params=new URLSearchParams({state,code:'code'});
 await assert.rejects(backup.callback(params,JSON.stringify({state:'wrong'})));
 assert.equal(backup.status().connected,false);
 await backup.callback(params,first.cookie);assert.equal(backup.status().connected,true);
 await assert.rejects(backup.callback(params,first.cookie));db.close();
});
test('revoked app session cannot connect Drive',async()=>{
 const {db,backup}=setup(()=>{throw Error('must not call Google');});const a=backup.start('owner');db.exec('DELETE FROM sessions');
 await assert.rejects(backup.callback(new URLSearchParams({state:new URL(a.url).searchParams.get('state'),code:'code'}),a.cookie));assert.equal(backup.status().connected,false);db.close();
});
test('denied permission never marks Drive connected',async()=>{
 const {db,backup}=setup(async()=>new Response(JSON.stringify({refresh_token:'refresh',scope:'other'})));const a=backup.start('owner');
 await assert.rejects(backup.callback(new URLSearchParams({state:new URL(a.url).searchParams.get('state'),code:'code'}),a.cookie));assert.equal(backup.status().connected,false);db.close();
});
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';
test('backup settings require Mahmoud and connect requires same-origin POST',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:');
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test secret with over thirty characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/backup/google')).status,401);
  for(const name of ['mahmoud','safy']){const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.test',password:'test'})});const Cookie=login.headers.get('set-cookie').split(';')[0];await login.text();
   assert.equal((await fetch(base+'/api/backup/google',{headers:{Cookie}})).status,name==='mahmoud'?200:403);
   assert.equal((await fetch(base+'/api/backup/google/connect',{method:'POST',headers:{Cookie,Origin:'https://evil.test'}})).status,403);
  }
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
import {createRecoveryBackup} from '../backup.mjs';
const folderId='chosen-folder';
for(const scenario of ['success','corrupt-download','bad-checksum','folder-denied','wrong-secret','delete-failed'])test('Drive folder retention: '+scenario,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drive-test-')),store=new Store(':memory:');
 const path=await createRecoveryBackup(store,dir,recoverySecret),bytes=await readFile(path);store.close();
 const events=[],deleted=[];let meta,properties;
 const {db,backup}=setup(async(url,options={})=>{
  const u=new URL(url);events.push(options.method||'GET');
  if(url.includes('oauth2'))return Response.json({access_token:'access'});
  if(u.pathname.endsWith('/'+folderId))return scenario==='folder-denied'?new Response('',{status:404}):Response.json({id:folderId,mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});
  if(url.includes('uploadType=resumable')){meta=JSON.parse(options.body);return new Response('',{headers:{location:'https://www.googleapis.com/upload/test'}});}
  if(options.method==='PUT'){for await(const chunk of options.body){};return Response.json({id:'new',size:bytes.length,md5Checksum:scenario==='bad-checksum'?'bad':createHash('md5').update(bytes).digest('hex')});}
  if(u.searchParams.get('alt')==='media')return new Response(scenario==='corrupt-download'?bytes.subarray(1):bytes);
  if(options.method==='PATCH'){events.push('VERIFIED');properties=JSON.parse(options.body).appProperties;return Response.json({id:'new'});}
  if(u.searchParams.has('q'))return Response.json({files:[{id:'new',name:meta.name,parents:meta.parents,createdTime:'2026-09-29T12:00:00Z',appProperties:properties},...[1,2,3,4].map(n=>({id:'old'+n,name:`recovery-${n}-abcd.opbackup`,parents:[folderId],createdTime:`2026-09-2${9-n}T12:00:00Z`,appProperties:properties})),{id:'unrelated',name:'photo.jpg',parents:[folderId],createdTime:'2026-09-20T12:00:00Z',appProperties:{}},{id:'unverified',name:'recovery-0-abcd.opbackup',parents:[folderId],createdTime:'2026-09-20T12:00:00Z',appProperties:{ourPlaceBackup:'v1'}}]});
  if(options.method==='DELETE'){if(scenario==='delete-failed')return new Response('',{status:503});deleted.push(u.pathname.split('/').pop());return new Response(null,{status:204});}
  return Response.json({parents:[folderId],appProperties:properties});
 },{secret:scenario==='wrong-secret'?'wrong recovery secret over thirty two characters':recoverySecret,env:{GOOGLE_BACKUP_FOLDER_ID:folderId}});
 db.prepare('INSERT INTO google_backup(id,token) VALUES(1,?)').run(JSON.stringify({refresh:'refresh'}));
 try{
  if(scenario==='success'){await backup.upload(path);assert.ok(backup.status().lastSuccess);assert.deepEqual(meta.parents,[folderId]);assert.deepEqual(deleted,['old3','old4']);assert.ok(events.indexOf('VERIFIED')<events.indexOf('DELETE'));}
  else{await assert.rejects(backup.upload(path));assert.deepEqual(deleted,[]);assert.ok(backup.status().error);assert.equal(!!backup.status().lastSuccess,scenario==='delete-failed');}
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('folder grant uses Google picker and requires the exact configured folder',async()=>{
 const {db,backup}=setup(async()=>Response.json({refresh_token:'refresh',scope:'https://www.googleapis.com/auth/drive.file'}),{env:{GOOGLE_BACKUP_FOLDER_ID:folderId}});
 try{
  let start=backup.start('owner'),url=new URL(start.url);assert.equal(url.searchParams.get('trigger_onepick'),'true');assert.equal(url.searchParams.get('file_ids'),null);assert.equal(url.searchParams.get('allow_folder_selection'),'true');
  await assert.rejects(backup.callback(new URLSearchParams({state:url.searchParams.get('state'),code:'code',picked_file_ids:'wrong'}),start.cookie));assert.equal(backup.status().connected,false);
  start=backup.start('owner');url=new URL(start.url);await backup.callback(new URLSearchParams({state:url.searchParams.get('state'),code:'code',picked_file_ids:folderId}),start.cookie);assert.equal(backup.status().connected,true);
 }finally{db.close();}
});
