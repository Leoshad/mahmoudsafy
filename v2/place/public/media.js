(()=>{'use strict';
const $=s=>document.querySelector(s);
let host,who=null,shared=null,activeId=null,selected=null,mode='video',player=null,ready=false,allowed=false,apiPromise=null,epoch=0,appTab='chat',clockOffset=0,busy=false,mutedUntil=0,lastSample=null,loadedId=null,searchEpoch=0,queueSignature='',noticeSignature='',seenVersion=-1,savedVolume=70,localStart=0,lastNativeState=-1;
const pane=()=>$('#media-panel'),other=()=>who==='Mahmoud'?'Safy':'Mahmoud';
const current=()=>activeId&&shared?.id===activeId?shared:null;
const node=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;};
function button(label,parent,fn,cls){const b=node('button',label,parent,cls);b.type='button';b.onclick=()=>Promise.resolve(fn()).catch(fail);return b;}
let restored=false,restoring=false,recentPlays=[],recentSignature='',lastSavedAt=0;
const storageKey=()=>who?'our-place:media:v1:'+who:null;
function persist(){
 if(!who||!restored||restoring)return;
 try{localStorage.setItem(storageKey(),JSON.stringify({version:1,tab:['chat','together','space'].includes(appTab)?appTab:'space',track:selected,session:activeId,position:selected?Math.max(0,Math.min(selected.duration,ready?player.getCurrentTime()||0:localStart)):0,volume:ready?player.getVolume?.()??savedVolume:savedVolume,height:chatHeight,query:$('#media-query').value.slice(0,2048),plays:recentPlays,panel:!pane().hidden}));lastSavedAt=Date.now();}catch{}
}
function validSavedTrack(t){return t&&/^[A-Za-z0-9_-]{11}$/.test(t.videoId)&&typeof t.title==='string'&&t.title.length<=300&&typeof t.channel==='string'&&t.channel.length<=150&&Number.isFinite(t.duration)&&t.duration>0&&t.duration<=86400;}
function restore(){
 if(restored||!who)return;restored=true;let saved;
 try{saved=JSON.parse(localStorage.getItem(storageKey())||'null');}catch{return;}
 if(!saved||saved.version!==1)return;
 restoring=true;
 recentPlays=Array.isArray(saved.plays)?saved.plays.filter(validSavedTrack).slice(0,12):validSavedTrack(saved.track)?[saved.track]:[];
 $('#media-query').value=typeof saved.query==='string'?saved.query.slice(0,2048):'';
 savedVolume=Number.isFinite(saved.volume)?Math.max(0,Math.min(100,saved.volume)):70;
 chatHeight=Number.isFinite(saved.height)?Math.max(200,Math.min(500,saved.height)):200;
 const member=saved.session&&shared?.id===saved.session&&shared.participants.includes(who);
 const track=member?shared.track:!saved.session&&validSavedTrack(saved.track)?saved.track:null;
 if(member)activeId=shared.id;
 selected=track;
 localStart=track?Math.max(0,Math.min(track.duration,Number.isFinite(saved.position)?saved.position:0)):0;
 const identity=who;
 requestAnimationFrame(()=>{
  if(who!==identity){restoring=false;return;}
  host.goto(['chat','together','space'].includes(saved.tab)?saved.tab:'chat');
  pane().hidden=!track&&!saved.panel;setMode();
  if(track)mount(track,false).then(()=>{if(who===identity){render();persist();}});
  restoring=false;render();
 });
}
function rememberPlayed(track){
 if(!validSavedTrack(track))return;
 recentPlays=[{videoId:track.videoId,title:track.title,channel:track.channel,duration:track.duration},...recentPlays.filter(t=>t.videoId!==track.videoId)].slice(0,12);
 renderRecent();persist();
}
function renderRecent(){
 const sig=JSON.stringify(recentPlays)+!!current();if(sig===recentSignature)return;recentSignature=sig;
 const root=$('#media-recent-list');root.replaceChildren();
 if(!recentPlays.length){node('p','Songs and videos you open will appear here.',root,'muted');return;}
 for(const track of recentPlays){const b=button((current()?'▶ Play now · ':'▶ ')+track.title+' · '+track.channel,root,()=>choose(track),'media-recent-item');b.title=track.title;b.dir='auto';}
 button('Clear played history',root,()=>{recentPlays=[];renderRecent();persist();},'media-recent-clear');
}

function say(text){$('#media-status').textContent=text;}
function fail(e){say(e.message||'Could not connect. Please try again.');host?.info(e.message||'Could not connect.');}
const time=n=>{n=Math.floor(Math.max(0,n||0));return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
function expected(){const m=current();return m?Math.min(m.track.duration,m.position+(m.playing?(Date.now()+clockOffset-m.updatedAt)/1000:0)):0;}
function visible(){return !document.hidden&&!pane().hidden&&pane().getClientRects().length>0;}
// The live iframe stays under the app root. Only its empty layout anchor moves.
function positionPlayer(){
 if(appTab==='chat'){const max=resizeLimit();chatHeight=Math.min(chatHeight,max);pane().style.setProperty('--media-chat-height',chatHeight+'px');$('#media-resize').setAttribute('aria-valuemax',String(max));$('#media-resize').setAttribute('aria-valuenow',String(chatHeight));}
 const box=$('#media-player-box'),anchor=$('#media-player-anchor');
 box.hidden=!selected||!visible();if(box.hidden)return;
 const r=anchor.getBoundingClientRect(),view=window.visualViewport;
 const left=view?.offsetLeft||0,top=view?.offsetTop||0,w=view?.width||window.innerWidth,h=view?.height||window.innerHeight;
 // Follow the in-card anchor only; scrolling never creates a floating window.
 const shell=$('.shell').getBoundingClientRect();
 const cropTop=Math.max(0,Math.max(top,shell.top)-r.top);
 const cropBottom=Math.max(0,r.bottom-Math.min(top+h,shell.bottom));
 const cropLeft=Math.max(0,Math.max(left,shell.left)-r.left);
 const cropRight=Math.max(0,r.right-Math.min(left+w,shell.right));
 Object.assign(box.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',clipPath:'inset('+cropTop+'px '+cropRight+'px '+cropBottom+'px '+cropLeft+'px)'});

}
function resizeLimit(){const r=$('#chat').getBoundingClientRect();return Math.max(200,Math.floor(Math.min(500,r.height-310))); }
function resizeChat(height){chatHeight=Math.max(200,Math.min(resizeLimit(),height));pane().classList.remove('media-expanded');$('#media-expand').textContent='Enlarge';positionPlayer();}
let chatHeight=200,drag=null;
let layoutPending=false;
function scheduleLayout(){if(layoutPending)return;layoutPending=true;requestAnimationFrame(()=>{layoutPending=false;positionPlayer();});}
function stopLocal(){allowed=false;mutedUntil=performance.now()+1000;player?.pauseVideo?.();positionPlayer();lastSample=null;$('#media-resume').hidden=!selected;}
function destroy(){if(ready&&player?.getVolume)savedVolume=player.getVolume();lastNativeState=-1;epoch++;ready=false;allowed=false;loadedId=null;lastSample=null;player?.destroy?.();player=null;$('#media-player-box').replaceChildren();$('#media-player-box').hidden=true;}
function youtubeAPI(){if(window.YT?.Player)return Promise.resolve();if(apiPromise)return apiPromise;apiPromise=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{apiPromise=null;reject(Error('YouTube did not load. Check your connection and try again.'));},15000);window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve();};const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);apiPromise=null;script.remove();reject(Error('YouTube is unavailable on this connection.'));};document.head.append(script);});return apiPromise;}
async function mount(track,autoplay=true){
 selected=track;$('#media-title').textContent=track.title;$('#media-channel').textContent=track.channel;$('#media-external').href='https://www.youtube.com/watch?v='+track.videoId;$('#media-player-area').hidden=false;pane().hidden=false;
 destroy();positionPlayer();allowed=autoplay;const ticket=epoch;$('#media-resume').hidden=autoplay;say('Loading YouTube…');
 try{await youtubeAPI();if(ticket!==epoch)return;const div=node('div',undefined,$('#media-player-box'));div.id='media-player';loadedId=track.videoId;
 player=new YT.Player(div,{width:'100%',height:'100%',videoId:track.videoId,playerVars:{playsinline:1,origin:location.origin,rel:0,autoplay:0},events:{
 onReady:()=>{if(ticket!==epoch)return;ready=true;player.setVolume?.(savedVolume);positionPlayer();mutedUntil=performance.now()+1200;say('Ready · sound is controlled on your device');if(current()){if(!allowed)player.seekTo(Math.max(0,expected()),true);else applyPlayback(true);}else {if(localStart)player.seekTo(localStart,true);if(allowed&&visible())player.playVideo();}rememberPlayed(track);},
 onStateChange:e=>{if(ticket!==epoch||!ready)return;if(e.data!==player.getPlayerState())return;persist();const previousNative=lastNativeState;lastNativeState=e.data;if(!visible()){if(e.data===1)player.pauseVideo();return;}if(!allowed){if(e.data===1){allowed=true;$('#media-resume').hidden=true;}else return;}if(e.data===3)say('Buffering…');else if(e.data===1)say(current()?.participants.length===2?'Playing together':'Playing on your device');else if(e.data===2)say('Paused');else if(e.data===0)say('Finished · choose the next item');
 if(performance.now()<mutedUntil||busy||!current())return;if(e.data===2&&previousNative===3)return;if([0,1,2].includes(e.data)&&(e.data===1)!==current().playing)publish(e.data===1).catch(fail);},
 onPlaybackRateChange:()=>{if(player?.getPlaybackRate?.()!==1){player?.setPlaybackRate?.(1);say('Shared playback uses normal speed.');}},
 onAutoplayBlocked:()=>{$('#media-resume').hidden=false;say('Tap Resume here to enable sound.');},
 onError:e=>{stopLocal();say(({100:'This video is unavailable or private.',101:'This video cannot be played inside the app.',150:'This video cannot be played inside the app.',153:'YouTube could not verify this player. Reload the page.'})[e.data]||'YouTube could not play this video. Try another one.');}
 }});
 }catch(e){if(ticket===epoch)fail(e);}
}
function applyPlayback(force=false){const m=current();if(!m||!ready||!allowed||!visible()||busy)return;if(loadedId!==m.track.videoId){mount(m.track,true);return;}const target=Math.max(0,expected()),actual=player.getCurrentTime()||0,ps=player.getPlayerState();mutedUntil=performance.now()+900;if(force||Math.abs(actual-target)>3)player.seekTo(target,true);if(m.playing&&ps!==1&&ps!==3)player.playVideo();if(!m.playing&&ps!==2&&ps!==5)player.pauseVideo();lastSample={time:player.getCurrentTime()||target,at:performance.now(),playing:m.playing};}
async function action(type,data={}){const m=current()||shared;if(!m)throw Error('This session has ended.');if(busy)return;busy=true;try{await host.command(type,{session:m.id,revision:m.revision,...data});await host.sync();}catch(e){await host.sync().catch(()=>{});throw e;}finally{busy=false;applyPlayback();render();}}
async function publish(playing){if(!current()||!ready||!allowed||!visible())return;await action('media.control',{playing,position:Math.min(selected.duration,Math.max(0,player.getCurrentTime()||0))});}
async function measureClock(){try{const start=Date.now(),r=await host.api('media/clock');clockOffset=r.now-(start+Date.now())/2;}catch{}}
function render(){
 const m=current(),member=shared?.participants.includes(who),inv=shared?.invitation;const banner=$('#media-invitation');const hasInvite=inv?.to===who&&inv.expires>Date.now()+clockOffset;const canReturn=member&&!m;
 const key=hasInvite?'invite:'+inv.id:canReturn?'return:'+shared.id:'';
 const access=$('#media-session-access');access.hidden=!key;if(access.dataset.key!==key){access.dataset.key=key;access.replaceChildren();if(hasInvite){node('p',shared.owner+' invited you · '+shared.track.title,access);button('Accept',access,join,'primary');button('Decline',access,()=>action('media.decline',{invitation:inv.id}));}else if(canReturn){node('p','Your shared session · '+shared.track.title,access);button('Open session',access,join,'primary');button('End session for both',access,()=>action('media.end'));}}
 banner.hidden=!key;if(key!==noticeSignature){noticeSignature=key;banner.replaceChildren();if(hasInvite){node('span',shared.owner+' invited you to Watch & Listen · '+shared.track.title,banner);button('Join',banner,join,'primary');button('Not now',banner,()=>action('media.decline',{invitation:inv.id}));}else if(canReturn){node('span','Your shared session is waiting.',banner);button('Open session',banner,join,'primary');}}
 if(m){selected=m.track;$('#media-title').textContent=m.track.title;$('#media-channel').textContent=m.track.channel;$('#media-session-state').textContent=m.participants.length===2?'Together · '+m.participants.join(' & '):m.invitation&&m.invitation.expires>Date.now()+clockOffset?'Waiting for '+m.invitation.to:'Just you · invite '+other();}
 else $('#media-session-state').textContent=selected?'Only on your device':'Choose something to enjoy';
 $('#media-invite').textContent=hasInvite?'Respond to invitation':'↗ Invite '+other();$('#media-invite').hidden=!selected||!!m&&(m.participants.length===2||m.owner!==who);$('#media-invite').disabled=busy||!!m?.invitation&&m.invitation.expires>Date.now()+clockOffset;
 $('#media-leave').hidden=!m;$('#media-end').hidden=!m;$('#media-next').hidden=!m?.queue.length;$('#media-sync').hidden=!m;$('#media-close').hidden=!selected;$('#media-close').disabled=busy;$('#media-title').title=selected?.title||'';scheduleLayout();
 const sig=m?m.id+':'+JSON.stringify(m.queue):'';if(queueSignature!==sig){queueSignature=sig;const root=$('#media-queue');root.replaceChildren();if(m){node('h3','Up next · '+m.queue.length,root);if(!m.queue.length)node('p','Find another song or paste a link to add it.',root,'muted');for(const t of m.queue){const row=node('div',undefined,root,'media-queue-row');node('span',t.title+' · '+t.by,row);button('Remove',row,()=>action('media.remove',{queueId:t.queueId}));}}}
 $('#media-queue').hidden=!m;renderRecent();persist();
}
async function invite(){if(busy)return;try{await host.sync();if(current()){await action('media.invite');return;}if(shared?.participants.includes(who)){render();say('Open or end your shared session above first.');return;}if(shared?.invitation?.to===who&&shared.invitation.expires>Date.now()+clockOffset){render();say('Accept or decline the invitation above before sending your own.');$('#media-session-access').scrollIntoView?.({block:'nearest'});return;}if(!selected)return;busy=true;const t=selected;await host.command('media.create',{mode,track:t,position:ready?player.getCurrentTime():0,...(shared?{replaceSession:shared.id,replaceRevision:shared.revision}:{})});await host.sync();if(shared?.owner===who){activeId=shared.id;allowed=true;}say('Invitation sent to '+other()+'.');}catch(e){await host.sync().catch(()=>{});fail(e);}finally{busy=false;applyPlayback(true);render();}}
async function join(){if(!shared)return;const m=shared;await measureClock();if(m.invitation?.to===who)await action('media.join',{invitation:m.invitation.id});if(!shared||shared.id!==m.id||!shared.participants.includes(who))return;activeId=m.id;mode=shared.mode;host.goto('together');pane().hidden=false;$('#media-entry').hidden=false;setMode(mode);await mount(shared.track,true);render();}
function setMode(){mode='video';$('#media-heading').textContent='Watch & Listen';$('#media-search-label').textContent='Search YouTube or paste a link';$('#media-query').placeholder='Song, video, artist, or YouTube link…';$('#media-find').textContent='Find';$('#media-query').maxLength=2048;}
async function choose(t){pane().classList.remove('media-choosing');if(current()){allowed=true;await action('media.play',{track:t});say('Playing your new selection together.');}else{if(shared?.participants.includes(who)){render();$('#media-session-access').scrollIntoView?.({block:'nearest'});say('Use Open session to return, or End session for both to start a new one.');return;}localStart=0;$('#media-results').replaceChildren();await mount(t,true);$('#media-player-area').scrollIntoView?.({block:'nearest'});render();}}
async function find(e){e.preventDefault();const q=$('#media-query').value.trim();if(!q)return;const ticket=++searchEpoch;$('#media-find').disabled=true;const isLink=/^(https?:\/\/|(?:www\.|m\.|music\.)?youtube\.com\/|youtu\.be\/)/i.test(q);say(isLink?'Checking video…':'Searching YouTube…');const root=$('#media-results');root.replaceChildren();try{let items;if(isLink){const r=await host.api('media/resolve?url='+encodeURIComponent(q));items=[r.track];}else{const r=await host.api('media/search?q='+encodeURIComponent(q));items=r.items;}if(ticket!==searchEpoch)return;persist();if(isLink&&!current()){await choose(items[0]);say('Press play, then invite '+other()+'.');return;}say(items.length?'Choose a result'+(current()?' to play now or add to Up next.':'.'):'No playable results. Try another name.');for(const t of items){const row=node('article',undefined,root,'media-result');const img=node('img',undefined,row);img.src='https://i.ytimg.com/vi/'+t.videoId+'/mqdefault.jpg';img.alt='';img.loading='lazy';const text=node('div',undefined,row);node('strong',t.title,text).dir='auto';node('small',t.channel+' · '+time(t.duration),text).dir='auto';button(current()?'Play now':'Play',row,()=>choose(t));if(current())button('+ Queue',row,async()=>{await action('media.enqueue',{track:t});say('Added to your shared queue.');});}}catch(e){if(ticket===searchEpoch)fail(e);}finally{if(ticket===searchEpoch)$('#media-find').disabled=false;}}
function init(options){host=options;
 window.addEventListener('pagehide',persist);

 $('#our-place-trial').append($('#media-player-box'));$('#media-player-box').hidden=true;
 document.addEventListener('scroll',scheduleLayout,true);window.addEventListener('resize',scheduleLayout);
 window.visualViewport?.addEventListener('resize',scheduleLayout);window.visualViewport?.addEventListener('scroll',scheduleLayout);
 if(typeof ResizeObserver!=='undefined'){const layoutObserver=new ResizeObserver(scheduleLayout);layoutObserver.observe($('#media-player-anchor'));layoutObserver.observe($('#our-place-trial'));}
 $('#media-more').onkeydown=e=>{if(e.key==='Escape'){$('#media-more').open=false;}};
 $('#media-title').onclick=()=>{$('#media-title').classList.toggle('media-title-open');scheduleLayout();};
 $('#media-title').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#media-title').onclick();}};
 const grip=$('#media-resize');
 grip.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,y:e.clientY,height:$('#media-player-anchor').getBoundingClientRect().height};grip.setPointerCapture(e.pointerId);pane().classList.add('media-resizing');};
 grip.onpointermove=e=>{if(drag?.id===e.pointerId)resizeChat(drag.height+e.clientY-drag.y);};
 const endDrag=()=>{drag=null;pane().classList.remove('media-resizing');persist();};
 grip.onpointerup=endDrag;grip.onpointercancel=endDrag;grip.onlostpointercapture=endDrag;
 grip.onkeydown=e=>{const change={ArrowUp:-20,ArrowDown:20,Home:-10000,End:10000}[e.key];if(change!==undefined){e.preventDefault();resizeChat(chatHeight+change);}};

$('#media-search').onsubmit=find;document.querySelectorAll('[data-media-mode]').forEach(b=>b.onclick=()=>{host.goto('together');pane().hidden=false;setMode(b.dataset.mediaMode);$('#media-recent').open=false;render();host.revealPanel?.('#media-panel');});
 $('#media-invite').onclick=invite;
 $('#media-play').onclick=()=>{if(!ready)return;allowed=true;$('#media-resume').hidden=true;if(current()){publish(player.getPlayerState()!==1).catch(fail);}else player.getPlayerState()===1?player.pauseVideo():player.playVideo();};
 $('#media-resume').onclick=()=>{allowed=true;$('#media-resume').hidden=true;mutedUntil=performance.now()+1000;if(!ready&&selected)mount(selected,true);else if(current())applyPlayback(true);else player?.playVideo?.();};
 $('#media-sync').onclick=async()=>{await measureClock();allowed=true;$('#media-resume').hidden=true;applyPlayback(true);say('Synchronized to the shared session.');};
 $('#media-next').onclick=()=>action('media.next').catch(fail);
 $('#media-leave').onclick=async()=>{try{await action('media.leave');activeId=null;destroy();selected=null;$('#media-player-area').hidden=true;render();}catch(e){fail(e);}};
 $('#media-end').onclick=async()=>{try{await action('media.end');activeId=null;destroy();selected=null;$('#media-player-area').hidden=true;render();}catch(e){fail(e);}};
 $('#media-close').onclick=async()=>{if(busy)return;try{if(current()){stopLocal();await action('media.leave');}activeId=null;selected=null;localStart=0;destroy();pane().hidden=appTab==='chat';$('#media-player-area').hidden=true;$('#media-more').open=false;render();}catch(e){fail(e);}};
 $('#media-collapse').onclick=()=>{stopLocal();pane().hidden=true;$('#media-recent').open=false;positionPlayer();render();};

 $('#media-chat').onclick=()=>{if(appTab==='chat'){pane().classList.toggle('media-choosing');scheduleLayout();}else host.goto('chat');};
 $('#media-expand').onclick=()=>{if(appTab==='chat'){resizeChat(chatHeight>200?200:resizeLimit());$('#media-expand').textContent=chatHeight>200?'Minimize':'Enlarge';}else{pane().classList.toggle('media-expanded');$('#media-expand').textContent=pane().classList.contains('media-expanded')?'Minimize':'Enlarge';positionPlayer();}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){persist();stopLocal();}});
 setInterval(()=>{if(Date.now()-lastSavedAt>=5000)persist();if(!current()||!ready||!allowed||!visible()||busy)return;const now=performance.now(),actual=player.getCurrentTime()||0,playing=player.getPlayerState()===1;
 if(now<mutedUntil||![1,2].includes(player.getPlayerState())){lastSample=null;return;}
 if(lastSample&&Math.abs(actual-lastSample.time-(lastSample.playing?(now-lastSample.at)/1000:0))>2){lastSample={time:actual,at:now,playing};publish(playing).catch(fail);return;}
 lastSample={time:actual,at:now,playing};},1000);
}
window.OurMedia={async openNotification(target={}){host.goto('together');pane().hidden=false;try{await host.sync();if(target.session&&(target.session!==shared?.id||target.invitation&&target.invitation!==shared?.invitation?.id&&!shared?.participants.includes(who))){render();say('This invitation has ended or was replaced. Any current invitation is shown above.');host.revealPanel?.('#media-panel');return;}if(shared?.participants.includes(who)&&!current())await join();else{if(shared)setMode(shared.mode);render();}}catch(e){fail(e);}host.revealPanel?.('#media-panel');},init,connection(connected){if(!connected&&current())say('Reconnecting · playback continues on your device.');},sync(s){if(who&&who!==s.who)this.reset();if(Number.isFinite(s.version)&&s.version<seenVersion)return;if(Number.isFinite(s.version))seenVersion=s.version;who=s.who;const previous=shared;shared=s.media??null;restore();if(s.serverNow&&clockOffset===0)clockOffset=s.serverNow-Date.now();if(activeId&&(!shared||shared.id!==activeId||!shared.participants.includes(who))){activeId=null;selected=null;destroy();$('#media-player-area').hidden=true;say('Shared session ended.');}if(current()){if(previous?.revision!==shared.revision)applyPlayback();if(loadedId&&loadedId!==shared.track.videoId&&allowed&&visible())mount(shared.track,true);}render();},tab(next){appTab=next;pane().classList.remove('media-choosing');$('#media-more').open=false;const target=next==='chat'&&selected?$('#chat'):next==='together'?$('#media-home'):null;
 if(target&&pane().parentNode!==target){if(next==='chat')target.insertBefore(pane(),$('.conversation-window'));else target.append(pane());}
 pane().classList.toggle('media-in-chat',next==='chat');pane().classList.remove('media-expanded');
 $('#media-expand').textContent='Enlarge';$('#media-chat').textContent=next==='chat'?'Change song':'Chat alongside';
 positionPlayer();scheduleLayout();if(!visible())stopLocal();persist();
},reset(){persist();restored=false;restoring=false;recentPlays=[];recentSignature='';$('#media-recent').open=false;$('#media-recent-list').replaceChildren();chatHeight=200;localStart=0;savedVolume=70;seenVersion=-1;destroy();activeId=null;selected=null;shared=null;who=null;busy=false;searchEpoch++;$('#media-query').value='';$('#media-results').replaceChildren();$('#media-player-area').hidden=true;$('#media-invitation').hidden=true;noticeSignature='';queueSignature='';pane().hidden=true;}};
})();
