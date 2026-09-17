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
export function initial(){return {version:0,pauses:[],activity:null,items:[]};}
export function publicActivity(a,who){
  if(!a)return null;
  const {qs,...visible}=a;
  // Solutions and future questions never leave the server, even for the author after launch.
  return {...visible,total:qs.length,max:qs.filter(q=>q.correct>=0).length,current:a.status==='active'?{q:qs[a.index].q,options:qs[a.index].options}:null};
}
export function project(s,who){return {version:s.version,pauses:s.pauses,activity:publicActivity(s.activity,who),activities:(s.activities??(s.activity?[s.activity]:[])).map(a=>publicActivity(a,who)),items:s.items,wallpaper:s.wallpaper??{image:null,revision:0},echoInvited:!!s.echoInvited,pins:s.pins??[]};}
export function change(s,who,type,p={}){
  check(names.includes(who),'Not invited.',403);
  s.activities??=s.activity?[s.activity]:[];
  const selected=()=>s.activities.find(a=>a.id===(p.activity??s.activity?.id));
  const addActivity=a=>{s.activities=s.activities.filter(x=>x.status==='active').concat(s.activities.filter(x=>x.status!=='active').slice(-20));s.activities.push(a);s.activity=a;};

  switch(type){
    case 'wallpaper.set': {
      const current=s.wallpaper??{image:null,revision:0};check(p.revision===current.revision,'The background changed. Reopen settings and try again.',409);
      check(p.image===null||typeof p.image==='string'&&/^[a-f0-9-]{36}$/.test(p.image),'Invalid background.');
      s.wallpaper={image:p.image,revision:current.revision+1};break;
    }
    case 'echo.invite': check(typeof p.value==='boolean','Choose on or off.');if(p.value)check(!s.pauses.length,'Echo is paused. Resume permissions first.',409);s.echoInvited=p.value;for(const a of s.activities)a.reactionsPaused=!p.value;break;
    case 'item.delete': {const i=s.items.find(i=>i.id===p.id);check(i&&i.revision===p.revision,'This item changed. Refresh before deleting.',409);s.items=s.items.filter(i=>i.id!==p.id);break;}
    case 'message.pin': {
      check(typeof p.id==='string'&&typeof p.value==='boolean','Invalid pin.');
      s.pins??=[];
      if(p.value&&!s.pins.some(x=>x.id===p.id)){check(s.pins.length<10,'Unpin a message first. You can keep 10 pinned messages.');s.pins.push({id:p.id,text:text(p.text,4000),author:text(p.author,40),by:who});}
      if(!p.value)s.pins=s.pins.filter(x=>x.id!==p.id);break;
    }
    case 'pause': if(p.value)s.echoInvited=false;s.pauses=p.value?[...new Set([...s.pauses,who])]:s.pauses.filter(x=>x!==who);break;
    case 'quiz.launch': {
      check(s.activities.filter(a=>a.status==='active').length<10,'Finish an activity before starting more than 10.',409);
      check(names.includes(p.target),'Choose Mahmoud or Safy.');
      const qs=questions(p.questions);addActivity({id:randomUUID(),owner:who,host:p.host==='Echo'?'Echo':who,target:p.target,qs,index:0,answers:[],score:0,pauses:[],status:'active',afterSequence:p.afterSequence??0,title:p.title||'Quiz'});break;
    }
    case 'quiz.pause': {const a=selected();check(a?.status==='active','No active quiz.',409);a.pauses=p.value?[...new Set([...a.pauses,who])]:a.pauses.filter(n=>n!==who);break;}
    case 'quiz.answer': {
      const a=selected();check(a?.status==='active'&&a.id===p.activity&&a.index===p.index,'This question has changed.',409);
      check(who===a.target,'This question is for your partner.',403);check(!a.pauses.length&&!s.pauses.length,'The activity is paused.',409);
      const q=a.qs[a.index];let answer;
      if(q.options.length){check(Number.isInteger(p.option)&&p.option>=0&&p.option<q.options.length,'Choose an option.');answer=q.options[p.option];if(q.correct===p.option)a.score++;}
      else answer=text(p.answer,1000);
      a.answers.push({q:q.q,answer,by:who});a.index++;a.afterSequence=p.afterSequence??a.afterSequence;if(a.index===a.qs.length){a.status='completed';}break;
    }
    case 'quiz.end': {const a=selected();check(a?.status==='active','No active quiz.',409);a.status='abandoned';break;}
    case 'quiz.share': {const a=selected();check(a&&a.status!=='active','Finish or end the round before sharing.',409);check(who===a.target,'Only the answering person can share this round.',403);if(!a.sharedPost){check(s.items.length<500,'Your space is full.',409);archive(s,a,who);}break;}
    case 'item.save': {
      check(categories.includes(p.type),'Choose a category.');
      const item=p.id?s.items.find(i=>i.id===p.id):null;
      if(p.id)check(item&&item.revision===p.revision,'This post changed. Reopen it before saving.',409);
      const images=p.images??(p.image?[p.image]:item?.images??(item?.image?[item.image]:[]));
      check(Array.isArray(images)&&images.length<=6&&images.every(v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)),'Choose up to 6 photos.');
      const title=p.title?.trim()?text(p.title,5000):images.length?'':text(p.title,5000);
      const raw=p.steps??item?.steps??[];
      check(Array.isArray(raw)&&raw.length<=30,'Use up to 30 steps.');
      const steps=raw.map(v=>({id:typeof v.id==='string'&&item?.steps?.some(x=>x.id===v.id)?v.id:randomUUID(),text:text(v.text,300),done:!!v.done}));
      if(item){if(item.title!==title){item.sources=[];item.publishedDate=null;}Object.assign(item,{title,type:p.type,images,image:images[0]??null,steps,approvals:[],aiAllowed:!!p.aiAllowed,updatedAt:new Date().toISOString()});if(p.type==='Plan'&&steps.length)item.done=steps.every(s=>s.done);item.revision++;}
      else {check(s.items.length<500,'Your space is full. Export a backup before adding more.',409);s.items.unshift({id:randomUUID(),type:p.type,title,by:who,images,image:images[0]??null,steps,source:p.source??null,done:false,approvals:[],revision:1,aiAllowed:!!p.aiAllowed,createdAt:new Date().toISOString()});}break;
    }
    case 'item.echo': case 'item.like': case 'item.pin': case 'item.comment': case 'item.comment.delete': case 'item.step': {
      const i=s.items.find(i=>i.id===p.id);check(i,'This post is no longer available.',404);
      if(type==='item.echo'){check(typeof p.value==='boolean','Choose whether Echo can join.');i.echoComments=p.value;i.echoEpoch=(i.echoEpoch??0)+1;}
      if(type==='item.like'){check(typeof p.value==='boolean','Choose like or unlike.');i.likes=(i.likes??[]).filter(n=>n!==who);if(p.value)i.likes.push(who);}
      if(type==='item.pin'){check(typeof p.value==='boolean','Choose pin or unpin.');check(!p.value||i.pinned||s.items.filter(x=>x.pinned).length<5,'Keep up to 5 pinned posts.');i.pinned=p.value;}
      if(type==='item.comment'){const value=text(p.text,1500);i.comments??=[];check(i.comments.length<200,'This post has reached 200 comments.');i.comments.push({id:randomUUID(),by:who,text:value,createdAt:new Date().toISOString()});}
      if(type==='item.comment.delete'){const c=i.comments?.find(c=>c.id===p.comment);check(c&&c.by===who,'You can only remove your own comment.',403);i.comments=i.comments.filter(c=>c.id!==p.comment);}
      if(type==='item.step'){check(i.type==='Plan'&&i.revision===p.revision,'This plan changed. Try again.',409);const step=i.steps?.find(x=>x.id===p.step);check(step&&typeof p.value==='boolean','Choose a plan step.');step.done=p.value;i.done=i.steps.every(x=>x.done);}
      i.revision++;break;
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
function archive(s,a,who){
 const max=a.qs.filter(q=>q.correct>=0).length,id=randomUUID();
 const summary=a.feedback?.findLast(f=>f.final&&f.status==='sent')?.text;
 s.items.unshift({id,type:'Result',title:[`${a.title||'Round'} · ${a.host||a.owner} → ${a.target}`,a.status==='completed'?'Completed':'Ended early',...a.answers.map(v=>v.q+' → '+v.answer),...(max?[`${a.score} / ${max} points`]:[]),...(summary?['Echo: '+summary]:[])].join('\n'),by:who,source:a.id,status:a.status,done:a.status==='completed',approvals:[],revision:1,aiAllowed:false,createdAt:new Date().toISOString()});a.sharedPost=id;
}
