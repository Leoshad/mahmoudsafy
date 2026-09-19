const people=['Mahmoud','Safy'];
const other=n=>people.find(p=>p!==n);
// Only event metadata reaches notifications. Never include chat text, cards or secret words.
export function attentionEvents(before,after,actor){
 const out=[],add=(key,to,body,target,kind='activity',quiet=false)=>{if(people.includes(to)&&to!==actor)out.push({key,to,body,target,kind,quiet});};
 const both=(key,body,target)=>people.forEach(n=>add(key+':'+n,n,body,target));
 for(const a of after.activities??[]){const old=before.activities?.find(x=>x.id===a.id),target={tab:'chat',activity:a.id};
  if(!old&&a.status==='active')add('quiz:'+a.id,a.target,(a.host||a.owner)+' started a round for you.',target);
  if(old&&old.status==='active'&&a.status!=='active')both('quiz-end:'+a.id,'Your round has ended.',target);
  for(const f of a.feedback??[])if(f.final&&f.status==='sent'&&!old?.feedback?.some(x=>x.id===f.id&&x.status==='sent'))add('reaction:'+f.id,a.target,'Echo’s round summary is ready.',target,'echo');
 }
 for(const game of ['ocho','domino']){const g=after[game]?.shared,old=before[game]?.shared;if(!g)continue;const target={tab:'together',game};const title=game==='ocho'?'Ocho':'Dominoes';
  if(g.id!==old?.id&&g.status==='waiting')add(game+':invite:'+g.id,other(g.owner),g.owner+' invited you to '+title+'.',target);
  if(old?.id===g.id&&old.status==='waiting'&&g.status==='active')add(game+':accepted:'+g.id,g.owner,'Your '+title+' invitation was accepted.',target);
  if(g.status==='active'&&!g.paused&&!g.pausedBy?.length&&(old?.turn!==g.turn||old?.status!=='active'||old?.paused||old?.pausedBy?.length))add(game+':turn:'+g.id+':'+g.revision,g.turn,'It’s your turn in '+title+'.',target);
  if(g.status==='complete'&&old?.status!=='complete')both(game+':result:'+g.id,title+' match result is ready.',target);
 }
 const m=after.draw?.match,old=before.draw?.match;
 if(m){const target={tab:'together',game:'draw'};
  if(m.status==='invited'&&old?.id!==m.id)add('draw:invite:'+m.id,other(m.owner),m.owner+' invited you to Draw & Guess.',target);
  if(old?.status==='invited'&&m.status==='preparing')add('draw:accepted:'+m.id,m.owner,'Your drawing invitation was accepted.',target);
  if(m.status==='ready'&&(old?.status!=='ready'||old?.round!==m.round))both('draw:ready:'+m.id+':'+m.round,'Your drawing round is ready.',target);
  if(m.status==='active'&&(old?.status!=='active'||old?.round!==m.round))both('draw:turn:'+m.id+':'+m.round,'Your Draw & Guess round has started.',target);
  if(['review','complete'].includes(m.status)&&old?.status!==m.status)both('draw:end:'+m.id+':'+m.round,'Your drawing round result is ready.',target);
 }
 const media=after.media,prior=before.media;if(media?.invitation?.id!==prior?.invitation?.id&&media?.invitation)add('media:'+media.invitation.id,media.invitation.to,media.owner+' invited you to Watch & Listen.',{tab:'together',game:'media'});
 if(media&&prior?.invitation&&!media.invitation&&media.participants?.length===2)add('media:accepted:'+media.id,media.owner,'Your Watch & Listen invitation was accepted.',{tab:'together',game:'media'});
 for(const c of after.court?.cases??[]){const old=before.court?.cases?.find(x=>x.id===c.id),target={tab:'together',game:'court',caseId:c.id};
  if(c.stage==='invited'&&(!old||old.round!==c.round))add('court:invite:'+c.id+':'+c.round,other(c.owner),c.owner+' invited you to Echo’s Court.',target,'invitation');
  if(old?.stage==='invited'&&c.stage==='statements')add('court:accept:'+c.id+':'+c.round,c.owner,'Your Echo’s Court invitation was accepted.',target);
  for(const q of c.questions??[])if(!old?.questions?.some(x=>x.id===q.id)&&!q.answer)add('court:q:'+q.id,q.target,'Echo has a question for you in Court.',target,'echo');
  if(['review','decided'].includes(c.stage)&&old?.stage!==c.stage)both('court:'+c.id+':'+c.round+':'+c.stage,'Echo’s Court has an update for you to review.',target);
 }
 for(const post of after.items??[]){const old=before.items?.find(x=>x.id===post.id),target={tab:'space',post:post.id};if(!old){if(post.daily?.notify)people.forEach(n=>add('daily:'+post.id+':'+n,n,'Echo shared a new post on your wall.',target,'daily'));if(people.includes(post.by))add('post:'+post.id,other(post.by),new RegExp('(^|\\s)@'+other(post.by)+'\\b','i').test(post.title||'')?post.by+' mentioned you in a post.':post.by+' shared a post in Our Space.',target,'wall');continue;}
  for(const person of people){const pattern=new RegExp('(^|\\s)@'+person+'\\b','i');if(person!==actor&&pattern.test(post.title||'')&&!pattern.test(old.title||''))add('mention:'+post.id+':'+person+':'+post.revision,person,(actor||post.by)+' mentioned you in a post.',target,'wall');}
  for(const c of post.comments??[])if((!c.status||c.status==='sent')&&!old.comments?.some(x=>x.id===c.id&&(!x.status||x.status==='sent'))){if(c.by==='Echo'){const idx=post.comments.indexOf(c),requester=post.comments.slice(0,idx).findLast(x=>x.to==='Echo')?.by;if(requester)add('comment:'+c.id,requester,'Echo replied to your question on the wall.',target,'echo');}else if(people.includes(c.by))add('comment:'+c.id,other(c.by),new RegExp('(^|\\s)@'+other(c.by)+'\\b','i').test(c.text||'')?c.by+' mentioned you in a comment.':c.by+' commented on your post.',target,'wall');}
  for(const n of post.likes??[])if(n!==post.by&&!old.likes?.includes(n))add('like:'+post.id+':'+n+':'+post.revision,post.by,n+' liked your post.',target,'wall',true);
 }
 return out;
}

