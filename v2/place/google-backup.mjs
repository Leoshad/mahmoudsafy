import {randomBytes,createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {basename} from 'node:path';
const SCOPE='https://www.googleapis.com/auth/drive.file';
const API='https://www.googleapis.com/drive/v3/files';
export function googleBackup({store,origin,seal,open,fetcher=fetch,env=process.env}){
 store.db.exec('CREATE TABLE IF NOT EXISTS google_backup(id INTEGER PRIMARY KEY,token TEXT,lastSuccess INTEGER,lastAttempt INTEGER,error TEXT); CREATE TABLE IF NOT EXISTS google_backup_states(state TEXT PRIMARY KEY,sid TEXT,expires INTEGER)');
 const configured=()=>!!(env.GOOGLE_BACKUP_CLIENT_ID&&env.GOOGLE_BACKUP_CLIENT_SECRET);
 const redirect=origin+'/api/backup/google/callback';
 const row=()=>store.db.prepare('SELECT * FROM google_backup WHERE id=1').get();
 const failure=message=>Object.assign(new Error(message),{status:400});
 async function tokenRequest(params){
  const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:env.GOOGLE_BACKUP_CLIENT_ID,client_secret:env.GOOGLE_BACKUP_CLIENT_SECRET}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw failure('Google authorization failed. Reconnect Google Drive.');
  return r.json();
 }
 function status(){const r=row();return {configured:configured(),connected:!!r?.token,lastSuccess:r?.lastSuccess??null,lastAttempt:r?.lastAttempt??null,error:r?.error??null};}
 function start(sid){
  if(!configured())throw failure('Configure Google backup credentials on the server first.');
  const state=randomBytes(32).toString('base64url');store.db.prepare('DELETE FROM google_backup_states WHERE expires<?').run(Date.now());
  store.db.prepare('INSERT INTO google_backup_states VALUES(?,?,?)').run(state,sid,Date.now()+600000);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:env.GOOGLE_BACKUP_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state});
  return {url:url.href,cookie:seal({state})};
 }
 async function callback(params,cookie){
  let value;try{value=open(cookie);}catch{throw failure('Connection expired. Start again.');}
  const state=params.get('state');if(!state||state!==value.state)throw failure('Connection expired. Start again.');
  const pending=store.db.prepare('DELETE FROM google_backup_states WHERE state=? RETURNING *').get(state);
  if(!pending||pending.expires<Date.now()||!store.db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?').get(pending.sid,Date.now()))throw failure('Connection expired. Sign in and start again.');
  if(params.has('error')||!params.get('code'))throw failure('Google connection was cancelled.');
  const t=await tokenRequest({grant_type:'authorization_code',code:params.get('code'),redirect_uri:redirect});
  if(!t.refresh_token||!t.scope?.split(' ').includes(SCOPE))throw failure('Google Drive permission was not granted. Try connecting again.');
  store.db.prepare('INSERT INTO google_backup(id,token) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,error=NULL').run(seal({refresh:t.refresh_token}));
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
   const size=(await stat(path)).size,hash=createHash('md5');for await(const chunk of createReadStream(path))hash.update(chunk);const checksum=hash.digest('hex');
   const start=await fetcher('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Upload-Content-Type':'application/octet-stream','X-Upload-Content-Length':String(size)},body:JSON.stringify({name:basename(path),appProperties:{ourPlaceBackup:'v1'}}),signal:AbortSignal.timeout(20000)});
   if(!start.ok)throw failure('Could not start Google Drive upload.');
   const location=new URL(start.headers.get('location')||'https://invalid.invalid');if(location.origin!=='https://www.googleapis.com')throw failure('Invalid Google upload destination.');
   const result=await fetcher(location.href,{method:'PUT',headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(size)},body:createReadStream(path),duplex:'half',signal:AbortSignal.timeout(300000)});
   if(!result.ok)throw failure('Google Drive upload failed. The local backup is safe.');
   const file=await result.json();if(!file.id||Number(file.size)!==size||file.md5Checksum!==checksum)throw failure('Google Drive backup verification failed.');
   store.db.prepare('UPDATE google_backup SET lastSuccess=?,error=NULL WHERE id=1').run(Date.now());
  })().catch(e=>{store.db.prepare('UPDATE google_backup SET error=? WHERE id=1').run(e.status?e.message:'Google Drive backup failed. Retry or reconnect.');throw failure('Google Drive backup failed. Check backup status.');}).finally(()=>{pendingUpload=null;});
  return pendingUpload;
 }
 return {status,start,callback,upload};
}
