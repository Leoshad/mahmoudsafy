import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {serveVideo} from '../static-video.mjs';

test('hug video supports full playback, phone byte ranges, suffixes and HEAD',async()=>{
 const file=new URL('../public/hug-motion.mp4',import.meta.url),bytes=readFileSync(file);
 const server=http.createServer((req,res)=>serveVideo(req,res,file));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  let r=await fetch(url);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
  r=await fetch(url,{headers:{Range:'bytes=0-1'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes 0-1/${bytes.length}`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(0,2));
  r=await fetch(url,{headers:{Range:'bytes=-20'}});assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(-20));
  r=await fetch(url,{headers:{Range:`bytes=${bytes.length}-`}});assert.equal(r.status,416);
  r=await fetch(url,{method:'HEAD'});assert.equal(r.headers.get('content-length'),String(bytes.length));assert.equal((await r.arrayBuffer()).byteLength,0);
 }finally{await new Promise(r=>server.close(r));}
});
