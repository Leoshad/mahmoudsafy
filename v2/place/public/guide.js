'use strict';
// Game guide reader: full-screen, swipe up page by page, English by default with an Arabic switch.
(()=>{
const KEY='our-place:guide:lang';
let root=null,lang='en',open=false,observer=null,current=0;
function stored(){try{return localStorage.getItem(KEY)==='ar'?'ar':'en';}catch{return 'en';}}
function save(v){try{localStorage.setItem(KEY,v);}catch{}}
function content(){return window.OurGuideContent?.[lang]||window.OurGuideContent?.en;}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}

function build(){
 root=el('div','our-guide');root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
 const bar=el('div','g-bar'),title=el('strong','g-title'),count=el('span','g-count'),tools=el('div','g-tools');
 const langs=el('div','g-lang');langs.setAttribute('role','group');
 for(const [code,label] of [['en','EN'],['ar','ع']]){const b=el('button','',label);b.type='button';b.dataset.lang=code;b.onclick=()=>switchLang(code);langs.append(b);}
 const close=el('button','g-close','✕');close.type='button';close.onclick=()=>hide();
 tools.append(langs,close);bar.append(title,count,tools);
 const dots=el('div','g-dots'),scroll=el('div','g-scroll');
 const hint=el('div','g-hint');
 root.append(bar,scroll,dots,hint);document.body.append(root);
 root.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
}
function render(keepKey){
 const c=content();if(!c||!root)return;
 root.dir=c.dir;root.lang=c.lang;root.setAttribute('aria-label',c.title);
 root.querySelector('.g-title').textContent='📖 '+c.title;
 root.querySelector('.g-close').setAttribute('aria-label',c.close);
 root.querySelectorAll('.g-lang button').forEach(b=>{b.classList.toggle('on',b.dataset.lang===lang);b.setAttribute('aria-pressed',String(b.dataset.lang===lang));});
 root.querySelector('.g-hint').textContent=c.swipe+' ⌃';
 const scroll=root.querySelector('.g-scroll'),dots=root.querySelector('.g-dots');
 scroll.replaceChildren();dots.replaceChildren();
 c.pages.forEach((p,i)=>{
  const page=el('section','g-page'+(p.key==='cover'?' g-cover':''));page.dataset.key=p.key;page.dataset.index=String(i);
  const over=el('div','g-over',p.over);over.dir='ltr';
  const body=el('div','g-body');body.innerHTML=p.html;
  page.append(over,body);
  if(i===c.pages.length-1){const d=el('a','g-download','⤓ '+c.download);d.href='/guide-'+c.lang+'.pdf';d.download='Our-Place-Game-Guide-'+c.lang.toUpperCase()+'.pdf';page.append(d);}
  scroll.append(page);
  const dot=el('button','g-dot');dot.type='button';dot.setAttribute('aria-label',String(i+1));dot.onclick=()=>goTo(i,true);dots.append(dot);
 });
 observer?.disconnect();
 observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&e.intersectionRatio>=.35){current=Number(e.target.dataset.index);paintCount();}},{root:scroll,threshold:[.35,.6]});
 scroll.querySelectorAll('.g-page').forEach(p=>observer.observe(p));
 const target=keepKey?c.pages.findIndex(p=>p.key===keepKey):0;
 goTo(target<0?0:target,false);
}
function paintCount(){
 const c=content();if(!root||!c)return;
 const n=root.querySelector('.g-count');n.textContent=`${current+1} / ${c.pages.length}`;n.dir='ltr';
 root.querySelectorAll('.g-dot').forEach((d,i)=>d.classList.toggle('on',i===current));
 root.querySelector('.g-hint').hidden=current!==0;
}
function goTo(i,smooth){
 const page=root?.querySelectorAll('.g-page')[i];if(!page)return;
 current=i;paintCount();
 const scroll=root.querySelector('.g-scroll');
 scroll.scrollTo({top:page.offsetTop-scroll.offsetTop,behavior:smooth?'smooth':'auto'});
}
function switchLang(next){if(next===lang)return;const key=root.querySelectorAll('.g-page')[current]?.dataset.key;lang=next;save(next);render(key);}
function show(section){
 if(!window.OurGuideContent)return;
 if(!root)build();
 lang=stored();
 const wasOpen=open;open=true;root.hidden=false;document.documentElement.classList.add('guide-open');
 render(section||'cover');
 if(!wasOpen&&!history.state?.guide)history.pushState({...(history.state||{}),guide:true},'');
 root.querySelector('.g-close').focus({preventScroll:true});
}
function hide(fromHistory=false){
 if(!open)return;open=false;root.hidden=true;document.documentElement.classList.remove('guide-open');
 if(!fromHistory&&history.state?.guide)history.back();
}
window.addEventListener('popstate',e=>{if(open&&!e.state?.guide)hide(true);});

function launcher(){
 const b=el('button','guide-launch');b.type='button';
 b.innerHTML='<span class="gl-icon" aria-hidden="true">📖</span><span class="gl-text"><small>A QUICK READ</small><strong>Game Guide</strong><span>Our Word · Billiards · The Crown</span></span><span class="gl-arrow" aria-hidden="true">›</span>';
 b.onclick=()=>show('cover');return b;
}
function mini(section,label){const b=el('button','guide-mini','📖 '+label);b.type='button';b.onclick=()=>show(section);return b;}
function mount(){
 const crown=document.getElementById('crown-summary');
 if(crown&&!document.querySelector('.guide-launch'))crown.after(launcher());
 const word=document.querySelector('#word-panel .word-rules')||document.querySelector('.word-rules');
 if(word&&!document.querySelector('.guide-mini[data-for="word"]')){const b=mini('word','Full guide · Our Word');b.dataset.for='word';word.before(b);}
 const pool=document.querySelector('#billiards-panel .billiards-rules')||document.querySelector('.billiards-rules');
 if(pool&&!document.querySelector('.guide-mini[data-for="billiards"]')){const b=mini('billiards','Full guide · Billiards');b.dataset.for='billiards';pool.before(b);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.OurGuide={open:show,close:hide,isOpen:()=>open};
})();
