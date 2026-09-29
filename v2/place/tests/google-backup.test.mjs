import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {googleBackup} from '../google-backup.mjs';
function setup(fetcher){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE sessions(id TEXT,expires INTEGER)');db.prepare('INSERT INTO sessions VALUES(?,?)').run('owner',Date.now()+60000);const backup=googleBackup({store:{db},origin:'https://example.com',seal:JSON.stringify,open:JSON.parse,env:{GOOGLE_BACKUP_CLIENT_ID:'client',GOOGLE_BACKUP_CLIENT_SECRET:'secret'},fetcher});return {db,backup};}
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
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
test('upload verifies remote bytes before success; corrupt checksum is rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drive-test-')),path=join(dir,'test.opbackup');await writeFile(path,'encrypted-test');let bad=false;
 const {db,backup}=setup(async(url,options)=>{
  if(url.includes('oauth2'))return new Response(JSON.stringify({access_token:'access'}));
  if(options.method==='POST')return new Response('',{headers:{location:'https://www.googleapis.com/upload/test'}});
  for await(const chunk of options.body){};
  return new Response(JSON.stringify({id:'file',size:14,md5Checksum:bad?'wrong':createHash('md5').update('encrypted-test').digest('hex')}));
 });db.prepare('INSERT INTO google_backup(id,token) VALUES(1,?)').run(JSON.stringify({refresh:'refresh'}));
 try{await backup.upload(path);const success=backup.status().lastSuccess;assert.ok(success);bad=true;await assert.rejects(backup.upload(path));assert.equal(backup.status().lastSuccess,success);assert.ok(backup.status().error);}finally{db.close();await rm(dir,{recursive:true});}
});
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
