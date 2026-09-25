import {randomUUID} from 'node:crypto';

// Keep idle upstream connections available longer, as recommended by Render.
// This does not extend the client's request deadline or the SSE session lifetime.
export function configureConnectionServer(server){
  server.keepAliveTimeout=120_000;
  server.headersTimeout=120_000;
}

export function observeConnection(req,res,log=record=>console.info(JSON.stringify(record))){
  const path=req.url?.split('?')[0];
  if(!['/api/health','/api/state','/api/notifications/presence','/api/command','/api/events','/api/shared-touch'].includes(path))return;
  const health=path==='/api/health',started=performance.now(),id=randomUUID();
  const trace=new URL(req.url,'http://localhost').searchParams.get('connection_trace');
  const linked=/^[a-f0-9-]{36}$/.test(trace||'');
  const base={event:'connection_server',request_id:id,route:path,...(linked?{client_request:trace}:{})};
  res.setHeader('X-Request-Id',id);
  if(health||linked)log({...base,phase:'received',at:new Date().toISOString()});
  let reported=false;
  const report=(phase,status=res.statusCode)=>{
    if(reported)return;reported=true;
    const elapsed=Math.round(performance.now()-started);
    if(health||linked||elapsed>=1000||phase==='aborted')log({...base,phase,at:new Date().toISOString(),status,elapsed_ms:elapsed,auth_ms:req.authMs??null});
  };
  if(path==='/api/events'){
    const writeHead=res.writeHead;
    res.writeHead=function(...args){const result=writeHead.apply(this,args);report('headers',args[0]);return result;};
  }else res.once('finish',()=>report('finished'));
  res.once('close',()=>{if(!res.writableFinished)report('aborted',res.headersSent?res.statusCode:null);});
}
