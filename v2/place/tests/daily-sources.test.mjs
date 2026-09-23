import test from 'node:test';
import assert from 'node:assert/strict';
import {directNewsURL,newsEvidence,dailyGenerate} from '../daily-ai.mjs';
import {pageEvidence,verifyPage} from '../verified-links.mjs';
const article='Researchers announced a new instrument on September 22, 2026. It measured a faint signal in controlled laboratory experiments. The team plans independent tests before claiming that it can be used outside the laboratory.';
const html='<title>A new instrument</title><meta content="2026-09-22T09:00:00Z" property="article:published_time"><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-22T09:00:00Z","dateModified":"2026-09-23"}</script><nav>Menu text</nav><article>'+article+'</article>';
test('article evidence retains original publication metadata and article text, excludes scripts and navigation',()=>{
 const p=pageEvidence(html);assert.equal(p.text,article);assert.deepEqual(p.publicationDates,['2026-09-22T09:00:00Z']);
});
test('Nature news and HeritageDaily year archives fail before fetching or reviewing',async()=>{
 for(const url of ['https://www.nature.com/news','https://www.heritagedaily.com/2026','https://www.nature.com/','https://example.org/category/science','https://example.org/news/latest'])assert.equal(directNewsURL(url),false,url);
 assert.equal(directNewsURL('https://www.nature.com/articles/d41586-026-01234-5'),true);
 let fetched=false;await assert.rejects(newsEvidence({sources:[{url:'https://www.nature.com/news'}]},{verify:async()=>{fetched=true;}}),/direct article URLs/);assert.equal(fetched,false);
});
test('article verification retains SSRF protection and rejects redirects to an index',async()=>{
 let calls=0;
 const verify=(url,opts)=>verifyPage(url,{...opts,resolveDNS:async()=>[{address:'93.184.216.34'}],request:async()=>++calls===1?{status:302,location:'/news'}:{status:200,type:'text/html',body:html}});
 await assert.rejects(newsEvidence({sources:[{url:'https://example.org/article'}]},{verify}),/could not be read/);
 calls=0;assert.equal(await verifyPage('https://example.org/article',{evidence:true,resolveDNS:async()=>[{address:'127.0.0.1'}],request:async()=>{calls++;}}),null);assert.equal(calls,0);
});
test('news review receives actual article evidence and all paid usage is retained',async()=>{
 process.env.OPENAI_API_KEY='test';let calls=0;
 const output={status:'completed',usage:{input_tokens:100,output_tokens:50},output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'DATE: 2026-09-22T09:00:00Z\n'+article,annotations:[{type:'url_citation',url:'https://example.org/new-instrument',title:'A new instrument',start_index:26,end_index:80}]}]}]};
 const result=await dailyGenerate({kind:'afternoon',now:Date.parse('2026-09-22T13:00Z'),verify:async(url,opts)=>{assert.equal(opts.evidence,true);return {url,title:'A new instrument',...pageEvidence(html)};},fetcher:async(_,opts)=>{
  if(++calls===1)return Response.json(output);
  const input=JSON.parse(JSON.parse(opts.body).input);assert.equal(input.sourceEvidence[0].text,article);assert.equal(input.sourceEvidence[0].publicationDates[0],'2026-09-22T09:00:00Z');
  return Response.json({status:'completed',usage:{input_tokens:200,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:'{"approve":true,"reason":"Article supports event and date"}'}]}]});
 }});assert.equal(result.value.reviewed,true);assert.equal(result.usage.input_tokens,300);assert.equal(result.usage.web_search_calls,1);assert.equal(calls,2);
});
test('unreadable articles fail with retry guidance before spending on editorial review',async()=>{
 process.env.OPENAI_API_KEY='test';let calls=0;
 await assert.rejects(dailyGenerate({kind:'afternoon',now:Date.parse('2026-09-22T13:00Z'),verify:async()=>null,fetcher:async()=>{calls++;return Response.json({status:'completed',usage:{input_tokens:100,output_tokens:50},output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'DATE: 2026-09-22\n'+article,annotations:[{type:'url_citation',url:'https://example.org/new-instrument'}]}]}]});}}),e=>{assert.match(e.message,/another publisher/);assert.equal(e.usage.input_tokens,100);return true;});assert.equal(calls,1);
});

test('literal Markdown citations survive missing annotations and still undergo article verification',async()=>{
 const {parseDaily}=await import('../daily-ai.mjs');const r={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'DATE: 2026-09-22\nA new instrument was announced. [Read the report](https://example.org/new-instrument)',annotations:[]}]}]};
 const value=parseDaily(r,'afternoon',Date.parse('2026-09-22T13:00Z'));assert.equal(value.sources[0].url,'https://example.org/new-instrument');assert.equal(value.title.slice(value.sources[0].start,value.sources[0].end),'[Read the report](https://example.org/new-instrument)');
 await assert.rejects(newsEvidence(value,{verify:async()=>null}),/could not be read/);
 r.output[1].content[0].text=r.output[1].content[0].text.replace('https://example.org/new-instrument','https://example.org/news');await assert.rejects(newsEvidence(parseDaily(r,'afternoon',Date.parse('2026-09-22T13:00Z'))),/direct article/);
});
