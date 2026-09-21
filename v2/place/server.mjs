import {storedNote} from './note-document.mjs';
import {noteDocx} from './note-docx.mjs';
import {searchChat} from './chat-search.mjs';
import {initFiles,listFiles,filesAction,filesRevision,fileContent} from './shared-files.mjs';
import {createBuzz,buzzKinds,acknowledgeBuzz} from './buzz.mjs';
import {RaceService} from './race.mjs';
import {DailyWall,updateDaily} from './daily.mjs';
import {exportArchive} from './export.mjs';
import {echoContext} from './context.mjs';
import {startMaintenance} from './backup.mjs';
import {strokeEvent} from './draw.mjs';
import {accountRoutes,identify,bindSession} from './account.mjs';
import {recordReads,recordDeliveries} from './reads.mjs';
import {PushNotifications} from './push.mjs';
import {drawState,drawView,drawChange,drawApply,drawFailure,drawDue,drawTick} from './draw.mjs';
import {drawingWords} from './draw-ai.mjs';
import {courtView,courtCase,courtChange,courtRequest,courtApply,courtFailure} from './court.mjs';
import {judge} from './court-ai.mjs';
import {courtDocument,COURT_PRINT_SCRIPT} from './court-document.mjs';
import {personalSnapshot,personalChange} from './personal.mjs';
import {crownSnapshot} from './crown.mjs';
import {journeyView,journeySave} from './journey.mjs';
import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
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
export function createApp({store,origin,secret,authFetch=fetch,ai=respond,courtAI=judge,drawAI=drawingWords,testing=false,mediaFetch=fetch,pushSend,dailyAI}={}){
  check(typeof secret==='string'&&secret.length>=32,'SESSION_SECRET must have at least 32 characters.',503);
  check(origin&&(!origin.includes('oiwxwogdfjgrapigiqrw')),'A separate V2 APP_ORIGIN is required.',503);
  store.db.exec('CREATE TABLE IF NOT EXISTS race_results(id TEXT PRIMARY KEY,body TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS race_sessions(id TEXT PRIMARY KEY,body TEXT NOT NULL)');
  initFiles(store);
  const race=new RaceService({onResult:result=>{store.db.prepare('INSERT OR IGNORE INTO race_results(id,body,created) VALUES(?,?,?)').run(result.id,JSON.stringify(result),Date.now());store.db.prepare('DELETE FROM race_results WHERE id NOT IN (SELECT id FROM race_results ORDER BY created DESC LIMIT 100)').run();}});
  for(const row of store.db.prepare('SELECT * FROM race_sessions').all()){try{const m=JSON.parse(row.body);if(m.course?.version!==3)continue;m.seen=m.players.map(()=>0);m.inputs.forEach(i=>i.dir=0);m.last=Date.now();m.acc=0;if(['racing','countdown','paused'].includes(m.status)){m.status='paused';m.pausedAt=Date.now();m.reason='Reconnecting — waiting for both players.';}race.matches.set(row.id,m);}catch{console.error('Could not restore a race.');}}
  function saveRaces(){store.tx(()=>{store.db.prepare('DELETE FROM race_sessions').run();for(const [id,m]of race.matches)store.db.prepare('INSERT INTO race_sessions VALUES(?,?)').run(id,JSON.stringify(m));});}
  const notifications=new PushNotifications(store,{secret,origin,...(pushSend?{send:pushSend}:{})});
  const daily=new DailyWall(store,{refresh,...(dailyAI?{generate:dailyAI}:{})});
  const key=Buffer.from(hash(secret),'hex'),cookieName=testing?'ms_place':'__Host-ms_place';
  const streams=new Map(),running=new Map(),cache=new Map(),rates=new Map();
  const youtube=youtubeService({fetcher:mediaFetch,reserve:()=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),key='youtube-search:'+day;store.tx(()=>{store.db.prepare('INSERT OR IGNORE INTO budget(key) VALUES(?)').run(key);check(store.db.prepare('SELECT used FROM budget WHERE key=?').get(key).used<80,'Today’s song-search allowance is used. Try again tomorrow.',429);store.db.prepare('UPDATE budget SET used=used+1 WHERE key=?').run(key);});}});
  function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
  function open(value){try{const b=Buffer.from(value,'base64url'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}catch{throw new Fault('Please sign in again.',401);}}
  function cookie(res,value,max=604800){res.setHeader('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${max}${testing?'':'; Secure'}`);}
  function limit(id,max,ms=60000){const now=Date.now();let r=rates.get(id);if(!r||r.until<now){r={n:0,until:now+ms};rates.set(id,r);}check(++r.n<=max,'Please wait a moment before trying again.',429);if(rates.size>5000)for(const [k,v]of rates)if(v.until<now)rates.delete(k);}
  async function sb(path,data,token,method){const r=await authFetch(V2+'/auth/v1/'+path,{method:method||(data?'POST':'GET'),headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY??'',...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok){let e={};try{e=await r.json();}catch{}const code=e.error_code||e.code;const messages={weak_password:'Choose a stronger password (at least 12 characters).',same_password:'Choose a different new password.',email_exists:'This email is already in use.',email_address_invalid:'Enter a valid email address.',email_address_not_authorized:'Email delivery is not configured for this address yet.',over_email_send_rate_limit:'Too many emails requested. Please try again later.',otp_expired:'This link expired or was already used. Request a new one.',invalid_credentials:'The email or current password is incorrect.'};throw new Fault(messages[code]||(r.status===429?'Please wait before requesting another email.':'Could not verify your account or complete the change. Please try again.'),r.status===429?429:method==='PUT'||path.startsWith('recover')?400:401);}return r.status===204?{}:r.json();}
  function member(user){return identify(store,user);}
  function issue(res,t,who,keep){const sid=keep||randomUUID(),until=Date.now()+604800000;store.db.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?)').run(sid,until);bindSession(store,sid,who,{fresh:true});cookie(res,seal({sid,token:t.access_token,refresh:t.refresh_token,exp:Date.now()+t.expires_in*1000,until}));return sid;}
  async function auth(req,res){
    const raw=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);check(raw,'Please sign in.',401);let session=open(raw);check(session.until>Date.now()&&store.db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?').get(session.sid,Date.now()),'Please sign in again.',401);req.sessionId=session.sid;
    if(session.exp<Date.now()+30000){const t=await sb('token?grant_type=refresh_token',{refresh_token:session.refresh});session={...session,token:t.access_token,refresh:t.refresh_token,exp:Date.now()+t.expires_in*1000};cookie(res,seal(session));}
    let c=cache.get(hash(session.token));if(!c||c.until<Date.now()){const user=await sb('user',null,session.token);c={name:member(user),until:Date.now()+30000};cache.set(hash(session.token),c);if(cache.size>100)cache.clear();}
    bindSession(store,session.sid,c.name);req.authSession=session;return c.name;
  }
  const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  async function body(req,max=8*1024*1024){let size=0,chunks=[];for await(const c of req){size+=c.length;check(size<=max,'This attachment is too large.',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new Fault('Invalid request.');}}
  function snapshot(who){const saved=store.state(),s=store.snapshot(who,saved);s.messages=s.messages.map(m=>running.has(m.id)?{...m,text:running.get(m.id).text}:m);s.items=s.items.map(i=>({...i,comments:(i.comments??[]).map(c=>running.has(c.id)?{...c,text:running.get(c.id).text}:c)}));s.filesRevision=filesRevision(store);s.daily=daily.view();s.inbox=notifications.inbox(who);s.who=who;s.pendingBuzz=saved.buzzPending?.[who]??null;s.draw=drawView(saved,who);s.court=courtView(saved,who);s.personal=personalSnapshot(saved,who);s.crown=crownSnapshot(saved,who);s.ocho=ochoSnapshot(saved,who);s.domino=dominoSnapshot(saved,who);s.media=saved.media??null;const sharedRace=race.get(who,'together');s.raceInvitation=sharedRace?.status==='lobby'&&sharedRace.owner!==who&&!sharedRace.ready.includes(who)?{id:sharedRace.id,owner:sharedRace.owner}:null;s.serverNow=Date.now();s.youtubeConfigured=!!process.env.YOUTUBE_API_KEY;s.model=MODEL;s.aiConnected=!!process.env.OPENAI_API_KEY;
    s.proposals=store.db.prepare("SELECT id,actor,scope,body FROM jobs WHERE status='done' ORDER BY createdAt DESC LIMIT 20").all().flatMap(j=>{const b=JSON.parse(j.body);return j.scope==='shared'&&j.actor===who&&!b.accepted?(b.proposals??[]).flatMap((p,index)=>[...(b.acceptedIndices??[]),...(b.dismissedIndices??[])].includes(index)||p.type!=='item'?[]:[{job:j.id,index,type:p.type,title:p.title,count:p.questions?.length,itemType:p.itemType}]):[];});return s;}
  function emit(event,data,who){for(const [res,meta] of streams){if(!who||meta.who===who)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}}
  let presenceTimer=null;
  function publishPresence(delayed=false){clearTimeout(presenceTimer);const publish=()=>emit('presence',{online:['Mahmoud','Safy'].filter(who=>notifications.visible(who))});if(delayed){presenceTimer=setTimeout(publish,1500);presenceTimer.unref();}else publish();}
  const presenceSweep=setInterval(()=>publishPresence(),1000);presenceSweep.unref();
  function refresh(actor){try{notifications.scan(actor);}catch{console.error('Notification update failed.');}for(const [res,meta]of streams)res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot(meta.who))}\n\n`);}
  function cancel(who,all=false){for(const [id,job]of running)if(all&&job.scope==='shared'||job.actor===who){store.status(id,'cancelled');job.controller.abort();}}
  function saveWallReply(post,id,value,status){const s=store.state(),item=s.items.find(i=>i.id===post),c=item?.comments?.find(c=>c.id===id);if(!c)return;c.text=value;c.status=status;if(status!=='streaming')item.revision++;store.save(s);}
  async function run(id){
    const j=store.job(id);if(!j||j.status!=='running'||running.has(id))return;const b=JSON.parse(j.body);if(b.purpose==='activity')return runActivity(id);if(b.purpose==='draw')return runDraw(id);if(b.purpose==='court')return runCourt(id);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);running.set(id,{controller,actor:j.actor,scope:j.scope,wallItem:b.wallItem,text:''});let output='',lastSave=0;const started=Date.now();let first=null;
    try{
      const {proposals,usage}=await ai({actor:j.actor,prompt:b.prompt,context:b.context,image:b.image,purpose:b.purpose,youtube,signal:controller.signal,onText:delta=>{
        if(store.job(id).status!=='running'||controller.signal.aborted)return;if(first===null)first=Date.now()-started;output+=delta;running.get(id).text=output;
        if(b.wallItem){emit('wall-delta',{post:b.wallItem,id,text:delta});if(Date.now()-lastSave>300){saveWallReply(b.wallItem,id,output,'streaming');lastSave=Date.now();}}
        else if(j.scope==='shared'){emit('delta',{id,text:delta});if(Date.now()-lastSave>300){store.db.prepare('UPDATE messages SET text=? WHERE id=?').run(output,id);lastSave=Date.now();}}
      }});
      if(store.job(id).status!=='running'||controller.signal.aborted)return;
      store.tx(()=>{const liveQuiz=!b.wallItem&&proposals.find(p=>p.type==='start');if(liveQuiz){check(j.scope==='shared','Live activities belong in shared chat.');const current=store.state();change(current,j.actor,'quiz.launch',{...liveQuiz,host:'Echo',afterSequence:store.messages().at(-1)?.sequence??0});store.save(current);proposals.splice(proposals.indexOf(liveQuiz),1);output=output||'Let’s begin — one question at a time.';}store.settle(id,usage);store.db.prepare('UPDATE jobs SET body=?,status=? WHERE id=?').run(JSON.stringify({proposals,accepted:false,latency:{firstTokenMs:first,totalMs:Date.now()-started}}),'done',id);
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
  function activityFeedback(s,a,who,explicit=false){
    if((!explicit&&(a.reactionsPaused||(a.host!=='Echo'&&!s.echoInvited)))||!a.answers.length||s.pauses.length||a.pauses.length||!process.env.OPENAI_API_KEY)return null;
    a.feedback??=[];const final=a.status!=='active',index=a.index;
    const existing=a.feedback.find(f=>f.index===index&&f.final===final);
    if(existing&&['running','sent'].includes(existing.status))return null;
    let id;try{id=store.reserve(who,'shared',{purpose:'activity',activity:a.id,index,final,context:JSON.stringify({title:a.title,target:a.target,answers:a.answers,status:a.status,final,score:a.score,max:a.qs.filter(q=>q.correct>=0).length})});}
    catch(e){if(![409,429,503].includes(e.status))throw e;return null;}
    const f={id,index,final,status:'running',text:''};if(existing)Object.assign(existing,f);else a.feedback.push(f);return id;
  }
  async function runActivity(id){
    const j=store.job(id),b=JSON.parse(j.body),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    running.set(id,{controller,actor:j.actor,scope:'shared',text:''});let output='';
    try{const result=await ai({actor:j.actor,prompt:'React to this round.',purpose:'activity',context:b.context,signal:controller.signal,onText:t=>{if(!controller.signal.aborted&&store.job(id)?.status==='running')output+=t;}});
      if(controller.signal.aborted||store.job(id)?.status!=='running')return;
      store.tx(()=>{const s=store.state(),a=s.activities?.find(a=>a.id===b.activity),f=a?.feedback?.find(f=>f.id===id);if(f){f.text=output.trim();f.status=f.text?'sent':'failed';s.version++;store.save(s);}store.settle(id,result.usage);store.status(id,'done');});
    }catch{if(store.job(id)?.status==='running')store.status(id,'failed');}
    finally{clearTimeout(timer);running.delete(id);store.tx(()=>{const s=store.state(),f=s.activities?.find(a=>a.id===b.activity)?.feedback?.find(f=>f.id===id);if(f?.status==='running'){f.status='interrupted';s.version++;store.save(s);}if(store.job(id)?.status==='running')store.status(id,'interrupted');store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(id);});
      // If answers arrived while Echo was busy, react to the newest progress once.
      let next=null;if(store.job(id)?.status==='done')store.tx(()=>{const s=store.state(),a=s.activities?.find(a=>a.id===b.activity);if(a&&(a.index>b.index||(a.status!=='active')!==b.final)){next=activityFeedback(s,a,a.target);store.save(s);}});
      refresh();if(next)setImmediate(()=>run(next));}
  }
  async function runDraw(id){
    const j=store.job(id),b=JSON.parse(j.body),controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);running.set(id,{controller,actor:j.actor,scope:'shared',text:''});
    try{const answer=await drawAI({context:b.context,signal:controller.signal});if(controller.signal.aborted||store.job(id)?.status!=='running')return;store.tx(()=>{const s=store.state();if(!drawApply(s,b.matchId,id,answer.result))return;store.save(s);store.settle(id,answer.usage);store.db.prepare("UPDATE jobs SET status='done',body='{}' WHERE id=?").run(id);});}
    catch{ /* Retry is explicit; the private deck never enters logs or chat. */ }
    finally{clearTimeout(timer);running.delete(id);store.tx(()=>{const s=store.state();drawFailure(s,b.matchId,id);store.save(s);if(store.job(id)?.status==='running')store.status(id,'interrupted');store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(id);});refresh();}
  }
  async function runCourt(id){
    const j=store.job(id);if(!j||j.status!=='running'||running.has(id))return;const b=JSON.parse(j.body),controller=new AbortController();running.set(id,{controller,actor:j.actor,scope:'shared',text:''});const timer=setTimeout(()=>controller.abort(),60000);
    try{const c=courtCase(store.state(),b.caseId);if(c.pending!==id)return;const images=c.records.filter(r=>r.kind==='evidence'&&(r.image||r.source?.image)).map(r=>({record:r.id,data:photoData(r.image||r.source.image)}));const answer=await courtAI({context:b.context,images,signal:controller.signal});if(controller.signal.aborted||store.job(id).status!=='running')return;
      store.tx(()=>{const s=store.state();if(!courtApply(s,b.caseId,id,answer.result))return;store.save(s);store.settle(id,answer.usage);store.db.prepare("UPDATE jobs SET status='done',body='{}' WHERE id=?").run(id);});
    }catch{if(store.job(id)?.status==='running')store.status(id,controller.signal.aborted?'interrupted':'failed');}
    finally{clearTimeout(timer);running.delete(id);store.tx(()=>{const s=store.state();courtFailure(s,b.caseId,id);store.save(s);if(store.job(id)?.status==='running')store.status(id,'interrupted');store.db.prepare("UPDATE jobs SET body='{}' WHERE id=?").run(id);});refresh();}
  }
  function context(s){const msgs=store.db.prepare('SELECT author,text FROM (SELECT rowid AS seq,author,text FROM messages WHERE aiAllowed=1 AND status=\'sent\' ORDER BY rowid DESC LIMIT 50) ORDER BY seq').all();return echoContext(msgs,s);}
  function photoData(id){if(!id)return null;const p=store.db.prepare('SELECT mime,bytes FROM photos WHERE id=?').get(id);check(p,'Photo not found.',404);return `data:${p.mime};base64,${Buffer.from(p.bytes).toString('base64')}`;}
  const accountHandler=accountRoutes({store,origin,sb,auth,body,send,limit,seal,open,issue,notifications,testing,clearCache:()=>cache.clear(),closeOthers:(who,sid)=>{for(const [r,m]of streams)if(m.who===who&&m.sid!==sid){r.write('event: session-ended\ndata: {}\n\n');r.end();}}});
  async function route(req,res){Object.entries(security).forEach(([k,v])=>res.setHeader(k,v));const url=new URL(req.url,origin),path=url.pathname;if(url.searchParams.has('code'))res.setHeader('Referrer-Policy','no-referrer');
    if(req.method==='POST')check(req.headers.origin===origin,'Request origin does not match.',403);
    if(await accountHandler(req,res,path))return;
    if(path==='/api/health')return send(res,200,{ok:true,product:'Our Place',aiConfigured:!!process.env.OPENAI_API_KEY,youtubeConfigured:!!process.env.YOUTUBE_API_KEY});
    if(path==='/api/login'&&req.method==='POST'){
      limit('login:'+req.socket.remoteAddress,10,600000);const p=await body(req,8000);const email=text(p.email,254).toLowerCase();check(typeof p.password==='string'&&p.password.length>0&&p.password.length<=1024,'Enter your password.');
      const t=await sb('token?grant_type=password',{email,password:p.password});const who=member(t.user);issue(res,t,who);return send(res,200,{who});
    }
    if(path==='/api/logout'&&req.method==='POST'){const who=await auth(req,res);notifications.logout(req.sessionId);store.db.prepare('DELETE FROM sessions WHERE id=?').run(req.sessionId);cookie(res,'',0);for(const [r,m]of streams)if(m.who===who)r.end();return send(res,200,{ok:true});}
    if(path.startsWith('/api/')){
      const who=await auth(req,res);
      if(path.startsWith('/api/files/note/')&&req.method==='GET'){
        limit('note-export:'+who,20);const note=storedNote(store,path.split('/').pop());if(url.searchParams.get('format')!=='docx')return send(res,200,note);
        const data=noteDocx(note,id=>store.db.prepare('SELECT mime,bytes FROM photos WHERE id=?').get(id));res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(note.name+'.docx')}`);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Length':data.length});return res.end(data);
      }
      if(path==='/api/files'&&req.method==='GET')return send(res,200,listFiles(store));
      if(path.startsWith('/api/files/content/')&&req.method==='GET'){
        const f=fileContent(store,path.split('/').pop());res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Content-Disposition',`${url.searchParams.get('download')==='1'||!f.mime.startsWith('image/')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);res.writeHead(200,{'Content-Type':f.mime,'Content-Length':f.bytes.length});return res.end(Buffer.from(f.bytes));
      }
      if(path==='/api/files/action'&&req.method==='POST'){
        limit('files:'+who,60);const d=await body(req,15*1024*1024);const result=store.once(who,d.id,d,()=>filesAction(store,who,d));emit('files-changed',{revision:filesRevision(store)});return send(res,200,result);
      }
      if(path==='/api/notifications'&&req.method==='GET')return send(res,200,{who,publicKey:notifications.vapid.publicKey,visible:notifications.visible(who)});
      if(path.startsWith('/api/notifications/')&&req.method==='POST'){
        const data=await body(req,8000);
        if(path.endsWith('/status'))return send(res,200,{registered:notifications.registered(who,req.sessionId,data.endpoint)});
        if(path.endsWith('/read')){notifications.readInbox(who,data.id);refresh(who);return send(res,200,{ok:true});}
        if(path.endsWith('/presence')){notifications.presence(who,req.sessionId,data);publishPresence();}
        else if(path.endsWith('/subscribe')){limit('push:'+who,30);notifications.subscribe(who,req.sessionId,data);}
        else if(path.endsWith('/unsubscribe'))notifications.unsubscribe(who,data.endpoint);
        else if(path.endsWith('/test')){limit('push-test:'+who,3,60000);notifications.test(who,req.sessionId,data.endpoint);}
        else if(path.endsWith('/receipt')){limit('push-receipt:'+who,60,60000);check(['shown','foreground','wrong-account','expired','display-failed'].includes(data.result)&&typeof data.tag==='string'&&/^[a-f0-9]{24}$/.test(data.tag),'Invalid notification receipt.');console.info('Push device: result='+data.result+' tag='+data.tag);}
        else throw new Fault('Not found.',404);
        return send(res,200,{ok:true});
      }
      if(path.startsWith('/api/race/')){
        limit('race:'+who,1800);const mode=url.searchParams.get('mode');
        if(path==='/api/race/state'&&req.method==='GET'){check(['solo','together'].includes(mode),'Choose a race mode.');return send(res,200,race.view(race.get(who,mode),who));}
        if(req.method==='POST'){const d=await body(req,5000);if(path==='/api/race/action'){const result=race.action(who,d);saveRaces();if(d.action==='create'&&d.mode==='together')notifications.enqueue({key:'race:invite:'+result.match.id,to:who==='Mahmoud'?'Safy':'Mahmoud',kind:'invitation',body:who+' invited you to One More Race.',target:{tab:'together',game:'race'}});refresh(who);return send(res,200,result);}if(path==='/api/race/input')return send(res,200,race.input(who,d));}
        throw new Fault('Not found.',404);
      }
      if(path==='/api/journey/play'&&req.method==='GET'){
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' about:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(readFileSync(join(here,'public','journey.html'),'utf8').replace('__JOURNEY_PROGRESS__',JSON.stringify(journeyView(store.state(),who))));
 }
 if(path==='/api/media/clock' &&req.method==='GET')return send(res,200,{now:Date.now()});
      if(path==='/api/media/search'&&req.method==='GET'){limit('youtube:'+who,12);return send(res,200,{items:await youtube.search(url.searchParams.get('q'))});}
      if(path==='/api/media/resolve'&&req.method==='GET'){limit('youtube:'+who,12);return send(res,200,{track:await youtube.resolve(url.searchParams.get('url'))});}
      if(path.startsWith('/api/court/')&&req.method==='GET'){const id=path.slice('/api/court/'.length);const c=courtView(store.state(),who).cases.find(c=>c.id===id);check(c,'Case not found.',404);res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'sha256-${createHash('sha256').update(COURT_PRINT_SCRIPT).digest('base64')}'; base-uri 'none'; frame-ancestors 'self'`);if(url.searchParams.get('download')==='1')res.setHeader('Content-Disposition',`attachment; filename="court-case-${c.number}.html"`);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});const images={};for(const r of [...c.records,...c.history.flatMap(h=>h.records)]){const image=r.image||r.source?.image;if(image&&!images[image])images[image]=photoData(image);}return res.end(courtDocument(c,who,images));}
      if(path==='/api/buzz/pending'&&req.method==='GET')return send(res,200,{event:store.state().buzzPending?.[who]??null});
      if(path==='/api/buzz/ack'&&req.method==='POST'){const data=await body(req,200);check(typeof data.id==='string','Missing Buzz ID.');acknowledgeBuzz(store,who,data.id);return send(res,200,{ok:true});}
      if(path==='/api/buzz'&&req.method==='POST'){
        const data=await body(req,500);limit('buzz-request:'+who,600);let fresh=false;
        const event=store.once(who,data.id,data,()=>{const event=createBuzz(store,who,data.id,data.kind);fresh=true;return event;});
        if(fresh){notifications.mark('message:'+event.id);notifications.enqueue({key:'buzz:'+event.id,to:event.to,body:who+' sent you '+buzzKinds[event.kind][1]+'.',kind:'message',target:{tab:'chat',message:event.id}});emit('buzz',event);refresh(who);}
        return send(res,200,{ok:true,event});
      }
      if(path==='/api/typing'&&req.method==='POST'){limit('typing:'+who,120);const d=await body(req,200);check(typeof d.active==='boolean','Invalid typing status.');for(const [stream,meta] of streams)if(meta.who!==who)stream.write(`event: typing\ndata: ${JSON.stringify({who,active:d.active})}\n\n`);return send(res,200,{ok:true});}
      if(path==='/api/delivered'&&req.method==='POST'){const result=recordDeliveries(store,who,(await body(req,12000)).ids);if(result.ids.length)emit('delivered',result);return send(res,200,result);}
      if(path==='/api/read'&&req.method==='POST'){const result=recordReads(store,who,(await body(req,12000)).ids);if(result.ids.length)emit('read',result);return send(res,200,result);}
      if(path==='/api/state'&&req.method==='GET')return send(res,200,snapshot(who));
      if(path==='/api/chat-search'&&req.method==='GET')return send(res,200,searchChat(store,url.searchParams.get('q'),url.searchParams.get('offset')));
      if(path.startsWith('/api/messages/')&&req.method==='GET'){const m=store.db.prepare('SELECT rowid AS sequence,*,(SELECT at FROM message_reads WHERE message=messages.id) AS readAt,(SELECT at FROM message_deliveries WHERE message=messages.id) AS deliveredAt FROM messages WHERE id=?').get(path.split('/').pop());check(m,'The original message is unavailable.',404);return send(res,200,m);}
      if(path==='/api/history'&&req.method==='GET')return send(res,200,store.messages(url.searchParams.get('before')));
      if(path==='/api/events'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`retry: 250\n\nevent: snapshot\ndata: ${JSON.stringify(snapshot(who))}\n\n`);streams.set(res,{who,sid:req.sessionId,segments:url.searchParams.get('draw')==='segments'});publishPresence();
        const beat=setInterval(()=>res.write('event: heartbeat\ndata: {}\n\n'),15000);const expiry=setTimeout(()=>res.end(),60000);res.on('close',()=>{clearInterval(beat);clearTimeout(expiry);streams.delete(res);publishPresence(true);});return;
      }
      if(path.startsWith('/api/photos/')&&req.method==='GET'){const id=path.split('/').pop(),p=store.db.prepare('SELECT * FROM photos WHERE id=?').get(id);check(p,'Photo not found.',404);res.writeHead(200,{'Content-Type':p.mime,'Content-Length':p.bytes.length});return res.end(Buffer.from(p.bytes));}
      if(path==='/api/photos'&&req.method==='POST'){
        limit('photo:'+who,10);const p=await body(req);const bytes=Buffer.from(p.data??'','base64');const gif=['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6));check(bytes.length>0&&bytes.length<=(gif?5:1)*1024*1024,gif?'Use a GIF up to 5 MB.':'Use a photo up to 1 MB after resizing.');
        const mime=gif?'image/gif':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
        check(mime,'Use a JPG, PNG, WebP or GIF.');const total=store.db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS n FROM photos').get().n;check(total+bytes.length<=150*1024*1024,'Photo storage is full.',413);const id=randomUUID();store.db.prepare('INSERT INTO photos VALUES(?,?,?,?)').run(id,mime,bytes,new Date().toISOString());store.db.prepare('INSERT INTO photo_owners VALUES(?,?)').run(id,who);return send(res,201,{id});
      }
      if(path==='/api/command'&&req.method==='POST'){
        const p=await body(req,32000);if(p.type==='draw.stroke')limit('draw-stroke:'+who,360);else limit('command:'+who,90);let verifiedTrack,verifiedQueue;
        if(['media.create','media.enqueue','media.play'].includes(p.type)){limit('youtube:'+who,12);verifiedTrack=await youtube.resolve(p.data?.track?.videoId);}
        if(p.type==='media.create'&&p.data?.queue!==undefined){check(Array.isArray(p.data.queue)&&p.data.queue.length<=20,'The queue supports up to 20 videos.');verifiedQueue=await Promise.all(p.data.queue.map(t=>youtube.resolve(t?.videoId)));}
        const result=store.once(who,p.id,p,()=>{
          const s=store.state();const data={...(p.data??{})};if(verifiedQueue)data.queue=verifiedQueue;
          if(p.type?.startsWith('draw.')){
            if(p.type==='draw.prepare'){check(process.env.OPENAI_API_KEY,'Echo is not connected yet.',503);check(!s.pauses.length||data.once===true,'Echo is paused. Choose Ask Echo once.',409);const m=drawState(s).match;check(m?.id===data.id&&m.status==='preparing'&&!m.pending,'Match changed or Echo is already preparing.',409);const id=store.reserve(who,'shared',{purpose:'draw',matchId:m.id,context:{language:m.language,difficulty:m.difficulty}});m.pending=id;m.error=null;s.version++;store.save(s);return {job:id};}
            const pending=s.draw?.match?.pending;const result=drawChange(s,who,p.type,data);store.save(s);if(pending&&!s.draw.match.pending){store.status(pending,'cancelled');running.get(pending)?.controller.abort();}return p.type==='draw.stroke'?{...result,segment:strokeEvent(s,data)}:result;
          }
          if(p.type?.startsWith('court.')){
            if(p.type==='court.ask'){check(process.env.OPENAI_API_KEY,'Echo is not connected yet.',503);check(!s.pauses.length||data.once===true,'Echo is paused. Choose Ask Echo once.',409);const c=courtCase(s,data.id);check(c.revision===data.revision,'This case changed. Review it and try again.',409);const context=courtRequest(c);const id=store.reserve(who,'shared',{purpose:'court',caseId:c.id,context});c.pending=id;c.error=null;c.revision++;s.version++;store.save(s);return {job:id};}
            delete data.verifiedSource;if(p.type==='court.evidence'){if(data.messageId){const m=store.db.prepare("SELECT id,author,text,image,createdAt FROM messages WHERE id=? AND status='sent'").get(data.messageId);check(m,'Shared message not found.',404);data.verifiedSource={...m};}if(data.image)photoData(data.image);}
            const pending=s.court?.cases.find(c=>c.id===data.id)?.pending;const result=courtChange(s,who,p.type,data);store.save(s);if(pending&&!courtCase(s,data.id).pending){store.status(pending,'cancelled');running.get(pending)?.controller.abort();}return result;
          }
          if(p.type?.startsWith('personal.')){if(p.type==='personal.profile'&&data.photo)check(store.db.prepare('SELECT 1 FROM photo_owners WHERE id=? AND owner=?').get(data.photo,who),'Choose a photo you uploaded.',403);const result=personalChange(s,who,p.type,data);store.save(s);return result;}
          if(p.type==='journey.save'){const result=journeySave(s,who,data);store.save(s);return result;}
          if(p.type?.startsWith('ocho.')){ochoChange(s,who,p.type,data);store.save(s);return {ok:true};}
          if(p.type?.startsWith('domino.')){dominoChange(s,who,p.type,data);store.save(s);return {ok:true};}
          if(p.type?.startsWith('media.')){if(verifiedTrack)data.track=verifiedTrack;mediaChange(s,who,p.type,data);store.save(s);return {ok:true};}
          if(p.type==='message'){
            const value=data.text?.trim()?text(data.text,4000):'';check(value||data.image,'Write a message or attach a photo.');if(data.image)photoData(data.image);if(data.reply)check(store.db.prepare('SELECT 1 FROM messages WHERE id=?').get(data.reply),'The original message is unavailable.');
            store.message({id:p.id,author:who,text:value,image:data.image,reply:data.reply,aiAllowed:!s.pauses.length});return {ok:true};
          }
          if(p.type==='daily.settings'){updateDaily(s,data);store.save(s);daily.cancel(x=>x.kind==='daily');return {ok:true};}
          if(p.type==='item.echo'&&data.value===false){daily.cancel(x=>x.postId===data.id);for(const [id,job]of running)if(job.wallItem===data.id){store.status(id,'cancelled');job.controller.abort();}}
          if(p.type==='item.ask'){
            check(process.env.OPENAI_API_KEY,'Echo is not connected yet.',503);
            const item=s.items.find(i=>i.id===data.id);check(item,'This post is no longer available.',404);
            check(item.echoComments===true,'Turn on Echo in comments first.',409);
            check(!s.pauses.length||data.once===true,'Echo is paused. Choose Ask once explicitly.',409);
            const question=text(data.question,650);item.comments??=[];check(item.comments.length<=198,'This post has reached 200 comments.');
            const imageId=(item.images??(item.image?[item.image]:[]))[0];
            const context=JSON.stringify({post:{type:item.type,text:item.title,steps:item.steps??[]},conversation:item.comments.filter(c=>!c.status||c.status==='sent').slice(-12).map(c=>({by:c.by,text:c.text}))}).slice(0,18000);
            const id=store.reserve(who,'shared',{prompt:question,purpose:'wall',wallItem:item.id,context,image:imageId?photoData(imageId):null});
            item.comments.push({id:randomUUID(),by:who,text:question,to:'Echo',createdAt:new Date().toISOString()},{id,by:'Echo',text:'',status:'streaming',createdAt:new Date().toISOString()});item.revision++;store.save(s);return {job:id};
          }
          if(p.type==='ai.ask'){
            check(process.env.OPENAI_API_KEY,'Echo is not connected yet.',503);check(!data.private,'Private preparation has been removed. Ask Echo in shared chat.',410);const scope='shared';if(data.session)check(s.echoInvited&&!s.pauses.length,'Echo is no longer invited.',409);
            check(!s.pauses.length||data.once===true,'Echo is paused. Choose Ask once explicitly.',409);
            const prompt=text(data.prompt,3000);const image=data.image?photoData(data.image):null;
            const id=store.reserve(who,scope,{prompt,purpose:data.purpose==='space'?'space':'chat',context:s.pauses.length?'':context(s),image});
            if(scope==='shared')store.message({id,author:'Echo',text:'',status:'streaming',aiAllowed:!s.pauses.length});return {job:id};
          }
          if(p.type==='ai.cancel'){cancel(who,true);daily.cancel(()=>true);return {ok:true};}
          if(p.type==='proposal.accept'||p.type==='proposal.dismiss'){
            const j=store.job(data.job);check(j?.actor===who&&j.status==='done','This proposal is private to its requester.',403);const b=JSON.parse(j.body);check(!b.accepted&&b.proposals?.length,'This proposal is no longer available.',409);const index=data.index??0;check(Number.isInteger(index)&&index>=0&&index<b.proposals.length,'This proposal is unavailable.',404);check(!(b.acceptedIndices??[]).includes(index),'This proposal was already accepted.',409);check(!(b.dismissedIndices??[]).includes(index),'This proposal was dismissed.',409);const proposal=b.proposals[index];check(j.scope==='shared'&&proposal.type==='item','This proposal is no longer available.',410);
            if(p.type==='proposal.dismiss')b.dismissedIndices=[...(b.dismissedIndices??[]),index];
            else {change(s,who,'item.save',{type:proposal.itemType,title:proposal.title,aiAllowed:true});
            b.acceptedIndices=[...(b.acceptedIndices??[]),index];}b.accepted=(b.acceptedIndices?.length||0)+(b.dismissedIndices?.length||0)===b.proposals.length;store.db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify(b),j.id);s.version++;store.save(s);return {kind:proposal.type};
          }
          if(p.type==='message.react'){const message=store.db.prepare('SELECT status FROM messages WHERE id=?').get(data.id);check(message?.status==='sent','Only sent messages can receive reactions.',404);}
          if(p.type==='message.pin'&&data.value){const m=store.db.prepare('SELECT * FROM messages WHERE id=?').get(data.id);check(m&&m.status==='sent','Only a sent shared message can be pinned.',404);data.text=m.text||'Shared photo';data.author=m.author;}
          if(p.type==='echo.invite'&&data.value===false){for(const job of store.db.prepare("SELECT id FROM jobs WHERE scope='shared' AND status='running'").all()){store.status(job.id,'cancelled');store.db.prepare("UPDATE messages SET status='cancelled' WHERE id=?").run(job.id);running.get(job.id)?.controller.abort();}}
          if(p.type==='wallpaper.set'&&data.image)photoData(data.image);
          if(p.type==='item.save'){if(data.image)photoData(data.image);if(data.images){check(Array.isArray(data.images)&&data.images.length<=6,'Choose up to 6 photos.');for(const image of data.images)photoData(image);}}
          if(p.type==='item.delete'){daily.cancel(x=>x.postId===data.id);const item=s.items.find(i=>i.id===data.id);check(item&&item.revision===data.revision,'This post changed. Try deleting again.',409);for(const job of store.db.prepare("SELECT id,body FROM jobs WHERE status='running'").all())if(JSON.parse(job.body).wallItem===data.id){store.status(job.id,'cancelled');running.get(job.id)?.controller.abort();}}
          if(p.type==='pause'&&data.value){cancel(who,true);daily.cancel(()=>true);}
          if(p.type==='quiz.react'){const a=s.activities?.find(a=>a.id===data.activity);check(a&&a.target===who,'This round belongs to your partner.',403);check(!s.pauses.length&&!a.pauses.length,'Resume Echo permissions before asking for a reaction.',409);const job=activityFeedback(s,a,who,true);check(job||a.feedback?.some(f=>f.index===a.index&&f.final===(a.status!=='active')&&['running','sent'].includes(f.status)),'Echo is unavailable right now. Your answers are saved.',409);store.save(s);return {ok:true,job};}
          if(['quiz.answer','quiz.end'].includes(p.type)){
            data.afterSequence=store.messages().at(-1)?.sequence??0;change(s,who,p.type,data);
            const a=s.activities.find(a=>a.id===(data.activity??s.activity?.id));
            if(p.type==='quiz.end')for(const f of a.feedback??[])if(f.status==='running'){store.status(f.id,'cancelled');running.get(f.id)?.controller.abort();f.status='interrupted';}
            const job=activityFeedback(s,a,who);store.save(s);return {ok:true,job};
          }
          if(['quiz.launch'].includes(p.type))data.afterSequence=store.messages().at(-1)?.sequence??0;change(s,who,p.type,data);store.save(s);return {ok:true};
        });
        send(res,200,result);if(p.type==='draw.stroke'&&result.segment){for(const [stream,meta] of streams)stream.write(meta.segments?`event: draw-segment\ndata: ${JSON.stringify(result.segment)}\n\n`:`event: snapshot\ndata: ${JSON.stringify(snapshot(meta.who))}\n\n`);}else refresh(who);if(result.job)setImmediate(()=>run(result.job));if(p.type==='item.comment')setImmediate(()=>daily.comment(p.data?.id).catch(()=>{}));return;
      }
      if(path==='/api/export'&&req.method==='GET')return exportArchive(store,snapshot(who),res);
      throw new Fault('Not found.',404);
    }
    check(req.method==='GET','Method not allowed.',405);const files={'/balloon.js':['balloon.js','text/javascript'],'/balloon.css':['balloon.css','text/css'],'/support-preview.html':['support-preview.html','text/html'],'/support-preview.css':['support-preview.css','text/css'],'/notes.js':['notes.js','text/javascript'],'/notes.css':['notes.css','text/css'],'/note-format.mjs':['note-format.mjs','text/javascript'],'/note-pdf.mjs':['note-pdf.mjs','text/javascript'],'/chat-tools.js':['chat-tools.js','text/javascript'],'/files.js':['files.js','text/javascript'],'/files.css':['files.css','text/css'],'/buzz.js':['buzz.js','text/javascript'],'/buzz.css':['buzz.css','text/css'],'/comfort.js':['comfort.js','text/javascript'],'/race.js':['race.js','text/javascript'],'/race-engine.mjs':['race-engine.mjs','text/javascript'],'/race.css':['race.css','text/css'],'/game-ui.js':['game-ui.js','text/javascript'],'/account.js':['account.js','text/javascript'],'/reads.js':['reads.js','text/javascript'],'/sw.js':['sw.js','text/javascript'],'/notifications.js':['notifications.js','text/javascript'],'/draw.js':['draw.js','text/javascript'],'/draw.css':['draw.css','text/css'],'/court-export.js':['court-export.js','text/javascript'],'/court-print.css':['court-print.css','text/css'],'/court.js':['court.js','text/javascript'],'/court.css':['court.css','text/css'],'/personal.js':['personal.js','text/javascript'],'/personal.css':['personal.css','text/css'],'/crown.js':['crown.js','text/javascript'],'/crown.css':['crown.css','text/css'],'/journey.js':['journey.js','text/javascript'],'/journey.css':['journey.css','text/css'],'/ocho-art.svg':['ocho-art.svg','image/svg+xml'],'/ocho.js':['ocho.js','text/javascript'],'/ocho.css':['ocho.css','text/css'],'/disclosures.js':['disclosures.js','text/javascript'],'/wall.js':['wall.js','text/javascript'],'/wall.css':['wall.css','text/css'],'/domino.js':['domino.js','text/javascript'],'/domino.css':['domino.css','text/css'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/suede.svg':['suede.svg','image/svg+xml'],'/scroll.js':['scroll.js','text/javascript'],'/media.js':['media.js','text/javascript'],'/media.css':['media.css','text/css'],'/install.js':['install.js','text/javascript'],'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],'/icon-192.png':['icon-192.png','image/png'],'/icon-512.png':['icon-512.png','image/png']};const f=files[path];check(f,'Not found.',404);res.writeHead(200,{'Content-Type':f[1]+(f[1].startsWith('image/')?'':'; charset=utf-8')});res.end(readFileSync(join(here,'public',f[0])));
  }
  const server=http.createServer((req,res)=>{route(req,res).catch(e=>{if(!res.headersSent)send(res,e.status??500,{error:e.status?e.message:'Something went wrong. Your saved data is safe.'});else res.end();});});
  const dominoTimer=setInterval(()=>{try{const current=store.state();if(!drawDue(current)&&!dominoDue(current)&&!ochoDue(current))return;const changed=store.tx(()=>{const s=store.state();const a=drawTick(s),d=dominoTick(s),o=ochoTick(s);if(!d&&!o&&!a)return false;store.save(s);return true;});if(changed)refresh();}catch{console.error('Domino turn update failed; will retry.');}},250);dominoTimer.unref();
  const raceSaveTimer=setInterval(()=>{if(race.matches.size)try{saveRaces();}catch{console.error('Race save failed.');}},2000);raceSaveTimer.unref();
  const raceTimer=setInterval(()=>{try{race.tick();}catch{console.error('Race update failed.');}},16);raceTimer.unref();
  const pushTimer=setInterval(()=>notifications.drain().catch(()=>console.error('Notification delivery failed.')),250);pushTimer.unref();
  const dailyTimer=setInterval(()=>daily.tick().catch(()=>console.error('Daily Echo update failed.')),15000);dailyTimer.unref();
  server.on('close',()=>{clearInterval(raceTimer);clearInterval(raceSaveTimer);saveRaces();clearInterval(dailyTimer);daily.stop();clearTimeout(presenceTimer);clearInterval(presenceSweep);clearInterval(pushTimer);notifications.stopped=true;clearInterval(dominoTimer);for(const j of running.values())j.controller.abort();for(const r of streams.keys())r.end();});return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const dir=process.env.DATA_DIR??join(here,'data');if(process.env.NODE_ENV==='production')check(dir==='/var/data','Production requires the persistent disk at /var/data.',503);mkdirSync(dir,{recursive:true,mode:0o700});
  check(process.env.SUPABASE_PUBLISHABLE_KEY&&process.env.MAHMOUD_EMAIL&&process.env.SAFY_EMAIL,'Configure the V2 publishable key and both invited email addresses.',503);check(process.env.MAHMOUD_EMAIL.toLowerCase()!==process.env.SAFY_EMAIL.toLowerCase(),'Use two different invited accounts.',503);
  const store=new Store(join(dir,'our-place.sqlite'));const server=createApp({store,origin:resolveOrigin(),secret:process.env.SESSION_SECRET});server.listen(Number(process.env.PORT??3000),'0.0.0.0',()=>console.log('Our Place server ready.'));
  if(process.env.YOUTUBE_API_KEY)youtubeService().resolve('M7lc1UVf-VE').then(()=>console.log('YouTube connection verified')).catch(()=>console.error('YouTube connection check failed; verify the configured key and API restrictions.'));
  const stopMaintenance=startMaintenance(store,join(dir,'recovery'),process.env.SESSION_SECRET);
  process.on('SIGTERM',()=>{stopMaintenance().then(()=>server.close(()=>{store.close();process.exit(0);}));});
}




