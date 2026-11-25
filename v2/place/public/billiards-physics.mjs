// Billiards table physics, shared by the server (authoritative result) and the phones (animation).
// Deterministic on purpose: only + - * / and Math.sqrt inside the step, so every device replays a
// shot exactly as the server computed it. Units: the playing surface is 500 × 1000, y grows downward.
// The rack sits at the top (foot), the breaker plays from the bottom (head).
export const TABLE=Object.freeze({width:500,height:1000,radius:16,cornerMouth:46,sideMouth:37,headString:750,footSpot:250,dt:1/240});
const {width:W,height:H,radius:R,cornerMouth:CM,sideMouth:SM,dt:DT}=TABLE;
// Cloth drag: a constant part plus a speed part, so fast balls slow quickly and slow balls glide to a soft stop.
const ROLL_A=95,ROLL_K=.75,NATURAL=.46,STOP=4,BALL_E=.94,RAIL_E=.76,RAIL_GRIP=.97,MIN_SPEED=320,MAX_SPEED=3200,MAX_STEPS=240*14;
// Cushions: straight rails between pocket mouths, each with rounded jaw tips.
const RAILS=[
 {ax:CM,ay:0,bx:W-CM,by:0,nx:0,ny:1},{ax:CM,ay:H,bx:W-CM,by:H,nx:0,ny:-1},
 {ax:0,ay:CM,bx:0,by:H/2-SM,nx:1,ny:0},{ax:0,ay:H/2+SM,bx:0,by:H-CM,nx:1,ny:0},
 {ax:W,ay:CM,bx:W,by:H/2-SM,nx:-1,ny:0},{ax:W,ay:H/2+SM,bx:W,by:H-CM,nx:-1,ny:0}];
const JAWS=[];for(const r of RAILS){JAWS.push([r.ax,r.ay],[r.bx,r.by]);}
export const POCKETS=Object.freeze([[-6,-6],[W+6,-6],[-14,H/2],[W+14,H/2],[-6,H+6],[W+6,H+6]]);
export const GROUP=id=>id>=1&&id<=7?'solids':id>=9&&id<=15?'stripes':null;
// Gentle curve: fine control for soft shots, full power still breaks hard.
export const SPEED=Object.freeze({min:MIN_SPEED,max:MAX_SPEED});
export const speedFor=power=>MIN_SPEED+(MAX_SPEED-MIN_SPEED)*Math.min(1,Math.max(0,power))**1.6;

// WPA rack: apex on the foot spot, 8 in the middle, one solid and one stripe in the back corners.
export function rack(rand=Math.random){
 const solids=[1,2,3,4,5,6,7],stripes=[9,10,11,12,13,14,15],take=list=>list.splice(Math.floor(rand()*list.length),1)[0];
 const corners=rand()<.5?[take(solids),take(stripes)]:[take(stripes),take(solids)],rest=[...solids,...stripes];
 for(let i=rest.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
 const balls=[{id:0,x:W/2,y:TABLE.headString+60,in:false}],gapX=R*2+.6,gapY=(R*2+.6)*.8660254;let k=0;
 for(let row=0;row<5;row++)for(let col=0;col<=row;col++){
  let id;if(row===2&&col===1)id=8;else if(row===4&&col===0)id=corners[0];else if(row===4&&col===4)id=corners[1];else id=rest[k++];
  balls.push({id,x:W/2+(col-row/2)*gapX,y:TABLE.footSpot-row*gapY,in:false});
 }
 return balls;
}
export function spotEight(balls){// Put the 8 back on the foot spot, nudged up the long line if that spot is taken.
 const eight=balls.find(b=>b.id===8);let y=TABLE.footSpot;
 while(balls.some(b=>b!==eight&&!b.in&&(b.x-W/2)**2+(b.y-y)**2<(2*R)**2)&&y>R+1)y-=1;
 Object.assign(eight,{x:W/2,y,in:false});return balls;
}
export function inKitchen(y){return y>=TABLE.headString;}
export function placeable(balls,x,y,kitchen=false){
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<R||x>W-R||y<R||y>H-R)return false;
 if(kitchen&&!inKitchen(y))return false;
 return balls.every(b=>b.id===0||b.in||(b.x-x)**2+(b.y-y)**2>=(2*R+.5)**2);
}

// A running shot. step() advances 1/240 s; events feed sounds on the phones.
export class Shot{
 constructor(balls,{vx,vy,follow=0,side=0}){
  this.balls=balls.map(b=>({id:b.id,x:b.x,y:b.y,in:!!b.in,vx:0,vy:0}));this.cue=this.balls.find(b=>b.id===0);
  this.cue.vx=vx;this.cue.vy=vy;this.follow=follow;this.side=side;this.steps=0;this.done=false;this.travel=0;this.speed0=Math.sqrt(vx*vx+vy*vy);
  this.firstHit=null;this.railAfterContact=false;this.railBalls=new Set();this.sunk=[];this.events=[];
 }
 event(type,power,id){this.events.push({step:this.steps,type,power:Math.min(1,power/MAX_SPEED),id});}
 step(){
  if(this.done)return false;const live=this.balls.filter(b=>!b.in);
  for(const b of live){b.x+=b.vx*DT;b.y+=b.vy*DT;}
  for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)this.collide(live[i],live[j]);
  for(const b of live)if(!b.in)this.cushion(b);
  let moving=false;
  for(const b of live){if(b.in)continue;const s=Math.sqrt(b.vx*b.vx+b.vy*b.vy);if(s<=STOP){b.vx=b.vy=0;continue;}if(b===this.cue&&this.firstHit===null)this.travel+=s*DT;const k=Math.max(0,s-(ROLL_A+ROLL_K*s)*DT)/s;b.vx*=k;b.vy*=k;moving=true;}
  this.side*=1-.25*DT;this.steps++;
  if(!moving||this.steps>=MAX_STEPS){for(const b of this.balls){b.vx=b.vy=0;}this.done=true;}
  return !this.done;
 }
 collide(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;if(d2>=4*R*R||d2===0)return;
  // Rewind both balls to the exact moment they touched, so the hit direction is true even at break speed.
  const wx=b.vx-a.vx,wy=b.vy-a.vy,w2=wx*wx+wy*wy,dw=dx*wx+dy*wy;let back=0;
  if(w2>0){const disc=dw*dw-w2*(d2-4*R*R);back=disc>0?Math.min(DT,Math.max(0,(dw+Math.sqrt(disc))/w2)):0;}
  a.x-=a.vx*back;a.y-=a.vy*back;b.x-=b.vx*back;b.y-=b.vy*back;
  let ex=b.x-a.x,ey=b.y-a.y,e2=ex*ex+ey*ey;if(e2===0){ex=dx;ey=dy;e2=d2;}
  const d=Math.sqrt(e2),nx=ex/d,ny=ey/d,push=d<2*R?(2*R-d)/2:0;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
  const rel=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(rel<=0){a.x+=a.vx*back;a.y+=a.vy*back;b.x+=b.vx*back;b.y+=b.vy*back;return;}
  const cue=a.id===0?a:b.id===0?b:null;let before=null;
  if(cue&&this.firstHit===null){this.firstHit=cue===a?b.id:a.id;const s=Math.sqrt(cue.vx*cue.vx+cue.vy*cue.vy);before={s,ux:cue.vx/(s||1),uy:cue.vy/(s||1)};}
  const j=rel*(1+BALL_E)/2;a.vx-=j*nx;a.vy-=j*ny;b.vx+=j*nx;b.vy+=j*ny;
  // Follow (top) carries the cue ball through the shot line; draw (back) pulls it back.
  // A struck cue ball slides, then picks up natural roll as it travels: a plain hit follows through a little,
  // and top or back spin fades toward that natural roll over a long shot.
  if(before){const r=this.travel/(90+.12*this.speed0),fade=1/(1+r+r*r/2),f=NATURAL+(this.follow-NATURAL)*fade;cue.vx+=before.ux*before.s*.62*f;cue.vy+=before.uy*before.s*.62*f;this.follow=0;}
  a.x+=a.vx*back;a.y+=a.vy*back;b.x+=b.vx*back;b.y+=b.vy*back;
  this.event('ball',rel);
 }
 cushion(b){
  // Into a pocket: only possible through a mouth, because rails keep centres R inside elsewhere.
  if(b.x<-2||b.x>W+2||b.y<-2||b.y>H+2||POCKETS.some(([px,py])=>(b.x-px)**2+(b.y-py)**2<(R*1.9)**2)){b.in=true;b.vx=b.vy=0;this.sunk.push(b.id);this.event('pocket',MAX_SPEED*.5,b.id);return;}
  for(const r of RAILS){
   const along=r.nx?b.y:b.x,lo=r.nx?Math.min(r.ay,r.by):Math.min(r.ax,r.bx),hi=r.nx?Math.max(r.ay,r.by):Math.max(r.ax,r.bx);
   if(along<lo||along>hi)continue;const dist=r.nx?(b.x-r.ax)*r.nx:(b.y-r.ay)*r.ny;if(dist>=R)continue;
   b.x+=r.nx*(R-dist);b.y+=r.ny*(R-dist);this.bounce(b,r.nx,r.ny);return;
  }
  for(const [px,py] of JAWS){const dx=b.x-px,dy=b.y-py,d2=dx*dx+dy*dy;if(d2>=R*R||d2===0)continue;const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;b.x=px+nx*R;b.y=py+ny*R;this.bounce(b,nx,ny);return;}
 }
 bounce(b,nx,ny){
  const vn=b.vx*nx+b.vy*ny;if(vn>=0)return;
  let tx=-ny,ty=nx,vt=b.vx*tx+b.vy*ty;
  if(b.id===0&&this.side){// Side spin: the cue ball kicks off the rail toward the spin side.
   const s=Math.sqrt(b.vx*b.vx+b.vy*b.vy)||1,rx=-b.vy/s,ry=b.vx/s;vt+=(rx*tx+ry*ty)*this.side*Math.abs(vn)*.55;this.side*=.45;}
  b.vx=tx*vt*RAIL_GRIP-nx*vn*RAIL_E;b.vy=ty*vt*RAIL_GRIP-ny*vn*RAIL_E;
  if(this.firstHit!==null)this.railAfterContact=true;this.railBalls.add(b.id);this.event('rail',-vn,b.id);
 }
 result(){return {balls:this.balls.map(b=>({id:b.id,x:Math.round(b.x*100)/100,y:Math.round(b.y*100)/100,in:b.in})),sunk:this.sunk,firstHit:this.firstHit,railAfterContact:this.railAfterContact,steps:this.steps,objectRails:[...this.railBalls].filter(id=>id!==0).length};}
}
export function simulate(balls,shot){const s=new Shot(balls,shot);while(s.step());return s.result();}

// Aiming guide: first ball the cue would touch, where the object ball heads, where the cue glances.
export function aimGuide(balls,angle){
 const cue=balls.find(b=>b.id===0&&!b.in);if(!cue)return null;const ux=Math.cos(angle),uy=Math.sin(angle);let best=Infinity,hit=null;
 for(const b of balls){if(b.id===0||b.in)continue;const fx=b.x-cue.x,fy=b.y-cue.y,t=fx*ux+fy*uy;if(t<=0)continue;const perp2=fx*fx+fy*fy-t*t,r2=4*R*R;if(perp2>=r2)continue;const d=t-Math.sqrt(r2-perp2);if(d<best){best=d;hit=b;}}
 let wall=Infinity;for(const [lim,c,u] of [[R,cue.x,ux],[W-R,cue.x,ux],[R,cue.y,uy],[H-R,cue.y,uy]]){if(!u)continue;const t=(lim-c)/u;if(t>0&&t<wall)wall=t;}
 if(!hit||best>wall)return {cue,end:{x:cue.x+ux*wall,y:cue.y+uy*wall},ball:null};
 const gx=cue.x+ux*best,gy=cue.y+uy*best,nx=(hit.x-gx)/(2*R),ny=(hit.y-gy)/(2*R),cut=ux*nx+uy*ny;
 return {cue,end:{x:gx,y:gy},ball:hit,object:{x:nx,y:ny,strength:cut},glance:{x:ux-nx*cut,y:uy-ny*cut,strength:Math.sqrt(1-Math.min(1,cut*cut))}};
}
