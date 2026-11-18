import assert from 'node:assert/strict';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';
import puppeteer from 'puppeteer-core';
const store=new Store(':memory:');process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
const server=createApp({store,origin:'http://localhost',secret:'synthetic-care-review-secret-long-enough',testing:true,authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1],user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {default:chromium}=await import('@sparticuz/chromium');
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),headless:true,args:chromium.args});
try{const page=await browser.newPage();await page.setViewport({width:390,height:740,isMobile:true,hasTouch:true});
const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:'safy@example.test',password:'test'})});const cookie=login.headers.get('set-cookie').split(';')[0];await page.setCookie({name:'ms_place',value:cookie.slice(cookie.indexOf('=')+1),url:base});
await page.setRequestInterception(true);page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))return r.abort();const headers={...r.headers()};if(r.method()==='POST')headers.origin='http://localhost';r.continue({headers});});
await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('#app:not([hidden])');await page.evaluate(()=>document.querySelector('[data-tab="care"]').click());
assert.equal(await page.$eval('#care',e=>e.textContent.includes('Calm now')),false);
await page.evaluate(()=>document.querySelector('.care-private').click());await page.waitForSelector('.care-dialog input[type=checkbox]');assert.equal(await page.$eval('.care-dialog input[type=checkbox]',e=>e.checked),true);
await page.type('.care-dialog textarea','SYNTHETIC_PRIVATE_SHORTCUT_TEST');await page.click('.care-dialog button[type=submit]');await page.waitForFunction(()=>!document.querySelector('.care-dialog'));
assert.equal(store.state().care.entries[0].visibility,'private');
const mlogin=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:'mahmoud@example.test',password:'test'})});const mc=mlogin.headers.get('set-cookie').split(';')[0];const v=await (await fetch(base+'/api/state',{headers:{Cookie:mc}})).json();assert.equal(v.care.entries.some(e=>e.data.text==='SYNTHETIC_PRIVATE_SHORTCUT_TEST'),false);
// Actual private entries remain protected at HTTP boundary.
const s=store.state();s.care.entries[0].visibility='private';s.care.revision++;store.save(s);const hidden=await (await fetch(base+'/api/state',{headers:{Cookie:mc}})).text();assert.ok(!hidden.includes('SYNTHETIC_PRIVATE_SHORTCUT_TEST'));
const archive=await (await fetch(base+'/api/export',{headers:{Cookie:mc}})).text();assert.ok(!archive.includes('SYNTHETIC_PRIVATE_SHORTCUT_TEST'));
for(const width of [320,390,430]){await page.setViewport({width,height:740,isMobile:true,hasTouch:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
// Only older records: inspect the actual Load older path.
const old=store.state();old.care.entries[0].occurredAt=Date.now()-121*86400000;old.care.revision++;store.save(old);
await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#app:not([hidden])');await page.evaluate(()=>document.querySelector('[data-tab="care"]').click());
await page.evaluate(()=>[...document.querySelectorAll('#care button')].find(b=>b.textContent==='History').click());
assert.equal(await page.$eval('.care-dialog',e=>e.textContent.includes('Load older')),true);
await page.evaluate(()=>[...document.querySelectorAll('.care-dialog button')].find(b=>b.textContent==='Load older').click());
await page.waitForFunction(()=>document.querySelector('.care-dialog')?.textContent.includes('SYNTHETIC_PRIVATE_SHORTCUT_TEST'));
assert.ok(!await page.evaluate(()=>document.body.innerText.includes('occurredAt')));console.log('PASS Care: private shortcut, HTTP/export isolation, mobile widths, old-only history');

}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
