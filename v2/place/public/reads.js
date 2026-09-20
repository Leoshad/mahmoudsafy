(()=>{'use strict';
// Read means visible in the chat viewport, not merely delivered or online.
window.OurReads=function({getState,isChat,send,now=Date.now}){
 let who=null,epoch=0,busy=false;const seen=new Set(),since=new Map();
 function exposed(row){
  if(document.visibilityState!=='visible'||!isChat()||document.querySelector('dialog[open]')||!document.hasFocus())return false;
  const bubble=row.querySelector('.bubble'),timeline=document.querySelector('#timeline');if(!bubble||!timeline)return false;
  const r=bubble.getBoundingClientRect(),clip=timeline.getBoundingClientRect(),vv=window.visualViewport;
  const left=Math.max(r.left,clip.left,vv?.offsetLeft||0),right=Math.min(r.right,clip.right,(vv?.offsetLeft||0)+(vv?.width||innerWidth));
  const top=Math.max(r.top,clip.top,vv?.offsetTop||0),bottom=Math.min(r.bottom,clip.bottom,(vv?.offsetTop||0)+(vv?.height||innerHeight));
  if(right-left<Math.min(r.width*.6,120)||bottom-top<Math.min(r.height*.6,120))return false;
  // A floating new-message button can cover the centre of an otherwise visible bubble.
  let visible=0;for(const x of [.2,.5,.8])for(const y of [.2,.5,.8]){const hit=document.elementFromPoint(left+(right-left)*x,top+(bottom-top)*y);if(hit&&bubble.contains(hit))visible++;}
  return visible>=5;
 }
 async function scan(){
  const state=getState();if(state?.who!==who){who=state?.who;epoch++;since.clear();seen.clear();}if(!who)return;
  const eligible=new Set(),ids=[];for(const row of document.querySelectorAll('#feed .message')){
   const id=row.dataset.message;if(seen.has(id)||row.dataset.author===who||!['Mahmoud','Safy'].includes(row.dataset.author)||row.dataset.sent!=='true'||!exposed(row))continue;
   eligible.add(id);if(!since.has(id))since.set(id,now());if(now()-since.get(id)>=600)ids.push(id);
  }
  for(const id of since.keys())if(!eligible.has(id))since.delete(id);
  if(busy||!ids.length)return;busy=true;const current=epoch,batch=ids.slice(0,100);
  try{await send(batch);if(current===epoch)batch.forEach(id=>seen.add(id));}catch{}finally{busy=false;}
 }
 const timer=setInterval(scan,300);document.addEventListener('visibilitychange',()=>{since.clear();scan();});window.addEventListener('blur',()=>since.clear());
 return {scan,reset(){who=null;epoch++;since.clear();seen.clear();},stop(){clearInterval(timer);}};
};
})();
