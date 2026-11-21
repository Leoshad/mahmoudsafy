import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
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
const SYMPTOMS=['back pain','colon pain','stomach','nausea','diarrhea','headache','dizzy','tinnitus','cold / flu','other'];
export const KEY_LABS=['esr','hemoglobin','ferritin','vitamin d'];
const SCHEDULES=['daily','weekly','as-needed'];
const LIMITS={papers:400,appointments:200,guide:60,milestones:500,doctors:30,entries:20000,labs:2000,meds:100,history:20,import:200,recentDays:120,recentMax:400,page:200};
const empty=()=>({id:randomUUID(),entries:[],labs:[],meds:[],milestones:[],doctors:[],appointments:[],breast:{intervalMonths:null},crohn:{treatment:''},revision:0});
export const PERIOD_SIGNS=['pad-2h','double','night','clots'];
export const APPT_KINDS=['visit','breast','test','other'];
export const GUIDE_KINDS=['ask','remember','good','habit','research'];
export const STORY_KINDS=['crohn','blood','visit','medicine','women','other'];
export const PAPER_KINDS=['lab','report','rx','scan','other'];
export const PAPER_TYPES=['image/jpeg','image/png','image/webp','application/pdf'];
const isStoryDate=v=>typeof v==='string'&&(/^\d{4}$/.test(v)||/^\d{4}-(0[1-9]|1[0-2])$/.test(v)||isDay(v))&&v>='1990';
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
 if(kind==='checkin'){const moods=subset(d.moods??[],MOODS,'feelings'),symptoms=subset(d.symptoms??[],SYMPTOMS,'symptoms');const energy=d.energy??null,rested=d.rested??null,note=text(d.note,500,'the note');check(energy===null||(Number.isInteger(energy)&&energy>=1&&energy<=5),'Energy must be 1 to 5.');check(rested===null||['no','a little','yes'].includes(rested),'Choose how rested she felt.');check(moods.length>0||energy!==null||symptoms.length||rested||note,'Choose at least one detail.');return {moods,energy,symptoms,rested,note};}
 if(kind==='belly'){
  const pain=d.pain===null||d.pain===undefined?null:d.pain;check(pain===null||(Number.isInteger(pain)&&pain>=0&&pain<=5),'Pain is 0 to 5.');
  const where=subset(d.where??[],WHERE,'places');check(d.diarrhea===undefined||d.diarrhea===null||typeof d.diarrhea==='boolean','Choose diarrhea yes or no.');
  const out={pain,where,diarrhea:d.diarrhea??null,note:text(d.note,500,'the note')};check(out.pain!==null||out.where.length||out.diarrhea!==null||out.note,'Add at least one detail.');return out;
 }
 if(kind==='bathroom'){const count=d.count??1;check(Number.isInteger(count)&&count>=1&&count<=10,'Choose 1 to 10 visits.');return {count};}
 if(kind==='sleep'){
  const quality=d.quality===undefined||d.quality===null||d.quality===''?null:d.quality;check(quality===null||['good','ok','bad'].includes(quality),'Choose how she slept.');
  const start=validTime(d.start,now,'sleep start'),end=d.end===null||d.end===undefined?null:validTime(d.end,now,'wake time');
  check(end===null||(end>start&&end-start<=24*3600000),'Wake time must be after sleep start, within 24 hours.');
  for(const o of care.entries)if(o.kind==='sleep'&&o.id!==id&&visible(o,who)){const os=o.data.start,oe=o.data.end??Infinity,e2=end??Infinity;check(!(start<oe&&os<e2),'This overlaps another sleep already logged.',409);}
  return quality?{start,end,quality}:{start,end};
 }
 if(kind==='period'){check(['start','end','day'].includes(d.state),'Choose period start, end or a day note.');check(d.flow===undefined||d.flow===null||['light','medium','heavy'].includes(d.flow),'Choose a valid flow.');const signs=subset(d.signs??[],PERIOD_SIGNS,'signs');const note=text(d.note,300,'the note');return {state:d.state,flow:d.flow??null,...(signs.length?{signs}:{}),...(note?{note}:{})};}
 if(kind==='dose'){
  const med=care.meds.find(m=>m.id===d.med);check(med,'Medicine not found.',404);check(['taken','skipped'].includes(d.status),'Choose taken or skipped.');
  let slot=d.slot===undefined||d.slot===null||d.slot===''?null:d.slot;
  if(med.schedule!=='as-needed'&&med.times.length)check(isTime(slot)&&med.times.includes(slot),'Choose one of this medicine’s times.');
  else if(med.schedule==='weekly'&&!med.times.length){check(slot===null||slot==='any','Choose a valid dose.');slot='any';}
  else check(slot===null||(isTime(slot)&&med.times.includes(slot)),'Choose one of this medicine’s times.');
  if(slot){const day=localDay(occurredAt,zone);check(!care.entries.some(e=>visible(e,who)&&e.kind==='dose'&&e.id!==id&&e.data.med===med.id&&e.data.slot===slot&&localDay(e.occurredAt,zone)===day),'This dose is already logged for that day.',409);}
  return {med:med.id,status:d.status,slot};
 }
 if(kind==='note'){const t=text(d.text,1000,'the note');check(t,'Write the note first.');const out={text:t};if(d.todo===true){out.todo=true;out.done=d.done===true;}return out;}
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

function guideData(d){d=d&&typeof d==='object'?d:{};check(GUIDE_KINDS.includes(d.kind),'Choose the kind of note.');const title=text(d.title,120,'the title');check(title,'Write a title.');const body=text(d.body,1200,'the text');check(body,'Write the text.');
 const url=text(d.url,300,'the link');check(!url||/^https:\/\/[^\s]+$/.test(url),'Use a full https link.');return {kind:d.kind,title,body,action:text(d.action,300,'the next step'),source:text(d.source,160,'the source'),url,date:isDay(d.date)?d.date:''};}
function apptData(d){d=d&&typeof d==='object'?d:{};check(isDay(d.date)&&d.date>='2000-01-01','Choose the date.');check(d.time===undefined||d.time===null||d.time===''||isTime(d.time),'Choose a valid time.');check(APPT_KINDS.includes(d.kind),'Choose what the visit is for.');
 const title=text(d.title,80,'the title');check(title,'Write what the visit is.');return {date:d.date,time:d.time||'',kind:d.kind,title,doctor:text(d.doctor,80,'the doctor'),place:text(d.place,80,'the place'),note:text(d.note,300,'the note'),remind:d.remind!==false};}
function paperData(d){d=d&&typeof d==='object'?d:{};check(isStoryDate(d.date),'Choose the paper’s date (a year is enough).');check(PAPER_KINDS.includes(d.kind),'Choose what the paper is.');const title=text(d.title,80,'the title');check(title,'Write a short title.');return {date:d.date,kind:d.kind,title,note:text(d.note,300,'the note')};}
function milestoneData(d){
 d=d&&typeof d==='object'?d:{};check(isStoryDate(d.date),'Choose the date (a year is enough).');check(STORY_KINDS.includes(d.kind),'Choose what it is about.');
 const title=text(d.title,80,'the title');check(title,'Write a short title.');
 return {date:d.date,kind:d.kind,title,note:text(d.note,400,'the note'),paper:text(d.paper,80,'the paper name'),historical:d.historical===true};
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
 }else if(type==='care.paper.add'){
  care.papers??=[];check(typeof d.id==='string'&&/^[\w-]{8,64}$/.test(d.id)&&!care.papers.some(x=>x.id===d.id),'Invalid paper.');check(PAPER_TYPES.includes(d.mime),'Use a photo or a PDF.');check(Number.isInteger(d.size)&&d.size>0,'Invalid paper.');check(care.papers.length<LIMITS.papers,'Too many papers.');
  care.papers.push({id:d.id,...paperData(d),mime:d.mime,size:d.size,addedBy:who,addedAt:now,revision:1});result={ok:true,id:d.id};
 }else if(type==='care.paper.save'){
  care.papers??=[];const old=care.papers.find(x=>x.id===d.id);check(old,'Paper not found.',404);check(old.revision===d.revision,'This paper changed. Reopen it to edit.',409);care.papers[care.papers.indexOf(old)]={...old,...paperData(d),revision:old.revision+1};
 }else if(type==='care.paper.delete'){
  care.papers??=[];const old=care.papers.find(x=>x.id===d.id);check(old,'Paper not found.',404);check(old.revision===d.revision,'This paper changed. Reopen it first.',409);care.papers=care.papers.filter(x=>x.id!==old.id);result={ok:true,deleted:old.id};
 }else if(type==='care.appt.save'){
  care.appointments??=[];const old=d.id?care.appointments.find(a=>a.id===d.id):null;check(!d.id||old,'Appointment not found.',404);if(old)check(old.revision===d.revision,'This appointment changed. Reopen it to edit.',409);check(old||care.appointments.length<LIMITS.appointments,'Too many appointments.');
  const a={id:old?.id??randomUUID(),...apptData(d),addedBy:old?.addedBy??who,revision:(old?.revision??0)+1};if(old)care.appointments[care.appointments.indexOf(old)]=a;else care.appointments.push(a);result={ok:true,id:a.id};
 }else if(type==='care.appt.delete'){
  care.appointments??=[];const old=care.appointments.find(a=>a.id===d.id);check(old,'Appointment not found.',404);check(old.revision===d.revision,'This appointment changed. Reopen it first.',409);care.appointments=care.appointments.filter(a=>a.id!==old.id);
 }else if(type==='care.breast.save'){
  const m=d.intervalMonths===null||d.intervalMonths===''||d.intervalMonths===undefined?null:d.intervalMonths;check(m===null||(Number.isInteger(m)&&m>=1&&m<=60),'Choose 1 to 60 months.');care.breast={intervalMonths:m,lastOn:isDay(d.lastOn)?d.lastOn:(care.breast?.lastOn??'')};
 }else if(type==='care.guide.import'){
  care.guide??=[];check(Array.isArray(d.guide)&&d.guide.length>0&&d.guide.length<=LIMITS.guide,'Import between 1 and '+LIMITS.guide+' notes.');
  const seen=new Set(care.guide.map(g=>g.title.toLowerCase()));let added=0,skipped=0;
  for(const r of d.guide.map(guideData)){if(seen.has(r.title.toLowerCase())){skipped++;continue;}check(care.guide.length<LIMITS.guide,'Too many notes.');seen.add(r.title.toLowerCase());care.guide.push({id:randomUUID(),...r,addedBy:who,revision:1});added++;}
  result={ok:true,added,skipped};
 }else if(type==='care.guide.delete'){
  care.guide??=[];const old=care.guide.find(g=>g.id===d.id);check(old,'Note not found.',404);check(old.revision===d.revision,'This note changed. Reopen it first.',409);care.guide=care.guide.filter(g=>g.id!==old.id);
 }else if(type==='care.milestone.save'){
  care.milestones??=[];const old=d.id?care.milestones.find(m=>m.id===d.id):null;check(!d.id||old,'Story step not found.',404);if(old)check(old.revision===d.revision,'This step changed. Reopen it to edit.',409);check(old||care.milestones.length<LIMITS.milestones,'The story is full.');
  const data=milestoneData(d);const m={id:old?.id??randomUUID(),...data,addedBy:old?.addedBy??who,revision:(old?.revision??0)+1,editedBy:old?who:null};
  if(old)care.milestones[care.milestones.indexOf(old)]=m;else care.milestones.push(m);result={ok:true,id:m.id};
 }else if(type==='care.milestones.import'){
  care.milestones??=[];check(Array.isArray(d.milestones)&&d.milestones.length>0&&d.milestones.length<=LIMITS.import,'Import between 1 and '+LIMITS.import+' story steps.');check(care.milestones.length+d.milestones.length<=LIMITS.milestones,'The story is full.');
  const seen=new Set(care.milestones.map(m=>m.date+'|'+m.title.toLowerCase()));let added=0,skipped=0;
  for(const r of d.milestones.map(milestoneData)){const k=r.date+'|'+r.title.toLowerCase();if(seen.has(k)){skipped++;continue;}seen.add(k);care.milestones.push({id:randomUUID(),...r,addedBy:who,revision:1,editedBy:null});added++;}
  result={ok:true,added,skipped};
 }else if(type==='care.milestone.delete'){
  care.milestones??=[];const old=care.milestones.find(m=>m.id===d.id);check(old,'Story step not found.',404);check(old.revision===d.revision,'This step changed. Reopen it first.',409);care.milestones=care.milestones.filter(m=>m.id!==old.id);
 }else if(type==='care.doctor.save'){
  care.doctors??=[];const old=d.id?care.doctors.find(m=>m.id===d.id):null;check(!d.id||old,'Doctor not found.',404);if(old)check(old.revision===d.revision,'This doctor changed. Reopen it to edit.',409);check(old||care.doctors.length<LIMITS.doctors,'Too many doctors.');
  const specialty=text(d.specialty,60,'the specialty');check(specialty,'Write the specialty.');
  const doc={id:old?.id??randomUUID(),specialty,name:text(d.name,80,'the name'),phone:text(d.phone,40,'the phone'),note:text(d.note,200,'the note'),revision:(old?.revision??0)+1};
  if(old)care.doctors[care.doctors.indexOf(old)]=doc;else care.doctors.push(doc);result={ok:true,id:doc.id};
 }else if(type==='care.doctor.delete'){
  care.doctors??=[];const old=care.doctors.find(m=>m.id===d.id);check(old,'Doctor not found.',404);check(old.revision===d.revision,'This doctor changed. Reopen it first.',409);care.doctors=care.doctors.filter(m=>m.id!==old.id);
 }else if(type==='care.crohn.save'){
  care.crohn={treatment:text(d.treatment,200,'the treatment')};
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
 // Ferritin inside the lab's range can still mean low iron when transferrin saturation is under 20% (ferritin under 100 with low saturation).
 const fer=tests.find(t=>t.key==='ferritin'),sat=tests.find(t=>t.key==='transferrin saturation');
 if(fer?.latest&&sat?.latest&&fer.status==='in'&&fer.latest.value<100&&sat.latest.value<20&&Math.abs(Date.parse(fer.latest.date)-Date.parse(sat.latest.date))<=31*86400000)
  fer.caution={satValue:sat.latest.valueText,satDate:sat.latest.date};
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
  return {day,logged:list.length>0,bellyLogged:belly.length>0,pain:pains.length?Math.max(...pains):null,diarrhea:diar.length?diar.includes(true):null,bathroom:bath.length?bath.reduce((n,e)=>n+e.data.count,0):null,sleepHours:sleepHours(week.map(x=>x.e),day,zone,now),energy:list.find(e=>e.kind==='checkin'&&Number.isInteger(e.data.energy))?.data.energy??null,moods:[...new Set(list.filter(e=>e.kind==='checkin').flatMap(e=>e.data.moods))]};
 });
 let flare={active:false,since:null,lastEnd:null,lastStart:null,logged:false};
 for(const f of mine.filter(e=>e.kind==='flare').reverse()){flare.logged=true;if(f.data.state==='start'){flare.active=true;flare.since=f.occurredAt;flare.lastStart=f.occurredAt;}else{flare.active=false;flare.since=null;flare.lastEnd=f.occurredAt;}}
 const todayList=week.filter(x=>x.day===today).map(x=>x.e);
 const todayBelly=todayList.find(e=>e.kind==='belly')??null;
 const lastCheckin=mine.find(e=>e.kind==='checkin'||e.kind==='belly')??null;
 const labs=labsView(care),allDoses=mine.filter(e=>e.kind==='dose'),meds=medsView(care,todayList.filter(e=>e.kind==='dose'),allDoses,today);
 const attention=[...labs.filter(t=>t.latest&&outside(t)&&t.trend==='away').map(t=>({type:'lab',key:t.key,test:t.test,status:t.status,direction:t.direction})),...meds.filter(m=>m.scheduledToday&&!m.doneToday).map(m=>({type:'dose',id:m.id,name:m.name,times:m.pendingToday}))];
 const recent=mine.filter(e=>e.occurredAt>=now-LIMITS.recentDays*DAY).slice(0,LIMITS.recentMax);
 const medWeek=meds.map(m=>({id:m.id,days:days.map(d=>({day:d.day,status:week.filter(x=>x.day===d.day&&x.e.kind==='dose'&&x.e.data.med===m.id).map(x=>x.e.data.status)}))}));
 const view={zone,today,medWeek,serverNow:now,canPrivate:who==='Safy',entries:recent.map(e=>strip(e,who)),olderEntries:mine.length>recent.length,week:days,flare,todayBelly:todayBelly&&strip(todayBelly,who),todayBathroom:days[6].bathroom??0,lastCheckin:lastCheckin&&strip(lastCheckin,who),labs,keyLabs:KEY_LABS.map(k=>labs.find(t=>t.latest&&(t.key===k||t.key.startsWith(k+' ')))).filter(Boolean),attention,improving:labs.filter(t=>t.latest&&outside(t)&&t.trend==='better').map(t=>t.test),unchanged:labs.filter(t=>t.latest&&outside(t)&&t.trend==='same').map(t=>t.test),meds,cases:care.cases??[],milestones:[...(care.milestones??[])].sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title)).map(({id,date,kind,title,note,paper,historical,revision,addedBy})=>({id,date,kind,title,note,paper,historical,revision,addedBy})),doctors:(care.doctors??[]).map(({id,specialty,name,phone,note,revision})=>({id,specialty,name,phone,note,revision})),crohn:{treatment:care.crohn?.treatment??''},papers:[...(care.papers??[])].sort((a,b)=>b.date.padEnd(10,'z').localeCompare(a.date.padEnd(10,'z'))||a.title.localeCompare(b.title)).map(({id,date,kind,title,note,mime,size,revision,addedBy})=>({id,date,kind,title,note,mime,size,revision,addedBy})),appointments:[...(care.appointments??[])].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(({id,date,time,kind,title,doctor,place,note,remind,revision})=>({id,date,time,kind,title,doctor,place,note,remind,revision})),breast:{intervalMonths:care.breast?.intervalMonths??null,lastOn:care.breast?.lastOn??''},guide:(care.guide??[]).map(({id,kind,title,body,action,source,url,date,revision})=>({id,kind,title,body,action,source,url,date,revision}))};
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
 return {format:'our-place-care-v1',zone:careZone(s),entries:care.entries.filter(e=>visible(e,who)).sort((a,b)=>a.occurredAt-b.occurredAt).map(e=>({...strip(e,who),history:e.history.filter(h=>h.visibility==='shared'||who==='Safy')})),labs:care.labs,meds:care.meds,milestones:care.milestones??[],doctors:care.doctors??[],crohn:care.crohn??{treatment:''},guide:care.guide??[],papers:(care.papers??[]).map(({id,date,kind,title,note,mime,size})=>({id,date,kind,title,note,mime,size})),appointments:care.appointments??[],breast:care.breast??{intervalMonths:null}};
}

// Import a private seed (labs and story steps) supplied by the host. Same rules as the in-app import.
export function careSeedFromEnv(s,raw,now=Date.now()){
 const buf=Buffer.from(raw.trim(),'base64');const data=JSON.parse((buf[0]===0x1f&&buf[1]===0x8b?gunzipSync(buf):buf).toString('utf8'));let added=0,skipped=0;
 const before=JSON.stringify([s.care?.labs?.length??0,s.care?.milestones?.length??0,s.care?.guide?.length??0]);
 for(let i=0;i<(data.labs??[]).length;i+=LIMITS.import){const r=careChange(s,'Mahmoud','care.labs.import',{labs:data.labs.slice(i,i+LIMITS.import)},now);added+=r.added;skipped+=r.skipped;}
 for(let i=0;i<(data.milestones??[]).length;i+=LIMITS.import){const r=careChange(s,'Mahmoud','care.milestones.import',{milestones:data.milestones.slice(i,i+LIMITS.import)},now);added+=r.added;skipped+=r.skipped;}
 for(const u of data.updates?.guide??[]){const g=s.care?.guide?.find(x=>x.title===u.match);if(!g){skipped++;continue;}const next={...g,...guideData({...g,...u}),revision:g.revision+1};if(JSON.stringify(next)!==JSON.stringify({...g,revision:g.revision+1})){Object.assign(g,next);added++;}else skipped++;}
 for(const u of data.updates?.milestones??[]){const m=s.care?.milestones?.find(x=>x.date===u.matchDate&&x.title===u.matchTitle);if(!m){skipped++;continue;}const {matchDate,matchTitle,...rest}=u;const next=milestoneData({...m,...rest});if(Object.keys(next).every(k=>JSON.stringify(next[k])===JSON.stringify(m[k]))){skipped++;continue;}Object.assign(m,next,{revision:m.revision+1});added++;}
 for(const u of data.updates?.labs??[]){const l=s.care?.labs?.find(x=>labKey(x.test)===labKey(u.matchTest)&&x.date===u.matchDate);if(!l){skipped++;continue;}const {matchTest,matchDate,...rest}=u;const next=labData({...l,...rest});if(Object.keys(next).every(k=>JSON.stringify(next[k])===JSON.stringify(l[k]))){skipped++;continue;}
  l.history=[...(l.history??[]),{value:l.value,valueText:l.valueText,unit:l.unit,lo:l.lo,hi:l.hi,rangeText:l.rangeText,flag:l.flag,date:l.date,source:l.source,verified:l.verified,editedBy:'Mahmoud',editedAt:now}].slice(-LIMITS.history);Object.assign(l,next,{revision:l.revision+1,editedBy:'Mahmoud'});added++;}
 for(const k of data.cases??[]){check(k&&typeof k.id==='string'&&/^[\w-]{2,40}$/.test(k.id),'Invalid case.');check(JSON.stringify(k).length<20000,'Case too long.');s.care??={};s.care.cases??=[];const old=s.care.cases.find(x=>x.id===k.id);const next={...k,photos:old?.photos??[]};if(old&&JSON.stringify(old)===JSON.stringify(next)){skipped++;continue;}if(old)s.care.cases[s.care.cases.indexOf(old)]=next;else s.care.cases.push(next);added++;}
 if((data.guide??[]).length){const r=careChange(s,'Mahmoud','care.guide.import',{guide:data.guide},now);added+=r.added;skipped+=r.skipped;}
 return {added,skipped,changed:added>0};
}

// Reminders the evening before each appointment (19:00 in Safy's time zone, or right away if added later that evening).
export function careReminders(s,now=Date.now()){
 const care=s.care;if(!care?.appointments?.length)return [];const zone=careZone(s),today=localDay(now,zone),tomorrow=addDays(today,1),out=[];
 const evening=instant(today,'19:00',zone);if(now<evening)return out;
 for(const a of care.appointments){if(a.remind===false||a.date!==tomorrow)continue;const when=a.time?' at '+a.time:'';const what=a.title+(a.doctor?' with '+a.doctor:'');
  out.push({key:'care:appt:'+a.id+':'+a.date+(a.time||'')+':Safy',to:'Safy',body:'Tomorrow'+when+': '+what+'.'});
  out.push({key:'care:appt:'+a.id+':'+a.date+(a.time||'')+':Mahmoud',to:'Mahmoud',body:'Safy has '+what+' tomorrow'+when+'.'});}
 return out;
}
