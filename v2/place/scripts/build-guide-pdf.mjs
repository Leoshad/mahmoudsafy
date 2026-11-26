// Builds public/guide-en.pdf and public/guide-ar.pdf from public/guide-content.js,
// so the downloadable PDF always matches the in-app guide.
// Run: node scripts/build-guide-pdf.mjs
import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';
import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {dirname,join} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url)),pub=join(here,'..','public'),fonts='file://'+join(here,'guide-fonts')+'/';
const face=(fam,file,w,range)=>`@font-face{font-family:${fam};src:url(${fonts}${file});font-weight:${w};unicode-range:${range}}`;
const AR='U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF',LA='U+0000-024F,U+2000-206F,U+2190-21FF';
const faces=[[400],[500],[700],[800]].map(([w])=>face('Taj',`tajawal-arabic-${w}-normal.woff2`,w,AR)+face('Taj',`tajawal-latin-${w}-normal.woff2`,w,LA)).join('')+
 [400,700].map(w=>face('Ami',`amiri-arabic-${w}-normal.woff2`,w,AR)+face('Ami',`amiri-latin-${w}-normal.woff2`,w,LA)).join('');
const print=`${faces}
@page{size:A4;margin:0}
html,body{margin:0;background:#131116}
.our-guide{position:static!important;display:block!important;font-family:Taj,sans-serif!important;font-size:17.5px!important;background:#131116}
.our-guide h1{font-family:Ami,serif!important;font-size:36px}
.our-guide .g-names{font-family:Ami,serif}
.our-guide .g-bar,.our-guide .g-dots,.our-guide .g-hint,.our-guide .g-download{display:none!important}
.our-guide .g-scroll{overflow:visible;padding:0!important}
.our-guide .g-page{width:210mm;height:297mm;max-width:none;min-height:0;margin:0!important;border:0;border-radius:0;padding:0 16mm 14mm;box-sizing:border-box;page-break-after:always;position:relative;overflow:hidden;background:#131116}
.our-guide .g-page:last-child{page-break-after:auto}
.our-guide .g-page>.g-over{margin:0 -16mm 8mm;padding:5mm 16mm;background:#0c0a0d;border-bottom:1.2mm solid #d1b078;font-size:12px}
.our-guide .g-cover>.g-over{background:none;border:0;margin-bottom:6mm}
.our-guide .g-cover{justify-content:center}
.our-guide .g-two{grid-template-columns:1fr 1fr;gap:12px}
.our-guide .g-t{width:40px;height:40px;font-size:19px}
.our-guide .g-table{width:92%;margin:6px auto 14px}
.our-guide .g-page::after{content:"Our Place";position:absolute;bottom:7mm;inset-inline-end:16mm;font-size:11px;color:#7d6c77}`;
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
try{
 for(const lang of ['en','ar']){
  const page=await browser.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${readFileSync(join(pub,'guide.css'),'utf8')}${print}</style></head><body></body></html>`);
  await page.addScriptTag({content:readFileSync(join(pub,'guide-content.js'),'utf8')});
  const overflow=await page.evaluate(l=>{const c=window.OurGuideContent[l];const root=document.createElement('div');root.className='our-guide';root.dir=c.dir;root.lang=c.lang;const sc=document.createElement('div');sc.className='g-scroll';root.append(sc);
   for(const p of c.pages){const s=document.createElement('section');s.className='g-page'+(p.key==='cover'?' g-cover':'');const o=document.createElement('div');o.className='g-over';o.dir='ltr';o.textContent=p.over;const b=document.createElement('div');b.className='g-body';b.innerHTML=p.html;s.append(o,b);sc.append(s);}
   document.body.append(root);return [...sc.children].map((s,i)=>s.scrollHeight>s.clientHeight+2?i+1:0).filter(Boolean);},lang);
  await page.evaluate(()=>document.fonts.ready);
  if(overflow.length)throw new Error(`${lang}: content overflows page(s) ${overflow.join(', ')}`);
  await page.pdf({path:join(pub,`guide-${lang}.pdf`),printBackground:true,preferCSSPageSize:true});
  await page.close();console.log('built guide-'+lang+'.pdf');
 }
}finally{await browser.close();}
