import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Bandwidth savings only: the bytes the browser ends up with are unchanged.
// - Text responses are gzip-compressed when the browser accepts gzip.
// - Built-in files carry an ETag, so an unchanged file answers 304 with no body.
// - Uploaded photos never change (each upload gets a new random id), so phones may keep them.

const MIN_COMPRESS=1024;
const compressibleType=/^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg\+xml)/;

export function acceptsGzip(req){return /\bgzip\b/i.test(String(req?.headers?.['accept-encoding']||''));}

export function maybeGzip(req,type,body){
 if(!body||body.length<MIN_COMPRESS||!compressibleType.test(type)||!acceptsGzip(req))return {body,headers:{}};
 return {body:gzipSync(body,{level:6}),headers:{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}};
}

export function sendJSON(res,code,data){
 const text=JSON.stringify(data);
 if(text===undefined){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});return res.end();}
 const type='application/json; charset=utf-8',packed=maybeGzip(res.req,type,Buffer.from(text));
 res.writeHead(code,{'Content-Type':type,'Content-Length':packed.body.length,...packed.headers});res.end(packed.body);
}

const builtIn=new Map();
function builtInFile(file){
 let entry=builtIn.get(file);
 if(!entry){
  const raw=readFileSync(file);
  entry={raw,etag:'"'+createHash('sha256').update(raw).digest('base64url').slice(0,27)+'"',gz:null};
  builtIn.set(file,entry);
 }
 return entry;
}

export function serveBuiltIn(req,res,file,type){
 const entry=builtInFile(file);
 const revalidate=/(javascript|css|html|manifest)/.test(type);
 const headers={'Content-Type':type+(/^(text\/|application\/(json|manifest\+json))/.test(type)?'; charset=utf-8':''),'ETag':entry.etag,'Cache-Control':revalidate?'no-cache':'public, max-age=86400','Vary':'Accept-Encoding'};
 const tags=String(req.headers['if-none-match']||'').split(',').map(t=>t.trim().replace(/^W\//,''));
 if(tags.includes(entry.etag)){res.writeHead(304,headers);return res.end();}
 let body=entry.raw;
 if(body.length>=MIN_COMPRESS&&compressibleType.test(type)&&acceptsGzip(req)){entry.gz??=gzipSync(entry.raw,{level:9});body=entry.gz;headers['Content-Encoding']='gzip';}
 headers['Content-Length']=body.length;res.writeHead(200,headers);res.end(body);
}

export const PHOTO_CACHE='private, max-age=31536000, immutable';
export const VIDEO_CACHE='public, max-age=86400';
