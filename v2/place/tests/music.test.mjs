import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {isMP3} from '../audio-format.mjs';
test('MP3 validation handles ID3 and rejects truncated tags and reserved frames',()=>{const frame=Buffer.concat([Buffer.from([255,251,144,0]),Buffer.alloc(100)]);assert.equal(isMP3(frame),true);assert.equal(isMP3(Buffer.concat([Buffer.from([73,68,51,4,0,0,0,0,0,0]),frame])),true);assert.equal(isMP3(Buffer.from('ID3 this is not an MP3')),false);assert.equal(isMP3(Buffer.from([255,251,252,0])),false);});
function player(){
 const nodes=[],actions={};
 class Node{
  constructor(tag){this.tagName=tag;this.hidden=false;this.children=[];this.parent=null;this.paused=true;this.ended=false;this.error=null;this.readyState=0;this.listeners={};this.attrs={};this.currentTime=0;this.duration=NaN;this.rect={top:50,bottom:130,height:80};this.props={};this.style={setProperty:(k,v)=>this.props[k]=v};this.classList={add:(c)=>this.className=(this.className||'')+' '+c};this.loads=0;}
  get isConnected(){return this===document.body||!!this.parent?.isConnected;}
  append(...children){for(const n of children){if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=this;this.children.push(n);}}
  insertBefore(n,next){this.append(n);this.children=this.children.filter(x=>x!==n);this.children.splice(this.children.indexOf(next),0,n);}
  replaceWith(n){const p=this.parent;if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);p.children[p.children.indexOf(this)]=n;n.parent=p;this.parent=null;}
  setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this[k];}
  getBoundingClientRect(){return this.rect;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  emit(k){for(const fn of this.listeners[k]||[])fn({stopPropagation(){}});}
  play(){this.paused=false;this.emit('play');return Promise.resolve();}
  pause(){this.paused=true;this.emit('pause');}load(){this.loads++;this.readyState=0;}
 }
 const document={body:new Node('body'),createElement:tag=>{const n=new Node(tag);nodes.push(n);return n;}},app=new Node('div'),shell=new Node('div'),timeline=new Node('div');timeline.rect={top:0,bottom:500,height:500};document.body.append(app);app.append(shell);shell.append(timeline);document.querySelector=s=>({'#app':app,'.shell':shell,'#timeline':timeline}[s]||null);
 const window={addEventListener(){},IntersectionObserver:class{observe(){}unobserve(){}}},navigator={mediaSession:{setActionHandler:(k,v)=>actions[k]=v}};
 vm.runInNewContext(readFileSync(new URL('../public/music.js',import.meta.url),'utf8'),{window,document,navigator,encodeURIComponent});
 const card=(id,title)=>{const bubble=new Node('div'),p=new Node('p');p.textContent=title;timeline.append(bubble);bubble.append(p);window.OurMusic.mount(bubble,id,p);return bubble.children.find(x=>x.className==='music-card');};
 const audio=()=>nodes.find(x=>x.tagName==='audio'),dock=()=>nodes.find(x=>x.className==='music-dock');
 return {window,document,nodes,actions,card,audio,dock,timeline,app};
}
test('inline and compact controls use the same persistent audio and keep position across tabs',async()=>{
 const h=player(),card=h.card('first','First.mp3');await h.window.OurMusic.play('first','First.mp3');const audio=h.audio();
 assert.equal(h.dock().hidden,true);assert.equal(audio.controls,false);assert.equal(audio.hidden,true);
 audio.duration=122;audio.readyState=1;audio.currentTime=73;audio.emit('loadedmetadata');
 assert.equal(card.children[1].children[1].textContent,'1:13 / 2:02');
 h.window.OurMusic.tab('together');assert.equal(h.dock().hidden,false);assert.equal(audio.currentTime,73);assert.equal(audio.paused,false);
 h.dock().children[0].onclick();assert.equal(audio.paused,true);card.children[0].onclick();assert.equal(audio.paused,false);assert.equal(audio.currentTime,73);
 h.window.OurMusic.tab('chat');assert.equal(h.dock().hidden,true);assert.equal(h.nodes.filter(n=>n.tagName==='audio').length,1);
 h.actions.seekto({seekTime:30});assert.equal(audio.currentTime,30);
});
test('scrolling away shows compact player; replacing message DOM never restarts audio',async()=>{
 const h=player(),card=h.card('first','First.mp3');await h.window.OurMusic.play('first','First.mp3');const audio=h.audio();audio.currentTime=44;
 card.rect={top:-150,bottom:-70,height:80};h.window.OurMusic.refresh();assert.equal(h.dock().hidden,false);
 card.parent.parent=null;const replacement=h.card('first','First.mp3');h.window.OurMusic.refresh();assert.equal(h.dock().hidden,true);assert.equal(audio.currentTime,44);assert.equal(audio.loads,0);assert.equal(replacement.children[0].textContent,'Ⅱ');
});
test('seek, switching tracks, error retry and close update both controls without duplicate audio',async()=>{
 const h=player(),first=h.card('first','First.mp3'),second=h.card('second','Second.mp3');await h.window.OurMusic.play('first','First.mp3');const audio=h.audio();audio.duration=100;audio.readyState=1;audio.emit('loadedmetadata');
 first.children[2].value=500;first.children[2].emit('input');assert.equal(audio.currentTime,50);
 await h.window.OurMusic.play('second','Second.mp3');assert.equal(audio.src,'/api/voices/second');assert.equal(first.children[0].textContent,'▶');assert.equal(second.children[0].textContent,'Ⅱ');
 audio.error={};audio.pause();audio.emit('error');assert.match(second.children[1].children[1].textContent,/retry/);second.children[0].onclick();assert.equal(audio.loads,1);
 h.window.OurMusic.reset();assert.equal(audio.paused,true);assert.equal(audio.src,undefined);assert.equal(h.dock().hidden,true);assert.equal(h.actions.play,null);assert.equal(second.children[0].textContent,'▶');assert.equal(h.nodes.filter(n=>n.tagName==='audio').length,1);
});
