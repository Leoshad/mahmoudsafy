import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const delivery=source.slice(source.indexOf('async function deliver(m,'),source.indexOf("$('#composer').onsubmit"));
function harness({failMessage=false,failAI=false,failSync=false}={}){
 const calls=[],notices=[],pending=new Map();
 const ctx=vm.createContext({pending,state:{who:'Mahmoud'},sessionEpoch:0,delivering:new Set(),saveOutbox:()=>true,removeOutbox(){},paintFeed(){},info:t=>notices.push(t),crypto:{randomUUID:()=> 'stable-ai-request'},command:async(type,data,id)=>{calls.push({type,id});if(type==='message'&&failMessage)throw Error('Offline');if(type==='ai.ask'&&failAI)throw Error('AI unavailable');},sync:async()=>{if(failSync)throw Error('Snapshot timeout');}});
 vm.runInContext(delivery+';this.deliver=deliver',ctx);return {ctx,calls,notices};
}
test('confirmed chat stays sent when the following state refresh fails; no retry affordance',async()=>{
 const h=harness({failSync:true}),m={author:'Mahmoud',id:'message',text:'hello',payload:{text:'hello'},ask:true};await h.ctx.deliver(m);
 assert.equal(m.status,'sent');assert.equal(h.calls.filter(x=>x.type==='ai.ask').length,1);assert.match(h.notices[0],/Message sent/);
});
test('a failed human message stays retryable and never calls AI',async()=>{
 const h=harness({failMessage:true}),m={author:'Mahmoud',id:'message',payload:{text:'hello'},ask:true};await h.ctx.deliver(m);
 assert.equal(m.status,'failed-local');assert.equal(h.calls.length,1);
});
test('an AI failure cannot relabel a confirmed human message as failed',async()=>{
 const h=harness({failAI:true}),m={author:'Mahmoud',id:'message',text:'hello',payload:{text:'hello'},ask:true};await h.ctx.deliver(m);
 assert.equal(m.status,'sent');assert.match(h.notices[0],/Message sent/);
});
test('repeated delivery uses the same AI idempotency key',async()=>{
 const h=harness(),m={author:'Mahmoud',id:'message',text:'hello',payload:{text:'hello'},ask:true};await h.ctx.deliver(m);await h.ctx.deliver(m);
 const ids=h.calls.filter(x=>x.type==='ai.ask').map(x=>x.id);assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.ok(ids[0]);
});
test('reading anchor survives prepends and changing content below',()=>{
 const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/scroll.js',import.meta.url),'utf8')+';this.scroll=PlaceScroll',ctx);
 let y=200;const row={dataset:{message:'reading'},getBoundingClientRect:()=>({top:y-root.scrollTop,bottom:y-root.scrollTop+100})};
 const root={scrollTop:220,scrollHeight:2000,clientHeight:600,getBoundingClientRect:()=>({top:0}),querySelectorAll:()=>[row]};
 const mark=ctx.scroll.capture(root);y+=500;root.scrollHeight+=500;ctx.scroll.restore(root,mark);assert.equal(root.scrollTop,720);
 const next=ctx.scroll.capture(root);root.scrollHeight+=300;ctx.scroll.restore(root,next);assert.equal(root.scrollTop,720);
 root.scrollTop=root.scrollHeight-root.clientHeight;const bottom=ctx.scroll.capture(root);root.scrollHeight+=100;ctx.scroll.restore(root,bottom);assert.equal(root.scrollTop,root.scrollHeight);
});
test('message timestamps distinguish days and handle missing dates honestly',()=>{
 const start=source.indexOf('function messageDate('),end=source.indexOf('function paintFeed()',start);
 const ctx=vm.createContext({Intl,Date});vm.runInContext(source.slice(start,end),ctx);
 assert.equal(ctx.dayLabel(new Date().toISOString()),'Today');
 const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);assert.equal(ctx.dayLabel(yesterday.toISOString()),'Yesterday');
 assert.notEqual(ctx.dayKey('2025-01-01T12:00:00Z'),ctx.dayKey('2025-01-02T12:00:00Z'));
 assert.equal(ctx.dayLabel(undefined),'Date unavailable');
});

test('Echo emphasis renders safely without stars while human text stays literal',()=>{
 const start=source.indexOf('function renderMessageText('),end=source.indexOf('function paintWallpaper()',start);
 const node=()=>({children:[],textContent:'',append(n){this.children.push(n);},replaceChildren(){this.children=[];}});
 const document={createElement:tag=>({...node(),tag}),createTextNode:text=>({textContent:text})},ctx=vm.createContext({document});
 vm.runInContext(source.slice(start,end),ctx);const p=node();
 ctx.renderMessageText(p,{author:'Echo',text:'Hello **<img onerror=alert(1)>** world'});
 assert.equal(p.children[1].tag,'strong');assert.equal(p.children[1].textContent,'<img onerror=alert(1)>');
 assert.equal(p.children.map(n=>n.textContent).join(''),'Hello <img onerror=alert(1)> world');
 ctx.renderMessageText(p,{author:'Safy',text:'Keep **my stars**'});assert.equal(p.textContent,'Keep **my stars**');
});

