(()=>{'use strict';
const $=s=>document.querySelector(s),make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
let host,who=null,games={},mode='solo',opened=false,busy=false,picked=null,signature='',version=-1;
const game=()=>games[mode];
let soundOn=true,audioContext=null;
const heardMoves=new Map();
try{soundOn=localStorage.getItem('our-place:domino:sound')!=='off';}catch{}
function soundButton(){const b=$('#domino-sound');b.textContent=soundOn?'Sound on':'Muted';b.setAttribute('aria-pressed',String(soundOn));b.setAttribute('aria-label',soundOn?'Mute domino sounds':'Enable domino sounds');}
function unlockSound(){
 if(!soundOn)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audioContext??=new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}
}
function tileSound(){
 if(!soundOn||!opened||document.hidden||$('#domino-panel').getClientRects?.().length===0||audioContext?.state!=='running')return;
 try{
  const now=audioContext.currentTime;
  for(const [delay,hz,volume] of [[0,240,.028],[.012,155,.016]]){
   const tone=audioContext.createOscillator(),gain=audioContext.createGain();tone.type='sine';tone.frequency.setValueAtTime(hz,now+delay);tone.frequency.exponentialRampToValueAtTime(hz*.45,now+delay+.045);
   gain.gain.setValueAtTime(.001,now+delay);gain.gain.exponentialRampToValueAtTime(volume,now+delay+.004);gain.gain.exponentialRampToValueAtTime(.001,now+delay+.065);tone.connect(gain);gain.connect(audioContext.destination);tone.start(now+delay);tone.stop(now+delay+.07);tone.onended=()=>{tone.disconnect();gain.disconnect();};
  }
 }catch{}
}
function hearMoves(next){
 for(const m of ['solo','shared']){
  const g=next[m],key=g?g.id+':'+g.round:null,order=g?.lastMove?.order??0,previous=heardMoves.get(m);
  if(previous&&previous.key===key&&order>previous.order&&m===mode)tileSound();
  heardMoves.set(m,{key,order});
 }
}

function save(){try{if(who)localStorage.setItem('our-place:domino:'+who,JSON.stringify({mode,opened}));}catch{}}
function show(){ $('#domino-panel').hidden=!opened;$('#domino-open').hidden=opened;save();}
function error(e){$('#domino-error').textContent=e.message||'Could not connect. Your game is saved.';}
function btn(label,root,fn,cls){const b=make('button',label,root,cls);b.type='button';b.onclick=()=>Promise.resolve(fn()).catch(error);return b;}
async function command(type,data={},g=game()){
 if(busy)return;busy=true;$('#domino-error').textContent='';render();
 try{await host.command('domino.'+type,{...(g?{game:g.id,revision:g.revision}:{}),...data});await host.sync();picked=null;}
 catch(e){await host.sync().catch(()=>{});error(e);}
 finally{busy=false;signature='';render();save();}
}
const dots=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
function piece(tile,root,interactive=false){
 const e=make(interactive?'button':'span',undefined,root,'domino-piece');if(interactive)e.type='button';e.setAttribute('aria-label',tile.a+'–'+tile.b);
 for(const value of [tile.a,tile.b]){const half=make('span',undefined,e,'domino-half');half.setAttribute('aria-hidden','true');for(let i=0;i<9;i++)make('i',undefined,half,dots[value].includes(i)?'pip':'');}return e;
}
let boardObserver=null,animationSeen='',historySignature='';
const boards=new Map(),drawSeen=new Map();
function tableLayout(chain){
 if(!chain.length)return [];
 const rootIndex=chain.reduce((best,t,i)=>(t.order??Infinity)<(chain[best].order??Infinity)?i:best,0),root=chain[rootIndex];
 const pose=(tile,dir,previous)=>{
  const double=tile.a===tile.b,len=double?1:2,cross=double?2:1,dx=[1,0,-1,0][dir],dy=[0,1,0,-1][dir];let x=0,y=0;
  if(previous){
   if(dir===previous.dir){x=previous.x+dx*(previous.len/2+len/2+.08);y=previous.y+dy*(previous.len/2+len/2+.08);}
   else{const half=previous.double?0:previous.len/2-.5;x=previous.x+[1,0,-1,0][previous.dir]*half+dx*(previous.cross/2+len/2+.08);y=previous.y+[0,1,0,-1][previous.dir]*half+dy*(previous.cross/2+len/2+.08);}
  }
  return {tile,x,y,dir,len,cross,double,w:dir%2?cross:len,h:dir%2?len:cross,angle:dir*90+(double?90:0)};
 };
 const center=pose(root,0),out=[center];
 function arm(tiles,left){
  let direction=left?2:0,horizontal=direction,rowY=0,previous={...center,dir:direction};const vertical=left?3:1;
  for(const original of tiles){
   const tile=left?{...original,a:original.b,b:original.a}:original;
   let next=pose(tile,direction,previous);
   if(direction%2===0&&(next.x+next.w/2>8||next.x-next.w/2< -8)){horizontal=direction;direction=vertical;next=pose(tile,direction,previous);}
   else if(direction===vertical&&Math.abs(previous.y-rowY)>=3){direction=horizontal===0?2:0;next=pose(tile,direction,previous);rowY=next.y;}
   out.push(next);previous=next;
  }
 }
 arm(chain.slice(rootIndex+1),false);arm(chain.slice(0,rootIndex).reverse(),true);
 const byId=new Map(out.map(p=>[p.tile.id,p]));return chain.map(t=>byId.get(t.id));
}
function arrangeBoard(board,chain,lastMove,key){
 const width=board.clientWidth||280,layoutKey=width+':'+key+':'+chain.length;
 if(board.dataset.layout===layoutKey)return;board.dataset.layout=layoutKey;
 const height=Math.max(250,Math.min(330,width));board.style.height=height+'px';
 if(!chain.length){if(!board._empty)board._empty=make('span','Your table is ready.',board,'domino-board-empty');return;}
 board._empty?.remove?.();board._empty=null;
 const poses=tableLayout(chain),extentX=Math.max(1,...poses.map(p=>Math.abs(p.x)+p.w/2)),extentY=Math.max(1,...poses.map(p=>Math.abs(p.y)+p.h/2));
 const fit=Math.min(24,(width-26)/(2*extentX),(height-38)/(2*extentY));
 if(!board._unit)board._unit=Math.min(24,(width-26)/17);
 if(fit<board._unit)board._unit=fit*.94;
 const unit=board._unit;board.style.setProperty('--domino-unit',unit+'px');
 board._nodes??=new Map();
 for(const [index,p] of poses.entries()){
  let wrap=board._nodes.get(p.tile.id),fresh=!wrap;
  if(fresh){wrap=make('span',undefined,board,'domino-placement');wrap._piece=piece(p.tile,wrap);wrap._label=make('small','',wrap,'domino-end-label');board._nodes.set(p.tile.id,wrap);}
  const x=width/2+p.x*unit,y=height/2+p.y*unit,e=wrap._piece;
  wrap.style.left=x+'px';wrap.style.top=y+'px';wrap.style.setProperty('--arrival-x',(width/2-x)+'px');wrap.style.setProperty('--arrival-y',((lastMove?.by===who?height-12:12)-y)+'px');
  e.style.transform='translate(-50%,-50%) rotate('+p.angle+'deg)';
  e.classList.toggle('computer-last',lastMove?.id===p.tile.id);
  wrap.classList.toggle('domino-arriving',fresh&&board._ready&&lastMove?.id===p.tile.id);
  wrap._label.textContent=index===0?'A':index===poses.length-1?'B':'';wrap._label.style.top=(p.h*unit/2+3)+'px';
 }
 board._ready=true;
}
function drawPile(g,root){
 const area=make('div',undefined,root,'domino-table-area'),boardKey=mode+':'+g.id+':'+g.round;
 let board=boards.get(boardKey);if(!board){board=make('div',undefined,null,'domino-board');boards.clear();boards.set(boardKey,board);}area.append(board);
 board.setAttribute('aria-label','Connected domino table with fixed tile positions');
 const pile=make('div',undefined,area,'domino-stock');pile.setAttribute('aria-label','Draw pile: '+g.stockCount+' tiles');
 make('small','DRAW',pile);make('strong',String(g.stockCount),pile);
 const stack=make('div',undefined,pile,'domino-stock-tiles');
 for(let i=0;i<g.stockCount;i++)make('span',undefined,stack,'domino-stock-back').setAttribute('aria-hidden','true');
 if(!g.stockCount)make('small','Empty',pile);
 const previous=drawSeen.get(mode),same=previous?.key===boardKey,drawn=same?Math.max(0,previous.stock-g.stockCount):0;
 let newIds=same?g.hand.filter(t=>!previous.hand.includes(t.id)).map(t=>t.id):[];
 const recent=same&&Date.now()-(previous.at??0)<650;if(!drawn&&recent)newIds=previous.newIds;
 if((drawn||recent&&previous.drawn)&&opened&&!document.hidden){const ghost=make('span',undefined,area,'domino-stock-back domino-drawing '+(newIds.length?'to-hand':'to-opponent'));ghost.setAttribute('aria-hidden','true');ghost.onanimationend=()=>ghost.remove?.();}
 drawSeen.set(mode,{key:boardKey,stock:g.stockCount,hand:g.hand.map(t=>t.id),at:drawn?Date.now():previous?.at,newIds,drawn:drawn||recent&&previous.drawn});
 return {board,newIds};
}
function renderRecords(){
 const record=games.records?.[mode]??{wins:{},history:[]},sig=JSON.stringify([mode,record]);if(sig===historySignature)return;historySignature=sig;
 const root=$('#domino-records');root.replaceChildren();const people=mode==='shared'?['Mahmoud','Safy']:[who,'Computer'];
 make('small',mode==='shared'?'YOUR RIVALRY · MATCH WINS':'SOLO · MATCH WINS',root,'label');
 for(const name of people)make('span',name+' · '+(record.wins[name]??0)+' wins',root,'domino-win-total');
 const list=$('#domino-history-list');list.replaceChildren();
 if(!record.history.length)make('p','Completed matches will be remembered here.',list,'muted');
 for(const entry of record.history){const row=make('div',undefined,list,'domino-history-row');make('strong',entry.status==='completed'?entry.winner+' won':'Unfinished match',row);make('span',Object.entries(entry.scores).map(([n,p])=>n+' '+p).join(' · ')+' / target '+entry.target,row);make('small',new Date(entry.date).toLocaleDateString()+' · '+entry.rounds+' rounds'+(entry.difficulty?' · '+entry.difficulty:''),row);}
}
window.DominoTable={layout:tableLayout};
function scoreboard(g,root){
 const score=make('div',undefined,root,'domino-scoreboard');score.setAttribute('aria-label','Game score');
 const order=g.mode==='shared'?['Mahmoud','Safy']:g.players;
 for(let i=0;i<order.length;i++){
  if(i===1){const round=make('div',undefined,score,'domino-round');make('small','ROUND',round);make('strong',String(g.round),round);}
  const name=order[i],card=make('div',undefined,score,'domino-player-score '+(name==='Mahmoud'?'mahmoud':name==='Safy'?'safy':'computer'));
  card.classList.toggle('current-turn',g.turn===name);make('span',name,card);make('strong',String(g.scores[name]??0)+'/'+g.target,card);make('small','POINTS',card);
 }
}
function invite(){
 const g=games.shared,root=$('#domino-invitation');root.replaceChildren();root.hidden=!(g?.status==='waiting'&&g.owner!==who);
 if(root.hidden)return;make('span',g.owner+' invited you to Dominoes · first to '+g.target+'.',root);
 btn('Join',root,async()=>{mode='shared';opened=true;host.goto('together');await command('accept',{},g);show();},'primary').disabled=busy;
 btn('Not now',root,()=>command('decline',{},g)).disabled=busy;
}
function render(){
 show();invite();renderRecords();
 const g=game(),key=JSON.stringify([g,mode,busy,picked]);
 $('#domino-solo-tab').classList.toggle('selected',mode==='solo');$('#domino-shared-tab').classList.toggle('selected',mode==='shared');
 $('#domino-open-note').textContent=games.shared?.status==='active'?'Your shared game is saved.':games.solo?.status==='active'?'Your solo game is saved.':'A quiet table. A little competition.';
 if(key===signature)return;signature=key;
 const root=$('#domino-game');boardObserver?.disconnect();root.replaceChildren();if(g)scoreboard(g,root);
 const live=g&&['waiting','active','finished','complete'].includes(g.status);
 $('#domino-setup').hidden=!!live;
 $('#domino-difficulty-row').hidden=mode!=='solo';
 $('#domino-start').textContent=mode==='solo'?'Play against computer':'Invite '+(who==='Mahmoud'?'Safy':'Mahmoud');
 $('#domino-start').disabled=busy;
 if(!live){if(g?.last?.text)make('p',g.last.text,root,'muted');return;}
 if(g.status==='waiting'){
  make('p',g.owner===who?'Waiting for '+g.opponent+' to accept…':g.owner+' invited you to play.',root,'domino-turn');
  if(g.owner===who)btn('Cancel invitation',root,()=>command('leave')).disabled=busy;
  else{btn('Accept invitation',root,()=>command('accept'),'primary').disabled=busy;btn('Not now',root,()=>command('decline')).disabled=busy;}return;
 }
 const status=g.status==='complete'?g.matchWinner+' wins the match!':g.status==='finished'?(g.result.winner?g.result.winner+' wins · +'+g.result.points+' points':'Draw · equal remaining pips'):g.turn===who?'Your turn':g.turn==='Computer'?'Computer is choosing…':g.turn+'’s turn';
 make('p',status,root,'domino-turn').setAttribute('role','status');
 const meta=make('div',undefined,root,'domino-table-meta');make('span',g.opponent+' · '+g.opponentCount+' tiles',meta);make('span','Draw pile · '+g.stockCount,meta);
 const backs=make('div',undefined,root,'domino-opponent');backs.setAttribute('aria-label',g.opponent+' has '+g.opponentCount+' hidden tiles');for(let i=0;i<g.opponentCount;i++)make('span',undefined,backs).setAttribute('aria-hidden','true');
 const ends=make('div',undefined,root,'domino-ends');make('span',g.chain.length?'End A · '+g.chain[0].a:'Place any tile to start',ends);if(g.chain.length)make('span','End B · '+g.chain.at(-1).b,ends);
 const {board,newIds}=drawPile(g,root);
 arrangeBoard(board,g.chain,g.lastMove,g.id+':'+g.round+':'+(g.lastMove?.order??0));
 requestAnimationFrame(()=>{if(board.isConnected!==false)arrangeBoard(board,g.chain,g.lastMove,g.id+':'+g.round+':'+(g.lastMove?.order??0));});
 if(typeof ResizeObserver!=='undefined'){boardObserver=new ResizeObserver(()=>arrangeBoard(board,g.chain,g.lastMove,g.id+':'+g.round+':'+(g.lastMove?.order??0)));boardObserver.observe(board);}
 make('p',g.last?.text||'',root,'domino-last');
 if(g.status==='finished'||g.status==='complete'){
  if(g.result.reason==='blocked')make('p','Blocked table · '+g.players.map(n=>n+': '+g.result.totals[n]+' pips').join(' / '),root,'muted');
  if(g.status==='complete')btn('New match',root,()=>command('leave'),'primary').disabled=busy;
  else{btn(g.mode==='solo'?'Next round':'Invite to next round',root,()=>command('rematch'),'primary').disabled=busy;btn('Finish game',root,()=>command('leave')).disabled=busy;}
 }else{
  const controls=make('div',undefined,root,'domino-actions');
  if(picked&&g.legal.some(m=>m.tile===picked)){make('span','Choose an end:',controls);for(const move of g.legal.filter(m=>m.tile===picked))btn(move.side==='left'?'End A':'End B',controls,()=>command('play',move),'primary').disabled=busy;}
  if(g.canDraw)btn('Draw a tile',controls,()=>command('draw'),'primary').disabled=busy;
  if(g.canPass)btn('Pass turn',controls,()=>command('pass'),'primary').disabled=busy;
 }
 make('div','YOUR TILES · '+g.hand.length,root,'label');
 const hand=make('div',undefined,root,'domino-hand');
 for(const tile of g.hand){
  const e=piece(tile,hand,true),moves=g.legal.filter(m=>m.tile===tile.id);
  e.classList.toggle('domino-drawn',newIds.includes(tile.id));e.disabled=busy||!moves.length;e.classList.toggle('playable',!!moves.length);e.classList.toggle('picked',picked===tile.id);
  e.onclick=()=>{if(moves.length===1)command('play',moves[0]);else{picked=picked===tile.id?null:tile.id;signature='';render();}};
 }
 if(g.status==='active'){
  make('p',g.turn===who?(g.legal.length?'Tap a highlighted tile. Choose an end if both match.':g.canDraw?'No match yet. Draw until you can play.':'No tiles to draw. Pass your turn.'):'Your tiles stay private. Wait for your turn.',root,'domino-help');
  const tools=make('details',undefined,root,'domino-game-tools');make('summary','Game options',tools);btn('Leave game',tools,()=>command('leave')).disabled=busy;
 }
}
function init(h){
 host=h;soundButton();$('#domino-panel').addEventListener?.('pointerdown',unlockSound);$('#domino-panel').addEventListener?.('keydown',unlockSound);$('#domino-sound').onclick=()=>{soundOn=!soundOn;try{localStorage.setItem('our-place:domino:sound',soundOn?'on':'off');}catch{}soundButton();if(soundOn)unlockSound();};$('#domino-open').onclick=()=>{opened=true;show();render();};
 $('#domino-collapse').onclick=()=>{opened=false;show();};
 for(const m of ['solo','shared'])$('#domino-'+m+'-tab').onclick=()=>{mode=m;picked=null;signature='';render();};
 $('#domino-start').onclick=()=>command('create',{mode,difficulty:$('#domino-difficulty').value,target:Number($('#domino-target').value)},null);
 $('#domino-chat').onclick=()=>host.goto('chat');
}
window.OurDomino={init,sync(s){
 if(Number.isFinite(s.version)&&who===s.who&&s.version<version)return;
 if(who!==s.who){heardMoves.clear();who=s.who;opened=false;mode='solo';picked=null;signature='';
 try{const saved=JSON.parse(localStorage.getItem('our-place:domino:'+who)||'null');if(saved){mode=saved.mode==='shared'?'shared':'solo';opened=!!saved.opened;}}catch{}}
 version=s.version;hearMoves(s.domino??{});games=s.domino??{};if(picked&&!game()?.legal.some(m=>m.tile===picked))picked=null;render();
},reset(){boards.clear();drawSeen.clear();heardMoves.clear();boardObserver?.disconnect();historySignature='';animationSeen='';$('#domino-records').replaceChildren();$('#domino-history-list').replaceChildren();who=null;games={};version=-1;signature='';opened=false;picked=null;$('#domino-game').replaceChildren();$('#domino-invitation').hidden=true;$('#domino-error').textContent='';show();}};
})();
