import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';
import {accountSchema,identify,bindSession,version} from '../account.mjs';
async function setup(t){
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';
 const store=new Store(':memory:'),users=new Map(['mahmoud','safy'].map(n=>[n,{id:n+'-uid',email:n+'@example.test',email_confirmed_at:'2026-01-01',password:'old-password-123'}])),tokens=new Map(),calls=[],recoveries=[];let counter=0;
 const result=u=>{const token='t'+(++counter);tokens.set(token,u);const {password,...user}=u;return {user,access_token:token,refresh_token:token,expires_in:3600};};
 const authFetch=async(raw,opts)=>{const url=new URL(raw),p=url.pathname.replace('/auth/v1/',''),data=opts.body?JSON.parse(opts.body):null,token=opts.headers.Authorization?.slice(7),u=tokens.get(token);calls.push({path:p,query:url.search,method:opts.method,data});
 if(p==='token'&&url.searchParams.get('grant_type')==='password'){const user=[...users.values()].find(u=>u.email===data.email&&u.password===data.password);return user?Response.json(result(user)):Response.json({error_code:'invalid_credentials'},{status:400});}
 if(p==='recover'){recoveries.push(data);return Response.json({});}
 if(p==='token'&&url.searchParams.get('grant_type')==='pkce'){const r=recoveries.at(-1);if(!r||data.auth_code!=='valid-code'||r.used||createHash('sha256').update(data.code_verifier).digest('base64url')!==r.code_challenge)return Response.json({error_code:'otp_expired'},{status:400});r.used=true;return Response.json(result([...users.values()].find(u=>u.email===r.email)));}
 if(p==='user'&&u){if(opts.method==='PUT'){if(data.password)u.password=data.password;if(data.email)u.new_email=data.email;}const {password,...user}=u;return Response.json(user);}
 if(p==='logout'&&u)return new Response(null,{status:204});
 return Response.json({},{status:401});};
 const server=createApp({store,origin:'http://localhost',secret:'account-tests-secret-at-least-thirty-two-characters',testing:true,authFetch});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));store.close();});const base='http://127.0.0.1:'+server.address().port;
 const cookies={};async function req(device,path,data,origin='http://localhost'){const cookie=Object.entries(cookies[device]||{}).map(([k,v])=>k+'='+v).join('; ');const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});for(const c of r.headers.getSetCookie()){const [key,...v]=c.split(';')[0].split('=');(cookies[device]??={})[key]=v.join('=');}return {status:r.status,body:await r.json()};}
 const login=(device,name)=>req(device,'login',{email:users.get(name).email,password:users.get(name).password});return {store,users,calls,recoveries,cookies,req,login};
}
test('password change verifies current password, retains this device and revokes only this account’s other sessions',async t=>{
 const f=await setup(t);await f.login('m','mahmoud');await f.login('s1','safy');await f.login('s2','safy');const before=f.store.state();
 assert.equal((await f.req('s1','account/password',{current:'wrong',password:'new-password-456',confirm:'new-password-456'})).status,401);
 assert.equal((await f.req('s1','account/password',{current:'old-password-123',password:'new-password-456',confirm:'different-password'})).status,400);
 assert.equal((await f.req('s1','account/password',{current:'old-password-123',password:'new-password-456',confirm:'new-password-456'},'http://evil.test')).status,403);
 assert.equal((await f.req('s1','account/password',{current:'old-password-123',password:'new-password-456',confirm:'new-password-456'})).status,200);
 assert.equal((await f.req('s1','state')).status,200);assert.equal((await f.req('s2','state')).status,401);assert.equal((await f.req('m','state')).status,200);assert.deepEqual(f.store.state(),before);assert.ok(f.calls.some(c=>c.path==='logout'&&c.query==='?scope=others'));
 assert.equal((await f.req('old','login',{email:'safy@example.test',password:'old-password-123'})).status,401);assert.equal((await f.login('new','safy')).status,200);
});
test('confirmed email changes preserve identity, pending email cannot log in, and retired email cannot claim a bound account',async t=>{
 const f=await setup(t);await f.login('s','safy');assert.equal((await f.req('s','account/email',{email:'safy-new@example.test',current:'old-password-123'})).status,200);
 assert.equal((await f.req('s','account')).body.pendingEmail,'safy-new@example.test');assert.equal((await f.req('pending','login',{email:'safy-new@example.test',password:'old-password-123'})).status,401);
 const u=f.users.get('safy');u.email=u.new_email;delete u.new_email;assert.equal((await f.login('new','safy')).body.who,'Safy');assert.equal((await f.req('s','account')).body.email,'safy-new@example.test');
 assert.throws(()=>identify(f.store,{id:'impostor',email:'safy@example.test',email_confirmed_at:'yes',user_metadata:{name:'Safy'}}));assert.equal(f.store.db.prepare("SELECT uid FROM identities WHERE name='Safy'").get().uid,'safy-uid');
});
test('recovery uses a request-bound PKCE verifier and cannot expose normal app access before password reset',async t=>{
 const f=await setup(t);await f.login('s','safy');await f.login('m','mahmoud');
 const requested=await f.req('recovery','recovery/request',{email:'safy@example.test'});assert.equal(requested.status,200);assert.equal(f.recoveries.length,1);
 assert.equal((await f.req('other-browser','recovery/exchange',{code:'valid-code'})).status,401);
 assert.equal((await f.req('recovery','recovery/exchange',{code:'bad'})).status,401);
 assert.equal((await f.req('recovery','recovery/exchange',{code:'valid-code'})).status,200);
 assert.equal((await f.req('recovery','state')).status,401);assert.equal((await f.req('recovery','recovery/exchange',{code:'valid-code'})).status,400);
 assert.equal((await f.req('recovery','recovery/finish',{password:' reset-password-789 ',confirm:' reset-password-789 '})).status,200);
 assert.equal((await f.req('recovery','state')).body.who,'Safy');assert.equal((await f.req('s','state')).status,401);assert.equal((await f.req('m','state')).status,200);
 assert.equal((await f.req('recovery','recovery/finish',{password:'another-password',confirm:'another-password'})).status,401);
 assert.equal((await f.login('fresh','safy')).status,200);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM recovery_flows').get().n,0);
});
test('unknown recovery requests do not send email or reveal membership; new passwords and endpoints are bounded',async t=>{
 const f=await setup(t);const unknown=await f.req('x','recovery/request',{email:'stranger@example.test'});assert.equal(unknown.status,200);assert.equal(f.recoveries.length,0);assert.ok(!JSON.stringify(unknown.body).includes('stranger'));
 assert.equal((await f.req('x','account/password',{current:'x',password:'123',confirm:'123'})).status,401);await f.login('s','safy');assert.equal((await f.req('s','account/password',{current:'old-password-123',password:'123',confirm:'123'})).status,400);
});
test('legacy session binding is allowed only before a credential change',()=>{const store=new Store(':memory:');try{accountSchema(store);bindSession(store,'old','Safy');store.db.prepare('INSERT INTO account_versions VALUES(?,?)').run('Safy',1);assert.throws(()=>bindSession(store,'old','Safy'));assert.throws(()=>bindSession(store,'unknown-legacy','Safy'));bindSession(store,'new','Safy',{fresh:true});assert.equal(version(store,'Safy'),1);bindSession(store,'new','Safy');}finally{store.close();}});
