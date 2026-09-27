(()=>{'use strict';
let dock,audio,dockUI,current=null,name='',token=0,inChat=true,inlineVisible=false,observer;
const cards=new Set(),durations=new Map();
let context,analyser,edge,frame=0,energy=0,glowOn=true,beatTracker,travel=0,applyVersion=0;
try{glowOn=localStorage.getItem('our-music-glow')!=='off';}catch{}
function unlock(){ensure();try{if(!context){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.15;context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);}void context.resume().catch(()=>{});}catch{}}
function glowFrame(){
 cancelAnimationFrame(frame);frame=0;
 if(!edge){edge=make('div','music-edge-glow');edge.setAttribute('aria-hidden','true');document.body.append(edge);}
 if(!glowOn||!analyser||!audio||audio.paused||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){edge.style.opacity='0';return;}
 const tracker=beatTracker??=new window.OurMusicBeat();const values=new Uint8Array(analyser.frequencyBinCount);let last=0,accent=0,speed=0;
 const tick=now=>{if(audio.paused||!glowOn||document.hidden){edge.style.opacity='0';frame=0;return;}
  if(now-last>=33){const dt=Math.min(100,last?now-last:33);last=now;analyser.getByteFrequencyData(values);const result=tracker.sample(values,now);
   // Onsets add a soft accent. Estimated tempo sets travel speed, never line thickness.
   if(result.beat)accent=.15;else accent*=Math.exp(-dt/500);
   const target=result.bpm?result.bpm/60*.018:0;speed+=(target-speed)*Math.min(1,dt/700);travel+=speed*dt;
   energy+=(Math.min(1,result.power*5)-energy)*Math.min(1,dt/500);
   edge.style.opacity=String(Math.min(.72,energy*2));edge.style.setProperty('--light',String(.38+accent));edge.style.setProperty('--travel',(50-42*Math.cos(travel*Math.PI/100)).toFixed(2)+'%');
  }frame=requestAnimationFrame(tick);
 };frame=requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange',glowFrame);

const clock=value=>Number.isFinite(value)?Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0'):'–:––';
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
function controls(root,compact=false){
 const button=make('button','music-toggle','▶');button.type='button';button.setAttribute('aria-label','Play audio');
 const copy=make('div','music-copy'),label=make('div','music-title'),time=make('span','music-time','MP3 · Tap to play');
 const seek=make('input','music-seek');seek.type='range';seek.min=0;seek.max=1000;seek.value=0;seek.disabled=true;seek.setAttribute('aria-label','Seek in audio');
 copy.append(label,time);root.append(button,copy,seek);root.setAttribute('data-no-tab-swipe','');
 for(const event of ['pointerdown','click','touchstart'])root.addEventListener(event,e=>e.stopPropagation());
 seek.addEventListener('input',()=>{if(Number.isFinite(audio?.duration)&&audio.duration>0){const target=Number(seek.value)/1000*audio.duration;if(window.OurPlaylist?.control('seek',current,name,target))return;audio.currentTime=target;paint();}});
 return {root,button,label,time,seek,compact};
}
function paintUI(ui,id){
 const active=id===current,playing=active&&audio&&!audio.paused&&!audio.ended,duration=active?audio.duration:durations.get(id),position=active?audio.currentTime:0;
 ui.button.textContent=playing?'Ⅱ':'▶';ui.button.setAttribute('aria-label',playing?'Pause audio':'Play audio');ui.button.setAttribute('aria-pressed',String(!!playing));
 ui.seek.disabled=!active||!Number.isFinite(duration)||duration<=0;
 ui.seek.value=Number.isFinite(duration)&&duration>0?Math.round(position/duration*1000):0;
 ui.seek.style.setProperty('--progress',Number(ui.seek.value)/10+'%');
 ui.time.textContent=active&&audio.error?'Could not load · tap to retry':active&&audio.readyState<1?'Loading audio…':Number.isFinite(duration)?clock(position)+' / '+clock(duration):'MP3 · Tap to play';
 ui.seek.setAttribute('aria-valuetext',clock(position)+' of '+clock(duration));
}
function layout(){
 if(!dock)return;
 const shown=!!current&&(!inChat||!inlineVisible);
 dock.hidden=!shown;
}
function paint(){
 for(const ui of cards)paintUI(ui,ui.id);
 if(dockUI){dockUI.label.textContent=name;dockUI.label.title=name;paintUI(dockUI,current);}
 if(navigator.mediaSession&&audio)navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
 layout();
}
function refresh(){
 for(const ui of cards)if(!ui.root.isConnected){observer?.unobserve(ui.root);cards.delete(ui);}
 if(!current){inlineVisible=false;layout();return;}
 const timeline=document.querySelector('#timeline'),bounds=timeline?.getBoundingClientRect();
 const visible=[...cards].some(ui=>{if(ui.id!==current||!ui.root.isConnected||!bounds)return false;const r=ui.root.getBoundingClientRect();const overlap=Math.max(0,Math.min(r.bottom,bounds.bottom)-Math.max(r.top,bounds.top));return r.height>0&&overlap/r.height>=(inlineVisible?.25:.75);});
 inlineVisible=inChat&&visible;paint();
}
function reset(){
 applyVersion++;token++;current=null;name='';inlineVisible=false;
 if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
 if(dock)dock.hidden=true;
 if(navigator.mediaSession){navigator.mediaSession.metadata=null;for(const action of ['play','pause','seekto','seekbackward','seekforward','stop','previoustrack','nexttrack'])try{navigator.mediaSession.setActionHandler(action,null);}catch{}}
 paint();
}
function ensure(){
 if(audio)return;
 audio=make('audio');audio.controls=false;audio.hidden=true;audio.preload='metadata';document.body.append(audio);
 dock=make('section','music-dock');dock.hidden=true;dock.setAttribute('aria-label','Your audio player');dockUI=controls(dock,true);
 dockUI.button.onclick=()=>toggle(current,name);
 const close=make('button','music-close','×');close.type='button';close.setAttribute('aria-label','Stop and close audio');close.onclick=()=>{if(!window.OurPlaylist?.stop())reset();};dock.append(close);
 const app=document.querySelector('#app'),shell=document.querySelector('.shell');app.insertBefore(dock,shell);
 for(const event of ['play','pause','timeupdate','durationchange','loadedmetadata','ended','error','waiting','canplay'])audio.addEventListener(event,()=>{if(['play','pause','ended','error'].includes(event))glowFrame();if(event==='ended')window.OurPlaylist?.ended();if(current&&Number.isFinite(audio.duration))durations.set(current,audio.duration);paint();});
}
async function play(id,title,remote=false){
 if(!remote&&window.OurPlaylist?.control('play',id,title))return;unlock();
 if(!id)return;ensure();const attempt=++token;
 if(current!==id){beatTracker=null;audio.pause();audio.src='/api/voices/'+encodeURIComponent(id);current=id;}
 else if(audio.error)audio.load();
 name=title||'Shared music';
 if(navigator.mediaSession){
  if(window.MediaMetadata)navigator.mediaSession.metadata=new window.MediaMetadata({title:name,artist:'Our Place'});
  const handlers={play:()=>{if(!window.OurPlaylist?.control('play',current,name))audio.play().catch(()=>{});},pause:()=>{if(!window.OurPlaylist?.control('pause',current,name))audio.pause();},stop:()=>{if(!window.OurPlaylist?.stop())reset();},previoustrack:()=>window.OurPlaylist?.step(-1),nexttrack:()=>window.OurPlaylist?.step(1),seekto:d=>{if(window.OurPlaylist?.control('seek',current,name,d.seekTime))return;if(Number.isFinite(d.seekTime)&&Number.isFinite(audio.duration))audio.currentTime=Math.max(0,Math.min(audio.duration,d.seekTime));},seekbackward:d=>{const position=Math.max(0,audio.currentTime-(d.seekOffset||10));if(!window.OurPlaylist?.control('seek',current,name,position))audio.currentTime=position;},seekforward:d=>{if(window.OurPlaylist?.control('seek',current,name,Math.min(audio.duration,audio.currentTime+(d.seekOffset||10))))return;if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(d.seekOffset||10));}};
  for(const [action,handler]of Object.entries(handlers))try{navigator.mediaSession.setActionHandler(action,handler);}catch{}
 }
 refresh();try{await audio.play();}catch{if(attempt===token){paint();if(remote)window.OurPlaylist?.blocked();}}
}
function toggle(id,title){if(!id)return;if(window.OurPlaylist?.control('toggle',id,title))return;if(id===current&&audio&&!audio.paused){audio.pause();paint();}else void play(id,title);}
function mount(bubble,id,text){
 const root=make('div','music-card'),ui=controls(root);ui.id=id;ui.name=text.textContent||'Shared music';ui.label.replaceWith(text);ui.label=text;text.classList.add('music-title');text.title=ui.name;
 bubble.classList.add('music-bubble');bubble.append(root);ui.button.onclick=()=>toggle(id,ui.name);
 cards.add(ui);paintUI(ui,id);
 if(!observer&&window.IntersectionObserver)observer=new window.IntersectionObserver(()=>refresh(),{root:document.querySelector('#timeline'),threshold:[0,.25,.75,1]});
 observer?.observe(root);
}
window.addEventListener('resize',refresh);
window.OurMusic={play,reset,mount,refresh,unlock,pause(){audio?.pause();},state(){return {id:current,position:audio?.currentTime||0,paused:audio?.paused??true};},glowEnabled(){return glowOn;},glow(){glowOn=!glowOn;try{localStorage.setItem('our-music-glow',glowOn?'on':'off');}catch{}glowFrame();return glowOn;},apply(id,title,position,playing){ensure();const version=++applyVersion;const seek=()=>{if(version===applyVersion&&current===id&&Number.isFinite(audio.duration))audio.currentTime=Math.min(position,Math.max(0,audio.duration-.05));};if(playing){void play(id,title,true).then(seek);}else{token++;if(current!==id){audio.src='/api/voices/'+encodeURIComponent(id);current=id;name=title;}audio.pause();seek();}if(audio.readyState<1)audio.addEventListener('loadedmetadata',seek,{once:true});},tab(next){inChat=next==='chat';refresh();}};
})();
