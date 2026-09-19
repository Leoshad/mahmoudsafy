import {randomUUID} from 'node:crypto';
import {check,text,names} from './domain.mjs';
const other=n=>names.find(x=>x!==n),stamp=()=>new Date().toISOString();
const record=(c,by,kind,value,extra={})=>{const r={id:randomUUID(),by,kind,text:value,at:stamp(),...extra};c.records.push(r);return r;};
export function courtCase(s,id){const c=s.court?.cases.find(c=>c.id===id);check(c,'Case not found.',404);return c;}
const heard=c=>names.every(n=>c.statements[n]);
export function courtView(s,who){return {cases:(s.court?.cases??[]).map(c=>{const v=structuredClone(c);v.submitted=names.filter(n=>c.statements[n]);return v;})};}
export function courtChange(s,who,type,d){
 check(names.includes(who),'Not allowed.',403);s.court??={cases:[]};
 if(type==='court.create'){check(s.court.cases.length<100,'The case archive has reached 100 cases.');const c={id:randomUUID(),number:s.court.cases.length+1,title:text(d.title,100),issue:text(d.issue,1500),language:d.language==='Arabic'?'Arabic':'English',owner:who,stage:'invited',revision:1,round:1,createdAt:stamp(),updatedAt:stamp(),consent:[who],pauses:[],statements:{},records:[],questions:[],approvals:[],review:null,verdict:null,history:[],pending:null,error:null};record(c,who,'opened',c.issue);s.court.cases.unshift(c);s.version++;return {id:c.id};}
 const c=courtCase(s,d.id);check(c.revision===d.revision,'This case changed. Review the latest update and try again.',409);
 if(type==='court.pause'){check(!['decided','closed'].includes(c.stage),'This session is already closed.',409);if(d.value===false)c.pauses=c.pauses.filter(n=>n!==who);else{c.pauses=[...new Set([...c.pauses,who])];c.pending=null;}record(c,who,d.value===false?'resumed':'paused',d.value===false?'Ready to continue.':'Session paused.');}
 else if(type==='court.close'){check(c.stage!=='decided'&&c.stage!=='closed','This session is already closed.',409);c.stage='closed';c.pending=null;record(c,who,'closed','Session ended without a verdict.');}
 else {
 check(!c.pauses.length,'Both participants must release their own pause.',409);check(!c.pending,'Echo is examining the case. Pause first to stop it.',409);
 if(type==='court.accept'){check(c.stage==='invited'&&who!==c.owner,'Waiting for the invited participant.',409);c.consent=names.slice();c.stage='statements';record(c,who,'accepted','Accepted this session and sharing its submitted evidence with Echo.');}
 else if(type==='court.statement'){check(c.stage==='statements'&&!c.statements[who],'Your statement is already submitted.',409);const r=record(c,who,'statement',text(d.text,3000));c.statements[who]=r;if(heard(c))c.stage='investigation';}
 else if(type==='court.answer'){check(c.stage==='investigation','No question is awaiting an answer.',409);const q=c.questions.at(-1);check(q&&q.id===d.question&&q.target===who&&!q.answer,'This question is for the other participant or was already answered.',409);q.answer=record(c,who,'answer',text(d.text,2500),{question:q.id});}
 else if(type==='court.evidence'){check(['investigation','review','ready'].includes(c.stage),'Submit both statements before adding evidence.',409);check(c.records.filter(r=>r.kind==='evidence').length<8,'Use up to eight evidence items per session.');const note=text(d.text,2000);record(c,who,'evidence',note,{image:d.image??null,source:d.verifiedSource??null});if(c.stage!=='investigation'){c.stage='investigation';c.review=null;c.approvals=[];}}
 else if(type==='court.correct'){check(c.stage==='review'||c.stage==='ready','Wait for the factual review.',409);record(c,who,'correction',text(d.text,2000));c.stage='investigation';c.review=null;c.approvals=[];}
 else if(type==='court.approve'){check(c.stage==='review'&&!c.approvals.includes(who),'The review has changed or was already confirmed.',409);c.approvals.push(who);record(c,who,'confirmed','Confirmed that the summary represents my account; this is not agreement with disputed claims.');if(c.approvals.length===2)c.stage='ready';}
 else if(type==='court.appeal'){check(c.stage==='decided','Only a decided case can be reopened for review.',409);check(c.round<10,'This case has reached ten review sessions.');const reason=text(d.text,1500);c.history.push({round:c.round,issue:c.issue,records:c.records,statements:c.statements,questions:c.questions,review:c.review,verdict:c.verdict,decidedAt:c.updatedAt});Object.assign(c,{round:c.round+1,stage:'invited',owner:who,issue:reason,consent:[who],pauses:[],statements:{},records:[],questions:[],review:null,verdict:null,approvals:[],error:null});record(c,who,'appeal',reason);}
 else check(false,'Unknown court action.');
 }
 check(JSON.stringify(c.records).length<65000,'This session is too long. End it and open a focused new case.');c.updatedAt=stamp();c.revision++;s.version++;return {id:c.id};
}
export function courtRequest(c){
 check(!c.pauses.length&&!c.pending,'This session is paused or Echo is already working.',409);check(c.consent.length===2&&heard(c),'Both participants must consent and submit statements.',409);
 check(['investigation','ready'].includes(c.stage),'Complete the current step first.',409);check(!c.questions.some(q=>!q.answer),'Answer the current question first.',409);
 const counts=Object.fromEntries(names.map(n=>[n,c.questions.filter(q=>q.target===n&&q.answer).length]));
 const canReview=names.every(n=>counts[n]>=1),mustReview=names.every(n=>counts[n]>=3);
 return {stage:c.stage,counts,canReview,mustReview,allowedTargets:names.filter(n=>counts[n]===Math.min(...Object.values(counts))),language:/[\u0600-\u06ff]/u.test([...c.records].reverse().find(r=>r.by!=='Echo'&&['statement','answer','correction','evidence','opened','appeal'].includes(r.kind))?.text||'')?'Arabic':'English',title:c.title,issue:c.issue,records:c.records,previousVerdicts:c.history.map(h=>({round:h.round,verdict:h.verdict})),review:c.review};
}
const list=(v,max=10)=>{check(Array.isArray(v)&&v.length<=max,'Echo returned an invalid list.',502);return v.map(x=>text(x,1800));};
export function courtApply(s,id,job,result){
 const c=courtCase(s,id);if(c.pending!==job||c.pauses.length)return false;const request=courtRequest({...c,pending:null});
 check(result&&typeof result==='object','Echo returned an invalid response.',502);
 if(result.kind==='question'){
 check(c.stage==='investigation'&&!request.mustReview&&request.allowedTargets.includes(result.target),'Echo must hear both participants equally.',502);
 const q=record(c,'Echo','question',text(result.text,1800),{target:result.target});c.questions.push({...q,answer:null});
 }else if(result.kind==='review'){
 check(c.stage==='investigation'&&request.canReview,'Both participants need a chance to answer before review.',502);c.review={summary:text(result.text,4000),agreed:list(result.agreed),disputed:list(result.disputed),missing:list(result.missing)};record(c,'Echo','review',c.review.summary,{detail:c.review});c.stage='review';c.approvals=[];
 }else if(result.kind==='verdict'){
 check(c.stage==='ready'&&c.approvals.length===2,'Both participants must review the facts before a verdict.',502);
 const ids=new Set(c.records.map(r=>r.id));check(Array.isArray(result.references)&&result.references.length>0&&result.references.length<=20&&result.references.every(id=>ids.has(id)),'Echo cited evidence outside this session.',502);
 c.verdict={decision:text(result.text,4000),reasons:list(result.reasons),established:list(result.agreed),disputed:list(result.disputed),uncertainties:list(result.missing),steps:list(result.steps),references:result.references,at:stamp()};check(c.verdict.reasons.length,'Echo must explain the verdict.',502);check(names.every(n=>result.references.includes(c.statements[n].id)),'The verdict must reference both opening accounts.',502);record(c,'Echo','verdict',c.verdict.decision,{detail:c.verdict});c.stage='decided';
 }else check(false,'Echo returned an unsupported court step.',502);
 c.pending=null;c.error=null;c.updatedAt=stamp();c.revision++;s.version++;return true;
}
export function courtFailure(s,id,job){const c=s.court?.cases.find(c=>c.id===id);if(c?.pending===job){c.pending=null;c.error='Echo could not finish. Your case is saved. You can retry this step.';c.revision++;s.version++;}}

