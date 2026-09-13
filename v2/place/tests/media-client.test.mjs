import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mediaChange} from '../media.mjs';
import {initial} from '../domain.mjs';
const script=readFileSync(new URL('../public/media.js',import.meta.url),'utf8');
const song={videoId:'M7lc1UVf-VE',title:'Sample music',channel:'Sample',duration:240};
function client(who,room,clients){
 const elements=new Map();
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.value='';this.parentNode=null;this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.rect={left:20,top:200,bottom:400,width:320,height:200};const classes=new Set();this.classList={add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:(n,v)=>{if(v??!classes.has(n))classes.add(n);else classes.delete(n);},contains:n=>classes.has(n)};}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  insertBefore(n){this.append(n);}
  setAttribute(k,v){this[k]=v;}setPointerCapture(){}getBoundingClientRect(){return this.rect;}
  focus(){}remove(){}getClientRects(){return this.hidden||this.parentNode?.hidden?[]:[{}];}
 }
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const document={hidden:false,head:new Element(),querySelector:get,querySelectorAll:()=>[],createElement:t=>new Element(t),addEventListener(type,fn){this[type]=fn;}};
 get('#chat').rect.height=700;get('#media-home').append(get('#media-panel'));get('#media-panel').hidden=true;
 let now=10000,made=0,latestPlayer,interval,commands=0,intersection;
 class Player{
  constructor(div,config){made++;this.config=config;this.time=0;this.ps=5;latestPlayer=this;setImmediate(()=>config.events.onReady());}
  getCurrentTime(){return this.time;}getPlayerState(){return this.ps;}getVolume(){return 70;}setVolume(){}getPlaybackRate(){return 1;}setPlaybackRate(){}getIframe(){return {};}
  playVideo(){this.ps=1;this.config.events.onStateChange({data:1});}pauseVideo(){this.ps=2;this.config.events.onStateChange({data:2});}seekTo(t){this.time=t;}destroy(){this.ps=2;}
 }
 const context={IntersectionObserver:class{constructor(fn){intersection=fn;}observe(){}disconnect(){}},requestAnimationFrame:fn=>setImmediate(fn),addEventListener(){},innerWidth:400,innerHeight:800,document,console,URL,location:{origin:'https://test.example'},performance:{now:()=>now},Date,setTimeout,clearTimeout,setInterval:fn=>{interval=fn;},YT:{Player}};context.window=context;vm.createContext(context);vm.runInContext(script,context);
 const c={who,context,get,document,made:()=>made,player:()=>latestPlayer,commands:()=>commands,scroll:away=>{get('#media-player-anchor').rect.top=away?-20:200;document.scroll();},advance:()=>{now+=2000;},tick:()=>interval(),sync(){context.OurMedia.sync({who,media:structuredClone(room.media??null),serverNow:Date.now()});}};clients.push(c);
 context.OurMedia.init({api:async path=>path.startsWith('media/clock')?{now:Date.now()}:path.startsWith('media/resolve')?{track:song}:{items:[song]},command:async(type,data)=>{commands++;mediaChange(room,who,type,data);},sync:async()=>{clients.forEach(c=>c.sync());},goto(next){get('#chat').hidden=next!=='chat';get('#media-home').hidden=next!=='together';context.OurMedia.tab(next);},info(){}});c.sync();return c;
}
const settle=()=>new Promise(r=>setImmediate(r));
test('client consent: preview only locally, invite without remote player, join, shared pause and hidden-tab stop',async()=>{
 const room=initial(),clients=[],a=client('Mahmoud',room,clients),b=client('Safy',room,clients);
 a.context.OurMedia.tab('together');a.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';await a.get('#media-search').onsubmit({preventDefault(){}});await settle();
 assert.equal(a.made(),1);assert.equal(b.made(),0);assert.equal(a.player().getPlayerState(),1);
 a.scroll(true);await settle();assert.equal(a.player().getPlayerState(),1);assert.equal(a.get('#media-player-box').classList.contains('media-floating'),true);a.scroll(false);await settle();assert.equal(a.get('#media-player-box').classList.contains('media-floating'),false);
 await a.get('#media-invite').onclick();await settle();assert.equal(b.made(),0);assert.deepEqual(room.media.participants,['Mahmoud']);
 const join=b.get('#media-invitation').children.find(x=>x.textContent==='Join');assert.ok(join);await join.onclick();await settle();assert.equal(b.made(),1);assert.deepEqual(room.media.participants,['Mahmoud','Safy']);
 a.advance();b.advance();await a.get('#media-play').onclick();await settle();await settle();assert.equal(room.media.playing,true);assert.equal(b.player().getPlayerState(),1);
 a.advance();b.advance();const count=b.commands();b.player().config.events.onStateChange({data:1});await settle();assert.equal(b.commands(),count);b.context.OurMedia.connection(false);assert.equal(b.player().getPlayerState(),1);b.player().ps=3;b.player().config.events.onStateChange({data:3});b.tick();b.player().ps=2;b.player().config.events.onStateChange({data:2});await settle();assert.equal(b.commands(),count);b.player().ps=1;b.player().config.events.onStateChange({data:1});
 a.advance();b.advance();b.player().pauseVideo();await settle();await settle();assert.equal(room.media.playing,false);assert.equal(a.player().getPlayerState(),2);
 a.advance();b.advance();await a.get('#media-play').onclick();await settle();await settle();const before=b.commands();b.document.hidden=true;b.document.visibilitychange();assert.equal(b.player().getPlayerState(),2);assert.equal(b.commands(),before);assert.equal(room.media.playing,true);
 b.document.hidden=false;b.document.visibilitychange();assert.equal(b.player().getPlayerState(),2);assert.equal(b.get('#media-resume').hidden,false);
 await b.get('#media-leave').onclick();assert.deepEqual(room.media.participants,['Mahmoud']);
 await a.get('#media-end').onclick();assert.equal(room.media,null);
});

test('unified field searches a name without autoplay, then plays the selected result',async()=>{
 const room=initial(),clients=[],a=client('Mahmoud',room,clients);
 a.context.OurMedia.tab('together');a.get('#media-panel').hidden=false;a.get('#media-query').value='Example artist';
 await a.get('#media-search').onsubmit({preventDefault(){}});assert.equal(a.made(),0);assert.equal(a.get('#media-results').children.length,1);
 const play=a.get('#media-results').children[0].children.find(x=>x.textContent==='Play');assert.ok(play);await play.onclick();await settle();assert.equal(a.made(),1);assert.equal(a.player().getPlayerState(),1);
});

test('navigation and drag resizing preserve player, position and playing or paused state',async()=>{
 const room=initial(),clients=[],a=client('Mahmoud',room,clients);
 a.context.OurMedia.tab('together');a.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';
 await a.get('#media-search').onsubmit({preventDefault(){}});await settle();
 const player=a.player(),parent=a.get('#media-player-box').parentNode;player.time=83;
 for(let i=0;i<3;i++){a.get('#media-chat').onclick();await settle();a.get('#media-chat').onclick();await settle();}
 assert.equal(a.made(),1);assert.equal(a.player(),player);assert.equal(player.time,83);assert.equal(player.ps,1);
 assert.equal(a.get('#media-player-box').parentNode,parent);assert.equal(a.commands(),0);
 a.get('#media-chat').onclick();await settle();
 const grip=a.get('#media-resize');
 grip.onpointerdown({button:0,pointerId:1,clientY:300,preventDefault(){}});
 grip.onpointermove({pointerId:1,clientY:420});assert.equal(a.get('#media-panel').style['--media-chat-height'],'320px');
 grip.onpointermove({pointerId:1,clientY:50});assert.equal(a.get('#media-panel').style['--media-chat-height'],'200px');
 grip.onpointermove({pointerId:1,clientY:3000});assert.equal(a.get('#media-panel').style['--media-chat-height'],'390px');
 grip.onpointerup();assert.equal(player.ps,1);assert.equal(a.made(),1);
 grip.onkeydown({key:'Home',preventDefault(){}});assert.equal(a.get('#media-panel').style['--media-chat-height'],'200px');
 player.pauseVideo();a.get('#media-chat').onclick();await settle();assert.equal(player.ps,2);assert.equal(a.made(),1);
 a.get('#media-close').onclick();assert.equal(a.get('#media-player-box').hidden,true);
});
