import {randomUUID,createHash} from 'node:crypto';
import {check} from './domain.mjs';
const names=['Mahmoud','Safy'];
export const SHARED_MOMENT_FILL_MS=4000;
export const SHARED_MOMENT_RELEASE_MS=1000;
export const SHARED_MOMENT_FADE_MS=1400;
export class SharedTouch {
 constructor({onComplete=()=>{},requireReady=true}={}){this.requireReady=requireReady;this.readiness=new Map();this.onComplete=onComplete;this.session=null;this.closed=new Map();this.orders=new Map();}
 tick(now=Date.now()){
  for(const [k,v]of this.readiness)if(v.until<=now)this.readiness.delete(k);
  const s=this.session;if(!s)return;
  if(this.requireReady&&!s.participants.every(k=>this.readiness.get(k)?.until>now)){this.close(now);return;}
  if(!s.done&&now-s.activity>90000){this.close(now);return;}
  const dt=Math.max(0,Math.min(250,now-s.updated));s.updated=now;
  const both=names.every(n=>s.hands[n]?.until>now);
  if(!s.done){s.progress=both?Math.min(1,s.progress+dt/SHARED_MOMENT_FILL_MS):Math.max(0,s.progress-dt/1100);if(s.progress===1){this.onComplete(s,now);s.done=true;}}
  this.settle(now);
 }
 settle(now){const s=this.session;if(!s)return;const any=names.some(n=>s.hands[n]?.until>now);if(any){s.releaseAt=null;return;}if(!s.done&&(s.kind!=='hug'||!s.engaged))return;s.releaseAt??=now;if(now-s.releaseAt>=(s.done?SHARED_MOMENT_RELEASE_MS:0)+SHARED_MOMENT_FADE_MS)this.close(now);}
 close(now=Date.now()){if(this.session)this.closed.set(this.session.id,now);this.session=null;}
 action(who,sid,p,now=Date.now()){
  check(names.includes(who),'Please sign in.',401);
  check(typeof p.client==='string'&&/^[\w-]{8,80}$/.test(p.client)&&Number.isSafeInteger(p.seq)&&p.seq>0,'Invalid touch request.');
  check(typeof p.id==='string'&&/^[\w-]{8,80}$/.test(p.id),'Invalid moment.');
  check(['ready','start','hold','release','close'].includes(p.action),'Invalid touch action.');
  for(const [id,t]of this.closed)if(now-t>600000)this.closed.delete(id);
  for(const [id,v]of this.orders)if(now-v.at>600000)this.orders.delete(id);
  const key=sid+':'+p.client,orderKey=key+(p.action==='ready'?':ready':':touch'),old=this.orders.get(orderKey);
  if(old&&p.seq<=old.seq)return this.view(now);
  this.orders.set(orderKey,{seq:p.seq,at:now});
  if(p.action==='ready'){if(p.active===true)this.readiness.set(key,{who,sid,hugReady:p.hugReady===true,until:now+3500});else this.readiness.delete(key);this.tick(now);return this.view(now);}
  this.tick(now);
  if(p.action==='close'){if(this.session?.id===p.id){check(!this.requireReady||this.session.participants.includes(key),'This moment is active on another device.',409);this.close(now);}else this.closed.set(p.id,now);return this.view(now);}
  if(p.action==='start'){
   if(this.closed.has(p.id))return this.view(now);
   const participants=names.map(n=>n===who?(this.readiness.get(key)?.until>now?key:null):[...this.readiness].find(([k,v])=>v.who===n&&v.until>now)?.[0]);
   check(!this.requireReady||participants.every(Boolean),'You both need Our Chat open and in focus.',409);
   check(p.kind===undefined||['touch','hug'].includes(p.kind),'Invalid shared moment.');
   check(p.kind!=='hug'||!this.requireReady||participants.every(k=>this.readiness.get(k)?.hugReady),'The hug animation is still getting ready on one of your devices.',409);
   if(this.session)check(!this.requireReady||this.session.participants.includes(key),'This moment is active on another device.',409);
   if(!this.session)this.session={id:p.id||randomUUID(),kind:p.kind||'touch',starter:who,participants,audience:participants.filter(Boolean).map(k=>k.slice(k.lastIndexOf(':')+1)),created:now,activity:now,updated:now,hands:{},progress:0,done:false,releaseAt:null};
   return this.view(now);
  }
  const s=this.session;if(!s||s.id!==p.id)return this.view(now);
  check(!this.requireReady||s.participants.includes(key),'Your touch is active on another device.',409);
  if(p.action==='hold'){
   check(!this.requireReady||s.participants.includes(key),'Your touch is active on another device.',409);
   const h=s.hands[who];check(!h||h.until<=now||h.key===key,'Your touch is active on another device.',409);
   s.hands[who]={key,sid,until:now+1200};s.engaged=true;s.activity=now;
  }else if(s.hands[who]?.key===key){delete s.hands[who];s.activity=now;}
  this.settle(now);return this.view(now);
 }
 disconnect(sid,now=Date.now()){for(const [k,v]of this.readiness)if(v.sid===sid)this.readiness.delete(k);if(this.requireReady)this.tick(now);const s=this.session;if(!s)return;for(const n of names)if(s.hands[n]?.sid===sid)delete s.hands[n];s.updated=now;this.settle(now);}
 view(now=Date.now()){const s=this.session;return s?{id:s.id,kind:s.kind||'touch',starter:s.starter,audience:this.requireReady?s.audience:undefined,created:s.created,progress:s.progress,done:s.done,releaseAt:s.releaseAt,serverNow:now,hands:Object.fromEntries(names.map(n=>[n,!!(s.hands[n]?.until>now)]))}:null;}
}

export function saveTouchMemory(store,moment,now=Date.now()){
 const hug=moment.kind==='hug',id=(hug?'shared-hug:':'shared-touch:')+createHash('sha256').update(moment.id).digest('hex');
 return store.tx(()=>{if(store.db.prepare('SELECT 1 FROM messages WHERE id=?').get(id))return false;store.message({id,author:'Together',text:hug?'A shared hug ♥':'A shared touch ♥',status:'sent'});store.db.prepare('UPDATE messages SET createdAt=? WHERE id=?').run(new Date(now).toISOString(),id);return true;});
}
