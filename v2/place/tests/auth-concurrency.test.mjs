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
