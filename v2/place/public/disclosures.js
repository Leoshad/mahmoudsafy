/* Close open disclosures without consuming the outside click. */
(()=>{
 function dismiss(target){
  const controls=(target?.closest?.('[aria-controls]')?.getAttribute('aria-controls')||'').split(/\s+/).filter(Boolean);
  for(const panel of document.querySelectorAll('#our-place-trial details[open], .court-session-menu[open], .wall-menu[open], .message-actions[open]')){
   if(panel.dataset?.persistent==='true')continue;
   if(!panel.contains(target)&&!(panel.id&&controls.includes(panel.id)))panel.open=false;
  }
 }
 // Observe the start of a press, before child controls can stop propagation.
 // Never dismiss on move/end: a scroll starting inside may finish outside.
 document.addEventListener('pointerdown',e=>dismiss(e.target),{capture:true,passive:true});
 document.addEventListener('touchstart',e=>dismiss(e.target),{capture:true,passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=[...document.querySelectorAll('#our-place-trial details[open], .court-session-menu[open], .wall-menu[open], .message-actions[open]')];for(const p of open)p.open=false;}});
})();
