(()=>{'use strict';
const host=document.querySelector('.conversation-window'),timeline=document.querySelector('#timeline');if(!host)return;
const layer=document.createElement('div');layer.id='release-balloon';layer.hidden=true;layer.setAttribute('role','group');layer.setAttribute('aria-label','Let it go balloon');
layer.innerHTML='<canvas aria-hidden="true"></canvas><button class="balloon-close" aria-label="Close balloon">×</button><p class="balloon-caption" role="status"></p><button class="balloon-pin" aria-label="Drag the pin onto the balloon, or tap to pop" hidden><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M33 15 8 40" stroke="#f4e6d1" stroke-width="2.5"/><circle cx="34" cy="14" r="8" fill="#dfabc0" stroke="#f8d9e5" stroke-width="2"/><circle cx="32" cy="11" r="2" fill="#fff0f4"/></svg></button>';
host.append(layer);const canvas=layer.querySelector('canvas'),ctx=canvas.getContext('2d'),caption=layer.querySelector('p'),pin=layer.querySelector('.balloon-pin');
let mode='idle',gesture=null,hold=null,frame=null,ending=null,progress=0,shown=0,w=0,h=0,started=0,popped=0,particles=[],audio=null,drag=null,pinMoved=false,suppressUntil=0;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function setting(k){try{return localStorage.getItem('our-place:buzz:'+k)!=='off';}catch{return true;}}
function unlock(){if(!setting('sound'))return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}}
function popSound(){if(!setting('sound')||audio?.state!=='running')return;const n=audio.sampleRate*.12,b=audio.createBuffer(1,n,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(n*.13));const s=audio.createBufferSource(),g=audio.createGain(),f=audio.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=950;g.gain.value=.16;s.connect(f);f.connect(g);g.connect(audio.destination);s.start();}
function resize(){const r=host.getBoundingClientRect();w=r.width;h=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(d,0,0,d,0,0);}
function shape(){const rx=Math.min(w*.34,h*.25)*( .25+.75*shown),ry=rx*1.2;return {x:w/2,y:h*.46,rx,ry};}
function path(x,y,rx,ry){ctx.beginPath();ctx.moveTo(x,y+ry);ctx.bezierCurveTo(x-rx*.35,y+ry*.85,x-rx,y+ry*.45,x-rx,y-ry*.2);ctx.bezierCurveTo(x-rx,y-ry*1.25,x+rx,y-ry*1.25,x+rx,y-ry*.2);ctx.bezierCurveTo(x+rx,y+ry*.45,x+rx*.35,y+ry*.85,x,y+ry);ctx.closePath();}
function draw(now){
 if(mode==='idle')return;ctx.clearRect(0,0,w,h);shown+= (progress-shown)*(reduced()?1:.2);const t=(now-started)/1000,{x,y,rx,ry}=shape();
 if(mode!=='popped'){
 ctx.save();const sway=reduced()?0:Math.sin(t*1.5)*2;ctx.translate(sway,0);
 ctx.beginPath();ctx.moveTo(x,y+ry+5);ctx.bezierCurveTo(x-12,y+ry+25,x+12,y+ry+35,x,y+ry+55);ctx.strokeStyle='#d1b48b88';ctx.lineWidth=1;ctx.stroke();
 path(x,y,rx,ry);const g=ctx.createRadialGradient(x-rx*.35,y-ry*.42,1,x,y,ry*1.2);g.addColorStop(0,'#e8a9c5');g.addColorStop(.35,'#bf6b98');g.addColorStop(.76,'#803b69');g.addColorStop(1,'#db9cba');ctx.fillStyle=g;ctx.fill();ctx.save();ctx.clip();
 for(let i=0;i<7;i++){const a=t*.25+i*2.4,cx=x+Math.sin(a)*rx*.5,cy=y+Math.cos(a*.8)*ry*.45,cloud=ctx.createRadialGradient(cx,cy,0,cx,cy,rx*.7);cloud.addColorStop(0,i%2?'#eac88e35':'#42243c55');cloud.addColorStop(1,'transparent');ctx.fillStyle=cloud;ctx.fillRect(x-rx,y-ry,rx*2,ry*2);}
 ctx.restore();path(x,y,rx,ry);ctx.strokeStyle='#f4d4df99';ctx.lineWidth=1.2;ctx.stroke();ctx.beginPath();ctx.ellipse(x-rx*.48,y-ry*.4,rx*.13,ry*.24,.45,0,Math.PI*2);ctx.fillStyle='#fff2ef45';ctx.fill();
 ctx.beginPath();ctx.moveTo(x,y+ry-2);ctx.lineTo(x-5,y+ry+8);ctx.quadraticCurveTo(x,y+ry+5,x+5,y+ry+8);ctx.closePath();ctx.fillStyle='#bc799c';ctx.fill();
 if(shown>.3){ctx.globalAlpha=Math.min(1,(shown-.3)*3);ctx.fillStyle='#fff3e9';ctx.textAlign='center';ctx.font='500 '+Math.max(10,rx*.145)+'px system-ui';['Everything','weighing','on me.'].forEach((line,i)=>ctx.fillText(line,x,y+(i-1)*rx*.21));}ctx.restore();
 }else{const age=(now-popped)/1000;for(const p of particles){ctx.globalAlpha=Math.max(0,1-age/1.2);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(x+p.dx*age,y+p.dy*age+30*age*age,p.r*(1+age),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
 frame=requestAnimationFrame(draw);
}
function open(){mode='inflating';progress=shown=0;layer.hidden=false;layer.classList.remove('leaving','is-ready','is-popped');caption.textContent='Fill it with everything weighing on you.';pin.hidden=true;pin.style.transform='';resize();started=performance.now();frame=requestAnimationFrame(draw);}
function close(immediate=false){clearTimeout(hold);hold=null;gesture=null;drag=null;clearTimeout(ending);suppressUntil=performance.now()+350;if(mode==='idle')return;mode='idle';cancelAnimationFrame(frame);layer.classList.add('leaving');const hide=()=>{layer.hidden=true;layer.classList.remove('leaving');};if(immediate)hide();else ending=setTimeout(hide,180);}
function ready(){mode='ready';progress=1;caption.textContent='Whenever you’re ready.';layer.classList.add('is-ready');pin.hidden=false;}
function pop(){if(mode!=='ready')return;mode='popped';popped=performance.now();pin.hidden=true;caption.textContent='Let it go.';layer.classList.add('is-popped');particles=Array.from({length:reduced()?0:35},(_,i)=>({dx:Math.cos(i*2.4)*(30+Math.random()*110),dy:Math.sin(i*2.4)*(30+Math.random()*100),r:1+Math.random()*4,color:i%2?'#e5b3ca':'#dbc391'}));popSound();if(setting('vibration'))navigator.vibrate?.(25);ending=setTimeout(()=>close(),1500);}
const blocked='button,a,input,textarea,select,summary,details,img,.avatar,.bubble,[data-profile-name]';
function start(x,y,id,target){if(mode!=='idle'||document.querySelector('dialog[open]')||target.closest(blocked))return;gesture={x,y,id,armed:false};hold=setTimeout(()=>{if(!gesture)return;gesture.armed=true;unlock();open();},350);}
function move(x,y){if(!gesture)return false;const dx=x-gesture.x,dy=gesture.y-y;if(!gesture.armed){if(Math.hypot(dx,dy)>9){clearTimeout(hold);gesture=null;}return false;}progress=Math.max(0,Math.min(1,dy/Math.min(230,h*.48)));return true;}
function end(){clearTimeout(hold);if(!gesture)return;const armed=gesture.armed;gesture=null;if(!armed)return;suppressUntil=performance.now()+400;if(progress>=.97)ready();else close();}
// Capture only after a deliberate stationary hold; ordinary scrolling remains native.
timeline.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];start(t.clientX,t.clientY,t.identifier,e.target);},{passive:true});
window.addEventListener('touchmove',e=>{if(!gesture)return;if(e.touches.length!==1){close();return;}const t=[...e.touches].find(t=>t.identifier===gesture.id);if(t&&move(t.clientX,t.clientY)){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
window.addEventListener('touchend',()=>end(),{capture:true,passive:true});window.addEventListener('touchcancel',()=>close(),{passive:true});
timeline.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0)start(e.clientX,e.clientY,e.pointerId,e.target);});window.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')move(e.clientX,e.clientY);});window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')end();});
timeline.addEventListener('contextmenu',e=>{if(gesture?.armed)e.preventDefault();});host.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopPropagation();}},true);
layer.querySelector('.balloon-close').onclick=()=>close();
pin.addEventListener('pointerdown',e=>{e.preventDefault();pin.setPointerCapture(e.pointerId);pinMoved=false;drag={x:e.clientX,y:e.clientY};unlock();});
pin.addEventListener('pointermove',e=>{if(!drag||mode!=='ready')return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)pinMoved=true;pin.style.transform=`translate(${e.clientX-drag.x}px,${e.clientY-drag.y}px)`;const r=canvas.getBoundingClientRect(),b=shape();if(((e.clientX-r.left-b.x)/b.rx)**2+((e.clientY-r.top-b.y)/b.ry)**2<1)pop();});
pin.addEventListener('pointerup',()=>{drag=null;pin.style.transform='';});pin.addEventListener('pointercancel',()=>{drag=null;pin.style.transform='';});pin.onclick=()=>{if(!pinMoved)pop();pinMoved=false;};
let dismissY=null;layer.addEventListener('pointerdown',e=>{if(e.target===canvas&&mode==='ready')dismissY=e.clientY;});layer.addEventListener('pointermove',e=>{if(dismissY!==null&&e.clientY-dismissY>55){dismissY=null;close();}});layer.addEventListener('pointerup',()=>dismissY=null);
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});document.addEventListener('visibilitychange',()=>{if(document.hidden)close(true);});
new MutationObserver(()=>{if(document.querySelector('#chat').hidden||document.querySelector('#app').hidden)close(true);}).observe(document.querySelector('#app'),{attributes:true,subtree:true,attributeFilter:['hidden']});
window.addEventListener('resize',()=>{if(mode!=='idle')resize();});
// An accessible alternative to the gesture, placed in the existing menu.
const button=document.createElement('button');button.type='button';button.textContent='Let it go · Balloon';button.onclick=()=>{unlock();open();progress=1;ready();document.querySelector('.room-tools').open=false;pin.focus();};document.querySelector('.tools-content').append(button);
})();
