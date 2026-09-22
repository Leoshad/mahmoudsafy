import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map(),sent=[],errors=[];
 const c={state:{who:'Mahmoud'},sessionEpoch:0,sending:false,attachment:null,reply:{id:'original'},pending:new Map(),crypto:{randomUUID:()=> 'id'},Date,URL:{createObjectURL:()=> 'blob:preview',revokeObjectURL(){}},info(){},error:e=>errors.push(e),sendTyping(){},paintReply(){},paintAttachment(){},paintFeed(){},saveOutbox:m=>{sent.push(m);return true;},drainOutbox:async()=>{},$:id=>{if(!nodes.has(id))nodes.set(id,{value:'',files:[]});return nodes.get(id);},createImageBitmap:async()=>({width:100,height:100,close(){}}),document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,PHOTO'})}};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf("$('#composer').onsubmit="),source.indexOf("$('#compose').onkeydown=")),c);
 vm.runInContext(source.slice(source.indexOf("$('#photo').onclick="),source.indexOf("$('#ask').onchange=")),c);
 return {c,sent,errors};
}
test('caption waits for photo upload and sends once with photo and reply in the same payload',async()=>{
 const {c,sent}=fixture();let finish;c.api=()=>new Promise(r=>finish=r);c.$('#compose').value='Caption';c.$('#upload').files=[{type:'image/jpeg',size:100}];
 const uploading=c.$('#upload').onchange();await new Promise(setImmediate);await c.$('#composer').onsubmit({preventDefault(){}});assert.equal(sent.length,0);assert.equal(c.$('#compose').value,'Caption');
 finish({id:'photo-1'});await uploading;await c.$('#composer').onsubmit({preventDefault(){}});
 assert.equal(sent.length,1);assert.deepEqual(JSON.parse(JSON.stringify(sent[0].payload)),{text:'Caption',image:'photo-1',reply:'original'});
});
test('cancelled or failed photo uploads cannot silently send a caption or reattach a removed photo',async()=>{
 const {c,sent}=fixture();c.api=async()=>{throw Error('Upload failed');};c.$('#compose').value='Keep me';c.$('#upload').files=[{type:'image/jpeg',size:100}];await c.$('#upload').onchange();assert.equal(c.attachment.failed,true);await c.$('#composer').onsubmit({preventDefault(){}});assert.equal(sent.length,0);assert.equal(c.$('#compose').value,'Keep me');
 let finish;c.api=()=>new Promise(r=>finish=r);const uploading=c.$('#upload').onchange();await new Promise(setImmediate);c.attachment=null;finish({id:'late-photo'});await uploading;assert.equal(c.attachment,null);
});
test('reply preview includes author, caption and thumbnail; navigation loads and highlights old original',async()=>{
 const el=(tag,text,parent,cls)=>{const n={tag,text,cls,children:[]};parent?.children.push(n);return n;};const root={children:[],replaceChildren(){this.children=[];}};
 const row={dataset:{message:'old'},scrollIntoView(o){this.scrolled=o.block;}};let highlighted;
 const c={el,sessionEpoch:0,state:{messages:[]},older:[],pending:new Map(),api:async()=>({id:'old',sequence:1,text:'Original',image:'photo'}),goto(){},paintFeed(){},$:()=>({children:[row]}),showSourceHighlight:r=>highlighted=r};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function paintQuote('),source.indexOf('function paintReply(')),c);c.paintQuote(root,{author:'Safy',text:'Caption',image:'photo'});assert.equal(root.children[0].children[0].text,'Safy');assert.equal(root.children[0].children[1].text,'Caption');assert.equal(root.children[1].src,'/api/photos/photo');
 vm.runInContext(source.slice(source.indexOf('async function openSource('),source.indexOf("$('#continue-play')")),c);await c.openSource('old');assert.equal(row.scrolled,'center');assert.equal(highlighted,row);assert.equal(c.older[0].id,'old');
});
