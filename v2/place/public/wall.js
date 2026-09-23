/* Our Space: a shared wall. State changes are persisted by the server. */
window.OurWall=function({getState,api,command,sync,goto,info,error,el,btn,categories,getFilter,setFilter,openSource}){
 const $=s=>document.querySelector(s),cards=new Map(),drafts=new Map();let editing={},photos=[],uploading=false,epoch=0,postRequest=null;
 const icons={Idea:'✧',Plan:'☷',Decision:'✓',Agreement:'◇',Discussion:'❝',Photo:'▧',Result:'⚑'};
 const images=i=>i.images??(i.image?[i.image]:[]);
 const act=(type,data)=>command(type,data).then(sync);
 const reactionMap=i=>({...Object.fromEntries((i.likes??[]).map(n=>[n,'❤️'])),...i.reactions});
 const latest=id=>getState().items.find(i=>i.id===id);
 function action(label,parent,fn,cls){const b=btn(label,parent,async()=>{if(b.disabled)return;b.disabled=true;try{await fn();}finally{b.disabled=false;}},cls);return b;}
 function date(v){const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d):'';}
 const viewer=el('dialog',null,$('#our-place-trial'),'wall-viewer');const close=btn('Close',viewer,()=>viewer.close());const full=el('img',null,viewer);full.alt='Shared photo';viewer.onclick=e=>{if(e.target===viewer)viewer.close();};
 let deleteId=null;const deletion=el('dialog',null,$('#our-place-trial'),'wall-delete-dialog');deletion.setAttribute('aria-label','Delete post');el('h3','Delete this moment?',deletion);el('p','The post and its comments will be removed for both of you.',deletion);const deleteError=el('p','',deletion,'wall-error');deleteError.setAttribute('role','alert');const deleteRow=el('div',null,deletion,'row');const keepPost=btn('Keep it',deleteRow,()=>deletion.close());action('Delete post',deleteRow,async()=>{const item=latest(deleteId);if(!item){deletion.close();return;}try{await command('item.delete',{id:item.id,revision:item.revision});deletion.close();await sync();info('Post deleted.');}catch(e){deleteError.textContent=e.message;await sync().catch(()=>{});}},'wall-danger');
 deletion.onclick=e=>{if(e.target===deletion)deletion.close();};
 function askDelete(id){deleteId=id;deleteError.textContent='';deletion.showModal();keepPost.focus();}
 function showPhoto(id){full.src='/api/photos/'+id;viewer.showModal();close.focus();}
 // One shared comment sheet: live updates replace rows, never the composer.
 let threadId=null,threadSignature='',threadTrigger=null,replyReceipt=null;
 const sheet=el('dialog',null,$('#our-place-trial'),'wall-comment-sheet');sheet.setAttribute('aria-label','Comments');
 const sheetHead=el('div',null,sheet,'wall-sheet-head');el('div',null,sheetHead,'wall-sheet-handle');
 const sheetTitle=el('h3','Comments',sheetHead);const sheetClose=btn('×',sheetHead,()=>sheet.close());sheetClose.setAttribute('aria-label','Close comments');sheetClose.autofocus=true;
 const invite=action('✦ Invite Echo',sheet,async()=>{const p=latest(threadId);if(p)await act('item.echo',{id:p.id,value:!p.echoComments});},'wall-invite');
 const threadList=el('div',null,sheet,'wall-thread-list');
 const composer=el('form',null,sheet,'wall-sheet-composer'),commentInput=el('textarea',null,composer);commentInput.rows=1;commentInput.required=true;commentInput.maxLength=1500;commentInput.dir='auto';commentInput.dataset.field='comment';commentInput.setAttribute('aria-label','Your comment');
 const commentSend=el('button','Send',composer);commentSend.type='submit';
 const mention=btn('✦ Echo',composer,insertMention,'wall-mention-suggestion');mention.type='button';mention.hidden=true;mention.setAttribute('aria-label','Mention Echo');mention.id='wall-echo-suggestion';commentInput.setAttribute('aria-controls',mention.id);commentInput.setAttribute('aria-autocomplete','list');
 function mentionRange(){const end=commentInput.selectionStart??commentInput.value.length;if((commentInput.selectionEnd??end)!==end)return null;const before=commentInput.value.slice(0,end),match=before.match(/(?:^|[\s(])@([a-z]*)$/i);if(!match||!'echo'.startsWith(match[1].toLowerCase()))return null;const tail=commentInput.value.slice(end).match(/^[a-z]*/i)[0];if(!'echo'.startsWith((match[1]+tail).toLowerCase()))return null;return {start:end-match[1].length-1,end:end+tail.length};}
 function updateMention(){mention.hidden=!threadId||!mentionRange();commentInput.setAttribute('aria-expanded',String(!mention.hidden));}
 function insertMention(){const range=mentionRange();if(!range)return;const after=commentInput.value.slice(range.end),space=after.startsWith(' ')?'':' ',value=commentInput.value.slice(0,range.start)+'@Echo'+space+after;if(value.length>commentInput.maxLength)return;commentInput.value=value;const caret=range.start+5+(space?1:after.startsWith(' ')?1:0);commentInput.focus({preventScroll:true});commentInput.setSelectionRange(caret,caret);commentInput.oninput();mention.hidden=true;commentInput.setAttribute('aria-expanded','false');}
 mention.onpointerdown=e=>e.preventDefault();
 commentInput.onkeydown=e=>{if(e.isComposing||mention.hidden)return;if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();insertMention();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation?.();mention.hidden=true;commentInput.setAttribute('aria-expanded','false');}};
 commentInput.onclick=updateMention;commentInput.onkeyup=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))updateMention();};commentInput.onblur=()=>{mention.hidden=true;commentInput.setAttribute('aria-expanded','false');};

 const threadError=el('p','',sheet,'wall-thread-error');threadError.setAttribute('role','alert');
 function fitSheet(){if(!sheet.style)return;const v=window.visualViewport;sheet.style.setProperty('--sheet-height',v?Math.max(180,v.height-12)+'px':'calc(100dvh - 12px)');sheet.style.setProperty('--sheet-bottom',v?Math.max(0,window.innerHeight-v.height-v.offsetTop)+'px':'0px');}
 window.visualViewport?.addEventListener('resize',fitSheet);window.visualViewport?.addEventListener('scroll',fitSheet);
 sheet.addEventListener?.('close',()=>{drafts.set(threadId,commentInput.value);threadId=null;mention.hidden=true;threadSignature='';threadTrigger?.focus?.({preventScroll:true});});
 let swipe=null;sheetHead.onpointerdown=e=>{if(e.target===sheetClose)return;swipe={x:e.clientX,y:e.clientY,id:e.pointerId};sheetHead.setPointerCapture?.(e.pointerId);};sheetHead.onpointerup=e=>{if(swipe&&e.clientY-swipe.y>65&&Math.abs(e.clientX-swipe.x)<55)sheet.close();swipe=null;};sheetHead.onpointercancel=()=>swipe=null;
 function openComments(id,trigger){threadId=id;threadTrigger=trigger;threadSignature='';replyReceipt=null;mention.hidden=true;commentInput.value=drafts.get(id)||'';threadError.textContent='';paintThread();fitSheet();sheet.showModal();sheetClose.focus();threadList.scrollTop=threadList.scrollHeight;}
 function renderComment(body,c){
  const value=c.text||(c.status==='streaming'?'Echo is thinking…':'');
  body.replaceChildren();body.textContent='';
  if(c.by!=='Echo'){body.textContent=value;return;}
  function linked(root,text){
   const pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s()]+)\)|(https?:\/\/[^\s<>"\u0000-\u001f]+)/gi;let at=0;
   for(const m of text.matchAll(pattern)){
    if(m.index>at)el('span',text.slice(at,m.index),root);
    let href=m[2]||m[3],tail='';if(!m[2]){const end=href.match(/[.,!?;:،؛؟\])}]+$/);if(end){tail=end[0];href=href.slice(0,-tail.length);}}
    let safe=false;try{const u=new URL(href);safe=['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{}
    if(safe){const a=el('a',m[1]||href,root,'message-link');a.href=href;a.target='_blank';a.rel='noopener noreferrer';if(tail)el('span',tail,root);}else el('span',m[0],root);
    at=m.index+m[0].length;
   }
   if(!at)root.textContent=text;else if(at<text.length)el('span',text.slice(at),root);
  }
  if(!value.includes('**')){linked(body,value);return;}
  const pattern=c.status==='streaming'?/\*\*(.+?)(?:\*\*|$)/gs:/\*\*(.+?)\*\*/gs;let at=0;
  for(const match of value.matchAll(pattern)){if(match.index>at)linked(el('span','',body),value.slice(at,match.index));linked(el('strong','',body),match[1]);at=match.index+match[0].length;}
  if(at<value.length)linked(el('span','',body),value.slice(at));
 }
 function paintThread(){if(!threadId)return;const post=latest(threadId);if(!post){sheet.close();return;}const sig=JSON.stringify([post.comments,post.echoComments,getState().pauses]);if(sig===threadSignature)return;threadSignature=sig;
  sheetTitle.textContent='Comments'+(post.comments?.length?' · '+post.comments.length:'');invite.textContent=post.echoComments?'✦ Echo is here':'✦ Invite Echo';invite.setAttribute('aria-pressed',String(!!post.echoComments));invite.title=post.echoComments?'Remove Echo from this conversation':'Let Echo read this post and join its comments';
  commentInput.placeholder=post.echoComments?'Write a comment… mention @Echo to ask':'Write a comment…';
  const bottom=threadList.scrollHeight-threadList.scrollTop-threadList.clientHeight<60,top=threadList.scrollTop;threadList.replaceChildren();
  if(!post.comments?.length)el('p','No comments yet. Start the conversation.',threadList,'wall-thread-empty');
  for(const c of post.comments??[]){const row=el('div',null,threadList,'wall-comment');const avatar=el('span',c.by==='Echo'?'✦':c.by?.[0],row,c.by==='Echo'?'wall-avatar wall-avatar-echo wall-comment-avatar':'wall-avatar wall-comment-avatar');if(c.by!=='Echo')avatar.dataset.avatarName=c.by;el('strong',c.by==='Echo'?'Echo':c.by,row);el('small',' · '+date(c.createdAt),row,'muted');const body=el('p',c.text||(c.status==='streaming'?'Echo is thinking…':''),row);body.dir='auto';body.dataset.comment=c.id;renderComment(body,c);if(c.by==='Echo')row.classList.add('wall-echo-comment');if(c.by===getState().who)action('Remove',row,()=>act('item.comment.delete',{id:post.id,comment:c.id}),'wall-comment-remove');}
  threadList.scrollTop=bottom?threadList.scrollHeight:top;
 }
 commentInput.oninput=e=>{if(e?.isComposing){mention.hidden=true;}else updateMention();drafts.set(threadId,commentInput.value);if(commentInput.style){commentInput.style.height='auto';commentInput.style.height=Math.min(commentInput.scrollHeight,110)+'px';}};
 composer.onsubmit=async e=>{e.preventDefault();if(commentSend.disabled||!threadId)return;const id=threadId,value=commentInput.value;if(!value.trim())return;commentSend.disabled=true;threadError.textContent='';try{if(replyReceipt?.id!==id||replyReceipt?.text!==value)replyReceipt={id,text:value,key:crypto.randomUUID()};await command('item.comment',{id,text:value},replyReceipt.key);drafts.delete(id);if(threadId===id){commentInput.value='';updateMention();if(commentInput.style)commentInput.style.height='auto';}await sync();threadList.scrollTop=threadList.scrollHeight;}catch(err){threadError.textContent=err.message;}finally{commentSend.disabled=false;}};
 const reactionDialog=el('dialog',null,$('#our-place-trial'),'wall-settings-dialog');reactionDialog.setAttribute('aria-label','Reactions');const reactionHead=el('div',null,reactionDialog,'wall-dialog-head');el('h3','Reactions',reactionHead);btn('Close',reactionHead,()=>reactionDialog.close());const reactionPeople=el('div',null,reactionDialog);
 function showReactions(id){reactionPeople.replaceChildren();for(const [name,emoji]of Object.entries(reactionMap(latest(id))))el('p',emoji+'  '+name,reactionPeople);reactionDialog.showModal();}
 document.addEventListener?.('pointerdown',e=>{for(const card of cards.values()){const wrap=card.querySelector('.wall-like-wrap');if(wrap&&!wrap.contains(e.target)){const p=wrap.querySelector('.wall-reaction-popover');if(p)p.hidden=true;}}});
 const searchDialog=$('#wall-search-dialog'),settingsDialog=$('#daily-settings');
 function openPanel(dialog,trigger){dialog.showModal();dialog.dataset.returnFocus=trigger;}
 for(const [dialog,trigger,closer]of [[searchDialog,'wall-search-open','wall-search-close'],[settingsDialog,'wall-settings-open','wall-settings-close']]){
  $('#'+trigger).onclick=()=>openPanel(dialog,trigger);$('#'+closer).onclick=()=>{dialog.close();$('#'+trigger).focus();};
  dialog.addEventListener?.('close',()=>$('#'+trigger).focus());
 }
 $('#wall-search-done').onclick=()=>{searchDialog.close();$('#wall-search-open').focus();};
 $('#wall-filter-clear').onclick=()=>{$('#space-search').value='';setFilter('All');paint();};
 $('#wall-suggestions').onclick=()=>{edit();$('#wall-create-echo').open=true;};
 function paint(){
  const state=getState();if(!state)return;paintDaily(state.daily);
  const chips=$('#filters');chips.replaceChildren();['All',...categories].forEach(c=>btn(c,chips,()=>{setFilter(c);paint();},c===getFilter()?'selected':''));
  const root=$('#items'),scroller=$('.shell'),anchor=[...root.children].find(n=>n.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top),anchorY=anchor?.getBoundingClientRect().top;
  const query=$('#space-search').value.trim().toLowerCase();const filterStatus=$('#wall-filter-status');filterStatus.hidden=!query&&getFilter()==='All';filterStatus.textContent=[getFilter()!=='All'?getFilter():'',query?'Search: '+$('#space-search').value.trim():''].filter(Boolean).join(' · ');const suggestions=$('#wall-suggestions'),count=state.proposals?.length||0;suggestions.hidden=!count;suggestions.textContent='✦ '+count+' Echo suggestion'+(count===1?'':'s')+' ready to review';
  const list=state.items.filter(i=>(getFilter()==='All'||i.type===getFilter())&&(!query||[i.title,i.by,...(i.comments??[]).map(c=>c.text)].join(' ').toLowerCase().includes(query))).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
  const keep=new Set(list.map(i=>i.id));for(const [id,node] of cards)if(!keep.has(id)){node.remove();cards.delete(id);}
  root.querySelector('.wall-empty')?.remove();
  if(!list.length){const empty=el('div',null,root,'wall-empty');el('div','♡',empty,'wall-empty-icon');el('h3',query||getFilter()!=='All'?'No moments here yet':'Your story starts here',empty);el('p',query?'Try a different word.':'A photo, a little thought, or a plan for the two of you.',empty,'muted');}
  list.forEach((i,index)=>{
   let card=cards.get(i.id);if(!card){card=el('article',null,null,'wall-post');card.dataset.post=i.id;cards.set(i.id,card);}
   if(root.children[index]!==card)root.insertBefore(card,root.children[index]??null);
   const signature=JSON.stringify([i,state.who]);if(card.dataset.signature===signature)return;
   const opens=[...card.querySelectorAll('details')].filter(x=>x.open).map(x=>x.dataset.section),active=document.activeElement,field=card.contains(active)?active.dataset.field:null,start=active?.selectionStart,end=active?.selectionEnd;
   card.dataset.signature=signature;card.replaceChildren();render(i,card,state.who);
   card.querySelectorAll('details').forEach(x=>x.open=opens.includes(x.dataset.section));
   if(field){const input=card.querySelector('[data-field="'+field+'"]');if(input){input.focus({preventScroll:true});if(start!=null)input.setSelectionRange(start,end);}}
  });
  if(anchor?.isConnected&&anchorY!=null)scroller.scrollTop+=anchor.getBoundingClientRect().top-anchorY;
  paintThread();
 }
 function render(i,card,who){
  if(i.pinned)el('div','Pinned for us',card,'wall-pin-label');
  const head=el('div',null,card,'wall-post-head');const avatar=el('span',i.by==='Echo'?'✦':i.by?.[0]||'♡',head,i.by==='Echo'?'wall-avatar wall-avatar-echo':'wall-avatar');if(i.by!=='Echo')avatar.dataset.avatarName=i.by;const meta=el('div',null,head,'wall-meta');el('strong',i.by,meta);el('div',date(i.createdAt)+(i.updatedAt?' · edited':''),meta,'muted');
  const menu=el('details',null,head,'wall-menu');menu.dataset.section='menu';el('summary','⋯',menu).setAttribute('aria-label','Post actions');const controls=el('div',null,menu,'wall-menu-list');
  btn('Edit post',controls,()=>edit(latest(i.id)));action(i.pinned?'Unpin':'Pin for us',controls,()=>act('item.pin',{id:i.id,value:!latest(i.id).pinned}));
  btn('Delete post',controls,()=>{menu.open=false;askDelete(i.id);});
  el('span',(icons[i.type]||'✧')+' '+i.type+(i.aiAllowed?' · Echo memory':''),card,'wall-kind');
  if(i.title){
   let value=i.title;
   const cites=(i.sources??[]).filter(c=>Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.start>=0&&c.end>c.start&&c.end<=value.length&&/^https:\/\//.test(c.url)).sort((a,b)=>b.start-a.start);
   for(const c of cites){const part=value.slice(c.start,c.end);if(/https:\/\//.test(part)||/^\s*\[\d+\]\s*$/.test(part))value=value.slice(0,c.start)+value.slice(c.end);}
   value=value.replace(/\(\s*\)/g,'').trim();
   if(i.by==='Echo'&&!value.includes('\n')){let n=0;value=value.replace(/([.!?]) +(?=[A-Z])/g,(m,p)=>++n%2===0?p+'\n\n':m);}
   const prose=el('div',null,card,'wall-text');prose.dir='auto';for(const paragraph of value.split(/\n\s*\n/))el('p',paragraph,prose);
  }
  if(i.sources?.length){const sources=el('div',null,card,'wall-sources');if(i.publishedDate)el('small','Published '+i.publishedDate,sources);for(const c of i.sources.filter((x,k,a)=>a.findIndex(y=>y.url===x.url)===k)){if(!/^https:\/\//.test(c.url))continue;const a=el('a',c.title||'Source',sources);a.href=c.url;a.target='_blank';a.rel='noopener noreferrer';}}
  const pics=images(i);if(pics.length){const gallery=el('div',null,card,'wall-gallery '+(pics.length===1?'single':''));pics.forEach((id,k)=>{const b=btn('',gallery,()=>showPhoto(id));b.setAttribute('aria-label','Open photo '+(k+1));const image=el('img',null,b);image.src='/api/photos/'+id;image.alt=i.title?.slice(0,120)||'A shared moment';image.loading='lazy';});}
  if(i.type==='Plan'&&i.steps?.length){const plan=el('div',null,card,'wall-plan');el('small',i.steps.filter(s=>s.done).length+' of '+i.steps.length+' steps done',plan,'muted');for(const step of i.steps){const label=el('label',null,plan,'wall-step');const check=el('input',null,label);check.type='checkbox';check.checked=step.done;el('span',step.text,label).dir='auto';check.onchange=async()=>{check.disabled=true;try{await act('item.step',{id:i.id,revision:latest(i.id).revision,step:step.id,value:check.checked});}catch(e){check.checked=step.done;error(e);}finally{check.disabled=false;}};}}
  if(i.type==='Agreement'){const agree=el('div',null,card,'wall-agreement');el('p',i.approvals.length===2?'✓ Agreed by both':'Waiting for '+['Mahmoud','Safy'].filter(n=>!i.approvals.includes(n)).join(' & '),agree);action(i.approvals.includes(who)?'Withdraw my approval':'I agree',agree,()=>act('item.approve',{id:i.id,revision:latest(i.id).revision,value:!latest(i.id).approvals.includes(who)}));}
  if(!i.daily&&['Plan','Discussion'].includes(i.type)&&!(i.type==='Plan'&&i.steps?.length))action(i.done?'✓ Done · reopen':i.type==='Plan'?'Mark complete':'Mark resolved',card,()=>act('item.done',{id:i.id,revision:latest(i.id).revision,value:!latest(i.id).done}),'wall-status');
  if(i.type==='Result')el('div',i.status==='completed'?'Completed':'Ended early',card,'muted');
  const reactions=reactionMap(i),mine=reactions[who],labels={'❤️':'Love','😂':'Haha','😮':'Wow','😢':'Sad','🔥':'Fire','👏':'Applause'};
  const stats=el('div',null,card,'wall-social-summary');if(Object.keys(reactions).length)btn([...new Set(Object.values(reactions))].join(' ')+' '+Object.keys(reactions).length,stats,()=>showReactions(i.id),'wall-reaction-count');else el('span','',stats);
  const count=btn((i.comments?.length||0)+' '+(i.comments?.length===1?'comment':'comments'),stats,()=>openComments(i.id,count));
  const bar=el('div',null,card,'wall-post-actions'),wrap=el('div',null,bar,'wall-like-wrap');let timer=null,origin=null,suppress=false;
  const like=action(mine?mine+' '+labels[mine]:'♡ Like',wrap,async()=>{if(suppress){suppress=false;return;}await act('item.react',{id:i.id,value:reactionMap(latest(i.id))[who]?null:'❤️'});},mine?'wall-liked':'');like.setAttribute('aria-pressed',String(!!mine));like.setAttribute('aria-label','Like; hold or press Arrow Down for more reactions');
  const popup=el('div',null,wrap,'wall-reaction-popover');popup.hidden=true;popup.setAttribute('role','group');popup.setAttribute('aria-label','Choose a reaction');
  const cancel=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
  like.onpointerdown=e=>{cancel();suppress=false;origin={x:e.clientX,y:e.clientY};if(e.pointerType!=='mouse')timer=setTimeout(()=>{popup.hidden=false;suppress=true;timer=null;},420);};
  like.onpointermove=e=>{if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>10)cancel();};like.onpointerup=cancel;like.onpointercancel=()=>{cancel();suppress=true;};like.oncontextmenu=e=>{e.preventDefault();};
  wrap.onpointerenter=e=>{if(e.pointerType==='mouse')popup.hidden=false;};wrap.onpointerleave=e=>{if(e.pointerType==='mouse'){cancel();popup.hidden=true;}};
  like.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();popup.hidden=false;popup.querySelector('button')?.focus();}if(e.key==='Escape')popup.hidden=true;};popup.onkeydown=e=>{if(e.key==='Escape'){popup.hidden=true;like.focus();}};
  for(const [emoji,label]of Object.entries(labels)){const choice=action(emoji,popup,async()=>{popup.hidden=true;await act('item.react',{id:i.id,value:reactionMap(latest(i.id))[who]===emoji?null:emoji});});choice.setAttribute('aria-label',label);choice.setAttribute('aria-pressed',String(mine===emoji));}
  const comment=btn('Comment',bar,()=>openComments(i.id,comment));
  if(i.source&&i.type!=='Result')btn('Original message',controls,()=>openSource(i.source));
 }

 let dailySignature='';
 function paintDaily(config){
  if(!config)return;const root=$('#daily-settings-body');const signature=JSON.stringify(config);if(signature===dailySignature||root.contains(document.activeElement))return;dailySignature=signature;root.replaceChildren();
  el('p','Three English posts each day · Riyadh time. Posts are prepared and reviewed before their scheduled time. Each slot keeps its own content type.',root,'muted');
  const form=el('form',null,root,'daily-form');const checks={};for(const [key,label]of [['enabled','Daily posts enabled'],['comments','Let Echo join comments on new daily posts'],['notifications','Notify us when a daily post arrives']]){const row=el('label',null,form,'daily-option'),input=el('input',null,row);input.type='checkbox';input.checked=config[key];checks[key]=input;el('span',label,row);}
  const slots=config.slots.map(slot=>{const row=el('label',null,form,'daily-slot'),enabled=el('input',null,row);enabled.type='checkbox';enabled.checked=slot.enabled;el('span',{morning:'Morning · connection & play',afternoon:'Afternoon · current world news',night:'Night · something worth discovering'}[slot.id],row);const time=el('input',null,row);time.type='time';time.required=true;time.value=slot.time;time.setAttribute('aria-label',slot.id+' posting time in Riyadh');return {id:slot.id,time,enabled};});
  const save=el('button','Save daily settings',form);save.type='submit';const status=el('p','',form,'muted');status.setAttribute('role','status');form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await command('daily.settings',{revision:config.revision,...Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v.checked])),slots:slots.map(x=>({id:x.id,time:x.time.value,enabled:x.enabled.checked}))});dailySignature='';document.activeElement?.blur?.();status.textContent='Saved. Future slots use these settings.';await sync();}catch(err){status.textContent=err.message;error(err);}finally{save.disabled=false;}};
  el('small','Posts are prepared ahead of time. If a post is unavailable, an editorial reserve keeps the slot; a news substitute is labelled clearly. Echo respects Just Us and your AI budget. News and discoveries include sources.',root,'muted');
  for(const run of config.runs??[])el('p',run.key+' · '+run.status+(run.detail?' — '+run.detail:''),root,'daily-run muted');
 }
 function fields(){const type=$('#item-type').value;$('#wall-steps-editor').hidden=type!=='Plan';$('#wall-agreement-note').hidden=type!=='Agreement';$('#wall-text-label').textContent=type==='Photo'?'Caption · optional':type==='Agreement'?'What are we agreeing to?':'Your moment';}
 function previews(){const root=$('#wall-previews');root.replaceChildren();photos.forEach((id,k)=>{const row=el('div',null,root);const image=el('img',null,row);image.src='/api/photos/'+id;image.alt='Selected photo '+(k+1);const remove=btn('×',row,()=>{photos.splice(k,1);previews();});remove.disabled=uploading;remove.setAttribute('aria-label','Remove photo '+(k+1));});}
 function edit(item={type:'Idea',title:''}){searchDialog.close();settingsDialog.close();epoch++;postRequest=null;editing=structuredClone(item);photos=[...images(item)];$('#item-form').reset();const select=$('#item-type');select.replaceChildren();categories.forEach(c=>{const option=el('option',(icons[c]||'')+' '+c,select);option.value=c;});select.value=item.type;$('#item-text').value=item.title||'';$('#item-ai').checked=!!item.aiAllowed;$('#wall-steps').value=(item.steps??[]).map(s=>s.text).join('\n');$('#wall-editor-title').textContent=item.id?'Edit our moment':'Add a moment';$('#wall-publish').textContent=item.id?'Save changes':'Post to our wall';$('#wall-upload-status').textContent='';fields();previews();goto('editor');}
 $('#item-type').onchange=fields;$('#add-item').onclick=()=>edit();$('#cancel-item').onclick=()=>history.back();$('#wall-add-photo').onclick=()=>$('#wall-upload').click();
 $('#wall-upload').onchange=async()=>{const input=$('#wall-upload'),files=[...input.files],ticket=epoch;if(!files.length)return;uploading=true;$('#wall-publish').disabled=true;$('#wall-add-photo').disabled=true;previews();try{if(photos.length+files.length>6)throw Error('Choose up to 6 photos.');for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose JPG, PNG or WebP photos up to 5 MB each.');$('#wall-upload-status').textContent='Preparing photo…';const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const data=canvas.toDataURL('image/jpeg',.82).split(',')[1];const result=await api('photos',{data});if(ticket!==epoch)return;photos.push(result.id);previews();}$('#wall-upload-status').textContent='Photos ready.';}catch(err){$('#wall-upload-status').textContent=err.message;error(err);}finally{uploading=false;input.value='';$('#wall-publish').disabled=false;$('#wall-add-photo').disabled=false;previews();}};
 $('#item-form').onsubmit=async e=>{e.preventDefault();if(uploading)return;const b=$('#wall-publish');if(b.disabled)return;b.disabled=true;try{const type=$('#item-type').value,title=$('#item-text').value;if(!title.trim()&&!photos.length)throw Error('Write something or add a photo.');if(type==='Photo'&&!photos.length)throw Error('Add a photo for this moment.');const remaining=[...(editing.steps??[])];const steps=$('#wall-steps').value.split('\n').map(t=>t.trim()).filter(Boolean).map(text=>{const index=remaining.findIndex(s=>s.text===text);return index>=0?remaining.splice(index,1)[0]:{text,done:false};});const payload={id:editing.id,revision:editing.revision,source:editing.source,type,title,images:photos,image:photos[0]??null,steps,aiAllowed:$('#item-ai').checked},key=JSON.stringify(payload);if(postRequest?.key!==key)postRequest={key,id:crypto.randomUUID()};await command('item.save',payload,postRequest.id);await sync();setFilter('All');$('#space-search').value='';goto('space',true);history.replaceState({placeTab:'space'},'');info('Saved to your wall.');}catch(err){error(err);}finally{b.disabled=false;}};
 function openNotification(target){
  const post=latest(target.post);
  if(!post){error(new Error('This post is no longer available.'));return;}
  const card=[...document.querySelectorAll('[data-post]')].find(n=>n.dataset.post===post.id);
  card?.scrollIntoView({block:'center'});
  if(!target.comment){card?.classList.add('wall-notification-target');setTimeout(()=>card?.classList.remove('wall-notification-target'),5000);return;}
  openComments(post.id,card);
  const body=[...threadList.querySelectorAll('[data-comment]')].find(n=>n.dataset.comment===target.comment);
  if(!body){threadError.textContent='This comment is no longer available.';return;}
  const row=body.parentElement;
  row.classList.add('wall-notification-target');
  row.scrollIntoView({block:'center'});
  setTimeout(()=>row.classList.remove('wall-notification-target'),5000);
 }
 return {paint,edit,openNotification,delta(d){const post=latest(d.post),c=post?.comments?.find(c=>c.id===d.id);if(c)c.text+=d.text;if(threadId===d.post){const body=[...threadList.querySelectorAll('[data-comment]')].find(n=>n.dataset.comment===d.id);if(body)renderComment(body,c??{by:'Echo',text:d.text,status:'streaming'});}},reset(){sheet.close();reactionDialog.close();threadId=null;searchDialog.close();settingsDialog.close();dailySignature='';deleteId=null;deletion.close();epoch++;cards.clear();drafts.clear();editing={};photos=[];viewer.close();full.removeAttribute('src');}};
};
