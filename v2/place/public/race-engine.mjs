// Shared deterministic physics. The server owns race positions and finishes.
export const DT=1/60, SPEED=185, GRAVITY=900, JUMP=390, FLOOR=150, WIDTH=18, HEIGHT=30;
export function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function course(seed,count=24){const r=random(seed),parts=[];let x=280,last=-1;for(let i=0;i<count;i++){let type=Math.floor(r()*4);if(type===last)type=(type+1+Math.floor(r()*3))%4;last=type;const length=470+Math.floor(r()*100),a=x+145;parts.push({i,type,start:x,end:x+length,a,b:a+(type===0?90+Math.floor(r()*25):type===1?180:type===2?150:28),period:2.4+r()*1.2,phase:r()*6.28});x+=length;}return{seed,parts,finish:x+200};}
export function runner(){return{x:70,y:FLOOR,vx:0,vy:0,ground:true,on:null,checkpoint:70,deaths:0,respawn:0,collapsed:{},jumpSeen:0};}
export function gateOpen(p,t){return((t+p.phase)%p.period)<p.period*.48;}
export function platforms(c,t,p){const out=[];let from=0;for(const q of c.parts){if(q.type===3)continue;out.push({x:from,w:q.a-from,y:FLOOR,id:'land'+q.i});if(q.type===1){out.push({x:(q.a+q.b)/2-48+Math.sin(t*1.6+q.phase)*32,w:96,y:FLOOR-12,id:'move'+q.i});}if(q.type===2){for(let k=0;k<3;k++){const id='crumble'+q.i+'-'+k;if(p.collapsed[id]===undefined||t-p.collapsed[id]<.55)out.push({x:q.a+k*50,w:50,y:FLOOR,id,crumble:true});}}from=q.b;}out.push({x:from,w:c.finish+300-from,y:FLOOR,id:'end'});return out;}
export function resetRunner(p){p.x=p.checkpoint;p.y=FLOOR;p.vx=p.vy=0;p.ground=true;p.on=null;p.respawn=.65;p.deaths++;p.collapsed={};}
export function step(c,p,input,t,dt=DT){
 if(p.respawn>0){p.respawn=Math.max(0,p.respawn-dt);p.jumpSeen=input.jump;return;}
 const surfaces=platforms(c,t,p),old=platforms(c,t-dt,p);if(p.on?.startsWith('move')){const a=surfaces.find(s=>s.id===p.on),b=old.find(s=>s.id===p.on);if(a&&b)p.x+=a.x-b.x;}
 const jump=input.jump>p.jumpSeen;p.jumpSeen=input.jump;
 if(jump&&p.ground){p.vy=-JUMP;p.ground=false;p.on=null;}
 p.vx=Math.max(-1,Math.min(1,input.dir||0))*SPEED;
 const prev=p.y;p.x=Math.max(10,p.x+p.vx*dt);p.vy+=GRAVITY*dt;p.y+=p.vy*dt;p.ground=false;p.on=null;
 for(const s of surfaces)if(p.vy>=0&&p.x+WIDTH/2>s.x&&p.x-WIDTH/2<s.x+s.w&&prev<=s.y+.8&&p.y>=s.y){p.y=s.y;p.vy=0;p.ground=true;p.on=s.id;if(s.crumble&&p.collapsed[s.id]===undefined)p.collapsed[s.id]=t;break;}
 for(const q of c.parts){if(p.ground&&p.x>=q.start&&p.x<q.a-35)p.checkpoint=Math.max(p.checkpoint,q.start+12);if(q.type===3&&!gateOpen(q,t)&&p.x+WIDTH/2>q.a&&p.x-WIDTH/2<q.b&&p.y>FLOOR-115){resetRunner(p);return;}}
 if(p.y>FLOOR+180)resetRunner(p);
}
export function botInput(c,p,t,input){let dir=1,jump=input.jump;const q=c.parts.find(q=>q.b+30>p.x);
 if(q){if(q.type===3){if(p.x>q.a-55&&p.x<q.a&&!gateOpen(q,t+.22))dir=0;}else if(p.ground){const surfaces=platforms(c,t,p),s=surfaces.find(s=>s.id===p.on);if(s&&s.x+s.w-p.x<18){let landing=surfaces.find(n=>n.x>s.x&&n.x-p.x<145);if(landing)jump++;else dir=0;}if(q.type===2&&p.x>q.a-30&&p.x<q.b)jump++;}}
 return{dir,jump};
}
