import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceService} from '../race.mjs';
import {course,runner,step,botInput,DT} from '../public/race-engine.mjs';
for(const latency of [100,350])test(`input replay agrees exactly under ${latency}ms jittered network delay`,()=>{
 let now=10000;const service=new RaceService({now:()=>now});const id=service.action('Mahmoud',{mode:'solo',action:'create'}).match.id;
 const m=service.get('Mahmoud','solo');m.seed=11;m.course=course(11);m.status='racing';m.seen[0]=now;
 let local=runner(),pending=[],input={dir:1,jump:0},seq=0,flight=null,responses=0;
 for(let frame=1;frame<=1100;frame++){
  now+=DT*1000;service.tick();if(m.status!=='racing')break;
  input=botInput(m.course,local,frame*DT,input);const command={n:frame,...input};pending.push(command);step(m.course,local,command,frame*DT);
  if(flight&&now>=flight.deliver){
   if(!flight.response){flight.response=structuredClone(service.input('Mahmoud',flight.data));flight.deliver=now+latency+(frame%3)*15;}
   else {const snapshot=flight.response.match,ack=snapshot.frames[0];pending=pending.filter(f=>f.n>ack);const replay=structuredClone(snapshot.runners[0]);for(const f of pending)step(m.course,replay,f,f.n*DT);assert.deepEqual(replay,local,`correction at frame ${frame}`);responses++;flight=null;}
  }
  if(!flight&&frame%6===0)flight={deliver:now+latency,data:{mode:'solo',id,seq:++seq,dir:input.dir,jump:input.jump,frames:pending.slice(0,30)}};
 }
 assert.ok(responses>10);assert.ok(m.frames[0]>200);
});
test('frame validation rejects skips, fast forwarding and duplicates without advancing physics',()=>{
 let now=10000;const service=new RaceService({now:()=>now}),id=service.action('Mahmoud',{mode:'solo',action:'create'}).match.id,m=service.get('Mahmoud','solo');m.status='racing';
 const send=(seq,frames)=>service.input('Mahmoud',{mode:'solo',id,seq,dir:1,jump:0,frames});send(1,[{n:2,dir:1,jump:0}]);assert.equal(m.frames[0],0);send(2,[{n:1,dir:1,jump:0}]);const x=m.runners[0].x;send(3,[{n:1,dir:1,jump:0}]);assert.equal(m.runners[0].x,x);send(4,Array.from({length:30},(_,i)=>({n:i+2,dir:1,jump:0})));assert.equal(m.frames[0],18);
});
