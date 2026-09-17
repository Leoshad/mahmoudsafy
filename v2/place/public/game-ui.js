(()=>{'use strict';
let active=null,serial=0;
window.OurGameUI={confirm({title='Are you sure?',message,confirmLabel='Confirm',cancelLabel='Keep playing'}={}){
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
