(()=>{'use strict';
const $=id=>document.getElementById(id);
let host,opened=false,version=0,timer,mark,query='',index=0,total=0,selected=null,pages=new Map(),noticeTimer,clearTimer,lastNotice='',lastAt=0;
function notice(text){
 const n=$('notice');if(!n||!text)return;
 text=String(text);if(text===lastNotice&&Date.now()-lastAt<10000)return;
 lastNotice=text;lastAt=Date.now();clearTimeout(noticeTimer);clearTimeout(clearTimer);
 const chat=$('chat'),target=chat&&!chat.hidden?chat:document.querySelector('#app section:not([hidden])')||$('login');
 target?.append(n);n.classList.toggle('outside-chat',target!==chat);
 // Keep the visible line concise; the complete explanation remains accessible.
 const short=text.length>70?'Something went wrong. Please try again.':text;
 n.textContent=short;n.title=text;n.setAttribute('aria-label',text);n.classList.add('visible');
 noticeTimer=setTimeout(()=>{n.classList.remove('visible');clearTimer=setTimeout(()=>{n.textContent='';n.removeAttribute('aria-label');},180);},3000);
}
function clearHighlights(){for(const n of document.querySelectorAll('mark.chat-match')){const parent=n.parentNode;n.replaceWith(document.createTextNode(n.textContent));parent.normalize();}for(const row of document.querySelectorAll('.chat-search-active'))row.classList.remove('chat-search-active');}
function highlight(){
 if(!opened||!query||!selected)return;
 const row=[...$('feed').children].find(n=>n.dataset.message===selected),p=$('text-'+selected);if(!row||!p)return;
 row.classList.add('chat-search-active');if(p.querySelector('mark.chat-match'))return;
 const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){const text=node.nodeValue,fold=text.toLowerCase(),needle=query.toLowerCase();let from=0,at=fold.indexOf(needle);if(at<0)continue;const fragment=document.createDocumentFragment();while(at>=0){fragment.append(document.createTextNode(text.slice(from,at)));const hit=document.createElement('mark');hit.className='chat-match';hit.textContent=text.slice(at,at+query.length);fragment.append(hit);from=at+query.length;at=fold.indexOf(needle,from);}fragment.append(document.createTextNode(text.slice(from)));node.replaceWith(fragment);}
}
function controls(busy=false){$('chat-search-prev').disabled=busy||!total||index===0;$('chat-search-next').disabled=busy||!total||index>=total-1;}
async function show(next,token=++version){
 if(!opened||!query)return;index=next;controls(true);
 try{const offset=Math.floor(index/50)*50;let page=pages.get(offset);if(!page){page=await host.api('chat-search?q='+encodeURIComponent(query)+'&offset='+offset);if(token!==version||!opened)return;pages.set(offset,page);}total=page.total;const match=page.matches[index-offset];
 if(!match){$('chat-search-count').textContent='No matches';controls();return;}
 const message=await host.api('messages/'+encodeURIComponent(match.id));if(token!==version||!opened)return;
 $('chat-search-count').textContent='Loading conversation…';
 const loaded=await host.insert(message,()=>token===version&&opened);if(token!==version||!opened||loaded===false)return;
 clearHighlights();selected=message.id;highlight();
 const row=[...$('feed').children].find(n=>n.dataset.message===selected),timeline=$('timeline');if(row){const r=row.getBoundingClientRect(),t=timeline.getBoundingClientRect();timeline.scrollTop+=r.top-t.top-(timeline.clientHeight-r.height)/2;}
 $('chat-search-count').textContent=(index+1)+' / '+total;controls();
 }catch(e){if(token!==version||!opened)return;$('chat-search-count').textContent='Try again';controls();notice('Could not search. Please try again.');}
}
function search(){clearTimeout(timer);const token=++version;query=$('chat-search-query').value.trim();pages.clear();selected=null;total=0;index=0;clearHighlights();controls();$('chat-search-count').textContent=query?'Searching…':'';if(query)timer=setTimeout(()=>show(0,token),240);}
function close(){if(!opened)return;const position=selected?PlaceScroll.capture($('timeline')):mark;if(position)position.end=false;opened=false;++version;clearTimeout(timer);$('chat-search').hidden=true;$('chat-search-open').setAttribute('aria-expanded','false');clearHighlights();selected=null;pages.clear();host.clear?.();if(position)PlaceScroll.restore($('timeline'),position);mark=null;}
function reset(){close();clearTimeout(noticeTimer);clearTimeout(clearTimer);const n=$('notice');if(n){n.classList.remove('visible');n.textContent='';}lastNotice='';lastAt=0;}
function init(h){host=h;$('chat-search-open').onclick=()=>{if(opened){$('chat-search-query').focus();return;}host.stopReading();mark=PlaceScroll.capture($('timeline'));mark.end=false;opened=true;$('chat-search').hidden=false;$('chat-search-open').setAttribute('aria-expanded','true');document.querySelector('.room-tools').open=false;$('chat-search-query').value='';query='';selected=null;total=0;$('chat-search-count').textContent='';controls();$('chat-search-query').focus();};$('chat-search-query').oninput=search;$('chat-search').onsubmit=e=>{e.preventDefault();$('chat-search-query').blur();search();};$('chat-search-close').onclick=close;$('chat-search-prev').onclick=()=>show(index-1);$('chat-search-next').onclick=()=>show(index+1);$('chat-search-query').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}};}
window.OurChatTools={init,notice,highlight,close,reset};
})();
