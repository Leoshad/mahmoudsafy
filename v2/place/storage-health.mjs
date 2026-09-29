import {statfsSync} from 'node:fs';
import {dirname} from 'node:path';
import {check} from './domain.mjs';
const MiB=1024*1024;
export function storageHealth(store){
 const page=store.db.prepare('PRAGMA page_size').get().page_size;
 const bytes=store.db.prepare('PRAGMA page_count').get().page_count*page;
 if(!store.path||store.path===':memory:')return {databaseBytes:bytes,freeBytes:null,backupRoom:true};
 const disk=statfsSync(dirname(store.path)),freeBytes=disk.bavail*disk.bsize;
 return {databaseBytes:bytes,freeBytes,backupRoom:freeBytes>=bytes*2.2+64*MiB};
}
export function requireStorage(store,incoming=0,inspect=storageHealth){
 const h=inspect(store);
 check(h.freeBytes===null||h.freeBytes>=h.databaseBytes*2.2+Math.max(0,incoming)*4.2+64*MiB,'Storage is low. Free unused attachments before uploading. Your saved memories are kept.',413);
}
