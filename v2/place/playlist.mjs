import {randomUUID,createHash} from 'node:crypto';
import {check,text} from './domain.mjs';
export function canHear(store,who,id,s=store.state()) {const v=store.db.prepare('SELECT * FROM voices WHERE id=?').get(id);return v&&(v.owner===who||store.db.prepare('SELECT 1 FROM messages WHERE audio=?').get(id)||(s.playlist?.tracks??[]).some(t=>t.audio===id)||s.listening?.audio===id||s.listening?.queue?.some(t=>t.audio===id))?v:null;}
export function playlistChange(store,s,who,type,p){
 const list=s.playlist??={revision:0,tracks:[]},now=Date.now();
 if(type==='playlist.add'||type==='listen.invite'){
  const v=canHear(store,who,p.audio,s);check(v?.mime==='audio/mpeg','Choose a shared MP3 song.',404);
  const title=text(p.title||'Our song',400),fingerprint=createHash('sha256').update(v.bytes).digest('hex');
  if(type==='playlist.add'){if(!list.tracks.some(t=>t.fingerprint===fingerprint||t.audio===p.audio))list.tracks.push({id:randomUUID(),audio:p.audio,title,fingerprint,by:who,createdAt:new Date(now).toISOString()});list.revision++;}
  else {check(!s.listening||s.listening.status==='ended'||s.listening.status==='invited'&&s.listening.expiresAt<now,'Finish your current listening invitation or session first.',409);const queue=p.mode==='playlist'?list.tracks.map(({audio,title})=>({audio,title})):null;check(!queue||queue.length,'Add a song first.');s.listening={...(queue?{mode:'playlist',queue,order:queue.map(t=>t.audio),index:0,shuffle:false,repeat:false}:{}),id:randomUUID(),audio:queue?.[0].audio??p.audio,title:queue?.[0].title??title,owner:who,status:'invited',expiresAt:now+300000,revision:0,position:0,playing:false,at:now};}
 } else if(type.startsWith('playlist.')){
  check(p.revision===list.revision,'The playlist changed. Please try again.',409);const i=list.tracks.findIndex(t=>t.id===p.id);check(i>=0,'Song no longer in playlist.',404);
  if(type==='playlist.remove')list.tracks.splice(i,1);
  else if(type==='playlist.move'){check(p.direction===-1||p.direction===1,'Choose up or down.');const j=i+p.direction;if(j>=0&&j<list.tracks.length)[list.tracks[i],list.tracks[j]]=[list.tracks[j],list.tracks[i]];}
  else check(false,'Unknown playlist action.');list.revision++;
 }else{
  const a=s.listening;check(a&&a.id===p.id&&a.status!=='ended','This listening session has ended.',409);
  if(type==='listen.accept'){check(a.status==='invited'&&a.owner!==who&&a.expiresAt>now,'This invitation is no longer available.',409);a.status='active';a.playing=true;a.position=0;a.at=now;}
  else if(type==='listen.end'){a.status='ended';a.playing=false;a.at=now;}
  else if(['listen.step','listen.options','listen.track'].includes(type)){
   check(a.status==='active'&&a.mode==='playlist','Start listening to the playlist together first.',409);
   // Both clients may reach the end at once; only the first advances this track.
   if(type==='listen.step'&&p.auto&&(p.audio!==a.audio||p.revision!==a.revision))return {ok:true};
   check(p.revision===a.revision,'Playback changed. Try again.',409);
   if(type==='listen.options'){
    check(['shuffle','repeat'].includes(p.option)&&typeof p.value==='boolean','Choose a playback option.');a[p.option]=p.value;
    if(p.option==='shuffle'){const rest=a.queue.map(t=>t.audio).filter(id=>id!==a.audio);if(p.value)for(let i=rest.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}a.order=p.value?[a.audio,...rest]:a.queue.map(t=>t.audio);a.index=a.order.indexOf(a.audio);}
   }else{
    let next;if(type==='listen.track'){next=a.order.indexOf(p.audio);check(next>=0,'Choose a song in this listening queue.');}
    else {check(p.direction===1||p.direction===-1,'Choose next or previous.');next=a.index+p.direction;if(next>=a.order.length||next<0){if(a.repeat)next=(next+a.order.length)%a.order.length;else {a.playing=false;a.position=Number.isFinite(p.position)?Math.max(0,p.position):a.position;a.at=now;a.revision++;s.version++;return {ok:true};}}}
    const track=a.queue.find(t=>t.audio===a.order[next]);a.index=next;a.audio=track.audio;a.title=track.title;a.position=0;a.playing=true;a.at=now;
   }
  }
  else if(type==='listen.control'){check(a.status==='active'&&p.revision===a.revision,'Playback changed. Try again.',409);check(Number.isFinite(p.position)&&p.position>=0&&p.position<=86400&&typeof p.playing==='boolean','Invalid playback position.');a.position=p.position;a.playing=p.playing;a.at=now;}
  else check(false,'Unknown listening action.');a.revision++;
 }s.version++;return {ok:true};
}
