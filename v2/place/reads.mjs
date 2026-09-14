import {check,names} from './domain.mjs';
export function recordReads(store,who,ids){
 check(names.includes(who),'Not invited.',403);check(Array.isArray(ids)&&ids.length<=100&&ids.every(id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id)),'Invalid read receipt.');
 const at=new Date().toISOString(),read=[];
 store.tx(()=>{for(const id of new Set(ids)){const m=store.db.prepare('SELECT author,status FROM messages WHERE id=?').get(id);if(!m||!names.includes(m.author)||m.author===who||m.status!=='sent')continue;
 if(store.db.prepare('INSERT OR IGNORE INTO message_reads(message,reader,at) VALUES(?,?,?)').run(id,who,at).changes)read.push(id);
 }});return {reader:who,ids:read,at};
}
