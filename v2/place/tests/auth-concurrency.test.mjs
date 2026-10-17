import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';

for(const scenario of ['verify','refresh','revoke'])test('concurrent connection auth: '+scenario,async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';
 const store=new Store(':memory:');let release,entered,users=0,refreshes=0;
 const blocked=new Promise(r=>release=r),called=new Promise(r=>entered=r);
 const user={id:'mahmoud-auth-test',email:'mahmoud@example.test',email_confirmed_at:'2026-01-01'};
 const authFetch=async(url)=>{
  if(url.includes('grant_type=password'))return Response.json({user,access_token:'first-token',refresh_token:'first-refresh',expires_in:scenario==='refresh'?1:3600});
  if(url.includes('grant_type=refresh_token')){refreshes++;entered();await blocked;return Response.json({access_token:'next-token',refresh_token:'next-refresh',expires_in:3600});}
  users++;if(scenario!=='refresh'){entered();await blocked;}return Response.json(user);
 };
 const server=createApp({store,origin:'http://localhost',secret:'concurrency-test-only-secret-long-enough',testing:true,authFetch});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'test-only'})});
  assert.equal(login.status,200);await login.json();const cookie=login.headers.get('set-cookie').split(';')[0];
  const pending=Array.from({length:6},()=>fetch(base+'/api/state',{headers:{Cookie:cookie}}));
  await called;await new Promise(r=>setTimeout(r,60));
  assert.equal(scenario==='refresh'?refreshes:users,1);
  if(scenario==='revoke')store.db.prepare('DELETE FROM sessions').run();
  release();const responses=await Promise.all(pending);
  for(const response of responses){assert.equal(response.status,scenario==='revoke'?401:200);await response.json();}
  if(scenario==='refresh'){assert.equal(refreshes,1);assert.equal(users,1);}
 }finally{release();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});

async function sessionFixture(run){
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';
 const store=new Store(':memory:'),originalNow=Date.now;let clock=originalNow(),server,base,refreshes=0,unavailable=false;
 Date.now=()=>clock;
 const user={id:'rotation-user',email:'mahmoud@example.test',email_confirmed_at:'2026-01-01'};
 const authFetch=async(url,opts)=>{
  if(unavailable)return Response.json({error_code:'unexpected_failure'},{status:503});
  if(url.includes('grant_type=password'))return Response.json({user,access_token:'access-0',refresh_token:'refresh-0',expires_in:1});
  if(url.includes('grant_type=refresh_token')){
   const supplied=JSON.parse(opts.body).refresh_token;
   if(supplied!=='refresh-'+refreshes)return Response.json({error_code:'refresh_token_already_used'},{status:400});
   refreshes++;return Response.json({access_token:'access-'+refreshes,refresh_token:'refresh-'+refreshes,expires_in:3600});
  }
  return Response.json(user);
 };
 async function start(){server=createApp({store,origin:'http://localhost',secret:'durable-session-test-only-secret-long',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;}
 async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));}
 const request=async(cookie,path='state',data)=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie||'',Origin:'http://localhost','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});await r.json();return r;};
 try{await start();const login=await request('','login',{email:user.email,password:'fixture'});const cookie=login.headers.get('set-cookie').split(';')[0];await run({store,cookie,request,advance:n=>clock+=n,get refreshes(){return refreshes;},setUnavailable:v=>unavailable=v,restart:async()=>{await stop();await start();}});}
 finally{Date.now=originalNow;await stop();store.close();}
}
test('lost refresh response and stale cookies survive successive rotations and server restart',()=>sessionFixture(async h=>{
 assert.equal((await h.request(h.cookie)).status,200);assert.equal(h.refreshes,1);
 assert.equal((await h.request(h.cookie)).status,200);assert.equal(h.refreshes,1);
 h.advance(3600000);assert.equal((await h.request(h.cookie)).status,200);assert.equal(h.refreshes,2);
 await h.restart();assert.equal((await h.request(h.cookie)).status,200);assert.equal(h.refreshes,2);
 const stored=h.store.db.prepare('SELECT body FROM session_credentials').get().body;assert.doesNotMatch(stored,/access-|refresh-/);
 assert.equal((await h.request(h.cookie,'logout',{})).status,200);
 assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM session_credentials').get().n,0);
 assert.equal((await h.request(h.cookie)).status,401);
}));
test('active session renews its seven-day inactivity window but expired sessions stay rejected',()=>sessionFixture(async h=>{
 h.advance(6*86400000);const renewed=await h.request(h.cookie);assert.equal(renewed.status,200);assert.ok(renewed.headers.get('set-cookie'));
 h.advance(2*86400000);assert.equal((await h.request(h.cookie)).status,200);
 h.advance(8*86400000);assert.equal((await h.request(h.cookie)).status,401);
}));
test('temporary auth outage returns retryable 503 and retains the session',()=>sessionFixture(async h=>{
 h.setUnavailable(true);assert.equal((await h.request(h.cookie)).status,503);
 assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
 h.setUnavailable(false);assert.equal((await h.request(h.cookie)).status,200);
}));
