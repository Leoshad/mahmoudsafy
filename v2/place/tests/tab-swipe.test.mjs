import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').split('// Main-section swipe navigation. Nested activities own their gestures.')[1].split('\n})();')[0]+'\n})();';
function setup(){
 const handlers={},root={addEventListener:(name,fn)=>handlers[name]=fn},target={closest:()=>false,parentElement:root,scrollWidth:100,clientWidth:100};
 const ctx={state:{},tab:'chat',performance:{now:()=>100},window:{innerWidth:390,getSelection:()=>'',matchMedia:()=>({matches:true})},document:{querySelector:()=>null},getComputedStyle:()=>({overflowX:'visible'}),$:()=>root,goto:next=>ctx.tab=next};vm.runInNewContext(source,ctx);
 const point=(x,y=100)=>({identifier:1,clientX:x,clientY:y});
 const start=(x=250,y=100)=>handlers.touchstart({touches:[point(x,y)],target});
 const move=(x,y=100)=>handlers.touchmove({touches:[point(x,y)],cancelable:true,preventDefault(){}});
 const end=(x=100,y=100)=>handlers.touchend({changedTouches:[point(x,y)]});
 return {ctx,target,handlers,start,move,end};
}
test('swipes traverse three main tabs in both directions without wrapping',()=>{const s=setup();for(const expected of ['together','space','space']){s.start();s.move(100);s.end();assert.equal(s.ctx.tab,expected);}for(const expected of ['together','chat','chat']){s.start(100);s.move(250);s.end(250);assert.equal(s.ctx.tab,expected);}});
test('vertical scrolling, short movements, cancellation and multi-touch do not navigate',()=>{const s=setup();s.start();s.move(245,140);s.end(100,145);assert.equal(s.ctx.tab,'chat');s.start();s.end(220);assert.equal(s.ctx.tab,'chat');s.start();s.handlers.touchcancel();s.end();assert.equal(s.ctx.tab,'chat');s.start();s.handlers.touchmove({touches:[{},{}]});s.end();assert.equal(s.ctx.tab,'chat');});
test('activities, input controls, horizontal scrollers, dialogs and edge gestures retain ownership',()=>{const s=setup();s.target.closest=()=>true;s.start();s.end();assert.equal(s.ctx.tab,'chat');s.target.closest=()=>false;s.target.scrollWidth=200;s.ctx.getComputedStyle=()=>({overflowX:'auto'});s.start();s.end();assert.equal(s.ctx.tab,'chat');s.target.scrollWidth=100;s.ctx.document.querySelector=()=>({});s.start();s.end();assert.equal(s.ctx.tab,'chat');s.ctx.document.querySelector=()=>null;s.start(10);s.end(200);assert.equal(s.ctx.tab,'chat');s.ctx.tab='editor';s.start();s.end();assert.equal(s.ctx.tab,'editor');});
