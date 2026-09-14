import {randomBytes,createHash} from 'node:crypto';
import {check,names,Fault} from './domain.mjs';
export function accountSchema(store){store.db.exec(`
CREATE TABLE IF NOT EXISTS account_emails(name TEXT PRIMARY KEY,email TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_versions(name TEXT PRIMARY KEY,version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS account_sessions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_flows(id TEXT PRIMARY KEY,body TEXT NOT NULL,expires INTEGER NOT NULL);`);}
export function identify(store,user,{existingOnly=false}={}){
 check(user?.id&&user.email_confirmed_at,'Confirm your email before signing in.',403);
 let name=store.db.prepare('SELECT name FROM identities WHERE uid=?').get(user.id)?.name;
 if(!name&&!existingOnly){name=names.find(n=>process.env[n.toUpperCase()+'_EMAIL']?.trim().toLowerCase()===user.email?.toLowerCase());check(name,'This account is not invited to Our Place.',403);store.identity(name,user.id);}
 check(names.includes(name),'This account is not invited to Our Place.',403);
 store.db.prepare('INSERT INTO account_emails VALUES(?,?) ON CONFLICT(name) DO UPDATE SET email=excluded.email').run(name,user.email.toLowerCase());return name;
}
export function version(store,who){return store.db.prepare('SELECT version FROM account_versions WHERE name=?').get(who)?.version??0;}
export function bindSession(store,sid,who,{fresh=false}={}){
 const v=version(store,who),old=store.db.prepare('SELECT * FROM account_sessions WHERE id=?').get(sid);
 check(fresh||old?.owner===who&&old.version===v||!old&&v===0,'Your password changed. Please sign in again.',401);
 store.db.prepare('INSERT INTO account_sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,version=excluded.version').run(sid,who,v);
}
export function password(value){check(typeof value==='string'&&value.length>=12&&value.length<=128,'Use a password between 12 and 128 characters.');return value;}
export function email(value){check(typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),'Enter a valid email address.');return value.trim().toLowerCase();}
export function accountRoutes({store,origin,sb,auth,body,send,limit,seal,open,issue,notifications,closeOthers,clearCache,testing}){
 accountSchema(store);const flowCookie=testing?'ms_recovery':'__Host-ms_recovery';
 function setFlow(res,id,max=1800){res.setHeader('Set-Cookie',`${flowCookie}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${max}${testing?'':'; Secure'}`);}
 function flow(req){const id=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(flowCookie+'='))?.slice(flowCookie.length+1);check(id&&/^[\w-]{43}$/.test(id),'Open the reset link in the same browser where you requested it.',401);const row=store.db.prepare('SELECT * FROM recovery_flows WHERE id=? AND expires>?').get(id,Date.now());check(row,'This reset request expired. Request a new link.',401);return {id,...open(row.body)};}
 function saveFlow(id,data){store.db.prepare('INSERT OR REPLACE INTO recovery_flows VALUES(?,?,?)').run(id,seal(data),Date.now()+1800000);}
 function revoke(who,keep){store.tx(()=>{const v=version(store,who)+1;store.db.prepare('INSERT INTO account_versions VALUES(?,?) ON CONFLICT(name) DO UPDATE SET version=excluded.version').run(who,v);for(const row of store.db.prepare('SELECT id FROM account_sessions WHERE owner=? AND id<>?').all(who,keep||'')){notifications.logout(row.id);store.db.prepare('DELETE FROM sessions WHERE id=?').run(row.id);store.db.prepare('DELETE FROM account_sessions WHERE id=?').run(row.id);}if(keep)store.db.prepare('UPDATE account_sessions SET version=? WHERE id=?').run(v,keep);});clearCache();closeOthers(who,keep);}
 async function reauthenticate(req,res,who,current){check(typeof current==='string'&&current.length>0&&current.length<=1024,'Enter your current password.');const user=await sb('user',null,req.authSession.token);check(identify(store,user)===who,'Account changed. Please sign in again.',401);const t=await sb('token?grant_type=password',{email:user.email,password:current});check(t.user?.id===user.id,'Could not verify your current password.',401);return t;}
 async function finishPassword(req,res,who,t,value,keep){
  await sb('user',{password:password(value)},t.access_token,'PUT');revoke(who,keep);
  try{await sb('logout?scope=others',{},t.access_token);}catch{console.error('Provider session cleanup failed; local sessions revoked.');}
  issue(res,t,who,keep);return send(res,200,{ok:true,message:'Password updated successfully.'});
 }
 return async function handle(req,res,path){
  if(!path.startsWith('/api/account')&&!path.startsWith('/api/recovery'))return false;
  const post=req.method==='POST';check(post||req.method==='GET','Method not allowed.',405);
  if(path==='/api/recovery/request'&&post){limit('recover:'+req.socket.remoteAddress,5,3600000);const data=await body(req,8000),address=email(data.email),id=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
   store.db.prepare('DELETE FROM recovery_flows WHERE expires<?').run(Date.now());
   const known=store.db.prepare('SELECT 1 FROM account_emails WHERE email=?').get(address)||names.some(n=>process.env[n.toUpperCase()+'_EMAIL']?.trim().toLowerCase()===address);
   if(known)await sb('recover?redirect_to='+encodeURIComponent(origin+'/'),{email:address,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256'});
   saveFlow(id,{email:address,verifier});setFlow(res,id);send(res,200,{ok:true,message:'If this is your account email, a reset link is on its way. Open it in this same browser.'});return true;
  }
  if(path==='/api/recovery/exchange'&&post){limit('recovery-exchange:'+req.socket.remoteAddress,15);const f=flow(req),data=await body(req,8000);check(!f.tokens&&typeof data.code==='string'&&data.code.length<=512,'Invalid reset link.');
   const t=await sb('token?grant_type=pkce',{auth_code:data.code,code_verifier:f.verifier});const user=await sb('user',null,t.access_token);check(user.email?.toLowerCase()===f.email,'This reset link belongs to a different request.',403);const who=identify(store,user);saveFlow(f.id,{email:f.email,who,tokens:t});send(res,200,{ok:true});return true;
  }
  if(path==='/api/recovery/finish'&&post){limit('recovery-finish:'+req.socket.remoteAddress,10);const f=flow(req);check(f.tokens&&names.includes(f.who),'Verify your reset link first.',401);const data=await body(req,8000);check(data.password===data.confirm,'The new passwords do not match.');password(data.password);
   // Consume before the provider mutation: failures require a fresh recovery request, never a replay.
   store.db.prepare('DELETE FROM recovery_flows WHERE id=?').run(f.id);
   await finishPassword(req,res,f.who,f.tokens,data.password,null);return true;
  }
  if(path.startsWith('/api/recovery'))throw new Fault('Not found.',404);
  const who=await auth(req,res);limit('account:'+who,20);
  if(path==='/api/account'&&!post){const u=await sb('user',null,req.authSession.token);check(identify(store,u)===who,'Account changed.',401);send(res,200,{email:u.email,pendingEmail:u.new_email||null});return true;}
  if(path==='/api/account/password'&&post){const data=await body(req,8000);check(data.password===data.confirm,'The new passwords do not match.');password(data.password);check(data.password!==data.current,'Choose a different new password.');const t=await reauthenticate(req,res,who,data.current);await finishPassword(req,res,who,t,data.password,req.sessionId);return true;}
  if(path==='/api/account/email'&&post){const data=await body(req,8000),address=email(data.email),t=await reauthenticate(req,res,who,data.current);check(address!==t.user.email.toLowerCase(),'This is already your email address.');
   await sb('user?redirect_to='+encodeURIComponent(origin+'/'),{email:address},t.access_token,'PUT');
   // Keep the current device signed in with the freshly verified session.
   issue(res,t,who,req.sessionId);send(res,200,{ok:true,message:'Check your current and new inboxes. Complete the confirmation emails before using your new email.'});return true;
  }
  throw new Fault('Not found.',404);
 };
}
