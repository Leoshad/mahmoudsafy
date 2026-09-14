import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {initial,change} from '../domain.mjs';
const walk=e=>[e,...e.children.flatMap(walk)];
function client(s){
 let doc;
 class Node{
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.value='';this.className='';this.scrollTop=0;this.textContent='';}
  append(n){n.remove();n.parentElement=this;this.children.push(n);}
  insertBefore(n,b){n.remove();n.parentElement=this;const i=this.children.indexOf(b);this.children.splice(i<0?this.children.length:i,0,n);}
  remove(){if(this.parentElement){const p=this.parentElement;p.children=p.children.filter(x=>x!==this);this.parentElement=null;}}
  replaceChildren(){for(const n of [...this.children])n.remove();}
  setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}
  matches(q){if(q.startsWith('.'))return this.className.split(' ').includes(q.slice(1));if(q.startsWith('[data-field='))return this.dataset.field===q.match(/"(.*?)"/)[1];return this.tag===q;}
  querySelectorAll(q){return walk(this).slice(1).filter(n=>n.matches(q));}querySelector(q){return this.querySelectorAll(q)[0]??null;}
  contains(n){return walk(this).includes(n);}get isConnected(){return !!this.parentElement;}getBoundingClientRect(){return {top:0,bottom:100};}
  focus(){doc.activeElement=this;}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}showModal(){this.open=true;}close(){this.open=false;}reset(){}
 }
 const nodes=new Map(),$=q=>{if(!nodes.has(q))nodes.set(q,new Node());return nodes.get(q);};doc={querySelector:$,createElement:t=>new Node(t),activeElement:null};
 const el=(t,text,p,cls)=>{const n=new Node(t);n.textContent=text??'';n.className=cls??'';p?.append(n);return n;};const failures=[],btn=(t,p,fn,cls)=>{const n=el('button',t,p,cls);n.onclick=async()=>{try{await fn();}catch(e){failures.push(e);}};return n;};
 let wall,filter='All',tab='',commands=[];
 const context={document:doc,structuredClone,Intl,Date,crypto:{randomUUID},history:{back:()=>tab='space',replaceState(){}}};context.window=context;vm.createContext(context);vm.runInContext(readFileSync(new URL('../public/wall.js',import.meta.url),'utf8'),context);
 wall=context.OurWall({getState:()=>({...s,who:'Mahmoud'}),api:async()=>({}),command:async(type,data,id)=>{commands.push({type,data,id});change(s,'Mahmoud',type,data);},sync:async()=>wall.paint(),goto:t=>tab=t,info(){},error:e=>failures.push(e),el,btn,categories:['Idea','Photo','Plan','Agreement'],getFilter:()=>filter,setFilter:v=>filter=v,openSource(){}});
 return {$,wall,failures,commands,tab:()=>tab,doc};
}
const button=(root,text)=>walk(root).find(n=>n.tag==='button'&&n.textContent===text);
test('wall preserves typed comment and open thread during a partner update, then sends once',async()=>{
 const s=initial();change(s,'Safy','item.save',{type:'Idea',title:'Visit together'});const c=client(s);c.wall.paint();const card=c.$('#items').children[0];
 await button(card,'Comment').onclick();const textarea=card.querySelector('textarea');textarea.value='I would love that';textarea.oninput();textarea.focus();
 change(s,'Safy','item.like',{id:s.items[0].id,value:true});c.wall.paint();assert.equal(c.$('#items').children[0],card);assert.equal(card.querySelector('textarea').value,'I would love that');assert.equal(card.querySelector('.wall-comments').open,true);
 const form=card.querySelector('textarea').parentElement;await form.onsubmit({preventDefault(){}});assert.equal(s.items[0].comments[0].text,'I would love that');assert.equal(card.querySelector('textarea').value,'');assert.deepEqual(c.failures,[]);
});
test('editor can convert photo post to plan without losing image and returns to wall',async()=>{
 const s=initial(),photo=randomUUID();change(s,'Safy','item.save',{type:'Photo',title:'Our trip',image:photo});const c=client(s);c.wall.edit(s.items[0]);assert.equal(c.tab(),'editor');assert.equal(c.$('#wall-previews').children.length,1);
 c.$('#item-type').value='Plan';c.$('#item-type').onchange();assert.equal(c.$('#wall-steps-editor').hidden,false);c.$('#wall-steps').value='Pick a date\nBook tickets';await c.$('#item-form').onsubmit({preventDefault(){}});assert.equal(s.items[0].type,'Plan');assert.equal(s.items[0].steps.length,2);assert.equal(s.items[0].image,photo);assert.equal(c.tab(),'space');assert.deepEqual(c.failures,[]);
});
test('agreement guidance is conditional and empty photo posts require attachment',async()=>{
 const c=client(initial());c.wall.edit();c.$('#item-type').value='Photo';c.$('#item-type').onchange();assert.equal(c.$('#wall-agreement-note').hidden,true);await c.$('#item-form').onsubmit({preventDefault(){}});assert.equal(c.commands.length,0);
 c.$('#item-type').value='Agreement';c.$('#item-type').onchange();assert.equal(c.$('#wall-agreement-note').hidden,false);
});
test('tab navigation and browser back restore each scrolling position',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),start=source.indexOf('const tabPositions={};'),end=source.indexOf("history.replaceState({placeTab:'chat'}",start);
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{scrollTop:0});return elements.get(id);};const context={$,window:{},document:{querySelectorAll:()=>[]},history:{pushState(){}},paintItems(){},paint(){},activities:()=>[]};
 vm.createContext(context);vm.runInContext("let tab='space';"+source.slice(start,end)+';this.go=goto;',context);
 $('.shell').scrollTop=650;context.go('editor');assert.equal($('.shell').scrollTop,0);$('.shell').scrollTop=95;context.go('space',true);assert.equal($('.shell').scrollTop,650);
 context.go('together');$('.shell').scrollTop=430;context.go('space');assert.equal($('.shell').scrollTop,650);context.go('together',true);assert.equal($('.shell').scrollTop,430);
});
