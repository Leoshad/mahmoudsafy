import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Store} from '../store.mjs';
import {recordReads} from '../reads.mjs';
test('only the other human participant can mark a sent message read; receipts are durable and idempotent',()=>{
 const store=new Store(':memory:');try{const id=randomUUID(),echo=randomUUID();store.message({id,author:'Mahmoud',text:'Hello'});store.message({id:echo,author:'Echo',text:'Hello'});
 assert.equal(store.messages()[0].readAt,null);assert.deepEqual(recordReads(store,'Mahmoud',[id]).ids,[]);assert.deepEqual(recordReads(store,'Safy',[echo]).ids,[]);
 assert.deepEqual(recordReads(store,'Safy',[id,id]).ids,[id]);const at=store.messages()[0].readAt;assert.ok(at);assert.deepEqual(recordReads(store,'Safy',[id]).ids,[]);assert.equal(store.snapshot('Mahmoud').messages[0].readAt,at);assert.throws(()=>recordReads(store,'Echo',[id]));
 }finally{store.close();}
});
function fixture(){
 let time=0,active=true,visible=true,covered=false,focused=true,modal=false,centerCovered=false,author='Mahmoud',top=20;const sent=[];
 const bubble={getBoundingClientRect:()=>({left:0,right:200,top,bottom:top+80,width:200,height:80}),contains:n=>n===bubble};
 const row={dataset:{message:'one',author:'Mahmoud',sent:'true'},querySelector:()=>bubble};
 const document={get visibilityState(){return visible?'visible':'hidden';},hasFocus:()=>focused,querySelector:s=>s==='dialog[open]'?(modal?{}:null):{getBoundingClientRect:()=>({left:0,right:300,top:0,bottom:300})},querySelectorAll:()=>[row],elementFromPoint:(x,y)=>covered||(centerCovered&&x>70&&x<130)?{}:bubble,addEventListener(){}};
 const window={addEventListener(){}};vm.runInNewContext(readFileSync(new URL('../public/reads.js',import.meta.url),'utf8'),{window,document,innerWidth:300,innerHeight:300,setInterval:()=>1,clearInterval(){},Date});
 const tracker=window.OurReads({getState:()=>({who:'Safy'}),isChat:()=>active,now:()=>time,send:async ids=>sent.push([...ids])});
 return {tracker,sent,row,advance:n=>time+=n,set:v=>{if('centerCovered'in v)centerCovered=v.centerCovered;if('active'in v)active=v.active;if('visible'in v)visible=v.visible;if('covered'in v)covered=v.covered;if('focused'in v)focused=v.focused;if('modal'in v)modal=v.modal;if('top'in v)top=v.top;}};
}
test('receipt requires dwell in the visible chat viewport, then reports once',async()=>{const c=fixture();await c.tracker.scan();assert.equal(c.sent.length,0);c.advance(650);await c.tracker.scan();assert.deepEqual(c.sent,[['one']]);c.advance(1000);await c.tracker.scan();assert.equal(c.sent.length,1);});
test('background, games, dialogs, covered and offscreen messages never count as read',async()=>{for(const setting of [{active:false},{visible:false},{covered:true},{focused:false},{modal:true},{top:400}]){const c=fixture();c.set(setting);await c.tracker.scan();c.advance(2000);await c.tracker.scan();assert.equal(c.sent.length,0,JSON.stringify(setting));}});
test('scrolling past or switching away cancels the dwell timer; own and Echo messages are excluded',async()=>{const c=fixture();await c.tracker.scan();c.advance(400);c.set({active:false});await c.tracker.scan();c.advance(500);c.set({active:true});await c.tracker.scan();assert.equal(c.sent.length,0);for(const author of ['Safy','Echo']){const c=fixture();c.row.dataset.author=author;await c.tracker.scan();c.advance(1000);await c.tracker.scan();assert.equal(c.sent.length,0);}});

test('unread metadata covers history beyond the latest page, both accounts, and only unread partner messages',()=>{
 const store=new Store(':memory:');try{
 const ids=Array.from({length:75},()=>randomUUID());for(const id of ids)store.message({id,author:'Safy',text:'Hello'});
 const own=randomUUID(),echo=randomUUID();store.message({id:own,author:'Mahmoud',text:'Hi'});store.message({id:echo,author:'Echo',text:'Hi'});
 assert.equal(store.snapshot('Mahmoud').messages.length,60);
 assert.deepEqual(store.snapshot('Mahmoud').unreadMessages.map(m=>m.id),ids);
 assert.deepEqual(store.snapshot('Safy').unreadMessages.map(m=>m.id),[own]);
 recordReads(store,'Mahmoud',[ids[1],ids[3]]);
 assert.deepEqual(store.snapshot('Mahmoud').unreadMessages.map(m=>m.id),ids.filter((_,i)=>i!==1&&i!==3));
 assert.equal(store.snapshot('Mahmoud').unreadMessages[0].id,ids[0]);
 recordReads(store,'Mahmoud',ids);assert.equal(store.snapshot('Mahmoud').unreadMessages.length,0);
 assert.equal(store.snapshot('Safy').unreadMessages.length,1);
 }finally{store.close();}
});

test('new-message button targets first unread, scrolls smoothly, and does not mark read on click',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function jumpToUnread(){'),source.indexOf("$('#latest').onclick="));
 const calls=[],row={dataset:{message:'first'},getBoundingClientRect:()=>({top:250})};
 const timeline={scrollTop:100,scrollHeight:2000,getBoundingClientRect:()=>({top:50}),scrollTo:v=>calls.push(v)};
 const state={unreadMessages:[{id:'first'},{id:'second'}]};
 const ctx={state,sessionEpoch:1,readingHold:null,readingRestoring:true,historyHold:null,$:s=>s==='#timeline'?timeline:{children:[row]},matchMedia:()=>({matches:false}),updateLatest(){}};
 vm.createContext(ctx);vm.runInContext(fn+';this.jump=jumpToUnread',ctx);await ctx.jump();
 assert.equal(calls[0].top,288);assert.equal(calls[0].behavior,'smooth');assert.equal(state.unreadMessages.length,2);assert.equal(ctx.readingRestoring,false);
});


test('a small overlay covering bubble centre does not block reading the visible majority',async()=>{const c=fixture();c.set({centerCovered:true});await c.tracker.scan();c.advance(650);await c.tracker.scan();assert.deepEqual(c.sent,[['one']]);});
test('stale snapshots cannot resurrect confirmed unread messages or erase partner receipts',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('const confirmedReads='),source.indexOf('let unreadOwner='));
 const c={older:[]};vm.createContext(c);vm.runInContext(code+';this.confirmed=confirmedReads',c);
 c.reconcileReads({who:'Mahmoud',messages:[],unreadMessages:[]});c.confirmed.set('incoming','read-time');c.confirmed.set('outgoing','read-time');
 const stale={who:'Mahmoud',messages:[{id:'outgoing',readAt:null}],unreadMessages:[{id:'incoming'},{id:'new'}]};c.reconcileReads(stale);
 assert.equal(stale.messages[0].readAt,'read-time');assert.deepEqual(stale.unreadMessages.map(m=>m.id),['new']);
 const other={who:'Safy',messages:[],unreadMessages:[{id:'incoming'}]};c.reconcileReads(other);assert.equal(other.unreadMessages.length,1);
});
