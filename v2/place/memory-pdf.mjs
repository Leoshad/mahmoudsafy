import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {check} from './domain.mjs';
import {memoryHTML} from './memory-document.mjs';
const require=createRequire(import.meta.url);
let active=false,fonts;
function fontStyles(){
 if(fonts)return fonts;
 return fonts=[['noto-sans-arabic','MemoryArabic'],['noto-emoji','MemoryEmoji']].map(([pkg,name])=>{
 const path=require.resolve('@fontsource/'+pkg+'/400.css');
 return readFileSync(path,'utf8').replaceAll(pkg==='noto-emoji'?'Noto Emoji':'Noto Sans Arabic',name).replace(/url\(([^)]+)\)/g,(_,p)=>'url(data:font/woff2;base64,'+readFileSync(resolve(dirname(path),p)).toString('base64')+')');
 }).join('\n');
}
export async function renderMemoryPDF(data,store,{origin='',signal}={}){
 check(!active,'Another memory book is being prepared. Try again shortly.',429);active=true;
 let browser,timer;const abort=()=>{void browser?.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  signal?.throwIfAborted();let size=0;const cache=new Map(),requested=new Map();
  // Discover only images referenced by rendered, authorized content. Resize one at a time.
  memoryHTML(data,{photo:id=>{requested.set('p:'+id,()=>store.db.prepare('SELECT mime,bytes FROM photos WHERE id=?').get(id));return null;},filePhoto:id=>{requested.set('f:'+id,()=>store.db.prepare('SELECT mime,bytes FROM shared_files WHERE id=?').get(id));return null;}});
  const {default:sharp}=await import('sharp');
  for(const [key,read]of requested){
   signal?.throwIfAborted();const p=read();if(!p){cache.set(key,null);continue;}
   check(/^image\/(jpeg|png|webp|gif)$/.test(p.mime),'An image format cannot be exported.',400);
   size+=p.bytes.length;check(size<=32*1024*1024,'This selection has too many images for one PDF. Choose a shorter period.',413);
   let bytes;try{bytes=await sharp(Buffer.from(p.bytes),{limitInputPixels:25000000}).rotate().resize({width:1400,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#fcfaf6'}).jpeg({quality:85}).toBuffer();}catch{check(false,'A photo could not be prepared. Try exporting a period without that attachment.',422);}
   cache.set(key,'data:image/jpeg;base64,'+bytes.toString('base64'));
  }
  const html=memoryHTML(data,{origin,fontCSS:fontStyles(),photo:id=>cache.get('p:'+id),filePhoto:id=>cache.get('f:'+id)});
  check(Buffer.byteLength(html)<55*1024*1024,'Choose a shorter period for this export.',413);
  const [{default:chromium},{default:puppeteer}]=await Promise.all([import('@sparticuz/chromium'),import('puppeteer-core')]);
  chromium.setGraphicsMode=false;
  browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:'shell',timeout:20000});
  timer=setTimeout(abort,75000);signal?.throwIfAborted();
  const page=await browser.newPage();await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith('data:')||r.url()==='about:blank'?r.continue():r.abort());
  await page.setJavaScriptEnabled(false);
  await page.setContent(html,{waitUntil:'load',timeout:30000});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  signal?.throwIfAborted();
  return Buffer.from(await page.pdf({printBackground:true,preferCSSPageSize:true,tagged:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:8px Arial;color:#897880;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>OUR PLACE · OUR MEMORIES</span><span class="pageNumber"></span></div>',timeout:45000}));
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);await browser?.close().catch(()=>{});active=false;}
}
