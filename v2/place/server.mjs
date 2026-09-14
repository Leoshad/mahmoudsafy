import {crownSnapshot} from './crown.mjs';
import {journeyView,journeySave} from './journey.mjs';
import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {Store,hash} from './store.mjs';
import {check,Fault,change,text,names} from './domain.mjs';
import {respond,MODEL} from './ai.mjs';
import {mediaChange,youtubeService} from './media.mjs';
import {ochoChange,ochoSnapshot,ochoTick,ochoDue} from './ocho.mjs';
import {dominoChange,dominoSnapshot,dominoTick,dominoDue} from './domino.mjs';
import {resolveOrigin} from './config.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const V2='https://hvjcugehjwqtrvzgbwnq.supabase.co';
const security={
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; style-src 'self'; img-src 'self' blob: https://i.ytimg.com; connect-src 'self' https://www.youtube.com; frame-src https://www.youtube.com 'self';  frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
export function createApp({store,origin,secret,authFetch=fetch,ai=respond,testing=false,mediaFetch=fetch}={}){
  check(typeof secret==='string'&&secret.length>=32,'SESSION_SECRET must have at least 32 characters.',503);
  check(origin&&(!origin.includes('oiwxwogdfjgrapigiqrw')),'A separate V2 APP_ORIGIN is required.',503);
  const key=Buffer.from(hash(secret),'hex'),cookieName=testing?'ms_place':'__Host-ms_place';
  const streams=new Map(),running=new Map(),cache=new Map(),rates=new Map();
  const youtube=youtubeService({fetcher:mediaFetch,reserve:()=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),key='youtube-search:'+day;store.tx(()=>{store.db.prepare('INSERT OR IGNORE INTO budget(key) VALUES(?)').run(key);check(store.db.prepare('SELECT used FROM budget WHERE key=?').get(key).used<80,'Today’s song-search allowance is used. Try again tomorrow.',429);store.db.prepare('UPDATE budget SET used=used+1 WHERE key=?').run(key);});}});
  function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
  function open(value){try{const b=Buffer.from(value,'base64url'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}catch{throw new Fault('Please sign in again.',401);}}
  function cookie(res,value,max=604800){res.setHeader('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${max}${testing?'':'; Secure'}`);}
  function limit(id,max,ms=60000){const now=Date.now();let r=rates.get(id);if(!r||r.until<now){r={n:0,until:now+ms};rates.set(id,r);}check(++r.n<=max,'Please wait a moment before trying again.',429);if(rates.size>5000)for(const [k,v]of rates)if(v.until<now)rates.delete(k);}
  async function sb(path,data,token){const r=await authFetch(V2+'/auth/v1/'+path,{method:data?'POST':'GET',headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY??'',...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Fault('Could not sign in. Check your credentials and email confirmation.',401);return r.json();}
  function member(user){check(user?.id&&user.email_confirmed_at,'Confirm your email before signing in.',403);const name=names.find(n=>process.env[n.toUpperCase()+'_EMAIL']?.trim().toLowerCase()===user.email?.toLowerCase());check(name,'This account is not invited to Our Place.',403);store.identity(name,user.id);return name;}
  async function auth(req,res){
    const raw=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);check(raw,'Please sign in.',401);let session=open(raw);check(session.until>Date.now()&&store.db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?').get(session.sid,Date.now()),'Please sign in again.',401);req.sessionId=session.sid;
    if(session.exp<Date.now()+30000){const t=await sb('token?grant_type=refresh_token',{refresh_token:session.refresh});session={...session,token:t.access_token,refresh:t.refresh_token,exp:Date.now()+t.expires_in*1000};cookie(res,seal(session));}
    let c=cache.get(hash(session.token));if(!c||c.until<Date.now()){const user=await sb('user',null,session.token);c={name:member(user),until:Date.now()+30000};cache.set(hash(session.token),c);if(cache.size>100)cache.clear();}
    return c.name;
  }
  const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  async function body(req,max=8*1024*1024){let size=0,chunks=[];for await(const c of req){size+=c.length;check(size<=max,'This attachment is too large.',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new Fault('Invalid request.');}}
  function snapshot(who){const s=store.snapshot(who);s.messages=s.messages.map(m=>running.has(m.id)?{...m,text:running.get(m.id).text}:m);s.items=s.items.map(i=>({...i,comments:(i.comments??[]).map(c=>running.has(c.id)?{...c,text:running.get(c.id).text}:c)}));s.who=who;s.crown=crownSnapshot(store.state(),who);s.ocho=ochoSnapshot(store.state(),who);s.domino=dominoSnapshot(store.state(),who);s.media=store.state().media??null;s.serverNow=Date.now();s.youtubeConfigured=!!process.env.YOUTUBE_API_KEY;s.model=MODEL;s.aiConnected=!!process.env.OPENAI_API_KEY;
    s.proposals=store.db.prepare("SELECT id,actor,scope,body FROM jobs WHERE status='done' ORDER BY createdAt DESC LIMIT 20").all().flatMap(j=>{const b=JSON.parse(j.body);return j.actor===who&&!b.accepted?(b.proposals??[]).flatMap((p,index)=>[...(b.acceptedIndices??[]),...(b.dismissedIndices??[])].includes(index)?[]:[{job:j.id,index,type:p.type,title:p.title,count:p.questions?.length,itemType:p.itemType}]):[];});return s;}
  function emit(event,data,who){for(const [res,meta] of streams){if(!who||meta.who===who)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}}
  function refresh(){for(const [res,meta]of streams)res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot(meta.who))}\n\n`);}
  function cancel(who,all=false){for(const [id,job]of running)if(all&&job.scope==='shared'||job.actor===who){store.status(id,'cancelled');job.controller.abort();}}
  function saveWallReply(post,id,value,status){const s=store.state(),item=s.items.find(i=>i.id===post),c=item?.comments?.find(c=>c.id===id);if(!c)return;c.text=value;c.status=status;if(status!=='streaming')item.revision++;store.save(s);}
  async function run(id){
    const j=store.job(id);if(!j||j.status!=='running'||running.has(id))return;const b=JSON.parse(j.body),controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);running.set(id,{controller,actor:j.actor,scope:j.scope,wallItem:b.wallItem,text:''});let output='',lastSave=0;const started=Date.now();let first=null;
    try{
      const {proposals,usage}=await ai({actor:j.actor,prompt:b.prompt,context:b.context,image:b.image,privatePrep:j.scope==='private',purpose:b.purpose,signal:controller.signal,onText:delta=>{
        if(store.job(id).status!=='running'||controller.signal.aborted)return;if(first===null)first=Date.now()-started;output+=delta;running.get(id).text=output;
        if(b.wallItem){emit('wall-delta',{post:b.wallItem,id,text:delta});if(Date.now()-lastSave>300){saveWallReply(b.wallItem,id,output,'streaming');lastSave=Date.now();}}
        else if(j.scope==='shared'){emit('delta',{id,text:delta});if(Date.now()-lastSave>300){store.db.prepare('UPDATE messages SET text=? WHERE id=?').run(output,id);lastSave=Date.now();}}
      }});
      if(store.job(id).status!=='running'||controller.signal.aborted)return;
      store.tx(()=>{const liveQuiz=!b.wallItem&&proposals.find(p=>p.type==='start');if(liveQuiz){check(j.scope==='shared','Live activities belong in shared chat.');const current=store.state();change(current,j.actor,'quiz.launch',{...liveQuiz,afterSequence:store.messages().at(-1)?.sequence??0});store.save(current);proposals.splice(proposals.indexOf(liveQuiz),1);output=output||'Let’s begin — one question at a time.';}store.settle(id,usage);store.db.prepare('UPDATE jobs SET body=?,status=? WHERE id=?').run(JSON.stringify({proposals,accepted:false,latency:{firstTokenMs:first,totalMs:Date.now()-started}}),'done',id);
        if(b.wallItem)saveWallReply(b.wallItem,id,output||'I could not produce a reply.','sent');
        else if(j.scope==='shared')store.db.prepare('UPDATE messages SET text=?,status=? WHERE id=?').run(output||(proposals.length?'I prepared something for you to review.':'I could not produce a reply.'),'sent',id);
      });
    }catch(e){if(store.job(id).status==='running')store.status(id,controller.signal.aborted?'interrupted':'failed');if(b.wallItem)saveWallReply(b.wallItem,id,output||'Echo could not finish. Ask again when you are ready.',store.job(id).status);else if(j.scope==='shared')store.db.prepare('UPDATE messages SET text=?,status=? WHERE id=?').run(output||'Echo could not finish. Your chat is still available.',store.job(id).status,id);emit('notice',{text:controller.signal.aborted?'Echo stopped.':'Echo could not finish. Try again when you are ready.'},j.scope==='private'?j.actor:undefined);
    }finally{
      clearTimeout(timeout);running.delete(id);
      if(store.job(id).status==='cancelled'&&b.wallItem)saveWallReply(b.wallItem,id,output||'Echo was stopped.','cancelled');
      else if(store.job(id).status==='cancelled'&&j.scope==='shared')store.db.prepare("UPDATE messages SET text=?,status='cancelled' WHERE id=?").run(output||'Echo was stopped.',id);
      // Drop transient input/images even on failure; keep only proposal and timing data on success.
      if(store.job(id).status!=='done')store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(id);
      refresh();
    }
  }
  function context(s){const msgs=store.db.prepare('SELECT author,text FROM (SELECT rowid AS seq,author,text FROM messages WHERE aiAllowed=1 AND status=\'sent\' ORDER BY rowid DESC LIMIT 50) ORDER BY seq').all();return JSON.stringify({messages:msgs,space:s.items.filter(i=>i.aiAllowed).slice(0,30).map(({type,title,done,approvals,steps})=>({type,title,done,approvals,steps})),activity:s.activity?{owner:s.activity.owner,target:s.activity.target,status:s.activity.status,index:s.activity.index,answers:s.activity.answers}:null}).slice(0,24000);}
  function photoData(id){if(!id)return null;const p=store.db.prepare('SELECT mime,bytes FROM photos WHERE id=?').get(id);check(p,'Photo not found.',404);return `data:${p.mime};base64,${Buffer.from(p.bytes).toString('base64')}`;}
  async function route(req,res){Object.entries(security).forEach(([k,v])=>res.setHeader(k,v));const url=new URL(req.url,origin),path=url.pathname;
    if(req.method==='POST')check(req.headers.origin===origin,'Request origin does not match.',403);
    if(path==='/api/health')return send(res,200,{ok:true,product:'Our Place',aiConfigured:!!process.env.OPENAI_API_KEY,youtubeConfigured:!!process.env.YOUTUBE_API_KEY});
    if(path==='/api/login'&&req.method==='POST'){
      limit('login:'+req.socket.remoteAddress,10,600000);const p=await body(req,8000);const email=text(p.email,254).toLowerCase();check(names.some(n=>process.env[n.toUpperCase()+'_EMAIL']?.trim().toLowerCase()===email),'Could not sign in. Check your invitation.',401);
      const t=await sb('token?grant_type=password',{email,password:text(p.password,1024)});const who=member(t.user),sid=randomUUID(),until=Date.now()+604800000;store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(sid,until);cookie(res,seal({sid,token:t.access_token,refresh:t.refresh_token,exp:Date.now()+t.expires_in*1000,until}));return send(res,200,{who});
    }
    if(path==='/api/logout'&&req.method==='POST'){const who=await auth(req,res);store.db.prepare('DELETE FROM sessions WHERE id=?').run(req.sessionId);cookie(res,'',0);for(const [r,m]of streams)if(m.who===who)r.end();return send(res,200,{ok:true});}
    if(path.startsWith('/api/')){
      const who=await auth(req,res);
      if(path==='/api/journey/play'&&req.method==='GET'){
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' about:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(readFileSync(join(here,'public','journey.html'),'utf8').replace('__JOURNEY_PROGRESS__',JSON.stringify(journeyView(store.state(),who))));
 }
 if(path==='/api/media/clock' &&req.method==='GET')return send(res,200,{now:Date.now()});
      if(path==='/api/media/search'&&req.method==='GET'){limit('youtube:'+who,12);return send(res,200,{items:await youtube.search(url.searchParams.get('q'))});}
      if(path==='/api/media/resolve'&&req.method==='GET'){limit('youtube:'+who,12);return send(res,200,{track:await youtube.resolve(url.searchParams.get('url'))});}
      if(path==='/api/state'&&req.method==='GET')return send(res,200,snapshot(who));
      if(path.startsWith('/api/messages/')&&req.method==='GET'){const m=store.db.prepare('SELECT rowid AS sequence,* FROM messages WHERE id=?').get(path.split('/').pop());check(m,'The original message is unavailable.',404);return send(res,200,m);}
      if(path==='/api/history'&&req.method==='GET')return send(res,200,store.messages(url.searchParams.get('before')));
      if(path==='/api/events'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`retry: 250\n\nevent: snapshot\ndata: ${JSON.stringify(snapshot(who))}\n\n`);streams.set(res,{who});emit('presence',{online:[...new Set([...streams.values()].map(v=>v.who))]});
        const beat=setInterval(()=>res.write(': keepalive\n\n'),15000);const expiry=setTimeout(()=>res.end(),60000);res.on('close',()=>{clearInterval(beat);clearTimeout(expiry);streams.delete(res);emit('presence',{online:[...new Set([...streams.values()].map(v=>v.who))]});});return;
      }
      if(path.startsWith('/api/photos/')&&req.method==='GET'){const id=path.split('/').pop(),p=store.db.prepare('SELECT * FROM photos WHERE id=?').get(id);check(p,'Photo not found.',404);res.writeHead(200,{'Content-Type':p.mime,'Content-Length':p.bytes.length});return res.end(Buffer.from(p.bytes));}
      if(path==='/api/photos'&&req.method==='POST'){
        limit('photo:'+who,10);const p=await body(req);const bytes=Buffer.from(p.data??'','base64');check(bytes.length>0&&bytes.length<=1024*1024,'Use a photo up to 1 MB after resizing.');
        const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
        check(mime,'Use a JPG, PNG or WebP photo.');const total=store.db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS n FROM photos').get().n;check(total+bytes.length<=150*1024*1024,'Photo storage is full.',413);const id=randomUUID();store.db.prepare('INSERT INTO photos VALUES(?,?,?,?)').run(id,mime,bytes,new Date().toISOString());return send(res,201,{id});
      }
      if(path==='/api/command'&&req.method==='POST'){
        limit('command:'+who,90);const p=await body(req,32000);let verifiedTrack;
        if(['media.create','media.enqueue'].includes(p.type)){limit('youtube:'+who,12);verifiedTrack=await youtube.resolve(p.data?.track?.videoId);}
        const result=store.once(who,p.id,p,()=>{
          const s=store.state();const data={...(p.data??{})};
          if(p.type==='journey.save'){const result=journeySave(s,who,data);store.save(s);return result;}
          if(p.type?.startsWith('ocho.')){ochoChange(s,who,p.type,data);store.save(s);return {ok:true};}
          if(p.type?.startsWith('domino.')){dominoChange(s,who,p.type,data);store.save(s);return {ok:true};}
          if(p.type?.startsWith('media.')){if(verifiedTrack)data.track=verifiedTrack;mediaChange(s,who,p.type,data);store.save(s);return {ok:true};}
          if(p.type==='message'){
            const value=data.text?.trim()?text(data.text,4000):'';check(value||data.image,'Write a message or attach a photo.');if(data.image)photoData(data.image);if(data.reply)check(store.db.prepare('SELECT 1 FROM messages WHERE id=?').get(data.reply),'The original message is unavailable.');
            store.message({id:p.id,author:who,text:value,image:data.image,reply:data.reply,aiAllowed:!s.pauses.length});return {ok:true};
          }
          if(p.type==='item.ask'){
            check(process.env.OPENAI_API_KEY,'Echo is not connected yet.',503);
            const item=s.items.find(i=>i.id===data.id);check(item,'This post is no longer available.',404);
            check(!s.pauses.length||data.once===true,'Echo is paused. Choose Ask once explicitly.',409);
            const question=text(data.question,650);item.comments??=[];check(item.comments.length<=198,'This post has reached 200 comments.');
            const imageId=(item.images??(item.image?[item.image]:[]))[0];
            const context=JSON.stringify({post:{type:item.type,text:item.title,steps:item.steps??[]},conversation:item.comments.filter(c=>!c.status||c.status==='sent').slice(-12).map(c=>({by:c.by,text:c.text}))}).slice(0,18000);
            const id=store.reserve(who,'shared',{prompt:question,purpose:'wall',wallItem:item.id,context,image:imageId?photoData(imageId):null});
            item.comments.push({id:randomUUID(),by:who,text:question,to:'Echo',createdAt:new Date().toISOString()},{id,by:'Echo',text:'',status:'streaming',createdAt:new Date().toISOString()});item.revision++;store.save(s);return {job:id};
          }
          if(p.type==='ai.ask'){
            check(process.env.OPENAI_API_KEY,'Echo is not connected yet.',503);const scope=data.private?'private':'shared';if(data.session)check(s.echoInvited&&!s.pauses.length,'Echo is no longer invited.',409);
            check(!s.pauses.length||scope==='private'||data.once===true,'Echo is paused. Choose Ask once explicitly.',409);
            const prompt=text(data.prompt,3000);const image=data.image?photoData(data.image):null;
            const id=store.reserve(who,scope,{prompt,purpose:data.purpose==='space'?'space':'chat',context:scope==='private'||s.pauses.length?'':context(s),image});
            if(scope==='shared')store.message({id,author:'Echo',text:'',status:'streaming',aiAllowed:!s.pauses.length});return {job:id};
          }
          if(p.type==='ai.cancel'){cancel(who,true);return {ok:true};}
          if(p.type==='proposal.accept'||p.type==='proposal.dismiss'){
            const j=store.job(data.job);check(j?.actor===who&&j.status==='done','This proposal is private to its requester.',403);const b=JSON.parse(j.body);check(!b.accepted&&b.proposals?.length,'This proposal is no longer available.',409);const index=data.index??0;check(Number.isInteger(index)&&index>=0&&index<b.proposals.length,'This proposal is unavailable.',404);check(!(b.acceptedIndices??[]).includes(index),'This proposal was already accepted.',409);check(!(b.dismissedIndices??[]).includes(index),'This proposal was dismissed.',409);const proposal=b.proposals[index];
            if(p.type==='proposal.dismiss')b.dismissedIndices=[...(b.dismissedIndices??[]),index];
            else {if(proposal.type==='quiz')s.drafts[who]=proposal.questions;
            else change(s,who,'item.save',{type:proposal.itemType,title:proposal.title,aiAllowed:true});
            b.acceptedIndices=[...(b.acceptedIndices??[]),index];}b.accepted=(b.acceptedIndices?.length||0)+(b.dismissedIndices?.length||0)===b.proposals.length;store.db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify(b),j.id);s.version++;store.save(s);return {kind:proposal.type};
          }
          if(p.type==='message.pin'&&data.value){const m=store.db.prepare('SELECT * FROM messages WHERE id=?').get(data.id);check(m&&m.status==='sent','Only a sent shared message can be pinned.',404);data.text=m.text||'Shared photo';data.author=m.author;}
          if(p.type==='echo.invite'&&data.value===false){for(const job of store.db.prepare("SELECT id FROM jobs WHERE scope='shared' AND status='running'").all()){store.status(job.id,'cancelled');store.db.prepare("UPDATE messages SET status='cancelled' WHERE id=?").run(job.id);running.get(job.id)?.controller.abort();}}
          if(p.type==='wallpaper.set'&&data.image)photoData(data.image);
          if(p.type==='item.save'){if(data.image)photoData(data.image);if(data.images){check(Array.isArray(data.images)&&data.images.length<=6,'Choose up to 6 photos.');for(const image of data.images)photoData(image);}}
          if(p.type==='item.delete'){const item=s.items.find(i=>i.id===data.id);check(item&&item.revision===data.revision,'This post changed. Try deleting again.',409);for(const job of store.db.prepare("SELECT id,body FROM jobs WHERE status='running'").all())if(JSON.parse(job.body).wallItem===data.id){store.status(job.id,'cancelled');running.get(job.id)?.controller.abort();}}
          if(p.type==='pause'&&data.value)cancel(who,true);
          if(['quiz.start','quiz.launch','quiz.answer'].includes(p.type))data.afterSequence=store.messages().at(-1)?.sequence??0;change(s,who,p.type,data);store.save(s);return {ok:true};
        });
        send(res,200,result);refresh();if(result.job)setImmediate(()=>run(result.job));return;
      }
      if(path==='/api/export'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="our-place-backup.json"');return send(res,200,{...snapshot(who),messages:store.db.prepare('SELECT * FROM messages ORDER BY rowid').all(),note:'Shared chat and your own drafts. Download photos separately. Keep this file private.'});}
      throw new Fault('Not found.',404);
    }
    check(req.method==='GET','Method not allowed.',405);const files={'/crown.js':['crown.js','text/javascript'],'/crown.css':['crown.css','text/css'],'/journey.js':['journey.js','text/javascript'],'/journey.css':['journey.css','text/css'],'/ocho-art.svg':['ocho-art.svg','image/svg+xml'],'/ocho.js':['ocho.js','text/javascript'],'/ocho.css':['ocho.css','text/css'],'/disclosures.js':['disclosures.js','text/javascript'],'/wall.js':['wall.js','text/javascript'],'/wall.css':['wall.css','text/css'],'/domino.js':['domino.js','text/javascript'],'/domino.css':['domino.css','text/css'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/suede.svg':['suede.svg','image/svg+xml'],'/scroll.js':['scroll.js','text/javascript'],'/media.js':['media.js','text/javascript'],'/media.css':['media.css','text/css'],'/install.js':['install.js','text/javascript'],'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],'/icon-192.png':['icon-192.png','image/png'],'/icon-512.png':['icon-512.png','image/png']};const f=files[path];check(f,'Not found.',404);res.writeHead(200,{'Content-Type':f[1]+(f[1].startsWith('image/')?'':'; charset=utf-8')});res.end(readFileSync(join(here,'public',f[0])));
  }
  const server=http.createServer((req,res)=>{route(req,res).catch(e=>{if(!res.headersSent)send(res,e.status??500,{error:e.status?e.message:'Something went wrong. Your saved data is safe.'});else res.end();});});
  const dominoTimer=setInterval(()=>{try{if(!dominoDue(store.state())&&!ochoDue(store.state()))return;const changed=store.tx(()=>{const s=store.state();const d=dominoTick(s),o=ochoTick(s);if(!d&&!o)return false;store.save(s);return true;});if(changed)refresh();}catch{console.error('Domino turn update failed; will retry.');}},250);dominoTimer.unref();
  server.on('close',()=>{clearInterval(dominoTimer);for(const j of running.values())j.controller.abort();for(const r of streams.keys())r.end();});return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const dir=process.env.DATA_DIR??join(here,'data');if(process.env.NODE_ENV==='production')check(dir==='/var/data','Production requires the persistent disk at /var/data.',503);mkdirSync(dir,{recursive:true,mode:0o700});
  check(process.env.SUPABASE_PUBLISHABLE_KEY&&process.env.MAHMOUD_EMAIL&&process.env.SAFY_EMAIL,'Configure the V2 publishable key and both invited email addresses.',503);check(process.env.MAHMOUD_EMAIL.toLowerCase()!==process.env.SAFY_EMAIL.toLowerCase(),'Use two different invited accounts.',503);
  const store=new Store(join(dir,'our-place.sqlite'));const server=createApp({store,origin:resolveOrigin(),secret:process.env.SESSION_SECRET});server.listen(Number(process.env.PORT??3000),'0.0.0.0',()=>console.log('Our Place server ready.'));
  if(process.env.YOUTUBE_API_KEY)youtubeService().resolve('M7lc1UVf-VE').then(()=>console.log('YouTube connection verified')).catch(()=>console.error('YouTube connection check failed; verify the configured key and API restrictions.'));
  process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
}


