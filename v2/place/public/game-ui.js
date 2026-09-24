(()=>{'use strict';
let active=null,serial=0,unreadCount=0;const chatButtons=new Set();
function paintChat(){for(const b of chatButtons){if(!b.isConnected){chatButtons.delete(b);continue;}b.hidden=!unreadCount;b.querySelector('span').textContent=unreadCount>99?'99+':String(unreadCount);b.setAttribute('aria-label','Open chat · '+unreadCount+' unread messages');}}
function registerChat(head,open){if(!head||head.querySelector('.game-chat-unread'))return;const b=document.createElement('button');b.type='button';b.className='game-chat-unread';b.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4Z"/></svg><span></span>';b.onclick=()=>Promise.resolve(open()).catch(()=>{});(head.querySelector('h3,strong')||head).append(b);chatButtons.add(b);paintChat();}

window.OurGameUI={registerChat,unread(count){unreadCount=Math.max(0,Number(count)||0);paintChat();},confirm({title='Are you sure?',message,confirmLabel='Confirm',cancelLabel='Keep playing'}={}){
 if(active)return Promise.resolve(false);
 return new Promise(resolve=>{
  const previous=document.activeElement,d=document.createElement('dialog'),id='game-confirm-'+(++serial);d.className='game-dialog';d.setAttribute('aria-labelledby',id);d.setAttribute('aria-describedby',id+'-message');
  const heading=document.createElement('h3');heading.id=id;heading.textContent=title;
  const p=document.createElement('p');p.id=id+'-message';p.textContent=message||'';
  const actions=document.createElement('div');actions.className='game-dialog-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='primary';cancel.textContent=cancelLabel;
  const accept=document.createElement('button');accept.type='button';accept.className='game-dialog-danger';accept.textContent=confirmLabel;
  let result=false;cancel.onclick=()=>d.close();accept.onclick=()=>{result=true;d.close();};
  d.addEventListener('close',()=>{active=null;d.remove();if(previous?.isConnected)previous.focus();resolve(result);},{once:true});
  actions.append(cancel,accept);d.append(heading,p,actions);document.body.append(d);active=d;d.showModal();cancel.focus();
 });
}};
})();
