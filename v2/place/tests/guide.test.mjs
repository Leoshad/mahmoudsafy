import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const ctx={};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../public/guide-content.js',import.meta.url),'utf8'),ctx);
const {en,ar}=ctx.OurGuideContent;
test('guide pages line up across languages so switching keeps your place',()=>{
 assert.deepEqual(en.pages.map(p=>p.key),ar.pages.map(p=>p.key));
 for(const k of ['cover','crown','word','billiards','faq'])assert.ok(en.pages.some(p=>p.key===k),k);
 assert.equal(en.dir,'ltr');assert.equal(ar.dir,'rtl');
});
test('guide markup obeys the page security policy (no inline styles, scripts or handlers)',()=>{
 for(const c of [en,ar])for(const p of c.pages){assert.doesNotMatch(p.html,/style=|<script|\son[a-z]+=/i,p.key);}
});
test('guide states the rules the games enforce',()=>{
 const all=en.pages.map(p=>p.html).join(' ');
 assert.match(all,/6 tries/);assert.match(all,/4 to 7 letters/);assert.match(all,/11 pm Egypt time/);assert.match(all,/two days/);assert.match(all,/10 minutes/);assert.match(all,/none, 30, 45 or 60 seconds/);
});
