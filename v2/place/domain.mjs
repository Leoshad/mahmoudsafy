import {randomUUID} from 'node:crypto';

export class Fault extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const names=['Mahmoud','Safy'];
export const categories=['Idea','Plan','Decision','Agreement','Discussion','Photo','Result'];
export function check(ok,message,status=400){if(!ok)throw new Fault(message,status);}
export function text(value,max=2000){check(typeof value==='string'&&value.trim().length>0&&value.length<=max,'Please check the text length.');return value.trim();}
export function questions(raw){
  check(Array.isArray(raw)&&raw.length>0&&raw.length<=10,'Use 1–10 questions.');
  return raw.map(v=>{const q=text(v.q,500),options=v.options??[];check(Array.isArray(options)&&(options.length===0||(options.length>=2&&options.length<=4)),'Use 2–4 options or a free response.');const opts=options.map(o=>text(o,200));const correct=v.correct??-1;check(Number.isInteger(correct)&&correct>=-1&&correct<opts.length,'Choose an existing correct option.');return {q,options:opts,correct};});
}
export function initial(){return {version:0,pauses:[],drafts:{Mahmoud:[],Safy:[]},activity:null,items:[]};}
export function publicActivity(a,who){
  if(!a)return null;
  const {qs,...visible}=a;
  // Solutions and future questions never leave the server, even for the author after launch.
  return {...visible,total:qs.length,max:qs.filter(q=>q.correct>=0).length,current:a.status==='active'?{q:qs[a.index].q,options:qs[a.index].options}:null};
}
export function project(s,who){return {version:s.version,pauses:s.pauses,draft:s.drafts[who],activity:publicActivity(s.activity,who),activities:(s.activities??(s.activity?[s.activity]:[])).map(a=>publicActivity(a,who)),items:s.items,echoInvited:!!s.echoInvited,pins:s.pins??[]};}
export function change(s,who,type,p={}){
  check(names.includes(who),'Not invited.',403);
  s.activities??=s.activity?[s.activity]:[];
  const selected=()=>s.activities.find(a=>a.id===(p.activity??s.activity?.id));
  const addActivity=a=>{s.activities=s.activities.filter(x=>x.status==='active').concat(s.activities.filter(x=>x.status!=='active').slice(-20));s.activities.push(a);s.activity=a;};

  switch(type){
    case 'echo.invite': check(typeof p.value==='boolean','Choose on or off.');if(p.value)check(!s.pauses.length,'Echo is paused. Resume permissions first.',409);s.echoInvited=p.value;break;
    case 'item.delete': {const i=s.items.find(i=>i.id===p.id);check(i&&i.revision===p.revision,'This item changed. Refresh before deleting.',409);s.items=s.items.filter(i=>i.id!==p.id);break;}
    case 'message.pin': {
      check(typeof p.id==='string'&&typeof p.value==='boolean','Invalid pin.');
      s.pins??=[];
      if(p.value&&!s.pins.some(x=>x.id===p.id)){check(s.pins.length<10,'Unpin a message first. You can keep 10 pinned messages.');s.pins.push({id:p.id,text:text(p.text,4000),author:text(p.author,40),by:who});}
      if(!p.value)s.pins=s.pins.filter(x=>x.id!==p.id);break;
    }
    case 'pause': if(p.value)s.echoInvited=false;s.pauses=p.value?[...new Set([...s.pauses,who])]:s.pauses.filter(x=>x!==who);break;
    case 'draft.save': s.drafts[who]=p.questions.length?questions(p.questions):[];break;
    case 'quiz.launch': {
      check(s.activities.filter(a=>a.status==='active').length<10,'Finish an activity before starting more than 10.',409);
      check(names.includes(p.target),'Choose Mahmoud or Safy.');
      const qs=questions(p.questions);addActivity({id:randomUUID(),owner:who,target:p.target,qs,index:0,answers:[],score:0,pauses:[],status:'active',afterSequence:p.afterSequence??0,title:p.title||'Quiz'});break;
    }
    case 'quiz.start': {
      check(s.activities.filter(a=>a.status==='active').length<10,'Finish an activity before starting more than 10.',409);
      const qs=questions(s.drafts[who]);addActivity({id:randomUUID(),owner:who,target:names.find(n=>n!==who),qs,index:0,answers:[],score:0,pauses:[],status:'active',afterSequence:p.afterSequence??0,title:'Private quiz'});break;
    }
    case 'quiz.pause': {const a=selected();check(a?.status==='active','No active quiz.',409);a.pauses=p.value?[...new Set([...a.pauses,who])]:a.pauses.filter(n=>n!==who);break;}
    case 'quiz.answer': {
      const a=selected();check(a?.status==='active'&&a.id===p.activity&&a.index===p.index,'This question has changed.',409);
      check(who===a.target,'This question is for your partner.',403);check(!a.pauses.length&&!s.pauses.length,'The activity is paused.',409);
      const q=a.qs[a.index];let answer;
      if(q.options.length){check(Number.isInteger(p.option)&&p.option>=0&&p.option<q.options.length,'Choose an option.');answer=q.options[p.option];if(q.correct===p.option)a.score++;}
      else answer=text(p.answer,1000);
      a.answers.push({q:q.q,answer,by:who});a.index++;a.afterSequence=p.afterSequence??a.afterSequence;if(a.index===a.qs.length){a.status='completed';archive(s,a,who);}break;
    }
    case 'quiz.end': {const a=selected();check(a?.status==='active','No active quiz.',409);a.status='abandoned';archive(s,a,who);break;}
    case 'item.save': {
      check(categories.includes(p.type),'Choose a category.');const title=text(p.title,5000);
      const item=p.id?s.items.find(i=>i.id===p.id):null;
      if(p.id)check(item&&item.revision===p.revision,'This item changed. Reopen it before saving.',409);
      check(!p.image||typeof p.image==='string'&&/^[a-f0-9-]{36}$/.test(p.image),'Invalid photo.');
      if(item){item.title=title;item.type=p.type;item.approvals=[];item.revision++;item.aiAllowed=!!p.aiAllowed;}
      else {check(s.items.length<500,'Your space is full. Export a backup before adding more.',409);s.items.unshift({id:randomUUID(),type:p.type,title,by:who,image:p.image??null,source:p.source??null,done:false,approvals:[],revision:1,aiAllowed:!!p.aiAllowed,createdAt:new Date().toISOString()});}break;
    }
    case 'item.approve': case 'item.done': {
      const i=s.items.find(i=>i.id===p.id);check(i&&i.revision===p.revision,'This item changed. Please refresh.',409);
      if(type==='item.approve'){check(i.type==='Agreement','Only agreements need approval.');i.approvals=p.value?[...new Set([...i.approvals,who])]:i.approvals.filter(n=>n!==who);}
      else {check(['Plan','Discussion'].includes(i.type),'This item has no completion status.');i.done=!!p.value;}i.revision++;break;
    }
    default: throw new Fault('Unknown action.');
  }
  if(s.activity)s.activity=s.activities.find(a=>a.id===s.activity.id)??s.activity;s.version++;return s;
}
function archive(s,a,who){s.items.unshift({id:randomUUID(),type:'Result',title:`Quiz by ${a.owner} for ${a.target} · ${a.status}\n${a.answers.map(v=>v.q+' → '+v.answer).join('\n')}\n${a.score} points`,by:who,source:a.id,status:a.status,done:a.status==='completed',approvals:[],revision:1,aiAllowed:false,createdAt:new Date().toISOString()});}

