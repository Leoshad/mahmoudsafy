import {referencedPhotoIds} from './photo-storage.mjs';
const WEEK=7*86400000;
export function unusedAudio(store,now=Date.now()){
 store.db.exec('CREATE TABLE IF NOT EXISTS audio_orphans(id TEXT PRIMARY KEY,since INTEGER NOT NULL)');
 const used=referencedPhotoIds(store.state());
 for(const m of store.db.prepare('SELECT audio FROM messages WHERE audio IS NOT NULL').iterate())used.add(m.audio);
 for(const j of store.db.prepare('SELECT body FROM jobs').iterate())referencedPhotoIds(JSON.parse(j.body),used);
 const candidates=[];
 for(const v of store.db.prepare('SELECT id FROM voices').iterate()){
  if(used.has(v.id)){store.db.prepare('DELETE FROM audio_orphans WHERE id=?').run(v.id);continue;}
  store.db.prepare('INSERT OR IGNORE INTO audio_orphans VALUES(?,?)').run(v.id,now);
  if(store.db.prepare('SELECT since FROM audio_orphans WHERE id=?').get(v.id).since<now-WEEK)candidates.push(v.id);
 }
 return candidates;
}
export function reclaimAudio(store,backedUpIds,now=Date.now()){
 const eligible=new Set(unusedAudio(store,now));let removed=0;
 store.tx(()=>{for(const id of backedUpIds)if(eligible.has(id)){removed+=Number(store.db.prepare('DELETE FROM voices WHERE id=?').run(id).changes);store.db.prepare('DELETE FROM audio_orphans WHERE id=?').run(id);}});
 return removed;
}
