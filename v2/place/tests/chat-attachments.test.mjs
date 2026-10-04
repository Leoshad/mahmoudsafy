import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {Store} from '../store.mjs';import {createApp} from '../server.mjs';import {unusedPhotos} from '../photo-storage.mjs';
test('albums and PDFs: shared delivery, private drafts, retry, export and retained photos',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';const store=new Store(':memory:'),cookies={};
 const server=createApp({store,origin:'http://localhost',secret:'attachments-test-secret-long-enough',testing:true,authFetch:async(url,o)=>{const name=url.includes('/token?')?JSON.parse(o.body).email.split('@')[0]:o.headers.Authorization.split(' ')[1],user={id:name,email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const req=(who,path,data)=>fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookies[who]||'',Origin:'http://localhost','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 try{for(const name of ['mahmoud','safy']){const r=await req(name,'login',{email:name+'@example.test',password:'test'});cookies[name]=r.headers.get('set-cookie').split(';')[0];}
 const images=[];for(let i=0;i<3;i++){const id=randomUUID();store.db.prepare('INSERT INTO photos VALUES(?,?,?,?)').run(id,'image/png',Buffer.from('photo'),'2026-01-01');images.push(id);}
 const album={id:randomUUID(),type:'message',data:{text:'Our photos',images}};assert.equal((await req('mahmoud','command',album)).status,200);assert.equal((await req('mahmoud','command',album)).status,200);assert.equal(store.messages().length,1);assert.deepEqual(JSON.parse(store.messages()[0].images),images);
 unusedPhotos(store,0);assert.deepEqual(unusedPhotos(store,9*86400000),[]);
 const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');const upload=await req('mahmoud','documents',{name:'our-plan.pdf',data:pdf.toString('base64')});assert.equal(upload.status,201);const d=await upload.json();assert.equal((await req('safy','documents/'+d.id)).status,404);assert.equal((await req('nobody','documents/'+d.id)).status,401);
 const message={id:randomUUID(),type:'message',data:{text:'Plan',document:d.id}};assert.equal((await req('mahmoud','command',message)).status,200);const download=await req('safy','documents/'+d.id+'?download=1');assert.equal(download.headers.get('content-type'),'application/pdf');assert.match(download.headers.get('content-disposition'),/^attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
 const state=await (await req('safy','state')).json();assert.equal(state.messages.find(m=>m.id===message.id).document,d.id);
 const archive=await (await req('mahmoud','export')).json();for(const id of images)assert.ok(archive.photos[id]);assert.equal(archive.documents[d.id].data,pdf.toString('base64'));
 assert.equal((await req('mahmoud','documents',{name:'bad.pdf',data:Buffer.from('<html>bad</html>').toString('base64')})).status,400);
 for(const data of [{images:[...images,...images]},{images:Array.from({length:11},()=>randomUUID())},{images,document:d.id},{images:['missing']}])assert.notEqual((await req('mahmoud','command',{id:randomUUID(),type:'message',data})).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});
