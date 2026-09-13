import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initial} from '../domain.mjs';
import {dominoChange,dominoSnapshot} from '../domino.mjs';
const script=readFileSync(new URL('../public/domino.js',import.meta.url),'utf8');
function client(who,state,clients,storage=new Map()){
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.value='medium';this.scrollWidth=500;const set=new Set();this.classList={toggle:(k,v)=>v?set.add(k):set.delete(k),contains:k=>set.has(k)};}
  append(x){this.children.push(x);}replaceChildren(){this.children=[];}setAttribute(k,v){this[k]=v;}
 }
 const elements=new Map(),get=k=>{if(!elements.has(k))elements.set(k,new Element());return elements.get(k);};
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
