import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,writeFile,stat,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../store.mjs';
import {createRecoveryBackup} from '../backup.mjs';
import {resticBackup,runBackupTool} from '../restic-backup.mjs';
const program=new URL('../backup-bin/restic',import.meta.url).pathname;
const available=await stat(program).then(()=>true,()=>false);
const secret='synthetic recovery key longer than thirty two characters';
test('incremental backups restore exact SQLite bytes, reuse attachment chunks and retain three verified snapshots',{skip:!available,timeout:240000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'restic-integration-')),store=new Store(':memory:');
 const repository=join(dir,'repo'),env={...process.env,RESTIC_REPOSITORY:repository,RESTIC_PASSWORD:createHash('sha256').update('our-place-restic-v1:'+secret).digest('hex'),GOMAXPROCS:'2',GOMEMLIMIT:'96MiB'};
 try{
  for(let i=0;i<32;i++)store.db.prepare('INSERT INTO photos(id,mime,bytes,createdAt) VALUES(?,?,?,?)').run('test-'+i,'image/jpeg',randomBytes(1024*1024),new Date().toISOString());
  const results=[];
  for(let i=0;i<4;i++){
   store.db.prepare('UPDATE state SET body=body WHERE id=1').run();
   store.db.exec('CREATE TABLE IF NOT EXISTS bandwidth_test(id INTEGER PRIMARY KEY,body TEXT)');
   store.db.prepare('INSERT INTO bandwidth_test(body) VALUES(?)').run('text '+i);
   const archive=await createRecoveryBackup(store,dir,secret);
   results.push(await resticBackup({archive,secret,repository,program}));
  }
  assert.ok(results.every(r=>r.downloadRestored));
  assert.ok(results[1].newDataBytes<results[0].newDataBytes/2,'changed text must not retransmit the full attachment database');
  assert.ok(results.every(r=>!r.retentionWarning));
  const snapshots=JSON.parse(await runBackupTool(program,['--no-cache','snapshots','--json'],{env}));assert.equal(snapshots.length,3);
  const archives=(await readdir(dir)).filter(n=>n.endsWith('.opbackup'));assert.ok(archives.length,'legacy recovery files are retained');
  // A broken remote pack must fail a full uncached restore; a cached index cannot mask it.
  const packs=await readdir(join(repository,'data'),{recursive:true});const pack=packs.find(name=>/^[a-f0-9]{2}\/[a-f0-9]{64}$/.test(name));assert.ok(pack);
  await chmod(join(repository,'data',pack),0o600);await writeFile(join(repository,'data',pack),Buffer.from('corrupt'));
  await assert.rejects(runBackupTool(program,['--no-cache','check','--read-data'],{env}));
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('subprocess errors never expose private tool output',async()=>{
 await assert.rejects(runBackupTool(process.execPath,['-e',"console.error('private-token');process.exit(1)"],{env:{}}),e=>!e.message.includes('private-token'));
});
