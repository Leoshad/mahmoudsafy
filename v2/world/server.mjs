import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { z } from 'zod';
import { Store } from './store.mjs';
import { publicState } from './domain.mjs';
import { createEngine } from './engine.mjs';
import { makeProvider } from './provider.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function createApp({store,origin,secret,credentials,provider=null}){
  if(!secret||secret.length<32||Object.values(credentials).some(s=>!s||s.length<24)||credentials.Mahmoud===credentials.Safy)throw Error('Distinct private trial passphrases and a session secret are required');
  const app=express(),command=createEngine(store,provider), secure=new URL(origin).protocol==='https:';
  const cookie=secure?'__Host-world':'world-local', sign=text=>createHmac('sha256',secret).update(text).digest('base64url');
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});next();});
  app.use(express.json({limit:'8kb'}));
  app.use('/api',(req,res,next)=>{
    if(req.method!=='GET'&&(req.headers.origin!==origin||!req.is('application/json')))return res.status(403).json({error:'Request origin is not allowed'});
    next();
  });
  const attempts=new Map();
  app.post('/api/login',(req,res)=>{
    const ip=req.socket.remoteAddress??'unknown',now=Date.now(),past=attempts.get(ip);
    const item=past&&past.until>now?past:{count:0,until:now+60000};attempts.set(ip,item);
    for(const [k,v]of attempts)if(v.until<=now)attempts.delete(k);
    if(++item.count>8)return res.status(429).json({error:'Wait a minute before trying again'});
    const {actor,passphrase}=req.body??{};
    if(!['Mahmoud','Safy'].includes(actor)||typeof passphrase!=='string'||!equal(passphrase,credentials[actor]))return res.status(401).json({error:'Check your private access details'});
    const payload=Buffer.from(JSON.stringify({actor,exp:now+8*3600000})).toString('base64url');
    res.setHeader('Set-Cookie',`${cookie}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`);
    res.json({ok:true});
  });
  app.get('/api/health',(req,res)=>res.json({ok:true,kind:'world-trial'}));
  app.use('/api',(req,res,next)=>{
    try{
      const raw=(req.headers.cookie??'').split('; ').find(c=>c.startsWith(cookie+'='))?.slice(cookie.length+1)??'';
      const [payload,signature]=raw.split('.');if(!signature||!equal(signature,sign(payload)))throw Error();
      const session=JSON.parse(Buffer.from(payload,'base64url').toString());
      if(!['Mahmoud','Safy'].includes(session.actor)||session.exp<Date.now())throw Error();req.actor=session.actor;next();
    }catch{return res.status(401).json({error:'Sign in to your world'});}
  });
  app.get('/api/state',(req,res)=>res.json(publicState(store.read(),req.actor,!!provider)));
  app.post('/api/logout',(req,res)=>{res.setHeader('Set-Cookie',`${cookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);res.json({ok:true});});
  app.post('/api/command',async(req,res)=>{
    try{const result=await command(req.actor,req.body);res.json(result);}
    catch(e){res.status(e instanceof z.ZodError?400:e.status??500).json({error:e instanceof z.ZodError?'Invalid command':e.status?e.message:'The request could not be saved'});}
  });
  app.use(express.static(join(root,'public')));
  app.use((err,req,res,next)=>res.status(400).json({error:'Invalid request'}));
  return app;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const {WORLD_DB_PATH,WORLD_ORIGIN,WORLD_SESSION_SECRET,MAHMOUD_PASSPHRASE,SAFY_PASSPHRASE,OPENAI_API_KEY}=process.env;
  if(!WORLD_DB_PATH||!isAbsolute(WORLD_DB_PATH)||!WORLD_ORIGIN)throw Error('An absolute durable WORLD_DB_PATH and WORLD_ORIGIN are required');
  const url=new URL(WORLD_ORIGIN);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('HTTPS is required outside localhost');
  const store=new Store(WORLD_DB_PATH);
  const app=createApp({store,origin:url.origin,secret:WORLD_SESSION_SECRET,credentials:{Mahmoud:MAHMOUD_PASSPHRASE,Safy:SAFY_PASSPHRASE},provider:OPENAI_API_KEY?makeProvider(OPENAI_API_KEY):null});
  const server=app.listen(Number(process.env.PORT??4174),'0.0.0.0',()=>console.log('World trial server ready; secrets are never logged.'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
}
