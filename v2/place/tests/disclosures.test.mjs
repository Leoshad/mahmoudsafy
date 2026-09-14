import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('outside press dismisses open disclosures, inside and linked toggles stay interactive',()=>{
 const handlers={},panels=[{id:'comments',open:true,contains:t=>t.inside==='comments'},{id:'menu',open:true,contains:t=>t.inside==='menu'}];const context={document:{addEventListener:(event,fn)=>handlers[event]=fn,querySelectorAll:()=>panels.filter(p=>p.open)}};vm.runInNewContext(readFileSync(new URL('../public/disclosures.js',import.meta.url),'utf8'),context);
 const target=(inside='',controls='')=>({inside,closest:()=>({getAttribute:()=>controls})});handlers.pointerdown({target:target('comments')});assert.equal(panels[0].open,true);assert.equal(panels[1].open,false);
 handlers.pointerdown({target:target('','comments')});assert.equal(panels[0].open,true);handlers.pointerdown({target:target()});assert.equal(panels[0].open,false);
 panels.forEach(p=>p.open=true);handlers.keydown({key:'Escape'});assert.ok(panels.every(p=>!p.open));
});
