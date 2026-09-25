export const activityPeople=['Mahmoud','Safy'];
export const participantsOf=a=>a.target==='Both'?activityPeople:[a.target];
export const addressesBoth=q=>/^\s*(?:Mahmoud\s*(?:and|&|,|و)\s*Safy|Safy\s*(?:and|&|,|و)\s*Mahmoud|محمود\s*و\s*صافي)\s*[:،,!—-]/i.test(q||'');
export function requestedTarget(prompt,actor){
 const p=String(prompt).toLowerCase();
 if(/\b(?:ask|quiz|test|challenge)\s+(?:us|both)\b|\bboth of us\b|\b(?:e[sh]?2[ae]?lna|es2lna|ehna\s*(?:el\s*)?(?:etnen|etneen)|e7na\s*(?:el\s*)?(?:etnen|etneen))\b|(?:اسألنا|اسالنا|إسألنا|لينا|احنا|إحنا)\s*(?:احنا\s*|إحنا\s*)?(?:الاتنين|الاثنين)|اسألنا|اسالنا|إسألنا/.test(p))return 'Both';
 if(/\b(?:ask|quiz|test)\s+me\b|اسألني|اسالني|إسألني/.test(p))return actor;
 if(/\b(?:ask|quiz|test)\s+(?:mahmoud\s*(?:and|&)\s*safy|safy\s*(?:and|&)\s*mahmoud)\b/.test(p))return 'Both';
 const named=p.match(/\b(?:ask|quiz|test)\s+(mahmoud|safy)\b/);if(named)return named[1]==='mahmoud'?'Mahmoud':'Safy';
 if(/\b(?:mahmoud\s*(?:and|&)\s*safy|safy\s*(?:and|&)\s*mahmoud)\b|محمود\s*و\s*صافي/.test(p))return 'Both';
 return null;
}
export function normalizeActivityTarget(prompt,actor,args){
 const requested=requestedTarget(prompt,actor);
 const target=requested??(args.questions?.some(q=>addressesBoth(q.q))?'Both':args.target);
 if(target!=='Both'&&requested)for(const question of args.questions||[])if(addressesBoth(question.q))question.q=target+': '+question.q.replace(/^.*?[:،,!—-]\s*/, '');
 return target;
}
// Repair only untouched legacy Echo rounds whose question explicitly addresses both.
export function repairSharedActivities(s){
 let changed=false;
 for(const a of s.activities??(s.activity?[s.activity]:[]))if(a.host==='Echo'&&a.status==='active'&&a.index===0&&!a.answers.length&&a.target!=='Both'&&a.qs?.some(q=>addressesBoth(q.q))){a.target='Both';changed=true;}
 if(changed){if(s.activity)s.activity=(s.activities??[]).find(a=>a.id===s.activity.id)??s.activity;s.version++;}
 return changed;
}
