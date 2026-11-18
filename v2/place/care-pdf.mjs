import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {check} from './domain.mjs';
const require=createRequire(import.meta.url);
let active=false,fonts;
export function careFontCSS(){if(fonts!==undefined)return fonts;try{const path=require.resolve('@fontsource/noto-sans-arabic/400.css');fonts=readFileSync(path,'utf8').replaceAll('Noto Sans Arabic','CareArabic').replace(/url\(([^)]+)\)/g,(_,p)=>'url(data:font/woff2;base64,'+readFileSync(resolve(dirname(path),p)).toString('base64')+')');}catch{fonts='';}return fonts;}
// Renders the doctor file HTML (no scripts, no network) into an A4 PDF.
export async function renderCarePDF(html,{signal}={}){
 check(!active,'Another file is being prepared. Try again in a moment.',429);active=true;let browser,timer;const abort=()=>{void browser?.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  const [{default:chromium},{default:puppeteer}]=await Promise.all([import('@sparticuz/chromium'),import('puppeteer-core')]);chromium.setGraphicsMode=false;
  browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:'shell',timeout:20000});timer=setTimeout(abort,60000);signal?.throwIfAborted();
  const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('data:')||r.url()==='about:blank'?r.continue():r.abort());await page.setJavaScriptEnabled(false);
  await page.setContent(html,{waitUntil:'load',timeout:30000});await page.evaluate(async()=>{await document.fonts.ready;});signal?.throwIfAborted();
  return Buffer.from(await page.pdf({printBackground:true,preferCSSPageSize:true,tagged:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:8px Arial;color:#897880;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>SAFY · HEALTH FILE · copied from her papers</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',timeout:45000}));
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);await browser?.close().catch(()=>{});active=false;}
}
