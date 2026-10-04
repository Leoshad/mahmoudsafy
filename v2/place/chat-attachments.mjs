import {randomUUID} from 'node:crypto';
import {check} from './domain.mjs';
import {requireStorage} from './storage-health.mjs';
export function initAttachments(store){
 for(const name of ['images','document'])if(!store.db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name===name))store.db.exec(`ALTER TABLE messages ADD COLUMN ${name} TEXT`);
 store.db.exec('CREATE TABLE IF NOT EXISTS chat_documents(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,bytes BLOB NOT NULL,createdAt TEXT NOT NULL)');
}
export function uploadDocument(store,who,p){
 check(typeof p.data==='string','Choose a PDF.');const bytes=Buffer.from(p.data,'base64');
 check(bytes.length>8&&bytes.length<=10*1024*1024,'Choose a PDF up to 10 MB.',413);
 check(/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(bytes.toString('ascii',0,8))&&bytes.subarray(-2048).includes(Buffer.from('%%EOF')),'Choose a valid PDF.');
 check(typeof p.name==='string'&&p.name.length<=200&&/\.pdf$/i.test(p.name)&&!/[\x00-\x1f]/.test(p.name),'Choose a PDF filename.');
 check(store.db.prepare('SELECT coalesce(sum(length(bytes)),0) AS n FROM chat_documents').get().n+bytes.length<=150*1024*1024,'Document storage is full.',413);requireStorage(store,bytes.length);
 const id=randomUUID(),name=p.name.replace(/[\/\\]/g,'_');store.db.prepare('INSERT INTO chat_documents VALUES(?,?,?,?,?)').run(id,who,name,bytes,new Date().toISOString());return {id,name,size:bytes.length};
}
export function documentContent(store,who,id){
 const d=store.db.prepare('SELECT * FROM chat_documents WHERE id=?').get(id);
 check(d&&(d.owner===who||store.db.prepare('SELECT 1 FROM messages WHERE document=?').get(id)),'Document not found.',404);return d;
}
export function validateAttachments(store,who,data){
 const images=data.images??[];check(Array.isArray(images)&&images.length<=10&&images.every(id=>typeof id==='string')&&new Set(images).size===images.length,'Choose up to 10 different photos.');
 check(!images.length||!data.audio&&!data.video&&!data.document,'Send photos separately from other attachments.');
 for(const id of images)check(store.db.prepare('SELECT 1 FROM photos WHERE id=?').get(id),'Photo not found.',404);
 check(!images.length||!data.image||data.image===images[0],'Invalid photo group.');
 if(data.document){check(!data.image&&!images.length&&!data.video&&!data.audio,'Send the PDF separately from other attachments.');const d=documentContent(store,who,data.document);check(d.owner===who,'Choose a PDF you uploaded.',403);}
 return images;
}
