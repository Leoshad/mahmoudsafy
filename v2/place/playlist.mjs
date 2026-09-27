import {randomUUID,createHash} from 'node:crypto';
import {check,text} from './domain.mjs';
export function canHear(store,who,id,s=store.state()) {const v=store.db.prepare('SELECT * FROM voices WHERE id=?').get(id);return v&&(v.owner===who||store.db.prepare('SELECT 1 FROM messages WHERE audio=?').get(id)||(s.playlist?.tracks??[]).some(t=>t.audio===id)||s.listening?.audio===id)?v:null;}
export function playlistChange(store,s,who,type,p){
 const list=s.playlist??={revision:0,tracks:[]},now=Date.now();
 if(type==='playlist.add'||type==='listen.invite'){
  const v=canHear(store,who,p.audio,s);check(v?.mime==='audio/mpeg','Choose a shared MP3 song.',404);
  const title=text(p.title||'Our song',400),fingerprint=createHash('sha256').update(v.bytes).digest('hex');
  if(type==='playlist.add'){if(!list.tracks.some(t=>t.fingerprint===fingerprint||t.audio===p.audio))list.tracks.push({id:randomUUID(),audio:p.audio,title,fingerprint,by:who,createdAt:new Date(now).toISOString()});list.revision++;}
  else {check(!s.listening||s.listening.status==='ended'||s.listening.status==='invited'&&s.listening.expiresAt<now,'Finish your current listening invitation or session first.',409);s.listening={id:randomUUID(),audio:p.audio,title,owner:who,status:'invited',expiresAt:now+300000,revision:0,position:0,playing:false,at:now};}
 } else if(type.startsWith('playlist.')){
  check(p.revision===list.revision,'The playlist changed. Please try again.',409);const i=list.tracks.findIndex(t=>t.id===p.id);check(i>=0,'Song no longer in playlist.',404);
  if(type==='playlist.remove')list.tracks.splice(i,1);
  else if(type==='playlist.move'){check(p.direction===-1||p.direction===1,'Choose up or down.');const j=i+p.direction;if(j>=0&&j<list.tracks.length)[list.tracks[i],list.tracks[j]]=[list.tracks[j],list.tracks[i]];}
  else check(false,'Unknown playlist action.');list.revision++;
 }else{
  const a=s.listening;check(a&&a.id===p.id&&a.status!=='ended','This listening session has ended.',409);
  if(type==='listen.accept'){check(a.status==='invited'&&a.owner!==who&&a.expiresAt>now,'This invitation is no longer available.',409);a.status='active';a.playing=true;a.position=0;a.at=now;}
  else if(type==='listen.end'){a.status='ended';a.playing=false;a.at=now;}
  else if(type==='listen.control'){check(a.status==='active'&&p.revision===a.revision,'Playback changed. Try again.',409);check(Number.isFinite(p.position)&&p.position>=0&&p.position<=86400&&typeof p.playing==='boolean','Invalid playback position.');a.position=p.position;a.playing=p.playing;a.at=now;}
  else check(false,'Unknown listening action.');a.revision++;
 }s.version++;return {ok:true};
}
