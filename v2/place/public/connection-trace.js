(()=>{'use strict';
const key='our-place-connection-trace-v1',rawFetch=window.fetch.bind(window),limit=80,ttl=86400000;
let queue=[],sending=false,nextSend=0,attempt=crypto.randomUUID(),sample=0;
try{queue=JSON.parse(localStorage.getItem(key)||'[]').filter(x=>x&&Date.now()-x.at<ttl).slice(-limit).map(x=>x.kind==='request'&&x.phase==='started'?{...x,phase:'interrupted'}:x);}catch{}
const save=()=>{queue=queue.filter(x=>Date.now()-x.at<ttl).slice(-limit);try{localStorage.setItem(key,JSON.stringify(queue));}catch{}};
function add(record){const row={id:crypto.randomUUID(),attempt,at:Date.now(),focused:!document.hidden&&document.hasFocus(),online:navigator.onLine!==false,...record};queue.push(row);save();return row;}
function phase(phase){add({kind:'lifecycle',phase});}
async function flush(){
 if(sending||!queue.length||navigator.onLine===false||document.hidden||Date.now()<nextSend)return;
 const batch=queue.filter(x=>x.kind!=='request'||x.phase!=='started').slice(0,20).map(x=>({...x}));if(!batch.length)return;
 sending=true;nextSend=Date.now()+15000;
 try{const r=await rawFetch('/api/connection-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:2,records:batch}),signal:AbortSignal.timeout(5000)});
  if(r.ok){const sent=new Set(batch.map(x=>JSON.stringify(x)));queue=queue.filter(x=>!sent.has(JSON.stringify(x)));save();}
 }catch{}finally{sending=false;}
}
function traceURL(url,id){const u=new URL(url,location.href);u.searchParams.set('connection_trace',id);return u;}
window.fetch=async function(input,options){
 // Instrument only a small allowlist; never read bodies, cookies or message content.
 if(typeof input!=='string'&&!(input instanceof URL))return rawFetch(input,options);
 let url;try{url=new URL(input,location.href);}catch{return rawFetch(input,options);}
 if(url.origin!==location.origin||!['/api/state','/api/command','/api/notifications/presence','/api/shared-touch','/api/health'].includes(url.pathname))return rawFetch(input,options);
 if(['/api/shared-touch','/api/notifications/presence'].includes(url.pathname)&&++sample%10!==1)return rawFetch(input,options);
 const row=add({kind:'request',route:url.pathname,phase:'started'}),start=performance.now();
 try{const response=await rawFetch(traceURL(url,row.id).href,options);Object.assign(row,{phase:'headers',status:response.status,elapsed:Math.round(performance.now()-start)});save();return response;}
 catch(e){Object.assign(row,{phase:e?.name==='AbortError'||e?.name==='TimeoutError'?'timeout':'failed',elapsed:Math.round(performance.now()-start)});save();throw e;}
};
try{new PerformanceObserver(list=>{for(const e of list.getEntries()){
 const url=new URL(e.name,location.href),id=url.searchParams.get('connection_trace'),row=queue.find(x=>x.id===id);if(!row)continue;
 const ms=(a,b)=>Math.max(0,Math.round(a-b));
 Object.assign(row,{dns:ms(e.domainLookupEnd,e.domainLookupStart),tcp:ms(e.connectEnd,e.connectStart),tls:e.secureConnectionStart?ms(e.connectEnd,e.secureConnectionStart):0,ttfb:e.responseStart&&e.requestStart?ms(e.responseStart,e.requestStart):0,total:Math.round(e.duration)});save();
 }}).observe({type:'resource',buffered:true});}catch{}
window.OurConnectionTrace={streamURL(url){const row=add({kind:'stream',route:'/api/events',phase:'started'});return traceURL(url,row.id).pathname+traceURL(url,row.id).search;},stream(url,phase){let id;try{id=new URL(url,location.href).searchParams.get('connection_trace');}catch{}add({kind:'stream',route:'/api/events',phase,...(id?{request:id}:{})});},report(data){add({kind:'attempt',phase:data.stage,elapsed:data.elapsedMs});void flush();}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden){attempt=crypto.randomUUID();phase('resume');void flush();}else phase('hidden');});
window.addEventListener('online',()=>{phase('online');void flush();});window.addEventListener('offline',()=>phase('offline'));
window.addEventListener('pagehide',()=>phase('pagehide'));phase('open');setInterval(flush,15000);
})();
