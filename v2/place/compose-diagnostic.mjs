// One bounded, private production check for the reported mystery draft failure.
import {composePost} from './space-compose.mjs';
export async function diagnoseCompose(store){
 const key='mystery-compose-2026-09-27-v1';store.db.exec('CREATE TABLE IF NOT EXISTS compose_diagnostics(id TEXT PRIMARY KEY,status TEXT NOT NULL)');
 if(store.db.prepare('SELECT 1 FROM compose_diagnostics WHERE id=?').get(key))return;
 let job;try{job=store.tx(()=>{const id=store.reserve('Mahmoud','private',{purpose:'space',diagnostic:key});store.db.prepare('INSERT INTO compose_diagnostics VALUES(?,?)').run(key,'running');return id;});}catch(e){console.info(JSON.stringify({event:'echo_compose_diagnostic',status:'blocked',reason:e.message}));return;}
 const started=Date.now();try{const r=await composePost({prompt:'Choose an original idea for the selected post type.',options:{kind:'case',length:'short',difficulty:'medium'},signal:AbortSignal.timeout(90000)});store.tx(()=>{store.settle(job,r.usage);store.status(job,'done');store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(job);store.db.prepare('UPDATE compose_diagnostics SET status=? WHERE id=?').run('passed',key);});console.info(JSON.stringify({event:'echo_compose_diagnostic',status:'passed',elapsedMs:Date.now()-started,hasActivity:!!r.proposals[0]?.activity}));}
 catch(e){store.tx(()=>{if(e.usage)store.settle(job,e.usage);store.status(job,'failed');store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(job);store.db.prepare('UPDATE compose_diagnostics SET status=? WHERE id=?').run('failed',key);});console.warn(JSON.stringify({event:'echo_compose_diagnostic',status:'failed',stage:e.stage,code:e.code,param:e.param,reason:e.message,elapsedMs:Date.now()-started}));}
}
