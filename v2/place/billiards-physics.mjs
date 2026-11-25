// Deterministic shot simulation; the server owns the resulting ball positions.
export const TABLE={width:500,height:1000,radius:12,pocket:23};
const {width:W,height:H,radius:R,pocket:P}=TABLE;
const pockets=[[0,0],[W,0],[0,H/2],[W,H/2],[0,H],[W,H]];
export function rack(){const balls=[{id:0,x:W/2,y:780,vx:0,vy:0,pocketed:false}];const order=[1,9,2,10,8,3,11,4,12,5,6,13,7,14,15];let k=0;for(let row=0;row<5;row++)for(let col=0;col<=row;col++)balls.push({id:order[k++],x:W/2+(col-row/2)*R*2.02,y:320-row*R*1.75,vx:0,vy:0,pocketed:false});return balls;}
export function simulateShot(initial,{angle,power,spin=0}){
 if(!Number.isFinite(angle)||!Number.isFinite(power)||!Number.isFinite(spin)||power<0.05||power>1||Math.abs(spin)>1)throw Error('Invalid shot');
 const balls=structuredClone(initial),cue=balls.find(b=>b.id===0&&!b.pocketed);if(!cue)throw Error('Cue ball unavailable');
 cue.vx=Math.cos(angle)*power*12;cue.vy=Math.sin(angle)*power*12;let firstHit=null,railAfterHit=false;const sunk=[];let steps=0;let spinApplied=false;const frames=[];
 for(;steps<4000;steps++){
  let moving=false;
  for(const b of balls){if(b.pocketed)continue;b.x+=b.vx;b.y+=b.vy;
   if(pockets.some(([x,y])=>Math.hypot(b.x-x,b.y-y)<P)){b.pocketed=true;b.vx=b.vy=0;sunk.push(b.id);continue;}
   if(b.x<R||b.x>W-R){if(firstHit!==null)railAfterHit=true;b.x=Math.max(R,Math.min(W-R,b.x));b.vx*=-.86}if(b.y<R||b.y>H-R){if(firstHit!==null)railAfterHit=true;b.y=Math.max(R,Math.min(H-R,b.y));b.vy*=-.86}
   b.vx*=.993;b.vy*=.993;if(Math.hypot(b.vx,b.vy)<.025){b.vx=b.vy=0}else moving=true;
  }
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){const a=balls[i],b=balls[j];if(a.pocketed||b.pocketed)continue;let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=2*R||d===0)continue;let nx=dx/d,ny=dy/d,overlap=(2*R-d)/2;a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;const v=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(v<=0)continue;if(firstHit===null&&(a.id===0||b.id===0))firstHit=a.id===0?b.id:a.id;a.vx-=v*nx*.98;a.vy-=v*ny*.98;b.vx+=v*nx*.98;b.vy+=v*ny*.98;if(!spinApplied&&(a.id===0||b.id===0)){const white=a.id===0?a:b;white.vx+=Math.cos(angle)*spin*power*2;white.vy+=Math.sin(angle)*spin*power*2;spinApplied=true;}}
  if(steps%20===0&&frames.length<180)frames.push(balls.map(b=>[b.id,Math.round(b.x*10)/10,Math.round(b.y*10)/10,b.pocketed?1:0]));
  if(!moving)break;
 }
 return {balls,sunk,firstHit,railAfterHit,steps,frames};
}
