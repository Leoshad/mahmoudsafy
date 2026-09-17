/* Close open disclosures without consuming the outside click. */
(()=>{
 function dismiss(target){
  const controls=(target?.closest?.('[aria-controls]')?.getAttribute('aria-controls')||'').split(/\s+/);
  for(const panel of document.querySelectorAll('#our-place-trial details[open]')){
   if(panel.dataset?.persistent==='true')continue;
   if(!panel.contains(target)&&!controls.includes(panel.id))panel.open=false;
  }
 }
 document.addEventListener('pointerdown',e=>dismiss(e.target));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=[...document.querySelectorAll('#our-place-trial details[open]')];for(const p of open)p.open=false;}});
})();
