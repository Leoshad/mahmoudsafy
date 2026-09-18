// Shared deterministic physics. The server owns race positions and finishes.
export const DT=1/60, SPEED=245, GRAVITY=900, JUMP=415, FLOOR=150, WIDTH=18, HEIGHT=30;
export function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function course(seed,count=6){const r=random(seed),parts=[];let x=240;const order=[0,4,2,3,5,1];for(let i=order.length-1;i>1;i--){const j=1+Math.floor(r()*i);[order[i],order[j]]=[order[j],order[i]];}for(let i=0;i<count;i++){const type=order[i%6],length=650+Math.floor(r()*65),a=x+150;parts.push({i,type,start:x,end:x+length,a,b:a+([330,280,290,32,310,290][type]),period:1.6+r()*.45,phase:r()*6.28});x+=length;}return{version:3,seed,parts,finish:x+160};}

export function runner(){return{x:70,y:FLOOR,vx:0,vy:0,ground:true,on:null,checkpoint:70,deaths:0,respawn:0,collapsed:{},jumpSeen:0,coyote:0,buffer:0,boost:0};}
export function gateOpen(p,t){return((t+p.phase)%p.period)<p.period*.48;}
export function platforms(c,t,p){const out=[];let from=0;for(const q of c.parts){if(q.type===3)continue;out.push({x:from,w:q.a-from,y:FLOOR,id:'land'+q.i});if(q.type===0)out.push({x:(q.a+q.b)/2-30,w:60,y:FLOOR-16,id:'island'+q.i});if(q.type===1){out.push({x:(q.a+q.b)/2-33+Math.sin(t*2+q.phase)*55,w:66,y:FLOOR-12,id:'move'+q.i});}if(q.type===2){for(let k=0;k<6;k++){if(k===2||k===4)continue;const id='crumble'+q.i+'-'+k;if(p.collapsed[id]===undefined||t-p.collapsed[id]<.24)out.push({x:q.a+k*(q.b-q.a)/6,w:(q.b-q.a)/6,y:FLOOR,id,crumble:true});}}if(q.type===4){out.push({x:q.a-35,w:q.b-q.a+70,y:FLOOR-62,id:'shortcut'+q.i});for(let k=0;k<4;k++)out.push({x:q.a+k*85,w:48,y:FLOOR+42,id:'steps'+q.i+'-'+k});}if(q.type===5){out.push({x:q.a-60,w:60,y:FLOOR,id:'boost'+q.i,boost:true});}from=q.b;}out.push({x:from,w:c.finish+300-from,y:FLOOR,id:'end'});return out;}
export function hazard(q,t){return{x:(q.a+q.b)/2+Math.sin(t*2+q.phase)*32,y:FLOOR-62,w:22,h:24};}
export function resetRunner(p){p.x=p.checkpoint;p.y=FLOOR;p.vx=p.vy=0;p.ground=true;p.on=null;p.respawn=.3;p.deaths++;p.collapsed={};}
export function step(c,p,input,t,dt=DT){
 if(p.respawn>0){p.respawn=Math.max(0,p.respawn-dt);p.jumpSeen=input.jump;return;}
 const surfaces=platforms(c,t,p),old=platforms(c,t-dt,p);if(p.on?.startsWith('move')){const a=surfaces.find(s=>s.id===p.on),b=old.find(s=>s.id===p.on);if(a&&b)p.x+=a.x-b.x;}
 const jump=input.jump>p.jumpSeen;p.jumpSeen=input.jump;p.coyote=p.ground?.09:Math.max(0,(p.coyote||0)-dt);p.buffer=jump?.2:Math.max(0,(p.buffer||0)-dt);p.boost=Math.max(0,(p.boost||0)-dt);if(p.ground&&c.parts.some(q=>q.type===5&&p.x>=q.a-65&&p.x<q.a))p.boost=.85;
 if(p.buffer>0&&p.coyote>0){p.vy=-JUMP;p.buffer=0;p.coyote=0;p.ground=false;p.on=null;}
 p.vx=Math.max(-1,Math.min(1,input.dir||0))*SPEED*(p.boost>0?1.5:1);
 const prev=p.y;p.x=Math.max(10,p.x+p.vx*dt);p.vy+=GRAVITY*dt;p.y+=p.vy*dt;p.ground=false;p.on=null;
 for(const s of surfaces)if(p.vy>=0&&p.x+WIDTH/2>s.x&&p.x-WIDTH/2<s.x+s.w&&prev<=s.y+.8&&p.y>=s.y){p.y=s.y;p.vy=0;p.ground=true;p.on=s.id;if(s.crumble&&p.collapsed[s.id]===undefined)p.collapsed[s.id]=t;break;}
 for(const q of c.parts){if(p.ground&&p.x>=q.start&&p.x<q.a-35)p.checkpoint=Math.max(p.checkpoint,q.start+12);if(q.type===4){const h=hazard(q,t);if(p.x+WIDTH/2>h.x&&p.x-WIDTH/2<h.x+h.w&&p.y>h.y-h.h&&p.y-HEIGHT<h.y){resetRunner(p);return;}}if(q.type===3&&!gateOpen(q,t)&&p.x+WIDTH/2>q.a&&p.x-WIDTH/2<q.b&&p.y>FLOOR-115){resetRunner(p);return;}}
 if(p.y>FLOOR+180)resetRunner(p);
}
export function botInput(c,p,t,input){let dir=1,jump=input.jump;const q=c.parts.find(q=>q.b+35>p.x);
 if(q){if(q.type===3){if(p.x>q.a-70&&p.x<q.a&&!gateOpen(q,t+.18))dir=0;}else if(p.ground){const surfaces=platforms(c,t,p),s=surfaces.find(s=>s.id===p.on);if(q.type===4&&p.x>q.a-95&&p.x<q.a-45)jump++;else if(q.type===4&&p.on?.startsWith('shortcut')&&hazard(q,t).x-p.x<70&&hazard(q,t).x>p.x)jump++;else if(s&&s.x+s.w-p.x<24){const reach=p.boost>0?330:195;const landing=surfaces.find(n=>n.x>s.x&&n.x-p.x<reach);if(landing)jump++;else dir=0;}if(q.type===2&&p.x>q.a-30&&p.x<q.b)jump++;}}
 return{dir,jump};
}
