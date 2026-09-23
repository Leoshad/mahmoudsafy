import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/balloon.js',import.meta.url),'utf8');
function fixture(){
 let timer;const calls=[];const c={window:{},mode:'idle',gesture:null,hold:null,progress:0,h:500,suppressUntil:0,blocked:'button',document:{querySelector:()=>null},setTimeout:f=>(timer=f,1),clearTimeout:()=>timer=null,unlock(){},open(){calls.push('open');c.mode='inflating';},close(){calls.push('close');c.mode='idle';},ready(){calls.push('ready');c.mode='ready';},performance:{now:()=>100},Math};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function start(x,'),source.indexOf('// Capture only')),c);
 return {c,calls,hold:()=>timer?.(),target:{closest:()=>false}};
}
test('normal scrolling before hold cancels balloon without opening or consuming movement',()=>{const {c,calls,hold,target}=fixture();c.start(50,400,1,target);assert.equal(c.move(50,380),false);hold();assert.deepEqual(calls,[]);});
test('hold and upward distance control inflation; early release cancels, full release enables pin',()=>{const {c,calls,hold,target}=fixture();c.start(50,400,1,target);hold();assert.equal(c.move(50,285),true);assert.equal(c.progress,.5);c.end();assert.deepEqual(calls,['open','close']);c.start(50,400,2,target);hold();c.move(50,100);assert.equal(c.progress,1);c.end();assert.equal(c.mode,'ready');});
test('interactive message targets never initiate balloon and downward movement empties it',()=>{const {c,hold,target}=fixture();c.start(50,400,1,{closest:()=>true});assert.equal(c.gesture,null);c.start(50,400,1,target);hold();c.move(50,500);assert.equal(c.progress,0);});

test("fingerprint ownership prevents balloon arming",()=>{const {c,hold,target,calls}=fixture();c.window.OurTouch={busy:()=>true};c.start(50,400,1,target);hold();assert.equal(c.gesture,null);assert.deepEqual(calls,[]);});
