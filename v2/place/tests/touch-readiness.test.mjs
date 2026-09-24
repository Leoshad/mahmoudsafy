import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/shared-touch.js',import.meta.url),'utf8');
test('slow optional readiness is coalesced; departure supersedes it immediately',async()=>{
 const calls=[],beacons=[];let active=true;
 const c={who:'Mahmoud',client:'test-client',seq:0,hugLoaded:true,AbortController,setTimeout,clearTimeout,visible:()=>active,fetch:async(_,options)=>beacons.push(JSON.parse(options.body)),hooks:{api:(_,data,signal)=>new Promise(resolve=>calls.push({data,signal,resolve}))}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('let readyFlight='),source.indexOf('setInterval(()=>{ready()')),c);
 for(let i=0;i<12;i++)c.ready();assert.equal(calls.length,1);
 active=false;c.ready(true);assert.equal(calls[0].signal.aborted,true);assert.equal(beacons[0].active,false);assert.ok(beacons[0].seq>calls[0].data.seq);
 active=true;c.ready();assert.equal(calls.length,2);calls[0].resolve();await new Promise(r=>setImmediate(r));c.ready();assert.equal(calls.length,2);calls[1].resolve();
});
