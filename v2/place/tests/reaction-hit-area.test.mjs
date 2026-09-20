import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('long press and context menu are bound only to the bubble, never its full-width message row',()=>{
 const code=readFileSync(new URL('../public/comfort.js',import.meta.url),'utf8');
 for(const who of ['Mahmoud','Safy']){
 const rowEvents={},bubbleEvents={};let timers=0;
 const row={classList:{toggle(){}},addEventListener:(type,fn)=>rowEvents[type]=fn};
 const bubble={addEventListener:(type,fn)=>bubbleEvents[type]=fn};
 const context={make:()=>({}),setTimeout:()=>++timers,clearTimeout(){},pressTimer:null};vm.createContext(context);
 vm.runInContext(code.slice(code.indexOf('function chatReactions('),code.indexOf('window.OurComfort=')),context);
 context.chatReactions(row,bubble,{id:'message'}, {who,messageReactions:{}});
 assert.equal(rowEvents.pointerdown,undefined);assert.equal(rowEvents.contextmenu,undefined);
 assert.equal(typeof bubbleEvents.contextmenu,'function');
 bubbleEvents.pointerdown({target:{closest:()=>null},clientX:10,clientY:20});assert.equal(timers,1);
 bubbleEvents.pointerdown({target:{closest:()=>({})},clientX:10,clientY:20});assert.equal(timers,1);
 }
});
