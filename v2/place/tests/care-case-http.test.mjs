import test from 'node:test';import assert from 'node:assert/strict';import {Store} from '../store.mjs';import {createApp,carePaperTable} from '../server.mjs';
test('Mahmoud uploads a case photo into its slot; both of them can open it; Safy cannot upload',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:');carePaperTable(store);
 const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1],user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'test secret with over thirty characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={},controllers=[];

 const post=async(who,path,data)=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:'http://localhost',Cookie:cookies[who]||'','Content-Type':'application/json'},body:JSON.stringify(data)});
 try{for(const who of ['mahmoud','safy']){const r=await post(who,'login',{email:who+'@example.test',password:'test'});cookies[who]=r.headers.get('set-cookie').split(';')[0];await r.json();}
  store.tx(()=>{const s=store.state();s.care={cases:[{id:'k1',title:'Case',photoSlots:[{key:'rx',label:'Prescription'}]}]};store.save(s);});
  const jpg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,217]).toString('base64');
  assert.equal((await post('safy','care/papers',{data:jpg,caseId:'k1',slot:'rx'})).status,403);
  const up=await post('mahmoud','care/papers',{data:jpg,caseId:'k1',slot:'rx'});assert.equal(up.status,200);const {id}=await up.json();
  assert.equal(store.state().care.cases[0].photos[0].label,'Prescription');assert.equal((store.state().care.papers??[]).length,0);
  for(const who of ['mahmoud','safy']){const r=await fetch(base+'/api/care/papers/'+id,{headers:{Cookie:cookies[who]}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.match(r.headers.get('content-disposition'),/Prescription\.jpg/);}
  assert.equal((await fetch(base+'/api/care/papers/'+id)).status,401);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
