import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {initial,change} from '../domain.mjs';
const walk=e=>[e,...e.children.flatMap(walk)];
function client(s){
 let doc;const timers=new Map();let timerId=0;
 class Node{
  constructor(tag='div'){this.handlers={};this.tag=tag;this.children=[];this.dataset={};this.value='';this.className='';this.scrollTop=0;this.textContent='';this.classList={add:c=>this.className+=' '+c};}
  addEventListener(event,fn){this.handlers[event]=fn;}
  append(n){n.remove();n.parentElement=this;this.children.push(n);}
  insertBefore(n,b){n.remove();n.parentElement=this;const i=this.children.indexOf(b);this.children.splice(i<0?this.children.length:i,0,n);}
  remove(){if(this.parentElement){const p=this.parentElement;p.children=p.children.filter(x=>x!==this);this.parentElement=null;}}
  replaceChildren(){for(const n of [...this.children])n.remove();}
  setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}
  matches(q){if(q.startsWith('.'))return this.className.split(' ').includes(q.slice(1));if(q==='[data-comment]')return !!this.dataset.comment;if(q.startsWith('[data-field='))return this.dataset.field===q.match(/"(.*?)"/)[1];return this.tag===q;}
  querySelectorAll(q){return walk(this).slice(1).filter(n=>n.matches(q));}querySelector(q){return this.querySelectorAll(q)[0]??null;}
  contains(n){return walk(this).includes(n);}get isConnected(){return !!this.parentElement;}getBoundingClientRect(){return {top:0,bottom:100};}
  focus(){doc.activeElement=this;}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}showModal(){this.open=true;}close(){const was=this.open;this.open=false;if(was)this.handlers.close?.();}reset(){}
 }
 const nodes=new Map(),$=q=>{if(!nodes.has(q))nodes.set(q,new Node());return nodes.get(q);};doc={querySelector:$,createElement:t=>new Node(t),activeElement:null};
 const el=(t,text,p,cls)=>{const n=new Node(t);n.textContent=text??'';n.className=cls??'';p?.append(n);return n;};const failures=[],btn=(t,p,fn,cls)=>{const n=el('button',t,p,cls);n.onclick=async()=>{try{await fn();}catch(e){failures.push(e);}};return n;};
 let wall,filter='All',tab='',commands=[];
 const context={setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),document:doc,structuredClone,Intl,Date,crypto:{randomUUID},history:{back:()=>tab='space',replaceState(){}}};context.window=context;vm.createContext(context);vm.runInContext(readFileSync(new URL('../public/wall.js',import.meta.url),'utf8'),context);
 wall=context.OurWall({getState:()=>({...s,who:'Mahmoud'}),api:async()=>({}),command:async(type,data,id)=>{commands.push({type,data,id});if(type==='item.ask'){const item=s.items.find(i=>i.id===data.id);item.comments??=[];item.comments.push({id:randomUUID(),by:'Mahmoud',text:data.question,to:'Echo'},{id:'echo-test',by:'Echo',text:'',status:'streaming'});item.revision++;}else change(s,'Mahmoud',type,data);},sync:async()=>wall.paint(),goto:t=>tab=t,info(){},error:e=>failures.push(e),el,btn,categories:['Idea','Photo','Plan','Agreement'],getFilter:()=>filter,setFilter:v=>filter=v,openSource(){}});
 return {$,wall,failures,commands,timers,tab:()=>tab,doc};
}
const sheet=c=>c.$('#our-place-trial').querySelector('.wall-comment-sheet');
const button=(root,text)=>walk(root).find(n=>n.tag==='button'&&n.textContent===text);
test('wall preserves typed comment and open thread during a partner update, then sends once',async()=>{
 const s=initial();change(s,'Safy','item.save',{type:'Idea',title:'Visit together'});const c=client(s);c.wall.paint();const card=c.$('#items').children[0];
 await button(card,'Comment').onclick();const textarea=sheet(c).querySelector('textarea');textarea.value='I would love that';textarea.oninput();textarea.focus();
 change(s,'Safy','item.like',{id:s.items[0].id,value:true});c.wall.paint();assert.equal(c.$('#items').children[0],card);assert.equal(sheet(c).querySelector('textarea').value,'I would love that');assert.equal(sheet(c).open,true);
 const form=sheet(c).querySelector('textarea').parentElement;await form.onsubmit({preventDefault(){}});assert.equal(s.items[0].comments[0].text,'I would love that');assert.equal(sheet(c).querySelector('textarea').value,'');assert.deepEqual(c.failures,[]);
});
test('editor can convert photo post to plan without losing image and returns to wall',async()=>{
 const s=initial(),photo=randomUUID();change(s,'Safy','item.save',{type:'Photo',title:'Our trip',image:photo});const c=client(s);c.wall.edit(s.items[0]);assert.equal(c.tab(),'editor');assert.equal(c.$('#wall-previews').children.length,1);
 c.$('#item-type').value='Plan';c.$('#item-type').onchange();assert.equal(c.$('#wall-steps-editor').hidden,false);c.$('#wall-steps').value='Pick a date\nBook tickets';await c.$('#item-form').onsubmit({preventDefault(){}});assert.equal(s.items[0].type,'Plan');assert.equal(s.items[0].steps.length,2);assert.equal(s.items[0].image,photo);assert.equal(c.tab(),'space');assert.deepEqual(c.failures,[]);
});
test('agreement guidance is conditional and empty photo posts require attachment',async()=>{
 const c=client(initial());c.wall.edit();c.$('#item-type').value='Photo';c.$('#item-type').onchange();assert.equal(c.$('#wall-agreement-note').hidden,true);await c.$('#item-form').onsubmit({preventDefault(){}});assert.equal(c.commands.length,0);
 c.$('#item-type').value='Agreement';c.$('#item-type').onchange();assert.equal(c.$('#wall-agreement-note').hidden,false);
});
test('tab navigation and browser back restore each scrolling position',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),start=source.indexOf('const tabPositions={};'),end=source.indexOf("history.replaceState({placeTab:'chat'}",start);
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{scrollTop:0});return elements.get(id);};const context={$,window:{},document:{querySelectorAll:()=>[]},history:{pushState(){}},paintItems(){},paint(){},activities:()=>[]};
 vm.createContext(context);vm.runInContext("let tab='space';"+source.slice(start,end)+';this.go=goto;',context);
 $('.shell').scrollTop=650;context.go('editor');assert.equal($('.shell').scrollTop,0);$('.shell').scrollTop=95;context.go('space',true);assert.equal($('.shell').scrollTop,650);
 context.go('together');$('.shell').scrollTop=430;context.go('space');assert.equal($('.shell').scrollTop,650);context.go('together',true);assert.equal($('.shell').scrollTop,430);
});
test('delete opens a visible modal, cancellation keeps the post, confirmation removes it after updates',async()=>{
 const s=initial();change(s,'Mahmoud','item.save',{type:'Idea',title:'Disposable deletion test'});const c=client(s);c.wall.paint();let card=c.$('#items').children[0];await button(card,'Delete post').onclick();const modal=c.$('#our-place-trial').children.find(n=>n.className==='wall-delete-dialog');assert.equal(modal.open,true);
 await button(modal,'Keep it').onclick();assert.equal(s.items.length,1);assert.equal(modal.open,false);
 await button(card,'Delete post').onclick();change(s,'Safy','item.like',{id:s.items[0].id,value:true});c.wall.paint();assert.equal(modal.open,true);await button(modal,'Delete post').onclick();assert.equal(s.items.length,0);assert.equal(modal.open,false);c.wall.paint();assert.ok(c.$('#items').querySelector('.wall-empty'));assert.deepEqual(c.failures,[]);
});
test('wall controls: gallery, reactions, pinning, comments, filtering and approval',async()=>{
 const s=initial();change(s,'Mahmoud','item.save',{type:'Photo',title:'Photo test',images:[randomUUID()]});const c=client(s);c.wall.paint();let card=c.$('#items').children[0];
 await button(card,'♡ Like').onclick();assert.deepEqual(s.items[0].likes,['Mahmoud']);await button(card,'❤️ Love').onclick();assert.deepEqual(s.items[0].likes,[]);
 await button(card,'Pin for us').onclick();assert.equal(s.items[0].pinned,true);await button(card,'Unpin').onclick();assert.equal(s.items[0].pinned,false);
 await card.querySelector('.wall-gallery').children[0].onclick();const viewer=c.$('#our-place-trial').children.find(n=>n.className==='wall-viewer');assert.equal(viewer.open,true);await button(viewer,'Close').onclick();assert.equal(viewer.open,false);
 await button(card,'Comment').onclick();let form=sheet(c).querySelector('textarea').parentElement;sheet(c).querySelector('textarea').value='Comment test';await form.onsubmit({preventDefault(){}});assert.equal(s.items[0].comments.length,1);await button(sheet(c),'Remove').onclick();assert.equal(s.items[0].comments.length,0);
 c.$('#space-search').value='not there';c.wall.paint();assert.ok(c.$('#items').querySelector('.wall-empty'));c.$('#space-search').value='';c.wall.paint();assert.equal(c.$('#items').children.length,1);
 c.wall.edit(s.items[0]);c.$('#item-type').value='Agreement';c.$('#item-text').value='Test agreement';c.$('#item-ai').checked=true;await c.$('#item-form').onsubmit({preventDefault(){}});assert.equal(s.items[0].aiAllowed,true);card=c.$('#items').children[0];await button(card,'I agree').onclick();assert.deepEqual(s.items[0].approvals,['Mahmoud']);await button(card,'Withdraw my approval').onclick();assert.equal(s.items[0].approvals.length,0);assert.deepEqual(c.failures,[]);
});
test('Invite Echo toggles participation and uses the same composer without navigating',async()=>{
 const s=initial();change(s,'Mahmoud','item.save',{type:'Idea',title:'Our post'});const c=client(s);c.wall.paint();await button(c.$('#items').children[0],'Comment').onclick();
 await button(sheet(c),'✦ Invite Echo').onclick();assert.equal(s.items[0].echoComments,true);assert.ok(button(sheet(c),'✦ Echo is here'));
 const input=sheet(c).querySelector('textarea');input.value='@Echo any suggestions?';await input.parentElement.onsubmit({preventDefault(){}});assert.equal(c.commands.at(-1).type,'item.comment');assert.equal(c.tab(),'');assert.equal(sheet(c).querySelectorAll('textarea').length,1);assert.equal(sheet(c).querySelectorAll('input').length,0);
 s.items[0].comments.push({id:'echo-test',by:'Echo',text:'',status:'streaming'});c.wall.paint();c.wall.delta({post:s.items[0].id,id:'echo-test',text:'Try a picnic.'});assert.equal(sheet(c).querySelectorAll('[data-comment]').find(n=>n.dataset.comment==='echo-test').textContent,'Try a picnic.');
 await button(sheet(c),'✦ Echo is here').onclick();assert.equal(s.items[0].echoComments,false);assert.deepEqual(c.failures,[]);
});
test('wall toolbar opens separate search/settings dialogs without moving the feed',async()=>{
 const s=initial();change(s,'Safy','item.save',{type:'Idea',title:'A little memory'});const c=client(s);c.wall.paint();const card=c.$('#items').children[0];
 c.$('#wall-search-open').onclick();assert.equal(c.$('#wall-search-dialog').open,true);c.$('#space-search').value='missing';c.wall.paint();assert.equal(c.$('#wall-filter-status').hidden,false);c.$('#wall-filter-clear').onclick();assert.equal(c.$('#space-search').value,'');assert.equal(c.$('#wall-filter-status').hidden,true);c.$('#wall-search-done').onclick();assert.equal(c.$('#wall-search-dialog').open,false);
 c.$('#wall-settings-open').onclick();assert.equal(c.$('#daily-settings').open,true);c.$('#wall-settings-close').onclick();assert.equal(c.$('#daily-settings').open,false);assert.equal(c.doc.activeElement,c.$('#wall-settings-open'));assert.equal(s.items[0].title,'A little memory');
});
test('Echo suggestions remain discoverable inside the add-moment screen',()=>{
 const s=initial();s.proposals=[{type:'item',title:'An evening'}];const c=client(s);c.wall.paint();assert.equal(c.$('#wall-suggestions').hidden,false);c.$('#wall-suggestions').onclick();assert.equal(c.tab(),'editor');assert.equal(c.$('#wall-create-echo').open,true);
});

test('comment threads resist outside dismissal and emoji choices persist without losing the draft',async()=>{
 const s=initial();change(s,'Safy','item.save',{type:'Discussion',title:'Talk to me'});const c=client(s);c.wall.paint();const card=c.$('#items').children[0];
 await button(card,'Comment').onclick();assert.equal(sheet(c).open,true);
 const field=sheet(c).querySelector('textarea');field.value='Still writing';field.oninput();
 await button(card,'😂').onclick();assert.equal(s.items[0].reactions.Mahmoud,'😂');assert.equal(sheet(c).querySelector('textarea').value,'Still writing');assert.equal(sheet(c).open,true);
 assert.ok(button(sheet(c),'✦ Invite Echo'));
 await button(card,'😂').onclick();assert.equal(s.items[0].reactions.Mahmoud,undefined);assert.deepEqual(c.failures,[]);
});
test('Echo prose gains paragraph breaks and citation markup is replaced by one named source',()=>{
 const s=initial(),citation='[nature.com](https://www.nature.com/article)',title='First sentence. Second sentence. Third sentence. ('+citation+')';
 s.items.push({id:'daily-source',by:'Echo',type:'Discussion',title,sources:[{start:title.indexOf(citation),end:title.indexOf(citation)+citation.length,url:'https://www.nature.com/article',title:'Nature study'}],daily:{},revision:1});
 const c=client(s);c.wall.paint();const card=c.$('#items').children[0],prose=card.querySelector('.wall-text');
 assert.equal(prose.children.length,2);assert.ok(!walk(prose).some(n=>n.textContent.includes('https://')));assert.equal(card.querySelector('.wall-sources').querySelectorAll('a').length,1);assert.equal(card.querySelector('.wall-sources').querySelector('a').textContent,'Nature study');
});

test('long press opens reactions without liking, scrolling cancels, mouse and keyboard work',async()=>{
 const s=initial();change(s,'Safy','item.save',{type:'Idea',title:'Hello'});const c=client(s);c.wall.paint();const card=c.$('#items').children[0],like=button(card,'♡ Like'),wrap=card.querySelector('.wall-like-wrap'),popup=card.querySelector('.wall-reaction-popover');
 assert.equal(popup.hidden,true);like.onpointerdown({pointerType:'touch',clientX:10,clientY:10});like.onpointermove({clientX:10,clientY:40});assert.equal(c.timers.size,0);assert.equal(popup.hidden,true);
 like.onpointerdown({pointerType:'touch',clientX:10,clientY:10});for(const fn of c.timers.values())fn();c.timers.clear();assert.equal(popup.hidden,false);wrap.onpointerleave({pointerType:'touch'});assert.equal(popup.hidden,false);await like.onclick();assert.equal(c.commands.length,0);
 await button(popup,'😂').onclick();assert.equal(s.items[0].reactions.Mahmoud,'😂');const newLike=button(card,'😂 Haha'),newPopup=card.querySelector('.wall-reaction-popover');newLike.onkeydown({key:'ArrowDown',preventDefault(){}});assert.equal(newPopup.hidden,false);newPopup.onkeydown({key:'Escape'});assert.equal(newPopup.hidden,true);
 card.querySelector('.wall-like-wrap').onpointerenter({pointerType:'mouse'});assert.equal(newPopup.hidden,false);card.querySelector('.wall-like-wrap').onpointerleave({pointerType:'mouse'});assert.equal(newPopup.hidden,true);
});
test('sheet closes only explicitly or by its header swipe, and reopens the draft',async()=>{
 const s=initial();change(s,'Safy','item.save',{type:'Idea',title:'Hello'});const c=client(s);c.wall.paint();const card=c.$('#items').children[0];await button(card,'Comment').onclick();const dialog=sheet(c),input=dialog.querySelector('textarea');input.value='Keep this';input.oninput();
 assert.equal(dialog.querySelector('.wall-thread-list').onpointerup,undefined);const head=dialog.querySelector('.wall-sheet-head');head.onpointerdown({target:head,clientX:100,clientY:100});head.onpointerup({clientX:105,clientY:180});assert.equal(dialog.open,false);
 await button(card,'Comment').onclick();assert.equal(input.value,'Keep this');assert.equal(c.doc.activeElement,button(dialog,'×'));await button(dialog,'×').onclick();assert.equal(dialog.open,false);assert.deepEqual(c.failures,[]);
});

test('Echo autocomplete replaces the active mention, preserves surrounding text and focus',async()=>{
 const s=initial();change(s,'Safy','item.save',{type:'Idea',title:'Hello'});const c=client(s);c.wall.paint();await button(c.$('#items').children[0],'Comment').onclick();const input=sheet(c).querySelector('textarea'),suggestion=button(sheet(c),'✦ Echo');
 input.value='Can you @ec help?';input.setSelectionRange(11,11);input.oninput();assert.equal(suggestion.hidden,false);let prevented=false;suggestion.onpointerdown({preventDefault(){prevented=true;}});assert.equal(prevented,true);await suggestion.onclick();assert.equal(input.value,'Can you @Echo help?');assert.equal(input.selectionStart,14);assert.equal(c.doc.activeElement,input);assert.equal(suggestion.hidden,true);assert.equal(c.commands.length,0);
 for(const value of ['me@example.com','@someone','@Echo ']){input.value=value;input.setSelectionRange(value.length,value.length);input.oninput();assert.equal(suggestion.hidden,true);}
 input.value='@';input.setSelectionRange(1,1);input.oninput();assert.equal(suggestion.hidden,false);input.onkeydown({key:'Enter',preventDefault(){}});assert.equal(input.value,'@Echo ');assert.equal(c.commands.length,0);
 input.value='@e';input.setSelectionRange(2,2);input.oninput();input.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(suggestion.hidden,true);assert.equal(sheet(c).open,true);
});
