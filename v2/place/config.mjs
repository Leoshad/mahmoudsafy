import {check} from './domain.mjs';

export function resolveOrigin(env=process.env){
  const configured=env.APP_ORIGIN?.trim();
  const automatic=!configured||configured==='auto';
  const raw=automatic?env.RENDER_EXTERNAL_URL:configured;
  let url;try{url=new URL(raw);}catch{throw new Error('Set APP_ORIGIN to an HTTPS origin, or auto on Render.');}
  check(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'APP_ORIGIN must be a plain HTTPS origin.',503);
  if(automatic)check(url.hostname.endsWith('.onrender.com'),'Render must provide the service URL for automatic origin configuration.',503);
  return url.origin;
}
