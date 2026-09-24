import webpush from 'web-push';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {check,names} from './domain.mjs';
import {attentionEvents} from './push-events.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
export function validateSubscription(raw){
 check(raw&&typeof raw.endpoint==='string'&&raw.endpoint.length<4096,'Invalid notification subscription.');let u;try{u=new URL(raw.endpoint);}catch{check(false,'Invalid notification endpoint.');}
 const h=u.hostname,allowed=h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com');
 check(allowed&&u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443'),'Unsupported notification provider.');
 const keys=raw.keys;check(keys&&typeof keys.p256dh==='string'&&/^[\w-]+$/.test(keys.p256dh)&&Buffer.from(keys.p256dh,'base64url').length===65&&Buffer.from(keys.p256dh,'base64url')[0]===4&&typeof keys.auth==='string'&&/^[\w-]+$/.test(keys.auth)&&Buffer.from(keys.auth,'base64url').length===16,'Invalid notification keys.');
 return {endpoint:u.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
export class PushNotifications{
 constructor(store,{secret,origin,send=webpush.sendNotification.bind(webpush),now=Date.now}={}){
  this.store=store;this.db=store.db;this.send=send;this.now=now;this.origin=origin;this.key=createHash('sha256').update(secret).digest();this.busy=false;this.previous=store.state();
  this.db.exec(`CREATE TABLE IF NOT EXISTS push_meta(id INTEGER PRIMARY KEY,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,session TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS push_presence(client TEXT PRIMARY KEY,owner TEXT NOT NULL,session TEXT NOT NULL,visible INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS notification_inbox(id TEXT PRIMARY KEY,owner TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,readAt INTEGER);
 CREATE TABLE IF NOT EXISTS push_seen(id TEXT PRIMARY KEY,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS push_queue(id TEXT PRIMARY KEY,owner TEXT NOT NULL,topic TEXT NOT NULL,body TEXT NOT NULL,due INTEGER NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);`);
  if(!this.db.prepare('PRAGMA table_info(push_presence)').all().some(c=>c.name==='sequence'))this.db.exec('ALTER TABLE push_presence ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0');
  const saved=this.db.prepare('SELECT body FROM push_meta WHERE id=1').get();this.vapid=saved?this.open(saved.body):webpush.generateVAPIDKeys();if(!saved)this.db.prepare('INSERT INTO push_meta VALUES(1,?)').run(this.seal(this.vapid));
  // Starting the notification service never replays historical chat.
  for(const m of store.messages())if(m.status==='sent')this.mark('message:'+m.id);
 }
 seal(v){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv);return Buffer.concat([iv,c.update(JSON.stringify(v)),c.final(),c.getAuthTag()]).toString('base64');}
 open(v){const b=Buffer.from(v,'base64'),d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}
 mark(key){return this.db.prepare('INSERT OR IGNORE INTO push_seen VALUES(?,?)').run(key,this.now()).changes>0;}
 visible(who){return !!this.db.prepare('SELECT 1 FROM push_presence p JOIN sessions s ON p.session=s.id WHERE p.owner=? AND p.visible=1 AND p.updated>? AND s.expires>?').get(who,this.now()-5000,this.now());}
 presence(who,sid,data){
  check(typeof data.client==='string'&&/^[\w-]{16,80}$/.test(data.client)&&typeof data.visible==='boolean','Invalid visibility update.');
  const sequence=data.sequence??0;check(Number.isSafeInteger(sequence)&&sequence>=0,'Invalid visibility sequence.');
  const changed=this.db.prepare('INSERT INTO push_presence(client,owner,session,visible,updated,sequence) VALUES(?,?,?,?,?,?) ON CONFLICT(client) DO UPDATE SET owner=excluded.owner,session=excluded.session,visible=excluded.visible,updated=excluded.updated,sequence=excluded.sequence WHERE excluded.sequence>push_presence.sequence OR excluded.sequence=0 AND push_presence.sequence=0').run(data.client,who,sid,data.visible?1:0,this.now(),sequence).changes;
  if(changed&&data.visible)this.db.prepare("DELETE FROM push_queue WHERE owner=? AND COALESCE(json_extract(body,'$.deviceOnly'),0)=0").run(who);
 }
 registered(who,sid,endpoint){return typeof endpoint==='string'&&!!this.db.prepare('SELECT 1 FROM push_subscriptions WHERE id=? AND owner=? AND session=?').get(digest(endpoint),who,sid);}

 subscribe(who,sid,raw){const sub=validateSubscription(raw),id=digest(sub.endpoint);check(this.db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE owner=?').get(who).n<10||this.db.prepare('SELECT 1 FROM push_subscriptions WHERE id=? AND owner=?').get(id,who),'Too many devices. Disable notifications on an old device first.');this.db.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,session=excluded.session,body=excluded.body').run(id,who,sid,this.seal(sub),this.now());return {id};}
 unsubscribe(who,endpoint){check(typeof endpoint==='string','Invalid subscription.');this.db.prepare('DELETE FROM push_subscriptions WHERE id=? AND owner=?').run(digest(endpoint),who);}
 logout(sid){this.db.prepare('DELETE FROM push_subscriptions WHERE session=?').run(sid);this.db.prepare('DELETE FROM push_presence WHERE session=?').run(sid);}
 test(who,sid,endpoint){
 check(this.registered(who,sid,endpoint),'Enable notifications on this device first.');
 const key='test:'+randomBytes(12).toString('hex');
 this.enqueue({key,to:who,kind:'test',subscriptionId:digest(endpoint),body:'Your test notification arrived.',target:{tab:'space'}});
 }
 inbox(who){return this.db.prepare('SELECT id,body,created,readAt FROM notification_inbox WHERE owner=? ORDER BY created DESC LIMIT 100').all(who).map(r=>({...JSON.parse(r.body),id:r.id,created:r.created,readAt:r.readAt}));}
 readInbox(who,id){check(typeof id==='string'&&id.length<=300,'Choose a notification.');this.db.prepare('UPDATE notification_inbox SET readAt=? WHERE owner=? AND id=?').run(this.now(),who,id);}
 enqueue(e){if(!this.mark(e.key))return;
 if(['wall','daily','invitation'].includes(e.kind)||/invited you|mentioned you/.test(e.body)){this.db.prepare('INSERT OR IGNORE INTO notification_inbox VALUES(?,?,?,?,NULL)').run(e.key,e.to,JSON.stringify({body:e.body,target:e.target}),this.now());this.db.prepare('DELETE FROM notification_inbox WHERE owner=? AND id NOT IN (SELECT id FROM notification_inbox WHERE owner=? ORDER BY created DESC LIMIT 100)').run(e.to,e.to);}
const topic=digest(e.to+':'+(e.kind==='message'?'messages':(e.kind==='test'?e.key:JSON.stringify(e.target)))).slice(0,24),id=e.to+':'+topic;
 const body={title:'Our Place',owner:e.to,body:e.body,target:e.target,kind:e.kind,deviceOnly:['daily','test','invitation'].includes(e.kind),subscriptionId:e.subscriptionId,quiet:!!e.quiet,tag:topic,createdAt:this.now(),expires:this.now()+(['daily','invitation'].includes(e.kind)?12*3600000:120000)};
 this.db.prepare(`INSERT INTO push_queue(id,owner,topic,body,due,expires) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=CASE WHEN json_extract(excluded.body,'$.quiet')=1 AND json_extract(push_queue.body,'$.quiet')=0 THEN push_queue.body ELSE excluded.body END,expires=excluded.expires`).run(id,e.to,topic,JSON.stringify(body),this.now()+(e.kind==='test'?5000:300),body.expires);
 }
 scan(actor){const current=this.store.state();for(const e of attentionEvents(this.previous,current,actor))this.enqueue(e);this.previous=current;
  for(const m of this.store.messages())if(m.status==='sent'&&this.mark('message:'+m.id)){
   if(m.author==='Together')continue;
   const recipients=m.author==='Echo'?names:names.filter(n=>n!==m.author);
   for(const to of recipients)this.enqueue({key:'message:'+m.id+':'+to,to,body:m.author==='Echo'?'Echo has replied in your chat.':new RegExp('(^|\\s)@'+to+'\\b','i').test(m.text||'')?m.author+' mentioned you in chat.':m.author+' sent you '+(m.video?'a video.':m.image?'a photo.':'a message.'),kind:m.author==='Echo'?'echo':'message',target:{tab:'chat',message:m.id}});
  }
 }
 async drain(){if(this.busy||this.stopped)return;this.busy=true;try{
  this.db.prepare('DELETE FROM push_queue WHERE expires<?').run(this.now());
  const jobs=this.db.prepare('SELECT * FROM push_queue WHERE due<=? ORDER BY due LIMIT 10').all(this.now());
  for(const job of jobs){if(this.stopped)return;const payload=JSON.parse(job.body);if(!payload.deviceOnly&&this.visible(job.owner)){this.db.prepare('UPDATE push_queue SET due=? WHERE id=? AND body=?').run(this.now()+300,job.id,job.body);continue;}
   const subs=this.db.prepare('SELECT p.* FROM push_subscriptions p JOIN sessions s ON p.session=s.id WHERE p.owner=? AND s.expires>?').all(job.owner,this.now()).filter(s=>!payload.subscriptionId||s.id===payload.subscriptionId);let retry=false,foreground=false;if(!subs.length)console.info('Push skipped: reason=no_active_subscription kind='+(payload.kind||'unknown')+' tag='+job.topic);
   for(const sub of subs){if(this.stopped)return;if(!payload.deviceOnly&&this.visible(job.owner)){foreground=true;break;}try{const delivery='delivery:'+digest(sub.id+job.body);if(this.db.prepare('SELECT 1 FROM push_seen WHERE id=?').get(delivery))continue;const started=this.now();await this.send(this.open(sub.body),job.body,{vapidDetails:{subject:this.origin,publicKey:this.vapid.publicKey,privateKey:this.vapid.privateKey},TTL:Math.max(1,Math.ceil((job.expires-this.now())/1000)),urgency:JSON.parse(job.body).quiet?'normal':'high',topic:job.topic,timeout:8000});if(this.stopped)return;this.mark(delivery);console.info('Push accepted: kind='+(payload.kind||'unknown')+' tag='+job.topic+' queue_ms='+Math.max(0,started-(JSON.parse(job.body).createdAt??started))+' provider_ms='+(this.now()-started));}
    catch(e){if(this.stopped)return;console.error('Push provider delivery failed; status='+String(Number(e.statusCode)||0));if([404,410].includes(e.statusCode))this.db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(sub.id);else retry=true;}
   }
   if(foreground){this.db.prepare('UPDATE push_queue SET due=? WHERE id=? AND body=?').run(this.now()+300,job.id,job.body);continue;}
   if(retry&&job.attempts<2)this.db.prepare('UPDATE push_queue SET attempts=attempts+1,due=? WHERE id=? AND body=?').run(this.now()+3000,job.id,job.body);else this.db.prepare('DELETE FROM push_queue WHERE id=? AND body=?').run(job.id,job.body);
  }
  this.db.prepare('DELETE FROM push_presence WHERE updated<?').run(this.now()-86400000);
  this.db.prepare("DELETE FROM push_seen WHERE created<? AND id NOT LIKE 'message:%'").run(this.now()-7*86400000);
 }finally{this.busy=false;}}
}

