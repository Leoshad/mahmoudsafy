import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp,writeFile,rm,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {restoreRecoveryBackup} from './backup.mjs';
const bin=join(dirname(fileURLToPath(import.meta.url)),'backup-bin');
export async function fileHash(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
// Never return subprocess output on errors: remote credentials and filenames stay private.
export function runBackupTool(program,args,{env,input,timeout=900000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(program,args,{env,stdio:['pipe','pipe','pipe'],detached:true});let output='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}finish(Error('Backup tool timed out.'));},timeout);
  child.on('error',()=>finish(Error('Backup tool could not start.')));
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4*1024*1024){try{process.kill(-child.pid,'SIGKILL');}catch{}finish(Error('Backup tool output exceeded limit.'));}});
  child.stderr.resume();
  child.on('close',code=>code===0?finish(null,output):finish(Object.assign(Error('Backup tool failed.'),{code})));
  child.stdin.on('error',()=>{});
  if(input){const source=createReadStream(input);source.on('error',()=>{child.kill();finish(Error('Backup input could not be read.'));});child.on('close',()=>source.destroy());source.pipe(child.stdin);}else child.stdin.end();
 });
}
export async function resticBackup({archive,secret,folder,token,clientId,clientSecret,repository,program=join(bin,'restic'),rclone=join(bin,'rclone')}){
 if(typeof secret!=='string'||secret.length<32)throw Error('Invalid recovery key.');
 const family=createHash('sha256').update('drive-backup-family:'+secret).digest('hex').slice(0,32);
 const work=await mkdtemp(join(dirname(archive),'.restic-'));
 const raw=join(work,'source.sqlite'),restored=join(work,'restore');
 const password=createHash('sha256').update('our-place-restic-v1:'+secret).digest('hex');
 // Give subprocesses only the environment they need, not application/API secrets.
 const env={PATH:process.env.PATH,HOME:work,TMPDIR:work,GOMAXPROCS:'2',GOMEMLIMIT:'96MiB',RESTIC_PASSWORD:password,RESTIC_REPOSITORY:repository||`rclone:op:our-place-restic-${family}`,RCLONE_CONFIG:join(work,'rclone.conf')};
 const options=['--no-cache','--pack-size','4','--compression','auto','-o',`rclone.program=${rclone}`];
 const run=args=>runBackupTool(program,[...options,...args],{env});
 try{
  if(!repository){
   if(!/^[a-zA-Z0-9_-]+$/.test(folder))throw Error('A fixed Drive folder is required.');
   for(const value of [clientId,clientSecret])if(!value||/[\r\n]/.test(value))throw Error('Invalid Drive configuration.');
   await writeFile(env.RCLONE_CONFIG,`[op]\ntype = drive\nscope = drive.file\nclient_id = ${clientId}\nclient_secret = ${clientSecret}\nroot_folder_id = ${folder}\ntoken = ${JSON.stringify(token)}\n`,{mode:0o600});
  }
  try{await run(['cat','config']);}catch(error){
   if(error.code!==10)throw error;
   // A missing config in a populated repository must never cause re-initialization.
   if(!repository){let listing;try{listing=await runBackupTool(rclone,['lsf',`op:our-place-restic-${family}`,'--max-depth','1'],{env});}catch(e){if(e.code!==3)throw e;listing='';}if(listing.trim())throw Error('Existing backup repository needs repair.');}
   await run(['init']);
  }
  await restoreRecoveryBackup(archive,raw,secret);
  const sourceHash=await fileHash(raw),sourceBytes=(await stat(raw)).size;
  const tag='run-'+randomUUID();
  const result=await runBackupTool(program,[...options,'backup','--json','--host','our-place','--tag',tag,'--stdin','--stdin-filename','our-place.sqlite'],{env,input:raw});
  const summary=result.trim().split('\n').map(line=>JSON.parse(line)).find(item=>item.message_type==='summary');
  if(!/^[a-f0-9]{8,64}$/.test(summary?.snapshot_id||''))throw Error('Backup snapshot missing.');
  // Reclaim source space before a fresh, uncached remote restore.
  await rm(raw);
  await run(['restore',summary.snapshot_id,'--target',restored,'--verify']);
  if(await fileHash(join(restored,'our-place.sqlite'))!==sourceHash)throw Error('Remote restore mismatch.');
  // Exact byte equality to the SQLite-verified source also verifies every attachment.
  await rm(restored,{recursive:true,force:true});
  await run(['tag','--add','verified',summary.snapshot_id]);
  const snapshots=JSON.parse(await run(['snapshots','--json','--tag',tag]));
  if(snapshots.length!==1||!snapshots[0].tags?.includes('verified'))throw Error('Verified snapshot missing.');
  const snapshotId=snapshots[0].id;
  // Only verified snapshots participate in retention. Legacy .opbackup files are untouched.
  let retentionWarning=false;
  try{await run(['forget','--tag','verified','--host','our-place','--group-by','host','--keep-last','3']);await run(['prune','--max-repack-size','0']);}catch{retentionWarning=true;}
  return {snapshotId,sourceBytes,newDataBytes:summary.data_added_packed,downloadRestored:true,retentionWarning};
 }finally{await rm(work,{recursive:true,force:true});}
}
