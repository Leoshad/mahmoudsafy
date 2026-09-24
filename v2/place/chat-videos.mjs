import {statfsSync,statSync} from 'node:fs';
import {dirname} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {check} from './domain.mjs';
export const VIDEO_MAX=20*1024*1024,VIDEO_TOTAL=200*1024*1024;
const uuid=/^[a-f0-9-]{36}$/;
// Validate ISO BMFF structure and an actual video track, not a renamed audio file.
export function videoType(bytes){
 function boxes(start,end){const out=[];for(let p=start;p+8<=end;){let n=bytes.readUInt32BE(p),h=8;if(n===1){if(p+16>end)return [];n=Number(bytes.readBigUInt64BE(p+8));h=16;}if(n===0)n=end-p;if(!Number.isSafeInteger(n)||n<h||p+n>end)return [];out.push({type:bytes.toString('ascii',p+4,p+8),start:p+h,end:p+n});p+=n;}return out;}
 const top=boxes(0,bytes.length),ftyp=top.find(b=>b.type==='ftyp'),moov=top.find(b=>b.type==='moov');
 if(!ftyp||!moov||!top.some(b=>b.type==='mdat'))return null;
 const tracks=boxes(moov.start,moov.end).filter(b=>b.type==='trak');
 for(const trak of tracks)for(const mdia of boxes(trak.start,trak.end).filter(b=>b.type==='mdia'))for(const h of boxes(mdia.start,mdia.end).filter(b=>b.type==='hdlr'))if(h.end-h.start>=12&&bytes.toString('ascii',h.start+8,h.start+12)==='vide')return bytes.toString('ascii',ftyp.start,ftyp.start+4)==='qt  '?'video/quicktime':'video/mp4';
 return null;
}
export class ChatVideos{
 constructor(store){this.store=store;this.db=store.db;this.uploading=new Set();this.db.exec('CREATE TABLE IF NOT EXISTS chat_videos(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB,poster BLOB,digest TEXT NOT NULL,createdAt TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)');}
 used(){return this.db.prepare('SELECT COALESCE(SUM(length(bytes)+COALESCE(length(poster),0)),0) AS n FROM chat_videos WHERE deleted=0').get().n;}
 capacity(size){check(this.used()+size<=VIDEO_TOTAL,'Video storage is full. Open Video storage to delete one of your old videos.',413);if(this.store.path&&this.store.path!==':memory:'){const disk=statfsSync(dirname(this.store.path)),dbSize=statSync(this.store.path).size;check(disk.bavail*disk.bsize>=dbSize*2.2+size*4.2+64*1024*1024,'Storage is low. Open Video storage to free space before uploading.',413);}}
 list(who){return {used:this.used(),limit:VIDEO_TOTAL,maxFile:VIDEO_MAX,items:this.db.prepare('SELECT id,owner,name,mime,length(bytes) AS size,createdAt,EXISTS(SELECT 1 FROM messages WHERE video=chat_videos.id) AS shared FROM chat_videos WHERE deleted=0 ORDER BY createdAt DESC').all().filter(v=>v.shared||v.owner===who).map(v=>({...v,canDelete:v.owner===who}))};}
 access(id,who){check(uuid.test(id),'Video not found.',404);const v=this.db.prepare('SELECT id,owner,name,mime,length(bytes) AS size,deleted FROM chat_videos WHERE id=?').get(id);check(v&&!v.deleted,'This video was removed.',404);check(v.owner===who||this.db.prepare('SELECT 1 FROM messages WHERE video=?').get(id),'Video not found.',404);return v;}
 async upload(req,who,id){check(uuid.test(id),'Invalid upload ID.');check(!this.uploading.has(who),'A video is already uploading. Please wait.',429);this.uploading.add(who);
 try{const length=Number(req.headers['content-length']);check(!length||length<=VIDEO_MAX,'Choose a video up to 20 MB.',413);this.capacity(length||VIDEO_MAX);const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;check(size<=VIDEO_MAX,'Choose a video up to 20 MB.',413);chunks.push(chunk);}check(size>16,'Choose a valid MP4 or MOV video.');const bytes=Buffer.concat(chunks),mime=videoType(bytes);check(mime,'Choose an MP4 or MOV file containing a video track.');let name='Video';try{name=decodeURIComponent(req.headers['x-video-name']||'Video').replace(/[\x00-\x1f]/g,'').slice(0,150)||'Video';}catch{}
 const digest=createHash('sha256').update(bytes).digest('hex'),old=this.db.prepare('SELECT owner,digest,deleted FROM chat_videos WHERE id=?').get(id);if(old){check(old.owner===who&&old.digest===digest&&!old.deleted,'This upload ID is no longer available.',409);return {id};}
 this.capacity(size);this.db.prepare('INSERT INTO chat_videos(id,owner,name,mime,bytes,digest,createdAt) VALUES(?,?,?,?,?,?,?)').run(id,who,name,mime,bytes,digest,new Date().toISOString());return {id};
 }finally{this.uploading.delete(who);}}
 async poster(req,who,id){const v=this.access(id,who);check(v.owner===who,'Only the uploader can change this preview.',403);let size=0;const chunks=[];for await(const c of req){size+=c.length;check(size<=150000,'Preview is too large.',413);chunks.push(c);}let bytes;try{bytes=await sharp(Buffer.concat(chunks),{limitInputPixels:2000000}).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).jpeg({quality:65}).toBuffer();}catch{check(false,'Invalid video preview.');}this.access(id,who);this.capacity(bytes.length);this.db.prepare('UPDATE chat_videos SET poster=? WHERE id=? AND deleted=0').run(bytes,id);}
 remove(id,who,draftOnly=false){const v=this.db.prepare('SELECT owner,deleted FROM chat_videos WHERE id=?').get(id);check(v&&v.owner===who,'Only the uploader can delete this video.',403);if(draftOnly)check(!this.db.prepare('SELECT 1 FROM messages WHERE video=?').get(id),'This video is already shared.',409);this.db.prepare('UPDATE chat_videos SET bytes=NULL,poster=NULL,deleted=1 WHERE id=?').run(id);return {ok:true};}
 async serve(req,res,id,who,poster=false){const v=this.access(id,who);if(poster){const p=this.db.prepare('SELECT poster FROM chat_videos WHERE id=?').get(id).poster;check(p,'No preview available.',404);res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':p.length});return res.end(p);}
 let start=0,end=v.size-1,status=200;const headers={'Content-Type':v.mime,'Accept-Ranges':'bytes','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(v.name)}`};
 if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(m&&(m[1]||m[2])){if(!m[1])start=Math.max(0,v.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}}if(!m||(!m[1]&&!m[2])||(!m[1]&&Number(m[2])===0)||!Number.isSafeInteger(start)||start>=v.size||start>end){res.writeHead(416,{...headers,'Content-Range':`bytes */${v.size}`});return res.end();}status=206;headers['Content-Range']=`bytes ${start}-${end}/${v.size}`;}
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')return res.end();const controller=new AbortController(),closed=()=>controller.abort();res.once('close',closed);
 try{for(let p=start;p<=end&&!res.destroyed;p+=65536){const row=this.db.prepare('SELECT substr(bytes,?,?) AS chunk FROM chat_videos WHERE id=? AND deleted=0').get(p+1,Math.min(65536,end-p+1),id);if(!row?.chunk){res.destroy();return;}if(!res.write(row.chunk))await once(res,'drain',{signal:controller.signal});}res.end();}catch{res.destroy();}finally{res.off('close',closed);}}
}
