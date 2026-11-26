// Optional: node tests/heart-rain-browser-check.mjs — tapping the header heart rains hearts on both open apps.
import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import assert from 'node:assert/strict';
process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
const shot=process.env.RAIN_SHOT||null;
const store=new Store(':memory:');const server=createApp({store,origin:'http://localhost',secret:'connection-browser-test-only-secret-long',testing:true,pushSend:async()=>{},authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1];const user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const browsers=[],pages={},errors=[];
try{
 for(const who of ['mahmoud','safy']){
  const l=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:who+'@example.test',password:'x'})});const cookie=l.headers.get('set-cookie').split(';')[0];
  const b=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});browsers.push(b);const p=await b.newPage();pages[who]=p;p.on('pageerror',e=>errors.push(who+': '+e.message));
  await p.setViewport({width:390,height:844,deviceScaleFactor:1.5,isMobile:true,hasTouch:true});await p.setCookie({name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base});
  await p.setRequestInterception(true);p.on('request',r=>{const h={...r.headers()};if(r.method()==='POST')h.origin='http://localhost';r.continue({headers:h});});
  await p.goto(base,{waitUntil:'networkidle2'});await p.waitForFunction(()=>document.querySelector('#welcome-splash').hidden,{timeout:10000});
  await p.evaluate(()=>{window.__rains=0;new MutationObserver(m=>{for(const r of m)for(const n of r.addedNodes)if(n.classList?.contains('heart-rain'))window.__rains++;}).observe(document.body,{childList:true});});
 }
 await new Promise(r=>setTimeout(r,800));
 await pages.mahmoud.tap('.brand .brand-heart');
 await pages.safy.waitForFunction(()=>window.__rains===1,{timeout:5000});
 if(shot){await pages.safy.evaluate(()=>document.getAnimations().forEach(a=>{if(a.effect?.target?.classList?.contains('rain-heart')){a.pause();a.currentTime=1300;}}));await pages.safy.screenshot({path:shot});}
 await new Promise(r=>setTimeout(r,800));
 assert.equal(await pages.mahmoud.evaluate(()=>window.__rains),1,'the tapper sees one rain, not an echo');
 // A quick second tap is ignored (no flood); a later tap rains again on both.
 await pages.mahmoud.tap('.brand .brand-heart');await new Promise(r=>setTimeout(r,300));assert.equal(await pages.safy.evaluate(()=>window.__rains),1);
 await new Promise(r=>setTimeout(r,1300));await pages.safy.tap('.brand .brand-heart');await pages.mahmoud.waitForFunction(()=>window.__rains===2,{timeout:5000});
 const layout=await pages.mahmoud.evaluate(()=>{const h=document.querySelector('#our-place-trial>header');return h.scrollWidth<=h.clientWidth+1;});assert.ok(layout,'header does not overflow');
 assert.deepEqual(errors,[]);console.log('PASS heart rain: shows on both apps at once, no echo on the tapper, taps are throttled, header unchanged.');
}finally{for(const b of browsers)await b.close();server.closeAllConnections?.();server.close();}
