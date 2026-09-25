// Local two-account browser check; fixture authentication and no paid AI calls.
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';
import {change} from '../domain.mjs';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';delete process.env.OPENAI_API_KEY;
const store=new Store(':memory:');store.message({id:'anchor',author:'Mahmoud',text:'A shared round',status:'sent'});
const state=store.state();change(state,'Mahmoud','quiz.launch',{host:'Echo',target:'Both',afterSequence:store.messages().at(-1).sequence,questions:[{q:'Pick a sound.',options:[],correct:-1},{q:'Pick a colour.',options:['Blue','Gold'],correct:-1}]});store.save(state);
const server=createApp({store,origin:'http://localhost',secret:'shared-activity-browser-test-secret-long',testing:true,pushSend:async()=>{},authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1],user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browsers=[],pages=[],errors=[];
try{
 for(const name of ['mahmoud','safy']){
  const response=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.test',password:'test'})}),cookie=response.headers.get('set-cookie').split(';')[0];
  const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});browsers.push(browser);const page=await browser.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:800,isMobile:true,hasTouch:true});
  await page.setCookie({name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base});
  await page.setRequestInterception(true);page.on('request',r=>r.continue({headers:{...r.headers(),...(r.method()==='POST'?{origin:'http://localhost'}:{})}}));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('.activity .free-answer:not([disabled])',{timeout:10000});
 }
 const submit=async(p,text)=>{await p.type('.activity .free-answer',text);await p.$eval('.activity form',f=>f.requestSubmit());};
 await submit(pages[0],'A tiny bell');await pages[0].waitForFunction(()=>document.querySelector('.activity').textContent.includes('Your answer is saved'));
 assert.equal(store.state().activity.index,0);
 await pages[0].reload({waitUntil:'domcontentloaded'});await pages[0].waitForFunction(()=>document.querySelector('.activity')?.textContent.includes('Your answer is saved'));
 assert.equal(await pages[0].$('.activity .free-answer'),null);
 await submit(pages[1],'Ocean waves');
 for(const p of pages)await p.waitForFunction(()=>document.querySelector('.activity')?.textContent.includes('Question 2 of 2'));
 for(const p of pages){await p.$$eval('.activity button',bs=>bs.find(b=>b.textContent==='Blue').click());}
 for(const p of pages)await p.waitForFunction(()=>document.querySelector('.activity')?.textContent.includes('Round complete'));
 assert.equal(store.state().activity.answers.length,4);assert.deepEqual(errors,[]);
 console.log('PASS: mobile-sized browsers, both accounts, free answers, reload while waiting, choices, shared completion.');
}finally{await Promise.all(browsers.map(b=>b.close()));server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
