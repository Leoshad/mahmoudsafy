(()=>{'use strict';
const $=s=>document.querySelector(s),make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
let host,who=null,games={},mode='solo',opened=false,busy=false,picked=null,signature='',version=-1;
const game=()=>games[mode];
let fullView=true,clockOffset=0;
function updateClock(){const g=game(),e=view?.clock;if(!e)return;e.hidden=!(g?.status==='active'&&!g.paused&&g.turnSeconds);if(e.hidden)return;const seconds=Math.max(0,Math.ceil((g.turnDeadline-(Date.now()+clockOffset))/1000));e.textContent=seconds+'s';e.classList.toggle('clock-low',seconds<=5);e.setAttribute('aria-label',g.turn+' has '+seconds+' seconds remaining');}
function focused(){return opened&&fullView&&['active','finished','complete'].includes(game()?.status);}
let soundOn=true,audioContext=null;
const heardMoves=new Map(),shownResults=new Set();
try{soundOn=localStorage.getItem('our-place:domino:sound')!=='off';}catch{}
function soundButton(){const b=$('#domino-sound');b.textContent=soundOn?'Sound on':'Muted';b.setAttribute('aria-pressed',String(soundOn));b.setAttribute('aria-label',soundOn?'Mute domino sounds':'Enable domino sounds');}
function unlockSound(preview=false){
 if(!soundOn)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audioContext??=new Audio();if(audioContext.state!=='running')audioContext.resume().then(()=>{if(preview===true)tileSound(true);}).catch(()=>{});else if(preview===true)tileSound(true);}catch{}
}
function tileSound(preview=false){
 if(!soundOn||document.hidden||!preview&&(!opened||$('#domino-panel').getClientRects?.().length===0)||audioContext?.state!=='running')return;
 try{
  const now=audioContext.currentTime;
  for(const [delay,hz,volume] of [[0,420,.085],[.012,260,.05]]){
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

let savedPreference='';
function save(){try{if(!who)return;const value=JSON.stringify({mode,opened,fullView}),key='our-place:domino:'+who;if(savedPreference===key+value)return;localStorage.setItem(key,value);savedPreference=key+value;}catch{}}
function show(){ $('#domino-panel').classList.toggle('domino-focused',focused());$('#domino-panel').hidden=!opened;$('#domino-open').hidden=opened;save();}
function error(e){$('#domino-error').textContent=e.message||'Could not connect. Your game is saved.';}
function btn(label,root,fn,cls){const b=make('button',label,root,cls);b.type='button';b.onclick=()=>Promise.resolve(fn()).catch(error);return b;}
async function command(type,data={},g=game()){
 if(busy)return false;let success=false;busy=true;$('#domino-error').textContent='';$('#domino-game').setAttribute('aria-busy','true');
 try{await host.command('domino.'+type,{...(g?{game:g.id,revision:g.revision}:{}),...data});await host.sync();picked=null;success=true;}
 catch(e){await host.sync().catch(()=>{});error(e);}
 finally{busy=false;$('#domino-game').setAttribute('aria-busy','false');render();save();}
 return success;
}
async function closeGame(chat=false){
 const g=game();if(g?.status==='active'&&!g.pausedBy?.includes(who)){if(!await command('pause'))return;}
 opened=false;show();if(chat)host.goto('chat');
}
const dots=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
function piece(tile,root,interactive=false){
 const e=make(interactive?'button':'span',undefined,root,'domino-piece');if(interactive)e.type='button';e.setAttribute('aria-label',tile.a+'–'+tile.b);
 for(const value of [tile.a,tile.b]){const half=make('span',undefined,e,'domino-half');half.setAttribute('aria-hidden','true');const grid=make('span',undefined,half,'domino-pips');for(let i=0;i<9;i++)make('i',undefined,grid,dots[value].includes(i)?'pip':'');}return e;
}
let boardObserver=null,historySignature='',view=null;
const drawSeen=new Map();
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
   if(direction%2===0&&(next.x+next.w/2>5.6||next.x-next.w/2< -5.6)){horizontal=direction;direction=vertical;next=pose(tile,direction,previous);}
   else if(direction===vertical&&Math.abs(previous.y-rowY)>=3){direction=horizontal===0?2:0;next=pose(tile,direction,previous);rowY=next.y;}
   out.push(next);previous=next;
  }
 }
 arm(chain.slice(rootIndex+1),false);arm(chain.slice(0,rootIndex).reverse(),true);
 const byId=new Map(out.map(p=>[p.tile.id,p]));return chain.map(t=>byId.get(t.id));
}
function placementChoices(g){
 if(!picked||busy||g?.status!=='active'||g.paused||g.turn!==who)return [];
 const tile=g.hand.find(t=>t.id===picked);if(!tile)return [];
 const chain=g.chain.map((t,i)=>({...t,order:t.order??i+1})),order=Math.max(0,...chain.map(t=>t.order))+1;
 return g.legal.filter(m=>m.tile===picked).map(move=>{
  let {a,b}=tile;
  if(chain.length&&((move.side==='left'&&b!==chain[0].a)||(move.side==='right'&&a!==chain.at(-1).b)))[a,b]=[b,a];
  const next={...tile,a,b,order},future=move.side==='left'?[next,...chain]:[...chain,next];
  return {...tableLayout(future).find(p=>p.tile.id===tile.id),move};
 });
}
function arrangeBoard(board,chain,lastMove,key){
 const width=board.clientWidth||280,height=focused()?(board.clientHeight||300):Math.max(300,Math.min(400,width*1.15)),layoutKey=width+':'+height+':'+key+':'+chain.length+':'+game()?.status+':'+!!game()?.paused+':'+picked+':'+busy;
 if(board.dataset.layout===layoutKey)return;board.dataset.layout=layoutKey;
 if(!focused())board.style.height=height+'px';
 if(!chain.length){if(!board._empty)board._empty=make('span','Your table is ready.',board,'domino-board-empty');return;}
 board._empty?.remove?.();board._empty=null;
 const poses=tableLayout(chain),choices=placementChoices(game()),bounds=[...poses,...choices],minX=Math.min(...bounds.map(p=>p.x-p.w/2)),maxX=Math.max(...bounds.map(p=>p.x+p.w/2)),minY=Math.min(...bounds.map(p=>p.y-p.h/2)),maxY=Math.max(...bounds.map(p=>p.y+p.h/2));
 const fit=Math.min(25,(width-52)/(maxX-minX),(height-52)/(maxY-minY));
 board._unit??=25;
 if(fit<board._unit)board._unit=fit*.98;
 const unit=board._unit;board.style.setProperty('--domino-unit',unit+'px');
 // Move the camera only enough to keep the new endpoint inside the table.
 board._cx=Math.max(26-minX*unit,Math.min(board._cx??width/2,width-26-maxX*unit));
 board._cy=Math.max(26-minY*unit,Math.min(board._cy??height/2,height-26-maxY*unit));
 board._nodes??=new Map();
 for(const [index,p] of poses.entries()){
  let wrap=board._nodes.get(p.tile.id),fresh=!wrap;
  if(fresh){wrap=make('span',undefined,board,'domino-placement');wrap._piece=piece(p.tile,wrap);board._nodes.set(p.tile.id,wrap);}
  const x=board._cx+p.x*unit,y=board._cy+p.y*unit,e=wrap._piece;
  wrap.style.left=x+'px';wrap.style.top=y+'px';wrap.style.setProperty('--arrival-x',(width/2-x)+'px');wrap.style.setProperty('--arrival-y',((lastMove?.by===who?height-12:12)-y)+'px');
  e.style.transform='translate(-50%,-50%) rotate('+p.angle+'deg)';e.style.setProperty('--pip-rotation','90deg');
  e.classList.toggle('computer-last',game()?.status==='active'&&!game()?.paused&&lastMove?.id===p.tile.id);
  wrap.classList.toggle('domino-arriving',fresh&&board._ready&&lastMove?.id===p.tile.id);
 }
 for(const old of board._choices??[])old.remove?.();board._choices=[];
 for(const p of choices){
  const target=btn('',board,()=>command('play',p.move),'domino-place-target');
  target.setAttribute('aria-label','Place '+p.tile.a+'–'+p.tile.b+' at the '+(p.move.side==='left'?'first':'other')+' open end');
  target.style.left=(board._cx+p.x*unit)+'px';target.style.top=(board._cy+p.y*unit)+'px';
  target.style.width=Math.max(44,p.w*unit+8)+'px';target.style.height=Math.max(44,p.h*unit+8)+'px';
  const ghost=piece(p.tile,target);ghost.style.transform='translate(-50%,-50%) rotate('+p.angle+'deg)';ghost.style.setProperty('--pip-rotation','90deg');ghost.setAttribute('aria-hidden','true');
  board._choices.push(target);
 }
 board._ready=true;
}
function drawPile(g,root){
 const boardKey=mode+':'+g.id+':'+g.round;
 let area=root._area,board=area?._board;
 if(!area){
  area=make('div',undefined,root,'domino-table-area');root._area=area;
  area._pile=make('div',undefined,area,'domino-stock');
  board=make('div',undefined,area,'domino-board');area._board=board;
  board.setAttribute('aria-label','Connected domino table');
 }
 const pile=area._pile;
 if(pile._count!==g.stockCount){
  pile._count=g.stockCount;pile.replaceChildren();pile.setAttribute('aria-label','Draw pile: '+g.stockCount+' tiles');
  make('small','DRAW PILE',pile);make('strong',String(g.stockCount),pile);
  const stack=make('div',undefined,pile,'domino-stock-tiles');
  for(let i=0;i<g.stockCount;i++)make('span',undefined,stack,'domino-stock-back').setAttribute('aria-hidden','true');
  if(!g.stockCount)make('small','Empty',pile);
 }
 const previous=drawSeen.get(mode),same=previous?.key===boardKey,drawn=same?Math.max(0,previous.stock-g.stockCount):0;
 const newIds=same?g.hand.filter(t=>!previous.hand.includes(t.id)).map(t=>t.id):[];
 if(drawn&&opened&&!document.hidden){
  const ghost=make('span',undefined,area,'domino-stock-back domino-drawing '+(newIds.length?'to-hand':'to-opponent'));ghost.setAttribute('aria-hidden','true');ghost.onanimationend=()=>ghost.remove?.();
 }
 drawSeen.set(mode,{key:boardKey,stock:g.stockCount,hand:g.hand.map(t=>t.id)});
 return {board,newIds};
}
function slot(name){const e=view[name];e.replaceChildren();return e;}
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
 if(root.hidden)return;make('span',g.owner+' invited you to Dominoes · first to '+g.target+' · '+(g.turnSeconds?g.turnSeconds+'s per turn':'no timer')+'.',root);
 btn('Join',root,async()=>{mode='shared';opened=true;fullView=false;host.goto('together');await command('accept',{},g);show();host.revealPanel?.('#domino-panel');},'primary').disabled=busy;
 btn('Not now',root,()=>command('decline',{},g)).disabled=busy;
}
function render(){
 show();invite();renderRecords();
 const g=game(),key=JSON.stringify([g,mode,busy,picked]);
 $('#domino-solo-tab').classList.toggle('selected',mode==='solo');$('#domino-shared-tab').classList.toggle('selected',mode==='shared');
 $('#domino-open-note').textContent=games.shared?.status==='active'?'Your shared game is saved.':games.solo?.status==='active'?'Your solo game is saved.':'A quiet table. A little competition.';
 if(key===signature)return;signature=key;
 const root=$('#domino-game'),viewKey=mode+':'+g?.id+':'+g?.round+':'+(['active','finished','complete'].includes(g?.status)?'table':g?.status);
 if(view?.key!==viewKey){
  boardObserver?.disconnect();root.replaceChildren();view={key:viewKey};
  for(const [index,name] of ['score','status','meta','ends','table','last','actions','handTitle','hand','help'].entries()){view[name]=make('div',undefined,root,'domino-zone-'+name);view[name].style.gridRow=String(index+1);}
 }
 if(g)scoreboard(g,slot('score'));
 const live=g&&['waiting','active','finished','complete'].includes(g.status);
 $('#domino-setup').hidden=!!live;
 $('#domino-difficulty-row').hidden=mode!=='solo';
 $('#domino-start').textContent=mode==='solo'?'Play against computer':'Invite '+(who==='Mahmoud'?'Safy':'Mahmoud');
 $('#domino-start').disabled=busy;
 if(!live){if(g?.last?.text)make('p',g.last.text,slot('status'),'muted');return;}
 if(g.status==='waiting'){
  const root=slot('status');make('p',g.owner===who?'Waiting for '+g.opponent+' to accept…':g.owner+' invited you to play.',root,'domino-turn');
  if(g.owner===who)btn('Cancel invitation',root,()=>command('leave')).disabled=busy;
  else{btn('Accept invitation',root,()=>command('accept'),'primary').disabled=busy;btn('Not now',root,()=>command('decline')).disabled=busy;}return;
 }
 const status=g.paused?'Game paused':g.status==='complete'?g.matchWinner+' wins the match!':g.status==='finished'?(g.result.winner?g.result.winner+' wins · +'+g.result.points+' points':'Draw · equal remaining pips'):g.turn===who?'Your turn':g.turn==='Computer'?'Computer is choosing…':g.turn+'’s turn';
 const statusRow=make('div',undefined,slot('status'),'domino-status-row');make('p',status,statusRow,'domino-turn').setAttribute('role','status');view.clock=make('span',undefined,statusRow,'domino-clock');updateClock();
 const meta=make('div',undefined,slot('meta'),'domino-table-meta');make('span',g.opponent+' · '+g.opponentCount+' tiles',meta);
 const backs=make('div',undefined,meta,'domino-opponent');backs.setAttribute('aria-label',g.opponent+' has '+g.opponentCount+' hidden tiles');for(let i=0;i<g.opponentCount;i++)make('span',undefined,backs).setAttribute('aria-hidden','true');
 slot('ends');
 const {board,newIds}=drawPile(g,view.table);
 arrangeBoard(board,g.chain,g.lastMove,g.id+':'+g.round+':'+(g.lastMove?.order??0));
 requestAnimationFrame(()=>{if(board.isConnected!==false)arrangeBoard(board,g.chain,g.lastMove,g.id+':'+g.round+':'+(g.lastMove?.order??0));});
 board._state=g;
 if(typeof ResizeObserver!=='undefined'&&view.observed!==board){view.observed=board;boardObserver?.disconnect();boardObserver=new ResizeObserver(()=>{const current=board._state;arrangeBoard(board,current.chain,current.lastMove,current.id+':'+current.round+':'+(current.lastMove?.order??0));});boardObserver.observe(board);}
 make('p',g.last?.text||'',slot('last'),'domino-last');
 const actions=slot('actions');const ended=['finished','complete'].includes(g.status);root.classList.toggle('domino-ended',ended);
 if(g.status==='finished'||g.status==='complete'){
  const card=make('div',undefined,actions,'domino-result');card.setAttribute('role','status');const resultKey=g.id+':'+g.round+':'+g.status;if(!shownResults.has(resultKey)){card.classList.toggle('domino-result-enter',true);shownResults.add(resultKey);}
  make('small',g.status==='complete'?'MATCH COMPLETE':'ROUND COMPLETE',card);
  const winner=g.status==='complete'?g.matchWinner:g.result.winner;
  make('h3',winner===who?(g.status==='complete'?'You won!':'You won this round!'):winner?winner+' won'+(g.status==='complete'?' the match':' this round'):'Round drawn',card);
  make('p',winner?winner+' · +'+g.result.points+' points':'Equal pips · 0 points',card,'domino-result-points');
  make('p',g.players.map(n=>n+' '+g.scores[n]).join(' · ')+' / '+g.target,card,'domino-result-score');
  const totals=g.result.totals,other=g.players.find(n=>n!==winner);
  make('p',g.result.reason==='blocked'?(winner?'Blocked round · '+totals[other]+' − '+totals[winner]+' = '+g.result.points+' points':'Blocked round · '+g.players.map(n=>totals[n]).join(' = ')+' · no points awarded'):'Empty hand · '+totals[other]+' remaining pips = '+g.result.points+' points',card,'domino-result-calculation');
  const evidence=make('div',undefined,card,'domino-result-hands');
  for(const name of g.players){const group=make('div',undefined,evidence,'domino-result-hand');make('strong',name+' · '+totals[name]+' pips',group);const row=make('div',undefined,group,'domino-result-tiles');row.setAttribute('aria-label',name+' remaining tiles');const tiles=g.result.hands?.[name];if(tiles?.length)for(const tile of tiles)piece(tile,row);else make('span',tiles?'No tiles left':'Tile details unavailable',row,'domino-result-empty');}
  make('p',g.status==='complete'?'Match saved in your history.':g.result.points+' points this round. Keep playing to '+g.target+'.',card,'domino-result-note');
  const next=make('div',undefined,card,'domino-result-actions');
  btn(g.status==='complete'?'New match':g.mode==='solo'?'Next round':'Invite to next round',next,()=>command(g.status==='complete'?'leave':'rematch'),'primary').disabled=busy;
  btn('Back',next,()=>closeGame());
 }else{
  const controls=make('div',undefined,actions,'domino-actions');
  if(picked&&g.legal.some(m=>m.tile===picked))make('span','Tap where you want to place it.',controls,'domino-placement-hint');
  if(g.paused){if(g.pausedBy?.includes(who))btn('Resume game',controls,()=>command('resume'),'primary').disabled=busy;else make('span','Waiting for '+g.pausedBy.join(' & ')+' to resume.',controls);}
  if(g.canDraw)btn('Draw until playable',controls,()=>command('draw'),'primary').disabled=busy;
  if(g.canPass)btn('Pass turn',controls,()=>command('pass'),'primary').disabled=busy;
 }
 view.handTitle.textContent='YOUR TILES · '+g.hand.length;view.handTitle.className='label';
 const hand=view.hand;hand.className='domino-hand';hand.classList.toggle('many-tiles',g.hand.length>14);hand._tiles??=new Map();
 for(const [id,e] of hand._tiles)if(!g.hand.some(t=>t.id===id)){e.remove?.();hand._tiles.delete(id);}
 for(const tile of g.hand){
  let e=hand._tiles.get(tile.id);if(!e){e=piece(tile,hand,true);hand._tiles.set(tile.id,e);e.classList.toggle('domino-drawn',newIds.includes(tile.id));}
  const moves=g.status==='active'&&!g.paused&&g.turn===who?g.legal.filter(m=>m.tile===tile.id):[];
  e.disabled=busy||!moves.length;e.classList.toggle('playable',!!moves.length);e.classList.toggle('picked',!!moves.length&&picked===tile.id);
  e.onclick=()=>{if(busy)return;if(moves.length===1)command('play',moves[0]);else{picked=picked===tile.id?null:tile.id;render();}};
 }
 const help=slot('help');help.className='domino-zone-help domino-footer';
 btn(focused()?'Exit full screen':'Full screen',help,()=>{fullView=!fullView;show();signature='';render();},'domino-size-toggle').setAttribute('aria-label',focused()?'Exit full screen; keep game saved':'Fill screen with game');
 if(g.status==='active'||g.status==='finished'){
  btn('Leave game',help,async()=>{if(await window.OurGameUI.confirm({title:'Leave this game?',message:'This ends the match without a win. Choose Minimize to continue later.',confirmLabel:'Leave game'}))await command('leave',{},g);},'domino-leave').disabled=busy;
 }
}
function init(h){
 host=h;if(typeof setInterval!=='undefined')setInterval(updateClock,250);soundButton();$('#domino-panel').addEventListener?.('pointerdown',unlockSound);$('#domino-panel').addEventListener?.('keydown',unlockSound);$('#domino-sound').onclick=()=>{soundOn=!soundOn;try{localStorage.setItem('our-place:domino:sound',soundOn?'on':'off');}catch{}soundButton();if(soundOn)unlockSound(true);};$('#domino-open').onclick=()=>{opened=true;fullView=false;unlockSound();show();render();host.revealPanel?.('#domino-panel');};
 $('#domino-collapse').onclick=()=>closeGame();
 for(const m of ['solo','shared'])$('#domino-'+m+'-tab').onclick=()=>{mode=m;picked=null;signature='';render();};
 $('#domino-start').onclick=()=>command('create',{mode,difficulty:$('#domino-difficulty').value,target:Number($('#domino-target').value),turnSeconds:Number($('#domino-timer').value)||0},null);
 $('#domino-chat').onclick=()=>closeGame(true);

}
window.OurDomino={init,sync(s){
 if(Number.isFinite(s.version)&&who===s.who&&s.version<version)return;
 if(who!==s.who){heardMoves.clear();who=s.who;opened=false;mode='solo';picked=null;signature='';
 try{const saved=JSON.parse(localStorage.getItem('our-place:domino:'+who)||'null');if(saved){mode=saved.mode==='shared'?'shared':'solo';opened=!!saved.opened;fullView=saved.fullView!==false;}}catch{}}
 if(Number.isFinite(s.serverNow))clockOffset=s.serverNow-Date.now();version=s.version;hearMoves(s.domino??{});games=s.domino??{};if(picked&&!game()?.legal.some(m=>m.tile===picked))picked=null;render();
},reset(){drawSeen.clear();heardMoves.clear();shownResults.clear();boardObserver?.disconnect();historySignature='';view=null;$('#domino-records').replaceChildren();$('#domino-history-list').replaceChildren();who=null;games={};version=-1;signature='';opened=false;picked=null;$('#domino-game').replaceChildren();$('#domino-invitation').hidden=true;$('#domino-error').textContent='';show();}};
})();

