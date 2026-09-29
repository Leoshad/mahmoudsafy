import {initSearchIndex} from './search-index.mjs';
import {repairSharedActivities} from './activity-participants.mjs';
import {modelFor,ratesFor,LIGHT_MODEL} from './ai-models.mjs';
import {drawState} from './draw.mjs';
import {updateCrown} from './crown.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {initial,check,project} from './domain.mjs';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export class Store {
  constructor(path,{enforceLifetimeBudget=true}={}){
    this.enforceLifetimeBudget=enforceLifetimeBudget;
    this.path=path;this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS message_deliveries(message TEXT PRIMARY KEY,recipient TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS message_reads(message TEXT PRIMARY KEY,reader TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,author TEXT NOT NULL,text TEXT NOT NULL,image TEXT,reply TEXT,aiAllowed INTEGER NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,actor TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,actor TEXT NOT NULL,scope TEXT NOT NULL,status TEXT NOT NULL,body TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS echo_usage(job TEXT PRIMARY KEY,model TEXT NOT NULL,purpose TEXT NOT NULL,inputTokens INTEGER NOT NULL,outputTokens INTEGER NOT NULL,searches INTEGER NOT NULL,estimatedMicroUSD INTEGER NOT NULL,budgetMicroUSD INTEGER NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS budget(key TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS echo_reservations(job TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_status_actor ON jobs(status,actor,scope,createdAt);
      CREATE INDEX IF NOT EXISTS messages_author_status ON messages(author,status);
      CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes BLOB NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photo_orphans(id TEXT PRIMARY KEY,since INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS voices(id TEXT PRIMARY KEY,owner TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photo_owners(id TEXT PRIMARY KEY,owner TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS identities(name TEXT PRIMARY KEY,uid TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
    `);
    if(!this.db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name==='audio'))this.db.exec('ALTER TABLE messages ADD COLUMN audio TEXT');
    if(!this.db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name==='video'))this.db.exec('ALTER TABLE messages ADD COLUMN video TEXT');
    this.db.prepare('INSERT OR IGNORE INTO state VALUES(1,?)').run(JSON.stringify(initial()));
    // Unknown request cost stays charged after crashes/cancellation. Never blindly retry a billed request.
    this.db.exec("UPDATE jobs SET status='interrupted' WHERE status='running'; UPDATE messages SET status='interrupted' WHERE status='streaming'");
    this.db.exec("CREATE INDEX IF NOT EXISTS messages_audio ON messages(audio); CREATE INDEX IF NOT EXISTS messages_video ON messages(video);");
    for(const j of this.db.prepare("SELECT id,body FROM jobs WHERE json_type(body,'$.budgetKeys')='array' AND id NOT IN (SELECT job FROM echo_reservations)").all()){const b=JSON.parse(j.body);this.db.prepare('INSERT OR IGNORE INTO echo_reservations VALUES(?,?)').run(j.id,JSON.stringify({model:b.model,purpose:b.purpose,reservedCharge:b.reservedCharge,budgetKeys:b.budgetKeys,searchBudget:b.searchBudget}));}
    initSearchIndex(this.db);
    const recovered=this.state();let changed=recovered.competition?.schema!==1||!recovered.draw;if(repairSharedActivities(recovered))changed=true;drawState(recovered);for(const item of recovered.items)for(const c of item.comments??[])if(c.by==='Echo'&&c.status==='streaming'){c.status='interrupted';c.text=c.text||'Echo was interrupted. You can ask again.';changed=true;}for(const c of recovered.court?.cases??[])if(c.pending){c.pending=null;c.error='Echo was interrupted. Your case is saved. Retry when ready.';c.revision++;recovered.version++;changed=true;}if(recovered.draw?.match?.pending){recovered.draw.match.pending=null;recovered.draw.match.error='Echo was interrupted. Retry when ready.';changed=true;}for(const a of recovered.activities??[])for(const f of a.feedback??[])if(f.status==='running'){f.status='interrupted';changed=true;}if(changed)this.save(recovered);this.rememberTimers(recovered);
  }
  rememberTimers(s){this.nextPinExpiry=Math.min(Infinity,...(s.items??[]).filter(i=>i.pinned&&i.pinExpiresAt).map(i=>Date.parse(i.pinExpiresAt)).filter(Number.isFinite));this.timerView=structuredClone({draw:{match:s.draw?.match?{status:s.draw.match.status,pauses:s.draw.match.pauses,deadline:s.draw.match.deadline}:null},domino:s.domino,ocho:s.ocho});}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');this.rememberTimers(JSON.parse(this.db.prepare('SELECT body FROM state WHERE id=1').get().body));throw e;}}
  state(){const s=JSON.parse(this.db.prepare('SELECT body FROM state WHERE id=1').get().body);let expired=false;for(const i of s.items??[])if(i.pinned&&i.pinExpiresAt&&Date.parse(i.pinExpiresAt)<=Date.now()){i.pinned=false;delete i.pinnedAt;delete i.pinStartedAt;delete i.pinExpiresAt;i.revision++;expired=true;}if(expired){s.version++;this.save(s);}return s;}
  save(s){if(s.activity&&s.activities)s.activity=s.activities.find(a=>a.id===s.activity.id)??s.activity;updateCrown(s);this.db.prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(s));this.rememberTimers(s);}
  identity(name,uid){const old=this.db.prepare('SELECT uid FROM identities WHERE name=?').get(name);check(!old||old.uid===uid,'This invitation is already bound to another account.',403);this.db.prepare('INSERT OR IGNORE INTO identities VALUES(?,?)').run(name,uid);}
  once(actor,id,payload,fn){check(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),'Missing action ID.');const digest=hash(JSON.stringify(payload));return this.tx(()=>{const old=this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);if(old){check(old.actor===actor&&old.digest===digest,'Action ID already used.',409);return JSON.parse(old.result);}const result=fn()??{ok:true};this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(id,actor,digest,JSON.stringify(result));return result;});}
  message(m){this.db.prepare('INSERT INTO messages(id,author,text,image,reply,aiAllowed,status,createdAt,audio,video) VALUES(?,?,?,?,?,?,?,?,?,?)').run(m.id,m.author,m.text,m.image??null,m.reply??null,m.aiAllowed?1:0,m.status??'sent',new Date().toISOString(),m.audio??null,m.video??null);}
  messages(before){return this.db.prepare('SELECT * FROM (SELECT rowid AS sequence,*,(SELECT mime FROM voices WHERE id=messages.audio) AS audioMime,(SELECT at FROM message_reads WHERE message=messages.id) AS readAt,(SELECT at FROM message_deliveries WHERE message=messages.id) AS deliveredAt FROM messages WHERE rowid < ? ORDER BY rowid DESC LIMIT 60) ORDER BY sequence').all(Number(before)||Number.MAX_SAFE_INTEGER);}
  snapshot(who,state=this.state()){return {...project(state,who),messages:this.messages(),unreadMessages:this.db.prepare("SELECT id,rowid AS sequence FROM messages WHERE author=? AND status='sent' AND NOT EXISTS(SELECT 1 FROM message_reads WHERE message=messages.id) ORDER BY rowid").all(who==='Mahmoud'?'Safy':'Mahmoud'),jobs:this.db.prepare("SELECT id,actor,scope,status FROM jobs WHERE status='running' AND (scope='shared' OR actor=?)").all(who)};}
  budgetReport(now=new Date()){
    const month=now.toISOString().slice(0,7),lifetimeCap=Number(process.env.AI_LIFETIME_USD??'3')*1000000;
    const rows=this.db.prepare('SELECT key,used FROM budget WHERE key IN (?,?)').all(month,'lifetime');
    const scopes=[{key:month,cap:4000000},{key:'lifetime',cap:this.enforceLifetimeBudget&&Number.isFinite(lifetimeCap)?lifetimeCap:null}].map(({key,cap})=>{
      const used=rows.find(r=>r.key===key)?.used??0;
      const settled=this.db.prepare("SELECT count(*) AS requests,COALESCE(sum(estimatedMicroUSD),0) AS estimated,COALESCE(sum(budgetMicroUSD),0) AS charged FROM echo_usage WHERE ?='lifetime' OR substr(createdAt,1,7)=?").get(key,key);
      return {key,capMicroUSD:cap,usedMicroUSD:used,remainingMicroUSD:cap===null?null:cap-used,settled,unreconciledMicroUSD:used-settled.charged};
    });
    const unsettled=this.db.prepare("SELECT j.status,count(*) AS requests,COALESCE(sum(json_extract(COALESCE(r.body,j.body),'$.reservedCharge')),0) AS knownReservedMicroUSD FROM jobs j LEFT JOIN echo_reservations r ON r.job=j.id LEFT JOIN echo_usage u ON u.job=j.id WHERE u.job IS NULL GROUP BY j.status").all();
    return {event:'echo_budget_audit',month,scopes,unsettled,byPurpose:this.db.prepare('SELECT purpose,count(*) AS requests,sum(budgetMicroUSD) AS chargedMicroUSD FROM echo_usage GROUP BY purpose').all()};
  }
  reserve(actor,scope,body){
    const keys=[new Date().toISOString().slice(0,7),'lifetime'];const caps=[4_000_000,Number(process.env.AI_LIFETIME_USD??'3')*1_000_000];
    check(!this.enforceLifetimeBudget||(Number.isFinite(caps[1])&&caps[1]>=0&&caps[1]<=100_000_000),'Invalid AI budget configuration.',503);
    // Keep lifetime accounting even when its legacy trial limit is disabled.
    const model=modelFor(body.purpose);
    const charge=model===LIGHT_MODEL?50_000:body.searchBudget?500_000:250_000;for(let j=0;j<keys.length;j++){this.db.prepare('INSERT OR IGNORE INTO budget(key) VALUES(?)').run(keys[j]);const b=this.db.prepare('SELECT used FROM budget WHERE key=?').get(keys[j]);check((j===1&&!this.enforceLifetimeBudget)||b.used+charge<=caps[j],'Echo has reached the budget limit. Your chat still works.',429);}
    check(!this.db.prepare("SELECT 1 FROM jobs WHERE status='running' AND (scope='shared' OR actor=?)").get(actor),'Echo is already working. You can keep chatting.',409);
    for(const key of keys)this.db.prepare('UPDATE budget SET used=used+? WHERE key=?').run(charge,key);
    const id=randomUUID();this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run(id,actor,scope,'running',JSON.stringify({...body,model,reservedCharge:charge,budgetKeys:keys}),new Date().toISOString());this.db.prepare('INSERT INTO echo_reservations VALUES(?,?)').run(id,JSON.stringify({model,purpose:body.purpose,reservedCharge:charge,budgetKeys:keys,searchBudget:body.searchBudget}));return id;
  }
  settle(id,usage){
    if(!usage||!Number.isInteger(usage.input_tokens)||!Number.isInteger(usage.output_tokens)||usage.input_tokens<0||usage.output_tokens<0)return;
    const j=this.job(id);if(!j)return;const b=JSON.parse(this.db.prepare('SELECT body FROM echo_reservations WHERE job=?').get(id)?.body??j.body);if(!b.budgetKeys||this.db.prepare('SELECT 1 FROM echo_usage WHERE job=?').get(id))return;
    const searches=Math.max(0,Number.isInteger(usage.web_search_calls)?usage.web_search_calls:b.searchBudget?2:0);
    const model=b.model??LIGHT_MODEL,rates=ratesFor(model);
    const estimated=Math.ceil(usage.input_tokens*rates.input+usage.output_tokens*rates.output+searches*10000);
    const cost=Math.max(100,Math.ceil(estimated*1.25));
    this.db.prepare('INSERT INTO echo_usage VALUES(?,?,?,?,?,?,?,?,?)').run(id,model,b.purpose??'chat',usage.input_tokens,usage.output_tokens,searches,estimated,cost,new Date().toISOString());
    for(const k of b.budgetKeys)this.db.prepare('UPDATE budget SET used=MAX(0,used+?) WHERE key=?').run(cost-(b.reservedCharge??50000),k);
  }
  job(id){return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);}
  status(id,status){this.db.prepare('UPDATE jobs SET status=? WHERE id=?').run(status,id);}
  close(){this.db.close();}
}



