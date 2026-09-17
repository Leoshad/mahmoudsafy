import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Writable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {echoContext} from '../context.mjs';
import {Store} from '../store.mjs';
import {unusedPhotos,reclaimPhotos} from '../photo-storage.mjs';
import {createRecoveryBackup,restoreRecoveryBackup} from '../backup.mjs';
import {exportArchive} from '../export.mjs';
import {drawChange,strokeEvent} from '../draw.mjs';

test('long Echo context keeps newest complete messages and valid JSON within the cap',()=>{
 const messages=Array.from({length:50},(_,i)=>({author:'Mahmoud',text:`message-${i}:`+'x'.repeat(1000)}));
 const context=echoContext(messages,{items:[],activity:null});const parsed=JSON.parse(context);
 assert.ok(context.length<=24000);assert.equal(parsed.messages.at(-1).text,messages.at(-1).text);assert.notEqual(parsed.messages[0].text,messages[0].text);
 const short=JSON.parse(echoContext(messages.slice(-1),{items:[{aiAllowed:false,title:'PRIVATE'},{aiAllowed:true,title:'Remember this'}],activity:{status:'active',answers:[{text:'answer'}]}}));
 assert.ok(!JSON.stringify(short).includes('PRIVATE'));assert.equal(short.space[0].title,'Remember this');assert.equal(short.activity.answers[0].text,'answer');
});
function photo(s,id=randomUUID()) {s.db.prepare('INSERT INTO photos VALUES(?,?,?,?)').run(id,'image/png',Buffer.from('photo-'+id),'2026-01-01');return id;}
test('photo reclamation waits a week and protects all references, including sealed records and pending AI',()=>{
 const s=new Store(':memory:');try{
 const orphan=photo(s),chat=photo(s),sealed=photo(s),pending=photo(s),draft=photo(s),relinked=photo(s);
 s.message({id:randomUUID(),author:'Safy',text:'hello',image:chat});const state=s.state();state.court={cases:[{records:[{image:sealed}]}]};state.drafts={Safy:[{image:draft}]};s.save(state);
 s.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run(randomUUID(),'Safy','shared','running',JSON.stringify({image:pending}),'2026-01-01');
 const now=Date.now();assert.deepEqual(unusedPhotos(s,now),[]);const ids=unusedPhotos(s,now+8*86400000);assert.deepEqual(new Set(ids),new Set([orphan,relinked]));
 // A reference created while backup was running must win over the cleanup list.
 s.message({id:randomUUID(),author:'Mahmoud',text:'kept',image:relinked});
 assert.equal(reclaimPhotos(s,ids,now+8*86400000),1);assert.equal(s.db.prepare('SELECT count(*) AS n FROM photos').get().n,5);
 }finally{s.close();}
});
test('encrypted SQLite recovery round-trips photos, hidden state, budget and WAL data; refuses wrong key and overwrite',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'place-recovery-')),s=new Store(join(dir,'live.sqlite')),secret='test-only-secret-with-at-least-32-characters';
 try{
 const image=photo(s);s.message({id:randomUUID(),author:'Mahmoud',text:'Recover me',image});const state=s.state();state.drafts={Safy:[{secret:'sealed'}]};s.save(state);s.db.prepare('INSERT INTO budget VALUES(?,?)').run('lifetime',1200000);
 const archive=await createRecoveryBackup(s,join(dir,'copies'),secret);assert.ok(!readFileSync(archive).includes(Buffer.from('Recover me')));
 const restored=join(dir,'restored.sqlite');await restoreRecoveryBackup(archive,restored,secret);const db=new DatabaseSync(restored);
 try{assert.equal(db.prepare('SELECT text FROM messages').get().text,'Recover me');assert.equal(db.prepare('SELECT used FROM budget').get().used,1200000);assert.equal(JSON.parse(db.prepare('SELECT body FROM state').get().body).drafts.Safy[0].secret,'sealed');assert.equal(Buffer.from(db.prepare('SELECT bytes FROM photos').get().bytes).toString(),'photo-'+image);}finally{db.close();}
 await assert.rejects(()=>restoreRecoveryBackup(archive,restored,secret));await assert.rejects(()=>restoreRecoveryBackup(archive,join(dir,'wrong.sqlite'),'a-different-secret-with-at-least-32-characters'));
 assert.ok(!readdirSync(dir).includes('wrong.sqlite'));assert.ok(!readdirSync(join(dir,'copies')).some(n=>n.endsWith('.tmp')));
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('user export embeds authorized photos but excludes unreferenced private media',async()=>{
 const s=new Store(':memory:');try{const visible=photo(s),privateImage=photo(s);s.message({id:randomUUID(),author:'Mahmoud',text:'photo',image:visible});let text='';
 const res=new Writable({write(chunk,_,done){text+=chunk.toString();done();}});res.setHeader=()=>{};res.writeHead=()=>{};
 await exportArchive(s,s.snapshot('Mahmoud'),res);const result=JSON.parse(text);
 assert.equal(Buffer.from(result.photos[visible].data,'base64').toString(),'photo-'+visible);assert.equal(result.photos[privateImage],undefined);assert.equal(result.format,'our-place-export-v2');
 }finally{s.close();}
});
test('drawing updates include only the accepted segment and never secret words or unrelated state',()=>{
 const s=new Store(':memory:');try{const state=s.state(),p={mode:'shared',boardId:state.draw.shared.id,strokeId:randomUUID(),offset:0,color:'#ff0000',width:5,tool:'pen',points:[[0.1,0.2],[0.2,0.3]]};state.items=[{title:'private other state'}];drawChange(state,'Mahmoud','draw.stroke',p);const e=strokeEvent(state,p);assert.equal(e.revision,1);assert.equal(e.stroke.points.length,2);assert.ok(!JSON.stringify(e).includes('private other state'));p.offset=2;p.points=[[0.3,0.4]];drawChange(state,'Mahmoud','draw.stroke',p);assert.equal(strokeEvent(state,p).stroke.points.length,1);}finally{s.close();}
});

test('a heavily escaped latest message still supplies bounded valid context',()=>{
 const parsed=echoContext([{author:'Mahmoud',text:'\u0000'.repeat(4000)+'latest'}],{items:[]});assert.ok(parsed.length<=24000);assert.ok(JSON.parse(parsed).messages[0].text.endsWith('latest'));
});
