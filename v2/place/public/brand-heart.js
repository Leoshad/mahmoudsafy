'use strict';
// Tap the heart after "Our Place": a soft rain of hearts falls here and, at the same moment, on the other's open app.
(()=>{
let last=0;const mine=new Set();
function rain(from){
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 from.classList.remove('tapped');void from.offsetWidth;from.classList.add('tapped');
 if(reduce)return;
 const box=from.getBoundingClientRect(),layer=document.createElement('div');layer.className='heart-rain';layer.setAttribute('aria-hidden','true');document.body.append(layer);
 const W=innerWidth,H=innerHeight,count=W<500?16:22;let longest=0;
 for(let i=0;i<count;i++){
  const h=document.createElement('img');h.src='/heart.webp';h.alt='';h.className='rain-heart';
  const size=14+Math.random()*18,startX=Math.min(W-size,Math.max(0,box.left+box.width/2+(Math.random()-.5)*W*.9)),startY=box.top+(Math.random()*40-10);
  const fall=H*(.45+Math.random()*.45),sway=(Math.random()-.5)*80,spin=(Math.random()-.5)*50,delay=Math.random()*700,dur=2600+Math.random()*1600;
  longest=Math.max(longest,delay+dur);
  h.style.width=size+'px';h.style.left=startX+'px';h.style.top=startY+'px';
  layer.append(h);
  h.animate([
   {transform:'translate(0,0) scale(.4) rotate(0deg)',opacity:0},
   {transform:`translate(${sway*.3}px,${fall*.12}px) scale(1) rotate(${spin*.3}deg)`,opacity:.95,offset:.12},
   {transform:`translate(${-sway*.4}px,${fall*.55}px) scale(.95) rotate(${-spin*.4}deg)`,opacity:.8,offset:.55},
   {transform:`translate(${sway}px,${fall}px) scale(.85) rotate(${spin}deg)`,opacity:0}
  ],{duration:dur,delay,easing:'cubic-bezier(.25,.6,.4,1)',fill:'both'});
 }
 setTimeout(()=>layer.remove(),longest+200);
}
function mount(){
 const heart=document.querySelector('.brand .brand-heart');if(!heart||heart.dataset.ready)return;heart.dataset.ready='1';
 heart.setAttribute('role','button');heart.setAttribute('tabindex','0');heart.setAttribute('aria-label','Rain hearts');heart.removeAttribute('aria-hidden');
 const go=e=>{e.preventDefault();const now=Date.now();if(now-last<1200)return;last=now;rain(heart);const id=(crypto.randomUUID?.()||String(now)+Math.random().toString(16).slice(2)).replace(/[^\w-]/g,'');mine.add(id);fetch('/api/heart-rain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}).catch(()=>{});};
 heart.addEventListener('click',go);heart.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')go(e);});
}
window.OurHeartRain={receive(d){if(!d?.id||mine.has(d.id))return;const heart=document.querySelector('.brand .brand-heart');if(heart&&!document.hidden)rain(heart);}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
