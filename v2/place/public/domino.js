(()=>{'use strict';
const $=s=>document.querySelector(s),make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
let host,who=null,games={},mode='solo',opened=false,busy=false,picked=null,signature='',version=-1;
const game=()=>games[mode];
let fullView=true,clockOffset=0;
function updateClock(){const g=game(),e=view?.clock;if(!e)return;e.hidden=!(g?.status==='active'&&!g.paused&&g.turnSeconds);if(e.hidden)return;const seconds=Math.max(0,Math.ceil((g.turnDeadline-(Date.now()+clockOffset))/1000));e.textContent=seconds+'s';e.classList.toggle('clock-low',seconds<=5);e.setAttribute('aria-label',g.turn+' has '+seconds+' seconds remaining');}
function focused(){return opened&&fullView&&['waiting','active','finished','complete'].includes(game()?.status);}
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
function tableLayout(chain,columns=10){
 // Connected serpentine rows, fixed spacing, crosswise doubles. Chain order never changes.
 const rows=[];let row=[],used=0;
 for(const tile of chain){const len=tile.a===tile.b?1:2;if(row.length&&used+.12+len>columns){rows.push(row);row=[];used=0;}row.push(tile);used+=(used?.12:0)+len;}if(row.length)rows.push(row);
 const out=[];
 rows.forEach((tiles,r)=>{const reverse=r%2===1;let x=reverse?columns/2:-columns/2;for(const tile of tiles){const double=tile.a===tile.b,w=double?1:2,h=double?2:1;x+=(reverse?-1:1)*w/2;out.push({tile,x,y:r*2.35,dir:reverse?2:0,len:w,cross:h,double,w,h,angle:(reverse?180:0)+(double?90:0)});x+=(reverse?-1:1)*(w/2+.12);}});
 return out;
}
function layoutBounds(poses){return {minX:Math.min(...poses.map(p=>p.x-p.w/2))-.35,maxX:Math.max(...poses.map(p=>p.x+p.w/2))+.35,minY:Math.min(...poses.map(p=>p.y-p.h/2)),maxY:Math.max(...poses.map(p=>p.y+p.h/2))};}
function placementChoices(g,columns=10){
 if(!picked||busy||g?.status!=='active'||g.paused||g.turn!==who)return [];
 const tile=g.hand.find(t=>t.id===picked);if(!tile)return [];
 const chain=g.chain.map((t,i)=>({...t,order:t.order??i+1})),order=Math.max(0,...chain.map(t=>t.order))+1;
 return g.legal.filter(m=>m.tile===picked).map(move=>{
  let {a,b}=tile;
  if(chain.length&&((move.side==='left'&&b!==chain[0].a)||(move.side==='right'&&a!==chain.at(-1).b)))[a,b]=[b,a];
  const next={...tile,a,b,order},future=move.side==='left'?[next,...chain]:[...chain,next];
  return {...tableLayout(future,columns).find(p=>p.tile.id===tile.id),move};
 });
}
function tableScene(chain,g,columns){
 const moves=placementChoices(g,columns),projected=[...chain];
 for(const p of moves){const tile={...p.tile,id:'preview-'+p.move.side};if(p.move.side==='left')projected.unshift(tile);else projected.push(tile);}
 const all=tableLayout(projected,columns),poses=all.filter(p=>!p.tile.id.startsWith('preview-')),choices=moves.map(move=>({...all.find(p=>p.tile.id==='preview-'+move.move.side),tile:move.tile,move:move.move}));return {poses,choices};
}
function arrangeBoard(board,chain,lastMove,key){
 const width=board.clientWidth||280,height=focused()?(board.clientHeight||300):Math.max(300,Math.min(400,width*1.15)),layoutKey=width+':'+height+':'+key+':'+chain.length+':'+game()?.status+':'+!!game()?.paused+':'+picked+':'+busy;
 if(board.dataset.layout===layoutKey)return;board.dataset.layout=layoutKey;
 if(!focused())board.style.height=height+'px';
 if(!chain.length){if(!board._empty)board._empty=make('span','Your table is ready.',board,'domino-board-empty');return;}
 board._empty?.remove?.();board._empty=null;
 const measure=columns=>{const {poses,choices}=tableScene(chain,game(),columns),bounds=layoutBounds([...poses,...choices]);return {columns,poses,choices,...bounds,fit:Math.min(32,(width-20)/(bounds.maxX-bounds.minX),(height-20)/(bounds.maxY-bounds.minY))};};
 let layout=measure(board._columns||10);
 // Reflow only when the current row width would force unreadable pieces.
 if(layout.fit<24||!board._columns){for(let columns=6;columns<=22;columns+=.5){const candidate=measure(columns);if(candidate.fit>layout.fit+.01)layout=candidate;}}
 // Reserve the minimum readable height for this width, including after rotation.
 let required=Infinity,minimumLayout=layout;for(let columns=6;columns<=22;columns+=.5){const candidate=measure(columns);if((candidate.maxX-candidate.minX)*20<=width-20){const need=(candidate.maxY-candidate.minY)*20+20;if(need<required){required=need;minimumLayout=candidate;}}}
 if(Number.isFinite(required))board.style.minHeight=Math.ceil(required)+'px';if(layout.fit<20)layout=minimumLayout;
 board._columns=layout.columns;
 const {poses,choices,minX,maxX,minY,maxY}=layout;
 const unit=Math.max(20,layout.fit);board._unit=unit;board.style.setProperty('--domino-unit',unit+'px');
 board._cx=(width-(minX+maxX)*unit)/2;board._cy=(height-(minY+maxY)*unit)/2;
 board._links??=make('div',undefined,board,'domino-connections');
 let paths='';for(let i=1;i<poses.length;i++){const p=poses[i-1],q=poses[i],d=p.dir===0?1:-1,nd=q.dir===0?1:-1,x1=board._cx+(p.x+d*p.w/2)*unit,y1=board._cy+p.y*unit,x2=board._cx+(q.x-nd*q.w/2)*unit,y2=board._cy+q.y*unit;const bend=d===1?Math.max(x1,x2)+unit*.25:Math.min(x1,x2)-unit*.25;paths+='<path d="M '+x1+' '+y1+(p.y===q.y?' L '+x2+' '+y2:' H '+bend+' V '+y2+' H '+x2)+'"/>';}
 board._links.innerHTML='<svg width="100%" height="100%" aria-hidden="true"><g fill="none" stroke="#c6b68a" stroke-opacity=".65" stroke-width="1.5" stroke-linejoin="round">'+paths+'</g></svg>';
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
  make('p',g.result.reason==='blocked'?(winner?'Blocked round · '+(g.result.scoring==='opponent-total'?other+'’s remaining pips: '+totals[other]+' = '+g.result.points+' points':totals[other]+' − '+totals[winner]+' = '+g.result.points+' points'):'Blocked round · '+g.players.map(n=>totals[n]).join(' = ')+' · no points awarded'):'Empty hand · '+totals[other]+' remaining pips = '+g.result.points+' points',card,'domino-result-calculation');
  const evidence=make('div',undefined,card,'domino-result-hands');
  for(const name of g.players){const group=make('div',undefined,evidence,'domino-result-hand');make('strong',name+' · '+totals[name]+' pips',group);const row=make('div',undefined,group,'domino-result-tiles');row.setAttribute('aria-label',name+' remaining tiles');const tiles=g.result.hands?.[name];if(tiles?.length)for(const tile of tiles)piece(tile,row);else make('span',tiles?'No tiles left':'Tile details unavailable',row,'domino-result-empty');}
  make('p',g.status==='complete'?'Match saved in your history.':g.result.points+' points this round. Keep playing to '+g.target+'.',card,'domino-result-note');
  const next=make('div',undefined,card,'domino-result-actions');
  btn(g.status==='complete'?'New match':'Next round',next,()=>command('rematch'),'primary').disabled=busy;
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
 host=h;window.OurGameUI?.registerChat?.($('.domino-head'),()=>closeGame(true));if(typeof setInterval!=='undefined')setInterval(updateClock,250);soundButton();$('#domino-panel').addEventListener?.('pointerdown',unlockSound);$('#domino-panel').addEventListener?.('keydown',unlockSound);$('#domino-sound').onclick=()=>{soundOn=!soundOn;try{localStorage.setItem('our-place:domino:sound',soundOn?'on':'off');}catch{}soundButton();if(soundOn)unlockSound(true);};$('#domino-open').onclick=()=>{opened=true;fullView=false;unlockSound();show();render();host.revealPanel?.('#domino-panel');};
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


