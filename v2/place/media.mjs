import {randomUUID} from 'node:crypto';
const need=(ok,message,status=400)=>{if(!ok){const e=new Error(message);e.status=status;throw e;}};
export function videoId(value){
 need(typeof value==='string'&&value.length<2048,'Paste a YouTube video link.');
 if(/^[\w-]{11}$/.test(value))return value;
 let u;try{u=new URL(value);}catch{need(false,'Paste a valid YouTube link.');}
 need(u.protocol==='https:'&&!u.username&&!u.password&&!u.port,'Use a secure YouTube link.');
 const host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean);
 need(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be'].includes(host),'Use a YouTube or YouTube Music link.');
 const id=host.endsWith('youtu.be')?parts[0]:parts[0]==='watch'?u.searchParams.get('v'):['shorts','embed','live'].includes(parts[0])?parts[1]:null;
 need(/^[\w-]{11}$/.test(id??''),'Use a single video or song link, not a playlist.');return id;
}
export function track(raw){need(raw&&/^[\w-]{11}$/.test(raw.videoId??''),'Choose a valid video.');need(typeof raw.title==='string'&&raw.title.length>0&&raw.title.length<=300,'Invalid video title.');need(Number.isFinite(raw.duration)&&raw.duration>0&&raw.duration<=86400,'Choose a recorded video up to 24 hours.');return {videoId:raw.videoId,title:raw.title,channel:String(raw.channel??'').slice(0,150),duration:raw.duration};}
export function position(m,now=Date.now()){return Math.min(m.track.duration,Math.max(0,m.position+(m.playing?(now-m.updatedAt)/1000:0)));}
export function mediaChange(s,who,type,p={},now=Date.now()){
 need(['Mahmoud','Safy'].includes(who),'Not invited.',403);
 if(type==='media.create'){
  need(!s.media,'End the current shared session before inviting to another one.',409);
  need(['video','music'].includes(p.mode),'Choose video or music.');const t=track(p.track);
  s.media={id:randomUUID(),revision:1,owner:who,mode:p.mode,track:t,queue:[],participants:[who],invitation:{id:randomUUID(),to:who==='Mahmoud'?'Safy':'Mahmoud',expires:now+600000},position:Math.min(t.duration,Math.max(0,Number(p.position)||0)),playing:false,updatedAt:now};
 }else{
  const m=s.media;need(m&&m.id===p.session,'This listening session has ended. Open the current session.',409);
  if(type==='media.join'||type==='media.decline'){
   need(m.invitation?.to===who&&m.invitation.id===p.invitation&&m.invitation.expires>now,'This invitation has expired or changed.',409);
   if(type==='media.join')m.participants=[...new Set([...m.participants,who])];m.invitation=null;m.revision++;
  }else{
   need(m.participants.includes(who),'Join the session before controlling playback.',403);
   need(p.revision===m.revision,'Playback changed. Please try again.',409);
   if(type==='media.invite'){need(m.owner===who&&m.participants.length===1,'Your partner is already in the session.',409);m.invitation={id:randomUUID(),to:who==='Mahmoud'?'Safy':'Mahmoud',expires:now+600000};}
   else if(type==='media.control'){need(typeof p.playing==='boolean'&&Number.isFinite(p.position)&&p.position>=0&&p.position<=m.track.duration+1,'Invalid playback position.');m.position=Math.min(m.track.duration,p.position);m.playing=p.playing;m.updatedAt=now;}
   else if(type==='media.enqueue'){need(m.queue.length<20,'The queue has 20 videos. Remove one first.');m.queue.push({...track(p.track),queueId:randomUUID(),by:who});}
   else if(type==='media.remove'){need(m.queue.some(t=>t.queueId===p.queueId),'This queue item changed.',409);m.queue=m.queue.filter(t=>t.queueId!==p.queueId);}
   else if(type==='media.next'){need(m.queue.length,'The queue is empty.');m.track=track(m.queue.shift());m.position=0;m.playing=true;m.updatedAt=now;}
   else if(type==='media.leave'){m.participants=m.participants.filter(n=>n!==who);m.invitation=null;if(!m.participants.length)s.media=null;else if(m.owner===who)m.owner=m.participants[0];}
   else if(type==='media.end')s.media=null;
   else need(false,'Unknown media action.');
   m.revision++;
  }
 }
 s.version++;return s.media;
}
function seconds(iso){const m=/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso??'');return m?Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0):0;}
export function youtubeService({key=()=>process.env.YOUTUBE_API_KEY,fetcher=fetch,reserve=()=>{}}={}){
 const cache=new Map();
 async function request(path,params){
  need(key(),'Song search is not ready yet. Please try again later.',503);
  const u=new URL('https://www.googleapis.com/youtube/v3/'+path);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);
  let r;try{r=await fetcher(u,{headers:{'X-Goog-Api-Key':key()},signal:AbortSignal.timeout(10000)});}catch{need(false,'YouTube is taking too long. Try again.',502);}
  if(!r.ok){need(false,r.status===403||r.status===429?'YouTube search is temporarily unavailable or its daily allowance is reached. Try later.':'Could not load this video from YouTube.',502);}
  return r.json();
 }
 async function cached(k,fn){const old=cache.get(k);if(old&&old.until>Date.now())return old.data;const data=await fn();if(cache.size>=60)cache.delete(cache.keys().next().value);cache.set(k,{data,until:Date.now()+600000});return data;}
 async function details(ids){if(!ids.length)return [];const data=await request('videos',{part:'snippet,contentDetails,status',id:ids.join(',')});return (data.items??[]).filter(v=>v.status?.embeddable&&v.status?.privacyStatus==='public'&&v.snippet?.liveBroadcastContent==='none'&&seconds(v.contentDetails?.duration)>0&&seconds(v.contentDetails?.duration)<=86400).map(v=>track({videoId:v.id,title:v.snippet.title.slice(0,300),channel:v.snippet.channelTitle,duration:seconds(v.contentDetails.duration)}));}
 return {
  async resolve(value){const id=videoId(value);return cached('v:'+id,async()=>{const list=await details([id]);need(list.length,'This video is private, live, unavailable, or cannot play here.',404);return list[0];});},
  async search(query){need(typeof query==='string'&&query.trim().length>=2&&query.length<=100,'Enter an artist or song name (2–100 characters).');const q=query.trim();return cached('q:'+q.toLowerCase(),async()=>{reserve();const data=await request('search',{part:'snippet',q,type:'video',videoCategoryId:'10',videoEmbeddable:'true',videoSyndicated:'true',maxResults:'8'});return details((data.items??[]).map(v=>v.id?.videoId).filter(Boolean));});}
 };
}
