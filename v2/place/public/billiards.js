// Billiards (8-ball) for Our Place. The server decides every shot; this file draws the table,
// lets you aim, set power and spin, and replays each shot with the same physics the server used.
import {TABLE,POCKETS,GROUP,Shot,aimGuide,placeable} from './billiards-physics.mjs';
const $=s=>document.querySelector(s);
const make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
const {width:W,height:H,radius:R}=TABLE,FRAME=32,COLORS=['#f6f1e4','#e8b923','#2563b5','#d23c33','#6b3fa0','#e0762a','#2f8a4f','#8e2a2a','#151515','#e8b923','#2563b5','#d23c33','#6b3fa0','#e0762a','#2f8a4f','#8e2a2a'];
let host,who=null,data={},mode='solo',opened=false,busy=false,version=-1,clockOffset=0,signature='';
let aim=-Math.PI/2,power=0,follow=0,side=0,place=null,dragging=null,anim=null,seen={},soundOn=true,audio=null,spinOpen=false;
const view={};
try{soundOn=localStorage.getItem('our-place:billiards:sound')!=='off';}catch{}
const game=()=>data[mode];
const live=g=>!!g&&['active','complete'].includes(g.status);
const other=()=>who==='Mahmoud'?'Safy':'Mahmoud';
const myTurn=g=>g?.status==='active'&&g.turn===who&&!g.choice&&!anim;

// ---------- sound ----------
function soundButton(){const b=$('#billiards-sound');b.textContent=soundOn?'Sound on':'Muted';b.setAttribute('aria-pressed',String(soundOn));}
function unlock(){if(!soundOn)return;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;audio??=new A();if(audio.state!=='running')audio.resume().catch(()=>{});}catch{}}
function click(kind,strength=.5){
 if(!soundOn||document.hidden||!opened||audio?.state!=='running')return;
 try{const now=audio.currentTime,v=Math.min(1,.15+strength)*(kind==='ball'?.5:kind==='cue'?.35:.4);
  const len=kind==='pocket'?.22:kind==='rail'?.09:.05,buf=audio.createBuffer(1,Math.ceil(audio.sampleRate*len),audio.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++){const t=i/audio.sampleRate,decay=Math.exp(-t*(kind==='pocket'?18:kind==='rail'?45:90));d[i]=(Math.random()*2-1)*decay;}
  const src=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();src.buffer=buf;f.type=kind==='ball'||kind==='cue'?'bandpass':'lowpass';f.frequency.value=kind==='ball'?2600:kind==='cue'?1400:kind==='rail'?420:260;f.Q.value=kind==='ball'?3:1;g.gain.value=v;
  src.connect(f);f.connect(g);g.connect(audio.destination);src.start(now);src.onended=()=>{src.disconnect();f.disconnect();g.disconnect();};
 }catch{}
}

// ---------- shell ----------
function save(){try{if(who)localStorage.setItem('our-place:billiards:'+who,JSON.stringify({mode,opened}));}catch{}}
function focused(){return opened&&live(game());}
function show(){const p=$('#billiards-panel');p.hidden=!opened;p.classList.toggle('billiards-focused',focused());$('#billiards-open').hidden=opened;document.body.classList.toggle('billiards-locked',focused());save();}
function error(e){$('#billiards-error').textContent=e?.message||'Could not connect. Your game is saved.';}
function btn(label,root,fn,cls){const b=make('button',label,root,cls);b.type='button';b.disabled=busy;b.onclick=()=>{unlock();return Promise.resolve(fn()).catch(error);};return b;}
async function command(type,payload={},g=game()){
 if(busy)return false;busy=true;$('#billiards-error').textContent='';let ok=false;render(true);
 try{await host.command('billiards.'+type,{...(g?{game:g.id,revision:g.revision}:{}),...payload});await host.sync();ok=true;}
 catch(e){await host.sync().catch(()=>{});error(e);}
 finally{busy=false;render(true);}
 return ok;
}
async function leave(chat=false){opened=false;show();if(chat)host.goto('chat');}

// ---------- drawing ----------
function setupCanvas(){
 const box=view.tableBox,c=view.canvas;if(!box||!c)return;
 const availW=box.clientWidth,availH=focused()?box.clientHeight:Math.min(window.innerHeight*.7,availW*2.2),scale=Math.max(.2,Math.min(availW/(W+FRAME*2),availH/(H+FRAME*2)));
 const cssW=Math.floor((W+FRAME*2)*scale),cssH=Math.floor((H+FRAME*2)*scale),dpr=Math.min(3,window.devicePixelRatio||1);
 if(c._w!==cssW||c._h!==cssH||c._dpr!==dpr){c.style.width=cssW+'px';c.style.height=cssH+'px';c.width=Math.round(cssW*dpr);c.height=Math.round(cssH*dpr);c._w=cssW;c._h=cssH;c._dpr=dpr;view.felt=null;}
 view.scale=scale;view.dpr=dpr;draw();
}
function feltLayer(){
 if(view.felt)return view.felt;const c=document.createElement('canvas'),s=view.scale*view.dpr;c.width=view.canvas.width;c.height=view.canvas.height;const x=c.getContext('2d');x.setTransform(s,0,0,s,FRAME*s,FRAME*s);
 const wood=x.createLinearGradient(-FRAME,0,W+FRAME,0);wood.addColorStop(0,'#3b2717');wood.addColorStop(.5,'#5d3d23');wood.addColorStop(1,'#3b2717');x.fillStyle=wood;round(x,-FRAME,-FRAME,W+FRAME*2,H+FRAME*2,34);x.fill();
 x.strokeStyle='#c8a26b';x.lineWidth=2;round(x,-FRAME+5,-FRAME+5,W+FRAME*2-10,H+FRAME*2-10,30);x.stroke();
 x.fillStyle='#17513a';x.fillRect(-12,-12,W+24,H+24);
 const felt=x.createRadialGradient(W/2,H/2,80,W/2,H/2,H*.65);felt.addColorStop(0,'#2a8a5f');felt.addColorStop(1,'#1d6646');x.fillStyle=felt;x.fillRect(0,0,W,H);
 x.fillStyle='#e8d3a8';for(const t of [.25,.5,.75]){for(const [px,py] of [[W*t,-22],[W*t,H+22]]){x.beginPath();x.arc(px,py,2.6,0,7);x.fill();}}for(const t of [.125,.375,.625,.875]){for(const [px,py] of [[-22,H*t],[W+22,H*t]]){x.beginPath();x.arc(px,py,2.6,0,7);x.fill();}}
 x.strokeStyle='#ffffff22';x.lineWidth=1.5;x.beginPath();x.moveTo(0,TABLE.headString);x.lineTo(W,TABLE.headString);x.stroke();x.fillStyle='#ffffff30';x.beginPath();x.arc(W/2,TABLE.footSpot,3,0,7);x.fill();
 POCKETS.forEach(([px,py],i)=>{const r=i===2||i===3?27:30;x.fillStyle='#0b0d0c';x.beginPath();x.arc(px,py,r,0,7);x.fill();x.strokeStyle='#8a6a43';x.lineWidth=3;x.stroke();});
 return view.felt=c;
}
function round(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
function ball(x,b,alpha=1){
 x.save();x.globalAlpha=alpha;x.translate(b.x,b.y);
 x.fillStyle='#00000040';x.beginPath();x.ellipse(2.5,3.5,R,R*.9,0,0,7);x.fill();
 x.beginPath();x.arc(0,0,R,0,7);x.closePath();x.save();x.clip();
 if(b.id>8){x.fillStyle='#f6f1e4';x.fillRect(-R,-R,2*R,2*R);x.fillStyle=COLORS[b.id];x.fillRect(-R,-R*.52,2*R,R*1.04);}else{x.fillStyle=COLORS[b.id];x.fillRect(-R,-R,2*R,2*R);}
 const shade=x.createRadialGradient(-R*.35,-R*.4,R*.15,0,0,R*1.05);shade.addColorStop(0,'#ffffff55');shade.addColorStop(.5,'#ffffff00');shade.addColorStop(1,'#00000055');x.fillStyle=shade;x.fillRect(-R,-R,2*R,2*R);x.restore();
 if(b.id){x.fillStyle='#fbf8ef';x.beginPath();x.arc(0,0,R*.48,0,7);x.fill();x.fillStyle='#1b1b1b';x.font=`700 ${b.id>9?9:10}px system-ui,sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText(String(b.id),0,.6);}
 x.restore();
}
function balls(){const g=game();if(anim)return anim.shot.balls;if(!g)return [];if(place&&g.ballInHand){return g.balls.map(b=>b.id===0?{...b,x:place.x,y:place.y,in:false}:b);}return g.balls;}
function draw(){
 const c=view.canvas;if(!c||!c.isConnected||!view.scale)return;const x=c.getContext('2d'),s=view.scale*view.dpr,g=game();
 x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);x.drawImage(feltLayer(),0,0);x.setTransform(s,0,0,s,FRAME*s,FRAME*s);
 const list=balls(),cue=list.find(b=>b.id===0&&!b.in);
 if(g&&myTurn(g)&&g.ballInHand==='kitchen'){x.fillStyle='#ffffff10';x.fillRect(0,TABLE.headString,W,H-TABLE.headString);}
 if(g&&myTurn(g)&&cue&&!(g.ballInHand&&dragging==='cue')){
  const guide=aimGuide(list,aim);
  if(guide){x.setLineDash([7,7]);x.strokeStyle='#ffffffcc';x.lineWidth=2;x.beginPath();x.moveTo(cue.x,cue.y);x.lineTo(guide.end.x,guide.end.y);x.stroke();x.setLineDash([]);
   if(guide.ball){x.strokeStyle='#ffffffdd';x.lineWidth=1.6;x.beginPath();x.arc(guide.end.x,guide.end.y,R,0,7);x.stroke();
    const legal=legalTarget(g,guide.ball.id);x.strokeStyle=legal?'#ffffffdd':'#ff7a6b';x.lineWidth=2.2;
    x.beginPath();x.moveTo(guide.ball.x,guide.ball.y);x.lineTo(guide.ball.x+guide.object.x*150*guide.object.strength,guide.ball.y+guide.object.y*150*guide.object.strength);x.stroke();
    x.strokeStyle='#ffffff77';x.beginPath();x.moveTo(guide.end.x,guide.end.y);x.lineTo(guide.end.x+guide.glance.x*70*guide.glance.strength,guide.end.y+guide.glance.y*70*guide.glance.strength);x.stroke();
    if(!legal){x.strokeStyle='#ff7a6b';x.lineWidth=2.4;x.beginPath();x.moveTo(guide.end.x-7,guide.end.y-7);x.lineTo(guide.end.x+7,guide.end.y+7);x.moveTo(guide.end.x+7,guide.end.y-7);x.lineTo(guide.end.x-7,guide.end.y+7);x.stroke();}}
  }
 }
 for(const b of list)if(!b.in)ball(x,b,b.id===0&&place&&!placeable(g.balls,place.x,place.y,g.ballInHand==='kitchen')?.55:1);
 if(g&&myTurn(g)&&g.ballInHand&&cue){x.strokeStyle=dragging==='cue'?'#ffd98a':'#ffd98aaa';x.lineWidth=2;x.setLineDash([4,4]);x.beginPath();x.arc(cue.x,cue.y,R+7,0,7);x.stroke();x.setLineDash([]);}
 if(g&&myTurn(g)&&cue&&dragging!=='cue'){// The cue stick, pulled back by the chosen power.
  const back=R+6+power*90,len=360,ux=Math.cos(aim),uy=Math.sin(aim),sx=cue.x-ux*back,sy=cue.y-uy*back,ex=sx-ux*len,ey=sy-uy*len;
  const stick=x.createLinearGradient(sx,sy,ex,ey);stick.addColorStop(0,'#f4ead2');stick.addColorStop(.03,'#f4ead2');stick.addColorStop(.035,'#3c78c8');stick.addColorStop(.06,'#3c78c8');stick.addColorStop(.065,'#d9b37a');stick.addColorStop(.7,'#b07a3f');stick.addColorStop(1,'#2d1b0f');
  x.strokeStyle=stick;x.lineCap='round';x.lineWidth=7;x.beginPath();x.moveTo(sx,sy);x.lineTo(ex,ey);x.stroke();x.lineCap='butt';
 }
}
function legalTarget(g,id){const mine=g.groups?.[who];if(g.breakShot)return true;if(g.open||!mine)return id!==8;const left=g.balls.filter(b=>!b.in&&GROUP(b.id)===mine).length;return left?GROUP(id)===mine:id===8;}

// ---------- shot replay ----------
function replay(g,key){
 const shot=g.lastShot;if(anim)cancelAnimationFrame(anim.frame);
 const sim=new Shot(shot.start,{vx:shot.vx,vy:shot.vy,follow:shot.follow,side:shot.side});let fired=0,t0=null;
 anim={key,shot:sim,frame:0};click('cue',Math.min(1,Math.sqrt(shot.vx*shot.vx+shot.vy*shot.vy)/3200));
 const tick=t=>{if(!anim||anim.shot!==sim)return;t0??=t;const target=Math.min(shot.steps,Math.floor((t-t0)/1000*240));
  while(sim.steps<target&&sim.step());for(;fired<sim.events.length;fired++){const e=sim.events[fired];click(e.type,e.power);}
  draw();if(sim.steps>=shot.steps||sim.done){anim=null;signature='';render(true);return;}anim.frame=requestAnimationFrame(tick);};
 anim.frame=requestAnimationFrame(tick);render(true);
}

// ---------- input ----------
function point(e){const r=view.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)/view.scale-FRAME,y:(e.clientY-r.top)/view.scale-FRAME};}
function bindTable(){
 const c=view.canvas;
 c.addEventListener('pointerdown',e=>{const g=game();if(!myTurn(g)||busy)return;unlock();c.setPointerCapture?.(e.pointerId);const p=point(e),cue=balls().find(b=>b.id===0);
  if(g.ballInHand&&cue&&(p.x-cue.x)**2+(p.y-cue.y)**2<(R*2.6)**2){dragging='cue';place={x:cue.x,y:cue.y};}else{dragging='aim';if(cue)aim=Math.atan2(p.y-cue.y,p.x-cue.x);}draw();});
 c.addEventListener('pointermove',e=>{if(!dragging)return;const p=point(e),g=game();if(dragging==='cue'){place={x:Math.max(R,Math.min(W-R,p.x)),y:Math.max(g.ballInHand==='kitchen'?TABLE.headString:R,Math.min(H-R,p.y))};}else{const cue=balls().find(b=>b.id===0);if(cue)aim=Math.atan2(p.y-cue.y,p.x-cue.x);}draw();});
 const end=()=>{if(dragging){dragging=null;draw();renderHint();}};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
}
function bindPower(bar){
 let start=null;const fill=bar.querySelector('.billiards-power-fill'),label=bar.querySelector('.billiards-power-value');
 const paint=()=>{fill.style.height=Math.round(power*100)+'%';label.textContent=Math.round(power*100)+'%';};paint();
 bar.addEventListener('pointerdown',e=>{if(!myTurn(game())||busy)return;unlock();bar.setPointerCapture?.(e.pointerId);start=e.clientY;power=0;paint();draw();});
 bar.addEventListener('pointermove',e=>{if(start===null)return;power=Math.max(0,Math.min(1,(e.clientY-start)/(bar.clientHeight*.9)));paint();draw();});
 const release=()=>{if(start===null)return;start=null;const p=power;if(p>=.03)shoot(p);else{power=0;paint();draw();}};
 bar.addEventListener('pointerup',release);bar.addEventListener('pointercancel',()=>{start=null;power=0;paint();draw();});
}
function bindWheel(wheel){
 let last=null;wheel.addEventListener('pointerdown',e=>{if(!myTurn(game()))return;wheel.setPointerCapture?.(e.pointerId);last=e.clientY;});
 wheel.addEventListener('pointermove',e=>{if(last===null)return;aim+=(e.clientY-last)*.0016;last=e.clientY;wheel.style.backgroundPositionY=(e.clientY%40)+'px';draw();});
 const stop=()=>{last=null;};wheel.addEventListener('pointerup',stop);wheel.addEventListener('pointercancel',stop);
}
async function shoot(p){
 const g=game();if(!myTurn(g))return;const payload={angle:aim,power:p,follow,side};
 if(g.ballInHand){const cue=balls().find(b=>b.id===0);if(!placeable(g.balls,cue.x,cue.y,g.ballInHand==='kitchen')){error(new Error(g.ballInHand==='kitchen'?'Place the cue ball below the line, clear of other balls.':'Move the cue ball clear of other balls.'));power=0;draw();render(true);return;}payload.x=cue.x;payload.y=cue.y;}
 const ok=await command('shoot',payload,g);power=0;if(ok){place=null;follow=0;side=0;}draw();
}

// ---------- spin ----------
function spinPad(root){
 const b=make('button',undefined,root,'billiards-spin-button');b.type='button';b.setAttribute('aria-label','Spin: '+spinLabel());b.title='Spin';
 const dot=make('i',undefined,b);dot.style.left=50+side*38+'%';dot.style.top=50-follow*38+'%';b.onclick=()=>{spinOpen=!spinOpen;render(true);};
 if(!spinOpen)return;
 const pop=make('div',undefined,root,'billiards-spin-pop');make('strong','Spin',pop);make('small','Tap where the cue hits the white ball.',pop);
 const pad=make('div',undefined,pop,'billiards-spin-pad'),mark=make('i',undefined,pad);const paint=()=>{mark.style.left=50+side*44+'%';mark.style.top=50-follow*44+'%';dot.style.left=50+side*38+'%';dot.style.top=50-follow*38+'%';pop.querySelector('.billiards-spin-label').textContent=spinLabel();};
 const set=e=>{const r=pad.getBoundingClientRect();let sx=((e.clientX-r.left)/r.width-.5)/.44,sy=-((e.clientY-r.top)/r.height-.5)/.44;const m=Math.sqrt(sx*sx+sy*sy);if(m>1){sx/=m;sy/=m;}side=Math.round(sx*100)/100;follow=Math.round(sy*100)/100;paint();};
 pad.addEventListener('pointerdown',e=>{pad.setPointerCapture?.(e.pointerId);set(e);});pad.addEventListener('pointermove',e=>{if(e.buttons)set(e);});
 make('span','',pop,'billiards-spin-label');const row=make('div',undefined,pop,'billiards-spin-actions');
 btn('Centre',row,()=>{side=0;follow=0;paint();});btn('Done',row,()=>{spinOpen=false;render(true);},'primary');paint();
}
function spinLabel(){if(!follow&&!side)return 'No spin';return [follow>0.05?'top':follow<-0.05?'back':'',side>0.05?'right':side<-0.05?'left':''].filter(Boolean).join(' + ')+' spin';}

// ---------- screens ----------
function scoreboard(root,g){
 const box=make('div',undefined,root,'billiards-scoreboard');
 for(const name of g.mode==='shared'?['Mahmoud','Safy']:g.players){
  const card=make('div',undefined,box,'billiards-player '+name.toLowerCase());card.classList.toggle('turn',g.turn===name&&g.status==='active');
  make('strong',name===who?'You':name,card);const group=g.groups?.[name];
  make('small',group?group[0].toUpperCase()+group.slice(1):g.breakShot?(g.turn===name?'Breaks':'Waiting'):'Open table',card);
  const row=make('div',undefined,card,'billiards-mini');
  const ids=group==='solids'?[1,2,3,4,5,6,7]:group==='stripes'?[9,10,11,12,13,14,15]:[];
  for(const id of ids){const on=g.balls.find(b=>b.id===id&&!b.in);const m=make('i',undefined,row,'billiards-mini-ball'+(id>8?' stripe':'')+(on?'':' gone'));m.style.setProperty('--c',COLORS[id]);}
  if(group&&!ids.some(id=>g.balls.find(b=>b.id===id&&!b.in))){const m=make('i',undefined,row,'billiards-mini-ball');m.style.setProperty('--c',COLORS[8]);}
 }
 const mid=make('div',undefined,box,'billiards-mid');make('small','8 BALL',mid);view.clock=make('span','',mid,'billiards-clock');updateClock();
 box.insertBefore(mid,box.children[1]);
}
function updateClock(){
 const g=game(),c=view.clock;if(!c)return;if(!g||g.status!=='active'||!g.deadline||anim){c.textContent='';c.className='billiards-clock';return;}
 const left=Math.max(0,Math.ceil((g.deadline-(Date.now()+clockOffset))/1000));const shown=Math.min(g.shotSeconds,left);c.textContent=shown+'s';c.className='billiards-clock'+(shown<=10?' low':'');
}
function statusText(g){
 if(anim)return g.lastShot?.by===who?'Your shot…':(g.lastShot?.by==='Computer'?'Computer shoots…':g.lastShot?.by+' shoots…');
 if(g.status==='complete')return g.last;
 if(g.choice)return g.choice.who===who?'Choose: spot the 8 or re-rack.':g.choice.who+' is choosing.';
 if(g.turn===who)return g.breakShot?'Your break':g.ballInHand?'Your turn · ball in hand':'Your turn';
 return g.turn==='Computer'?'Computer is thinking…':g.turn+'’s turn';
}
function renderHint(){const h=view.hint;if(!h)return;const g=game();if(!g||g.status!=='active'){h.textContent='';return;}
 h.textContent=myTurn(g)?(g.ballInHand&&!place?'Drag the white ball to place it'+(g.ballInHand==='kitchen'?' below the line':'')+', then aim':'Touch the table to aim · fine-tune on the right · pull the power bar down and let go'):g.last||'';}
function choice(root,g){
 const card=make('div',undefined,root,'billiards-choice');make('h4','The 8 went in on the break',card);
 make('p',g.choice.scratch?'The cue ball went in too, so you choose. If you spot the 8, you play with the cue ball behind the line.':'That is not a loss. Choose how to continue.',card,'muted');
 const row=make('div',undefined,card,'billiards-choice-actions');btn('Spot the 8 · keep playing',row,()=>command('choose',{option:'spot'}),'primary');btn('Re-rack · break again',row,()=>command('choose',{option:'rerack'}));
}
function result(root,g){
 const card=make('div',undefined,root,'billiards-result');card.setAttribute('role','status');make('small',g.mode==='shared'?'MATCH COMPLETE · SAVED TO THE CROWN':'GAME COMPLETE',card);
 make('h3',g.winner===who?'You won!':g.winner+' won',card);make('p',g.last,card);
 const row=make('div',undefined,card,'billiards-result-actions');btn('Rematch',row,()=>command('rematch'),'primary');btn('Back',row,()=>leave());
}
function setup(root,g){
 const box=make('div',undefined,root,'billiards-setup');
 if(g?.status==='declined'&&g.owner===who)make('p',other()+' said not now.',box,'muted');
 if(g?.status==='expired'&&g.owner===who)make('p','Your invitation expired.',box,'muted');
 make('h4',mode==='solo'?'Play against the computer':'Play with '+other(),box);
 let level,clock;
 if(mode==='solo'){const l=make('label','Difficulty',box);level=make('select',undefined,l);for(const [v,t] of [['easy','Easy'],['medium','Medium'],['hard','Hard']])make('option',t,level).value=v;let saved='medium';try{saved=localStorage.getItem('our-place:billiards:level')||'medium';}catch{}level.value=saved;}
 else{const l=make('label','Shot timer',box);clock=make('select',undefined,l);for(const [v,t] of [['0','No timer'],['30','30 seconds'],['45','45 seconds'],['60','60 seconds']])make('option',t,clock).value=v;clock.value='0';}
 btn(mode==='solo'?'Start game':'Invite '+other(),box,()=>{try{if(level)localStorage.setItem('our-place:billiards:level',level.value);}catch{}return command('create',{mode,difficulty:level?.value,shotSeconds:clock?Number(clock.value):undefined},null);},'primary');
 make('p',mode==='solo'?'Solo games do not count toward the crown.':'Every match you win together counts toward the crown.',box,'muted billiards-small');
}
function waiting(root,g){
 const box=make('div',undefined,root,'billiards-setup');
 if(g.owner===who){make('h4','Waiting for '+other()+'…',box);make('p',other()+' gets a notification.'+(g.shotSeconds?' Shot timer: '+g.shotSeconds+'s.':''),box,'muted');btn('Cancel invitation',box,()=>command('leave'));}
 else{make('h4',g.owner+' invited you to Billiards',box);make('p',g.shotSeconds?'Shot timer: '+g.shotSeconds+' seconds.':'No shot timer.',box,'muted');btn('Accept',box,()=>command('accept'),'primary');btn('Not now',box,()=>command('decline'));}
}
function records(){
 const book=data.records?.[mode]??{wins:{},history:[]},root=$('#billiards-records');root.replaceChildren();
 make('small',mode==='shared'?'YOUR RIVALRY · MATCH WINS':'SOLO · GAMES WON',root,'label');for(const n of mode==='shared'?['Mahmoud','Safy']:[who,'Computer'])make('span',n+' · '+(book.wins?.[n]??0),root,'billiards-win');
 const list=$('#billiards-history-list');list.replaceChildren();if(!book.history?.length)make('p','Finished games will be remembered here.',list,'muted');
 for(const h of book.history??[]){const row=make('div',undefined,list,'billiards-history-row');make('strong',h.status==='completed'?h.winner+' won':'Unfinished game',row);make('small',new Date(h.date).toLocaleDateString()+' · '+h.shots+' shots'+(h.difficulty?' · '+h.difficulty:''),row);}
}
function invitation(){
 const g=data.shared,root=$('#billiards-invitation');root.replaceChildren();root.hidden=!(g?.status==='waiting'&&g.owner!==who);if(root.hidden)return;
 make('span',g.owner+' invited you to Billiards'+(g.shotSeconds?' · '+g.shotSeconds+'s per shot':'')+'.',root);
 btn('Join',root,async()=>{mode='shared';opened=true;host.goto('together');await command('accept',{},g);show();host.revealPanel?.('#billiards-panel');},'primary');
 btn('Not now',root,()=>command('decline',{},g));
}
function render(force=false){
 if(!who)return;show();invitation();records();
 $('#billiards-solo').classList.toggle('selected',mode==='solo');$('#billiards-shared').classList.toggle('selected',mode==='shared');
 $('#billiards-open-note').textContent=data.shared?.status==='active'?(data.shared.turn===who?'Your shot. The table is waiting.':'Your game with '+other()+' is saved.'):data.solo?.status==='active'?'Your solo game is saved.':'Eight balls. One little rivalry.';
 const g=game(),sig=JSON.stringify([mode,g,busy,spinOpen,!!anim,opened]);if(!force&&sig===signature)return;signature=sig;
 const root=$('#billiards-game');root.replaceChildren();view.canvas=null;view.clock=null;view.hint=null;
 if(!g||['ended','declined','expired'].includes(g.status)){setup(root,g);return;}
 if(g.status==='waiting'){waiting(root,g);return;}
 scoreboard(root,g);make('p',statusText(g),root,'billiards-turn').setAttribute('role','status');
 const stage=make('div',undefined,root,'billiards-stage');
 const bar=make('div',undefined,stage,'billiards-power');bar.setAttribute('aria-label','Power: pull down and let go to shoot');make('span','POWER',bar,'billiards-power-title');const track=make('div',undefined,bar,'billiards-power-track');make('div',undefined,track,'billiards-power-fill');make('span','0%',bar,'billiards-power-value');bar.classList.toggle('off',!myTurn(g));
 const box=make('div',undefined,stage,'billiards-table');view.tableBox=box;view.canvas=make('canvas',undefined,box);view.canvas.setAttribute('aria-label','Billiards table');
 const side=make('div',undefined,stage,'billiards-side');if(myTurn(g))spinPad(side);else make('span',undefined,side,'billiards-spin-space');
 const wheel=make('div',undefined,side,'billiards-wheel');wheel.setAttribute('aria-label','Fine aim: drag up or down');wheel.classList.toggle('off',!myTurn(g));
 const foot=make('div',undefined,root,'billiards-footer');view.hint=make('p','',foot,'billiards-hint');renderHint();
 if(g.choice&&g.choice.who===who&&!anim)choice(root,g);
 if(g.status==='complete'&&!anim)result(root,g);
 if(g.status==='active')btn('Leave game',foot,async()=>{if(await window.OurGameUI.confirm({title:'Leave this game?',message:'The game ends without a win. Minimize instead to keep it saved.',confirmLabel:'Leave game'}))await command('leave',{},g);},'billiards-leave');
 bindTable();bindPower(bar);bindWheel(wheel);
 requestAnimationFrame(setupCanvas);
}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(view.canvas?.isConnected)setupCanvas();},120);});
function init(h){
 host=h;soundButton();window.OurGameUI?.registerChat?.($('.billiards-head'),()=>leave(true));
 $('#billiards-open').onclick=()=>{unlock();opened=true;render(true);host.revealPanel?.('#billiards-panel');};
 $('#billiards-collapse').onclick=()=>leave();$('#billiards-chat').onclick=()=>leave(true);
 $('#billiards-sound').onclick=()=>{soundOn=!soundOn;try{localStorage.setItem('our-place:billiards:sound',soundOn?'on':'off');}catch{}soundButton();if(soundOn){unlock();click('ball',.6);}};
 for(const m of ['solo','shared'])$('#billiards-'+(m==='solo'?'solo':'shared')).onclick=()=>{mode=m;place=null;spinOpen=false;render(true);};
 setInterval(updateClock,250);
}
window.OurBilliards={init,sync(s){
 if(!s?.billiards)return;if(Number.isFinite(s.version)&&who===s.who&&s.version<version)return;
 if(who!==s.who){who=s.who;opened=false;mode='solo';seen={};try{const saved=JSON.parse(localStorage.getItem('our-place:billiards:'+who)||'null');if(saved){mode=saved.mode==='shared'?'shared':'solo';opened=!!saved.opened;}}catch{}}
 if(Number.isFinite(s.serverNow))clockOffset=s.serverNow-Date.now();version=s.version;
 const first=!Object.keys(seen).length;data=s.billiards;
 for(const m of ['solo','shared']){const g=data[m],key=g?.lastShot?g.id+':'+g.lastShot.n:null;if(!key){seen[m]=null;continue;}
  if(seen[m]!==key){const fresh=!first&&seen[m]!==undefined;seen[m]=key;if(fresh&&m===mode&&opened&&!document.hidden)replay(g,key);}}
 const g=game();if(g?.ballInHand&&g.turn===who){if(!place){const c=g.balls.find(b=>b.id===0);place=c&&!c.in&&placeable(g.balls,c.x,c.y,g.ballInHand==='kitchen')?{x:c.x,y:c.y}:{x:W/2,y:g.ballInHand==='kitchen'?TABLE.headString+60:H*.75};if(!placeable(g.balls,place.x,place.y,g.ballInHand==='kitchen'))for(let y=H-40;y>R;y-=20){if(placeable(g.balls,W/2,y,g.ballInHand==='kitchen')){place={x:W/2,y};break;}}}}else place=null;
 render();
},reset(){if(anim)cancelAnimationFrame(anim.frame);anim=null;who=null;data={};version=-1;seen={};signature='';opened=false;place=null;$('#billiards-game')?.replaceChildren();const inv=$('#billiards-invitation');if(inv)inv.hidden=true;document.body.classList.remove('billiards-locked');$('#billiards-panel').hidden=true;$('#billiards-open').hidden=false;}};
