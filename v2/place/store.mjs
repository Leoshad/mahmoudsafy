import {drawState} from './draw.mjs';
import {updateCrown} from './crown.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {initial,check,project} from './domain.mjs';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export class Store {
  constructor(path){
    this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS message_deliveries(message TEXT PRIMARY KEY,recipient TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS message_reads(message TEXT PRIMARY KEY,reader TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,author TEXT NOT NULL,text TEXT NOT NULL,image TEXT,reply TEXT,aiAllowed INTEGER NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,actor TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,actor TEXT NOT NULL,scope TEXT NOT NULL,status TEXT NOT NULL,body TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS budget(key TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes BLOB NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photo_orphans(id TEXT PRIMARY KEY,since INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS voices(id TEXT PRIMARY KEY,owner TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photo_owners(id TEXT PRIMARY KEY,owner TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS identities(name TEXT PRIMARY KEY,uid TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
    `);
    if(!this.db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name==='audio'))this.db.exec('ALTER TABLE messages ADD COLUMN audio TEXT');
    this.db.prepare('INSERT OR IGNORE INTO state VALUES(1,?)').run(JSON.stringify(initial()));
    // Unknown request cost stays charged after crashes/cancellation. Never blindly retry a billed request.
    this.db.exec("UPDATE jobs SET status='interrupted' WHERE status='running'; UPDATE messages SET status='interrupted' WHERE status='streaming'");
    const recovered=this.state();let changed=recovered.competition?.schema!==1||!recovered.draw;drawState(recovered);for(const item of recovered.items)for(const c of item.comments??[])if(c.by==='Echo'&&c.status==='streaming'){c.status='interrupted';c.text=c.text||'Echo was interrupted. You can ask again.';changed=true;}for(const c of recovered.court?.cases??[])if(c.pending){c.pending=null;c.error='Echo was interrupted. Your case is saved. Retry when ready.';c.revision++;recovered.version++;changed=true;}if(recovered.draw?.match?.pending){recovered.draw.match.pending=null;recovered.draw.match.error='Echo was interrupted. Retry when ready.';changed=true;}for(const a of recovered.activities??[])for(const f of a.feedback??[])if(f.status==='running'){f.status='interrupted';changed=true;}if(changed)this.save(recovered);
  }
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  state(){return JSON.parse(this.db.prepare('SELECT body FROM state WHERE id=1').get().body);}
  save(s){if(s.activity&&s.activities)s.activity=s.activities.find(a=>a.id===s.activity.id)??s.activity;updateCrown(s);this.db.prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(s));}
  identity(name,uid){const old=this.db.prepare('SELECT uid FROM identities WHERE name=?').get(name);check(!old||old.uid===uid,'This invitation is already bound to another account.',403);this.db.prepare('INSERT OR IGNORE INTO identities VALUES(?,?)').run(name,uid);}
  once(actor,id,payload,fn){check(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),'Missing action ID.');const digest=hash(JSON.stringify(payload));return this.tx(()=>{const old=this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);if(old){check(old.actor===actor&&old.digest===digest,'Action ID already used.',409);return JSON.parse(old.result);}const result=fn()??{ok:true};this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(id,actor,digest,JSON.stringify(result));return result;});}
  message(m){this.db.prepare('INSERT INTO messages(id,author,text,image,reply,aiAllowed,status,createdAt,audio) VALUES(?,?,?,?,?,?,?,?,?)').run(m.id,m.author,m.text,m.image??null,m.reply??null,m.aiAllowed?1:0,m.status??'sent',new Date().toISOString(),m.audio??null);}
  messages(before){return this.db.prepare('SELECT * FROM (SELECT rowid AS sequence,*,(SELECT at FROM message_reads WHERE message=messages.id) AS readAt,(SELECT at FROM message_deliveries WHERE message=messages.id) AS deliveredAt FROM messages WHERE rowid < ? ORDER BY rowid DESC LIMIT 60) ORDER BY sequence').all(Number(before)||Number.MAX_SAFE_INTEGER);}
  snapshot(who,state=this.state()){return {...project(state,who),messages:this.messages(),unreadMessages:this.db.prepare("SELECT id,rowid AS sequence FROM messages WHERE author=? AND status='sent' AND NOT EXISTS(SELECT 1 FROM message_reads WHERE message=messages.id) ORDER BY rowid").all(who==='Mahmoud'?'Safy':'Mahmoud'),jobs:this.db.prepare("SELECT id,actor,scope,status FROM jobs WHERE status='running' AND (scope='shared' OR actor=?)").all(who)};}
  reserve(actor,scope,body){
    const keys=[new Date().toISOString().slice(0,7),'lifetime'];const caps=[4_000_000,Number(process.env.AI_LIFETIME_USD??'3')*1_000_000];
    check(Number.isFinite(caps[1])&&caps[1]>=0&&caps[1]<=100_000_000,'Invalid AI budget configuration.',503);
    // $0.05 per request conservatively covers bounded Luna input/output, including a downscaled image.
    const charge=body.searchBudget?100_000:50_000;for(let j=0;j<keys.length;j++){this.db.prepare('INSERT OR IGNORE INTO budget(key) VALUES(?)').run(keys[j]);const b=this.db.prepare('SELECT used FROM budget WHERE key=?').get(keys[j]);check(b.used+charge<=caps[j],'Echo has reached the budget limit. Your chat still works.',429);}
    check(!this.db.prepare("SELECT 1 FROM jobs WHERE status='running' AND (scope='shared' OR actor=?)").get(actor),'Echo is already working. You can keep chatting.',409);
    for(const key of keys)this.db.prepare('UPDATE budget SET used=used+? WHERE key=?').run(charge,key);
    const id=randomUUID();this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run(id,actor,scope,'running',JSON.stringify({...body,reservedCharge:charge,budgetKeys:keys}),new Date().toISOString());return id;
  }
  settle(id,usage){
    if(!usage||!Number.isInteger(usage.input_tokens)||!Number.isInteger(usage.output_tokens)||usage.input_tokens<0||usage.output_tokens<0)return;
    const b=JSON.parse(this.job(id).body);if(!b.budgetKeys)return;
    const searches=Math.max(0,Number.isInteger(usage.web_search_calls)?usage.web_search_calls:b.searchBudget?2:0);
    const cost=Math.max(100,Math.ceil((usage.input_tokens*.2+usage.output_tokens*1.2+searches*10000)*1.25));
    for(const k of b.budgetKeys)this.db.prepare('UPDATE budget SET used=MAX(0,used+?) WHERE key=?').run(cost-(b.reservedCharge??50000),k);
  }
  job(id){return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);}
  status(id,status){this.db.prepare('UPDATE jobs SET status=? WHERE id=?').run(status,id);}
  close(){this.db.close();}
}



