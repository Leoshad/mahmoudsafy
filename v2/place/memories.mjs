import {crownSnapshot} from './crown.mjs';
import {randomUUID} from 'node:crypto';
import {check,project} from './domain.mjs';
import {personalSnapshot} from './personal.mjs';
import {noteBlocks} from './public/note-format.mjs';
export function initMemories(store){store.db.exec(`CREATE TABLE IF NOT EXISTS shared_listening(id TEXT PRIMARY KEY,session TEXT NOT NULL,playKey TEXT NOT NULL UNIQUE,videoId TEXT NOT NULL,title TEXT NOT NULL,channel TEXT NOT NULL,mode TEXT NOT NULL,startedAt TEXT NOT NULL);CREATE TABLE IF NOT EXISTS memory_media_invites(id TEXT PRIMARY KEY,session TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT NOT NULL,videoId TEXT NOT NULL,title TEXT NOT NULL,channel TEXT NOT NULL,mode TEXT NOT NULL,startedAt TEXT NOT NULL);`);}
// Records shared playback state, not an invitation or a claim that both speakers were audible.
export function recordListening(store,s,now=Date.now()){
 const m=s.media;if(m?.invitation)store.db.prepare('INSERT OR IGNORE INTO memory_media_invites VALUES(?,?,?,?,?,?,?,?,?)').run(m.invitation.id,m.id,m.owner,m.invitation.to,m.track.videoId,m.track.title,m.track.channel||'',m.mode,new Date(now).toISOString());
 if(!m?.playing||!['Mahmoud','Safy'].every(n=>m.participants.includes(n)))return;
 m.memoryPlayKey??=randomUUID();
 store.db.prepare('INSERT OR IGNORE INTO shared_listening VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),m.id,m.memoryPlayKey,m.track.videoId,m.track.title,m.track.channel||'',m.mode,new Date(now).toISOString());
}
export function memoryOptions(params){
 const scope=params.get('scope')||'chat',from=params.get('from')||'',to=params.get('to')||'',zone=params.get('zone')||'Asia/Riyadh';
 check(['chat','all'].includes(scope),'Choose Our Chat or all of Our Place.');
 const valid=v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 check(valid(from)&&valid(to)&&(!from||!to||from<=to),'Choose a valid date range.');
 try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{check(false,'Choose a valid time zone.');}
 return {scope,from,to,zone};
}
export function memoryData(store,who,opt){
 const s=store.state(),view=project(s,who),dated=opt.from||opt.to;
 const day=at=>{if(!at||isNaN(Date.parse(at)))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:opt.zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));};
 const inside=at=>{const d=day(at);return !dated||!!d&&(!opt.from||d>=opt.from)&&(!opt.to||d<=opt.to);};
 const count=store.db.prepare('SELECT COUNT(*) n FROM messages').get().n;check(count<=100000,'Your archive is very large. Contact support to export it in volumes.',413);
 const all=store.db.prepare('SELECT id,author,text,image,audio,reply,status,createdAt FROM messages ORDER BY rowid').all();
 const messages=all.filter(m=>inside(m.createdAt)),byId=new Map(all.map(m=>[m.id,m]));
 check(messages.length<=10000,'Choose a shorter period (up to 10,000 messages per PDF).',413);
 for(const m of messages){m.reactions=view.messageReactions[m.id]||{};if(m.reply){const r=byId.get(m.reply);m.source=r?{id:r.id,author:r.author,text:r.text,image:!!r.image,audio:!!r.audio,inRange:inside(r.createdAt)}:null;}}
 const listening=store.db.prepare('SELECT * FROM shared_listening ORDER BY startedAt').all().filter(m=>inside(m.startedAt));
 const data={...opt,generatedAt:new Date().toISOString(),who,crown:crownSnapshot(s,who),invitations:store.db.prepare('SELECT * FROM memory_media_invites ORDER BY startedAt').all().filter(m=>inside(m.startedAt)),profiles:Object.fromEntries(Object.entries(personalSnapshot(s,who).profiles).map(([name,p])=>[name,{photo:p.photo}])),messages,listening,items:[],files:[],activities:[],games:[],dates:[],cases:[],drawing:null};
 data.crown.events=(data.crown.events||[]).filter(e=>inside(e.at));
 if(opt.scope==='all'){
  if(!dated&&s.draw?.shared?.strokes?.length)data.drawing=s.draw.shared;
  data.items=view.items.filter(i=>inside(i.createdAt)||(i.comments||[]).some(c=>inside(c.createdAt))).map(i=>({...i,comments:(i.comments||[]).filter(c=>inside(c.createdAt))}));
  data.activities=view.activities.filter(a=>inside(a.createdAt));
  data.games=[...Object.values(s.competition?.results||{}),...(s.draw?.history||[]).map(r=>({...r,game:'Draw & Guess'}))].filter(r=>inside(r.at));
  data.dates=personalSnapshot(s,who).dates.filter(d=>!dated||(!opt.from||d.date>=opt.from)&&(!opt.to||d.date<=opt.to));
  data.cases=(s.court?.cases||[]).filter(c=>inside(c.createdAt)||inside(c.updatedAt));
  if(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shared_files'").get()){
   const rows=store.db.prepare('SELECT id,parent,kind,name,note,document,photo,mime,owner,updated FROM shared_files ORDER BY kind,name').all(),map=new Map(rows.map(r=>[r.id,r]));
   data.files=rows.filter(r=>inside(r.updated)).map(r=>{const path=[r.name],seen=new Set([r.id]);let p=map.get(r.parent);while(p&&!seen.has(p.id)){seen.add(p.id);path.unshift(p.name);p=map.get(p.parent);}return {...r,path:path.join(' / '),blocks:r.kind==='note'?noteBlocks(r):[]};});
  }
 }
 return data;
}
