import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function setup({permission}={}){
 class Node{constructor(tag){this.tagName=tag?.toUpperCase();this.handlers={};this.children=[];this.hidden=false;this.classList={add(){}};}addEventListener(t,f){(this.handlers[t]??=[]).push(f);}emit(t,e={}){for(const f of this.handlers[t]||[])f(e);}setAttribute(){}removeAttribute(){}append(...x){this.children.push(...x);}before(n){this.panel=n;}pause(){}setPointerCapture(){}}
 const doc=new Node(),win=new Node(),composer=new Node(),button=new Node(),timers=new Map();let seq=0,requests=0,stops=0,sends=0,recorders=[];
 const stream={getTracks:()=>[{stop:()=>stops++}]};
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm';recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['recorded audio bytes enough'],{type:'audio/webm'})});this.onstop?.();}}
 doc.createElement=t=>new Node(t);doc.querySelector=()=>composer;doc.querySelectorAll=()=>[];
 const context={window:win,document:doc,navigator:{mediaDevices:{getUserMedia:()=>{requests++;return permission?permission():Promise.resolve(stream);}}},MediaRecorder:Recorder,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Date,setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),setInterval:()=>++seq,clearInterval(){}};win.MediaRecorder=Recorder;
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../public/voice.js',import.meta.url),'utf8'),context);win.OurVoice.init({button,canStart:()=>true,isCurrent:()=> 'Mahmoud',send:async()=>sends++});
 const down=()=>button.emit('pointerdown',{button:0,clientX:50,clientY:200,pointerId:1});const hold=async()=>{down();for(const fn of [...timers.values()])fn();timers.clear();await Promise.resolve();await Promise.resolve();};
 const controls=()=>composer.panel.children[2].children;
 return {button,doc,win,composer,down,hold,controls,requests:()=>requests,stops:()=>stops,sends:()=>sends,recorders};
}
test('tap keeps photo action; hold and release only creates audio preview; send is explicit',async()=>{
 const h=setup();h.down();h.button.emit('pointerup');assert.equal(h.requests(),0);
 await h.hold();assert.equal(h.recorders[0].state,'recording');h.button.emit('pointerup');
 assert.equal(h.recorders[0].state,'inactive');assert.ok(h.stops()>0);assert.equal(h.sends(),0);assert.equal(h.composer.panel.children[1].src,'blob:test');
 await h.controls()[1].onclick();assert.equal(h.sends(),1);assert.equal(h.composer.panel.hidden,true);
});
test('slide up locks until stop; background stops; deletion never sends',async()=>{
 const h=setup();await h.hold();h.button.emit('pointermove',{pointerId:1,clientX:50,clientY:120});h.button.emit('pointerup');assert.equal(h.recorders[0].state,'recording');
 h.doc.hidden=true;h.doc.emit('visibilitychange');assert.equal(h.recorders[0].state,'inactive');assert.equal(h.sends(),0);h.controls()[2].onclick();assert.equal(h.composer.panel.hidden,true);
});
test('microphone granted after release or logout is immediately closed without recording',async()=>{
 for(const logout of [false,true]){let resolve;const h=setup({permission:()=>new Promise(r=>resolve=r)});await h.hold();if(logout)h.win.OurVoice.reset();else h.button.emit('pointerup');let stopped=0;resolve({getTracks:()=>[{stop:()=>stopped++}]});await Promise.resolve();await Promise.resolve();assert.equal(stopped,1);assert.equal(h.recorders.length,0);assert.equal(h.sends(),0);}
});
