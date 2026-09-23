(()=>{'use strict';
let dock,audio,dockUI,current=null,name='',token=0,inChat=true,inlineVisible=false,observer;
const cards=new Set(),durations=new Map();
const clock=value=>Number.isFinite(value)?Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0'):'–:––';
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
function controls(root,compact=false){
 const button=make('button','music-toggle','▶');button.type='button';button.setAttribute('aria-label','Play audio');
 const copy=make('div','music-copy'),label=make('div','music-title'),time=make('span','music-time','MP3 · Tap to play');
 const seek=make('input','music-seek');seek.type='range';seek.min=0;seek.max=1000;seek.value=0;seek.disabled=true;seek.setAttribute('aria-label','Seek in audio');
 copy.append(label,time);root.append(button,copy,seek);root.setAttribute('data-no-tab-swipe','');
 for(const event of ['pointerdown','click','touchstart'])root.addEventListener(event,e=>e.stopPropagation());
 seek.addEventListener('input',()=>{if(Number.isFinite(audio?.duration)&&audio.duration>0){audio.currentTime=Number(seek.value)/1000*audio.duration;paint();}});
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
 token++;current=null;name='';inlineVisible=false;
 if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
 if(dock)dock.hidden=true;
 if(navigator.mediaSession){navigator.mediaSession.metadata=null;for(const action of ['play','pause','seekto','seekbackward','seekforward','stop'])try{navigator.mediaSession.setActionHandler(action,null);}catch{}}
 paint();
}
function ensure(){
 if(audio)return;
 audio=make('audio');audio.controls=false;audio.hidden=true;audio.preload='metadata';document.body.append(audio);
 dock=make('section','music-dock');dock.hidden=true;dock.setAttribute('aria-label','Your audio player');dockUI=controls(dock,true);
 dockUI.button.onclick=()=>toggle(current,name);
 const close=make('button','music-close','×');close.type='button';close.setAttribute('aria-label','Stop and close audio');close.onclick=reset;dock.append(close);
 const app=document.querySelector('#app'),shell=document.querySelector('.shell');app.insertBefore(dock,shell);
 for(const event of ['play','pause','timeupdate','durationchange','loadedmetadata','ended','error','waiting','canplay'])audio.addEventListener(event,()=>{if(current&&Number.isFinite(audio.duration))durations.set(current,audio.duration);paint();});
}
async function play(id,title){
 if(!id)return;ensure();const attempt=++token;
 if(current!==id){audio.pause();audio.src='/api/voices/'+encodeURIComponent(id);current=id;}
 else if(audio.error)audio.load();
 name=title||'Shared music';
 if(navigator.mediaSession){
  if(window.MediaMetadata)navigator.mediaSession.metadata=new window.MediaMetadata({title:name,artist:'Our Place'});
  const handlers={play:()=>audio.play().catch(()=>{}),pause:()=>audio.pause(),stop:reset,seekto:d=>{if(Number.isFinite(d.seekTime)&&Number.isFinite(audio.duration))audio.currentTime=Math.max(0,Math.min(audio.duration,d.seekTime));},seekbackward:d=>audio.currentTime=Math.max(0,audio.currentTime-(d.seekOffset||10)),seekforward:d=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(d.seekOffset||10));}};
  for(const [action,handler]of Object.entries(handlers))try{navigator.mediaSession.setActionHandler(action,handler);}catch{}
 }
 refresh();try{await audio.play();}catch{if(attempt===token)paint();}
}
function toggle(id,title){if(!id)return;if(id===current&&audio&&!audio.paused){audio.pause();paint();}else void play(id,title);}
function mount(bubble,id,text){
 const root=make('div','music-card'),ui=controls(root);ui.id=id;ui.name=text.textContent||'Shared music';ui.label.replaceWith(text);ui.label=text;text.classList.add('music-title');text.title=ui.name;
 bubble.classList.add('music-bubble');bubble.append(root);ui.button.onclick=()=>toggle(id,ui.name);
 cards.add(ui);paintUI(ui,id);
 if(!observer&&window.IntersectionObserver)observer=new window.IntersectionObserver(()=>refresh(),{root:document.querySelector('#timeline'),threshold:[0,.25,.75,1]});
 observer?.observe(root);
}
window.addEventListener('resize',refresh);
window.OurMusic={play,reset,mount,refresh,tab(next){inChat=next==='chat';refresh();}};
})();
