import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('notification highlight expires and successive targets clear previous timers and outlines',()=>{
 const timers=new Map();let id=0;const c=vm.createContext({setTimeout(fn,ms){assert.equal(ms,2200);timers.set(++id,fn);return id;},clearTimeout(key){timers.delete(key);}});
 vm.runInContext(source.slice(source.indexOf('let sourceHighlightTimer='),source.indexOf('async function openSource')),c);
 const row=()=>({classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);}}});const a=row(),b=row();
 c.showSourceHighlight(a);assert.ok(a.classList.values.has('source-highlight'));
 c.showSourceHighlight(b);assert.equal(a.classList.values.size,0);assert.equal(timers.size,1);
 [...timers.values()][0]();assert.equal(b.classList.values.size,0);assert.equal(timers.size,0);
 c.showSourceHighlight(b);c.clearSourceHighlight();assert.equal(b.classList.values.size,0);assert.equal(timers.size,0);
 assert.match(source,/row\?\.scrollIntoView\(\{block:'center'\}\);showSourceHighlight\(row\)/);
 assert.match(source,/function signOutUI\(\)\{clearSourceHighlight\(\)/);
});
