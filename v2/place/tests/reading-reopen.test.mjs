import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const block=app.slice(app.indexOf('let readingOwner='),app.indexOf('const tabPositions='));
function open(store,who='Mahmoud',missing=false){let mark={id:'old-photo',offset:-125,top:740,end:false},restored,requests=0;const events={};let present=!missing;const root={getClientRects:()=>[1],querySelectorAll:()=>present?[{dataset:{message:'old-photo'}}]:[]};const c={state:{who,messages:[{id:'new',sequence:20}]},tab:'chat',sessionEpoch:0,older:[],localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},$:()=>root,PlaceScroll:{capture:()=>mark,hold:(_,m)=>({stop(){},restore(){restored=m;}})},setTimeout:()=>1,window:{addEventListener:(t,f)=>events[t]=f},document:{hidden:false,addEventListener:(t,f)=>events[t]=f},api:async()=>{requests++;return [{id:'old-photo',sequence:1}];},paintFeed:()=>present=true};vm.createContext(c);vm.runInContext(block,c);return {c,events,setMark:m=>mark=m,restored:()=>restored,requests:()=>requests};}
test('close and reopen restores saved photo offset, including older history',async()=>{const store=new Map(),first=open(store);first.c.saveReading();const reopened=open(store,'Mahmoud',true);await reopened.c.restoreReading();assert.equal(reopened.requests(),1);assert.equal(reopened.restored().id,'old-photo');assert.equal(reopened.restored().offset,-125);assert.equal(reopened.restored().end,false);});
test('latest user scroll replaces bookmark and accounts stay separate',async()=>{const store=new Map(),first=open(store);first.c.saveReading();first.setMark({id:'another',offset:-30,top:900,end:false});first.events.pagehide();const next=open(store);await next.c.restoreReading();assert.equal(next.restored().id,'another');const safy=open(store,'Safy');await safy.c.restoreReading();assert.equal(safy.restored(),undefined);});
test('startup scroll cannot overwrite bookmark before images settle',async()=>{const store=new Map(),first=open(store);first.c.saveReading();const next=open(store);await next.c.restoreReading();next.setMark({id:'wrong',offset:0,top:0});next.c.saveReading();assert.equal(JSON.parse(store.get('our-place:reading:v2:Mahmoud')).id,'old-photo');next.events.touchstart();next.c.saveReading();assert.equal(JSON.parse(store.get('our-place:reading:v2:Mahmoud')).id,'wrong');});
test('pull refresh calls reload path exactly once, not passive state sync',async()=>{const src=readFileSync(new URL('../public/comfort.js',import.meta.url),'utf8');let refreshes=0,syncs=0;const c={state:{},refreshButton:{disabled:false},host:{refresh:async()=>refreshes++,sync:async()=>syncs++,info(){}}};vm.createContext(c);vm.runInContext(src.slice(src.indexOf('async function refresh()'),src.indexOf('function init(h)')),c);await c.refresh();assert.equal(refreshes,1);assert.equal(syncs,0);});

test('user movement cancels a pending history restore before it can pull chat back',async()=>{
 const store=new Map(),first=open(store);first.c.saveReading();const next=open(store,'Mahmoud',true);
 let resolve;next.c.api=()=>new Promise(r=>resolve=r);const loading=next.c.restoreReading();
 next.events.touchstart();next.setMark({id:'user-position',offset:-12,top:1500,end:false});next.c.saveReading();
 resolve([{id:'old-photo',sequence:1}]);await loading;
 assert.equal(next.restored(),undefined);assert.equal(next.c.older.length,0);
 assert.equal(JSON.parse(store.get('our-place:reading:v2:Mahmoud')).id,'user-position');
});
test('reopening at the latest messages preserves end and does not fetch an old anchor',async()=>{
 const store=new Map(),first=open(store);first.setMark({id:'old-photo',offset:0,top:740,end:true});first.c.saveReading();
 const next=open(store,'Mahmoud',true);await next.c.restoreReading();assert.equal(next.requests(),0);assert.equal(next.restored().end,true);
});
test('end restore follows late layout growth and stops on user interaction',()=>{
 const events={},root={isConnected:true,scrollTop:0,scrollHeight:1000,getClientRects:()=>[1],addEventListener:(t,f)=>events[t]=f,removeEventListener(){}};
 const c={window:{addEventListener:(t,f)=>events[t]=f,removeEventListener(){}},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 vm.createContext(c);vm.runInContext(readFileSync(new URL('../public/scroll.js',import.meta.url),'utf8')+';globalThis.scroll=PlaceScroll;',c);
 const hold=c.scroll.hold(root,{id:'old-photo',offset:0,top:740,end:true},true);hold.restore();assert.equal(root.scrollTop,1000);
 root.scrollHeight=1400;events.load();assert.equal(root.scrollTop,1400);
 events.touchstart();root.scrollTop=300;root.scrollHeight=1600;events.load();assert.equal(root.scrollTop,300);
});

test('leaving chat saves its current position before hiding it, then refresh in Together restores it',async()=>{
 for(const end of [true,false]){
  const store=new Map(),first=open(store);first.c.saveReading();
  first.setMark({id:'chosen-position',offset:-18,top:1600,end});
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{scrollTop:0,hidden:false});return nodes.get(id);};
  first.c.$=id=>id==='#timeline'?{getClientRects:()=>node('#chat').hidden?[]:[1]}:node(id);
  Object.assign(first.c,{tabPositions:{},history:{pushState(){}},sendTyping(){},historyHold:null,activities:()=>[],document:{querySelectorAll:()=>[]}});
  vm.runInContext(app.slice(app.indexOf('function goto('),app.indexOf("if('scrollRestoration' in history)")),first.c);
  first.c.goto('together');first.events.pagehide();
  assert.equal(JSON.parse(store.get('our-place:reading:v2:Mahmoud')).id,'chosen-position');
  const next=open(store);await next.c.restoreReading();assert.equal(next.restored().id,'chosen-position');assert.equal(next.restored().end,end);
 }
});

test('legacy stuck bookmark is ignored without deleting conversation data',async()=>{
 const store=new Map([['our-place:reading:v1:Mahmoud',JSON.stringify({id:'stuck',offset:0,top:400,end:false})]]);
 const next=open(store);await next.c.restoreReading();assert.equal(next.restored(),undefined);assert.equal(next.requests(),0);
 next.setMark({id:'latest',offset:0,top:1000,end:true});next.c.saveReading();
 const again=open(store);await again.c.restoreReading();assert.equal(again.restored().end,true);
 assert.ok(store.has('our-place:reading:v1:Mahmoud'));
});

test('returning from Together restores bookmark after hidden timeline loses its scroll offset',async()=>{
 for(const end of [false,true]){
  const store=new Map(),h=open(store);h.setMark({id:'old-photo',offset:-18,top:1600,end});
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{scrollTop:0,hidden:false});return nodes.get(id);};
  const timeline={getClientRects:()=>node('#chat').hidden?[]:[1],querySelectorAll:()=>[{dataset:{message:'old-photo'}}]};
  h.c.$=id=>id==='#timeline'?timeline:node(id);
  Object.assign(h.c,{tabPositions:{},history:{pushState(){}},sendTyping(){},historyHold:null,activities:()=>[],paint(){h.setMark({id:'wrong-after-layout',offset:0,top:0,end:false});},error(e){throw e;},document:{querySelectorAll:()=>[]}});
  vm.runInContext(app.slice(app.indexOf('function goto('),app.indexOf("if('scrollRestoration' in history)")),h.c);
  await h.c.restoreReading();h.events.touchstart();h.c.goto('together');h.setMark({id:'wrong-after-layout',offset:0,top:0,end:false});
  h.c.goto('chat');await Promise.resolve();assert.equal(h.restored().id,'old-photo');assert.equal(h.restored().top,1600);assert.equal(h.restored().end,end);
 }
});

test('startup return to Together preserves pending reading position across reopening',async()=>{
 const store=new Map(),first=open(store);first.c.saveReading();
 const h=open(store,'Mahmoud',true);let resolve;
 h.c.api=()=>new Promise(r=>resolve=r);const loading=h.c.restoreReading();
 h.setMark({id:'transient-latest',offset:0,top:2500,end:true});
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{scrollTop:0,hidden:false});return nodes.get(id);};
 const timeline={getClientRects:()=>node('#chat').hidden?[]:[1],contains:()=>false,querySelectorAll:()=>[{dataset:{message:'old-photo'}}]};
 h.c.$=id=>id==='#timeline'?timeline:node(id);
 Object.assign(h.c,{history:{pushState(){}},sendTyping(){},historyHold:null,activities:()=>[],paint(){},error(e){throw e;},document:{querySelectorAll:()=>[]}});
 vm.runInContext(app.slice(app.indexOf('const tabPositions='),app.indexOf("if('scrollRestoration' in history)")),h.c);
 h.events.touchstart({target:{}});h.c.goto('together');h.events.pagehide();
 resolve([{id:'old-photo',sequence:1}]);await loading;
 assert.equal(h.restored(),undefined);assert.equal(h.c.older.length,0);
 assert.equal(JSON.parse(store.get('our-place:reading:v2:Mahmoud')).id,'old-photo');
 h.c.goto('chat');await Promise.resolve();assert.equal(h.restored().id,'old-photo');assert.equal(h.restored().offset,-125);
 const reopened=open(store);await reopened.c.restoreReading();assert.equal(reopened.restored().id,'old-photo');
});
