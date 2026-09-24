import {ochoChange} from '../ocho.mjs';
import {dominoChange,tiles} from '../domino.mjs';
import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import assert from 'node:assert/strict';import {writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {clip} from './video-fixture.mjs';
process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
const store=new Store(':memory:'),server=createApp({store,origin:'http://localhost',secret:'video-browser-test-secret-long-enough',testing:true,authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1],user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,pages=[],errors=[],requests=[],directory=await mkdtemp(join(tmpdir(),'our-video-'));await writeFile(join(directory,'our-video.mp4'),clip);
const saved=store.state();dominoChange(saved,'Mahmoud','domino.create',{mode:'shared'});dominoChange(saved,'Safy','domino.accept',{game:saved.domino.shared.id,revision:saved.domino.shared.revision});dominoChange(saved,'Mahmoud','domino.create',{mode:'solo',difficulty:'medium'});
for(const g of [saved.domino.shared,saved.domino.solo.Mahmoud]){g.chain=tiles().map((t,i)=>({...t,order:i+1}));g.lastMove={...g.chain.at(-1),by:'Mahmoud'};g.botDueAt=null;g.turn='Mahmoud';g.turnSeconds=0;g.turnDeadline=null;g.stock=[];g.hands=Object.fromEntries(g.players.map(n=>[n,[]]));}ochoChange(saved,'Safy','ocho.create',{mode:'solo',difficulty:'medium'});store.save(saved);
const browsers=[];
try{
 for(const name of ['mahmoud','safy']){const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});browsers.push(browser);const page=await browser.newPage();pages.push(page);await page.setViewport({width:390,height:740,isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.test',password:'test'})});const cookie=login.headers.get('set-cookie').split(';')[0];await page.setCookie({name:'ms_place',value:cookie.slice(cookie.indexOf('=')+1),url:base});await page.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{value:()=>true});Object.defineProperty(document,'hidden',{get:()=>false});Object.defineProperty(document,'visibilityState',{get:()=> 'visible'});});await page.setRequestInterception(true);page.on('request',r=>{requests.push({who:name,url:r.url(),method:r.method()});const headers={...r.headers()};if(r.method()==='POST')headers.origin='http://localhost';void r.continue({headers});});await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('#welcome-splash[hidden]');}
 const [a,b]=pages;
 for(const [index,page] of pages.entries()){
  await page.evaluate(()=>document.querySelector('[data-tab="together"]').click());await page.click('#domino-open');
  for(const mode of index===0?['solo','shared']:['shared']){
   await page.click('#domino-'+mode+'-tab');await page.waitForSelector('.domino-board .domino-placement');await page.evaluate(()=>{const b=document.querySelector('.domino-size-toggle');if(b.textContent==='Full screen')b.click();});
   for(const size of [{width:390,height:740},{width:360,height:640},{width:740,height:390}]){
    await page.setViewport({...size,isMobile:true,hasTouch:true});await new Promise(r=>setTimeout(r,400));
    const result=await page.$eval('.domino-board',n=>{const r=n.getBoundingClientRect();return {unit:n._unit,count:n._nodes.size,viewFits:r.top>=0&&r.bottom<=innerHeight,inside:[...n._nodes.values()].every(w=>{const p=w._piece.getBoundingClientRect();return p.left>=r.left&&p.right<=r.right&&p.top>=r.top&&p.bottom<=r.bottom;})};});
    assert.equal(result.count,28);assert.ok(result.unit>=20);assert.ok(result.viewFits,JSON.stringify({size,result}));assert.ok(result.inside,JSON.stringify({index,mode,size,result}));assert.equal(await page.$('.domino-camera-controls'),null);
   }
   await page.setViewport({width:390,height:740,isMobile:true,hasTouch:true});await new Promise(r=>setTimeout(r,450));await page.screenshot({path:'/tmp/domino-auto-'+index+'-'+mode+'.png'});
  }
 }
 // A background message updates the fullscreen badge without marking it read.
 await a.evaluate(()=>document.querySelector('#domino-chat').click());await a.waitForSelector('#domino-panel[hidden]');await a.type('#compose','Message during domino');await a.click('#send');
 await b.waitForFunction(()=>!document.querySelector('.domino-head .game-chat-unread').hidden);assert.equal(await b.$eval('.game-chat-unread span',n=>n.textContent),'1');
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM message_reads').get().n,0);
 await b.screenshot({path:'/tmp/domino-auto-message.png'});await b.click('.domino-head .game-chat-unread');await b.waitForSelector('#domino-panel[hidden]');await b.waitForFunction(()=>document.querySelector('.domino-head .game-chat-unread').hidden);
 await b.evaluate(()=>document.querySelector('[data-tab="together"]').click());await b.click('#ocho-open');await b.click('#ocho-size');
 await a.type('#compose','Message during Ocho');await a.click('#send');await b.waitForFunction(()=>!document.querySelector('.ocho-head .game-chat-unread').hidden);assert.equal(await b.$eval('.ocho-head .game-chat-unread span',n=>n.textContent),'1');
 await b.click('.ocho-head .game-chat-unread');await b.waitForSelector('#ocho-panel[hidden]');await b.waitForFunction(()=>document.querySelector('.ocho-head .game-chat-unread').hidden);assert.ok(await b.$('.draw-head .game-chat-unread'));
 assert.deepEqual(errors,[]);console.log('PASS: readable 28-tile automatic layouts in solo/shared across mobile and landscape; fullscreen message badge opens chat and clears only after read.');
}finally{await Promise.all(browsers.map(b=>b.close()));server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(directory,{recursive:true,force:true});}
