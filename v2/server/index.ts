import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {z} from 'zod';
import {startGame,act,projectGame,ActionError} from './game.ts';
import {makePool,transaction,member} from './store.ts';
import {assertV2,pauseBy,TEST_LIMIT,MONTHLY_AI_LIMIT,reserveBudget,REQUEST_RESERVE} from './policy.ts';
import {processOne,recoverInterrupted} from './ai.ts';
const url=process.env.SUPABASE_URL||'';assertV2(url);
const origin=process.env.APP_ORIGIN;if(!origin||new URL(origin).hostname==='leoshad.github.io')throw Error('A separate V2 APP_ORIGIN is required.');
const pool=makePool();const app=express();app.disable('x-powered-by');
const supa=createClient(url,process.env.SUPABASE_PUBLISHABLE_KEY||'',{auth:{persistSession:false,autoRefreshToken:false}});
app.use(express.json({limit:'16kb'}));
app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});if(req.method==='POST'&&(req.headers.origin!==origin||!req.is('application/json')))return res.status(403).json({error:'Request origin rejected.'});next()});
const loginAttempts=new Map<string,{count:number;at:number}>();
app.get('/api/health',(_req,res)=>res.json({status:'ok',version:'v2-first-slice'}));
app.post('/api/login',async(req,res,next)=>{try{const ip=req.socket.remoteAddress||'unknown';const window=loginAttempts.get(ip);if(window&&Date.now()-window.at<60000&&window.count>=8)throw new ActionError('Please wait a minute before trying again.',429);loginAttempts.set(ip,{count:window&&Date.now()-window.at<60000?window.count+1:1,at:window&&Date.now()-window.at<60000?window.at:Date.now()});const body=z.object({email:z.email().max(254),password:z.string().min(1).max(256)}).strict().parse(req.body);const client=createClient(url,process.env.SUPABASE_PUBLISHABLE_KEY||'',{auth:{persistSession:false,autoRefreshToken:false}});const{data,error}=await client.auth.signInWithPassword(body);if(error||!data.user||!data.session)throw new ActionError('Email or password could not be verified.',401);await transaction(pool,c=>member(c,data.user!.id));res.cookie('__Host-ms_session',data.session.access_token,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:Math.min(data.session.expires_in,3600)*1000});res.json({ok:true});}catch(e){next(e)}});
app.post('/api/logout',(_req,res)=>{res.clearCookie('__Host-ms_session',{httpOnly:true,secure:true,sameSite:'strict',path:'/'});res.json({ok:true})});
app.use('/api',async(req,res,next)=>{try{const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-ms_session='))?.slice('__Host-ms_session='.length);if(!token)throw new ActionError('Please sign in.',401);const{data,error}=await supa.auth.getUser(decodeURIComponent(token));if(error||!data.user)throw new ActionError('Session expired. Please sign in again.',401);res.locals.actor=data.user.id;next()}catch(e){next(e)}});
app.get('/api/snapshot',async(_req,res,next)=>{try{const s=await transaction(pool,async c=>{const m=await member(c,res.locals.actor);const room=(await c.query('select * from private.rooms where id=$1 for share',[m.room_id])).rows[0];const members=(await c.query('select user_id as id,name from private.members where room_id=$1 order by slot',[m.room_id])).rows;const messages=(await c.query('select id,name,text,kind from (select * from private.messages where room_id=$1 order by created_at desc,id desc limit 80) x order by created_at,id',[m.room_id])).rows;const history=(await c.query('select id,status,scores from private.history where room_id=$1 order by created_at desc limit 30',[m.room_id])).rows;const working=(await c.query("select 1 from private.ai_jobs where room_id=$1 and status in ('queued','running') limit 1",[m.room_id])).rowCount;return{me:m.id,members,version:room.version,pausedBy:room.paused_by,game:projectGame(room.game,m.id),messages,history,aiStatus:working?'working':'idle'}});res.json(s)}catch(e){next(e)}});
const Command=z.object({id:z.uuid(),version:z.number().int().nonnegative(),type:z.enum(['message.send','ai.ask','presence.pause','presence.resume','game.start','game.ready','game.secret','game.guess','game.next','game.finish','game.abandon']),payload:z.record(z.string(),z.unknown())}).strict();
app.post('/api/commands',async(req,res,next)=>{try{const cmd=Command.parse(req.body);const reply=await transaction(pool,async c=>{const m=await member(c,res.locals.actor);const room=(await c.query('select * from private.rooms where id=$1 for update',[m.room_id])).rows[0];const receipt=(await c.query('select result from private.receipts where actor_id=$1 and command_id=$2',[m.id,cmd.id])).rows[0];if(receipt)return receipt.result;
 if(cmd.type.startsWith('game.')&&cmd.version!==room.version)throw new ActionError('The room changed. Your choice was not sent; try again.');
 if(cmd.type==='message.send'||cmd.type==='ai.ask'){
  const {text}=z.object({text:z.string().trim().min(1).max(4000)}).strict().parse(cmd.payload);
  const rate=await c.query("select count(*)::int as n from private.messages where actor_id=$1 and created_at>now()-interval '1 minute'",[m.id]);if(rate.rows[0].n>=20)throw new ActionError('Please slow down a little.',429);
  await c.query("insert into private.messages(id,room_id,actor_id,name,text,kind,ai_allowed) values($1,$2,$3,$4,$5,'human',$6)",[cmd.id,m.room_id,m.id,m.name,text,!room.paused_by.length]);
  if(cmd.type==='ai.ask'){
   if(!process.env.OPENAI_API_KEY)throw new ActionError('AI is not connected yet.',503);
   if((await c.query("select 1 from private.ai_jobs where room_id=$1 and status in ('queued','running')",[m.room_id])).rowCount)throw new ActionError('AI is finishing a reply. Please try again shortly.');
   const testing=process.env.BUDGET_MODE!=='production',key=testing?'initial-test':`month:${new Date().toISOString().slice(0,7)}`,limit=testing?TEST_LIMIT:MONTHLY_AI_LIMIT;
   await c.query('insert into private.budgets(key,spent,reserved) values($1,0,0) on conflict do nothing',[key]);const b=(await c.query('select * from private.budgets where key=$1 for update',[key])).rows[0];const reserved=reserveBudget(Number(b.spent),Number(b.reserved),limit);await c.query('update private.budgets set reserved=$2 where key=$1',[key,reserved]);
   // Ask once sends only this explicitly authorized request; no retroactive Just Us context.
   await c.query("insert into private.ai_jobs(id,room_id,epoch,status,context,budget_key) values($1,$2,$3,'queued',$4,$5)",[randomUUID(),m.room_id,room.ai_epoch,JSON.stringify({speaker:m.name,request:text}),key]);
  }
 }else if(cmd.type.startsWith('presence.')){
  z.object({}).strict().parse(cmd.payload);const paused=cmd.type==='presence.pause';room.paused_by=pauseBy(room.paused_by,m.id,paused);room.ai_epoch++;
  const queued=(await c.query("select * from private.ai_jobs where room_id=$1 and status='queued' for update",[m.room_id])).rows;for(const j of queued)await c.query('update private.budgets set reserved=greatest(0,reserved-$2) where key=$1',[j.budget_key,REQUEST_RESERVE]);await c.query("update private.ai_jobs set status='cancelled' where room_id=$1 and status='queued'",[m.room_id]);
 }else{
  const members=(await c.query('select user_id from private.members where room_id=$1 order by slot',[m.room_id])).rows.map(x=>x.user_id);
  if(cmd.type==='game.start'){z.object({}).strict().parse(cmd.payload);if(room.game)throw new ActionError('A game is already on the stage.');room.game=startGame(randomUUID(),members)}
  else if(cmd.type==='game.finish'){if(room.game?.phase!=='complete')throw new ActionError('Game is not complete.');room.game=null}
  else{if(!room.game)throw new ActionError('No active game.');const p=['game.secret','game.guess'].includes(cmd.type)?z.object({number:z.number().int().min(1).max(10)}).strict().parse(cmd.payload):z.object({}).strict().parse(cmd.payload);room.game=act(room.game,m.id,cmd.type,'number' in p?p.number:undefined);if(['complete','abandoned'].includes(room.game.phase)){await c.query('insert into private.history(id,room_id,status,scores) values($1,$2,$3,$4) on conflict do nothing',[room.game.id,m.room_id,room.game.phase,JSON.stringify(room.game.scores)]);if(room.game.phase==='abandoned')room.game=null}}
 }
 await c.query('update private.rooms set version=version+1,game=$2,paused_by=$3,ai_epoch=$4 where id=$1',[m.room_id,room.game,room.paused_by,room.ai_epoch]);const result={ok:true};await c.query('insert into private.receipts(actor_id,command_id,result) values($1,$2,$3)',[m.id,cmd.id,JSON.stringify(result)]);return result;});res.json(reply)}catch(e){next(e)}});
app.use(express.static(resolve('dist'),{index:'index.html'}));
app.use((e:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(e instanceof z.ZodError)return res.status(400).json({error:'Invalid request.'});res.status(e instanceof ActionError?e.status:500).json({error:e instanceof ActionError?e.message:'The action could not be confirmed. Please reconnect.'})});
await recoverInterrupted(pool);let working=false;setInterval(async()=>{if(working||!process.env.OPENAI_API_KEY)return;working=true;try{await processOne(pool)}catch{/* No secrets, request bodies, or provider errors in logs. */}finally{working=false}},750).unref();
app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('V2 server ready'));
