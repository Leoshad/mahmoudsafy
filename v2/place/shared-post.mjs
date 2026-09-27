import {check} from './domain.mjs';

export function validateActivity(a){
 check(a&&['case','puzzle'].includes(a.kind)&&['easy','medium','hard'].includes(a.difficulty),'Invalid shared activity.');
 const clean=(v,max)=>{check(typeof v==='string'&&v.trim().length>0&&v.length<=max,'Incomplete activity content.');return v.trim();};
 check(Array.isArray(a.hints)&&a.hints.length===3,'An activity needs three progressive hints.');
 return {kind:a.kind,difficulty:a.difficulty,hints:a.hints.map(v=>clean(v,500)),answer:clean(a.answer,1000),explanation:clean(a.explanation,2000)};
}

export function publicPost(item,who){
 const {activity,...post}=item;if(!activity)return post;
 const seen=activity.progress?.[who]??{hints:0,revealed:false};
 post.play={kind:activity.kind,difficulty:activity.difficulty,hints:activity.hints.slice(0,seen.hints),...(seen.revealed?{answer:activity.answer,explanation:activity.explanation}:{})};return post;
}
