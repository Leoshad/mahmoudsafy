// Optional: node tests/bandwidth-resume-browser-check.mjs — the 60-second stream rotation resumes with a receipt and keeps chat live.
import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import assert from 'node:assert/strict';
process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
const store=new Store(':memory:');const server=createApp({store,origin:'http://localhost',secret:'connection-browser-test-only-secret-long',testing:true,pushSend:async()=>{},authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1];const user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const urls=[],states=[],errors=[];let browser;
try{
 const cookies={};for(const who of ['mahmoud','safy']){const l=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:who+'@example.test',password:'test-only'})});cookies[who]=l.headers.get('set-cookie').split(';')[0];}
 browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.setCookie({name:cookies.mahmoud.split('=')[0],value:cookies.mahmoud.slice(cookies.mahmoud.indexOf('=')+1),url:base});
 await page.setRequestInterception(true);page.on('request',r=>{if(r.url().includes('/api/events'))urls.push(r.url());if(r.url().includes('/api/state'))states.push(r.url());const h={...r.headers()};if(r.method()==='POST')h.origin='http://localhost';r.continue({headers:h});});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('#app').hidden,{timeout:15000});
 const say=async text=>{const r=await fetch(base+'/api/command',{method:'POST',headers:{Origin:'http://localhost',Cookie:cookies.safy,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),type:'message',data:{text}})});assert.equal(r.status,200,await r.text());};
 await say('before rotation');await page.waitForFunction(()=>document.body.innerText.includes('before rotation'),{timeout:10000});
 console.log('waiting for the 60 s rotation…');await new Promise(r=>setTimeout(r,64000));
 assert.ok(urls.length>=2,'stream rotated');assert.ok(urls.slice(1).some(u=>u.includes('known=')),'resume carried a receipt: '+urls.join(' | '));
 await say('after rotation');await page.waitForFunction(()=>document.body.innerText.includes('after rotation')&&document.body.innerText.includes('before rotation'),{timeout:10000});
 await page.type('#compose','from my phone');await page.click('#send');await page.waitForFunction(()=>document.body.innerText.includes('from my phone'),{timeout:10000});
 await page.evaluate(()=>window.OurWord?.open?.());await new Promise(r=>setTimeout(r,1500));
 await say('third line');await page.waitForFunction(()=>['before rotation','after rotation','from my phone','third line'].every(t=>document.body.innerText.includes(t)),{timeout:10000});
 console.log('state requests:',states.length,'with receipt:',states.filter(u=>u.includes('known=')).length);
 assert.ok(states.some(u=>u.includes('known=')),'state sync carried a receipt');
 assert.deepEqual(errors,[]);console.log('PASS: resumed with receipt, old and new messages visible.',urls.length,'streams');
}finally{await browser?.close();server.closeAllConnections?.();server.close();}
