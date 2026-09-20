import {normalizeNote} from './note-document.mjs';
import {randomUUID} from 'node:crypto';
import {check,text} from './domain.mjs';
export function initFiles(store){store.db.exec(`CREATE TABLE IF NOT EXISTS shared_files(id TEXT PRIMARY KEY,parent TEXT,kind TEXT NOT NULL,name TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',photo TEXT,mime TEXT,bytes BLOB,owner TEXT NOT NULL,updated TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1); CREATE INDEX IF NOT EXISTS shared_files_parent ON shared_files(parent); CREATE TABLE IF NOT EXISTS shared_files_meta(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL); INSERT OR IGNORE INTO shared_files_meta VALUES(1,0);`);if(!store.db.prepare('PRAGMA table_info(shared_files)').all().some(c=>c.name==='document'))store.db.exec('ALTER TABLE shared_files ADD COLUMN document TEXT');}
export const filesRevision=store=>store.db.prepare('SELECT revision FROM shared_files_meta WHERE id=1').get().revision;
export const listFiles=store=>({revision:filesRevision(store),items:store.db.prepare('SELECT id,parent,kind,name,note,document,photo,mime,length(bytes) AS size,owner,updated,revision FROM shared_files ORDER BY kind,name COLLATE NOCASE').all()});
const get=(s,id)=>{const row=s.db.prepare('SELECT id,parent,kind,name,note,document,photo,mime,owner,updated,revision FROM shared_files WHERE id=?').get(id);check(row,'This item no longer exists.',404);return row;};
function parent(s,id){if(id!==null&&id!==undefined){const p=get(s,id);check(p.kind==='folder','Choose a folder.');}return id||null;}
const title=v=>{const n=text(v,120);check(!/[\x00-\x1f]/.test(n),'Use a valid name.');return n;};
function touch(s){s.db.prepare('UPDATE shared_files_meta SET revision=revision+1 WHERE id=1').run();}
export function filesAction(store,who,d){
 check(['Mahmoud','Safy'].includes(who),'Not allowed.',403);
 if(d.action==='create'||d.action==='from-message'||d.action==='upload'){
  check(store.db.prepare('SELECT count(*) AS n FROM shared_files').get().n<3000,'Your folders are full. Remove an unused item first.',413);
  let kind=d.kind,name=d.name,note=d.note??'',document=null,photo=null,mime=null,bytes=null;
  if(d.action==='from-message'){const m=store.db.prepare("SELECT text,image FROM messages WHERE id=? AND status='sent'").get(d.message);check(m,'Shared message not found.',404);kind=m.image?'photo':'note';photo=m.image;note=m.text;name=d.name||m.text.replace(/\s+/g,' ').trim().slice(0,80)||'Shared photo';}
  else if(d.action==='upload'){
   check(typeof d.data==='string','Choose a file.');bytes=Buffer.from(d.data,'base64');check(bytes.length>0&&bytes.length<=10*1024*1024,'Choose a file up to 10 MB.',413);
   const used=store.db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS n FROM shared_files').get().n;check(used+bytes.length<=150*1024*1024,'Shared file storage is full.',413);
   mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':'application/octet-stream';kind=mime.startsWith('image/')?'photo':'file';
  }else check(['folder','note'].includes(kind),'Choose Folder or Note.');
  if(d.document!==undefined){check(kind==='note','Only notes support document content.');({note,document}=normalizeNote(store,d.document));}
  check(typeof note==='string'&&note.length<=20000,'Keep notes within 20,000 characters.');
  const id=randomUUID(),p=parent(store,d.parent);store.db.prepare('INSERT INTO shared_files(id,parent,kind,name,note,document,photo,mime,bytes,owner,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,p,kind,title(name),note,document,photo,mime,bytes,who,new Date().toISOString());touch(store);return {id};
 }
 const item=get(store,d.item);check(d.revision===item.revision,'This item changed. Reopen it before saving; your text has been kept.',409);
 if(d.action==='edit'){check(d.note===undefined&&d.document===undefined||item.kind==='note','Only notes can be edited.');check(d.note===undefined||typeof d.note==='string'&&d.note.length<=20000,'Keep notes within 20,000 characters.');let note=d.note??item.note,document=item.document;if(d.document!==undefined)({note,document}=normalizeNote(store,d.document));else if(d.note!==undefined){check(!item.document,'Refresh the app before editing this illustrated note.',409);document=null;}store.db.prepare('UPDATE shared_files SET name=?,note=?,document=?,revision=revision+1,updated=? WHERE id=?').run(title(d.name??item.name),note,document,new Date().toISOString(),item.id);}
 else if(d.action==='move'){const dest=parent(store,d.parent);let cursor=dest;const visited=new Set();while(cursor){check(cursor!==item.id&&!visited.has(cursor),'A folder cannot be moved into itself.');visited.add(cursor);cursor=get(store,cursor).parent;}store.db.prepare('UPDATE shared_files SET parent=?,revision=revision+1,updated=? WHERE id=?').run(dest,new Date().toISOString(),item.id);}
 else if(d.action==='delete'){const rows=listFiles(store).items,ids=new Set([item.id]);let changed=true;while(changed){changed=false;for(const r of rows)if(ids.has(r.parent)&&!ids.has(r.id)){ids.add(r.id);changed=true;}}for(const id of ids)store.db.prepare('DELETE FROM shared_files WHERE id=?').run(id);}
 else check(false,'Unknown file action.');touch(store);return {ok:true};
}
export function fileContent(store,id){const row=store.db.prepare('SELECT name,mime,bytes FROM shared_files WHERE id=?').get(id);check(row?.bytes,'File not found.',404);return row;}
