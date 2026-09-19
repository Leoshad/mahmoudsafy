import {morningFallback} from './daily-editorial.mjs';
import {nightFallback} from './daily-fallback.mjs';
import {randomUUID,randomInt} from 'node:crypto';
import {check} from './domain.mjs';
import {dailyGenerate,morningKinds,nightKinds} from './daily-ai.mjs';
export function dailyDefaults(now=Date.now()){return {enabled:true,timeZone:'Asia/Riyadh',revision:1,editorialVersion:2,after:now,comments:false,notifications:false,slots:[{id:'morning',time:'09:30',enabled:true},{id:'afternoon',time:'16:00',enabled:true},{id:'night',time:'22:00',enabled:true}]};}
export function updateDaily(s,p,now=Date.now()){
 const old=s.daily??dailyDefaults(now);check(p.revision===old.revision,'Daily settings changed. Refresh before saving.',409);
 for(const key of ['enabled','comments','notifications'])check(typeof p[key]==='boolean','Choose daily post settings.');
 check(Array.isArray(p.slots)&&p.slots.length===3,'Choose all three posting times.');
 const slots=old.slots.map(slot=>{const next=p.slots.find(x=>x.id===slot.id);check(next&&typeof next.enabled==='boolean'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(next.time),'Use valid posting times.');return {id:slot.id,enabled:next.enabled,time:next.time};});
 s.daily={...old,enabled:p.enabled,comments:p.comments,notifications:p.notifications,slots,revision:old.revision+1,after:now};s.version++;
}
export function dueSlots(config,now,lead=0){
 if(!config?.enabled)return [];
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 return config.slots.filter(x=>x.enabled).map(x=>({...x,key:day+':'+x.id,at:Date.parse(day+'T'+x.time+':00+03:00')})).filter(x=>x.at>config.after&&now>=x.at-lead&&now-x.at<3600000);
}
export class DailyWall{
 constructor(store,{generate=dailyGenerate,refresh=()=>{},now=Date.now,connected=()=>!!process.env.OPENAI_API_KEY}={}){
  Object.assign(this,{store,generate,refresh,now,connected});this.active=new Map();this.stopped=false;
  store.db.exec(`CREATE TABLE IF NOT EXISTS echo_daily_content(key TEXT PRIMARY KEY,value TEXT NOT NULL,variant TEXT NOT NULL,revision INTEGER NOT NULL,at INTEGER NOT NULL,published INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS echo_daily_replacements(key TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS echo_daily_runs(key TEXT PRIMARY KEY,status TEXT NOT NULL,job TEXT,detail TEXT,createdAt TEXT NOT NULL); UPDATE echo_daily_runs SET status='interrupted',detail='Server restarted; no automatic retry of a billed request.' WHERE status='running';`);
  store.tx(()=>{const s=store.state();if(!s.daily){s.daily=dailyDefaults(now());s.version++;store.save(s);}else if(s.daily.editorialVersion!==2){
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now())),key=day+':morning';
   s.daily.slots=s.daily.slots.map(x=>x.id==='morning'?{...x,time:'09:30'}:x);s.daily.editorialVersion=2;s.daily.revision++;
   const old=store.db.prepare('SELECT status FROM echo_daily_runs WHERE key=?').get(key);
   if(old?.status==='posted'&&!s.items.some(x=>x.daily?.key===key)){store.db.prepare('INSERT OR IGNORE INTO echo_daily_replacements VALUES(?)').run(key);store.db.prepare('DELETE FROM echo_daily_runs WHERE key=?').run(key);}
   s.version++;store.save(s);console.info('Daily Echo editorial policy enabled; morning scheduled for 09:30 Riyadh.');
  }});
 }
 view(){return {...this.store.state().daily,runs:this.store.db.prepare('SELECT key,status,detail,createdAt FROM echo_daily_runs ORDER BY createdAt DESC LIMIT 6').all()};}
 stop(){this.stopped=true;this.cancel(()=>true);}
 cancel(predicate){for(const [id,x]of this.active)if(predicate(x)){this.store.status(id,'cancelled');x.controller.abort();}}
 recoverNight(slot){
  this.store.tx(()=>{
   const s=this.store.state(),run=this.store.db.prepare('SELECT status FROM echo_daily_runs WHERE key=?').get(slot.key);
   const nightTime=s.daily.slots.find(x=>x.id==='night')?.time;if(nightTime&&this.now()<Date.parse(slot.key.slice(0,10)+'T'+nightTime+':00+03:00'))return;
   if(!run||!['failed','interrupted'].includes(run.status)||s.pauses.length||!s.daily.enabled||!s.daily.slots.some(x=>x.id==='night'&&x.enabled)||s.items.length>=500)return;
   if(!s.items.some(x=>x.daily?.key===slot.key)){
    const value=nightFallback(s.items,slot.key);if(!value)return;
    s.items.unshift({id:randomUUID(),type:'Discussion',...value,by:'Echo',images:[],steps:[],approvals:[],comments:[],revision:1,aiAllowed:false,echoComments:s.daily.comments,echoEpoch:0,createdAt:new Date(this.now()).toISOString(),daily:{slot:'night',key:slot.key,variant:'editorial reserve',notify:s.daily.notifications}});s.version++;this.store.save(s);
   }
   this.store.db.prepare("UPDATE echo_daily_runs SET status='posted',detail='Published a verified reserve item or original puzzle after a failed attempt.' WHERE key=?").run(slot.key);
   console.info('Daily Echo recovered: '+slot.key);
  });this.refresh();
 }
 publish(slot,value,variant,cfg){
  const current=this.store.state();if(current.daily.revision!==cfg.revision||!current.daily.enabled||current.pauses.length)return false;
  if(!value||current.items.length>=500||current.items.some(x=>x.daily&&(x.daily.key===slot.key||x.title===value.title)))return false;
  current.items.unshift({id:randomUUID(),type:'Discussion',title:value.title,by:'Echo',images:[],steps:[],approvals:[],comments:[],revision:1,aiAllowed:false,echoComments:cfg.comments,echoEpoch:0,createdAt:new Date(this.now()).toISOString(),sources:value.sources,publishedDate:value.publishedDate,daily:{slot:slot.id,key:slot.key,variant,reserveFormat:value.reserveFormat,notify:cfg.notifications}});current.version++;this.store.save(current);
  this.store.db.prepare("UPDATE echo_daily_runs SET status='posted',detail=NULL WHERE key=?").run(slot.key);
  this.store.db.prepare('UPDATE echo_daily_content SET published=1 WHERE key=?').run(slot.key);return true;
 }
 async tick(){
  if(this.stopped)return;const {store}=this,s=store.state();if(s.pauses.length)return;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.now()));
  if(s.daily.enabled&&s.daily.slots.some(x=>x.id==='night'&&x.enabled)){
   const key=today+':night',old=store.db.prepare('SELECT status FROM echo_daily_runs WHERE key=?').get(key);
   if(old&&['failed','interrupted'].includes(old.status))this.recoverNight({key,id:'night'});
  }
  for(const slot of dueSlots(s.daily,this.now(),5*60000)){
   let prior=store.db.prepare('SELECT * FROM echo_daily_runs WHERE key=?').get(slot.key);
   const prepared=store.db.prepare('SELECT * FROM echo_daily_content WHERE key=?').get(slot.key);
   if(prior?.status==='ready'){
    if(!prepared||prepared.revision!==s.daily.revision||prepared.at!==slot.at){store.db.prepare('DELETE FROM echo_daily_runs WHERE key=?').run(slot.key);store.db.prepare('DELETE FROM echo_daily_content WHERE key=? AND published=0').run(slot.key);prior=null;}
    else if(this.now()>=slot.at){store.tx(()=>this.publish(slot,JSON.parse(prepared.value),prepared.variant,s.daily));this.refresh();continue;}else continue;
   }
   // Deletion alone never reposts. An explicit future reschedule may replace a deleted post once.
   if(prior?.status==='posted'&&!s.items.some(x=>x.daily?.key===slot.key)&&s.daily.after>Date.parse(prior.createdAt)&&slot.at>s.daily.after&&!store.db.prepare('SELECT 1 FROM echo_daily_replacements WHERE key=?').get(slot.key)){
    store.db.prepare('INSERT INTO echo_daily_replacements VALUES(?)').run(slot.key);store.db.prepare('DELETE FROM echo_daily_runs WHERE key=?').run(slot.key);prior=null;
   }
   if(prior){if(slot.id==='night'&&['failed','interrupted'].includes(prior.status))this.recoverNight(slot);continue;}
   if(store.db.prepare("SELECT 1 FROM jobs WHERE status='running'").get())return;
   let id;const cfg=s.daily;
   const record=(status,detail,job=null)=>store.db.prepare('INSERT OR IGNORE INTO echo_daily_runs VALUES(?,?,?,?,?)').run(slot.key,status,job,detail,new Date(this.now()).toISOString());
   if(!this.connected()){if(this.now()<slot.at)continue;record('skipped','Echo is not connected.');this.refresh();continue;}
   if(s.items.length>=500){record('skipped','Your wall is full. Export a backup before making space.');this.refresh();continue;}
   try{store.tx(()=>{id=store.reserve('Echo','shared',{purpose:'daily',searchBudget:slot.id!=='morning'});record('running',null,id);});}
   catch(e){if(this.now()<slot.at)continue;record('skipped',e.status===429?'Echo budget limit reached.':'Echo is unavailable.');this.refresh();continue;}
   const controller=new AbortController();this.active.set(id,{controller,kind:'daily',revision:cfg.revision});const timer=setTimeout(()=>controller.abort(),90000);timer.unref();
   try{
    const archived=store.db.prepare('SELECT * FROM echo_daily_content WHERE published=1 ORDER BY at DESC LIMIT 30').all().map(x=>({...JSON.parse(x.value),daily:{slot:x.key.split(':')[1],variant:x.variant}}));const recent=[...s.items.filter(x=>x.daily),...archived].filter((x,i,a)=>a.findIndex(p=>p.title===x.title)===i).slice(0,30),choices=slot.id==='morning'?morningKinds:slot.id==='afternoon'?['a current verified non-negative world news report']:nightKinds,available=choices.filter(x=>!recent.filter(p=>p.daily.slot===slot.id).slice(0,choices.length-1).some(p=>p.daily.variant===x)),variant=(available.length?available:choices)[randomInt((available.length?available:choices).length)];
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
      if(slot.id==='afternoon')throw e;
      store.status(id,'running');result={value:slot.id==='morning'?morningFallback(recent):nightFallback(recent,slot.key)};break;
     }
    }
    store.tx(()=>{store.settle(id,result.usage);const current=store.state();if(controller.signal.aborted||store.job(id).status!=='running'||current.daily.revision!==cfg.revision||!current.daily.enabled||current.pauses.length){store.status(id,'cancelled');store.db.prepare("UPDATE echo_daily_runs SET status='cancelled',detail='Settings changed or Echo was paused.' WHERE key=?").run(slot.key);return;}
     const value=result.value;if(value){
      store.db.prepare('INSERT OR REPLACE INTO echo_daily_content VALUES(?,?,?,?,?,0)').run(slot.key,JSON.stringify(value),variant,cfg.revision,slot.at);
      if(this.now()<slot.at)store.db.prepare("UPDATE echo_daily_runs SET status='ready',detail='Reviewed and ready for the scheduled time.' WHERE key=?").run(slot.key);
      else if(!this.publish(slot,value,variant,cfg))store.db.prepare("UPDATE echo_daily_runs SET status='skipped',detail='No suitable original post was found.' WHERE key=?").run(slot.key);
     }else store.db.prepare("UPDATE echo_daily_runs SET status='failed',detail='No unused reviewed reserve is available.' WHERE key=?").run(slot.key);
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

