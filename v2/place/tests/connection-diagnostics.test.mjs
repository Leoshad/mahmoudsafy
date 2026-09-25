import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {configureConnectionServer,observeConnection} from '../connection-http.mjs';

test('health request is correlated without logging credentials, and idle connection survives the old five second limit',async()=>{
  const records=[];
  const server=http.createServer((req,res)=>{observeConnection(req,res,r=>records.push(r));res.end('ok');});
  configureConnectionServer(server);
  const agent=new http.Agent({keepAlive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const request=()=>new Promise((resolve,reject)=>{
    const req=http.get({host:'127.0.0.1',port:server.address().port,path:'/api/health?secret=never-log',agent,headers:{Cookie:'private-cookie'}},res=>{
      res.resume();res.on('end',()=>resolve({id:res.headers['x-request-id'],reused:req.reusedSocket}));
    });req.on('error',reject);
  });
  try{
    const first=await request();
    await new Promise(r=>setTimeout(r,5300));
    const second=await request();
    assert.equal(second.reused,true);
    assert.notEqual(first.id,second.id);
    for(const id of [first.id,second.id])assert.deepEqual(records.filter(r=>r.request_id===id).map(r=>r.phase),['received','finished']);
    assert.equal(records.at(-1).status,200);
    assert.doesNotMatch(JSON.stringify(records),/never-log|private-cookie/);
  }finally{agent.destroy();await new Promise(r=>server.close(r));}
});

test('an unfinished health response records arrival and abort, not a successful response',async()=>{
  const records=[];let arrived,aborted;
  const closed=new Promise(r=>aborted=r);
  const received=new Promise(r=>arrived=r);
  const server=http.createServer((req,res)=>{observeConnection(req,res,r=>{records.push(r);if(r.phase==='aborted')aborted();});arrived();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const req=http.get({host:'127.0.0.1',port:server.address().port,path:'/api/health'});
  req.on('error',()=>{});
  try{
    await received;req.destroy();await closed;
    await new Promise(r=>server.close(r));
    assert.deepEqual(records.map(r=>r.phase),['received','aborted']);
    assert.equal(records[1].status,null);
  }finally{req.destroy();server.closeAllConnections();server.close();}
});
