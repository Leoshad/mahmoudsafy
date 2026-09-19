import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf("if(m.image){const url='/api/photos/'");
const block=source.slice(start,source.indexOf("const footer=",start));
for(const retained of [true,false])test('photo refresh '+(retained?'retains the loaded image and dimensions':'creates a new image when attachment changes'),()=>{
 const photo={width:240,height:320,loading:'lazy',dataset:{},getAttribute:()=>'/api/photos/original',setAttribute(){}};let created=0,appended;
 const c={m:{image:retained?'original':'changed',text:'Photo'},retainedPhoto:photo,b:{append:im=>appended=im},el:()=>{created++;return {dataset:{},getAttribute:()=>null,setAttribute(){}};}};vm.createContext(c);vm.runInContext(block,c);
 assert.equal(created,retained?0:1);assert.equal(appended===photo,retained);if(retained)assert.equal(appended.height,320);else assert.equal(appended.src,'/api/photos/changed');
});
