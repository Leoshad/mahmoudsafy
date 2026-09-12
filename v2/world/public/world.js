const $=id=>document.getElementById(id), canvas=$('scene'),ctx=canvas.getContext('2d');
const points={center:[320,230],arch:[490,145],edge:[155,170],mirror:[475,290]};
let state=null,paintedRevision=-1,knownMessages=0,lastFocus=null,submitting=false;
let noticeTimer;
function notice(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,7000);}
async function api(path,body){const res=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await res.json();if(!res.ok){if(res.status===401&&path!=='login')showLogin();throw Error(data.error??'Connection unavailable');}return data;}
function showLogin(){state=null;$('login').hidden=false;$('experience').hidden=true;$('privacy').hidden=true;$('logout').hidden=true;}
async function refresh(){try{const next=await api('state');state=next;$('login').hidden=true;$('experience').hidden=false;$('privacy').hidden=false;$('logout').hidden=false;render();}catch(e){if(state){$('connection').textContent='Reconnecting…';} }}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('login',{actor:$('actor').value,passphrase:$('passphrase').value});$('passphrase').value='';await refresh();}catch(e){notice(e.message);}});
$('logout').onclick=async()=>{try{await api('logout',{});showLogin();}catch(e){notice(e.message);}};
async function command(data){const result=await api('command',{id:crypto.randomUUID(),...data});if(result.message)notice(result.message);await refresh();return result;}
$('privacy').onclick=()=>command({type:'pause',value:!state.paused[state.actor]}).catch(e=>notice(e.message));
for(const button of document.querySelectorAll('[data-place]'))button.onclick=()=>command({type:'move',target:button.dataset.place}).catch(e=>notice(e.message));
function chat(open){$('conversation').hidden=!open;$('chat-toggle').setAttribute('aria-expanded',String(open));if(open){lastFocus=document.activeElement;$('unread').textContent='';$('draft').focus();}else{lastFocus?.focus();}}
$('chat-toggle').onclick=()=>chat($('conversation').hidden);$('chat-close').onclick=()=>chat(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('conversation').hidden)chat(false);$('object').hidden=true;}});
function recipientHelp(){const ai=$('recipient').value==='ai';$('composer-help').textContent=ai?'Both of you can read this. This message goes to Echo.':'Visible to both of you. Not sent to AI.';$('draft').placeholder=ai?'Tell Echo an idea. Ask something unexpected…':"Say what's on your mind…";updateSend();}
function updateSend(){if(!state)return;const ai=$('recipient').value==='ai';$('send').disabled=submitting||(ai&&(!state.connected||state.busy||Object.values(state.paused).some(Boolean)));}
$('recipient').onchange=recipientHelp;
$('composer').onsubmit=async e=>{e.preventDefault();const draft=$('draft'),text=draft.value.trim(),to=$('recipient').value;if(!text||submitting)return;submitting=true;updateSend();try{const result=await command({type:'message',text,to});if(result.status!=='failed'&&draft.value.trim()===text)draft.value='';}catch(e){notice(e.message);}finally{submitting=false;updateSend();}};
function render(){
 const paused=Object.entries(state.paused).filter(([,v])=>v).map(([k])=>k);
 $('privacy').textContent=state.paused[state.actor]?'Release my pause':'Just Us';$('privacy').setAttribute('aria-pressed',String(state.paused[state.actor]));
 $('connection').textContent=paused.length?'Just Us · Echo paused':state.connected?'Echo connected':'AI not connected';
 $('thinking').textContent=state.busy?'Echo is thinking…':'';
 $('privacy-note').textContent=paused.length?`Echo is paused by ${paused.join(' & ')}. Your conversation stays out of its context. Each person controls their own pause.`:"Messages to each other stay out of Echo's context. Messages addressed to Echo are shared with the AI provider.";
 $('allowance').textContent=`AI trial allowance · $${state.testRemainingUSD.toFixed(2)} reserved balance`;
 $('mood').textContent={still:'Suspended between here and somewhere.',embers:'Small lights drift through the dark.',rose:'A rose-coloured hush settles in.'}[state.mood];
 for(const b of document.querySelectorAll('[data-place]')){b.classList.toggle('active',state.positions[state.actor]===b.dataset.place);b.disabled=b.dataset.place==='arch'&&!state.bridge;}
 updateSend();
 if(paintedRevision===state.revision)return;paintedRevision=state.revision;
 const list=$('messages'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<70;
 list.replaceChildren();
 if(!state.messages.length){const p=document.createElement('p');p.className='empty';p.textContent='No script. Start with something only you would say.';list.append(p);}
 for(const m of state.messages){const item=document.createElement('article');item.className='message '+m.actor.toLowerCase();const who=document.createElement('span');who.className='who';who.textContent=m.actor+(m.actor==='Echo'?' · AI':m.audience==='ai'?' → Echo':' → Each other');const p=document.createElement('p');p.dir='auto';p.textContent=m.text;item.append(who,p);list.append(item);}
 if(nearBottom)list.scrollTop=list.scrollHeight;
 if($('conversation').hidden&&state.messages.length>knownMessages)$('unread').textContent='•';knownMessages=state.messages.length;
 draw(performance.now());
}
function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
function platform(x,y,w,h){polygon([[x-w,y],[x,y-h],[x+w,y],[x,y+h]],'#37323e');polygon([[x-w,y],[x,y+h],[x,y+h+20],[x-w+6,y+18]],'#211f2a');polygon([[x,y+h],[x+w,y],[x+w-7,y+19],[x,y+h+20]],'#2a2632');ctx.strokeStyle='#736374';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-w,y);ctx.lineTo(x,y-h);ctx.lineTo(x+w,y);ctx.stroke();}
function avatar(name,place,index,t){const [x,y]=points[place],shared=Object.keys(state.positions).filter(k=>state.positions[k]===place),offset=(shared.indexOf(name)-(shared.length-1)/2)*18,xx=x+offset,yy=y-5;
 ctx.fillStyle='#0006';ctx.fillRect(xx-7,yy+9,16,4);
 ctx.fillStyle=name==='Mahmoud'?'#c2a77d':name==='Safy'?'#b98aa3':'#bab4d5';
 if(name==='Echo'){ctx.globalAlpha=.8;polygon([[xx,yy-16],[xx+7,yy-5],[xx,yy+6],[xx-7,yy-5]],ctx.fillStyle);ctx.globalAlpha=1;ctx.fillStyle='#f4e9d2';ctx.fillRect(xx-2,yy-7,4,4);}else{ctx.fillRect(xx-4,yy-15,8,8);ctx.fillRect(xx-6,yy-5,12,10);ctx.fillStyle='#29232d';ctx.fillRect(xx-4,yy+5,3,5);ctx.fillRect(xx+1,yy+5,3,5);ctx.fillStyle=name==='Safy'?'#453343':'#3b3030';ctx.fillRect(xx-5,yy-17,10,4);}
 ctx.font='8px system-ui';ctx.textAlign='center';ctx.fillStyle='#e8dde5';ctx.fillText(name,xx,yy+25);
}
function draw(t){if(!state)return;const w=640,h=400;ctx.clearRect(0,0,w,h);ctx.fillStyle='#101019';ctx.fillRect(0,0,w,h);
 const g=ctx.createRadialGradient(365,170,15,365,190,280);g.addColorStop(0,state.mood==='rose'?'#483042':state.mood==='embers'?'#40322c':'#2a263c');g.addColorStop(1,'#101019');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 for(let i=0;i<75;i++){const x=(i*157+37)%640,y=(i*79+23)%370;ctx.fillStyle=i%4?'#777083':'#ba9a79';ctx.globalAlpha=.2+(i%3)*.12;ctx.fillRect(x,y,i%7?1:2,1);}ctx.globalAlpha=1;
 // Broken orbital rings: architecture, never a cottage or garden.
 ctx.strokeStyle='#514358';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(324,161,139,65,-.45,.15,5.6);ctx.stroke();ctx.strokeStyle='#78604e';ctx.beginPath();ctx.ellipse(324,161,113,109,.48,.4,4.8);ctx.stroke();
 ctx.fillStyle='#d1b486';ctx.fillRect(366,40,4,4);ctx.fillStyle='#aa788f';ctx.fillRect(207,201,3,3);
 polygon([[172,175],[178,168],[321,222],[315,229]],'#534750');polygon([[326,236],[333,228],[473,280],[466,289]],'#534750');
 if(state.bridge){polygon([[331,216],[323,210],[475,143],[482,151]],'#9a8062');for(let i=0;i<14;i++){ctx.fillStyle='#d1b486';ctx.fillRect(338+i*10,207-i*4.5,6,2);}}
 platform(320,233,94,42);platform(155,173,52,26);platform(490,148,51,26);platform(475,293,61,30);
 // Observatory's split plinth and floating lens.
 ctx.fillStyle='#746272';ctx.fillRect(295,185,8,40);ctx.fillRect(337,185,8,40);ctx.fillStyle='#c3a778';ctx.fillRect(295,180,50,4);
 ctx.strokeStyle='#ba91a7';ctx.lineWidth=3;ctx.beginPath();ctx.arc(320,162,17,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#cec3d9';ctx.fillRect(318,159,4,6);
 ctx.fillStyle=state.bridge?'#aa8d6c':'#51434f';ctx.fillRect(476,99,6,40);ctx.fillRect(504,99,6,40);ctx.fillRect(479,94,28,6);
 ctx.fillStyle='#9c809f';ctx.fillRect(471,251,7,25);ctx.fillStyle='#43364e';ctx.fillRect(469,253,11,20);ctx.fillStyle='#ceafbd';ctx.fillRect(474,257,2,12);
 for(const [place,obj]of Object.entries(state.objects)){const [x,y]=points[place];ctx.fillStyle='#d7b889';polygon([[x+24,y-23],[x+29,y-16],[x+24,y-9],[x+19,y-16]],'#d7b889');ctx.font='8px system-ui';ctx.textAlign='center';ctx.fillText(obj.label.slice(0,25),x+24,y-30);}
 Object.entries(state.positions).forEach(([name,place],i)=>avatar(name,place,i,t));
 if(state.mood!=='still'){ctx.fillStyle=state.mood==='rose'?'#c28baf':'#ccab72';for(let i=0;i<15;i++){const y=(i*31+(reduceMotion?0:t/120))%340;ctx.globalAlpha=.35;ctx.fillRect((i*71)%600+20,y,2,2);}ctx.globalAlpha=1;}
}
canvas.addEventListener('click',e=>{if(!state)return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*640/r.width,y=(e.clientY-r.top)*400/r.height;const hit=Object.entries(points).find(([,p])=>Math.hypot(p[0]-x,p[1]-y)<42);if(!hit)return;const [place]=hit,obj=state.objects[place];if(obj){$('object').querySelector('h3').textContent=obj.label;$('object').querySelector('p').textContent=obj.description;$('object').hidden=false;}else command({type:'move',target:place}).catch(e=>notice(e.message));});
$('object-close').onclick=()=>$('object').hidden=true;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let last=0;function animate(t){if(!document.hidden&&t-last>80){draw(t);last=t;}requestAnimationFrame(animate);}if(!reduceMotion)requestAnimationFrame(animate);
await refresh();setInterval(()=>{if(!document.hidden)refresh();},1200);
