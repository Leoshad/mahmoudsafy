import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mediaChange} from '../media.mjs';
import {initial} from '../domain.mjs';
const script=readFileSync(new URL('../public/media.js',import.meta.url),'utf8');
const song={videoId:'M7lc1UVf-VE',title:'Sample music',channel:'Sample',duration:240};
function client(who,room,clients,storage=new Map()){
 const windowEvents={};
 const elements=new Map();
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.value='';this.parentNode=null;this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.rect={left:20,top:200,bottom:400,width:320,right:340,height:200};const classes=new Set();this.classList={add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:(n,v)=>{if(v??!classes.has(n))classes.add(n);else classes.delete(n);},contains:n=>classes.has(n)};}
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
 const context={IntersectionObserver:class{constructor(fn){intersection=fn;}observe(){}disconnect(){}},requestAnimationFrame:fn=>setImmediate(fn),addEventListener(t,fn){windowEvents[t]=fn;},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},innerWidth:400,innerHeight:800,document,console,URL,location:{origin:'https://test.example'},performance:{now:()=>now},Date,setTimeout,clearTimeout,setInterval:fn=>{interval=fn;},YT:{Player}};context.window=context;vm.createContext(context);vm.runInContext(script,context);
 const c={pagehide:()=>windowEvents.pagehide(),who,context,get,document,made:()=>made,player:()=>latestPlayer,commands:()=>commands,scroll:away=>{get('#media-player-anchor').rect.top=away?-20:200;document.scroll();},advance:()=>{now+=2000;},tick:()=>interval(),sync(){context.OurMedia.sync({who,media:structuredClone(room.media??null),serverNow:Date.now()});}};clients.push(c);
 context.OurMedia.init({api:async path=>path.startsWith('media/clock')?{now:Date.now()}:path.startsWith('media/resolve')?{track:song}:{items:[song]},command:async(type,data)=>{commands++;mediaChange(room,who,type,data);},sync:async()=>{clients.forEach(c=>c.sync());},goto(next){get('#chat').hidden=next!=='chat';get('#media-home').hidden=next!=='together';context.OurMedia.tab(next);},info(){}});c.sync();return c;
}
const settle=()=>new Promise(r=>setImmediate(r));
test('client consent: preview only locally, invite without remote player, join, shared pause and hidden-tab stop',async()=>{
 const room=initial(),clients=[],a=client('Mahmoud',room,clients),b=client('Safy',room,clients);
 a.context.OurMedia.tab('together');a.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';await a.get('#media-search').onsubmit({preventDefault(){}});await settle();
 assert.equal(a.made(),1);assert.equal(b.made(),0);assert.equal(a.player().getPlayerState(),1);
 a.scroll(true);await settle();assert.equal(a.player().getPlayerState(),1);assert.equal(a.get('#media-player-box').classList.contains('media-floating'),false);assert.equal(a.get('#media-player-box').style.top,'-20px');a.scroll(false);await settle();assert.equal(a.get('#media-player-box').classList.contains('media-floating'),false);
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

test('reload restores local media, position, tab and played history without autoplay; account isolation and close',async()=>{
 const room=initial(),storage=new Map(),a=client('Mahmoud',room,[],storage);
 a.context.OurMedia.tab('together');a.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';
 await a.get('#media-search').onsubmit({preventDefault(){}});await settle();
 a.player().time=91;a.get('#media-chat').onclick();a.pagehide();
 const saved=JSON.parse(storage.get('our-place:media:v1:Mahmoud'));assert.equal(saved.position,91);assert.equal(saved.tab,'chat');
 const b=client('Mahmoud',room,[],storage);await settle();await settle();await settle();
 assert.equal(b.made(),1);assert.equal(b.player().time,91);assert.notEqual(b.player().ps,1);
 assert.equal(b.get('#media-panel').classList.contains('media-in-chat'),true);
 assert.equal(b.get('#media-recent-list').children.length,2);
 const safy=client('Safy',room,[],storage);await settle();assert.equal(safy.made(),0);assert.equal(safy.get('#media-recent-list').children.length,1);
 assert.equal(Object.hasOwn(JSON.parse(storage.get('our-place:media:v1:Mahmoud')),'searches'),false);
 b.get('#media-close').onclick();b.pagehide();
 const c=client('Mahmoud',room,[],storage);await settle();assert.equal(c.made(),0);assert.equal(c.get('#media-panel').hidden,true);
});
test('expired shared membership and malformed saved media never restore a player',async()=>{
 const storage=new Map([['our-place:media:v1:Mahmoud',JSON.stringify({version:1,session:'ended',track:song,tab:'chat',searches:['example']})]]);
 const a=client('Mahmoud',initial(),[],storage);await settle();assert.equal(a.made(),0);
 storage.set('our-place:media:v1:Mahmoud','{broken');
 const b=client('Mahmoud',initial(),[],storage);await settle();assert.equal(b.made(),0);
});

test('played history persists, reopens a closed video, and direct close leaves only the local participant',async()=>{
 const room=initial(),storage=new Map(),clients=[],a=client('Mahmoud',room,clients,storage),b=client('Safy',room,clients);
 a.context.OurMedia.tab('together');a.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';
 await a.get('#media-search').onsubmit({preventDefault(){}});await settle();
 assert.equal(JSON.parse(storage.get('our-place:media:v1:Mahmoud')).plays[0].videoId,song.videoId);
 assert.equal(a.get('#media-recent-list').children.length,2);
 await a.get('#media-close').onclick();assert.equal(a.get('#media-player-area').hidden,true);assert.equal(a.get('#media-panel').hidden,false);
 await a.get('#media-recent-list').children[0].onclick();await settle();assert.equal(a.player().ps,1);
 await a.get('#media-invite').onclick();await settle();
 await b.get('#media-invitation').children.find(x=>x.textContent==='Join').onclick();await settle();
 assert.equal(a.get('#media-close').hidden,false);
 await a.get('#media-close').onclick();assert.deepEqual(room.media.participants,['Safy']);assert.equal(a.get('#media-player-box').hidden,true);assert.equal(b.made(),1);
 a.get('#media-collapse').onclick();assert.equal(a.get('#media-panel').hidden,true);
});

for(const who of ['Mahmoud','Safy'])test('accepted chat invitation mounts shared video for '+who,async()=>{
 const room=initial(),owner=who==='Mahmoud'?'Safy':'Mahmoud';
 mediaChange(room,owner,'media.create',{mode:'video',track:song,position:42});
 const receiver=client(who,room,[]);
 await receiver.context.OurMedia.openNotification();await settle();
 assert.equal(receiver.made(),0,'opening an unaccepted invitation does not join');
 mediaChange(room,who,'media.join',{session:room.media.id,invitation:room.media.invitation.id});
 receiver.sync();
 await receiver.context.OurMedia.openNotification();await settle();
 assert.equal(receiver.made(),1);
 assert.equal(receiver.player().time,42);
 assert.equal(receiver.get('#media-player-area').hidden,false);
 receiver.player().config.events.onAutoplayBlocked();
 assert.equal(receiver.get('#media-resume').hidden,false);
 await receiver.context.OurMedia.openNotification();await settle();
 assert.equal(receiver.made(),1,'reopening preserves existing player');
});

test('hidden old session offers visible in-panel recovery and ending permits fresh invitation',async()=>{
 const room=initial();mediaChange(room,'Safy','media.create',{mode:'video',track:song});
 mediaChange(room,'Mahmoud','media.join',{session:room.media.id,invitation:room.media.invitation.id});
 const old=room.media.id,clients=[],a=client('Mahmoud',room,clients),b=client('Safy',room,clients);
 const access=a.get('#media-session-access');assert.equal(access.hidden,false);
 assert.ok(access.children.find(n=>n.textContent==='Open session'));
 await access.children.find(n=>n.textContent==='End session for both').onclick();
 assert.equal(room.media,null);assert.equal(access.hidden,true);
 b.context.OurMedia.tab('together');b.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';
 await b.get('#media-search').onsubmit({preventDefault(){}});await settle();
 await b.get('#media-invite').onclick();assert.notEqual(room.media.id,old);
 await a.context.OurMedia.openNotification();
 const accept=a.get('#media-session-access').children.find(n=>n.textContent==='Accept');assert.ok(accept);
 await accept.onclick();await settle();assert.equal(a.made(),1);
 assert.deepEqual(room.media.participants,['Safy','Mahmoud']);
});

test('expired partner session cannot trap local player or new invitation; stale notices cannot join replacement',async()=>{
 const room=initial();mediaChange(room,'Safy','media.create',{mode:'video',track:song},Date.now()-700000);const old=structuredClone(room.media);
 const clients=[],a=client('Mahmoud',room,clients);a.context.OurMedia.tab('together');a.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';await a.get('#media-search').onsubmit({preventDefault(){}});await settle();
 assert.equal(a.get('#media-session-state').textContent,'Only on your device');
 await a.get('#media-invite').onclick();assert.equal(room.media.owner,'Mahmoud');assert.notEqual(room.media.id,old.id);assert.match(a.get('#media-session-state').textContent,/Waiting for Safy/);
 const b=client('Safy',room,clients);await b.context.OurMedia.openNotification({session:old.id,invitation:old.invitation.id});assert.equal(b.made(),0);assert.match(b.get('#media-status').textContent,/ended or was replaced/);
 await b.context.OurMedia.openNotification({session:room.media.id,invitation:room.media.invitation.id});await b.get('#media-session-access').children.find(n=>n.textContent==='Accept').onclick();await settle();assert.deepEqual(room.media.participants,['Mahmoud','Safy']);assert.equal(b.made(),1);
});
test('valid incoming invitation requires response; declining permits sending own invitation',async()=>{
 const room=initial();mediaChange(room,'Safy','media.create',{mode:'video',track:song});const old=room.media.id;
 const clients=[],a=client('Mahmoud',room,clients);a.context.OurMedia.tab('together');a.get('#media-query').value='https://youtu.be/M7lc1UVf-VE';await a.get('#media-search').onsubmit({preventDefault(){}});await settle();
 await a.get('#media-invite').onclick();assert.equal(room.media.id,old);assert.match(a.get('#media-status').textContent,/Accept or decline/);
 await a.get('#media-session-access').children.find(n=>n.textContent==='Decline').onclick();await a.get('#media-invite').onclick();assert.equal(room.media.owner,'Mahmoud');assert.notEqual(room.media.id,old);
});

test('picking another song from chat keeps both partners in same session and mounts the new track',async()=>{
 const room=initial();mediaChange(room,'Mahmoud','media.create',{mode:'video',track:{...song,videoId:'abcdefghijk',title:'Previous song'}});mediaChange(room,'Safy','media.join',{session:room.media.id,invitation:room.media.invitation.id});const id=room.media.id;
 const clients=[],a=client('Mahmoud',room,clients),b=client('Safy',room,clients);await a.context.OurMedia.openNotification();await b.context.OurMedia.openNotification();await settle();a.get('#media-chat').onclick();a.get('#media-chat').onclick();assert.equal(a.get('#media-panel').classList.contains('media-choosing'),true);
 a.get('#media-query').value='Next song';await a.get('#media-search').onsubmit({preventDefault(){}});
 const row=a.get('#media-results').children[0];assert.ok(row.children.find(n=>n.textContent==='+ Queue'));await row.children.find(n=>n.textContent==='Play now').onclick();await settle();
 assert.equal(room.media.id,id);assert.deepEqual(room.media.participants,['Mahmoud','Safy']);assert.equal(room.media.track.videoId,song.videoId);assert.equal(room.media.playing,true);assert.equal(a.player().config.videoId,song.videoId);assert.equal(b.player().config.videoId,song.videoId);assert.equal(a.get('#media-panel').classList.contains('media-in-chat'),true);assert.equal(a.get('#media-panel').classList.contains('media-choosing'),false);
});
