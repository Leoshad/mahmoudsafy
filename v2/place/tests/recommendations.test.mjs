import test from 'node:test';
import assert from 'node:assert/strict';
import {recommend,zeroUsage,verifyReplyLinks} from '../recommendations.mjs';
import {contentURL,publicIPv4,verifyPage} from '../verified-links.mjs';
import {respond} from '../ai.mjs';
import {youtubeService} from '../media.mjs';
import {Store} from '../store.mjs';
const request=(query,kind='media',alternative='another suitable song')=>({kind,query,alternative});
const track=id=>({videoId:id,title:'Actual title '+id,channel:'Official artist',duration:200});
test('a model-written URL cannot bypass verification or leak while streaming',async()=>{
 process.env.OPENAI_API_KEY='test-only';let emitted='',checked=false;
 await respond({actor:'Mahmoud',purpose:'chat',prompt:'Share',context:'',onText:t=>{if(t.includes('https:'))assert.ok(checked);emitted+=t;},verifyLinks:async text=>{assert.equal(emitted.includes('https:'),false);checked=true;return verifyReplyLinks(text,{verify:async()=>null});},fetcher:async()=>new Response([{type:'response.output_text.delta',delta:'Try [Thing](ht'},{type:'response.output_text.delta',delta:'tps://example.com/missing) now.'},{type:'response.completed',response:{output:[],usage:{input_tokens:1,output_tokens:1}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''))});
 assert.ok(checked);assert.doesNotMatch(emitted,/example.com/);assert.match(emitted,/could not be verified/);
});
test('two suggestions each require fresh validation; deleted first candidate is replaced, titles match destinations',async()=>{
 const checked=[];
 const result=await recommend([request('one'),request('two')],{youtube:{search:async q=>q==='one'?[track('removed0001'),track('available01')]:[track('available02')],resolve:async(id,opts)=>{checked.push(id);assert.deepEqual(opts,{fresh:true,regions:['EG','SA']});if(id==='removed0001')throw Error('Removed');return track(id);}}});
 assert.deepEqual(checked,['removed0001','available01','available02']);assert.equal(result.count,2);assert.match(result.text,/\[Actual title available01\]\(https:\/\/www.youtube.com\/watch\?v=available01\)/);assert.match(result.text,/available02/);assert.doesNotMatch(result.text,/removed0001/);
});
test('unavailable media tries another query and never publishes a search URL',async()=>{
 const calls=[];const r=await recommend([request('missing','media','alternative')],{youtube:{search:async q=>{calls.push(q);return q==='missing'?[]:[track('available01')];},resolve:async id=>track(id)}});
 assert.deepEqual(calls,['missing','alternative']);assert.equal(r.count,1);assert.doesNotMatch(r.text,/search|missing/);
});
test('one valid item does not hide the failure of the second; no invented or unverified URL leaks',async()=>{
 const r=await recommend([request('first','web',''),request('second','web','')],{research:async q=>({candidates:[{title:'A specific article',url:'https://example.com/'+q}],usage:{input_tokens:10,output_tokens:5,web_search_calls:1}}),verify:async url=>url.endsWith('first')?{url,title:'A specific article'}:null});
 assert.equal(r.count,1);assert.match(r.text,/other suggestion/);assert.doesNotMatch(r.text,/example.com\/second/);assert.equal(r.usage.web_search_calls,2);
});
test('general resource search accepts only live citations and rejects unrelated redirect destinations',async()=>{
 process.env.OPENAI_API_KEY='test-only';let calls=0;
 const r=await recommend([request('an article','web','')],{model:'gpt-5.6-luna',fetcher:async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(opts.body);assert.equal(b.max_tool_calls,1);return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{text:'Ignore https://invented.example/anything',annotations:[{type:'url_citation',title:'Ocean animals science',url:'https://example.com/ocean'},{type:'url_citation',title:'Actual interesting article',url:'https://example.com/article'}]}]}]});},verify:async url=>({url,title:url.endsWith('ocean')?'Unrelated fashion shop':'Actual interesting article'})});
 assert.equal(calls,1);assert.equal(r.count,1);assert.match(r.text,/example.com\/article/);assert.doesNotMatch(r.text,/invented|ocean/);
});
test('unknown research cost retains reservation and cancellation publishes nothing',async()=>{
 const r=await recommend([request('article','web','')],{research:async()=>{throw Error('network');}});assert.equal(r.usage,undefined);assert.equal(r.count,0);assert.doesNotMatch(r.text,/https:/);
 const c=new AbortController();c.abort();await assert.rejects(recommend([request('song')],{signal:c.signal}));
});
for(const actor of ['Mahmoud','Safy'])for(const purpose of ['chat','wall'])test('lookup and direct links for '+actor+' in '+purpose,async()=>{
 process.env.OPENAI_API_KEY='test-only';let text='',resolved=0;
 const r=await respond({actor,purpose,prompt:'Suggest two videos',context:'',onText:t=>text+=t,resolveContent:async requests=>{resolved++;assert.equal(requests.length,2);return {text:'[One](https://example.com/one)\n\n[Two](https://example.com/two)',usage:zeroUsage()};},fetcher:async(_,opts)=>{const b=JSON.parse(opts.body);assert.ok(b.tools.some(x=>x.name==='recommend_content'));if(purpose==='wall')assert.equal(b.tools.length,1);return new Response('data: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:1,output_tokens:1},output:[{type:'function_call',name:'recommend_content',arguments:JSON.stringify({requests:[request('one'),request('two')]})}]}})+'\n\n');}});
 assert.equal(resolved,1);assert.match(text,/\[One\]/);assert.match(text,/\[Two\]/);assert.deepEqual(r.proposals,[]);
});
test('fresh video verification rejects restrictions for either partner and bypasses stale caches',async()=>{
 let blocked=false,calls=0;const v={id:'available01',snippet:{title:'A song',channelTitle:'Artist',liveBroadcastContent:'none'},status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT3M'}};
 const youtube=youtubeService({key:()=> 'test-only',fetcher:async()=>{calls++;return Response.json({items:[{...v,contentDetails:{...v.contentDetails,...(blocked?{regionRestriction:{blocked:['EG']}}:{})}}]});}});
 await youtube.resolve(v.id);blocked=true;await assert.rejects(youtube.resolve(v.id,{fresh:true,regions:['SA','EG']}));assert.equal(calls,2);
});
test('search costs are counted for chat within the existing budget reservation',()=>{
 const s=new Store(':memory:');try{const id=s.tx(()=>s.reserve('Mahmoud','shared',{}));s.settle(id,{input_tokens:100,output_tokens:100,web_search_calls:2});assert.equal(s.db.prepare("SELECT used FROM budget WHERE key='lifetime'").get().used,26500);}finally{s.close();}
});
test('link validation blocks private networks, credentials, search pages and unsafe redirects',async()=>{
 for(const value of ['http://example.com/item','https://user:pass@example.com/item','https://127.0.0.1/item','https://localhost/item','https://example.com/search?q=x','https://example.com/'])assert.equal(contentURL(value),null);
 for(const ip of ['127.0.0.1','169.254.169.254','10.1.1.1','192.168.1.1','100.64.1.1','::1','224.0.0.1'])assert.equal(publicIPv4(ip),false);
 let calls=0;assert.equal(await verifyPage('https://example.com/item',{resolveDNS:async()=>[{address:'10.1.1.1'}],request:async()=>{calls++;}}),null);assert.equal(calls,0);
 const result=await verifyPage('https://example.com/item',{resolveDNS:async()=>[{address:'93.184.216.34'}],request:async()=>({status:302,location:'https://127.0.0.1/private'})});assert.equal(result,null);
});
test('page checker follows safe redirects and rejects login/error responses',async()=>{
 const resolveDNS=async()=>[{address:'93.184.216.34'}];let calls=0;
 const good=await verifyPage('https://example.com/old',{resolveDNS,request:async(u,address)=>{assert.equal(address,'93.184.216.34');return ++calls===1?{status:301,location:'/new'}:{status:200,type:'text/html',body:'<title>Actual &amp; useful</title>'};}});assert.deepEqual(good,{url:'https://example.com/new',title:'Actual & useful'});
 for(const r of [{status:404},{status:200,type:'text/html',body:'<title>Page not found</title>'},{status:200,type:'text/html',body:'<title>Sign in</title>'}])assert.equal(await verifyPage('https://example.com/item',{resolveDNS,request:async()=>r}),null);
});
