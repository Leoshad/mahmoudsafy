import {randomBytes,randomUUID} from 'node:crypto';
import {course,runner,step,botInput,DT} from './public/race-engine.mjs';
import {check} from './domain.mjs';
const humans=['Mahmoud','Safy'];
export class RaceService{
 constructor({now=Date.now,onResult=()=>{}}={}){this.now=now;this.onResult=onResult;this.matches=new Map();}
 key(who,mode){return mode==='together'?'together':'solo:'+who;}
 get(who,mode){return this.matches.get(this.key(who,mode));}
 action(who,d){check(humans.includes(who),'Sign in.',401);check(['solo','together'].includes(d.mode),'Choose a race mode.');const key=this.key(who,d.mode),now=this.now();let m=this.matches.get(key);
 if(d.action==='create'){check(!m||['finished','cancelled'].includes(m.status)||now-m.updated>120000,'A race is already waiting. Join it or leave first.',409);check(typeof(d.wager??'')==='string'&&(d.wager??'').length<=160,'Keep the forfeit under 160 characters.');const players=d.mode==='solo'?[who,'Computer']:humans;m={id:randomUUID(),seed:randomBytes(4).readUInt32LE(),mode:d.mode,owner:who,status:'lobby',wager:d.mode==='together'?(d.wager??'').trim():'',players,ready:[],frames:players.map(()=>0),finished:players.map(()=>null),runners:players.map(()=>runner()),inputs:players.map(()=>({dir:0,jump:0,seq:-1})),seen:players.map(n=>n==='Computer'?now:0),t:0,created:now,updated:now,last:now,acc:0,winner:null};m.course=course(m.seed);this.matches.set(key,m);}
 else {check(m&&m.id===d.id,'This race changed. Open it again.',409);check(m.players.includes(who),'This race belongs to another player.',403);const i=m.players.indexOf(who);m.seen[i]=now;m.updated=now;if(d.action==='ready'){check(m.status==='lobby','The race has already started.',409);if(!m.ready.includes(who))m.ready.push(who);if(m.players.filter(p=>p!=='Computer').every(p=>m.ready.includes(p))){m.status='countdown';m.starts=now+3000;m.last=now;}}
 else if(d.action==='leave'){m.status='cancelled';m.reason=who+' left. No winner or forfeit.';}
 else check(false,'Unknown race action.');}
 return this.view(m,who);
 }
 input(who,d){check(['solo','together'].includes(d.mode),'Choose a race mode.');const m=this.get(who,d.mode);check(m&&m.id===d.id,'This race changed.',409);const i=m.players.indexOf(who);check(i>=0,'Not your race.',403);check(Number.isInteger(d.seq)&&d.seq>=0&&Number.isInteger(d.jump)&&d.jump>=0&&d.jump<=1000000&&[-1,0,1].includes(d.dir),'Invalid control input.');const commands=d.frames??[];check(Array.isArray(commands)&&commands.length<=90,'Invalid input batch.');for(const f of commands)check(Number.isInteger(f.n)&&f.n>0&&[-1,0,1].includes(f.dir)&&Number.isInteger(f.jump)&&f.jump>=0&&f.jump<=1000000,'Invalid frame.');
 const now=this.now();m.seen[i]=now;m.updated=now;
 if(d.seq>m.inputs[i].seq){m.inputs[i]={dir:d.dir,jump:d.jump,seq:d.seq};if(m.status==='racing')for(const f of commands){if(f.n<=m.frames[i])continue;if(f.n!==m.frames[i]+1||f.n>Math.floor(m.t/DT)+18)break;step(m.course,m.runners[i],f,f.n*DT);m.frames[i]=f.n;if(m.runners[i].x>=m.course.finish){m.finished[i]??=f.n;break;}}}
 this.resolve(m);return this.view(m,who);}
 resolve(m){if(m.status!=='racing')return;const finishes=m.finished.filter(n=>n!==null);if(!finishes.length)return;const first=Math.min(...finishes);if(!m.frames.every((n,i)=>n>=first||m.finished[i]!==null))return;const winners=m.players.filter((_,i)=>m.finished[i]===first);m.winner=winners.length>1?'Tie':winners[0];m.status='finished';m.updated=this.now();this.onResult({id:m.id,mode:m.mode,players:m.players,winner:m.winner,wager:m.wager,seconds:Math.round(first*DT*100)/100});}

 view(m,who){if(!m)return{match:null,who};return{who,match:{id:m.id,seed:m.seed,mode:m.mode,status:m.status,wager:m.wager,players:m.players,ready:m.ready,frames:m.frames,finished:m.finished,starts:m.starts,runners:m.runners,inputs:m.inputs,t:m.t,countdown:Math.max(0,Math.ceil(((m.starts??0)-this.now())/1000)),winner:m.winner,reason:m.reason,finish:m.course.finish},serverNow:this.now()};}
 tick(){const now=this.now();for(const [key,m]of this.matches){if(now-m.updated>3600000){this.matches.delete(key);continue;}if(['finished','cancelled','lobby'].includes(m.status))continue;
 const lost=m.players.some((n,i)=>n!=='Computer'&&now-m.seen[i]>2500);
 if(lost){if(m.status!=='paused'){m.status='paused';m.pausedAt=now;m.reason='Connection paused — waiting for both players.';}m.last=now;m.acc=0;if(now-m.pausedAt>60000){m.status='cancelled';m.reason='Connection lost. No winner or forfeit.';}continue;}
 if(m.status==='paused'){m.status='countdown';m.starts=now+2000;m.reason=null;m.last=now;}
 if(m.status==='countdown'){if(now<m.starts){m.last=now;continue;}m.status='racing';m.last=now;}
 m.acc+=Math.min(.1,Math.max(0,(now-m.last)/1000));m.last=now;
 while(m.acc>=DT&&m.status==='racing'){m.acc-=DT;m.t+=DT;for(let i=0;i<m.players.length;i++){if(m.players[i]!=='Computer'||m.finished[i]!==null)continue;const target=Math.min(Math.floor(m.t/DT),Math.max(...m.frames)+6);if(m.frames[i]<target){const frame=m.frames[i]+1;m.inputs[i]={...botInput(m.course,m.runners[i],frame*DT,m.inputs[i]),seq:0};step(m.course,m.runners[i],m.inputs[i],frame*DT);m.frames[i]=frame;if(m.runners[i].x>=m.course.finish)m.finished[i]=frame;}}
 this.resolve(m);
 if(m.t>600){m.status='cancelled';m.reason='Time to try a fresh course. No winner or forfeit.';}}
 }}
}
