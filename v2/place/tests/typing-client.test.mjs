import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
for(const who of ['Mahmoud','Safy'])test('typing sends only state, throttles, stops and expires for '+who,async()=>{
 const calls=[],timers=new Map(),attrs={};let id=0,active=false;const hand={classList:{toggle:(c,v)=>active=v},setAttribute:(k,v)=>attrs[k]=v};
 const c={state:{who},sessionEpoch:0,Date,Promise,$:()=>hand,api:async(path,data)=>calls.push({path,data}),setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('let typingUntil='),source.indexOf("$('#compose').addEventListener('input'")),c);
 c.sendTyping(true);c.sendTyping(true);await vm.runInContext('typingQueue',c);assert.equal(calls.length,1);assert.equal(JSON.stringify(calls[0]),JSON.stringify({path:'typing',data:{active:true}}));
 [...timers.values()].find(t=>t.ms===2000).fn();await vm.runInContext('typingQueue',c);assert.equal(calls[1].data.active,false);
 c.receiveTyping({who,active:true});assert.equal(active,false);c.receiveTyping({who:who==='Mahmoud'?'Safy':'Mahmoud',active:true});assert.equal(active,true);assert.match(attrs['aria-label'],/is typing/);[...timers.values()].find(t=>t.ms===4500).fn();assert.equal(active,false);
 c.receiveTyping({who:who==='Mahmoud'?'Safy':'Mahmoud',active:true});c.receiveTyping({who:who==='Mahmoud'?'Safy':'Mahmoud',active:false});assert.equal(active,false);
});
test('refresh success uses its indicator then disappears without footer notice; failure remains visible',async()=>{
 const src=readFileSync(new URL('../public/comfort.js',import.meta.url),'utf8'),notices=[],timers=[];const c={state:{},refreshButton:{disabled:false,setAttribute(){}},indicator:{hidden:true,setAttribute(){}},refreshHideTimer:null,clearTimeout(){},setTimeout:fn=>timers.push(fn),host:{sync:async()=>{},info:t=>notices.push(t)}};vm.createContext(c);vm.runInContext(src.slice(src.indexOf('async function refresh()'),src.indexOf('function init(h)')),c);await c.refresh();assert.equal(c.indicator.textContent,'✓');assert.equal(c.indicator.hidden,false);assert.equal(notices.length,0);timers[0]();assert.equal(c.indicator.hidden,true);c.host.sync=async()=>{throw new Error('Offline');};await c.refresh();assert.equal(notices[0],'Offline');assert.equal(c.refreshButton.disabled,false);
});
