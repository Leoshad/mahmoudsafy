(()=>{
let prompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;});
document.querySelector('#install-app').onclick=async()=>{if(prompt){await prompt.prompt();prompt=null;}else document.querySelector('#notice').textContent='On iPhone: Share → Add to Home Screen. On Android: browser menu → Install app or Add to Home screen. Internet is required.';};
const resize=()=>requestAnimationFrame(()=>{const root=document.querySelector('#timeline');const mark=root&&root.clientHeight?PlaceScroll.capture(root):null;document.documentElement.style.setProperty('--app-height',(window.visualViewport?.height||window.innerHeight)+'px');if(mark)PlaceScroll.restore(root,mark);});
window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);resize();
})();
