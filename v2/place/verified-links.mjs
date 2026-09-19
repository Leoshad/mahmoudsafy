import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';

// Resolve and pin a public IPv4 address on EVERY hop. Never fetch private URLs,
// forward credentials, or follow a redirect using an unchecked DNS lookup.
const blocked=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])blocked.addSubnet(ip,bits,'ipv4');
export function contentURL(value){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||isIP(u.hostname)||!u.hostname.includes('.')||/\.(?:local|internal|localhost)$/.test(u.hostname))return null;
  if(/\/(?:search|results|login|signin|consent)(?:\/|$)/i.test(u.pathname)||['q','search_query'].some(k=>u.searchParams.has(k)))return null;
  if(u.pathname==='/'&&!u.search)return null;
  u.hash='';return u;
 }catch{return null;}
}
export function publicIPv4(address){return isIP(address)===4&&!blocked.check(address,'ipv4');}
const clean=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
function requestPage(u,address,signal){
 return new Promise((resolve,reject)=>{
  const req=https.get(u,{signal,agent:false,headers:{'User-Agent':'OurPlace-LinkCheck/1.0','Accept':'text/html,application/pdf;q=0.8','Accept-Encoding':'identity'},lookup:(_host,options,cb)=>cb(null,options.all?[{address,family:4}]:address,4)},res=>{
   const result={status:res.statusCode,location:res.headers.location,type:res.headers['content-type']||'',body:''};
   if(result.status>=300||!result.type.includes('text/html')){res.destroy();resolve(result);return;}
   let size=0;const chunks=[];
   res.on('data',b=>{size+=b.length;chunks.push(b);if(size>=300000){result.body=Buffer.concat(chunks).toString('utf8');res.destroy();resolve(result);}});
   res.on('end',()=>{result.body=Buffer.concat(chunks).toString('utf8');resolve(result);});res.on('error',reject);
  });req.on('error',reject);
 });
}
export async function verifyPage(value,{signal,resolveDNS=lookup,request=requestPage}={}){
 const deadline=AbortSignal.timeout(7000),stop=signal?AbortSignal.any([signal,deadline]):deadline;
 let u=contentURL(value);if(!u)return null;
 try{
  for(let hop=0;hop<4;hop++){
   stop.throwIfAborted();
   const records=await resolveDNS(u.hostname,{family:4,all:true});
   if(!records.length||records.some(r=>!publicIPv4(r.address)))return null;
   const r=await request(u,records[0].address,stop);
   if([301,302,303,307,308].includes(r.status)){u=contentURL(new URL(r.location,u).href);if(!u)return null;continue;}
   if(r.status!==200)return null;
   if(r.type.includes('application/pdf'))return {url:u.href,title:null};
   if(!r.type.includes('text/html'))return null;
   const title=clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.body)?.[1]||'');
   if(!title||/not found|access denied|just a moment|sign in|log in|page unavailable|404|captcha/i.test(title))return null;
   return {url:u.href,title:title.slice(0,300)};
  }
 }catch{if(signal?.aborted)throw signal.reason;}
 return null;
}
export function sameContent(expected,actual){
 if(!actual)return true; // A PDF has no HTML title; the search citation identifies it.
 const words=s=>new Set(clean(s).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]),a=words(expected),b=words(actual);
 return a.size>0&&[...a].filter(w=>b.has(w)).length/Math.min(a.size,b.size||1)>=0.5;
}
