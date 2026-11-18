import {randomUUID} from 'node:crypto';
import {check,names} from './domain.mjs';
import {instant} from './personal.mjs';

// Care: Safy's health record. Everything is about Safy; both partners may log.
// Privacy rule: an entry Safy marks "private" exists only for Safy. It is removed
// at this server boundary (snapshot, history pages and export all go through
// visible()), so it never reaches Mahmoud's device, totals, export or AI context.
const DAY=86400000;
export const KINDS=['checkin','belly','bathroom','sleep','period','dose','note','flare'];
export const MOODS=['okay','tired','pain','sleep'];
export const WHERE=['colon','stomach','other'];
export const KEY_LABS=['esr','hemoglobin','ferritin','vitamin d'];
const SCHEDULES=['daily','weekly','as-needed'];
const LIMITS={entries:20000,labs:2000,meds:100,history:20,import:200,recentDays:120,recentMax:400,page:200};
const empty=()=>({id:randomUUID(),entries:[],labs:[],meds:[],revision:0});
const text=(v,max,label='this field')=>{if(v===undefined||v===null)return '';check(typeof v==='string'&&v.trim().length<=max,'Please shorten '+label+'.');return v.trim();};
const isTime=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const num=v=>typeof v==='number'&&Number.isFinite(v);
export const careZone=s=>s.personal?.profiles?.Safy?.zone||'Africa/Cairo';
const formats=new Map();
function dayFormat(zone){let f=formats.get(zone);if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});formats.set(zone,f);}return f;}
export function localDay(ms,zone){return dayFormat(zone).format(ms);}
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const dayStart=(day,zone)=>instant(day,'00:00',zone);
const labKey=t=>t.toLowerCase().replace(/\s+/g,' ').trim();
const unitKey=u=>(u||'').toLowerCase().replace(/\s+/g,'');
const newestFirst=(a,b)=>b.occurredAt-a.occurredAt||b.id.localeCompare(a.id);
const visible=(e,who)=>e.visibility==='shared'||(who==='Safy'&&e.loggedBy==='Safy');

function validTime(v,now,label){check(num(v)&&v>=now-5*365*DAY&&v<=now+3600000,'Choose a valid '+label+'.');return Math.round(v);}
function subset(v,allowed,label){check(Array.isArray(v)&&v.length<=allowed.length&&v.every(x=>allowed.includes(x))&&new Set(v).size===v.length,'Choose valid '+label+'.');return v;}
function entryData(kind,d,ctx){
 const {care,who,now,id,occurredAt,zone}=ctx;d=d&&typeof d==='object'?d:{};
 if(kind==='checkin'){const moods=subset(d.moods,MOODS,'feelings');check(moods.length>0,'Choose how she feels.');return {moods};}
 if(kind==='belly'){
  const pain=d.pain===null||d.pain===undefined?null:d.pain;check(pain===null||(Number.isInteger(pain)&&pain>=0&&pain<=5),'Pain is 0 to 5.');
  const where=subset(d.where??[],WHERE,'places');check(d.diarrhea===undefined||d.diarrhea===null||typeof d.diarrhea==='boolean','Choose diarrhea yes or no.');
  const out={pain,where,diarrhea:d.diarrhea??null,note:text(d.note,500,'the note')};check(out.pain!==null||out.where.length||out.diarrhea!==null||out.note,'Add at least one detail.');return out;
 }
 if(kind==='bathroom'){const count=d.count??1;check(Number.isInteger(count)&&count>=1&&count<=10,'Choose 1 to 10 visits.');return {count};}
 if(kind==='sleep'){
  const start=validTime(d.start,now,'sleep start'),end=d.end===null||d.end===undefined?null:validTime(d.end,now,'wake time');
  check(end===null||(end>start&&end-start<=24*3600000),'Wake time must be after sleep start, within 24 hours.');
  for(const o of care.entries)if(o.kind==='sleep'&&o.id!==id&&visible(o,who)){const os=o.data.start,oe=o.data.end??Infinity,e2=end??Infinity;check(!(start<oe&&os<e2),'This overlaps another sleep already logged.',409);}
  return {start,end};
 }
 if(kind==='period'){check(['start','end'].includes(d.state),'Choose period start or end.');check(d.flow===undefined||d.flow===null||['light','medium','heavy'].includes(d.flow),'Choose a valid flow.');return {state:d.state,flow:d.flow??null};}
 if(kind==='dose'){
  const med=care.meds.find(m=>m.id===d.med);check(med,'Medicine not found.',404);check(['taken','skipped'].includes(d.status),'Choose taken or skipped.');
  let slot=d.slot===undefined||d.slot===null||d.slot===''?null:d.slot;
  if(med.schedule!=='as-needed'&&med.times.length)check(isTime(slot)&&med.times.includes(slot),'Choose one of this medicine’s times.');
  else if(med.schedule==='weekly'&&!med.times.length){check(slot===null||slot==='any','Choose a valid dose.');slot='any';}
  else check(slot===null||(isTime(slot)&&med.times.includes(slot)),'Choose one of this medicine’s times.');
  if(slot){const day=localDay(occurredAt,zone);check(!care.entries.some(e=>visible(e,who)&&e.kind==='dose'&&e.id!==id&&e.data.med===med.id&&e.data.slot===slot&&localDay(e.occurredAt,zone)===day),'This dose is already logged for that day.',409);}
  return {med:med.id,status:d.status,slot};
 }
 if(kind==='note'){const t=text(d.text,1000,'the note');check(t,'Write the note first.');return {text:t};}
 if(kind==='flare'){check(['start','end'].includes(d.state),'Choose flare start or end.');return {state:d.state};}
 check(false,'Unknown entry type.');
}
function readEntry(care,who,id){const e=care.entries.find(x=>x.id===id);check(e&&visible(e,who),'Entry not found.',404);return e;}
function canEdit(e,who){return e.loggedBy===who||who==='Safy';}

function labData(d){
 const test=text(d.test,60,'the test name');check(test,'Name the test.');
 check(num(d.value),'Enter the number exactly as printed.');
 const unit=text(d.unit,20,'the unit'),rangeText=text(d.rangeText,60,'the range'),group=text(d.group,40,'the group')||'Other',source=text(d.source,120,'the source');
 const lo=d.lo===null||d.lo===undefined?null:d.lo,hi=d.hi===null||d.hi===undefined?null:d.hi;
 check((lo===null||num(lo))&&(hi===null||num(hi))&&(lo===null||hi===null||lo<hi),'Check the normal range.');
 check([undefined,null,'','H','L'].includes(d.flag),'Flag must be H, L or empty, as printed.');
 check(isDay(d.date)&&d.date>='1990-01-01','Choose the result date.');
 return {test,value:d.value,valueText:text(d.valueText,30,'the value')||String(d.value),unit,lo,hi,rangeText,flag:d.flag||'',date:d.date,group,source,verified:d.verified===true};
}
function medData(d){
 const name=text(d.name,80,'the medicine name');check(name,'Name the medicine.');
 check(SCHEDULES.includes(d.schedule),'Choose how often.');
 const times=d.times??[];check(Array.isArray(times)&&times.length<=4&&times.every(isTime)&&new Set(times).size===times.length,'Choose up to 4 different valid times.');
 check(d.schedule!=='daily'||times.length>0,'A daily medicine needs at least one time.');
 check(d.schedule!=='weekly'||(Number.isInteger(d.weekday)&&d.weekday>=0&&d.weekday<=6),'Choose the day of the week.');
 check(d.startedOn===undefined||d.startedOn===''||isDay(d.startedOn),'Choose a valid start date.');
 return {name,dose:text(d.dose,60,'the dose'),schedule:d.schedule,times:[...times].sort(),weekday:d.schedule==='weekly'?d.weekday:null,notes:text(d.notes,300,'the notes'),startedOn:d.startedOn||'',source:text(d.source,120,'the source')};
}

export function careChange(s,who,type,d={},now=Date.now()){
 check(names.includes(who),'Not allowed.',403);const care=s.care??=empty();d=d&&typeof d==='object'?d:{};let result={ok:true};const zone=careZone(s);
 if(type==='care.entry.add'){
  check(KINDS.includes(d.kind),'Unknown entry type.');check(care.entries.length<LIMITS.entries,'The record is full.');
  const visibility=d.visibility??'shared';check(['shared','private'].includes(visibility),'Choose who can see this.');check(visibility==='shared'||who==='Safy','Only Safy can keep an entry private.',403);
  const occurredAt=d.kind==='sleep'&&num(d.data?.start)?validTime(d.data.start,now,'sleep start'):d.occurredAt===undefined?now:validTime(d.occurredAt,now,'time');
  if(d.kind==='sleep'&&(d.data?.end===null||d.data?.end===undefined))check(!care.entries.some(e=>e.kind==='sleep'&&e.data.end===null&&visible(e,who)),'Finish the current sleep first.',409);
  const id=randomUUID();care.entries.push({id,kind:d.kind,occurredAt,loggedAt:now,loggedBy:who,visibility,source:text(d.source,80,'the source'),data:entryData(d.kind,d.data,{care,who,now,id,occurredAt,zone}),revision:1,history:[]});
  result={ok:true,id};
 }else if(type==='care.entry.edit'){
  const e=readEntry(care,who,d.id);check(canEdit(e,who),'Only Safy or the person who logged this can edit it.',403);check(e.revision===d.revision,'This entry changed. Reopen it to edit.',409);
  const visibility=d.visibility??e.visibility;check(['shared','private'].includes(visibility),'Choose who can see this.');check(visibility==='shared'||(who==='Safy'&&e.loggedBy==='Safy'),'Only Safy can keep her own entry private.',403);
  const occurredAt=e.kind==='sleep'?(num(d.data?.start)?validTime(d.data.start,now,'sleep start'):e.occurredAt):d.occurredAt===undefined?e.occurredAt:validTime(d.occurredAt,now,'time');
  const data=entryData(e.kind,d.data??e.data,{care,who,now,id:e.id,occurredAt,zone});
  e.history=[...e.history,{occurredAt:e.occurredAt,data:e.data,visibility:e.visibility,editedBy:who,editedAt:now}].slice(-LIMITS.history);
  Object.assign(e,{occurredAt,data,visibility,revision:e.revision+1,editedAt:now,editedBy:who});
 }else if(type==='care.entry.delete'){
  const e=readEntry(care,who,d.id);check(canEdit(e,who),'Only Safy or the person who logged this can delete it.',403);check(e.revision===d.revision,'This entry changed. Reopen it first.',409);care.entries=care.entries.filter(x=>x.id!==e.id);
 }else if(type==='care.lab.save'){
  const old=d.id?care.labs.find(l=>l.id===d.id):null;check(!d.id||old,'Result not found.',404);if(old)check(old.revision===d.revision,'This result changed. Reopen it to edit.',409);check(old||care.labs.length<LIMITS.labs,'Too many results.');
  const data=labData(d);check(!care.labs.some(l=>l.id!==old?.id&&labKey(l.test)===labKey(data.test)&&l.date===data.date),'This test already has a result on that date.',409);
  const history=old?[...(old.history??[]),{value:old.value,valueText:old.valueText,unit:old.unit,lo:old.lo,hi:old.hi,rangeText:old.rangeText,flag:old.flag,date:old.date,source:old.source,verified:old.verified,editedBy:who,editedAt:now}].slice(-LIMITS.history):[];
  const lab={id:old?.id??randomUUID(),...data,enteredBy:old?.enteredBy??who,enteredAt:old?.enteredAt??now,revision:(old?.revision??0)+1,editedBy:old?who:null,history};
  if(old)care.labs[care.labs.indexOf(old)]=lab;else care.labs.push(lab);result={ok:true,id:lab.id};
 }else if(type==='care.labs.import'){
  check(Array.isArray(d.labs)&&d.labs.length>0&&d.labs.length<=LIMITS.import,'Import between 1 and '+LIMITS.import+' results.');check(care.labs.length+d.labs.length<=LIMITS.labs,'Too many results.');
  const rows=d.labs.map(labData),seen=new Set(care.labs.map(l=>labKey(l.test)+'|'+l.date));let added=0,skipped=0;
  for(const r of rows){const k=labKey(r.test)+'|'+r.date;if(seen.has(k)){skipped++;continue;}seen.add(k);care.labs.push({id:randomUUID(),...r,enteredBy:who,enteredAt:now,revision:1,editedBy:null,history:[]});added++;}
  result={ok:true,added,skipped};
 }else if(type==='care.lab.delete'){
  const old=care.labs.find(l=>l.id===d.id);check(old,'Result not found.',404);check(old.revision===d.revision,'This result changed. Reopen it first.',409);care.labs=care.labs.filter(l=>l.id!==old.id);
 }else if(type==='care.med.save'){
  const old=d.id?care.meds.find(m=>m.id===d.id):null;check(!d.id||old,'Medicine not found.',404);if(old)check(old.revision===d.revision,'This medicine changed. Reopen it to edit.',409);check(old||care.meds.length<LIMITS.meds,'Too many medicines.');
  const data=medData(d);const med={id:old?.id??randomUUID(),...data,stoppedOn:old?.stoppedOn??null,createdBy:old?.createdBy??who,revision:(old?.revision??0)+1,plans:[...(old?.plans??[]),{...data,savedBy:who,savedAt:now}].slice(-LIMITS.history)};
  if(old)care.meds[care.meds.indexOf(old)]=med;else care.meds.push(med);result={ok:true,id:med.id};
 }else if(type==='care.med.stop'){
  const m=care.meds.find(x=>x.id===d.id);check(m,'Medicine not found.',404);check(m.revision===d.revision,'This medicine changed. Reopen it first.',409);check(isDay(d.stoppedOn),'Choose the stop date.');m.stoppedOn=d.stoppedOn;m.revision++;
 }else check(false,'Unknown care action.');
 care.revision++;s.version++;return result;
}

function status(v,lo,hi){if(lo===null&&hi===null)return 'none';if(lo!==null&&v<lo)return 'below';if(hi!==null&&v>hi)return 'above';return 'in';}
function distance(v,lo,hi){if(lo!==null&&v<lo)return lo-v;if(hi!==null&&v>hi)return v-hi;return 0;}
export function labTrend(latest,previous){
 const lo=latest.lo,hi=latest.hi,st=status(latest.value,lo,hi);if(!previous)return {status:st,trend:'single'};
 if(unitKey(latest.unit)!==unitKey(previous.unit))return {status:st,trend:'incompatible'};
 if(latest.value===previous.value)return {status:st,trend:'same'};
 const up=latest.value>previous.value,d1=distance(latest.value,lo,hi),d0=distance(previous.value,lo,hi);
 if(d1===0&&d0===0)return {status:st,trend:up?'up':'down'};
 return {status:st,trend:d1<d0?'better':'away',direction:up?'up':'down'};
}
const outside=t=>['below','above'].includes(t.status);
function labsView(care){
 const groups=new Map();for(const l of care.labs){const k=labKey(l.test);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(l);}
 const tests=[];for(const [key,list] of groups){
  const all=[...list].sort((a,b)=>b.date.localeCompare(a.date)),verified=all.filter(l=>l.verified),latest=verified[0]??null,previous=verified[1]??null;
  tests.push({key,test:(latest??all[0]).test,group:(latest??all[0]).group,latest,previous,unverified:all.filter(l=>!l.verified).length,readings:all.map(({id,value,valueText,unit,lo,hi,rangeText,flag,date,source,verified,revision,enteredBy,history})=>({id,value,valueText,unit,lo,hi,rangeText,flag,date,source,verified,revision,enteredBy,edits:(history??[]).length})),...(latest?labTrend(latest,previous):{status:null,trend:null})});
 }
 return tests.sort((a,b)=>a.group.localeCompare(b.group)||a.test.localeCompare(b.test));
}
function sleepHours(entries,day,zone,now){const a=dayStart(day,zone),b=dayStart(addDays(day,1),zone);let ms=0,logged=false;for(const e of entries)if(e.kind==='sleep'){const s=e.data.start,t=e.data.end??Math.min(now,b);const overlap=Math.min(t,b)-Math.max(s,a);if(overlap>0){ms+=overlap;logged=true;}}return logged?Math.round(ms/360000)/10:null;}
function medsView(care,todayDoses,allDoses,today){
 const weekday=new Date(today+'T12:00:00Z').getUTCDay();
 return care.meds.map(m=>{
  const active=(!m.stoppedOn||m.stoppedOn>=today)&&(!m.startedOn||m.startedOn<=today);
  const scheduled=active&&(m.schedule==='daily'||(m.schedule==='weekly'&&m.weekday===weekday));
  const logged=todayDoses.filter(e=>e.data.med===m.id);
  const slots=m.times.length?m.times:['any'];const filled=new Set(logged.filter(e=>e.data.slot).map(e=>e.data.slot));
  const pending=scheduled?slots.filter(t=>!filled.has(t)):[];
  const lastDose=allDoses.find(e=>e.data.med===m.id&&e.data.status==='taken')?.occurredAt??null;
  return {id:m.id,name:m.name,dose:m.dose,schedule:m.schedule,times:m.times,weekday:m.weekday,notes:m.notes,startedOn:m.startedOn,stoppedOn:m.stoppedOn,source:m.source,revision:m.revision,active,scheduledToday:scheduled,pendingToday:pending.filter(t=>t!=='any'),doneToday:scheduled&&pending.length===0,takenToday:logged.filter(e=>e.data.status==='taken').length,skippedToday:logged.filter(e=>e.data.status==='skipped').length,lastDose};
 });
}
const strip=(e,who)=>({id:e.id,kind:e.kind,occurredAt:e.occurredAt,loggedAt:e.loggedAt,loggedBy:e.loggedBy,visibility:e.visibility,source:e.source,data:e.data,revision:e.revision,edited:e.history.length>0,editedBy:e.editedBy??null,editedAt:e.editedAt??null,canEdit:canEdit(e,who)});
const memo=new Map();
export function careSnapshot(s,who,now=Date.now()){
 check(names.includes(who),'Not allowed.',403);const care=s.care??empty(),zone=careZone(s),today=localDay(now,zone);
 care.id??=randomUUID();const key=care.id+'|'+care.revision+'|'+care.entries.length+'|'+zone+'|'+Math.floor(now/60000);const cached=memo.get(who);if(s.care&&cached?.key===key)return cached.view;
 const mine=care.entries.filter(e=>visible(e,who)).sort(newestFirst);
 const first=addDays(today,-6),windowStart=dayStart(first,zone)-DAY;
 const week=mine.filter(e=>e.occurredAt>=windowStart||(e.kind==='sleep'&&(e.data.end??now)>=windowStart)).map(e=>({e,day:localDay(e.occurredAt,zone)}));
 const days=[...Array(7)].map((_,i)=>addDays(today,i-6)).map(day=>{
  const list=week.filter(x=>x.day===day).map(x=>x.e),belly=list.filter(e=>e.kind==='belly'),bath=list.filter(e=>e.kind==='bathroom');
  const pains=belly.map(e=>e.data.pain).filter(p=>p!==null),diar=belly.map(e=>e.data.diarrhea).filter(v=>v!==null);
  return {day,logged:list.length>0,bellyLogged:belly.length>0,pain:pains.length?Math.max(...pains):null,diarrhea:diar.length?diar.includes(true):null,bathroom:bath.length?bath.reduce((n,e)=>n+e.data.count,0):null,sleepHours:sleepHours(week.map(x=>x.e),day,zone,now),moods:[...new Set(list.filter(e=>e.kind==='checkin').flatMap(e=>e.data.moods))]};
 });
 let flare={active:false,since:null,lastEnd:null,lastStart:null,logged:false};
 for(const f of mine.filter(e=>e.kind==='flare').reverse()){flare.logged=true;if(f.data.state==='start'){flare.active=true;flare.since=f.occurredAt;flare.lastStart=f.occurredAt;}else{flare.active=false;flare.since=null;flare.lastEnd=f.occurredAt;}}
 const todayList=week.filter(x=>x.day===today).map(x=>x.e);
 const todayBelly=todayList.find(e=>e.kind==='belly')??null;
 const lastCheckin=mine.find(e=>e.kind==='checkin'||e.kind==='belly')??null;
 const labs=labsView(care),allDoses=mine.filter(e=>e.kind==='dose'),meds=medsView(care,todayList.filter(e=>e.kind==='dose'),allDoses,today);
 const attention=[...labs.filter(t=>t.latest&&outside(t)&&t.trend==='away').map(t=>({type:'lab',key:t.key,test:t.test,status:t.status,direction:t.direction})),...meds.filter(m=>m.scheduledToday&&!m.doneToday).map(m=>({type:'dose',id:m.id,name:m.name,times:m.pendingToday}))];
 const recent=mine.filter(e=>e.occurredAt>=now-LIMITS.recentDays*DAY).slice(0,LIMITS.recentMax);
 const view={zone,today,serverNow:now,canPrivate:who==='Safy',entries:recent.map(e=>strip(e,who)),olderEntries:mine.length>recent.length,week:days,flare,todayBelly:todayBelly&&strip(todayBelly,who),todayBathroom:days[6].bathroom??0,lastCheckin:lastCheckin&&strip(lastCheckin,who),labs,keyLabs:KEY_LABS.map(k=>labs.find(t=>t.latest&&(t.key===k||t.key.startsWith(k+' ')))).filter(Boolean),attention,improving:labs.filter(t=>t.latest&&outside(t)&&t.trend==='better').map(t=>t.test),unchanged:labs.filter(t=>t.latest&&outside(t)&&t.trend==='same').map(t=>t.test),meds};
 memo.set(who,{key,view});return view;
}
// Older entries, page by page, with the same privacy filter.
export function careHistory(s,who,before=Infinity,limit=LIMITS.page,beforeId=''){
 check(names.includes(who),'Not allowed.',403);const care=s.care??empty();const max=Math.min(Math.max(1,Number(limit)||LIMITS.page),LIMITS.page);
 const list=care.entries.filter(e=>visible(e,who)&&(e.occurredAt<before||(e.occurredAt===before&&beforeId&&e.id.localeCompare(beforeId)<0))).sort(newestFirst);
 return {entries:list.slice(0,max).map(e=>strip(e,who)),more:list.length>max};
}
// Full record for this person's export (private entries stay out for Mahmoud).
export function careExport(s,who){
 check(names.includes(who),'Not allowed.',403);const care=s.care??empty();
 return {format:'our-place-care-v1',zone:careZone(s),entries:care.entries.filter(e=>visible(e,who)).sort((a,b)=>a.occurredAt-b.occurredAt).map(e=>({...strip(e,who),history:e.history.filter(h=>h.visibility==='shared'||who==='Safy')})),labs:care.labs,meds:care.meds};
}
