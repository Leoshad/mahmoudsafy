(()=>{'use strict';
let headerControls,dock,audio,dockUI,current=null,name='',token=0,inChat=true,inlineVisible=false,observer;
const cards=new Set(),durations=new Map();
let context,analyser,edge,frame=0,energy=0,glowOn=true,beatTracker,travel=0,applyVersion=0;
try{glowOn=localStorage.getItem('our-music-glow')!=='off';}catch{}
function unlock(){ensure();try{if(!context){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=4096;analyser.minDecibels=-85;analyser.maxDecibels=-10;analyser.smoothingTimeConstant=0;context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);}void context.resume().catch(()=>{});}catch{}}
function pulseLayout(){
 if(!edge)return;
 const v=window.visualViewport,bottom=v?Math.max(0,innerHeight-v.height-v.offsetTop):0;
 edge.style.bottom=bottom+'px';
 const composer=document.querySelector('#compose');
 const box=composer?.getBoundingClientRect(),shown=box&&box.height>0&&box.width>0;
 // Match the supplied phone reference: 22px peaks per 390px viewport.
 // Only the overlay adapts; never reserve space in the original chat layout.
 const referenceHeight=Math.min(28,(v?v.width:window.innerWidth)*22/390);
 const available=shown?Math.max(0,(v?v.height+v.offsetTop:window.innerHeight)-box.bottom-4):referenceHeight;
 edge.style.height=Math.min(referenceHeight,available)+'px';
}
function glowFrame(){
 cancelAnimationFrame(frame);frame=0;
 if(!edge){edge=make('div','music-pulse');edge.setAttribute('aria-hidden','true');for(let i=0;i<48;i++)edge.append(make('i'));document.body.append(edge);}
 const visible=!!(glowOn&&analyser&&audio&&!audio.paused&&!document.hidden);
 edge.style.opacity=visible?'1':'0';pulseLayout();
 if(!visible)return;
 const values=new Uint8Array(analyser.frequencyBinCount),levels=new Float32Array(48);
 // Disjoint bands: preserve bass detail instead of repeating the same four bins.
 const hz=context.sampleRate/analyser.fftSize,upper=Math.min(12000,context.sampleRate/2),bands=[Math.max(1,Math.round(25/hz))];
 for(let i=1;i<=48;i++)bands.push(Math.min(values.length,Math.max(bands[i-1]+1,Math.round(25*Math.pow(upper/25,i/48)/hz))));
 let last=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const tick=now=>{if(audio.paused||!glowOn||document.hidden){glowFrame();return;}
  if(now-last>=16){const dt=last?Math.min(100,now-last):16;last=now;pulseLayout();analyser.getByteFrequencyData(values);
   for(let i=0;i<48;i++){let power=0;for(let bin=bands[i];bin<bands[i+1];bin++)power+=Math.pow(values[bin]/255,2);
    power=Math.sqrt(power/Math.max(1,bands[i+1]-bands[i]));
    // Leave headroom; use time-based envelopes so a kick rises and releases naturally.
    const target=.94*Math.pow(power,1.35),blend=1-Math.exp(-dt/(target>levels[i]?22:110));levels[i]+=(target-levels[i])*blend;
    const cap=Number.parseFloat(edge.style.height)||0;edge.children[i].style.height=(cap*(.0625+levels[i]*(reduced?.25:.9375))).toFixed(1)+'px';
   }
  }frame=requestAnimationFrame(tick);
 };frame=requestAnimationFrame(tick);
}
window.visualViewport?.addEventListener('resize',pulseLayout);
window.visualViewport?.addEventListener('scroll',pulseLayout);
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
 const shown=!!current;
 if(headerControls)headerControls.hidden=!shown;
 document.documentElement.classList.toggle('music-loaded',shown);
 dock.hidden=!shown;
}
function paint(){
 for(const ui of cards)paintUI(ui,ui.id);
 if(dockUI){dockUI.label.textContent=name;dockUI.label.title=name;dockUI.time.title=name;paintUI(dockUI,current);}
 if(navigator.mediaSession&&audio)navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
 window.OurPlaylist?.playback();
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
 const close=make('button','music-close','×');close.type='button';close.setAttribute('aria-label','Stop and close audio');close.onclick=()=>{window.OurPlaylist?.stop();reset();};headerControls=make('div','music-header-controls');headerControls.hidden=true;headerControls.setAttribute('aria-label','Music controls');headerControls.append(dockUI.button,close);const brand=document.querySelector('.brand');(brand||dock).append(headerControls);
 dockUI.time.tabIndex=0;dockUI.time.setAttribute('role','button');dockUI.time.setAttribute('aria-label','Show current song');const showTitle=()=>{dockUI.label.hidden=!dockUI.label.hidden;};dockUI.time.onclick=showTitle;dockUI.time.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showTitle();}};dockUI.label.hidden=true;
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
window.OurMusic={play,toggle,reset,mount,refresh,unlock,pause(){audio?.pause();},state(){return {id:current,position:audio?.currentTime||0,paused:audio?.paused??true};},glowEnabled(){return glowOn;},glow(){glowOn=!glowOn;try{localStorage.setItem('our-music-glow',glowOn?'on':'off');}catch{}glowFrame();return glowOn;},apply(id,title,position,playing){ensure();const version=++applyVersion;const seek=()=>{if(version===applyVersion&&current===id&&Number.isFinite(audio.duration))audio.currentTime=Math.min(position,Math.max(0,audio.duration-.05));};if(playing){void play(id,title,true).then(seek);}else{token++;if(current!==id){audio.src='/api/voices/'+encodeURIComponent(id);current=id;name=title;}audio.pause();seek();}if(audio.readyState<1)audio.addEventListener('loadedmetadata',seek,{once:true});},tab(next){inChat=next==='chat';refresh();}};
})();
