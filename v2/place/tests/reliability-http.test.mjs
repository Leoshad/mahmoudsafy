import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';

test('authenticated realtime sends small segments to new clients and snapshots to older clients',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const store=new Store(':memory:');
 const authFetch=async(url,options)=>{const name=url.includes('/token?')?JSON.parse(options.body).email.split('@')[0]:options.headers.Authorization.split(' ')[1];const user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test-secret-with-more-than-thirty-two-characters',testing:true,authFetch});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,controllers=[];
 try{
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:'mahmoud@example.test',password:'testing'})});const cookie=login.headers.get('set-cookie').split(';')[0];await login.json();
 async function stream(path){const controller=new AbortController();controllers.push(controller);const r=await fetch(base+path,{headers:{Cookie:cookie},signal:controller.signal});const reader=r.body.getReader();let buffered='';return async event=>{while(true){const end=buffered.indexOf('\n\n');if(end>=0){const frame=buffered.slice(0,end);buffered=buffered.slice(end+2);if(frame.includes('event: '+event+'\n'))return JSON.parse(frame.split('data: ')[1]);continue;}const chunk=await reader.read();if(chunk.done)throw Error('Stream ended');buffered+=new TextDecoder().decode(chunk.value);}};}
 const modern=await stream('/api/events?draw=segments'),legacy=await stream('/api/events');await modern('snapshot');await legacy('snapshot');
 const data={mode:'shared',boardId:store.state().draw.shared.id,strokeId:randomUUID(),offset:0,color:'#ff0000',width:5,tool:'pen',points:[[.1,.1],[.2,.2]]};const id=randomUUID();
 const command=()=>fetch(base+'/api/command',{method:'POST',headers:{Cookie:cookie,Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({id,type:'draw.stroke',data})}).then(r=>r.json());
 const result=await command();assert.equal(result.ok,true);const delta=await modern('draw-segment'),snapshot=await legacy('snapshot');assert.equal(delta.stroke.points.length,2);assert.equal(snapshot.draw.shared.strokes[0].points.length,2);assert.equal(delta.messages,undefined);assert.equal(delta.match,undefined);
 await command();const duplicate=await modern('draw-segment');assert.deepEqual(duplicate,delta);assert.equal(store.state().draw.shared.strokes[0].points.length,2);
 }finally{for(const c of controllers)c.abort();await new Promise(resolve=>server.close(resolve));store.close();}
});
