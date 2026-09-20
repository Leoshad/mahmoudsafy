import {randomUUID} from 'node:crypto';
import {check,names} from './domain.mjs';
const DAY=86400000;
export const ZONES=['Africa/Cairo','Asia/Riyadh','UTC'];
export const FRAMES=[
 ['bad-mood','Bad Mood','☁','#9992c5'],['unwell','Feeling Unwell','🩹','#92cbb7'],['tired','Feeling Tired','☾','#91acd3'],['space','Need Some Space','☾','#b8a0db'],['busy','Overwhelmed & Busy','⌛','#d6a273'],['good','Good Mood','☁','#efcc79'],['birthday','Birthday Mode','🕯','#ed9ebd'],['women','Women’s Day','♀','#ce91d6'],['awareness','Breast Cancer Awareness','🎗︎','#ef8fb8'],['hug','Need a Hug','♥','#ef9cbc'],['miss','I Miss You','♥','#dba0db'],['upset','Upset With You','☹','#c685a3']
].map(([id,label,symbol,color])=>({id,label,symbol,color}));
function frameView(v,now){const manual=v.frame&&(!v.frameUntil||v.frameUntil>now)?v.frame:'none',zone=v.zone||'Africa/Cairo',today=localDay(now,zone);const birthday=v.birthday&&occurrence({date:v.birthday},Number(today.slice(0,4)))===today;return {frame:manual!=='none'?manual:(v.autoBirthday!==false&&birthday?'birthday':'none'),frameChoice:manual,frameUntil:v.frameUntil??null,autoBirthday:v.autoBirthday!==false};}
const empty=()=>({profiles:{},dates:[],preferences:{Mahmoud:{},Safy:{}},read:{Mahmoud:[],Safy:[]}});
const clean=(v,max)=>{check(typeof v==='string'&&v.trim().length<=max,'Please shorten this field.');return v.trim();};
function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
function localDay(now,zone){const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=k=>p.find(x=>x.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;}
export function instant(day,time,zone){const target=Date.parse(day+'T'+time+':00Z');let value=target;for(let i=0;i<4;i++){const p=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value),get=k=>p.find(x=>x.type===k).value;const wall=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);const diff=target-wall;if(!diff)break;value+=diff;}return value;}
function occurrence(e,year){const raw=year+e.date.slice(4);return validDate(raw)?raw:`${year}-02-28`;}
function allDates(p){return [...p.dates,...names.filter(n=>p.profiles[n]?.birthday).map(n=>{const v=p.profiles[n];return {id:'birthday:'+n,title:n+'’s birthday',date:'2000'+v.birthday.slice(4),time:'09:00',zone:v.zone,annual:true,person:n,visibility:'shared',creator:n,revision:v.birthdayRevision??1,createdAt:v.birthdaySince,birthday:true};})];}
function nextDate(e,now){if(!e.annual)return e.date;const today=localDay(now,e.zone),year=Number(today.slice(0,4)),d=occurrence(e,year);return d>=today?d:occurrence(e,year+1);}
const visible=(e,who)=>e.visibility==='shared'||e.creator===who;
function prefs(p,e,who){return p.preferences[who][e.id]??{offsets:e.birthday?[0]:[],note:'',since:e.createdAt,revision:0};}
function reminders(p,who,now){const result=[];for(const e of allDates(p).filter(e=>visible(e,who))){const pref=prefs(p,e,who);const year=Number(localDay(now,e.zone).slice(0,4));const dates=e.annual?[year-1,year,year+1].map(y=>occurrence(e,y)):[e.date];for(const day of dates)for(const offset of pref.offsets){const reminderDay=new Date(Date.parse(day)-offset*DAY).toISOString().slice(0,10),at=instant(reminderDay,e.time||'09:00',e.zone);const key=[e.id,e.revision,pref.scheduleRevision??0,day,offset].join('/');if(at<=now&&at>=now-30*DAY&&at>=pref.since&&!p.read[who].includes(key))result.push({key,id:e.id,title:e.title,date:day,time:e.time,zone:e.zone,offset,at,note:pref.note});}}return result.sort((a,b)=>b.at-a.at);}
export function personalSnapshot(s,who,now=Date.now()){
 check(names.includes(who),'Not allowed.',403);const p=s.personal??empty();
 const profiles=Object.fromEntries(names.map(n=>{const v=p.profiles[n]??{},birthday=v.birthday;const today=localDay(now,v.zone||'Africa/Cairo');const age=birthday?Number(today.slice(0,4))-Number(birthday.slice(0,4))-(today.slice(5)<birthday.slice(5)?1:0):null;return [n,{name:n,...frameView(v,now),bio:v.bio??'',photo:v.photo??null,birthdayMonthDay:birthday?.slice(5)??null,age:birthday&&(who===n||v.showAge)?age:null,...(who===n?{birthday:birthday??'',showAge:v.showAge??true,zone:v.zone??'Africa/Cairo',revision:v.revision??0}:{})}];}));
 const dates=allDates(p).filter(e=>visible(e,who)).map(e=>({...e,nextDate:nextDate(e,now),preferences:prefs(p,e,who)})).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
 return {profiles,frames:FRAMES,dates,reminders:reminders(p,who,now),zones:ZONES};
}
export function personalChange(s,who,type,d,now=Date.now()){
 check(names.includes(who),'Not allowed.',403);const p=s.personal??=empty();
 if(type==='personal.frame'){
  check(!d.name||d.name===who,'Only the owner can edit this profile.',403);const old=p.profiles[who]??{revision:0};check(d.revision===old.revision,'Profile changed. Reopen it to edit the latest version.',409);
  check(d.frame==='none'||FRAMES.some(f=>f.id===d.frame),'Choose a valid frame.');check(['two-hours','today','always'].includes(d.duration),'Choose a frame duration.');check(typeof d.autoBirthday==='boolean','Choose the birthday setting.');
  const zone=old.zone||'Africa/Cairo',tomorrow=new Date(Date.parse(localDay(now,zone))+DAY).toISOString().slice(0,10);
  p.profiles[who]={...old,revision:old.revision+1,frame:d.frame,frameUntil:d.frame==='none'||d.duration==='always'?null:d.duration==='two-hours'?now+7200000:instant(tomorrow,'00:00',zone),autoBirthday:d.autoBirthday};
 }else if(type==='personal.profile'){
  check(!d.name||d.name===who,'Only the owner can edit this profile.',403);const old=p.profiles[who]??{revision:0};check(d.revision===old.revision,'Profile changed. Reopen it to edit the latest version.',409);
  check(ZONES.includes(d.zone),'Choose a time zone.');const birthday=d.birthday||'';check(!birthday||(validDate(birthday)&&birthday>='1900-01-01'&&birthday<=localDay(now,d.zone||'Africa/Cairo')),'Choose a valid birthday.');check(ZONES.includes(d.zone),'Choose a time zone.');check(typeof d.showAge==='boolean','Choose whether to show your age.');check(!d.photo||typeof d.photo==='string','Invalid photo.');
  p.profiles[who]={...old,bio:clean(d.bio??'',180),birthday,showAge:d.showAge,zone:d.zone,photo:d.photo||null,revision:old.revision+1,birthdaySince:old.birthday===birthday&&old.zone===d.zone?old.birthdaySince:now,birthdayRevision:(old.birthdayRevision??0)+(old.birthday===birthday&&old.zone===d.zone?0:1)};
 }else if(type==='personal.date.save'){
  const old=d.id?p.dates.find(e=>e.id===d.id):null;check(!d.id||old,'Occasion not found.',404);if(old){check(old.creator===who,'Only its creator can edit this occasion.',403);check(old.revision===d.revision,'Occasion changed. Reopen it to edit.',409);}check(old||p.dates.length<200,'You have reached 200 occasions.');
  check(validDate(d.date)&&d.date>='1900-01-01'&&d.date<='2200-12-31','Choose a valid date.');check(!d.time||/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time),'Choose a valid time.');check(ZONES.includes(d.zone),'Choose a time zone.');check([...names,'Both'].includes(d.person),'Choose who this is for.');check(['private','shared'].includes(d.visibility),'Choose who can see this occasion.');check(typeof d.annual==='boolean','Choose the repeat setting.');const title=clean(d.title??'',100);check(title,'Give this occasion a name.');
  const e={id:old?.id??randomUUID(),title,date:d.date,time:d.time||'',zone:d.zone,annual:d.annual,person:d.person,visibility:d.visibility,creator:who,revision:(old?.revision??0)+1,createdAt:old?.createdAt??now};
  if(old)p.dates[p.dates.indexOf(old)]=e;else p.dates.push(e);
  // Creation can invite both to reminders; later edits never override another person's preferences.
  if(!old){const offsets=validateOffsets(d.offsets??[0]);for(const n of e.visibility==='shared'&&d.notifyBoth===true?names:[who])p.preferences[n][e.id]={offsets,note:n===who?clean(d.note??'',500):'',since:now,revision:1};}
  s.version++;return {ok:true,id:e.id};
 }else if(type==='personal.date.delete'){
  const e=p.dates.find(e=>e.id===d.id);check(e,'Occasion not found.',404);check(e.creator===who,'Only its creator can delete this occasion.',403);check(e.revision===d.revision,'Occasion changed. Reopen it first.',409);p.dates=p.dates.filter(x=>x.id!==e.id);for(const n of names)delete p.preferences[n][e.id];
 }else if(type==='personal.reminder.save'){
  const e=allDates(p).find(e=>e.id===d.id&&visible(e,who));check(e,'Occasion not found.',404);const old=prefs(p,e,who);check(d.revision===old.revision,'Reminder changed. Reopen it first.',409);const offsets=validateOffsets(d.offsets).slice().sort((a,b)=>a-b),changed=JSON.stringify(old.offsets.slice().sort((a,b)=>a-b))!==JSON.stringify(offsets);p.preferences[who][e.id]={offsets,note:clean(d.note??'',500),since:changed?now:old.since,revision:old.revision+1,scheduleRevision:(old.scheduleRevision??0)+(changed?1:0)};
 }else if(type==='personal.reminder.read'){
  check(Array.isArray(d.keys)&&d.keys.length<=100,'Invalid reminders.');const due=new Set(reminders(p,who,now).map(r=>r.key));check(d.keys.every(k=>due.has(k)||p.read[who].includes(k)),'Reminder not found.',404);p.read[who]=[...new Set([...p.read[who],...d.keys])].slice(-2000);
 }else check(false,'Unknown personal action.');s.version++;return {ok:true};
}
function validateOffsets(v){check(Array.isArray(v)&&v.length<=3&&v.every(n=>[0,1,7].includes(n))&&new Set(v).size===v.length,'Choose on the day, one day or one week before.');return v;}
