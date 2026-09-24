import {once} from 'node:events';
import {referencedPhotoIds} from './photo-storage.mjs';
export async function exportArchive(store, snapshot, res) {
  // Only attach photos referenced by this person's authorized projection.
  const value = {...snapshot, messages:store.db.prepare('SELECT * FROM messages ORDER BY rowid').all(), format:'our-place-export-v2', note:'Shared data and your visible records, with referenced photos. Keep this file private. Full server recovery uses the encrypted recovery archive.'};
  const ids=referencedPhotoIds(value),controller=new AbortController();
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
    for(const id of new Set(value.messages.map(m=>m.audio).filter(Boolean))){const voice=store.db.prepare('SELECT mime,bytes,createdAt FROM voices WHERE id=?').get(id);if(!voice)continue;await write((first?'':',')+JSON.stringify(id)+':'+JSON.stringify({mime:voice.mime,data:Buffer.from(voice.bytes).toString('base64'),createdAt:voice.createdAt}));first=false;}
    await write('},"videos":{');first=true;
    for(const id of new Set(value.messages.map(m=>m.video).filter(Boolean))){const video=store.db.prepare('SELECT name,mime,bytes,poster,createdAt FROM chat_videos WHERE id=? AND deleted=0').get(id);if(!video)continue;await write((first?'':',')+JSON.stringify(id)+':'+JSON.stringify({name:video.name,mime:video.mime,data:Buffer.from(video.bytes).toString('base64'),poster:video.poster?Buffer.from(video.poster).toString('base64'):null,createdAt:video.createdAt}));first=false;}
    res.end('}}');
  } finally {res.off('close',closed);}
}
