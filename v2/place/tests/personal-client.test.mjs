import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initial} from '../domain.mjs';
import {personalChange,personalSnapshot} from '../personal.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
function setup(){
 class Node{
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.className='';this.value='';this.ownText='';this.classList={add:c=>this.className+=' '+c};this.listeners={};}
  set textContent(v){this.ownText=v;this.children=[];}get textContent(){return this.ownText+this.children.map(n=>n.textContent).join('');}
  append(n){n.remove();n.parent=this;this.children.push(n);}after(n){this.parent?.append(n);}replaceChildren(){this.children=[];this.ownText='';}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
  setAttribute(k,v){this[k]=v;}getAttribute(k){return this[k]??null;}addEventListener(k,f){this.listeners[k]=f;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}
  querySelector(q){return walk(this).slice(1).find(n=>n.tag===q||q.startsWith('.')&&n.className.split(' ').includes(q.slice(1)))??null;}
 }
 const body=new Node('body'),account=new Node('span');account.textContent='Mahmoud';body.append(account);const nodes=new Map([['#account > span',account]]);for(const q of ['#space .wall-heading','#pinned']){const n=new Node();nodes.set(q,n);body.append(n);}
 const doc={body,createElement:t=>new Node(t),querySelector:q=>nodes.get(q)??walk(body).find(n=>n.id===q.slice(1))??null,querySelectorAll:q=>q==='#account > span'?[account]:[],listeners:{},addEventListener(k,f){this.listeners[k]=f;}};
 const c={document:doc,Intl,Date};c.window=c;vm.createContext(c);vm.runInContext(readFileSync(new URL('../public/personal.js',import.meta.url),'utf8'),c);const s=initial();let who='Mahmoud';const sync=async()=>c.OurPersonal.sync({who,personal:personalSnapshot(s,who),crown:{holder:'Mahmoud',totals:{Mahmoud:9,Safy:7},revision:0},serverNow:Date.now()});c.OurPersonal.init({command:async(t,d)=>personalChange(s,who,t,d),sync,info(){}});sync();
 return {ui:c.OurPersonal,s,doc,sync,setWho:n=>{who=n;},modal:()=>walk(body).find(n=>n.tag==='dialog'&&n.open)};
}
const button=(root,text)=>walk(root).find(n=>n.tag==='button'&&n.textContent===text);
const input=(root,label)=>walk(root).find(n=>n.tag==='label'&&n.children[0]?.textContent===label)?.children[1];
test('profile edit keeps typed bio during live updates and shows saved bio only within profile',async()=>{
 const c=setup();c.ui.open('Mahmoud');button(c.modal(),'Edit my profile').onclick();const form=c.modal().querySelector('form');input(form,'A little about you · optional').value='بحب البحر';input(form,'Birthday · optional').value='1990-05-01';await c.sync();assert.equal(c.modal().querySelector('form'),form);assert.equal(input(form,'A little about you · optional').value,'بحب البحر');await form.onsubmit({preventDefault(){}});assert.equal(c.s.personal.profiles.Mahmoud.bio,'بحب البحر');assert.ok(c.modal().textContent.includes('بحب البحر'));assert.equal(c.doc.querySelector('#account > span').textContent,'Mahmoud');button(c.modal(),'View Our Dates').onclick();assert.ok(c.modal().textContent.includes('Mahmoud’s birthday'));
 c.ui.reset();c.setWho('Safy');await c.sync();c.ui.open('Mahmoud');assert.equal(button(c.modal(),'Edit my profile'),undefined);
});
test('Our Dates creates an occasion, opens personal reminders and prevents partner edit controls',async()=>{
 const c=setup();c.ui.open('Mahmoud');button(c.modal(),'View Our Dates').onclick();button(c.modal(),'＋ Add an occasion').onclick();const form=c.modal().querySelector('form');input(form,'Occasion').value='Anniversary dinner';input(form,'Date').value='2027-09-14';input(form,'Private reminder note · only you').value='Buy flowers';await form.onsubmit({preventDefault(){}});assert.equal(c.s.personal.dates.length,1);assert.ok(c.modal().textContent.includes('Anniversary dinner'));button(c.modal(),'Open').onclick();assert.equal(input(c.modal(),'Private reminder note · only you').value,'Buy flowers');assert.ok(button(c.modal(),'Edit occasion'));c.ui.reset();c.setWho('Safy');await c.sync();c.ui.open('Safy');button(c.modal(),'Open').onclick();assert.equal(input(c.modal(),'Private reminder note · only you').value,'');assert.equal(button(c.modal(),'Edit occasion'),undefined);c.ui.reset();assert.equal(c.modal(),undefined);
});
