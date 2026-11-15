// Split chat events into bounded books while retaining their original chronological order.
export function planChatBatches(data,{maxMessages=100,maxImages=5}={}){
 if(!Number.isSafeInteger(maxMessages)||maxMessages<1||!Number.isSafeInteger(maxImages)||maxImages<1)throw new RangeError('Invalid batch limit');
 const fragments=(data.messages||[]).flatMap(value=>{const photos=value.images?.length?value.images:(value.image?[value.image]:[]);if(photos.length<=maxImages)return [value];const out=[];for(let i=0;i<photos.length;i+=maxImages){const first=i===0;out.push({...value,id:first?value.id:value.id+'-photos-'+i,images:photos.slice(i,i+maxImages),image:photos[i]||null,...(!first?{text:'More photos from previous message',reply:null,source:null,reactions:{},audio:null,video:null,document:null}:{})});}return out;});
 const events=[...(data.invitations||[]).map(value=>({kind:'invitations',at:value.startedAt,value})),...fragments.map(value=>({kind:'messages',at:value.createdAt,value})),...(data.listening||[]).map(value=>({kind:'listening',at:value.startedAt,value}))].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const batches=[];let batch=[],images=new Set();
 for(const event of events){const photos=event.kind==='messages'?(event.value.images?.length?event.value.images:(event.value.image?[event.value.image]:[])):[];const union=new Set([...images,...photos]);if(batch.length&&(batch.length>=maxMessages||union.size>maxImages)){batches.push(batch);batch=[];images=new Set();}batch.push(event);for(const id of photos)images.add(id);}if(batch.length||!batches.length)batches.push(batch);return batches;
}
export function chatBatchData(data,events){
 const messages=events.filter(e=>e.kind==='messages').map(e=>e.value),ids=new Set(messages.map(m=>m.id));
 return {...data,scope:'chat',crown:data.crown?{...data.crown,events:[]}:null,messages:messages.map(m=>m.source&&!ids.has(m.source.id)?{...m,source:{...m.source,inRange:false}}:m),invitations:events.filter(e=>e.kind==='invitations').map(e=>e.value),listening:events.filter(e=>e.kind==='listening').map(e=>e.value),items:[],files:[],activities:[],games:[],dates:[],cases:[],drawing:null};
}

// Non-chat records remain atomic; reject an oversized individual record instead of dropping data.
export function planMemoryBatches(data,{maxMessages=100,maxImages=5}={}){
 const parts=planChatBatches(data,{maxMessages,maxImages}).map(events=>chatBatchData(data,events));
 if(data.scope!=='all')return parts;
 const keys=['items','files','activities','games','dates','cases'];
 const base=()=>({...data,scope:'all',messages:[],invitations:[],listening:[],items:[],files:[],activities:[],games:[],dates:[],cases:[],drawing:null,crown:{...data.crown,events:[]}});
 // The existing renderer emits the crown summary in each full-app part; events are only on first.
 let current=base(),count=0,images=new Set();
 const flush=()=>{if(count){parts.push(current);current=base();count=0;images=new Set();}};
 const recordImages=record=>{const ids=new Set();const walk=v=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}for(const [k,x]of Object.entries(v)){if((k==='image'||k==='photo')&&typeof x==='string'&&x)ids.add(x);else if(k==='images'&&Array.isArray(x))x.forEach(y=>{if(typeof y==='string'&&y)ids.add(y);});else walk(x);}};walk(record);if(record.kind==='photo'&&!record.photo&&record.id)ids.add('file:'+record.id);return ids;};
 const expandItem=item=>{
  const photos=item.images?.length?item.images:(item.image?[item.image]:[]),comments=item.comments||[];
  if(new Set([...photos,...comments.map(c=>c.image).filter(Boolean)]).size<=maxImages)return [item];
  const chunks=[];let group={...item,images:[],image:null,comments:[]},used=new Set(),started=false;
  const push=()=>{chunks.push(group);started=true;group={...item,title:item.title+' (continued)',images:[],image:null,comments:[],steps:[],reactions:{},likes:[],sources:[]};used=new Set();};
  for(const photo of photos){if(!used.has(photo)&&used.size>=maxImages)push();group.images.push(photo);if(!group.image)group.image=photo;used.add(photo);}
  for(const comment of comments){if(comment.image&&!used.has(comment.image)&&used.size>=maxImages)push();group.comments.push(comment);if(comment.image)used.add(comment.image);}
  if(group.images.length||group.comments.length||!started)push();return chunks;
 };
 const expandFile=file=>{
  if(recordImages(file).size<=maxImages||file.kind!=='note')return [file];
  const out=[];let group={...file,blocks:[]},used=new Set();
  for(const block of file.blocks||[]){const found=recordImages(block),next=new Set([...used,...found]);if(group.blocks.length&&next.size>maxImages){out.push(group);group={...file,path:file.path+' (continued)',blocks:[]};used=new Set();}group.blocks.push(block);for(const id of found)used.add(id);}
  if(group.blocks.length)out.push(group);return out.length?out:[file];
 };
 const expandCase=record=>{
  if(recordImages(record).size<=maxImages)return [record];
  const out=[];let group={...record,history:[],records:[]},used=new Set();
  const flush=()=>{out.push(group);group={...record,title:record.title+' (continued)',history:[],records:[]};used=new Set();};
  const add=(entry,history)=>{const ids=recordImages(entry),next=new Set([...used,...ids]);if((group.records.length||group.history.length)&&next.size>maxImages)flush();if(history){let h=group.history.find(v=>v._batchIndex===history.index);if(!h){h={...history.value,records:[],_batchIndex:history.index};group.history.push(h);}if(entry)h.records.push(entry);}else group.records.push(entry);for(const id of ids)used.add(id);};
  (record.history||[]).forEach((h,index)=>{if(!h.records?.length)add(null,{value:h,index});else h.records.forEach(r=>add(r,{value:h,index}));});for(const r of record.records||[])add(r,null);
  if(group.records.length||group.history.length)flush();for(const part of out)for(const h of part.history)delete h._batchIndex;return out.length?out:[record];
 };
 const expand=(key,v)=>key==='items'?expandItem(v):key==='files'?expandFile(v):key==='cases'?expandCase(v):[v];
 for(const key of keys)for(const record of (data[key]||[]).flatMap(v=>expand(key,v))){const found=recordImages(record),union=new Set([...images,...found]);if(found.size>maxImages)throw Object.assign(new Error('One record has too many photos to prepare safely. Choose Our Chat or a shorter range.'),{status:413});if(count&&(count>=maxMessages||union.size>maxImages))flush();current[key].push(record);count++;for(const id of found)images.add(id);}
 if(data.drawing){current.drawing=data.drawing;count++;}flush();
 // Keep crown and its events in one dedicated section, even with no other full-app records.
 const crown=base();crown.crown=data.crown;parts.push(crown);return parts;
}
