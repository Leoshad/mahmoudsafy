const ids=/^[a-f0-9-]{36}$/;
const routes=['/api/state','/api/command','/api/notifications/presence','/api/shared-touch','/api/health','/api/events'];
export function connectionRecords(data){
 if(data?.version!==2||!Array.isArray(data.records)||data.records.length<1||data.records.length>20)return null;
 const out=[];
 for(const r of data.records){
  if(!r||!ids.test(r.id)||!ids.test(r.attempt)||!Number.isSafeInteger(r.at)||Math.abs(Date.now()-r.at)>2*86400000||typeof r.focused!=='boolean'||typeof r.online!=='boolean'||!['lifecycle','request','stream','attempt'].includes(r.kind)||!['open','resume','hidden','online','offline','pagehide','started','headers','timeout','interrupted','failed','error','ready','waiting'].includes(r.phase))return null;
  const v={id:r.id,attempt:r.attempt,at:r.at,focused:r.focused,online:r.online,kind:r.kind,phase:r.phase};
  if(r.route!==undefined){if(!routes.includes(r.route))return null;v.route=r.route;}
  if(r.request!==undefined){if(!ids.test(r.request))return null;v.request=r.request;}
  for(const k of ['elapsed','dns','tcp','tls','ttfb','total','status'])if(r[k]!==undefined){if(!Number.isFinite(r[k])||r[k]<0||r[k]>86400000)return null;v[k]=r[k];}
  out.push(v);
 }
 return out;
}
