import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function fixture(storage=new Map()){let clock=20000,id=0,pending=null;const timers=new Map(),nodes=[],events={},windowEvents={};class Node{constructor(){this.children=[];this.handlers={};this.style={setProperty(){}};this.classList={add(){}};this.offsetWidth=286;this.offsetHeight=90;this.attrs={};}append(...n){this.children.push(...n);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,f){this.handlers[k]=f;}contains(n){return this===n||this.children.includes(n);}getBoundingClientRect(){return {left:150,top:40,bottom:84};}querySelector(){return this.children[0];}focus(){}remove(){this.removed=true;}}
const splash={hidden:true},trigger=new Node(),body=new Node(),document={body,hidden:false,querySelector:s=>s==='#welcome-splash'?splash:trigger,createElement:()=>{const n=new Node();nodes.push(n);return n;},createTextNode:s=>s,addEventListener(k,f){events[k]=f;}};const window={addEventListener(k,f){windowEvents[k]=f;}};const ctx={document,window,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date:{now:()=>clock},crypto:{randomUUID:()=>String(++id)},innerWidth:390,innerHeight:800,matchMedia:()=>({matches:true}),navigator:{},setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},clearTimeout:key=>timers.delete(key)};vm.runInNewContext(readFileSync(new URL('../public/buzz.js',import.meta.url),'utf8'),ctx);const calls=[];const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');Object.assign(ctx,{info(){},api:async(path,data)=>{if(path==='buzz/pending')return {event:pending};calls.push(data);return {event:{...data,from:'Mahmoud',at:clock,to:'Safy'}};},command(){},sync(){},goto(){}});vm.runInNewContext(app.slice(app.indexOf('window.OurComfort?.init('),app.indexOf('sync().then(connect)')),ctx);window.OurBuzz.sync({who:'Mahmoud'});return {body,document,splash,events,windowEvents,setPending:event=>pending=event,finish(){const entry=[...timers].find(([,t])=>[2400,3200,3500].includes(t.ms));assert.ok(entry,'effect must be running');timers.delete(entry[0]);entry[1].fn();},buzz:window.OurBuzz,trigger,picker:nodes[0],choices:nodes.find(n=>n.className==='buzz-choices'),calls,timers,storage,advance:(ms=11000)=>clock+=ms};}
test('quick tap sends default; 450ms hold opens without sending; selected effect persists per account',async()=>{const f=fixture();await f.trigger.onclick();await Promise.resolve();assert.equal(f.calls[0].kind,'electric');f.advance();f.trigger.handlers.pointerdown({button:0,clientX:0,clientY:0});const hold=[...f.timers.values()].find(t=>t.ms===450);assert.ok(hold);hold.fn();f.trigger.handlers.pointerup();await f.trigger.onclick();assert.equal(f.calls.length,1);assert.equal(f.picker.hidden,false);await f.choices.children[4].onclick();assert.equal(f.calls.at(-1).kind,'need');assert.equal(f.trigger.textContent,'🔔');f.buzz.reset();f.buzz.sync({who:'Mahmoud'});assert.equal(f.trigger.textContent,'🔔');f.buzz.reset();f.buzz.sync({who:'Safy'});assert.equal(f.trigger.textContent,'⚡');});
test('drag cancels press and quick send',()=>{const f=fixture();f.trigger.handlers.pointerdown({button:0,clientX:0,clientY:0});f.trigger.handlers.pointermove({clientX:20,clientY:0});f.trigger.handlers.pointerup();f.trigger.onclick();assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);});

test('both participants show effects, newest replaces immediately and old snapshots do not replay',()=>{const f=fixture(),first={id:'one',from:'Mahmoud',to:'Safy',kind:'love',at:20000,sequence:1},next={...first,id:'two',kind:'kiss',sequence:2};f.buzz.receive(first);const original=f.body.children.at(-1);assert.equal(original.attrs['aria-label'],'Love from Mahmoud');f.buzz.receive(next);assert.equal(original.removed,true);const latest=f.body.children.at(-1);assert.equal(latest.attrs['aria-label'],'Kiss from Mahmoud');const count=f.body.children.length;f.buzz.receive(first);f.buzz.receive(next);assert.equal(f.body.children.length,count);f.buzz.reset();f.buzz.sync({who:'Safy',pendingBuzz:next});assert.equal(f.body.children.at(-1).attrs['aria-label'],'Kiss from Mahmoud');const n=f.body.children.length;f.finish();f.buzz.reset();f.buzz.sync({who:'Safy',pendingBuzz:next});assert.equal(f.body.children.length,n);});
test('rapid sends are accepted without waiting for prior requests',async()=>{const f=fixture();await Promise.all([f.trigger.onclick(),f.trigger.onclick(),f.trigger.onclick()]);assert.equal(f.calls.length,3);});

test('sad and missing-you choices send, render distinct artwork and remember the last selection',async()=>{
 const f=fixture();
 for(const [index,kind,icon,artClass]of [[5,'sad','😔','buzz-tear'],[6,'miss','🥺','buzz-held-heart']]){
  await f.choices.children[index].onclick();assert.equal(f.calls.at(-1).kind,kind);assert.equal(f.trigger.textContent,icon);
  const overlay=f.body.children.at(-1);assert.equal(overlay.className,'buzz-overlay buzz-'+kind);assert.match(overlay.children[0].innerHTML,new RegExp(artClass));assert.equal(overlay.children[1].textContent,kind==='miss'?'I miss you…':'Feeling sad…');
 }
 f.buzz.reset();f.buzz.sync({who:'Mahmoud'});assert.equal(f.trigger.textContent,'🥺');
 await f.trigger.onclick();assert.equal(f.calls.at(-1).kind,'miss');
});

const incoming=(id='in',sequence=1)=>({id,sequence,from:'Safy',to:'Mahmoud',kind:'need',at:1});
const outgoing=(id='out',sequence=2)=>({id,sequence,from:'Mahmoud',to:'Safy',kind:'love',at:2});
test('incoming completion is acknowledged only after the full visible effect, including refresh',()=>{
 const f=fixture(),event=incoming();f.buzz.receive(event);assert.equal(f.calls.length,0);
 const fresh=fixture(f.storage);fresh.buzz.sync({who:'Mahmoud',pendingBuzz:event});assert.equal(fresh.calls.length,0);fresh.finish();assert.equal(fresh.calls.length,1);assert.equal(fresh.calls[0].id,event.id);
 const again=fixture(f.storage),before=again.body.children.length;again.buzz.sync({who:'Mahmoud',pendingBuzz:event});assert.equal(again.body.children.length,before);
});
test('hidden interruption preserves latest incoming and resumes only fresh server pending',async()=>{
 const f=fixture();f.buzz.receive(incoming('first',1));f.document.hidden=true;f.events.visibilitychange();assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
 f.buzz.receive(incoming('second',2));f.setPending(incoming('latest',3));f.document.hidden=false;await f.events.visibilitychange();await Promise.resolve();assert.equal(f.body.children.at(-1).attrs['aria-label'],'I need you from Safy');f.finish();assert.equal(f.calls.at(-1).id,'latest');
});
test('outgoing events never consume older unseen incoming, and snapshots do not restart effects',()=>{
 const f=fixture();f.buzz.receive(outgoing());f.buzz.receive(incoming());assert.equal(f.calls.length,0);assert.equal(f.body.children.at(-1).attrs['aria-label'],'I need you from Safy');const count=f.body.children.length;f.buzz.sync({who:'Mahmoud',pendingBuzz:incoming()});assert.equal(f.body.children.length,count);f.finish();assert.equal(f.calls.at(-1).id,'in');
});
test('sending while incoming animates retains the interrupted incoming until completion',()=>{
 const f=fixture();f.buzz.receive(incoming());f.buzz.receive(outgoing());f.buzz.sync({who:'Mahmoud',pendingBuzz:incoming()});assert.equal(f.body.children.at(-1).attrs['aria-label'],'Love from Mahmoud');assert.equal(f.calls.length,0);f.finish();assert.equal(f.body.children.at(-1).attrs['aria-label'],'I need you from Safy');assert.equal(f.calls.length,0);f.finish();assert.equal(f.calls[0].id,'in');
});
test('opening waits for welcome screen and plays latest event even days later',async()=>{
 const f=fixture();f.splash.hidden=false;const count=f.body.children.length;f.buzz.sync({who:'Mahmoud',pendingBuzz:incoming('old',1)});assert.equal(f.body.children.length,count);assert.equal(f.calls.length,0);f.advance(7*24*60*60*1000);f.setPending(incoming('latest',5));f.splash.hidden=true;await f.windowEvents['our-place-ready']();f.finish();assert.equal(f.calls[0].id,'latest');
});
test('account reset while pending fetch is in flight cannot display the prior account event',async()=>{
 const f=fixture();f.setPending(incoming());const task=f.windowEvents['our-place-ready']();f.buzz.reset();f.buzz.sync({who:'Safy'});const count=f.body.children.length;await task;assert.equal(f.body.children.length,count);
});
test('legacy early seen marker does not suppress a still-pending server event',()=>{
 const f=fixture();f.storage.set('our-place:buzz:seen:Mahmoud','in');f.buzz.sync({who:'Mahmoud',pendingBuzz:incoming()});assert.equal(f.body.children.at(-1).attrs['aria-label'],'I need you from Safy');assert.equal(f.calls.length,0);f.finish();assert.equal(f.calls[0].id,'in');
});

test('by-your-side Buzz sends, shows its caption and acknowledges only after completion',async()=>{const f=fixture();await f.choices.children[7].onclick();assert.equal(f.calls.at(-1).kind,'side');let overlay=f.body.children.at(-1);assert.equal(overlay.className,'buzz-overlay buzz-side');assert.match(overlay.children[0].innerHTML,/support-gold/);assert.equal(overlay.children[1].textContent,'You’re not alone');f.finish();const event={id:'support',kind:'side',from:'Safy',to:'Mahmoud',at:20000,sequence:42};f.buzz.sync({who:'Mahmoud',pendingBuzz:event});assert.ok(!f.calls.some(c=>c.id==='support'));f.finish();assert.ok(f.calls.some(c=>c.id==='support'));});

test('Gzzzz uses approved teeth artwork, one sender lifetime and completes at 3200ms',async()=>{
 const f=fixture();await f.choices.children[8].onclick();assert.equal(f.calls.at(-1).kind,'gzzzz');
 const overlay=f.body.children.at(-1),art=overlay.children[0];assert.equal(overlay.attrs['aria-label'],'Gzzzz from Mahmoud');assert.equal(overlay.children.length,1);assert.equal(art.className,'buzz-art gz-effect gz-playing');assert.match(art.innerHTML,/gz-upper/);assert.match(art.innerHTML,/gz-lower/);assert.match(art.innerHTML,/>Gzzzz</);assert.equal(art.children[0].textContent,'from Mahmoud');assert.ok([...f.timers.values()].some(t=>t.ms===3200));f.finish();assert.equal(overlay.removed,true);
 const event={id:'grinding',kind:'gzzzz',from:'Safy',to:'Mahmoud',at:20000,sequence:42};f.buzz.receive(event);assert.equal(f.body.children.at(-1).children[0].children[0].textContent,'from Safy');assert.ok(!f.calls.some(c=>c.id==='grinding'));f.finish();assert.ok(f.calls.some(c=>c.id==='grinding'));
});

test('Gzzzz picker and remembered trigger share the exact effect face in a single choices row',async()=>{const f=fixture();assert.equal(f.choices.children.length,9);assert.equal(f.picker.children[0],f.choices);await f.choices.children[8].onclick();const art=f.body.children.at(-1).children[0].innerHTML,face=art.split('<div class="gz-word">')[0];assert.ok(f.trigger.innerHTML.includes(face));assert.ok(f.choices.children[8].innerHTML.includes(face));assert.match(f.trigger.innerHTML,/gz-icon/);});
