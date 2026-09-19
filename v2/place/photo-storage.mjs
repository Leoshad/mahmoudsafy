const DAY = 86400000;
export function referencedPhotoIds(value, ids = new Set()) {
  if (typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)) ids.add(value);
  else if (Array.isArray(value)) for (const item of value) referencedPhotoIds(item, ids);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) referencedPhotoIds(item, ids);
  return ids;
}
export function unusedPhotos(store, now = Date.now()) {
  // Scan the full saved state, including sealed cases and legacy drafts. Never
  // infer unreferenced media from just one person's filtered API projection.
  const used = referencedPhotoIds(store.state());
  for (const row of store.db.prepare('SELECT image FROM messages WHERE image IS NOT NULL').iterate()) used.add(row.image);
  for (const row of store.db.prepare('SELECT body FROM jobs').iterate()) referencedPhotoIds(JSON.parse(row.body), used);
  if(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shared_files'").get())for(const row of store.db.prepare('SELECT photo FROM shared_files WHERE photo IS NOT NULL').iterate())used.add(row.photo);
  const candidates=[];
  for (const p of store.db.prepare('SELECT id FROM photos').all()) {
    if (used.has(p.id)) { store.db.prepare('DELETE FROM photo_orphans WHERE id=?').run(p.id); continue; }
    store.db.prepare('INSERT OR IGNORE INTO photo_orphans VALUES(?,?)').run(p.id,now);
    const marked=store.db.prepare('SELECT since FROM photo_orphans WHERE id=?').get(p.id);
    if (marked.since < now-7*DAY) candidates.push(p.id);
  }
  return candidates;
}
export function reclaimPhotos(store, backedUpIds, now = Date.now()) {
  // Called only after a successful verified recovery snapshot. Recheck live
  // references because uploads and edits may have happened during that backup.
  const eligible = new Set(unusedPhotos(store, now));
  let removed = 0;
  store.tx(() => {
    for (const id of backedUpIds) if (eligible.has(id)) {
      store.db.prepare('DELETE FROM photo_owners WHERE id=?').run(id);
      store.db.prepare('DELETE FROM photo_orphans WHERE id=?').run(id);
      removed += Number(store.db.prepare('DELETE FROM photos WHERE id=?').run(id).changes);
    }
  });
  return removed;
}

