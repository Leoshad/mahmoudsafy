import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';import assert from 'node:assert/strict';import {writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
const store=new Store(':memory:'),server=createApp({store,origin:'http://localhost',secret:'video-browser-test-secret-long-enough',testing:true,authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1],user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,pages=[],errors=[],requests=[],directory=await mkdtemp(join(tmpdir(),'our-video-'));const fixture=join(directory,'test-song.mp3');await writeFile(fixture,Buffer.concat([Buffer.from([255,251,144,0]),Buffer.alloc(1000)]));const songFile=process.env.SONG_FILE||fixture;
const browsers=[];
try{
 for(const name of ['mahmoud']){const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"],headless:true,pipe:true});browsers.push(browser);const page=await browser.newPage();pages.push(page);await page.setViewport({width:390,height:740,isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.test',password:'test'})});const cookie=login.headers.get('set-cookie').split(';')[0];await page.setCookie({name:'ms_place',value:cookie.slice(cookie.indexOf('=')+1),url:base});await page.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{value:()=>true});Object.defineProperty(document,'hidden',{get:()=>false});Object.defineProperty(document,'visibilityState',{get:()=> 'visible'});});await page.setRequestInterception(true);page.on('request',r=>{requests.push({who:name,url:r.url(),method:r.method()});const headers={...r.headers()};if(r.method()==='POST')headers.origin='http://localhost';void r.continue({headers});});await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('#welcome-splash[hidden]');}

 const page=pages[0];await page.click('[data-tab="together"]');await page.click('#our-playlist summary');
 const [chooser]=await Promise.all([page.waitForFileChooser(),page.click('#our-playlist [aria-label="+ Add songs"]')]);
 await page.evaluate(async()=>{const s=await fetch('/api/state').then(r=>r.json());s.playlist.revision++;window.OurPlaylist.sync(s);});
 await chooser.accept([songFile]);
 await page.waitForFunction(()=>document.querySelectorAll('.playlist-track').length>0,{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('#playlist-status').textContent==='Song added to Our Playlist.');
 await (await page.$('#playlist-song-upload')).uploadFile(songFile);
 await page.waitForFunction(()=>document.querySelector('#playlist-status').textContent==='This song is already in Our Playlist.');
 assert.equal(store.state().playlist.tracks.length,1);
 await page.setRequestInterception(false);await page.setRequestInterception(true);
 page.removeAllListeners('request');page.on('request',r=>{if(r.url().endsWith('/api/voices')&&r.method()==='POST')return void r.respond({status:413,contentType:'application/json',body:JSON.stringify({error:'Voice storage is full.'})});const headers={...r.headers()};if(r.method()==='POST')headers.origin='http://localhost';void r.continue({headers});});
 await (await page.$('#playlist-song-upload')).uploadFile(songFile);
 await page.waitForFunction(()=>document.querySelector('#playlist-status').textContent==='Voice storage is full.');
 assert.equal(errors.length,0);console.log('PASS: MP3 upload, snapshot during picker, duplicate feedback, storage error visible, no browser errors');
}finally{for(const b of browsers)await b.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(directory,{recursive:true,force:true});}
