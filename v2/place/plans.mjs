import {randomUUID} from 'node:crypto';
const people=['Mahmoud','Safy'];
export function planLink(value,check){
 if(value==null||value==='')return '';
 check(typeof value==='string'&&value.length<=2000,'Use a link up to 2000 characters.');
 let url;try{url=new URL(value);}catch{}check(url&&['https:','http:'].includes(url.protocol)&&!url.username&&!url.password,'Use a valid HTTP or HTTPS link.');return url.href;
}
export function newPlan(by){return {responses:people.includes(by)?{[by]:{value:'yes',note:''}}:{},schedule:null};}
export function proposeTime(plan,who,value,check){
 const time=typeof value==='string'?Date.parse(value):NaN;
 check(Number.isFinite(time)&&time>Date.now(),'Choose a future day and time.');
 plan.schedule={id:randomUUID(),at:new Date(time).toISOString(),by:who,confirmed:[who]};
}
export function updatePlan(item,who,p,check,text){
 check(item?.type==='Plan','Choose a plan.',404);check(item.revision===p.revision,'This plan changed. Refresh and try again.',409);
 const plan=structuredClone(item.plan??newPlan(item.by));
 if(p.action==='respond'){
  check(['yes','alternative','later'].includes(p.value),'Choose a response.');
  const note=p.value==='alternative'?text(p.note,1000):'';
  plan.responses[who]={value:p.value,note};
  if(p.value!=='yes'&&plan.schedule)plan.schedule.confirmed=plan.schedule.confirmed.filter(n=>n!==who);
 }else if(p.action==='propose')proposeTime(plan,who,p.at,check);
 else if(p.action==='confirm'){
  check(plan.schedule&&plan.schedule.id===p.scheduleId,'The proposed time changed. Review it again.',409);
  check(Date.parse(plan.schedule.at)>Date.now(),'This time has passed. Propose another time.');
  check(people.every(n=>plan.responses[n]?.value==='yes'),'Both of you need to agree to the idea first.',409);
  plan.schedule.confirmed=[...new Set([...plan.schedule.confirmed,who])];
 }else check(false,'Choose a plan action.');
 plan.event={id:randomUUID(),by:who,action:p.action,value:p.value??null};item.plan=plan;item.revision++;
}
