import {randomBytes,createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {stat,mkdtemp,rm} from 'node:fs/promises';
import {basename,dirname,join} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {restoreRecoveryBackup} from './backup.mjs';
const SCOPE='https://www.googleapis.com/auth/drive.file';
const API='https://www.googleapis.com/drive/v3/files';
export function googleBackup({store,origin,seal,open,secret,fetcher=fetch,env=process.env}){
 store.db.exec('CREATE TABLE IF NOT EXISTS google_backup(id INTEGER PRIMARY KEY,token TEXT,lastSuccess INTEGER,lastAttempt INTEGER,error TEXT); CREATE TABLE IF NOT EXISTS google_backup_states(state TEXT PRIMARY KEY,sid TEXT,expires INTEGER)');
 const folder=()=>env.GOOGLE_BACKUP_FOLDER_ID||'';
 const family=()=>createHash('sha256').update('drive-backup-family:'+secret).digest('hex').slice(0,32);
 const configured=()=>!!(env.GOOGLE_BACKUP_CLIENT_ID&&env.GOOGLE_BACKUP_CLIENT_SECRET);
 const redirect=origin+'/api/backup/google/callback';
 const row=()=>store.db.prepare('SELECT * FROM google_backup WHERE id=1').get();
 const failure=message=>Object.assign(new Error(message),{status:400});
 async function tokenRequest(params){
  const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:env.GOOGLE_BACKUP_CLIENT_ID,client_secret:env.GOOGLE_BACKUP_CLIENT_SECRET}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw failure('Google authorization failed. Reconnect Google Drive.');
  return r.json();
 }
 function status(){const r=row();return {configured:configured(),connected:!!r?.token,lastSuccess:r?.lastSuccess??null,lastAttempt:r?.lastAttempt??null,error:r?.error??null,folderId:folder(),retention:3};}
 function start(sid){
  if(!configured())throw failure('Configure Google backup credentials on the server first.');
  const state=randomBytes(32).toString('base64url');store.db.prepare('DELETE FROM google_backup_states WHERE expires<?').run(Date.now());
  store.db.prepare('INSERT INTO google_backup_states VALUES(?,?,?)').run(state,sid,Date.now()+600000);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:env.GOOGLE_BACKUP_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state});
  if(folder()){url.searchParams.set('trigger_onepick','true');url.searchParams.set('allow_folder_selection','true');url.searchParams.set('mimetypes','application/vnd.google-apps.folder');}
  return {url:url.href,cookie:seal({state})};
 }
 async function callback(params,cookie){
  let value;try{value=open(cookie);}catch{throw failure('Connection expired. Start again.');}
  const state=params.get('state');if(!state||state!==value.state)throw failure('Connection expired. Start again.');
  const pending=store.db.prepare('DELETE FROM google_backup_states WHERE state=? RETURNING *').get(state);
  if(!pending||pending.expires<Date.now()||!store.db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?').get(pending.sid,Date.now()))throw failure('Connection expired. Sign in and start again.');
  if(params.has('error')||!params.get('code'))throw failure('Google connection was cancelled.');
  if(folder()&&!params.get('picked_file_ids')?.split(',').includes(folder()))throw failure('Select the configured backup folder to grant access. Your previous connection is unchanged.');
  const t=await tokenRequest({grant_type:'authorization_code',code:params.get('code'),redirect_uri:redirect});
  if(!t.refresh_token||!t.scope?.split(' ').includes(SCOPE))throw failure('Google Drive permission was not granted. Try connecting again.');
  store.db.prepare('INSERT INTO google_backup(id,token) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,error=NULL').run(seal({refresh:t.refresh_token}));
 }
 async function verifyDownload(file,headers,size,checksum,path){
  const dir=await mkdtemp(join(dirname(path),'.drive-verify-'));
  try{
   const response=await fetcher(API+'/'+encodeURIComponent(file.id)+'?alt=media',{headers,signal:AbortSignal.timeout(300000)});
   if(!response.ok||!response.body)throw failure('Could not download the new backup for verification. Older backups were kept.');
   const hash=createHash('md5');let bytes=0;
   const bound=new Transform({transform(chunk,_,done){bytes+=chunk.length;if(bytes>size)return done(Error('Downloaded backup is too large.'));hash.update(chunk);done(null,chunk);}});
   const archive=join(dir,'download.opbackup');
   await pipeline(Readable.fromWeb(response.body),bound,createWriteStream(archive,{flags:'wx',mode:0o600}));
   if(bytes!==size||hash.digest('hex')!==checksum)throw failure('Downloaded backup did not match. Older backups were kept.');
   await restoreRecoveryBackup(archive,join(dir,'restored.sqlite'),secret);
  }finally{await rm(dir,{recursive:true,force:true});}
 }
 async function rotate(headers,currentId){
  // Only this installation's fully verified archives in the selected folder.
  if(!folder())return;
  const files=[];let pageToken;
  do{
   const query=new URLSearchParams({q:`'${folder()}' in parents and trashed = false and appProperties has { key='ourPlaceBackup' and value='v1' } and appProperties has { key='verifiedFamily' and value='${family()}' }`,fields:'nextPageToken,incompleteSearch,files(id,name,parents,appProperties,createdTime)',pageSize:'1000',...(pageToken?{pageToken}:{})});
   const response=await fetcher(API+'?'+query,{headers,signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw failure('New backup verified; could not list older backups. Nothing was deleted.');
   const result=await response.json();if(result.incompleteSearch||!Array.isArray(result.files))throw failure('Incomplete backup listing. Older backups were kept.');
   files.push(...result.files);pageToken=result.nextPageToken;
  }while(pageToken);
  const candidates=[...new Map(files.filter(f=>f.parents?.includes(folder())&&f.appProperties?.ourPlaceBackup==='v1'&&f.appProperties?.verifiedFamily===family()&&/^recovery-\d+-[a-f0-9-]+\.opbackup$/.test(f.name)&&Number.isFinite(Date.parse(f.createdTime))).map(f=>[f.id,f])).values()].sort((a,b)=>Date.parse(b.createdTime)-Date.parse(a.createdTime)||b.id.localeCompare(a.id));
  if(!candidates.some(f=>f.id===currentId))throw failure('New backup is not yet listed. Older backups were kept.');
  const keep=new Set([currentId,...candidates.filter(f=>f.id!==currentId).slice(0,2).map(f=>f.id)]);
  for(const old of candidates.filter(f=>!keep.has(f.id))){
   // Recheck membership immediately before deletion; never touch manually moved files.
   const response=await fetcher(API+'/'+encodeURIComponent(old.id)+'?fields=id,parents,appProperties,trashed',{headers,signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw failure('New backup verified; older backup cleanup stopped.');
   const item=await response.json();if(item.trashed||!item.parents?.includes(folder())||item.appProperties?.ourPlaceBackup!=='v1'||item.appProperties?.verifiedFamily!==family())continue;
   const removed=await fetcher(API+'/'+encodeURIComponent(old.id),{method:'DELETE',headers,signal:AbortSignal.timeout(20000)});
   if(!removed.ok)throw failure('New backup verified; an older backup could not be removed.');
  }
 }
 let pendingUpload;
 async function upload(path){
  if(!configured()||!row()?.token)return;
  if(pendingUpload)return pendingUpload;
  pendingUpload=(async()=>{
   store.db.prepare('UPDATE google_backup SET lastAttempt=?,error=NULL WHERE id=1').run(Date.now());
   const t=await tokenRequest({grant_type:'refresh_token',refresh_token:open(row().token).refresh});
   if(!t.access_token)throw failure('Google did not return an access token.');
   const headers={Authorization:'Bearer '+t.access_token};
   if(typeof secret!=='string'||secret.length<32)throw failure('Recovery verification is not configured. Older backups were kept.');
   if(folder()&&!/^[a-zA-Z0-9_-]+$/.test(folder()))throw failure('Invalid backup folder ID.');
   if(folder()){
    const access=await fetcher(API+'/'+encodeURIComponent(folder())+'?fields=id,mimeType,trashed,capabilities(canAddChildren)',{headers,signal:AbortSignal.timeout(20000)});
    if(!access.ok)throw failure('The selected Drive folder is not accessible to Our Place. Grant access to this folder. Existing backups were kept.');
    const info=await access.json();if(info.mimeType!=='application/vnd.google-apps.folder'||info.trashed||!info.capabilities?.canAddChildren)throw failure('The selected Drive folder is not writable. Existing backups were kept.');
   }
   const size=(await stat(path)).size,hash=createHash('md5');for await(const chunk of createReadStream(path))hash.update(chunk);const checksum=hash.digest('hex');
   const start=await fetcher('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Upload-Content-Type':'application/octet-stream','X-Upload-Content-Length':String(size)},body:JSON.stringify({name:basename(path),appProperties:{ourPlaceBackup:'v1'},...(folder()?{parents:[folder()]}:{})}),signal:AbortSignal.timeout(20000)});
   if(!start.ok)throw failure('Could not start Google Drive upload.');
   const location=new URL(start.headers.get('location')||'https://invalid.invalid');if(location.origin!=='https://www.googleapis.com')throw failure('Invalid Google upload destination.');
   const result=await fetcher(location.href,{method:'PUT',headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(size)},body:createReadStream(path),duplex:'half',signal:AbortSignal.timeout(300000)});
   if(!result.ok)throw failure('Google Drive upload failed. The local backup is safe.');
   const file=await result.json();if(!file.id||Number(file.size)!==size||file.md5Checksum!==checksum)throw failure('Google Drive backup verification failed.');
   await verifyDownload(file,headers,size,checksum,path);
   const marked=await fetcher(API+'/'+encodeURIComponent(file.id),{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({appProperties:{ourPlaceBackup:'v1',verifiedFamily:family()}}),signal:AbortSignal.timeout(20000)});
   if(!marked.ok)throw failure('Backup verified but verification status could not be saved. Older backups were kept.');
   store.db.prepare('UPDATE google_backup SET lastSuccess=?,error=NULL WHERE id=1').run(Date.now());
   console.info(JSON.stringify({event:'google_backup_verified',folderId:folder()||'root',fileId:file.id,downloadRestored:true}));
   await rotate(headers,file.id);
  })().catch(e=>{const message=e.status?e.message:'Google Drive backup failed. Retry or reconnect.';console.warn(JSON.stringify({event:'google_backup_failed',message}));store.db.prepare('UPDATE google_backup SET error=? WHERE id=1').run(message);throw failure('Google Drive backup failed. Check backup status.');}).finally(()=>{pendingUpload=null;});
  return pendingUpload;
 }
 return {status,start,callback,upload};
}
