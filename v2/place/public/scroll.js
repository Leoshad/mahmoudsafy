const PlaceScroll={
 hold(root,saved,followEnd=false){
  const mark=saved?{...saved}:this.capture(root);if(!followEnd)mark.end=false;let stopped=false,timer,frame,observer;
  const restore=()=>{if(!stopped&&root.isConnected&&root.getClientRects().length)this.restore(root,mark);};
  const stop=()=>{stopped=true;clearTimeout(timer);cancelAnimationFrame(frame);observer?.disconnect();root.removeEventListener('load',restore,true);for(const type of ['pointerdown','touchstart','wheel','keydown'])window.removeEventListener(type,stop,true);};
  for(const type of ['pointerdown','touchstart','wheel','keydown'])window.addEventListener(type,stop,{capture:true,passive:true});
  root.addEventListener('load',restore,true);
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(restore);observer.observe(root.querySelector('#feed')||root);}
  timer=setTimeout(stop,10000);
  return {restore(){restore();frame=requestAnimationFrame(restore);},stop};
 },
 // Reveal only after an explicit open action; live updates must not move the reader.
 reveal(root,panel){if(!root||!panel)return;requestAnimationFrame(()=>{if(panel.hidden||!panel.isConnected||!panel.getClientRects().length)return;const top=Math.max(0,root.scrollTop+panel.getBoundingClientRect().top-root.getBoundingClientRect().top-12);root.scrollTo({top,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});},
 capture(root){const edge=root.getBoundingClientRect().top;const row=[...root.querySelectorAll('.message,[data-activity]')].find(n=>n.getBoundingClientRect().bottom>edge);return {id:row?(row.dataset.message||'activity:'+row.dataset.activity):undefined,offset:row?row.getBoundingClientRect().top-edge:0,top:root.scrollTop,end:root.scrollHeight-root.scrollTop-root.clientHeight<60};},
 restore(root,mark){if(mark.end){root.scrollTop=root.scrollHeight;return;}const row=[...root.querySelectorAll('.message,[data-activity]')].find(n=>(n.dataset.message||'activity:'+n.dataset.activity)===mark.id);root.scrollTop=row?root.scrollTop+row.getBoundingClientRect().top-root.getBoundingClientRect().top-mark.offset:mark.top;}
};

