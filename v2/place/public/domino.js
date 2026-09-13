(()=>{'use strict';
const $=s=>document.querySelector(s),make=(tag,text,root,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;root?.append(e);return e;};
let host,who=null,games={},mode='solo',opened=false,busy=false,picked=null,signature='',version=-1;
const game=()=>games[mode];
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
function invite(){
 const g=games.shared,root=$('#domino-invitation');root.replaceChildren();root.hidden=!(g?.status==='waiting'&&g.owner!==who);
 if(root.hidden)return;make('span',g.owner+' invited you to Dominoes.',root);
 btn('Join',root,async()=>{mode='shared';opened=true;host.goto('together');await command('accept',{},g);show();},'primary').disabled=busy;
 btn('Not now',root,()=>command('decline',{},g)).disabled=busy;
}
function render(){
 show();invite();
 const g=game(),key=JSON.stringify([g,mode,busy,picked]);
 $('#domino-solo-tab').classList.toggle('selected',mode==='solo');$('#domino-shared-tab').classList.toggle('selected',mode==='shared');
 $('#domino-open-note').textContent=games.shared?.status==='active'?'Your shared game is saved.':games.solo?.status==='active'?'Your solo game is saved.':'A quiet table. A little competition.';
 if(key===signature)return;signature=key;
 const root=$('#domino-game');root.replaceChildren();
 const live=g&&['waiting','active','finished'].includes(g.status);
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
 const score=make('div',undefined,root,'domino-score');make('span','ROUND '+g.round,score);for(const name of g.players)make('span',name+' · '+g.scores[name]+' pts',score);
 const status=g.status==='finished'?(g.result.winner?g.result.winner+' wins · +'+g.result.points+' points':'Draw · equal remaining pips'):g.turn===who?'Your turn':g.turn+'’s turn';
 make('p',status,root,'domino-turn').setAttribute('role','status');
 const meta=make('div',undefined,root,'domino-table-meta');make('span',g.opponent+' · '+g.opponentCount+' tiles',meta);make('span','Draw pile · '+g.stockCount,meta);
 const ends=make('div',undefined,root,'domino-ends');make('span',g.chain.length?'Left end · '+g.chain[0].a:'Place any tile to start',ends);if(g.chain.length)make('span','Right end · '+g.chain.at(-1).b,ends);
 const board=make('div',undefined,root,'domino-board');board.setAttribute('aria-label','Played tiles, from left to right');
 if(!g.chain.length)make('span','Your table is ready.',board,'domino-board-empty');else for(const tile of g.chain)piece(tile,board);
 if(g.last?.side==='right')requestAnimationFrame(()=>{board.scrollLeft=board.scrollWidth;});
 make('p',g.last?.text||'',root,'domino-last');
 if(g.status==='finished'){
  if(g.result.reason==='blocked')make('p','Blocked table · '+g.players.map(n=>n+': '+g.result.totals[n]+' pips').join(' / '),root,'muted');
  btn(g.mode==='solo'?'Next round':'Invite to next round',root,()=>command('rematch'),'primary').disabled=busy;
  btn('Finish game',root,()=>command('leave')).disabled=busy;
 }else{
  const controls=make('div',undefined,root,'domino-actions');
  if(picked&&g.legal.some(m=>m.tile===picked)){make('span','Choose an end:',controls);for(const move of g.legal.filter(m=>m.tile===picked))btn(move.side==='left'?'← Left':'Right →',controls,()=>command('play',move),'primary').disabled=busy;}
  if(g.canDraw)btn('Draw a tile',controls,()=>command('draw'),'primary').disabled=busy;
  if(g.canPass)btn('Pass turn',controls,()=>command('pass'),'primary').disabled=busy;
 }
 make('div','YOUR TILES · '+g.hand.length,root,'label');
 const hand=make('div',undefined,root,'domino-hand');
 for(const tile of g.hand){
  const e=piece(tile,hand,true),moves=g.legal.filter(m=>m.tile===tile.id);
  e.disabled=busy||!moves.length;e.classList.toggle('playable',!!moves.length);e.classList.toggle('picked',picked===tile.id);
  e.onclick=()=>{if(moves.length===1)command('play',moves[0]);else{picked=picked===tile.id?null:tile.id;signature='';render();}};
 }
 if(g.status==='active'){
  make('p',g.turn===who?(g.legal.length?'Tap a highlighted tile. Choose an end if both match.':g.canDraw?'No match yet. Draw until you can play.':'No tiles to draw. Pass your turn.'):'Your tiles stay private. Wait for your turn.',root,'domino-help');
  const tools=make('details',undefined,root,'domino-game-tools');make('summary','Game options',tools);btn('Leave game',tools,()=>command('leave')).disabled=busy;
 }
}
function init(h){
 host=h;$('#domino-open').onclick=()=>{opened=true;show();render();};
 $('#domino-collapse').onclick=()=>{opened=false;show();};
 for(const m of ['solo','shared'])$('#domino-'+m+'-tab').onclick=()=>{mode=m;picked=null;signature='';render();};
 $('#domino-start').onclick=()=>command('create',{mode,difficulty:$('#domino-difficulty').value},null);
 $('#domino-chat').onclick=()=>host.goto('chat');
}
window.OurDomino={init,sync(s){
 if(Number.isFinite(s.version)&&who===s.who&&s.version<version)return;
 if(who!==s.who){who=s.who;opened=false;mode='solo';picked=null;signature='';
 try{const saved=JSON.parse(localStorage.getItem('our-place:domino:'+who)||'null');if(saved){mode=saved.mode==='shared'?'shared':'solo';opened=!!saved.opened;}}catch{}}
 version=s.version;games=s.domino??{};if(picked&&!game()?.legal.some(m=>m.tile===picked))picked=null;render();
},reset(){who=null;games={};version=-1;signature='';opened=false;picked=null;$('#domino-game').replaceChildren();$('#domino-invitation').hidden=true;$('#domino-error').textContent='';show();}};
})();
