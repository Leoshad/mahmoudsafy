(()=>{'use strict';
let active=null;
const make=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
function reset(){if(!active)return;const old=active;active=null;old.controller.abort();old.dialog.remove();for(const url of old.urls)URL.revokeObjectURL(url);}
async function load(id,signal){const response=await fetch('/api/court/'+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',signal});if(response.status===401)throw Error('Your session expired. Sign in again inside Our Place, then reopen the case.');if(!response.ok)throw Error('Could not prepare the record. Please try again.');if(!response.headers.get('Content-Type')?.includes('text/html'))throw Error('The record could not be loaded. Please try again.');return response.text();}
function prepare(html,owner){
 const doc=new DOMParser().parseFromString(html,'text/html');for(const n of doc.querySelectorAll('script,style,link'))n.remove();doc.getElementById('court-print')?.remove();const css=doc.createElement('link');css.rel='stylesheet';css.href=new URL('/court-print.css',location.href).href;doc.head.append(css);
 // The preview inherits the app CSP. Use existing allowed blob images, not data URLs.
 for(const img of doc.querySelectorAll('img')){const src=img.getAttribute('src')||'',match=src.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match){img.remove();continue;}const data=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([data],{type:match[1]}));owner.urls.push(url);img.src=url;}
 return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
async function open(id,number,mode='print'){
 reset();const d=make('dialog',null,document.body);d.className='court-dialog court-print-dialog';d.setAttribute('aria-label',mode==='download'?'Download case record':'Print preview');const top=make('div',null,d);top.className='court-dialog-head';make('h2',mode==='download'?'Download record':'Print preview',top);const close=make('button','Close',top);close.type='button';close.onclick=reset;d.addEventListener('cancel',e=>{e.preventDefault();reset();});d.addEventListener('close',()=>{if(active?.dialog===d)reset();});const status=make('p','Preparing your record…',d);status.setAttribute('role','status');const owner=active={dialog:d,controller:new AbortController(),urls:[]};d.showModal();
 try{const html=await load(id,owner.controller.signal);if(active!==owner)return;
  if(mode==='download'){const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));owner.urls.push(url);const a=make('a','Save case record',d);a.className='court-link';a.href=url;a.download='court-case-'+number+'.html';status.textContent='Your document is ready, including the submitted images. Tap below to save it.';return;}
  const print=make('button','Print / Save PDF',d);print.type='button';print.disabled=true;print.className='primary';const frame=make('iframe',null,d);frame.className='court-print-frame';frame.title='Case '+number+' · print preview';frame.setAttribute('sandbox','allow-same-origin allow-modals');
  frame.onload=async()=>{if(active!==owner)return;try{const doc=frame.contentDocument;if(!doc?.querySelector('.paper'))throw Error('The preview did not load. Close it and try again.');await doc.fonts?.ready;await Promise.all([...doc.images].map(im=>im.decode?im.decode().catch(()=>{}):Promise.resolve()));if(active!==owner)return;status.textContent='Ready. Choose Save as PDF in the print options.';print.disabled=false;}catch(e){if(active===owner)status.textContent=e.message;}};
  print.onclick=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch{status.textContent='Printing is unavailable in this browser. Use Download record, then print the saved document from your browser.';}};
  frame.srcdoc=prepare(html,owner);
 }catch(e){if(active!==owner)return;status.textContent=e.name==='AbortError'?'Request cancelled.':e.message;const retry=make('button','Retry',d);retry.type='button';retry.onclick=()=>open(id,number,mode);}
}
window.OurCourtExport={open,reset};
})();
