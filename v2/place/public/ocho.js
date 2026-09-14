(()=>{'use strict';
const $=s=>document.querySelector(s),colors=['red','blue','green','yellow'];
const labels={skip:'Skip',reverse:'Reverse',draw2:'+2',draw4:'+4',wild:'Wild',shield:'Shield',xray:'X-Ray',deadred:'Dead Red',booblue:'Boo Blue'};
const symbols={skip:'⊘',reverse:'⟳',draw2:'+2',draw4:'+4',wild:'8',shield:'',xray:'',deadred:'',booblue:''};
let pileView=null,pileGame=null,pileOrder=-1;const drawSeen=new Map();let flying=[];
const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
function art(kind,root){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 120');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','ocho-art');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/ocho-art.svg#'+kind);svg.append(use);root.append(svg);return svg;}
let host,who=null,games={},mode='solo',opened=false,full=false,busy=false,selected=null,signature='',clockOffset=0,lastVersion=-1,audio=null,sound=true,pauseAfterAction=false,chatAfterAction=false;
const game=()=>games[mode];
const make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
function button(text,root,fn,cls){const b=make('button',text,root,cls);b.type='button';b.onclick=()=>{unlock();return Promise.resolve(fn()).catch(error);};return b;}
function error(e){$('#ocho-error').textContent=e.message||'Could not connect. Your saved game is kept.';}
function save(){if(!who)return;try{localStorage.setItem('our-place:ocho:'+who,JSON.stringify({mode,opened,full,sound}));}catch{}}
function unlock(){try{if(!sound)return;const A=window.AudioContext||window.webkitAudioContext;if(!A)return;audio??=new A();return audio.resume().catch(()=>{});}catch{}}
function tone(){if(!sound||!opened||document.hidden||audio?.state!=='running')return;try{const o=audio.createOscillator(),v=audio.createGain(),t=audio.currentTime;o.type='sine';o.frequency.setValueAtTime(480,t);o.frequency.exponentialRampToValueAtTime(210,t+.08);v.gain.setValueAtTime(.001,t);v.gain.exponentialRampToValueAtTime(.07,t+.008);v.gain.exponentialRampToValueAtTime(.001,t+.1);o.connect(v);v.connect(audio.destination);o.start(t);o.stop(t+.11);o.onended=()=>{o.disconnect();v.disconnect();};}catch{}}
async function command(type,data={},g=game()){
 if(busy)return false;busy=true;$('#ocho-error').textContent='';render(true);let ok=false;
 try{await host.command('ocho.'+type,{...(g?{game:g.id,revision:g.revision}:{}),...data});await host.sync();selected=null;ok=true;}catch(e){await host.sync().catch(()=>{});error(e);}finally{busy=false;render(true);if(pauseAfterAction){pauseAfterAction=false;queueMicrotask(()=>{const chat=chatAfterAction;chatAfterAction=false;close(chat).catch(error);});}}return ok;
}
async function close(toChat=false){if(busy){pauseAfterAction=true;chatAfterAction||=toChat;return;}if(game()?.status==='active'&&!game().pausedBy.includes(who)){if(!await command('pause'))return;}opened=false;full=false;selected=null;clearFlights();save();render(true);if(toChat)host.goto('chat');}
function card(c,root,action=false){const b=make(action?'button':'div',null,root,'ocho-card '+(c.color||'wild'));if(action)b.type='button';const label=(c.color?c.color+' ':'')+(c.kind==='number'?c.value:labels[c.kind]);b.setAttribute('aria-label',label);b.setAttribute('title',label);art(c.kind,b);make('span',c.kind==='number'?String(c.value):symbols[c.kind],b,'ocho-corner');if(c.kind==='number')make('strong',String(c.value),b,'ocho-number');return b;}
function paintPile(g,center){
 const priorGame=pileGame;if(pileGame!==g.id){pileView=make('div',null,null,'ocho-pile');pileView._cards=new Map();pileGame=g.id;pileOrder=-1;}
 const incoming=g.discards?.length?g.discards:g.top?[{...g.top,order:g.lastCard?.move??0}]:[];
 for(const [key,node] of pileView._cards)if(!incoming.some(c=>c.order===key)){node.remove();pileView._cards.delete(key);}
 for(const c of incoming){let node=pileView._cards.get(c.order);const fresh=!node;if(fresh){node=card(c,null);node.className+=' ocho-laid tilt-'+(c.order%7);node.dataset.order=c.order;pileView._cards.set(c.order,node);}node.setAttribute('aria-hidden',String(c.order!==incoming.at(-1).order));pileView.append(node);
  if(fresh&&priorGame===g.id&&pileOrder>=0&&c.order>pileOrder&&!reduced()){const tilt=[0,4,-3,2,-5,3,-2][c.order%7];node.animate?.([{transform:'translateY(-25px) rotate('+ (tilt-7)+'deg) scale(1.09)',opacity:.3},{transform:'translateY(0) rotate('+tilt+'deg) scale(1)',opacity:1}],{duration:270,easing:'cubic-bezier(.2,.75,.3,1)'});}}
 pileOrder=incoming.at(-1)?.order??0;pileView.dataset.move=pileOrder;center.append(pileView);
}
function clearFlights(){for(const e of flying)e.remove();flying=[];}
function drawEffects(events){
 if(!opened||document.hidden||!events.length)return;const board=$('#ocho-game'),stock=board.querySelector('.ocho-stock'),destination=board.querySelector('.ocho-hand'),opponent=board.querySelector('.ocho-backs');if(!stock||!destination||!opponent)return;
 const src=stock.getBoundingClientRect();for(const event of events){const target=(event.by===who?destination:opponent).getBoundingClientRect();const finishX=target.left+target.width/2-23,finishY=target.top+target.height/2-34;
  const badge=make('div',event.by+' +'+event.count,$('#ocho-panel'),'ocho-draw-badge');badge.setAttribute('role','status');flying.push(badge);
  if(reduced()){setTimeout(()=>{badge.remove();flying=flying.filter(e=>e!==badge);},1600);continue;}
  badge.animate?.([{opacity:0},{opacity:1,offset:.12},{opacity:1,offset:.8},{opacity:0}],{duration:1500}).finished.then(()=>{badge.remove();flying=flying.filter(e=>e!==badge);}).catch(()=>{});
  const count=Math.min(event.count,6);for(let i=0;i<count;i++){const ghost=make('div',null,$('#ocho-panel'),'ocho-card ocho-fly-card');art('back',ghost);ghost.setAttribute('aria-hidden','true');flying.push(ghost);const startX=src.left+src.width/2-23,startY=src.top+src.height/2-34;const flight=ghost.animate?.([{transform:'translate('+startX+'px,'+startY+'px) rotate(-4deg)',opacity:0},{transform:'translate('+startX+'px,'+startY+'px) rotate(-4deg)',opacity:1,offset:.12},{transform:'translate('+finishX+'px,'+finishY+'px) rotate('+((i%3-1)*5)+'deg)',opacity:1,offset:.88},{transform:'translate('+finishX+'px,'+finishY+'px) scale(.86)',opacity:0}],{duration:440,delay:i*65,easing:'ease-in-out',fill:'both'});if(flight)flight.finished.then(()=>{ghost.remove();flying=flying.filter(e=>e!==ghost);}).catch(()=>{});else ghost.remove();}
 }
}
function clock(){const e=$('#ocho-clock'),g=game();if(!e)return;e.textContent=g?.status==='active'&&!g.pausedBy.length&&g.deadline?Math.max(0,Math.ceil((g.deadline-Date.now()-clockOffset)/1000))+'s':'';}
function render(force=false){
 $('#ocho-open').hidden=opened;$('#ocho-panel').hidden=!opened;$('#ocho-panel').classList.toggle('ocho-full',opened&&full);$('#ocho-sound').textContent=sound?'Sound on':'Muted';$('#ocho-sound').setAttribute('aria-pressed',String(sound));
 const invite=$('#ocho-invitation'),shared=games.shared;const inviteSig=JSON.stringify([shared?.id,shared?.status,shared?.owner,busy]);if(invite.dataset.signature!==inviteSig){invite.dataset.signature=inviteSig;invite.replaceChildren();invite.hidden=!(shared?.status==='waiting'&&shared.owner!==who);if(!invite.hidden){make('span',shared.owner+' invited you to Ocho.',invite);button('View invitation',invite,async()=>{if(busy)return;if(mode==='solo'&&game()?.status==='active'&&!game().pausedBy.includes(who)&&!await command('pause'))return;mode='shared';opened=true;host.goto('together');save();render(true);});}}
 const g=game();$('#ocho-open-note').textContent=g?.status==='active'?'Your game is saved · Tap to return':'Eight cards. Your next little rivalry.';
 if(!opened)return;const sig=JSON.stringify([who,mode,g,games.records,busy,selected,full]);if(!force&&sig===signature){clock();return;}signature=sig;
 for(const m of ['solo','shared']){$('#ocho-'+m).classList.toggle('selected',mode===m);$('#ocho-'+m).disabled=busy;}
 $('#ocho-size').textContent=full?'Exit full screen':'Full screen';
 const root=$('#ocho-game');root.replaceChildren();const records=games.records?.[mode]??{wins:{},history:[]};make('div',Object.entries(records.wins).map(([n,w])=>n+' · '+w+' wins').join('     '),root,'ocho-records');
 if(!g||['ended','declined','expired','complete'].includes(g.status)){
  if(g?.status==='complete'){const result=make('div',null,root,'ocho-result');make('h3',g.winner===who?'You won!':g.winner?g.winner+' won':'A draw',result);make('p','Result saved. Ready for another?',result);}
  else if(g)make('p',g.status==='expired'?'The invitation expired.':g.last,root,'muted');
  const setup=make('div',null,root,'ocho-setup');const label=make('label','Turn timer',setup);const select=make('select',null,label);select.id='ocho-turn-setting';for(const n of [0,15,30,45,60]){const o=make('option',n?n+' seconds':'No timer',select);o.value=n;}if(g)select.value=g.turnSeconds||0;
  make('small','Timer expiry plays a legal card or draws. Closing the game pauses it.',setup,'muted');button(mode==='solo'?'Play against computer':'Invite '+(who==='Mahmoud'?'Safy':'Mahmoud'),setup,()=>command('create',{mode,turnSeconds:Number(select.value)},null),'primary').disabled=busy;
 }else if(g.status==='waiting'){
  make('p',g.owner===who?'Waiting for '+g.opponent+' to accept.':g.owner+' wants to play Ocho.',root);make('p',g.turnSeconds?g.turnSeconds+' seconds per turn':'No timer',root,'muted');
  if(g.owner!==who){button('Accept',root,()=>command('accept'),'primary').disabled=busy;button('Decline',root,()=>command('decline')).disabled=busy;}else button('Cancel invitation',root,()=>command('leave')).disabled=busy;
 }else{
  const table=make('div',null,root,'ocho-table');const meta=make('div',null,table,'ocho-meta');make('span',g.opponent+' · '+g.opponentCount+' cards',meta);make('strong','',meta).id='ocho-clock';
  const backs=make('div',null,table,'ocho-backs');backs.setAttribute('aria-label',g.opponentCount+' hidden opponent cards');for(let i=0;i<Math.min(g.opponentCount,16);i++)make('i',null,backs);if(g.opponentCount>16)make('small','+'+(g.opponentCount-16),backs);
  const status=make('div',g.pausedBy.length?'Paused · '+g.pausedBy.join(' & '):g.turn===who?'Your turn':g.turn+' is thinking…',table,'ocho-turn');status.setAttribute('role','status');
  const center=make('div',null,table,'ocho-center');const stock=button(null,center,()=>command('draw'),'ocho-card ocho-stock');art('back',stock);make('small',g.canDraw?(g.pending?'Draw '+g.pending:'Draw'):'Draw pile',stock);stock.setAttribute('aria-label','Draw pile · '+g.stockCount+' cards remaining');stock.disabled=busy||!g.canDraw;
  paintPile(g,center);
  const color=make('div','Color · '+g.color,table,'ocho-color '+g.color);color.setAttribute('aria-label','Current color: '+g.color);if(g.pending)make('strong','Draw penalty · '+g.pending,table,'ocho-penalty');
  make('p',g.last,table,'ocho-last');
  if(g.peek){const peek=make('div',null,table,'ocho-peek');make('small','Only you can see · '+g.opponent+': '+(g.peek.color?g.peek.color+' ':'')+(g.peek.value??labels[g.peek.kind]),peek);}
  const actions=make('div',null,root,'ocho-actions');if(g.pausedBy.includes(who))button('Resume game',actions,()=>command('resume'),'primary').disabled=busy;else if(g.pausedBy.length)make('p','Waiting for your partner to resume.',actions);
  if(g.canPass)button('Pass',actions,()=>command('pass')).disabled=busy;
  if(selected&&!g.legal.includes(selected))selected=null;
  if(selected){const picker=make('div',null,actions,'ocho-picker');make('span','Choose a color',picker);for(const c of colors)button(c,picker,()=>command('play',{card:selected,color:c}),'ocho-color '+c).disabled=busy;button('Cancel',picker,()=>{selected=null;render(true);});}
  make('div','Your cards · '+g.hand.length,root,'label');const hand=make('div',null,root,'ocho-hand');for(const c of g.hand){const b=card(c,hand,true);b.disabled=busy||!g.legal.includes(c.id);b.classList.toggle('playable',!b.disabled);b.classList.toggle('picked',c.id===selected);b.onclick=()=>{unlock();if(['wild','draw4','shield','xray'].includes(c.kind)){selected=c.id;render(true);}else command('play',{card:c.id});};}
  button('Leave game',root,()=>{const d=$('#ocho-leave-dialog');d.showModal();$('#ocho-keep').focus();},'ocho-leave').disabled=busy;
 }
 const history=make('details',null,root,'ocho-history');make('summary','Match history · '+records.history.length,history);if(!records.history.length)make('p','Your results will appear here.',history,'muted');for(const r of records.history.slice(0,20))make('p',(r.status==='ended'?'Left early':r.winner?r.winner+' won':'Draw')+' · '+new Date(r.at).toLocaleDateString(),history);clock();
}
window.OurOcho={init(h){host=h;$('#ocho-open').onclick=()=>{unlock();opened=true;save();render(true);};$('#ocho-close').onclick=()=>close().catch(error);$('#ocho-chat').onclick=()=>close(true).catch(error);$('#ocho-size').onclick=()=>{full=!full;save();render(true);};$('#ocho-sound').onclick=async()=>{sound=!sound;await unlock();if(sound)tone();save();render(true);};for(const m of ['solo','shared'])$('#ocho-'+m).onclick=async()=>{if(busy||m===mode)return;if(game()?.status==='active'&&!game().pausedBy.includes(who)&&!await command('pause'))return;mode=m;selected=null;save();render(true);};$('#ocho-keep').onclick=()=>$('#ocho-leave-dialog').close();$('#ocho-leave-confirm').onclick=async()=>{if(await command('leave'))$('#ocho-leave-dialog').close();};setInterval(clock,250);},
 sync(s){if(who===s.who&&s.version<lastVersion)return;if(who!==s.who){drawSeen.clear();clearFlights();pileGame=null;who=s.who;opened=false;mode='solo';full=false;selected=null;try{const v=JSON.parse(localStorage.getItem('our-place:ocho:'+who)||'{}');mode=v.mode==='shared'?'shared':'solo';opened=!!v.opened;full=!!v.full;sound=v.sound!==false;}catch{}}const old=game();const next=s.ocho?.[mode];if(old&&next?.id===old.id&&(next.lastCard?.move||0)>(old.lastCard?.move||0))tone();const effects=[];for(const m of ['solo','shared']){const g=s.ocho?.[m];if(!g)continue;const seen=drawSeen.get(g.id);const events=g.drawEvents??[];if(seen!==undefined&&m===mode)effects.push(...events.filter(e=>e.id>seen));drawSeen.set(g.id,events.at(-1)?.id??0);}games=s.ocho??{};lastVersion=s.version;clockOffset=s.serverNow-Date.now();render();drawEffects(effects);},
 tab(next){if(next!=='together'&&opened){if(busy)pauseAfterAction=true;else close().catch(error);}},
 reset(){clearFlights();drawSeen.clear();pileGame=null;who=null;games={};opened=false;full=false;busy=false;selected=null;signature='';lastVersion=-1;$('#ocho-leave-dialog').close();$('#ocho-game').replaceChildren();render(true);}
};
})();
