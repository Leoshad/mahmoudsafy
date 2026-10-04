import {once} from 'node:events';
import {referencedPhotoIds} from './photo-storage.mjs';
export async function exportArchive(store, snapshot, res) {
  // Only attach photos referenced by this person's authorized projection.
  const value = {...snapshot, messages:store.db.prepare('SELECT * FROM messages ORDER BY rowid').all(), format:'our-place-export-v2', note:'Shared data and your visible records, with referenced photos. Keep this file private. Full server recovery uses the encrypted recovery archive.'};
  const ids=referencedPhotoIds(value);for(const m of value.messages)if(m.images)referencedPhotoIds(JSON.parse(m.images),ids);if(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shared_files'").get())for(const f of store.db.prepare('SELECT photo,document FROM shared_files').iterate()){if(f.photo)ids.add(f.photo);if(f.document)referencedPhotoIds(JSON.parse(f.document),ids);}
  const controller=new AbortController();
  const closed=()=>controller.abort();res.on('close',closed);
  const write=async text=>{if(res.destroyed)throw Error('Download closed.');if(!res.write(text))await once(res,'drain',{signal:controller.signal});};
  res.setHeader('Content-Disposition','attachment; filename="our-place-backup.json"');
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  try {
    await write(JSON.stringify(value).slice(0,-1)+',"photos":{');let first=true;
    for(const id of ids){const photo=store.db.prepare('SELECT mime,bytes,createdAt FROM photos WHERE id=?').get(id);if(!photo)continue;
      await write((first?'':',')+JSON.stringify(id)+':'+JSON.stringify({mime:photo.mime,data:Buffer.from(photo.bytes).toString('base64'),createdAt:photo.createdAt}));first=false;
    }
    await write('},"voices":{');first=true;
    for(const id of new Set([...value.messages.map(m=>m.audio),...(value.playlist?.tracks??[]).map(t=>t.audio),value.listening?.audio,...(value.listening?.queue??[]).map(t=>t.audio)].filter(Boolean))){const voice=store.db.prepare('SELECT mime,bytes,createdAt FROM voices WHERE id=?').get(id);if(!voice)continue;await write((first?'':',')+JSON.stringify(id)+':'+JSON.stringify({mime:voice.mime,data:Buffer.from(voice.bytes).toString('base64'),createdAt:voice.createdAt}));first=false;}
    await write('},"videos":{');first=true;
    for(const id of new Set(value.messages.map(m=>m.video).filter(Boolean))){const video=store.db.prepare('SELECT name,mime,bytes,poster,createdAt FROM chat_videos WHERE id=? AND deleted=0').get(id);if(!video)continue;await write((first?'':',')+JSON.stringify(id)+':'+JSON.stringify({name:video.name,mime:video.mime,data:Buffer.from(video.bytes).toString('base64'),poster:video.poster?Buffer.from(video.poster).toString('base64'):null,createdAt:video.createdAt}));first=false;}
    await write('},"documents":{');first=true;
    for(const id of new Set(value.messages.map(m=>m.document).filter(Boolean))){const d=store.db.prepare('SELECT name,bytes,createdAt FROM chat_documents WHERE id=?').get(id);if(!d)continue;await write((first?'':',')+JSON.stringify(id)+':'+JSON.stringify({name:d.name,mime:'application/pdf',data:Buffer.from(d.bytes).toString('base64'),createdAt:d.createdAt}));first=false;}
    await write('},"sharedFiles":[');first=true;
    const table=store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shared_files'").get();
    if(table)for(const row of store.db.prepare('SELECT * FROM shared_files ORDER BY rowid').iterate()){
      const file={...row};if(file.bytes)file.bytes=Buffer.from(file.bytes).toString('base64');
      await write((first?'':',')+JSON.stringify(file));first=false;
    }
    await write('],"manifest":'+JSON.stringify({version:1,includes:['visible state','all shared messages','referenced photos','referenced audio','referenced videos','referenced PDFs','shared folders and files'],excludes:['authentication secrets','private or sealed records not visible to the exporter','billing recovery ledger'],fullServerRestore:false}));
    res.end('}');
  } finally {res.off('close',closed);}
}
