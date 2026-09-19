(()=>{'use strict';
let followupsOpen=false,reconnectTimer=null,lastEvent=Date.now();
const openingStarted=performance.now(),activityNodes=new Map();
const $=s=>document.querySelector(s),categories=['Idea','Plan','Decision','Agreement','Discussion','Photo','Result'];
const installButton=$('#install-app');
let state=null,tab='chat',source=null,filter='All',attachment=null,reply=null,editing=null,older=[],sending=false,online=[],pending=new Map(),refreshing=null,historyBusy=false,historyEnd=false,sessionEpoch=0;
function el(tag,text,parent,cls){const n=document.createElement(tag);if(text!==null&&text!==undefined)n.textContent=text;if(cls)n.className=cls;if(parent)parent.append(n);return n;}
function btn(text,parent,fn,cls){const b=el('button',text,parent,cls);b.type='button';b.onclick=()=>Promise.resolve(fn()).catch(error);return b;}
function info(t){$('#notice').textContent=t;}function error(e){info(e.message||'Something went wrong. Please try again.');}
async function api(path,data){const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});let v;try{v=await r.json();}catch{throw new Error('Connection lost. Your unsent text is still here.');}if(!r.ok){if(r.status===401&&path!=='login')signOutUI();throw new Error(v.error||'Please try again.');}return v;}
async function command(type,data={},id=crypto.randomUUID()){return api('command',{id,type,data});}
function signOutUI(){clearTimeout(reconnectTimer);reconnectTimer=null;$('#echo-profile')?.close();window.OurAccount?.reset();window.readTracker?.reset();window.OurNotifications?.reset();window.OurDraw?.reset();window.OurCourt?.reset();window.OurPersonal?.reset();window.OurCrown?.reset();window.OurJourney?.reset();window.OurRace?.reset();window.OurOcho?.reset();window.OurDomino?.reset();window.OurMedia?.reset();$('#chat-wallpaper').removeAttribute('src');$('#chat-wallpaper').hidden=true;$('#background-dialog').close();sessionEpoch++;refreshing=null;window.OurComfort?.reset();historyBusy=false;activityNodes.clear();followupsOpen=false;source?.close();state=null;older=[];historyEnd=false;pending.clear();attachment=null;reply=null;editing=null;wall.reset();for(const key of Object.keys(tabPositions))delete tabPositions[key];$('#compose').value='';$('#item-form').reset();$('#feed').replaceChildren();$('#items').replaceChildren();$('#app').hidden=true;$('#login').hidden=false;$('#our-place-trial').classList.remove('signed-in');$('#account').replaceChildren(installButton);$('#password').value='';$('#older').disabled=false;$('#load-earlier').disabled=false;$('#history-status').textContent='';}
const tabPositions={};
function goto(next,fromHistory=false){if(!['chat','together','space','editor'].includes(next))next='chat';const previous=tab,scroller=$('.shell');if(previous!==next){tabPositions[previous]=scroller.scrollTop;if(!fromHistory)history.pushState({placeTab:next},'');}tab=next;for(const t of ['chat','together','space','editor'])$('#'+t).hidden=t!==next;document.querySelectorAll('[data-tab]').forEach(b=>(b.classList.toggle('selected',b.dataset.tab===(next==='editor'?'space':next)),b.setAttribute('aria-current',b.dataset.tab===(next==='editor'?'space':next)?'page':'false')));window.OurDraw?.tab(next);window.OurOcho?.tab(next);window.OurMedia?.tab(next);if(next==='space')paintItems();if(next==='chat')paint();if(next==='together')$('#continue-round').hidden=!activities().some(a=>a.status==='active');if(previous!==next)scroller.scrollTop=next==='editor'?0:tabPositions[next]??0;}
history.replaceState({placeTab:'chat'},'');window.addEventListener('popstate',e=>goto(e.state?.placeTab||'chat',true));
let deliveryBusy=false;
function acknowledgeDelivery(){if(deliveryBusy||!state)return;const ids=state.messages.filter(m=>m.author!==state.who&&m.author!=='Echo'&&m.status==='sent'&&!m.deliveredAt).map(m=>m.id);if(!ids.length)return;deliveryBusy=true;api('delivered',{ids}).catch(()=>{}).finally(()=>deliveryBusy=false);}
function absorb(next){snapshotSerial++;if(state?.who===next.who)older=[...new Map([...older,...state.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.sequence-b.sequence);state=next;window.OurDraw?.sync(state);window.OurPersonal?.sync(state);window.OurCourt?.sync(state);window.OurOcho?.sync(state);window.OurDomino?.sync(state);window.OurMedia?.sync(state);for(const m of state.messages)pending.delete(m.id);$('#login').hidden=true;$('#app').hidden=false;$('#our-place-trial').classList.add('signed-in');$('#account').replaceChildren();el('span',state.who, $('#account'));$('#account').append(installButton);const logout=btn('',$('#account'),async()=>{await api('logout',{});signOutUI();},'sign-out-icon');logout.setAttribute('aria-label','Sign out');logout.title='Sign out';logout.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4"/></svg>';paint();window.OurCrown?.sync(state);window.OurPersonal?.decorate();window.OurNotifications?.sync(state);window.OurComfort?.sync(state);acknowledgeDelivery();}
let snapshotSerial=0;
async function sync(){if(refreshing)return refreshing;const epoch=sessionEpoch,serial=snapshotSerial;const task=api('state').then(next=>{if(epoch===sessionEpoch&&serial===snapshotSerial)absorb(next);}).finally(()=>{if(refreshing===task)refreshing=null;});refreshing=task;return task;}
function paintPresence(known=true){const root=$('#presence');root.replaceChildren();for(const name of ['Mahmoud','Safy']){const on=known&&online.includes(name),label=known?(on?'Online':'Offline'):'Reconnecting';const person=el('span',name+' ',root,'person');person.setAttribute('aria-label',name+' · '+label);person.title=name+' · '+label;el('span',null,person,'presence-dot '+(known?(on?'online':'offline'):'unknown')).setAttribute('aria-hidden','true');}window.OurCrown?.decorate();}
function connect(){clearTimeout(reconnectTimer);reconnectTimer=null;source?.close();source=new EventSource('/api/events?draw=segments');lastEvent=Date.now();source.addEventListener('heartbeat',()=>lastEvent=Date.now());source.addEventListener('open',()=>{clearTimeout(reconnectTimer);reconnectTimer=null;paintPresence();});source.addEventListener('draw-segment',e=>window.OurDraw?.segment(JSON.parse(e.data)));source.addEventListener('session-ended',signOutUI);source.addEventListener('snapshot',e=>{lastEvent=Date.now();absorb(JSON.parse(e.data));});source.addEventListener('delivered',e=>{if(!state)return;const r=JSON.parse(e.data);for(const m of [...older,...state.messages])if(r.ids.includes(m.id))m.deliveredAt=r.at;paintFeed();});source.addEventListener('read',e=>{if(!state)return;const r=JSON.parse(e.data);for(const m of [...older,...state.messages])if(r.ids.includes(m.id)&&m.author!==r.reader)m.readAt=r.at;paintFeed();});source.addEventListener('presence',e=>{online=JSON.parse(e.data).online;paintPresence();});source.addEventListener('delta',e=>{const d=JSON.parse(e.data),m=state?.messages.find(m=>m.id===d.id);if(m){const f=$('#timeline'),mark=tab==='chat'?PlaceScroll.capture(f):null;m.text+=d.text;const p=document.getElementById('text-'+d.id);if(p&&mark)renderMessageText(p,m);if(mark)PlaceScroll.restore(f,mark);}});source.addEventListener('wall-delta',e=>wall.delta(JSON.parse(e.data)));source.addEventListener('notice',e=>info(JSON.parse(e.data).text));source.onerror=()=>{if(reconnectTimer)return;reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(source?.readyState!==1&&state){paintPresence(false);window.OurMedia?.connection(false);}},1500);};}
$('#login-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#login-error').textContent='';try{await api('login',{email:$('#email').value,password:$('#password').value});$('#password').value='';await sync();connect();}catch(e){$('#login-error').textContent=e.message;}finally{b.disabled=false;}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>goto(b.dataset.tab));
// Main-section swipe navigation. Nested activities own their gestures.
(()=>{
 const root=$('#app'),tabs=['chat','together','space'];let gesture=null,suppressUntil=0;
 const blocked='input,textarea,select,button,a,summary,label,[contenteditable],dialog,[role="dialog"],canvas,video,audio,iframe,#draw-panel,#ocho-panel,#domino-panel,#court-panel,#media-panel,[data-no-tab-swipe]';
 function available(){return !!state&&tabs.includes(tab)&&!document.querySelector('dialog[open],[aria-modal="true"]')&&!window.getSelection()?.toString();}
 root.addEventListener('touchstart',e=>{
  gesture=null;if(e.touches.length!==1||!available()||e.target.closest(blocked))return;
  const t=e.touches[0];if(t.clientX<24||t.clientX>window.innerWidth-24)return;
  for(let n=e.target;n&&n!==root;n=n.parentElement){if(n.scrollWidth>n.clientWidth+2&&/auto|scroll/.test(getComputedStyle(n).overflowX))return;}
  gesture={id:t.identifier,x:t.clientX,y:t.clientY,started:performance.now(),tab,locked:false};
 },{passive:true});
 root.addEventListener('touchmove',e=>{
  const g=gesture;if(!g)return;if(e.touches.length!==1||!available()||tab!==g.tab){gesture=null;return;}
  const t=e.touches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
  if(!g.locked){if(Math.abs(dy)>10&&Math.abs(dy)>=Math.abs(dx)*0.65){gesture=null;return;}if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)*1.6)g.locked=true;}
  if(g.locked&&e.cancelable)e.preventDefault();
 },{passive:false});
 root.addEventListener('touchend',e=>{
  const g=gesture;gesture=null;if(!g||!available()||tab!==g.tab||performance.now()-g.started>800)return;
  const t=[...e.changedTouches].find(t=>t.identifier===g.id);if(!t)return;
  const dx=t.clientX-g.x,dy=t.clientY-g.y;
  if(Math.abs(dx)<64||Math.abs(dx)<Math.abs(dy)*1.6)return;
  suppressUntil=performance.now()+400;const next=tabs[tabs.indexOf(tab)+(dx<0?1:-1)];if(!next)return;
  goto(next);
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('#'+next).animate?.([{opacity:0.65},{opacity:1}],{duration:160,easing:'ease-out'});
 },{passive:true});
 root.addEventListener('touchcancel',()=>{gesture=null;},{passive:true});
 root.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopPropagation();}},true);
})();

function paint(){if(!state)return;paintWallpaper();const paused=state.pauses.length>0,mine=state.pauses.includes(state.who);$('#pause').textContent=mine?'Allow Echo':'Pause Echo';$('#silence').textContent=mine?'Allow Echo for me':'Pause Echo for me';$('#ask-label').textContent='Echo';$('#echo-power').textContent=state.echoInvited&&!paused?'On':'Off';$('#echo-switch').classList.toggle('is-on',!!state.echoInvited&&!paused);$('#ask').checked=!!state.echoInvited&&!paused;$('#ask').disabled=paused;$('#invite-hint').textContent=paused?'Paused — resume permissions in More':state.echoInvited?'On for both · each message can use AI credit':'Off · stays on when invited';$('#echo-status').textContent=state.jobs.some(j=>j.scope==='shared')?(paused?'Echo is replying once · Just Us stays on':'Echo is replying…'):paused?'Just Us · paused by '+state.pauses.join(' & '):state.aiConnected?(state.echoInvited?'Echo is with you · turn off to silence':'Echo is silent · invite when you want'):'Echo is not connected';paintEchoProfile();$('#recall').textContent=paused?'Ask Echo once to recap':'Ask Echo to recap';$('#stop').hidden=!state.jobs.length;$('#compose').placeholder='Message '+(state.who==='Mahmoud'?'Safy':'Mahmoud')+'…';const mark=tab==='chat'?PlaceScroll.capture($('#timeline')):null;paintFeed();paintProposals();paintPins();if(mark){PlaceScroll.restore($('#timeline'),mark);updateLatest();updateActivityReminder();}if(tab==='space')paintItems();}
function closeFollowups(){followupsOpen=false;$('#activity-list').hidden=true;paintPins();updateActivityReminder();}
$('#followups').onclick=()=>{followupsOpen=!followupsOpen;$('#pinned').open=false;$('#activity-list').hidden=true;paintPins();updateActivityReminder();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state&&followupsOpen)closeFollowups();});
document.addEventListener('pointerdown',e=>{if(state&&followupsOpen&&!e.target.closest('#followups,#pinned,#activity-reminder'))closeFollowups();});
function renderMessageText(parent,message){
 const value=message.text||(message.status==='streaming'?'Echo is thinking…':'');
 if(message.author!=='Echo'){parent.textContent=value;return;}
 function links(root,text){
  const pattern=/\[([^\]\n]+)\]\(([^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)|(https?:\/\/[^\s<>"\u0000-\u001f]+)/gi;let cursor=0,match;
  while((match=pattern.exec(text))){
   let address=match[2]||match[3],label=match[1],tail='';
   if(!label){while(/[.,!?;:،؛؟\]}]$/.test(address)||(address.endsWith(')')&&(address.match(/\)/g)||[]).length>(address.match(/\(/g)||[]).length)){tail=address.slice(-1)+tail;address=address.slice(0,-1);}label=address;}
   let valid=false;try{const url=new URL(address);valid=['https:','http:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}
   root.append(document.createTextNode(text.slice(cursor,match.index)));
   if(valid){const a=document.createElement('a');a.textContent=label;a.href=address;a.target='_blank';a.rel='noopener noreferrer';a.className='message-link';root.append(a);if(tail)root.append(document.createTextNode(tail));}
   else root.append(document.createTextNode(match[0]));
   cursor=pattern.lastIndex;
  }
  if(cursor===0)root.textContent=text;else if(cursor<text.length)root.append(document.createTextNode(text.slice(cursor)));
 }
 parent.replaceChildren();const parts=value.split('**');parts.forEach((part,i)=>{if(i%2){const strong=document.createElement('strong');links(strong,part);parent.append(strong);}else{const span=document.createElement('span');links(span,part);parent.append(span);}});
}
function paintWallpaper(){const image=state.wallpaper?.image,img=$('#chat-wallpaper');img.hidden=!image;if(image){const url='/api/photos/'+image;if(img.getAttribute('src')!==url)img.src=url;}else img.removeAttribute('src');}
let backgroundChoice=null,backgroundData=null,backgroundURL=null,backgroundRevision=0,backgroundBusy=false;
function clearBackgroundPreview(){if(backgroundURL)URL.revokeObjectURL(backgroundURL);backgroundURL=null;backgroundData=null;}
$('#chat-background').onclick=()=>{clearBackgroundPreview();backgroundChoice=state.wallpaper?.image??null;backgroundRevision=state.wallpaper?.revision??0;const preview=$('#background-preview');preview.hidden=!backgroundChoice;if(backgroundChoice)preview.src='/api/photos/'+backgroundChoice;else preview.removeAttribute('src');$('#background-status').textContent='';$('#background-dialog').showModal();};
$('#background-choose').onclick=()=>{if(!backgroundBusy)$('#background-file').click();};
$('#background-file').onchange=async()=>{const file=$('#background-file').files[0];if(!file)return;const epoch=sessionEpoch;backgroundBusy=true;$('#background-save').disabled=true;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a JPG, PNG or WebP up to 5 MB.');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();if(epoch!==sessionEpoch)return;const data=canvas.toDataURL('image/jpeg',.75).split(',')[1];if(data.length>1300000)throw Error('Choose a smaller photo.');clearBackgroundPreview();backgroundData=data;backgroundURL=URL.createObjectURL(file);$('#background-preview').src=backgroundURL;$('#background-preview').hidden=false;$('#background-status').textContent='Ready to save. A dark overlay keeps messages readable.';}catch(e){$('#background-status').textContent=e.message;}finally{backgroundBusy=false;$('#background-save').disabled=false;$('#background-file').value='';}};
$('#background-reset').onclick=()=>{if(backgroundBusy)return;clearBackgroundPreview();backgroundChoice=null;$('#background-preview').hidden=true;$('#background-preview').removeAttribute('src');$('#background-status').textContent='Original background selected. Save to apply.';};
$('#background-save').onclick=async()=>{if(backgroundBusy)return;const epoch=sessionEpoch;backgroundBusy=true;$('#background-save').disabled=true;try{if(backgroundData){const photo=await api('photos',{data:backgroundData});if(epoch!==sessionEpoch)return;backgroundChoice=photo.id;backgroundData=null;}if(epoch!==sessionEpoch)return;await command('wallpaper.set',{image:backgroundChoice,revision:backgroundRevision});await sync();$('#background-dialog').close();clearBackgroundPreview();info('Chat background updated for both of you.');}catch(e){$('#background-status').textContent=e.message;}finally{backgroundBusy=false;$('#background-save').disabled=false;}};
$('#background-cancel').onclick=()=>{if(!backgroundBusy)$('#background-dialog').close();};$('#background-dialog').addEventListener('cancel',e=>{if(backgroundBusy)e.preventDefault();});
$('#background-dialog').addEventListener('close',()=>{if(!backgroundBusy)clearBackgroundPreview();});

function messageDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function dayKey(value){const d=messageDate(value);return d?[d.getFullYear(),d.getMonth()+1,d.getDate()].join('-'):'unknown';}
function dayLabel(value){const d=messageDate(value);if(!d)return 'Date unavailable';const now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);return dayKey(d)===dayKey(now)?'Today':dayKey(d)===dayKey(yesterday)?'Yesterday':new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric'}).format(d);}
function paintFeed(){if(tab!=='chat')return;const f=$('#feed'),scroll=$('#timeline'),mark=PlaceScroll.capture(scroll);for(const n of activityNodes.values())n.remove();f.querySelectorAll('.day-divider').forEach(n=>n.remove());const existing=new Map([...f.children].map(n=>[n.dataset.message,n]));const previousLast=f.lastElementChild?.dataset.message;const merged=[...new Map([...older,...state.messages,...pending.values()].map(m=>[m.id,m])).values()].sort((a,b)=>(a.sequence??Number.MAX_SAFE_INTEGER)-(b.sequence??Number.MAX_SAFE_INTEGER));if(!merged.length){f.replaceChildren();el('p','Your next good conversation starts here.',f,'empty');paintActivity();return;}
 const lastRead=[...merged].reverse().find(m=>m.author===state.who&&m.readAt)?.id;let previous=null;
 let lastDay=null;for(const m of merged){const key=dayKey(m.createdAt);if(key!==lastDay){el('div',dayLabel(m.createdAt),f,'day-divider');lastDay=key;}const grouped=previous?.author===m.author&&dayKey(previous.createdAt)===key&&Math.abs(new Date(m.createdAt)-new Date(previous.createdAt))<300000;previous=m;const signature=JSON.stringify([grouped,lastRead===m.id,state.personal?.profiles,m.deliveredAt,m.text,m.status,m.image,m.reply,m.createdAt,m.readAt,state.messageReactions?.[m.id],(state.pins||[]).some(p=>p.id===m.id)]);const old=existing.get(m.id);if(old&&old.dataset.signature===signature){f.append(old);existing.delete(m.id);continue;}old?.remove();existing.delete(m.id);const row=el('div',null,f,'message '+m.author.toLowerCase()+(m.author===state.who?' mine':''));row.classList.toggle('grouped',!!grouped);row.dataset.message=m.id;row.dataset.author=m.author;row.dataset.sent=String(m.status==='sent');row.dataset.sequence=m.sequence??Number.MAX_SAFE_INTEGER;row.dataset.signature=signature;if(m.author==='Echo'){const avatar=btn('✦',row,openEchoProfile,'avatar echo-profile-trigger');avatar.setAttribute('aria-label','About Echo');avatar.setAttribute('aria-haspopup','dialog');avatar.title='About Echo';}else el('div',m.author[0],row,'avatar');const column=el('div',null,row,'message-column');const meta=el('div',null,column,'message-meta');el('b',m.author,meta);const b=el('div',null,column,'bubble');const date=messageDate(m.createdAt);if(date){const time=el('time',new Intl.DateTimeFormat('en',{hour:'2-digit',minute:'2-digit'}).format(date),meta);time.dateTime=date.toISOString();time.title=new Intl.DateTimeFormat('en',{dateStyle:'full',timeStyle:'long'}).format(date);}if(m.reply){const original=merged.find(x=>x.id===m.reply);el('div',original?original.author+': '+original.text.slice(0,140):'Reply to an earlier message',b,'quote').dir='auto';}const p=el('p',m.text||(m.status==='streaming'?'Echo is thinking…':''),b,m.status==='streaming'?'streaming':'');p.id='text-'+m.id;p.dir='auto';renderMessageText(p,m);if(m.image){const im=el('img',null,b);im.src='/api/photos/'+m.image;im.alt=m.text||'Shared photo';im.loading='lazy';im.dataset.chatPhoto='true';im.tabIndex=0;im.setAttribute('role','button');im.setAttribute('aria-label','Open shared photo');}const footer=el('div',null,column,'message-footer');const receipt=el('small',m.status==='sent'?'✓':m.status==='failed-local'?'Not sent · retry':m.status==='streaming'?'Replying…':'Sending…',footer,'status');receipt.hidden=m.status==='sent'&&(m.author!==state.who||(m.readAt&&m.id!==lastRead));receipt.title=m.status==='sent'?(m.deliveredAt?'Delivered':'Sent'):receipt.textContent;receipt.setAttribute('aria-label',receipt.title);if(m.deliveredAt)receipt.classList.add('delivered');if(m.author===state.who&&m.readAt&&m.id===lastRead){const partner=state.who==='Mahmoud'?'Safy':'Mahmoud';receipt.textContent='';receipt.classList.add('read-receipt');receipt.title='Seen by '+partner;receipt.setAttribute('aria-label',receipt.title);const photo=state.personal?.profiles?.[partner]?.photo;if(photo){const avatar=el('img',null,receipt);avatar.src='/api/photos/'+photo;avatar.alt=receipt.title;}else receipt.textContent=partner[0];}if(m.status==='sent')window.OurComfort?.chatReactions(row,b,m,state);const actions=el('details',null,footer,'message-actions');el('summary','⋯',actions).setAttribute('aria-label','Message actions');row.addEventListener('click',e=>{if(!e.target.closest('button,a,summary,details,img'))row.classList.toggle('message-selected');});if(m.status==='failed-local'){btn('Retry',actions,()=>deliver(m));}else if(m.status==='sent'){btn('React',actions,()=>row.dispatchEvent(new Event('react-request')));btn((state.pins||[]).some(p=>p.id===m.id)?'Unpin for both':'Pin for both',actions,()=>command('message.pin',{id:m.id,value:!(state.pins||[]).some(p=>p.id===m.id)}).then(sync));btn('Reply',actions,()=>{reply=m;paintReply();$('#compose').focus();});btn('Save to Our Space',actions,()=>editItem({type:m.image?'Photo':'Idea',title:m.text||'Shared photo',image:m.image,source:m.id}));if(m.image)btn('Ask Echo about this photo',actions,()=>{attachment={id:m.image,ai:true};if(!state.echoInvited){command('echo.invite',{value:true}).then(sync).catch(error);}paintAttachment();$('#compose').focus();info('Write what you would like Echo to look at.');});}}
 for(const unused of existing.values())unused.remove();paintActivity();PlaceScroll.restore(scroll,mark);updateLatest();window.OurCrown?.decorate();
}
function paintReply(){const r=$('#reply');r.replaceChildren();r.hidden=!reply;if(reply){el('span',reply.author+': '+reply.text.slice(0,140),r).dir='auto';btn('Cancel reply',r,()=>{reply=null;paintReply();});}}
function paintAttachment(){const p=$('#attachment');p.replaceChildren();p.hidden=!attachment;if(attachment){const im=el('img',null,p);im.src=attachment.preview||'/api/photos/'+attachment.id;im.alt='Photo to send';btn('Remove',p,()=>{if(attachment.preview)URL.revokeObjectURL(attachment.preview);attachment=null;paintAttachment();});}}
async function deliver(m){
 m.status='sending';pending.set(m.id,m);paintFeed();
 try{await command('message',m.payload,m.id);}catch(e){m.status='failed-local';paintFeed();info('Not confirmed as sent. Retry safely; it will not send twice.');return;}
 m.status='sent';paintFeed();
 if(m.ask){try{await command('ai.ask',{prompt:m.text||'We shared a photo. Ask us what we would like to discuss; you cannot see it unless explicitly attached for AI.',image:m.inspect?m.image:undefined,session:true},m.aiId||(m.aiId=crypto.randomUUID()));}catch(e){info('Message sent. '+e.message);}}
 try{await sync();}catch(e){info('Message sent. Reconnecting to the conversation…');}
}
$('#composer').onsubmit=async e=>{e.preventDefault();if(sending)return;const value=$('#compose').value.trim();if(!value&&!attachment)return;sending=true;const img=attachment?.id,ask=$('#ask').checked,m={id:crypto.randomUUID(),author:state.who,createdAt:new Date().toISOString(),text:value,image:img,reply:reply?.id,status:'sending',payload:{text:value,image:img,reply:reply?.id},ask,inspect:!!attachment?.ai};$('#compose').value='';attachment=null;reply=null;paintReply();paintAttachment();sending=false;await deliver(m);};
$('#compose').onkeydown=e=>{if(!e.isComposing&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){$('#composer').requestSubmit();}};
$('#photo').onclick=()=>$('#upload').click();$('#upload').onchange=async()=>{const file=$('#upload').files[0];if(!file)return;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a JPG, PNG or WebP photo up to 5 MB.');info('Preparing photo…');const bitmap=await createImageBitmap(file);const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const data=canvas.toDataURL('image/jpeg',.78);const uploaded=await api('photos',{data:data.split(',')[1]});attachment={id:uploaded.id};paintAttachment();info('Photo ready. Select Ask Echo only if you want AI to inspect it.');}catch(e){error(e);}finally{$('#upload').value='';}};
$('#ask').onchange=async()=>{const value=$('#ask').checked;$('#ask').disabled=true;try{await command('echo.invite',{value});await sync();}catch(e){error(e);paint();}};
async function pause(){await command('pause',{value:!state.pauses.includes(state.who)});await sync();}$('#pause').onclick=()=>pause().catch(error);$('#silence').onclick=$('#pause').onclick;$('#stop').onclick=()=>command('ai.cancel').then(sync).catch(error);
$('#memory')?.remove();
el('style',`
#our-place-trial .echo-profile-trigger{padding:0;min-height:34px;align-self:flex-start;position:relative}
#our-place-trial .echo-profile-trigger::after{content:"";position:absolute;inset:-5px}
#our-place-trial .echo-profile-trigger:focus-visible{outline:2px solid #D1B078;outline-offset:3px}
#our-place-trial .echo-profile{width:min(420px,calc(100vw - 32px));box-sizing:border-box;max-height:85dvh;overflow:auto;padding:24px}
#our-place-trial .echo-profile-heading{display:flex;align-items:center;gap:14px}
#our-place-trial .echo-profile-heading h2{margin:0;color:#D1B078}
#our-place-trial .echo-profile-symbol{display:grid;place-items:center;width:56px;height:56px;flex-shrink:0;border-radius:50%;background:#3e3222;border:1px solid #90754a;color:#edce96;font-size:30px}
#our-place-trial .echo-profile-close{margin-left:auto;min-width:44px;font-size:24px;padding:4px}
#our-place-trial .echo-profile p{line-height:1.65}
#our-place-trial .echo-profile-memory{border-top:1px solid #51404d;padding-top:16px;margin-top:20px}
#our-place-trial .echo-profile-memory summary{cursor:pointer;min-height:44px;color:#D1B078}
#our-place-trial .echo-profile-memory li{margin:10px 0;line-height:1.6}
@media(max-width:600px){#our-place-trial .echo-profile-trigger{min-height:27px}}
`,document.head);
function paintEchoProfile(){const status=$('#echo-profile-status');if(status&&state)status.textContent=$('#echo-status').textContent;}
function openEchoProfile(){
 if(!state||$('#echo-profile'))return;
 const opener=document.activeElement,dialog=el('dialog',null,$('#our-place-trial'),'echo-profile');
 dialog.id='echo-profile';dialog.setAttribute('aria-labelledby','echo-profile-title');
 const heading=el('div',null,dialog,'echo-profile-heading');
 el('span','✦',heading,'echo-profile-symbol').setAttribute('aria-hidden','true');
 el('h2','Echo',heading).id='echo-profile-title';
 const close=btn('×',heading,()=>dialog.close(),'echo-profile-close');close.setAttribute('aria-label','Close Echo profile');
 el('p','Your AI companion in Our Place — here to talk, play, and help you plan together.',dialog);
 const status=el('p','',dialog,'muted');status.id='echo-profile-status';status.setAttribute('role','status');paintEchoProfile();
 const memory=el('details',null,dialog,'echo-profile-memory');el('summary','Memory & context',memory);
 el('p','What Echo can use when replying:',memory,'muted');
 const list=el('ul',null,memory);
 for(const text of ['Up to 50 recent shared messages.','The current activity.','Up to 30 notes marked as memory.'])el('li',text,list);
 el('p','Just Us messages are excluded. Older chat is saved, but it is not all sent with every request.',memory,'muted');
 el('p','To choose what Echo remembers from Our Space, edit a post and open Echo memory.',memory,'muted');
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});},{once:true});
 dialog.showModal();close.focus({preventScroll:true});
}
$('#recall').onclick=()=>command('ai.ask',{prompt:'What are our current plans and where did we stop? Only use the memories available to you.',once:state.pauses.length>0}).then(sync).catch(error);
async function loadOlder(){if(historyBusy||historyEnd)return;const first=[...older,...state.messages].sort((a,b)=>a.sequence-b.sequence)[0];if(!first)return;const epoch=sessionEpoch;historyBusy=true;$('#older').disabled=true;$('#load-earlier').disabled=true;$('#history-status').textContent='Loading earlier messages…';try{const batch=await api('history?before='+encodeURIComponent(first.sequence));if(epoch!==sessionEpoch||!state)return;const mark=PlaceScroll.capture($('#timeline'));older=[...new Map([...batch,...older].map(m=>[m.id,m])).values()].sort((a,b)=>a.sequence-b.sequence);historyEnd=batch.length===0;paintFeed();if(tab==='chat'){mark.end=false;PlaceScroll.restore($('#timeline'),mark);}$('#history-status').textContent=historyEnd?'Beginning of your conversation':'';}catch(e){if(epoch!==sessionEpoch)return;$('#history-status').textContent='Could not load earlier messages. Use More → Earlier messages to retry.';error(e);}finally{if(epoch===sessionEpoch){historyBusy=false;$('#older').disabled=historyEnd;$('#load-earlier').disabled=historyEnd;}}}
$('#older').onclick=$('#load-earlier').onclick=loadOlder;
function paintPins(){const root=$('#pinned');root.replaceChildren();const pins=state.pins||[];root.hidden=!pins.length||!followupsOpen;if(!pins.length)return;el('summary','Pinned · '+pins.length,root);for(const pin of pins){const row=el('div',null,root,'row');btn(pin.author+': '+pin.text.slice(0,90),row,()=>{closeFollowups();return openSource(pin.id);},'grow');btn('Unpin',row,()=>command('message.pin',{id:pin.id,value:false}).then(sync));}}
function activities(){return state?.activities??(state?.activity?[state.activity]:[]);}
function paintActivity(){const feed=$('#feed'),all=activities();for(const [id,node]of activityNodes)if(!all.some(a=>a.id===id)){node.remove();activityNodes.delete(id);}
 for(const a of all){let node=activityNodes.get(a.id);if(!node){node=document.createElement('div');node.dataset.activity=a.id;activityNodes.set(a.id,node);}renderActivity(a,node);const after=[...feed.querySelectorAll('[data-message]')].find(m=>Number(m.dataset.sequence)>(a.afterSequence??0));feed.insertBefore(node,after||null);}
 updateActivityReminder();
}
function updateActivityReminder(){const active=activities().filter(a=>a.status==='active'),root=$('#activity-reminder');const pending=(state?.proposals||[]).filter(p=>p.type!=='quiz');const count=active.length+pending.length+(state?.pins?.length||0)+(state?.personal?.reminders?.length||0);if(!count)followupsOpen=false;$('#followup-count').textContent=count;$('#followups').disabled=!count;$('#followups').setAttribute('aria-label',count+' reminders');$('#followups').setAttribute('aria-expanded',String(followupsOpen));window.OurPersonal?.showReminders(followupsOpen&&tab==='chat');root.hidden=(!active.length&&!pending.length)||tab!=='chat'||!followupsOpen;$('#resume-activities').hidden=!active.length;if(root.hidden||!active.length)return;const a=active[0];$('#resume-activities').textContent=active.length>1?'Activities · '+active.length:a.target===state.who?'Continue quiz · '+(a.index+1)+'/'+a.total:'Waiting for '+a.target+' · '+(a.index+1)+'/'+a.total;
}
function resumeActivity(id){closeFollowups();const node=activityNodes.get(id);if(node){const root=$('#timeline');root.scrollTop+=node.getBoundingClientRect().top-root.getBoundingClientRect().top;}updateActivityReminder();}
$('#resume-activities').onclick=()=>{const active=activities().filter(a=>a.status==='active');if(active.length===1)return resumeActivity(active[0].id);const list=$('#activity-list');list.replaceChildren();list.hidden=!list.hidden;for(const a of active)btn((a.title||'Quiz')+' · '+a.target+' · '+(a.index+1)+'/'+a.total,list,()=>resumeActivity(a.id));};
function renderActivity(a,parent){
 const signature=JSON.stringify([a,state.pauses,state.who]);if(parent.dataset.signature===signature)return;
 parent.dataset.signature=signature;const key=a?.id+':'+a?.index;
 const previousInput=parent.querySelector('.free-answer'),answer=parent.dataset.question===key?(previousInput?.value??''):'';
 const focused=previousInput&&document.activeElement===previousInput;parent.dataset.question=key;parent.replaceChildren();if(!a)return;
 const card=el('section',null,parent,'activity');el('div',(a.host||a.owner)+' → '+a.target,card,'label');
 const feedback=(a.feedback||[]).filter(f=>f.status==='sent').at(-1),pending=(a.feedback||[]).some(f=>f.status==='running');
 if(feedback){const reaction=el('div',null,card,'activity-reaction');el('div','✦ Echo',reaction,'label');el('p',feedback.text,reaction).dir='auto';}
 if(pending)el('p','Echo is reacting…',card,'muted');
 if(a.status!=='active'){
  el('h3',a.status==='completed'?'Round complete':'Round ended early',card);
  el('p',a.answers.length+' / '+a.total+' answered'+(a.max?' · '+a.score+' / '+a.max+' points':' · Just for fun'),card);
  const history=el('details',null,card);el('summary','Your answers',history);
  for(const v of a.answers)el('p',v.q+' → '+v.answer,history).dir='auto';
  if(state.who===a.target){
   if(!pending&&a.answers.length&&!(a.feedback||[]).some(f=>f.final&&f.status==='sent'))btn('Ask Echo to wrap up',card,()=>command('quiz.react',{activity:a.id}).then(sync));
   if(a.sharedPost)el('p','Shared to wall',card,'muted');
   else btn('Share to wall',card,()=>command('quiz.share',{activity:a.id}).then(sync));
  }
  return;
 }
 const paused=a.pauses.length||state.pauses.length;
 el('h3',paused?'Paused — your place is kept':'A question for '+a.target,card);
 if(paused)el('p','Paused by '+[...new Set([...a.pauses,...state.pauses])].join(' & ')+'. Each person must release their own pause.',card,'muted');
 el('div','Question '+(a.index+1)+' of '+a.total+(a.max?' · '+a.score+' / '+a.max+' points':' · Just for fun'),card,'muted');
 el('h3',a.current.q,card).dir='auto';const disabled=!!paused||state.who!==a.target;
 if(state.who!==a.target)el('p','Waiting for '+a.target+' to answer.',card,'muted');
 const submit=async data=>{await command('quiz.answer',{activity:a.id,index:a.index,...data});await sync();};
 if(a.current.options.length){
  const opts=el('div',null,card,'options');a.current.options.forEach((o,i)=>{const b=btn(o,opts,()=>submit({option:i}));b.dir='auto';b.disabled=disabled;});
 }else{
  const form=el('form',null,card,'row'),input=el('input',null,form,'grow');input.classList.add('free-answer');input.dir='auto';input.placeholder='Your answer…';input.setAttribute('aria-label','Your answer');input.required=true;input.maxLength=1000;input.value=answer;input.disabled=disabled;
  const b=el('button','Answer',form);b.disabled=disabled;form.onsubmit=e=>{e.preventDefault();submit({answer:input.value}).catch(error);};if(focused)input.focus({preventScroll:true});
 }
 const controls=el('div',null,card,'row toolbar');
 btn(a.pauses.includes(state.who)?'Resume my activity permission':'Pause activity',controls,()=>command('quiz.pause',{activity:a.id,value:!a.pauses.includes(state.who)}).then(sync));
 btn('End',controls,()=>command('quiz.end',{activity:a.id}).then(sync));
}
$('#space-generate').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await command('ai.ask',{purpose:'space',prompt:$('#space-prompt').value.trim()||'Prepare a complete, enjoyable evening plan for two with a short sequence of things to do. Use suggested timing, not invented commitments.',once:state.pauses.length>0});await sync();info('Echo is preparing a suggestion. Review it before saving.');}catch(e){error(e);}finally{b.disabled=false;}};
function paintProposals(){for(const id of ['proposals','space-proposals']){const root=$('#'+id);root.replaceChildren();state.proposals.filter(p=>p.type==='item').forEach(p=>{const b=btn('✦ Suggested '+(p.itemType||'idea').toLowerCase()+' · '+p.title.split('\n')[0].slice(0,80),root,()=>openProposal(p),'proposal-reminder');b.dir='auto';});}}
function openProposal(p){
 closeFollowups();const dialog=el('dialog',null,$('#our-place-trial'),'proposal-dialog');dialog.setAttribute('aria-label','Echo suggestion');
 el('h2','Suggestion from Echo',dialog);el('p','Not scheduled or saved yet.',dialog,'muted');el('div',p.title,dialog,'proposal-content').dir='auto';
 const status=el('p','',dialog);status.setAttribute('role','alert');const actions=el('div',null,dialog,'row');
 let busy=false;const finish=async type=>{if(busy)return;busy=true;save.disabled=dismiss.disabled=true;try{await command(type,{job:p.job,index:p.index});dialog.close();await sync();info(type==='proposal.accept'?'Saved to Our Space.':'Suggestion dismissed.');}catch(e){status.textContent=e.message;}finally{busy=false;save.disabled=dismiss.disabled=false;}};
 const save=btn('Save to Our Space',actions,()=>finish('proposal.accept'),'primary');const dismiss=btn('Dismiss',actions,()=>finish('proposal.dismiss'));const back=btn('Back',actions,()=>dialog.close());
 dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.showModal();back.focus({preventScroll:true});
}
async function accept(p){const r=await command('proposal.accept',{job:p.job,index:p.index});await sync();goto('space');}
const wall=OurWall({getState:()=>state,api,command,sync,goto,info,error,el,btn,categories,getFilter:()=>filter,setFilter:v=>filter=v,openSource});
function paintItems(){wall.paint();}
function editItem(item){wall.edit(item);}
$('.room-tools').addEventListener('click',e=>{if(e.target.closest('button,a'))$('.room-tools').open=false;});$('#space-search').oninput=paintItems;function updateLatest(){const f=$('#timeline'),away=f.scrollHeight-f.scrollTop-f.clientHeight>=60;$('#latest').hidden=!away;$('#jump-latest').hidden=!away;}
$('#latest').onclick=$('#jump-latest').onclick=()=>{$('#timeline').scrollTop=$('#timeline').scrollHeight;updateLatest();};
$('#timeline').onscroll=()=>{updateLatest();updateActivityReminder();};

async function openSource(id){const m=await api('messages/'+encodeURIComponent(id));if(!m)throw Error('The original message is unavailable.');older=[...new Map([...older,m].map(x=>[x.id,x])).values()].sort((a,b)=>a.sequence-b.sequence);goto('chat');paintFeed();const row=[...$('#feed').children].find(n=>n.dataset.message===id);row?.scrollIntoView({block:'center'});row?.classList.add('source-highlight');}
$('#continue-play').onclick=()=>goto('chat');
function recoverConnection(){if(!state||document.hidden)return;connect();sync().catch(error);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)recoverConnection();});window.addEventListener('online',recoverConnection);window.addEventListener('pageshow',e=>{if(e.persisted)recoverConnection();});
setInterval(()=>{if(state&&!document.hidden&&(source?.readyState!==1||Date.now()-lastEvent>45000)){connect();sync().catch(()=>{});}},8000);
window.OurComfort?.init({sync:async()=>{await sync();if(state&&source?.readyState!==1)connect();},command,api,info});
const revealPanel=selector=>PlaceScroll.reveal($('.shell'),$(selector));
window.OurDraw?.init({api,command,sync,goto,revealPanel});window.OurOcho?.init({command,sync,goto,revealPanel});window.OurDomino?.init({command,sync,goto,revealPanel});
window.OurMedia?.init({api,command,sync,goto,info,revealPanel});window.OurPersonal?.init({api,command,sync,goto,info});window.OurCourt?.init({api,command,sync,goto,info,revealPanel});
window.readTracker=window.OurReads?.({getState:()=>state,isChat:()=>tab==='chat'&&!$('#chat').hidden,send:ids=>api('read',{ids})});
sync().then(connect).catch(e=>{if(state)error(e);}).finally(()=>{setTimeout(()=>{const splash=$('#welcome-splash');splash.classList.add('leaving');setTimeout(()=>splash.hidden=true,250);},Math.max(0,2000-(performance.now()-openingStarted)));});
window.addEventListener('our-place-notification',event=>{Promise.resolve().then(async()=>{
 const target=event.detail;if(!state||!target)return;await sync();goto(target.tab);
 if(target.tab==='chat'){if(target.activity)resumeActivity(target.activity);else if(target.message)await openSource(target.message);}
 if(target.tab==='space'&&target.post){filter='All';paintItems();const post=[...document.querySelectorAll('[data-post]')].find(n=>n.dataset.post===target.post);post?.scrollIntoView({block:'center'});const comments=post?.querySelector('.wall-comments');if(comments)comments.open=true;}
 if(target.tab==='together'&&target.game==='race')window.OurRace?.openTogether();
 if(target.tab==='together'&&['ocho','domino','draw','media','court'].includes(target.game)){
 if(target.game==='court')window.OurCourt?.openNotification(target.caseId);
 else if(target.game==='media')window.OurMedia?.openNotification();
 else document.getElementById(target.game+'-open')?.click();
 const panel=document.getElementById(target.game+'-panel');
 if(target.game==='draw')[...panel?.querySelectorAll('button')||[]].find(b=>b.textContent==='Draw & Guess')?.click();
 if(['ocho','domino'].includes(target.game))[...panel?.querySelectorAll('button')||[]].find(b=>/^(Play together|Together|With Safy|With Mahmoud)$/.test(b.textContent))?.click();
 }
}).catch(error);});
})();




