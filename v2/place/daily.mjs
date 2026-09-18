import {nightFallback} from './daily-fallback.mjs';
import {randomUUID,randomInt} from 'node:crypto';
import {check} from './domain.mjs';
import {dailyGenerate,morningKinds,nightKinds} from './daily-ai.mjs';
export function dailyDefaults(now=Date.now()){return {enabled:true,timeZone:'Asia/Riyadh',revision:1,after:now,comments:false,notifications:false,slots:[{id:'morning',time:'09:00',enabled:true},{id:'afternoon',time:'16:00',enabled:true},{id:'night',time:'22:00',enabled:true}]};}
export function updateDaily(s,p,now=Date.now()){
 const old=s.daily??dailyDefaults(now);check(p.revision===old.revision,'Daily settings changed. Refresh before saving.',409);
 for(const key of ['enabled','comments','notifications'])check(typeof p[key]==='boolean','Choose daily post settings.');
 check(Array.isArray(p.slots)&&p.slots.length===3,'Choose all three posting times.');
 const slots=old.slots.map(slot=>{const next=p.slots.find(x=>x.id===slot.id);check(next&&typeof next.enabled==='boolean'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(next.time),'Use valid posting times.');return {id:slot.id,enabled:next.enabled,time:next.time};});
 s.daily={...old,enabled:p.enabled,comments:p.comments,notifications:p.notifications,slots,revision:old.revision+1,after:now};s.version++;
}
export function dueSlots(config,now){
 if(!config?.enabled)return [];
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 return config.slots.filter(x=>x.enabled).map(x=>({...x,key:day+':'+x.id,at:Date.parse(day+'T'+x.time+':00+03:00')})).filter(x=>x.at>config.after&&now>=x.at&&now-x.at<3600000);
}
export class DailyWall{
 constructor(store,{generate=dailyGenerate,refresh=()=>{},now=Date.now,connected=()=>!!process.env.OPENAI_API_KEY}={}){
  Object.assign(this,{store,generate,refresh,now,connected});this.active=new Map();this.stopped=false;
  store.db.exec(`CREATE TABLE IF NOT EXISTS echo_daily_runs(key TEXT PRIMARY KEY,status TEXT NOT NULL,job TEXT,detail TEXT,createdAt TEXT NOT NULL); UPDATE echo_daily_runs SET status='interrupted',detail='Server restarted; no automatic retry of a billed request.' WHERE status='running';`);
  store.tx(()=>{const s=store.state();if(!s.daily){s.daily=dailyDefaults(now());s.version++;store.save(s);}});
 }
 view(){return {...this.store.state().daily,runs:this.store.db.prepare('SELECT key,status,detail,createdAt FROM echo_daily_runs ORDER BY createdAt DESC LIMIT 6').all()};}
 stop(){this.stopped=true;this.cancel(()=>true);}
 cancel(predicate){for(const [id,x]of this.active)if(predicate(x)){this.store.status(id,'cancelled');x.controller.abort();}}
 recoverNight(slot){
  this.store.tx(()=>{
   const s=this.store.state(),run=this.store.db.prepare('SELECT status FROM echo_daily_runs WHERE key=?').get(slot.key);
   if(!run||!['failed','interrupted'].includes(run.status)||s.pauses.length||!s.daily.enabled||!s.daily.slots.some(x=>x.id==='night'&&x.enabled)||s.items.length>=500)return;
   if(!s.items.some(x=>x.daily?.key===slot.key)){
    const value=nightFallback(s.items,slot.key);if(!value)return;
    s.items.unshift({id:randomUUID(),type:'Discussion',...value,by:'Echo',images:[],steps:[],approvals:[],comments:[],revision:1,aiAllowed:false,echoComments:s.daily.comments,echoEpoch:0,createdAt:new Date(this.now()).toISOString(),daily:{slot:'night',key:slot.key,variant:'editorial reserve',notify:s.daily.notifications}});s.version++;this.store.save(s);
   }
   this.store.db.prepare("UPDATE echo_daily_runs SET status='posted',detail='Published a verified reserve item or original puzzle after a failed attempt.' WHERE key=?").run(slot.key);
   console.info('Daily Echo recovered: '+slot.key);
  });this.refresh();
 }
 async tick(){
  if(this.stopped)return;const {store}=this,s=store.state();if(s.pauses.length)return;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.now()));
  if(s.daily.enabled&&s.daily.slots.some(x=>x.id==='night'&&x.enabled)){
   const key=today+':night',old=store.db.prepare('SELECT status FROM echo_daily_runs WHERE key=?').get(key);
   if(old&&['failed','interrupted'].includes(old.status))this.recoverNight({key,id:'night'});
  }
  for(const slot of dueSlots(s.daily,this.now())){
   const prior=store.db.prepare('SELECT * FROM echo_daily_runs WHERE key=?').get(slot.key);
   if(prior){if(slot.id==='night'&&['failed','interrupted'].includes(prior.status))this.recoverNight(slot);continue;}
   if(store.db.prepare("SELECT 1 FROM jobs WHERE status='running'").get())return;
   let id;const cfg=s.daily;
   const record=(status,detail,job=null)=>store.db.prepare('INSERT OR IGNORE INTO echo_daily_runs VALUES(?,?,?,?,?)').run(slot.key,status,job,detail,new Date(this.now()).toISOString());
   if(!this.connected()){record('skipped','Echo is not connected.');this.refresh();continue;}
   if(s.items.length>=500){record('skipped','Your wall is full. Export a backup before making space.');this.refresh();continue;}
   try{store.tx(()=>{id=store.reserve('Echo','shared',{purpose:'daily',searchBudget:slot.id!=='morning'});record('running',null,id);});}
   catch(e){record('skipped',e.status===429?'Echo budget limit reached.':'Echo is unavailable.');this.refresh();continue;}
   const controller=new AbortController();this.active.set(id,{controller,kind:'daily',revision:cfg.revision});const timer=setTimeout(()=>controller.abort(),90000);timer.unref();
   try{
    const recent=s.items.filter(x=>x.daily).slice(0,30),choices=slot.id==='morning'?morningKinds:nightKinds,available=choices.filter(x=>!recent.filter(p=>p.daily.slot===slot.id).slice(0,choices.length-1).some(p=>p.daily.variant===x)),variant=available[randomInt(available.length)];
    let result;
    for(let attempt=0;attempt<2;attempt++){
     try{result=await this.generate({kind:slot.id,variant:attempt?'Choose a completely different topic. '+variant:variant,history:recent.map(x=>x.title.slice(0,700)),now:this.now(),signal:controller.signal});
      if(result.value)break;
      const e=new Error('No suitable post was returned.');e.usage=result.usage;throw e;
     }catch(e){
      if(controller.signal.aborted)throw e;
      store.tx(()=>{store.settle(id,e.usage);store.status(id,'failed');});
      if(attempt===0){
       try{const next=store.tx(()=>store.reserve('Echo','shared',{purpose:'daily',searchBudget:slot.id!=='morning'}));
        this.active.delete(id);store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(id);id=next;
        this.active.set(id,{controller,kind:'daily',revision:cfg.revision});
        store.db.prepare('UPDATE echo_daily_runs SET job=? WHERE key=?').run(id,slot.key);continue;
       }catch{}
      }
      if(slot.id!=='night')throw e;
      store.status(id,'running');result={value:nightFallback(store.state().items,slot.key)};break;
     }
    }
    store.tx(()=>{store.settle(id,result.usage);const current=store.state();if(controller.signal.aborted||store.job(id).status!=='running'||current.daily.revision!==cfg.revision||!current.daily.enabled||current.pauses.length){store.status(id,'cancelled');store.db.prepare("UPDATE echo_daily_runs SET status='cancelled',detail='Settings changed or Echo was paused.' WHERE key=?").run(slot.key);return;}
     const value=result.value;if(value&&current.items.length<500&&!current.items.some(x=>x.daily&&x.title===value.title)){
      current.items.unshift({id:randomUUID(),type:'Discussion',title:value.title,by:'Echo',images:[],steps:[],approvals:[],comments:[],revision:1,aiAllowed:false,echoComments:cfg.comments,echoEpoch:0,createdAt:new Date(this.now()).toISOString(),sources:value.sources,publishedDate:value.publishedDate,daily:{slot:slot.id,key:slot.key,variant,notify:cfg.notifications}});current.version++;store.save(current);store.db.prepare("UPDATE echo_daily_runs SET status='posted',detail=NULL WHERE key=?").run(slot.key);
     }else store.db.prepare("UPDATE echo_daily_runs SET status='skipped',detail='No suitable original post was found.' WHERE key=?").run(slot.key);
     store.status(id,'done');});
   }catch(e){const current=store.state(),cancelled=controller.signal.aborted&&(this.stopped||current.daily.revision!==cfg.revision||!current.daily.enabled||current.pauses.length||store.job(id).status==='cancelled');store.status(id,cancelled?'cancelled':'failed');store.db.prepare('UPDATE echo_daily_runs SET status=?,detail=? WHERE key=?').run(cancelled?'cancelled':'failed',cancelled?'Echo stopped.':e.status?e.message:'Could not verify or generate this post; no substitute was published.',slot.key);}
   finally{clearTimeout(timer);this.active.delete(id);store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(id);this.refresh();}
  }
 }
 async comment(postId){
  const {store}=this;if(this.stopped||!this.connected())return;
  let id,thread,last,epoch;
  store.tx(()=>{const s=store.state(),p=s.items.find(x=>x.id===postId);if(!p?.echoComments||s.pauses.length||p.comments?.length>=200)return;
   last=p.comments?.at(-1);if(!last||last.by==='Echo'||p.echoLastConsidered===last.id)return;
   // Quiet by default: short acknowledgements and rapid exchanges do not prompt Echo.
   const addressed=/\becho\b|إيكو|ايكو/i.test(last.text),prev=p.comments.filter(x=>x.by==='Echo').at(-1);
   if(!addressed&&(last.text.trim().length<20||prev&&this.now()-Date.parse(prev.createdAt)<120000))return;
   if(store.db.prepare("SELECT 1 FROM jobs WHERE status='running'").get())return;
   try{id=store.reserve(last.by,'shared',{purpose:'wall-auto',wallItem:postId});}catch{return;}
   epoch=p.echoEpoch??0;p.echoLastConsidered=last.id;store.save(s);thread={text:p.title,sources:p.sources??[],comments:p.comments.filter(c=>!c.status||c.status==='sent').slice(-12).map(c=>({by:c.by,text:c.text}))};
  });
  if(!id)return;const controller=new AbortController();this.active.set(id,{controller,kind:'comment',postId});const timer=setTimeout(()=>controller.abort(),45000);timer.unref();
  try{const result=await this.generate({kind:'comment',post:thread,signal:controller.signal,now:this.now()});store.tx(()=>{store.settle(id,result.usage);const s=store.state(),p=s.items.find(x=>x.id===postId);if(controller.signal.aborted||store.job(id).status!=='running'||!p?.echoComments||p.echoEpoch!==epoch||s.pauses.length||!p.comments.some(c=>c.id===last.id)||p.comments.length>=200){store.status(id,'cancelled');return;}
   if(result.value){p.comments.push({id,by:'Echo',text:result.value,status:'sent',replyTo:last.id,createdAt:new Date(this.now()).toISOString()});p.revision++;s.version++;store.save(s);}store.status(id,'done');});}
  catch{if(store.job(id)?.status==='running')store.status(id,'failed');}
  finally{clearTimeout(timer);this.active.delete(id);store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(id);this.refresh();}
 }
}

