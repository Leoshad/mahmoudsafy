import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initial,change,project} from '../domain.mjs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const walk=n=>[n,...n.children.flatMap(walk)];
function client(s){
 const node=()=>({children:[],dataset:{},textContent:'',replaceChildren(){this.children=[];},querySelector(){return null;}});
 const el=(tag,text,parent)=>{const n=node();Object.assign(n,{tag,textContent:text??''});parent?.children.push(n);return n;};
 const root=node(),commands=[];const context={document:{activeElement:null},el,btn:(t,p,fn)=>{const n=el('button',t,p);n.onclick=fn;return n;},state:{...project(s,'Mahmoud'),who:'Mahmoud'},command:async(type,data)=>{commands.push(type);change(s,'Mahmoud',type,data);},sync:async()=>{context.state={...project(s,'Mahmoud'),who:'Mahmoud'};context.renderActivity(context.state.activity,root);}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function renderActivity('),source.indexOf("$('#space-generate')")),context);context.renderActivity(context.state.activity,root);
 return {root,commands,click:async text=>{const b=walk(root).find(n=>n.tag==='button'&&n.textContent===text);assert.ok(b,text);await b.onclick();},text:()=>walk(root).map(n=>n.textContent).join(' ')};
}
test('activity UI keeps completion in chat and publishes only through Share to wall',async()=>{
 const s=initial();change(s,'Mahmoud','quiz.launch',{host:'Echo',target:'Mahmoud',questions:[{q:'Cloud pockets?',options:['Socks','Spoons'],correct:-1}]});const c=client(s);
 assert.match(c.text(),/Echo → Mahmoud/);await c.click('Socks');assert.equal(s.items.length,0);assert.match(c.text(),/Your answers/);assert.match(c.text(),/Socks/);assert.doesNotMatch(c.text(),/points/);
 await c.click('Share to wall');assert.equal(s.items.length,1);assert.match(c.text(),/Shared to wall/);assert.deepEqual(c.commands,['quiz.answer','quiz.share']);
});
test('End closes a round directly without a save dialog or wall mutation',async()=>{
 const s=initial();change(s,'Mahmoud','quiz.launch',{host:'Echo',target:'Mahmoud',questions:[{q:'Cloud pockets?',options:['Socks','Spoons'],correct:-1}]});const c=client(s);await c.click('End');assert.equal(s.activity.status,'abandoned');assert.equal(s.items.length,0);assert.deepEqual(c.commands,['quiz.end']);assert.doesNotMatch(c.text(),/End and save/);
});
