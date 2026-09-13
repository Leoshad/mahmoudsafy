import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initial} from '../domain.mjs';
import {dominoChange,dominoSnapshot,tiles} from '../domino.mjs';
const script=readFileSync(new URL('../public/domino.js',import.meta.url),'utf8');
function client(who,state,clients,storage=new Map()){
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.style={setProperty(k,v){this[k]=v;}};this.dataset={};this.clientWidth=300;this.hidden=false;this.value='medium';this.scrollWidth=500;const set=new Set();this.classList={toggle:(k,v)=>v?set.add(k):set.delete(k),contains:k=>set.has(k)};}
  append(x){x.parentElement=this;this.children.push(x);}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(e=>e!==this);}replaceChildren(){this.children=[];}setAttribute(k,v){this[k]=v;}
 }
 const elements=new Map(),get=k=>{if(!elements.has(k))elements.set(k,new Element());return elements.get(k);};
 get('#domino-target').value='50';
 const context={document:{querySelector:get,createElement:t=>new Element(t)},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame:fn=>fn()};context.window=context;vm.createContext(context);vm.runInContext(script,context);
 let commands=0;const c={get,context,commands:()=>commands,sync(){context.OurDomino.sync({who,version:state.version,domino:dominoSnapshot(state,who)});}};clients.push(c);
 context.OurDomino.init({command:async(type,data)=>{commands++;dominoChange(state,who,type,data);},sync:async()=>clients.forEach(c=>c.sync()),goto:()=>{}});c.sync();return c;
}
const all=e=>[e,...e.children.flatMap(all)];
const click=async e=>{assert.ok(e);await e.onclick();await new Promise(r=>setImmediate(r));};
test('solo interface starts, plays and restores an open saved board without creating a new game',async()=>{
 const state=initial(),clients=[],storage=new Map(),a=client('Mahmoud',state,clients,storage);
 await click(a.get('#domino-open'));assert.equal(a.get('#domino-panel').hidden,false);assert.equal(a.get('#domino-open').hidden,true);
 await click(a.get('#domino-start'));assert.equal(a.commands(),1);assert.equal(a.get('#domino-setup').hidden,true);
 const hand=all(a.get('#domino-game')).find(e=>e.className==='domino-hand');assert.equal(hand.children.length,7);
 await click(hand.children.find(e=>!e.disabled));assert.equal(a.commands(),2);assert.ok(state.domino.solo.Mahmoud.chain.length>=1);
 const b=client('Mahmoud',state,[],storage);assert.equal(b.commands(),0);assert.equal(b.get('#domino-panel').hidden,false);
 await click(b.get('#domino-collapse'));assert.equal(b.get('#domino-panel').hidden,true);assert.equal(state.domino.solo.Mahmoud.status,'active');
});
test('shared invitation requires a click and grants only turn-based controls',async()=>{
 const state=initial(),clients=[],a=client('Mahmoud',state,clients),b=client('Safy',state,clients);
 await click(a.get('#domino-shared-tab'));await click(a.get('#domino-start'));assert.equal(state.domino.shared.status,'waiting');assert.equal(b.get('#domino-invitation').hidden,false);
 await click(b.get('#domino-invitation').children.find(e=>e.textContent==='Join'));assert.equal(state.domino.shared.status,'active');assert.equal(b.get('#domino-panel').hidden,false);
 const hand=all(b.get('#domino-game')).find(e=>e.className==='domino-hand');assert.ok(hand.children.every(e=>e.disabled));
 b.context.OurDomino.reset();assert.equal(b.get('#domino-panel').hidden,true);assert.equal(b.get('#domino-game').children.length,0);
});

test('full table fits all 28 tiles with bends, crosswise doubles and target scores',()=>{
 const state=initial();dominoChange(state,'Mahmoud','domino.create',{mode:'shared'});
 let g=state.domino.shared;dominoChange(state,'Safy','domino.accept',{game:g.id,revision:g.revision});
 g.chain=tiles();g.scores={Mahmoud:34,Safy:27};
 const a=client('Mahmoud',state,[]);a.get('#domino-shared-tab').onclick();
 const nodes=all(a.get('#domino-game')),board=nodes.find(e=>e.className==='domino-board');
 const laid=all(board).filter(e=>e.className==='domino-piece');
 assert.equal(laid.length,28);assert.ok(board.children.length>1);
 const poses=a.context.DominoTable.layout(g.chain);assert.equal(poses.length,28);
 for(const wrap of board.children){assert.ok(parseFloat(wrap.style.left)>0&&parseFloat(wrap.style.left)<board.clientWidth);assert.ok(parseFloat(wrap.style.top)>0&&parseFloat(wrap.style.top)<parseFloat(board.style.height));}
 assert.ok(poses.some(p=>p.dir===1));assert.ok(poses.some(p=>p.dir===2));
 for(const p of poses.filter(p=>p.double))assert.equal(p.angle%180,p.dir%2?0:90);
 const score=nodes.find(e=>e.className==='domino-scoreboard');
 assert.ok(all(score).some(e=>e.textContent==='Mahmoud'));assert.ok(all(score).some(e=>e.textContent==='Safy'));
 assert.ok(all(score).some(e=>e.textContent==='34/50'));assert.ok(all(score).some(e=>e.textContent==='27/50'));
});
test('table bends preserve non-overlapping tile bounds including crosswise doubles',()=>{
 const a=client('Mahmoud',initial(),[]);
 for(let shift=0;shift<28;shift++){
  const deck=tiles(),chain=deck.slice(shift).concat(deck.slice(0,shift)),poses=a.context.DominoTable.layout(chain);
  for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++){
   const p=poses[i],q=poses[j],overlapX=Math.min(p.x+p.w/2,q.x+q.w/2)-Math.max(p.x-p.w/2,q.x-q.w/2),overlapY=Math.min(p.y+p.h/2,q.y+q.h/2)-Math.max(p.y-p.h/2,q.y-q.h/2);
   assert.ok(overlapX<.001||overlapY<.001,'overlap '+shift+' '+i+' '+j);
  }
 }
});
test('tile sounds play once per new move, respect mute and preserve preference after reload',async()=>{
 const state=initial(),storage=new Map(),a=client('Mahmoud',state,[],storage);let starts=0;
 const param={setValueAtTime(){},exponentialRampToValueAtTime(){}};
 a.context.AudioContext=class {state='running';currentTime=0;destination={};createOscillator(){return {frequency:param,connect(){},disconnect(){},start(){starts++;},stop(){}};}createGain(){return {gain:param,connect(){},disconnect(){}};}};
 await click(a.get('#domino-open'));await click(a.get('#domino-start'));
 await click(a.get('#domino-sound'));await click(a.get('#domino-sound'));
 const g=state.domino.solo.Mahmoud;g.lastMove={id:'1-2',order:1,by:'Mahmoud'};state.version++;a.sync();assert.equal(starts,2);
 a.sync();assert.equal(starts,2);
 await click(a.get('#domino-sound'));g.lastMove.order=2;state.version++;a.sync();assert.equal(starts,2);
 const b=client('Mahmoud',state,[],storage);assert.equal(b.get('#domino-sound').textContent,'Muted');
 await click(a.get('#domino-sound'));a.context.document.hidden=true;g.lastMove.order=3;state.version++;a.sync();assert.equal(starts,2);
});
test('adding tiles at either end preserves every previous pose and avoids overlap',()=>{
 const a=client('Mahmoud',initial(),[]),layout=a.context.DominoTable.layout;
 for(let shift=0;shift<28;shift++){
  const deck=tiles(),chain=[];let previous=[];
  for(let n=0;n<28;n++){
   const tile={...deck[(n+shift)%28],order:n+1};if((n+shift)%3===0)chain.unshift(tile);else chain.push(tile);
   const poses=layout(chain);
   for(const old of previous){const now=poses.find(p=>p.tile.id===old.tile.id);assert.equal(now.x,old.x);assert.equal(now.y,old.y);assert.equal(now.angle,old.angle);}
   for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++){
    const p=poses[i],q=poses[j];assert.ok(Math.abs(p.x-q.x)>=(p.w+q.w)/2-.001||Math.abs(p.y-q.y)>=(p.h+q.h)/2-.001);
   }
   previous=poses;
  }
 }
});
test('draw pile shows exact hidden count and received tile; board nodes survive state updates',async()=>{
 const state=initial(),a=client('Mahmoud',state,[]);await click(a.get('#domino-open'));await click(a.get('#domino-start'));
 const g=state.domino.solo.Mahmoud;g.chain=[{id:'6-6',a:6,b:6,order:1}];state.version++;a.sync();
 let nodes=all(a.get('#domino-game'));const board=nodes.find(e=>e.className==='domino-board'),wrap=board.children.find(e=>e.className==='domino-placement');
 const x=wrap.style.left,y=wrap.style.top,count=g.stock.length;
 assert.equal(nodes.filter(e=>e.className==='domino-stock-back').length,count);
 const drawn=g.stock.pop();g.hands.Mahmoud.push(drawn);state.version++;a.sync();
 nodes=all(a.get('#domino-game'));assert.equal(nodes.find(e=>e.className==='domino-board'),board);
 assert.equal(wrap.style.left,x);assert.equal(wrap.style.top,y);
 assert.equal(nodes.filter(e=>e.className==='domino-stock-back').length,count-1);
 assert.ok(nodes.some(e=>e.classList.contains('domino-drawn')));
});
test('game refresh retains the table container and unplayed hand buttons',async()=>{
 const state=initial(),a=client('Mahmoud',state,[]);await click(a.get('#domino-open'));await click(a.get('#domino-start'));
 const get=cls=>all(a.get('#domino-game')).find(e=>e.className===cls),board=get('domino-board'),area=get('domino-table-area'),hand=get('domino-hand'),buttons=[...hand.children];
 const g=state.domino.solo.Mahmoud,tile=g.hands.Mahmoud[0];g.hands.Mahmoud.shift();g.chain.push({...tile,order:1});state.version++;a.sync();
 assert.equal(get('domino-board'),board);assert.equal(get('domino-table-area'),area);assert.equal(get('domino-hand'),hand);assert.equal(hand.children.length,6);
 assert.equal(hand.children[0],buttons[1]);assert.equal(a.get('#domino-panel').classList.contains('domino-focused'),true);
 assert.equal(board._unit,25,'opening tile uses readable full size');
 await click(a.get('#domino-chat'));assert.equal(a.get('#domino-panel').hidden,true);
});
