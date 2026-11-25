// Billiards (8-ball) for Our Place. The server decides every shot; this file draws the table, lets you
// aim, set power and spin, and replays every shot with the same physics the server used.
// Smoothness rules: one canvas for the whole session, the live screen is built once per game and then
// only updated in place, and every shot plays as a paced sequence (cue ball moves, the stick lines up,
// pulls back, strikes, the balls roll, then a short settle) before the next turn appears.
import {TABLE,POCKETS,GROUP,Shot,aimGuide,placeable,speedFor} from './billiards-physics.mjs';
const $=s=>document.querySelector(s);
const make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
const capture=(el,e)=>{try{el.setPointerCapture(e.pointerId);}catch{}};
const {width:W,height:H,radius:R}=TABLE,FRAME=32;
const COLORS=['#f6f1e4','#e8b923','#2563b5','#d23c33','#6b3fa0','#e0762a','#2f8a4f','#8e2a2a','#151515','#e8b923','#2563b5','#d23c33','#6b3fa0','#e0762a','#2f8a4f','#8e2a2a'];
const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
let host,who=null,data={},mode='solo',opened=false,busy=false,version=-1,clockOffset=0;
let aim=-Math.PI/2,power=0,follow=0,side=0,place=null,dragging=null,spinOpen=false,soundOn=true,audio=null;
let queue=[],job=null,frozen=null,pending=null,seen={},loop=0,screenKey='',setupSig='';
const view={},noise={};
try{soundOn=localStorage.getItem('our-place:billiards:sound')!=='off';}catch{}
const game=()=>data[mode];
const shown=()=>frozen&&frozen.id===game()?.id?frozen:game();// what the screen shows while a shot plays
const isLive=g=>!!g&&['active','complete'].includes(g.status);
const other=()=>who==='Mahmoud'?'Safy':'Mahmoud';
const myTurn=g=>!!g&&g.status==='active'&&g.turn===who&&!g.choice&&!job&&!queue.length;

// ---------- sound ----------
function soundButton(){const b=$('#billiards-sound');b.textContent=soundOn?'Sound on':'Muted';b.setAttribute('aria-pressed',String(soundOn));}
function unlock(){if(!soundOn)return;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;audio??=new A();if(audio.state!=='running')audio.resume().catch(()=>{});}catch{}}
function click(kind,strength=.5){
 if(!soundOn||document.hidden||!opened||audio?.state!=='running')return;
 try{const now=audio.currentTime,v=Math.min(1,.12+strength)*(kind==='ball'?.55:kind==='cue'?.4:.42);
  noise[kind]??=(()=>{const len=kind==='pocket'?.25:kind==='rail'?.1:.05,b=audio.createBuffer(1,Math.ceil(audio.sampleRate*len),audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++){const t=i/audio.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-t*(kind==='pocket'?16:kind==='rail'?42:95));}return b;})();
  const src=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();src.buffer=noise[kind];f.type=kind==='ball'||kind==='cue'?'bandpass':'lowpass';f.frequency.value=kind==='ball'?2600:kind==='cue'?1300:kind==='rail'?420:240;f.Q.value=kind==='ball'?3:1;g.gain.value=v;
  src.connect(f);f.connect(g);g.connect(audio.destination);src.start(now);src.onended=()=>{src.disconnect();f.disconnect();g.disconnect();};
 }catch{}
}

// ---------- shell ----------
function save(){try{if(who)localStorage.setItem('our-place:billiards:'+who,JSON.stringify({mode,opened}));}catch{}}
function focused(){return opened&&isLive(game());}
function show(){const p=$('#billiards-panel');p.hidden=!opened;p.classList.toggle('billiards-focused',focused());$('#billiards-open').hidden=opened;document.body.classList.toggle('billiards-locked',focused());save();}
function error(e){$('#billiards-error').textContent=e?.message||'Could not connect. Your game is saved.';}
function btn(label,root,fn,cls){const b=make('button',label,root,cls);b.type='button';b.disabled=busy;b.onclick=()=>{unlock();return Promise.resolve(fn()).catch(error);};return b;}
async function command(type,payload={},g=game()){
 if(busy)return false;busy=true;$('#billiards-error').textContent='';let ok=false;refresh();
 try{await host.command('billiards.'+type,{...(g?{game:g.id,revision:g.revision}:{}),...payload});await host.sync();ok=true;}
 catch(e){await host.sync().catch(()=>{});error(e);}
 finally{busy=false;refresh();}
 return ok;
}
// Back button: an open game is its own history step, so Back closes it and you stay on Do Together.
function stepIn(){if(history.state?.panel!=='billiards')history.pushState({placeTab:'together',panel:'billiards'},'');}
function minimize(chat=false){const own=history.state?.panel==='billiards';opened=false;show();if(own&&!chat)history.back();else if(own)history.replaceState({placeTab:'together'},'');if(chat)host.goto('chat');}
window.addEventListener('popstate',e=>{if(opened&&e.state?.panel!=='billiards'){opened=false;show();}});

// ---------- canvas ----------
function canvas(){if(view.canvas)return view.canvas;const c=document.createElement('canvas');c.setAttribute('aria-label','Billiards table');view.canvas=c;bindTable(c);return c;}
function fit(){
 const box=view.tableBox,c=view.canvas;if(!box||!c?.isConnected)return;
 const availW=box.clientWidth,availH=focused()?box.clientHeight:Math.min(window.innerHeight*.7,availW*2.2),scale=Math.max(.2,Math.min(availW/(W+FRAME*2),availH/(H+FRAME*2)));
 const cssW=Math.floor((W+FRAME*2)*scale),cssH=Math.floor((H+FRAME*2)*scale),dpr=Math.min(2,window.devicePixelRatio||1);
 if(c._w!==cssW||c._h!==cssH||c._dpr!==dpr){c.style.width=cssW+'px';c.style.height=cssH+'px';c.width=Math.round(cssW*dpr);c.height=Math.round(cssH*dpr);c._w=cssW;c._h=cssH;c._dpr=dpr;view.felt=null;}
 view.scale=scale;view.dpr=dpr;draw();
}
function round(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
function felt(){
 if(view.felt)return view.felt;const c=document.createElement('canvas'),s=view.scale*view.dpr;c.width=view.canvas.width;c.height=view.canvas.height;const x=c.getContext('2d');x.setTransform(s,0,0,s,FRAME*s,FRAME*s);
 const wood=x.createLinearGradient(-FRAME,0,W+FRAME,0);wood.addColorStop(0,'#3b2717');wood.addColorStop(.5,'#5d3d23');wood.addColorStop(1,'#3b2717');x.fillStyle=wood;round(x,-FRAME,-FRAME,W+FRAME*2,H+FRAME*2,30);x.fill();
 x.strokeStyle='#c8a26b';x.lineWidth=2;round(x,-FRAME+4,-FRAME+4,W+FRAME*2-8,H+FRAME*2-8,26);x.stroke();
 x.fillStyle='#17513a';x.fillRect(-12,-12,W+24,H+24);
 const g=x.createRadialGradient(W/2,H/2,80,W/2,H/2,H*.65);g.addColorStop(0,'#2a8a5f');g.addColorStop(1,'#1d6646');x.fillStyle=g;x.fillRect(0,0,W,H);
 x.fillStyle='#e8d3a8';for(const t of [.25,.5,.75])for(const [px,py] of [[W*t,-22],[W*t,H+22]]){x.beginPath();x.arc(px,py,2.6,0,7);x.fill();}for(const t of [.125,.375,.625,.875])for(const [px,py] of [[-22,H*t],[W+22,H*t]]){x.beginPath();x.arc(px,py,2.6,0,7);x.fill();}
 x.strokeStyle='#ffffff22';x.lineWidth=1.5;x.beginPath();x.moveTo(0,TABLE.headString);x.lineTo(W,TABLE.headString);x.stroke();x.fillStyle='#ffffff30';x.beginPath();x.arc(W/2,TABLE.footSpot,3,0,7);x.fill();
 POCKETS.forEach(([px,py],i)=>{const r=i===2||i===3?27:30;x.fillStyle='#0b0d0c';x.beginPath();x.arc(px,py,r,0,7);x.fill();x.strokeStyle='#8a6a43';x.lineWidth=3;x.stroke();});
 return view.felt=c;
}
// Balls are drawn as real spheres: the number and the stripe turn as the ball rolls, lit from the top left.
const RGB=COLORS.map(h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);
const LIGHT=(()=>{const v=[-.42,-.52,.74],m=Math.hypot(...v);return v.map(a=>a/m);})(),HALF=(()=>{const v=[LIGHT[0],LIGHT[1],LIGHT[2]+1],m=Math.hypot(...v);return v.map(a=>a/m);})();
const orient=new Map();
function turn(v,k,a){const c=Math.cos(a),s=Math.sin(a),d=k[0]*v[0]+k[1]*v[1]+k[2]*v[2];return [v[0]*c+(k[1]*v[2]-k[2]*v[1])*s+k[0]*d*(1-c),v[1]*c+(k[2]*v[0]-k[0]*v[2])*s+k[1]*d*(1-c),v[2]*c+(k[0]*v[1]-k[1]*v[0])*s+k[2]*d*(1-c)];}
function roll(b){
 let o=orient.get(b.id);if(!o){o={spot:[0,0,1],pole:[0,1,0],x:b.x,y:b.y,sprite:null,key:''};orient.set(b.id,o);}
 const dx=b.x-o.x,dy=b.y-o.y,d=Math.sqrt(dx*dx+dy*dy);o.x=b.x;o.y=b.y;
 if(d>.02&&d<4*R){const k=[-dy/d,dx/d,0],a=d/R;o.spot=turn(o.spot,k,a);o.pole=turn(o.pole,k,a);}// a jump (placement, re-rack) is not a roll
 return o;
}
function sprite(b,o){
 const rp=R*view.scale*view.dpr,size=Math.ceil(rp*2)+2,key=size+':'+o.spot.map(v=>v.toFixed(3)).join()+':'+o.pole.map(v=>v.toFixed(3)).join();
 if(o.key===key&&o.sprite)return o.sprite;o.key=key;
 const c=o.sprite&&o.sprite.width===size?o.sprite:Object.assign(document.createElement('canvas'),{width:size,height:size});o.sprite=c;
 const x=c.getContext('2d'),img=x.createImageData(size,size),px=img.data,base=RGB[b.id],white=[246,241,228],mid=size/2,stripe=b.id>8,spotCos=b.id?.89:.985;
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const nx=(i+.5-mid)/rp,ny=(j+.5-mid)/rp,r2=nx*nx+ny*ny;if(r2>1)continue;const nz=Math.sqrt(1-r2),q=(j*size+i)*4;
  let col=stripe&&Math.abs(nx*o.pole[0]+ny*o.pole[1]+nz*o.pole[2])>.5?white:base;
  if(nx*o.spot[0]+ny*o.spot[1]+nz*o.spot[2]>spotCos)col=b.id?[251,248,239]:[205,45,40];
  const diff=Math.max(0,nx*LIGHT[0]+ny*LIGHT[1]+nz*LIGHT[2]),spec=Math.max(0,nx*HALF[0]+ny*HALF[1]+nz*HALF[2])**42,shade=.38+.72*diff;
  px[q]=Math.min(255,col[0]*shade+spec*230);px[q+1]=Math.min(255,col[1]*shade+spec*230);px[q+2]=Math.min(255,col[2]*shade+spec*230);px[q+3]=r2>.94?Math.round(255*(1-(r2-.94)/.06)):255;
 }
 x.putImageData(img,0,0);return c;
}
function drawBall(x,b,alpha=1,scale=1){
 const o=roll(b);x.save();x.globalAlpha=alpha;x.translate(b.x,b.y);if(scale!==1)x.scale(scale,scale);
 x.fillStyle='#00000045';x.beginPath();x.ellipse(2.5,3.5,R,R*.9,0,0,7);x.fill();
 const s=sprite(b,o),w=s.width/(view.scale*view.dpr);x.drawImage(s,-w/2,-w/2,w,w);
 if(b.id&&o.spot[2]>.25){const z=o.spot[2];x.fillStyle='#1b1b1b';x.globalAlpha=alpha*Math.min(1,(z-.25)*3);x.font=`700 ${(b.id>9?9.5:10.5)*(.55+.45*z)}px system-ui,sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText(String(b.id),o.spot[0]*R,o.spot[1]*R+.5);}
 x.restore();
}
function drawStick(x,cue,angle,back){
 const ux=Math.cos(angle),uy=Math.sin(angle),sx=cue.x-ux*(R+6+back),sy=cue.y-uy*(R+6+back),ex=sx-ux*380,ey=sy-uy*380;
 const st=x.createLinearGradient(sx,sy,ex,ey);st.addColorStop(0,'#f4ead2');st.addColorStop(.03,'#f4ead2');st.addColorStop(.035,'#3c78c8');st.addColorStop(.06,'#3c78c8');st.addColorStop(.065,'#d9b37a');st.addColorStop(.7,'#b07a3f');st.addColorStop(1,'#2d1b0f');
 x.strokeStyle='#00000035';x.lineWidth=8;x.lineCap='round';x.beginPath();x.moveTo(sx+3,sy+4);x.lineTo(ex+3,ey+4);x.stroke();
 x.strokeStyle=st;x.lineWidth=7;x.beginPath();x.moveTo(sx,sy);x.lineTo(ex,ey);x.stroke();x.lineCap='butt';
}
function tableBalls(){
 if(job)return job.balls;const g=shown();if(!g)return [];
 if(pending&&pending.id===g.id&&(game()?.shotNumber??0)<pending.n)return pending.balls;
 if(place&&myTurn(g)&&g.ballInHand)return g.balls.map(b=>b.id===0?{...b,x:place.x,y:place.y,in:false}:b);
 return g.balls;
}
function legalTarget(g,id){const mine=g.groups?.[who];if(g.breakShot)return true;if(g.open||!mine)return id!==8;const left=g.balls.filter(b=>!b.in&&GROUP(b.id)===mine).length;return left?GROUP(id)===mine:id===8;}
function draw(){
 const c=view.canvas;if(!c?.isConnected||!view.scale)return;const x=c.getContext('2d'),s=view.scale*view.dpr,g=shown();
 x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);x.drawImage(felt(),0,0);x.setTransform(s,0,0,s,FRAME*s,FRAME*s);
 const list=tableBalls(),cue=list.find(b=>b.id===0&&!b.in),interactive=myTurn(g);
 if(interactive&&g.ballInHand==='kitchen'){x.fillStyle='#ffffff10';x.fillRect(0,TABLE.headString,W,H-TABLE.headString);}
 if(interactive&&cue&&dragging!=='cue'){const guide=aimGuide(list,aim);
  if(guide){x.setLineDash([7,7]);x.strokeStyle='#ffffffcc';x.lineWidth=2;x.beginPath();x.moveTo(cue.x,cue.y);x.lineTo(guide.end.x,guide.end.y);x.stroke();x.setLineDash([]);
   if(guide.ball){const legal=legalTarget(g,guide.ball.id);x.strokeStyle='#ffffffdd';x.lineWidth=1.6;x.beginPath();x.arc(guide.end.x,guide.end.y,R,0,7);x.stroke();
    x.strokeStyle=legal?'#ffffffdd':'#ff7a6b';x.lineWidth=2.2;x.beginPath();x.moveTo(guide.ball.x,guide.ball.y);x.lineTo(guide.ball.x+guide.object.x*160*guide.object.strength,guide.ball.y+guide.object.y*160*guide.object.strength);x.stroke();
    x.strokeStyle='#ffffff77';x.beginPath();x.moveTo(guide.end.x,guide.end.y);x.lineTo(guide.end.x+guide.glance.x*70*guide.glance.strength,guide.end.y+guide.glance.y*70*guide.glance.strength);x.stroke();
    if(!legal){x.strokeStyle='#ff7a6b';x.lineWidth=2.4;x.beginPath();x.moveTo(guide.end.x-7,guide.end.y-7);x.lineTo(guide.end.x+7,guide.end.y+7);x.moveTo(guide.end.x+7,guide.end.y-7);x.lineTo(guide.end.x-7,guide.end.y+7);x.stroke();}}}
 }
 const bad=interactive&&place&&g.ballInHand&&!placeable(g.balls,place.x,place.y,g.ballInHand==='kitchen');
 for(const b of list)if(!b.in)drawBall(x,b,b.id===0&&bad?.55:1);
 for(const s of job?.sinking??[]){const k=Math.min(1,(performance.now()-s.t)/320);if(k>=1)continue;const [px,py]=POCKETS.reduce((a,p)=>(p[0]-s.x)**2+(p[1]-s.y)**2<(a[0]-s.x)**2+(a[1]-s.y)**2?p:a);drawBall(x,{id:s.id,x:s.x+(px-s.x)*k,y:s.y+(py-s.y)*k},1-k*.7,1-k*.55);}
 if(interactive&&g.ballInHand&&cue){x.strokeStyle=dragging==='cue'?'#ffd98a':'#ffd98aaa';x.lineWidth=2;x.setLineDash([4,4]);x.beginPath();x.arc(cue.x,cue.y,R+7,0,7);x.stroke();x.setLineDash([]);}
 if(job?.stick&&cue)drawStick(x,cue,job.stick.angle,job.stick.back);
 else if(interactive&&cue&&dragging!=='cue')drawStick(x,cue,aim,power*95);
}
function animate(){if(loop)return;const frame=t=>{loop=0;let again=!!dragging;if(job){step(t);again=again||!!job;}draw();if(again)loop=requestAnimationFrame(frame);};loop=requestAnimationFrame(frame);}

// ---------- the shot sequence ----------
function enqueue(shot){queue.push(shot);if(!job)nextJob();}
function nextJob(){
 const s=queue.shift();if(!s){job=null;frozen=null;afterSequence();return;}
 const prevCue=(job?.balls||tableBalls()).find(b=>b.id===0),startCue=s.start.find(b=>b.id===0),angle=Math.atan2(s.vy,s.vx),speed=Math.sqrt(s.vx*s.vx+s.vy*s.vy);
 const pull=Math.min(95,25+speed/3200*80);
 const phases=[];
 if(!s.local){
  if(prevCue&&(prevCue.in||Math.abs(prevCue.x-startCue.x)+Math.abs(prevCue.y-startCue.y)>2))phases.push({name:'glide',ms:prevCue.in?350:500,from:prevCue.in?{x:startCue.x,y:startCue.y+40}:{x:prevCue.x,y:prevCue.y}});
  phases.push({name:'aim',ms:700,from:view.lastStickAngle??angle+.5,to:angle},{name:'pull',ms:520,to:pull});
 }else phases.push({name:'pull',ms:1,to:Math.max(10,s.pullBack??pull)});
 phases.push({name:'strike',ms:90,from:s.local?Math.max(10,s.pullBack??pull):pull},{name:'roll'},{name:'settle',ms:420});
 job={shot:s,phases,i:0,t0:null,balls:s.start.map(b=>({...b})),stick:null,sim:null,fired:0,clock:0,last:null};
 view.lastStickAngle=angle;refresh();animate();
}
function step(t){
 const j=job,p=j.phases[j.i];j.t0??=t;const k=p.ms?Math.min(1,(t-j.t0)/p.ms):0,s=j.shot,cue=j.balls.find(b=>b.id===0),start=s.start.find(b=>b.id===0);
 if(p.name==='glide'){const e=ease(k);Object.assign(cue,{x:p.from.x+(start.x-p.from.x)*e,y:p.from.y+(start.y-p.from.y)*e,in:false});j.stick=null;}
 else if(p.name==='aim'){const e=ease(k);let d=p.to-p.from;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;j.stick={angle:p.from+d*e,back:12};}
 else if(p.name==='pull'){j.stick={angle:Math.atan2(s.vy,s.vx),back:12+(p.to-12)*ease(k)};}
 else if(p.name==='strike'){j.stick={angle:Math.atan2(s.vy,s.vx),back:p.from*(1-k)};if(k>=1){click('cue',Math.min(1,Math.sqrt(s.vx*s.vx+s.vy*s.vy)/3200));}}
 else if(p.name==='roll'){
  j.stick=null;j.sim??=new Shot(s.start,{vx:s.vx,vy:s.vy,follow:s.follow,side:s.side});j.balls=j.sim.balls;
  // A slow frame slows the roll slightly instead of jumping ahead.
  j.clock+=j.last===null?0:Math.min(34,t-j.last);j.last=t;const target=Math.min(s.steps??Infinity,Math.floor(j.clock/1000*240));
  while(j.sim.steps<target&&j.sim.step());for(;j.fired<j.sim.events.length;j.fired++){const e=j.sim.events[j.fired];click(e.type,e.power);if(e.type==='pocket'){const b=j.sim.balls.find(x=>x.id===e.id);(j.sinking??=[]).push({id:e.id,x:b.x,y:b.y,t:performance.now()});}}
  if(!(j.sim.done||j.sim.steps>=(s.steps??Infinity)))return;
  if(s.local)pending={id:s.id,n:s.n,balls:j.sim.balls.map(b=>({...b}))};
 }
 if(p.name!=='roll'&&k<1)return;
 j.i++;j.t0=t;if(j.i>=j.phases.length)nextJob();
}
function afterSequence(){refresh();draw();}

// ---------- input ----------
function point(e){const r=view.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)/view.scale-FRAME,y:(e.clientY-r.top)/view.scale-FRAME};}
function bindTable(c){
 // Aiming like 8 Ball Pool: grab the stick, the line or anywhere and drag — the stick turns with your finger
 // around the white ball. A quick tap away from the stick and line points the shot at that spot.
 let grab=null;
 const onLine=(p,cue)=>{const ux=Math.cos(aim),uy=Math.sin(aim),dx=p.x-cue.x,dy=p.y-cue.y,along=dx*ux+dy*uy,across=Math.abs(dx*uy-dy*ux);return across<34&&along>-420&&along<640;};
 c.addEventListener('pointerdown',e=>{const g=shown();if(!myTurn(g)||busy)return;unlock();capture(c,e);const p=point(e),cue=tableBalls().find(b=>b.id===0);if(!cue)return;
  if(g.ballInHand&&(p.x-cue.x)**2+(p.y-cue.y)**2<(R*2.6)**2){dragging='cue';place={x:cue.x,y:cue.y};}
  else{dragging='aim';grab={a:Math.atan2(p.y-cue.y,p.x-cue.x),x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,lt:performance.now(),moved:false,line:onLine(p,cue),p};}animate();});
 c.addEventListener('pointermove',e=>{if(!dragging)return;const p=point(e),g=shown();
  if(dragging==='cue'){place={x:Math.max(R,Math.min(W-R,p.x)),y:Math.max(g.ballInHand==='kitchen'?TABLE.headString:R,Math.min(H-R,p.y))};return;}
  if(!grab.moved&&Math.abs(e.clientX-grab.x)+Math.abs(e.clientY-grab.y)<6)return;grab.moved=true;
  const cue=tableBalls().find(b=>b.id===0);if(!cue)return;const dx=p.x-cue.x,dy=p.y-cue.y;if(dx*dx+dy*dy<(R*1.5)**2)return;
  // Speed-sensitive turning: a slow finger turns the stick finely, a quick swipe turns it fast.
  const a=Math.atan2(dy,dx),now=performance.now(),dist=Math.hypot(e.clientX-grab.lx,e.clientY-grab.ly),v=dist/Math.max(8,now-grab.lt);let d=a-grab.a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
  const gain=Math.min(1.9,Math.max(.28,.28+v*1.1));aim+=d*gain;grab.a=a;grab.lx=e.clientX;grab.ly=e.clientY;grab.lt=now;});
 const end=()=>{if(!dragging)return;if(dragging==='aim'&&grab&&!grab.moved&&!grab.line){const cue=tableBalls().find(b=>b.id===0);if(cue)aim=Math.atan2(grab.p.y-cue.y,grab.p.x-cue.x);}dragging=null;grab=null;draw();updateHint();};
 c.addEventListener('pointerup',end);c.addEventListener('pointercancel',()=>{dragging=null;grab=null;draw();});
}
function bindPower(bar){
 let start=null;const fill=bar.querySelector('.billiards-power-fill'),label=bar.querySelector('.billiards-power-value');
 const paint=()=>{fill.style.height=Math.round(power*100)+'%';label.textContent=Math.round(power*100)+'%';};view.paintPower=paint;paint();
 bar.addEventListener('pointerdown',e=>{if(!myTurn(shown())||busy)return;unlock();capture(bar,e);start=e.clientY;power=0;paint();draw();});
 bar.addEventListener('pointermove',e=>{if(start===null)return;power=Math.max(0,Math.min(1,(e.clientY-start)/(bar.clientHeight*.9)));paint();draw();});
 bar.addEventListener('pointerup',()=>{if(start===null)return;start=null;const p=power;if(p>=.03)shoot(p);else{power=0;paint();draw();}});
 bar.addEventListener('pointercancel',()=>{start=null;power=0;paint();draw();});
}
function bindWheel(w){
 let last=null;w.addEventListener('pointerdown',e=>{if(!myTurn(shown()))return;capture(w,e);last=e.clientY;});
 w.addEventListener('pointermove',e=>{if(last===null)return;aim+=(e.clientY-last)*.0016;last=e.clientY;w.style.backgroundPositionY=(e.clientY%40)+'px';draw();});
 const stop=()=>{last=null;};w.addEventListener('pointerup',stop);w.addEventListener('pointercancel',stop);
}
async function shoot(p){
 const g=game();if(!myTurn(g))return;const payload={follow,side},pullBack=p*95;
 if(g.ballInHand){const cue=tableBalls().find(b=>b.id===0);if(!placeable(g.balls,cue.x,cue.y,g.ballInHand==='kitchen')){error(new Error(g.ballInHand==='kitchen'?'Place the cue ball below the line, clear of other balls.':'Move the cue ball clear of other balls.'));power=0;view.paintPower?.();draw();return;}payload.x=cue.x;payload.y=cue.y;}
 const speed=speedFor(p),vx=Math.cos(aim)*speed,vy=Math.sin(aim)*speed,n=(g.shotNumber??0)+1;Object.assign(payload,{vx,vy});
 const start=tableBalls().map(b=>({id:b.id,x:b.x,y:b.y,in:!!b.in}));seen[mode]=g.id+':'+n;frozen=structuredClone(g);power=0;view.paintPower?.();
 // Your own shot plays at once with the exact numbers sent to the server, so nothing waits and nothing snaps.
 enqueue({local:true,id:g.id,n,start,vx,vy,follow,side,pullBack});
 const ok=await command('shoot',payload,g);
 if(ok){place=null;follow=0;side=0;}else{queue=[];job=null;frozen=null;pending=null;seen[mode]=g.lastShot?g.id+':'+g.lastShot.n:null;refresh();draw();}
}

// ---------- spin ----------
function spinLabel(){if(!follow&&!side)return 'No spin';return [follow>.05?'top':follow<-.05?'back':'',side>.05?'right':side<-.05?'left':''].filter(Boolean).join(' + ')+' spin';}
function spinPad(root){
 const b=make('button',undefined,root,'billiards-spin-button');b.type='button';b.title='Spin';b.setAttribute('aria-label','Spin: '+spinLabel());
 const dot=make('i',undefined,b);dot.style.left=50+side*38+'%';dot.style.top=50-follow*38+'%';b.onclick=()=>{spinOpen=!spinOpen;refresh(true);};
 if(!spinOpen)return;
 const pop=make('div',undefined,root,'billiards-spin-pop');make('strong','Spin',pop);make('small','Tap where the cue hits the white ball.',pop);
 const pad=make('div',undefined,pop,'billiards-spin-pad'),mark=make('i',undefined,pad),label=make('span','',pop,'billiards-spin-label');
 const paint=()=>{mark.style.left=50+side*44+'%';mark.style.top=50-follow*44+'%';dot.style.left=50+side*38+'%';dot.style.top=50-follow*38+'%';label.textContent=spinLabel();};
 const set=e=>{const r=pad.getBoundingClientRect();let sx=((e.clientX-r.left)/r.width-.5)/.44,sy=-((e.clientY-r.top)/r.height-.5)/.44;const m=Math.sqrt(sx*sx+sy*sy);if(m>1){sx/=m;sy/=m;}side=Math.round(sx*100)/100;follow=Math.round(sy*100)/100;paint();};
 pad.addEventListener('pointerdown',e=>{capture(pad,e);set(e);});pad.addEventListener('pointermove',e=>{if(e.buttons)set(e);});
 const row=make('div',undefined,pop,'billiards-spin-actions');btn('Centre',row,()=>{side=0;follow=0;paint();});btn('Done',row,()=>{spinOpen=false;refresh(true);},'primary');paint();
}

// ---------- live screen (built once per game, then updated in place) ----------
function buildLive(root){
 root.replaceChildren();
 view.score=make('div',undefined,root,'billiards-scoreboard');
 view.turn=make('p','',root,'billiards-turn');view.turn.setAttribute('role','status');view.turn.setAttribute('aria-live','polite');
 const stage=make('div',undefined,root,'billiards-stage');
 const bar=make('div',undefined,stage,'billiards-power');bar.setAttribute('aria-label','Power: pull down and let go to shoot');make('span','POWER',bar,'billiards-power-title');const track=make('div',undefined,bar,'billiards-power-track');make('div',undefined,track,'billiards-power-fill');make('span','0%',bar,'billiards-power-value');view.bar=bar;
 view.tableBox=make('div',undefined,stage,'billiards-table');view.tableBox.append(canvas());
 const sideCol=make('div',undefined,stage,'billiards-side');view.spinSlot=make('div',undefined,sideCol,'billiards-spin-slot');
 view.wheel=make('div',undefined,sideCol,'billiards-wheel');view.wheel.setAttribute('aria-label','Fine aim: drag up or down');
 const foot=make('div',undefined,root,'billiards-footer');view.hint=make('p','',foot,'billiards-hint');
 view.leave=btn('Leave game',foot,async()=>{const g=game();if(await window.OurGameUI.confirm({title:'Leave this game?',message:'The game ends without a win. Minimize instead to keep it saved.',confirmLabel:'Leave game'}))await command('leave',{},g);},'billiards-leave');
 view.overlay=make('div',undefined,root,'billiards-overlay');
 bindPower(bar);bindWheel(view.wheel);view.liveSig='';
 if(typeof ResizeObserver!=='undefined'){view.resize?.disconnect();view.resize=new ResizeObserver(()=>fit());view.resize.observe(view.tableBox);}
 requestAnimationFrame(fit);
}
function scoreboard(g){
 const sig=JSON.stringify([g.turn,g.status,g.groups,g.breakShot,g.balls.filter(b=>b.in).map(b=>b.id)]);if(view.scoreSig===sig&&view.score.childElementCount)return;view.scoreSig=sig;
 const box=view.score;box.replaceChildren();const names=g.mode==='shared'?['Mahmoud','Safy']:g.players;
 const card=name=>{const c=make('div',undefined,box,'billiards-player '+name.toLowerCase());c.classList.toggle('turn',g.turn===name&&g.status==='active');make('strong',name===who?'You':name,c);const group=g.groups?.[name];
  make('small',group?group[0].toUpperCase()+group.slice(1):g.breakShot?(g.turn===name?'Breaks':'Waiting'):'Open table',c);const row=make('div',undefined,c,'billiards-mini');
  const ids=group==='solids'?[1,2,3,4,5,6,7]:group==='stripes'?[9,10,11,12,13,14,15]:[];for(const id of ids){const on=g.balls.find(b=>b.id===id&&!b.in);const m=make('i',undefined,row,'billiards-mini-ball'+(id>8?' stripe':'')+(on?'':' gone'));m.style.setProperty('--c',COLORS[id]);}
  if(group&&!ids.some(id=>g.balls.find(b=>b.id===id&&!b.in))){const m=make('i',undefined,row,'billiards-mini-ball');m.style.setProperty('--c',COLORS[8]);}};
 card(names[0]);const mid=make('div',undefined,box,'billiards-mid');make('small','8 BALL',mid);view.clock=make('span','',mid,'billiards-clock');card(names[1]);updateClock();
}
function statusText(g){
 if(job||queue.length){const by=job?(job.shot.local?who:job.shot.by):queue[0].by;return by===who?'Your shot…':by==='Computer'?'Computer shoots…':by+' shoots…';}
 if(g.status==='complete')return g.last;
 if(g.choice)return g.choice.who===who?'Choose: spot the 8 or re-rack.':g.choice.who+' is choosing.';
 if(g.turn===who)return g.breakShot?'Your break':g.ballInHand?'Your turn · ball in hand':'Your turn';
 return g.turn==='Computer'?'Computer is lining up…':g.turn+' is lining up…';
}
function updateHint(){const h=view.hint;if(!h)return;const g=shown();if(!g||g.status!=='active'){h.textContent='';return;}
 h.textContent=myTurn(g)?(g.ballInHand&&!place?'Drag the white ball to place it'+(g.ballInHand==='kitchen'?' below the line':'')+', then aim':'Drag the stick or the line to turn it · tap a spot to aim there · fine-tune on the right · pull the power bar down and let go'):(job?'':g.last||'');}
function updateClock(){
 const g=shown(),c=view.clock;if(!c)return;if(!g||g.status!=='active'||!g.deadline||job||queue.length){c.textContent='';c.className='billiards-clock';return;}
 const left=Math.max(0,Math.ceil((g.deadline-(Date.now()+clockOffset))/1000)),shownLeft=Math.min(g.shotSeconds,left);c.textContent=shownLeft+'s';c.className='billiards-clock'+(shownLeft<=10?' low':'');
}
function updateLive(){
 const g=shown();if(!g||!view.score)return;
 scoreboard(g);const text=statusText(g);if(view.turn.textContent!==text){view.turn.textContent=text;view.turn.classList.remove('billiards-fade');void view.turn.offsetWidth;view.turn.classList.add('billiards-fade');}
 const mine=myTurn(g);view.bar.classList.toggle('off',!mine);view.wheel.classList.toggle('off',!mine);view.leave.hidden=g.status!=='active';view.leave.disabled=busy;
 const spinSig=mine+':'+spinOpen;if(view.spinSig!==spinSig){view.spinSig=spinSig;view.spinSlot.replaceChildren();if(mine)spinPad(view.spinSlot);}
 const over=job||queue.length?'':g.status==='complete'?'result:'+g.id:g.choice?.who===who?'choice:'+g.revision:'';
 if(view.overSig!==over){view.overSig=over;view.overlay.replaceChildren();if(over.startsWith('result'))result(view.overlay,g);else if(over.startsWith('choice'))choice(view.overlay,g);}
 updateHint();updateClock();
}
function choice(root,g){
 const card=make('div',undefined,root,'billiards-choice');make('h4','The 8 went in on the break',card);
 make('p',g.choice.scratch?'The cue ball went in too, so you choose. If you spot the 8, you play with the cue ball behind the line.':'That is not a loss. Choose how to continue.',card,'muted');
 const row=make('div',undefined,card,'billiards-choice-actions');btn('Spot the 8 · keep playing',row,()=>command('choose',{option:'spot'}),'primary');btn('Re-rack · break again',row,()=>command('choose',{option:'rerack'}));
}
function result(root,g){
 const card=make('div',undefined,root,'billiards-result');card.setAttribute('role','status');make('small',g.mode==='shared'?'MATCH COMPLETE · SAVED TO THE CROWN':'GAME COMPLETE',card);
 make('h3',g.winner===who?'You won!':g.winner+' won',card);make('p',g.last,card);
 const row=make('div',undefined,card,'billiards-result-actions');btn('Rematch',row,()=>command('rematch'),'primary');btn('Back',row,()=>minimize());
}

// ---------- setup screens ----------
function setup(root,g){
 const box=make('div',undefined,root,'billiards-setup');
 if(g?.status==='declined'&&g.owner===who)make('p',other()+' said not now.',box,'muted');
 if(g?.status==='expired'&&g.owner===who)make('p','Your invitation expired.',box,'muted');
 make('h4',mode==='solo'?'Play against the computer':'Play with '+other(),box);let level,clock;
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
 const book=data.records?.[mode]??{wins:{},history:[]},sig=JSON.stringify([mode,book]);if(view.recSig===sig)return;view.recSig=sig;const root=$('#billiards-records');root.replaceChildren();
 make('small',mode==='shared'?'YOUR RIVALRY · MATCH WINS':'SOLO · GAMES WON',root,'label');for(const n of mode==='shared'?['Mahmoud','Safy']:[who,'Computer'])make('span',n+' · '+(book.wins?.[n]??0),root,'billiards-win');
 const list=$('#billiards-history-list');list.replaceChildren();if(!book.history?.length)make('p','Finished games will be remembered here.',list,'muted');
 for(const h of book.history??[]){const row=make('div',undefined,list,'billiards-history-row');make('strong',h.status==='completed'?h.winner+' won':'Unfinished game',row);make('small',new Date(h.date).toLocaleDateString()+' · '+h.shots+' shots'+(h.difficulty?' · '+h.difficulty:''),row);}
}
function invitation(){
 const g=data.shared,root=$('#billiards-invitation'),show=g?.status==='waiting'&&g.owner!==who,sig=show?g.id:'';if(root.dataset.sig===sig)return;root.dataset.sig=sig;root.replaceChildren();root.hidden=!show;if(!show)return;
 make('span',g.owner+' invited you to Billiards'+(g.shotSeconds?' · '+g.shotSeconds+'s per shot':'')+'.',root);
 btn('Join',root,async()=>{mode='shared';opened=true;host.goto('together');stepIn();await command('accept',{},g);host.revealPanel?.('#billiards-panel');},'primary');
 btn('Not now',root,()=>command('decline',{},g));
}
function refresh(force=false){
 if(!who)return;show();invitation();records();
 $('#billiards-solo').classList.toggle('selected',mode==='solo');$('#billiards-shared').classList.toggle('selected',mode==='shared');
 $('#billiards-open-note').textContent=data.shared?.status==='active'?(data.shared.turn===who?'Your shot. The table is waiting.':'Your game with '+other()+' is saved.'):data.solo?.status==='active'?'Your solo game is saved.':'Eight balls. One little rivalry.';
 const g=shown(),root=$('#billiards-game'),type=!g||['ended','declined','expired'].includes(g.status)?'setup':g.status==='waiting'?'waiting':'live',key=mode+':'+(g?.id??'none')+':'+type;
 if(type==='live'){if(screenKey!==key||!view.score?.isConnected){screenKey=key;view.scoreSig=null;view.spinSig=null;view.overSig=null;buildLive(root);}if(force)view.spinSig=null;updateLive();draw();return;}
 const sig=key+JSON.stringify([g?.status,g?.revision,busy]);if(screenKey===key&&setupSig===sig&&!force)return;screenKey=key;setupSig=sig;root.replaceChildren();view.score=null;
 if(type==='setup')setup(root,g);else waiting(root,g);
}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(fit,120);});
function init(h){
 host=h;soundButton();window.OurGameUI?.registerChat?.($('.billiards-head'),()=>minimize(true));
 $('#billiards-open').onclick=()=>{unlock();opened=true;stepIn();refresh(true);host.revealPanel?.('#billiards-panel');requestAnimationFrame(fit);};
 $('#billiards-collapse').onclick=()=>minimize();$('#billiards-chat').onclick=()=>minimize(true);
 $('#billiards-sound').onclick=()=>{soundOn=!soundOn;try{localStorage.setItem('our-place:billiards:sound',soundOn?'on':'off');}catch{}soundButton();if(soundOn){unlock();click('ball',.6);}};
 for(const m of ['solo','shared'])$('#billiards-'+m).onclick=()=>{if(mode===m)return;mode=m;place=null;spinOpen=false;queue=[];job=null;frozen=null;refresh(true);};
 setInterval(updateClock,250);
}
window.OurBilliards={init,sync(s){
 if(!s?.billiards)return;if(Number.isFinite(s.version)&&who===s.who&&s.version<version)return;
 if(who!==s.who){who=s.who;opened=false;mode='solo';seen={};try{const saved=JSON.parse(localStorage.getItem('our-place:billiards:'+who)||'null');if(saved){mode=saved.mode==='shared'?'shared':'solo';opened=!!saved.opened;}}catch{}if(opened)stepIn();}
 if(Number.isFinite(s.serverNow))clockOffset=s.serverNow-Date.now();version=s.version;
 const first=!Object.keys(seen).length,before=data;data=s.billiards;
 for(const m of ['solo','shared']){const g=data[m],key=g?.lastShot?g.id+':'+g.lastShot.n:null;if(!key){seen[m]=null;continue;}
  if(seen[m]!==key){const fresh=!first&&seen[m]!==undefined;seen[m]=key;
   if(fresh&&m===mode&&opened&&!document.hidden&&g.lastShot.by!==who){if(!job&&!queue.length)frozen=before[m]&&before[m].id===g.id?structuredClone(before[m]):null;enqueue({...g.lastShot,id:g.id});}}}
 if(pending&&!['solo','shared'].some(m=>data[m]?.id===pending.id&&(data[m].shotNumber??0)<pending.n))pending=null;
 const g=game();if(g?.ballInHand&&g.turn===who){if(!place){const c=g.balls.find(b=>b.id===0);const k=g.ballInHand==='kitchen';place=c&&!c.in&&placeable(g.balls,c.x,c.y,k)?{x:c.x,y:c.y}:{x:W/2,y:k?TABLE.headString+60:H*.75};if(!placeable(g.balls,place.x,place.y,k))for(let y=H-40;y>R;y-=20)if(placeable(g.balls,W/2,y,k)){place={x:W/2,y};break;}}}else if(!job)place=null;
 refresh();
},reset(){cancelAnimationFrame(loop);loop=0;queue=[];job=null;frozen=null;pending=null;who=null;data={};version=-1;seen={};opened=false;place=null;screenKey='';setupSig='';view.score=null;$('#billiards-game')?.replaceChildren();const inv=$('#billiards-invitation');if(inv){inv.hidden=true;inv.dataset.sig='';}document.body.classList.remove('billiards-locked');$('#billiards-panel').hidden=true;$('#billiards-open').hidden=false;}};
