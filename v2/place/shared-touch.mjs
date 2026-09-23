import {randomUUID} from 'node:crypto';
import {check} from './domain.mjs';
const names=['Mahmoud','Safy'];
export class SharedTouch {
 constructor(){this.session=null;this.closed=new Map();this.orders=new Map();}
 tick(now=Date.now()){
  const s=this.session;if(!s)return;
  if(!s.done&&now-s.activity>90000){this.close(now);return;}
  const dt=Math.max(0,Math.min(250,now-s.updated));s.updated=now;
  const both=names.every(n=>s.hands[n]?.until>now);
  if(!s.done){s.progress=both?Math.min(1,s.progress+dt/4000):Math.max(0,s.progress-dt/1100);if(s.progress===1)s.done=true;}
 }
 close(now=Date.now()){if(this.session)this.closed.set(this.session.id,now);this.session=null;}
 action(who,sid,p,now=Date.now()){
  check(names.includes(who),'Please sign in.',401);
  check(typeof p.client==='string'&&/^[\w-]{8,80}$/.test(p.client)&&Number.isSafeInteger(p.seq)&&p.seq>0,'Invalid touch request.');
  check(typeof p.id==='string'&&/^[\w-]{8,80}$/.test(p.id),'Invalid moment.');
  check(['start','hold','release','close'].includes(p.action),'Invalid touch action.');
  for(const [id,t]of this.closed)if(now-t>600000)this.closed.delete(id);
  for(const [id,v]of this.orders)if(now-v.at>600000)this.orders.delete(id);
  const key=sid+':'+p.client,old=this.orders.get(key);
  if(old&&p.seq<=old.seq)return this.view(now);
  this.orders.set(key,{seq:p.seq,at:now});this.tick(now);
  if(p.action==='close'){this.closed.set(p.id,now);if(this.session?.id===p.id)this.close(now);return this.view(now);}
  if(p.action==='start'){
   if(this.closed.has(p.id))return this.view(now);
   if(!this.session)this.session={id:p.id||randomUUID(),starter:who,created:now,activity:now,updated:now,hands:{},progress:0,done:false};
   return this.view(now);
  }
  const s=this.session;if(!s||s.id!==p.id||s.done)return this.view(now);
  if(p.action==='hold'){
   const h=s.hands[who];check(!h||h.until<=now||h.key===key,'Your touch is active on another device.',409);
   s.hands[who]={key,sid,until:now+1200};s.activity=now;
  }else if(s.hands[who]?.key===key){delete s.hands[who];s.activity=now;}
  return this.view(now);
 }
 disconnect(sid,now=Date.now()){const s=this.session;if(!s||s.done)return;for(const n of names)if(s.hands[n]?.sid===sid)delete s.hands[n];s.updated=now;}
 view(now=Date.now()){const s=this.session;return s?{id:s.id,starter:s.starter,created:s.created,progress:s.progress,done:s.done,hands:Object.fromEntries(names.map(n=>[n,s.done||!!(s.hands[n]?.until>now)]))}:null;}
}
