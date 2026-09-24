// Run from v2/place: node tests/shared-hug-browser-check.mjs
// Separate browser processes simulate two devices; foreground is forced only in this harness.
import {tmpdir} from 'node:os';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {SharedTouch} from '../shared-touch.mjs';
import {serveVideo} from '../static-video.mjs';
const saved=[],model=new SharedTouch({onComplete:m=>saved.push({...m})});
const html=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#171219;color:#fff;font-family:system-ui}.conversation-window{position:relative;height:560px;border:1px solid #725169;border-radius:18px;margin:24px 8px;overflow:hidden}#timeline{height:100%;overflow:auto}#feed{height:560px;position:relative}.message{position:absolute;top:430px}button{font:inherit}</style><link rel="stylesheet" href="/shared-touch.css"><div id="our-place-trial"><div id="app"><section id="chat"><div class="conversation-window"><div id="timeline"><div id="feed"><p class="message">Our Chat</p></div></div></div></section></div></div><script src="/shared-touch.js"></script>`;
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/hug-motion.mp4')return serveVideo(req,res,'public/hug-motion.mp4');if(url.pathname==='/api'){let b='';for await(const chunk of req)b+=chunk;try{const who=url.searchParams.get('who');res.end(JSON.stringify({moment:model.action(who,who,JSON.parse(b))}));}catch(e){res.statusCode=e.status||409;res.end(JSON.stringify({error:e.message}));}return;}if(url.pathname==='/moment'){res.end(JSON.stringify(model.view()));return;}if(['/shared-touch.css','/shared-touch.js'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(fs.readFileSync('public'+url.pathname));return;}res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,tick=setInterval(()=>model.tick(),50);
const browsers=[],pages=[],errors=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
for(const who of ['Mahmoud','Safy']){const browser=await puppeteer.launch({headless:true,args:chromium.args,executablePath:await chromium.executablePath()});browsers.push(browser);const page=await browser.newPage();pages.push(page);await page.setViewport({width:390,height:740});page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.evaluate(who=>{Object.defineProperty(document,'hasFocus',{value:()=>true});Object.defineProperty(document,'hidden',{get:()=>false});window.addEventListener('blur',e=>e.stopImmediatePropagation(),true);window.OurTouch.init({api:async(_,data)=>{const r=await fetch('/api?who='+who,{method:'POST',body:JSON.stringify(data)}),v=await r.json();if(!r.ok)throw Error(v.error);return v;},error:e=>{window.lastError=e.message;}});window.OurTouch.sync({who});setInterval(async()=>window.OurTouch.receive(await(await fetch('/moment')).json()),100);},who);await page.waitForFunction(()=>document.querySelector('video').readyState>=2,{timeout:10000});console.log('loaded',who);}
await wait(1200);
const swipe=async(page,kind)=>page.evaluate(kind=>{const t=document.querySelector('#timeline');const y=kind==='hug'?540:280,x=kind==='hug'?195:20;t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0,pointerId:1,clientX:x,clientY:y}));window.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',pointerId:1,clientX:kind==='hug'?195:260,clientY:kind==='hug'?190:280}));window.dispatchEvent(new PointerEvent('pointerup',{pointerType:'mouse',pointerId:1}));},kind);
const hold=page=>page.evaluate(()=>document.querySelector('.touch-thumb').dispatchEvent(new KeyboardEvent('keydown',{key:' '})));
const release=page=>page.evaluate(()=>document.querySelector('.touch-thumb').dispatchEvent(new KeyboardEvent('keyup',{key:' '})));
await swipe(pages[0],'hug');await pages[1].waitForFunction(()=>!document.querySelector('#shared-touch').hidden);assert.match(await pages[1].$eval('.touch-ending',n=>n.textContent),/Mahmoud wants to hold you/);
await hold(pages[0]);await wait(600);assert.equal(model.view().progress,0);await hold(pages[1]);await wait(4400);assert.equal(model.view().done,true);assert.equal(saved.length,1);assert.equal(saved[0].kind,'hug');
for(const [i,p]of pages.entries()){assert.ok(await p.$eval('video',v=>v.currentTime)>3.8);await p.screenshot({path:tmpdir()+'/hug-client-'+i+'.png'});}
await release(pages[0]);await wait(2600);assert.ok(model.view());assert.equal(model.view().releaseAt,null);
await release(pages[1]);await wait(500);await hold(pages[0]);await wait(700);assert.equal(model.view().releaseAt,null);await release(pages[0]);await wait(3300);for(const p of pages)assert.equal(await p.$eval('#shared-touch',n=>n.hidden),true);
await swipe(pages[1],'hug');await pages[0].waitForFunction(()=>!document.querySelector('#shared-touch').hidden);assert.match(await pages[0].$eval('.touch-ending',n=>n.textContent),/Safy wants to hold you/);
await pages[1].evaluate(()=>OurTouch.tab('wall'));await wait(1800);assert.equal(model.view(),null);assert.equal(await pages[0].$eval('#shared-touch',n=>n.hidden),true);
await swipe(pages[0],'touch');await wait(300);assert.equal(model.view(),null);assert.match(await pages[0].evaluate(()=>window.lastError),/both need Our Chat/);
assert.deepEqual(errors,[]);console.log('PASS: two independent browser processes; media playback; both initiators; four-second shared hold; one-hand persistence; release grace/repress/fade; chat readiness gate. Foreground simulated for two-device test.');
}finally{clearInterval(tick);await Promise.all(browsers.map(b=>b.close()));await new Promise(r=>server.close(r));}
