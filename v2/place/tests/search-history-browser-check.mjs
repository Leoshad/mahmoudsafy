import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import assert from 'node:assert/strict';import {writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {clip} from './video-fixture.mjs';
process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
const store=new Store(':memory:'),server=createApp({store,origin:'http://localhost',secret:'video-browser-test-secret-long-enough',testing:true,authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1],user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,pages=[],errors=[],requests=[],directory=await mkdtemp(join(tmpdir(),'our-video-'));await writeFile(join(directory,'our-video.mp4'),clip);
for(let i=0;i<210;i++){store.message({id:'history-'+i,author:i%2?'Mahmoud':'Safy',text:i===100?'needle-100':'Conversation '+i});store.db.prepare('UPDATE messages SET createdAt=? WHERE id=?').run(new Date(Date.UTC(2026,8,20)+i*600000).toISOString(),'history-'+i);}
const original=store.db.prepare('SELECT rowid AS sequence,id,createdAt FROM messages ORDER BY rowid').all();
const browsers=[];
try{
 for(const name of ['mahmoud','safy']){const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});browsers.push(browser);const page=await browser.newPage();pages.push(page);await page.setViewport({width:390,height:740,isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.test',password:'test'})});const cookie=login.headers.get('set-cookie').split(';')[0];await page.setCookie({name:'ms_place',value:cookie.slice(cookie.indexOf('=')+1),url:base});await page.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{value:()=>true});Object.defineProperty(document,'hidden',{get:()=>false});Object.defineProperty(document,'visibilityState',{get:()=> 'visible'});});await page.setRequestInterception(true);page.on('request',r=>{requests.push({who:name,url:r.url(),method:r.method()});const headers={...r.headers()};if(r.method()==='POST')headers.origin='http://localhost';void r.continue({headers});});await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('#welcome-splash[hidden]');}
 const [sender,receiver]=pages;
 for(const page of pages){
  assert.equal(await page.$$eval('#feed [data-message]',ns=>ns.length),60);
  await page.evaluate(()=>document.querySelector('#chat-search-open').click());await page.type('#chat-search-query','needle-100');
  await page.waitForSelector('[data-message="history-100"].chat-search-active');
  const before=await page.$$eval('#feed [data-message]',ns=>ns.map(n=>n.dataset.message));assert.equal(before.length,120);
  const dates=await page.$$eval('#feed [data-message]',ns=>ns.map(n=>({id:n.dataset.message,date:n.querySelector('time')?.dateTime})));assert.deepEqual(dates,original.slice(90).map(m=>({id:m.id,date:m.createdAt})));
  const y=await page.$eval('[data-message="history-100"]',n=>n.getBoundingClientRect().top);
  await page.click('#chat-search-close');
  assert.deepEqual(await page.$$eval('#feed [data-message]',ns=>ns.map(n=>n.dataset.message)),before);
  assert.ok(Math.abs(await page.$eval('[data-message="history-100"]',n=>n.getBoundingClientRect().top)-y)<3);
  await page.evaluate(()=>document.querySelector('[data-message="history-100"]').dispatchEvent(new Event('react-request')));await page.click('.chat-reaction-picker [aria-label="Love"]');
  await page.waitForFunction(()=>document.querySelector('[data-message="history-100"] .chat-reactions').textContent.includes('❤️'));
  await page.evaluate(()=>document.querySelector('[data-message="history-100"]').dispatchEvent(new Event('react-request')));await page.click('.chat-reaction-picker .chat-pin');
  assert.deepEqual(await page.$$eval('#feed [data-message]',ns=>ns.map(n=>n.dataset.message)),before);
  await page.evaluate(()=>document.querySelector('#load-earlier').click());await page.waitForSelector('[data-message="history-30"]');
  await page.evaluate(()=>document.querySelector('#load-earlier').click());await page.waitForSelector('[data-message="history-0"]');
  assert.deepEqual(await page.$$eval('#feed [data-message]',ns=>ns.map(n=>n.dataset.message)),Array.from({length:210},(_,i)=>'history-'+i));
 }
 await sender.type('#compose','After closing search');await sender.click('#send');await receiver.waitForFunction(()=>document.querySelector('#feed').textContent.includes('After closing search'));
 assert.ok(await receiver.$('[data-message="history-100"]'));assert.equal(await receiver.$$eval('#feed [data-message]',ns=>ns.length),211);
 await receiver.reload({waitUntil:'domcontentloaded'});await receiver.waitForSelector('#welcome-splash[hidden]');
 await receiver.evaluate(()=>document.querySelector('#chat-search-open').click());await receiver.type('#chat-search-query','needle-100');await receiver.waitForSelector('[data-message="history-100"].chat-search-active');await receiver.click('#chat-search-close');assert.ok(await receiver.$('[data-message="history-100"]'));
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM messages').get().n,211);assert.deepEqual(store.db.prepare('SELECT rowid AS sequence,id,createdAt FROM messages ORDER BY rowid LIMIT 210').all(),original);assert.deepEqual(errors,[]);
 console.log('PASS: both accounts retain search results and continuous history after close, earlier paging, live snapshots and reload; 390px viewport.');
}finally{await Promise.all(browsers.map(b=>b.close()));server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(directory,{recursive:true,force:true});}
