// Optional: node tests/guide-browser-check.mjs — the real app on a phone-sized screen: launcher, reader, language switch, Back.
import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import assert from 'node:assert/strict';
process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
const shots=process.env.GUIDE_SHOTS||null;
const store=new Store(':memory:');const server=createApp({store,origin:'http://localhost',secret:'connection-browser-test-only-secret-long',testing:true,pushSend:async()=>{},authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1];const user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const errors=[];let browser;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const l=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:'safy@example.test',password:'x'})});const cookie=l.headers.get('set-cookie').split(';')[0];
 browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused/.test(m.text())&&/guide/.test(m.location()?.url||''))errors.push(m.text());});
 await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await page.setCookie({name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base});
 await page.setRequestInterception(true);page.on('request',r=>{const h={...r.headers()};if(r.method()==='POST')h.origin='http://localhost';r.continue({headers:h});});
 await page.goto(base,{waitUntil:'networkidle2'});await page.waitForFunction(()=>!document.querySelector('#app').hidden);
 await page.click('[data-tab="together"]');await wait(500);
 await page.waitForSelector('.guide-launch');assert.match(await page.$eval('.guide-launch',b=>b.textContent),/Game Guide/);
 await page.$eval('.guide-launch',b=>b.scrollIntoView({block:'center'}));if(shots)await page.screenshot({path:shots+'/1-launcher.png'});
 await page.click('.guide-launch');await page.waitForSelector('.our-guide:not([hidden])');
 assert.equal(await page.$eval('.our-guide',r=>r.dir),'ltr');assert.match(await page.$eval('.g-count',n=>n.textContent),/^1 \/ 10$/);
 if(shots)await page.screenshot({path:shots+'/2-cover.png'});
 // Swipe up (scroll) to the crown page.
 await page.$eval('.g-scroll',s=>{const p=s.querySelectorAll('.g-page')[1];s.scrollTo({top:p.offsetTop-s.offsetTop});});await wait(500);
 assert.match(await page.$eval('.g-count',n=>n.textContent),/^2 \/ 10$/);if(shots)await page.screenshot({path:shots+'/3-crown-en.png'});
 // Switch to Arabic, stay on the same page.
 await page.click('.g-lang button[data-lang="ar"]');await wait(400);
 assert.equal(await page.$eval('.our-guide',r=>r.dir),'rtl');assert.match(await page.$eval('.g-count',n=>n.textContent),/^2 \/ 10$/);assert.match(await page.$eval('.g-title',n=>n.textContent),/دليل الألعاب/);
 if(shots)await page.screenshot({path:shots+'/4-crown-ar.png'});
 // Back closes the guide and keeps you on Do Together.
 await page.goBack();await wait(500);
 assert.equal(await page.$eval('.our-guide',r=>r.hidden),true);assert.equal(await page.$eval('#together',s=>s.hidden),false);
 // The choice is remembered on this phone.
 await page.click('.guide-launch');await page.waitForSelector('.our-guide:not([hidden])');assert.equal(await page.$eval('.our-guide',r=>r.dir),'rtl');
 await page.click('.g-lang button[data-lang="en"]');await page.click('.g-close');await wait(400);assert.equal(await page.$eval('.our-guide',r=>r.hidden),true);assert.equal(await page.$eval('#together',s=>s.hidden),false);
 // Inside Our Word: the small button opens straight on the Our Word page.
 await page.$eval('#word-open',b=>b.scrollIntoView({block:'center'}));await page.click('#word-open');await wait(700);
 await page.$eval('.guide-mini[data-for="word"]',b=>b.scrollIntoView({block:'center'}));if(shots)await page.screenshot({path:shots+'/5-word-button.png'});
 await page.click('.guide-mini[data-for="word"]');await page.waitForSelector('.our-guide:not([hidden])');await wait(400);
 assert.match(await page.$eval('.g-count',n=>n.textContent),/^3 \/ 10$/);if(shots)await page.screenshot({path:shots+'/6-word-page.png'});
 await page.goBack();await wait(500);assert.equal(await page.$eval('.our-guide',r=>r.hidden),true);assert.equal(await page.$eval('#word-panel',p=>!p.hidden),true,'game panel stays open');
 // Billiards button opens the billiards page; last page offers the PDF.
 await page.evaluate(()=>window.OurGuide.open('billiards'));await wait(400);assert.match(await page.$eval('.g-count',n=>n.textContent),/^7 \/ 10$/);
 if(shots)await page.screenshot({path:shots+'/7-billiards.png'});
 const pdf=await page.$eval('.g-download',a=>a.getAttribute('href'));const r=await fetch(base+pdf);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');
 // Overflow check: nothing wider than the screen.
 const wide=await page.$$eval('.g-page *',els=>els.filter(e=>e.getBoundingClientRect().right>window.innerWidth+1||e.getBoundingClientRect().left<-1).map(e=>e.className||e.tagName).slice(0,5));assert.deepEqual(wide,[]);
 assert.deepEqual(errors,[]);console.log('PASS guide: launcher, mini buttons, swipe pages, EN/AR switch keeps page and is remembered, Back and ✕ close, PDF served, no overflow, no CSP errors.');
}finally{await browser?.close();server.closeAllConnections?.();server.close();}
