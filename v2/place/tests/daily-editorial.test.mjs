import test from 'node:test';import assert from 'node:assert/strict';
import {dailyGenerate} from '../daily-ai.mjs';import {editorialIssue,morningFallback} from '../daily-editorial.mjs';
const usage={input_tokens:100,output_tokens:40};
function response(text,extra=[]){return Response.json({status:'completed',usage,output:[...extra,{type:'message',content:[{type:'output_text',text}]}]});}
test('morning bus filler fails before spending on a review',async()=>{process.env.OPENAI_API_KEY='test';let calls=0;await assert.rejects(dailyGenerate({kind:'morning',variant:'question',fetcher:async()=>{calls++;return response('DATE: none\nThe best seat on a bus is the one near the window.');}}),/Off-topic/);assert.equal(calls,1);});
test('independent review rejects off-contract post and accounts for both requests',async()=>{process.env.OPENAI_API_KEY='test';let calls=0;try{await dailyGenerate({kind:'morning',variant:'question',fetcher:async()=>++calls===1?response('DATE: none\nAn ordinary comment that offers nothing interesting to discuss.'):response(JSON.stringify({approve:false,reason:'Mundane filler, not a couple question.'}))});assert.fail('should reject');}catch(e){assert.match(e.message,/Editorial review/);assert.equal(e.usage.input_tokens,200);}assert.equal(calls,2);});
test('approved candidate retains sources and sums writer plus reviewer usage',async()=>{process.env.OPENAI_API_KEY='test';let calls=0;const result=await dailyGenerate({kind:'morning',variant:'question',fetcher:async()=>++calls===1?response('DATE: none\nWould you rather plan our next trip together or surprise each other?'):response(JSON.stringify({approve:true,reason:'Specific, natural shared choice.'}))});assert.equal(result.value.reviewed,true);assert.equal(result.usage.output_tokens,80);});
test('review network failure retains the conservative reservation',async()=>{process.env.OPENAI_API_KEY='test';let calls=0;try{await dailyGenerate({kind:'morning',variant:'question',fetcher:async()=>{if(++calls===1)return response('DATE: none\nWould you rather plan our next trip together or surprise each other?');throw Error('disconnected');}});}catch(e){assert.equal(e.usage,undefined);assert.equal(e.unknownReviewCost,true);}});
test('comment language is English for Arabic input until explicitly requested',async()=>{process.env.OPENAI_API_KEY='test';for(const [text,language]of [['ازيك','English'],['رد بالعربي','Arabic']])await dailyGenerate({kind:'comment',post:{comments:[{text}]},fetcher:async(_,opts)=>{assert.match(JSON.parse(opts.body).instructions,new RegExp('Reply in '+language));return response('A short relevant reply.');}});});
test('reserves do not repeat and old candidates fail similarity gate',()=>{let items=[];for(let i=0;i<6;i++){const p=morningFallback(items);assert.ok(p);items.unshift({...p,daily:{slot:'morning',reserveFormat:p.reserveFormat}});}assert.equal(morningFallback(items),null);assert.match(editorialIssue(items[0],'morning',items.map(x=>x.title)),/Repeated/);});

test('news timestamps preserve the actual publication time and reject stale/future/invalid dates',async()=>{
 const {freshNewsDate,parseDaily}=await import('../daily-ai.mjs');const now=Date.parse('2026-09-20T13:00:00Z');
 assert.equal(freshNewsDate('2026-09-18T17:00:00+03:00',now),true);
 for(const date of ['2026-09-18T12:59:59Z','2026-09-21T00:00:00Z','2026-02-30','none','2026-09-18'])assert.equal(freshNewsDate(date,now),false,date);
 const r={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'DATE: 2026-09-18T14:00:00Z\nA current science event with a verified source.',annotations:[{type:'url_citation',url:'https://example.org/news',start_index:26,end_index:60}]}]}]};
 assert.equal(parseDaily(r,'afternoon',now).publishedDate,'2026-09-18T14:00:00Z');
 const uncited=structuredClone(r);uncited.output[1].content[0].annotations=[];assert.throws(()=>parseDaily(uncited,'afternoon',now),/no usable source citations/);
});
test('night discovery review accepts undated sources and receives the scheduler clock',async()=>{
 process.env.OPENAI_API_KEY='test';let calls=0;const now=Date.parse('2026-09-20T13:00:00Z');
 const result=await dailyGenerate({kind:'night',variant:'surprising science',now,fetcher:async(_,opts)=>{
  const body=JSON.parse(opts.body);if(++calls===1)return Response.json({status:'completed',usage,output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'DATE: none\nAn interesting scientific finding explained with appropriate qualifications.',annotations:[{type:'url_citation',url:'https://example.org/science',start_index:11,end_index:70}]}]}]});
  assert.match(body.instructions,/night discoveries require citations but do not require a recent publication date/);assert.equal(JSON.parse(body.input).now,new Date(now).toISOString());return response('{"approve":true,"reason":"Sourced discovery"}');
 }});assert.equal(result.value.reviewed,true);assert.equal(result.usage.web_search_calls,1);
});
test('four news attempts use distinct source routes without increasing search calls',async()=>{
 const {newsSearchPlan}=await import('../daily-ai.mjs');assert.equal(new Set([1,2,3,4].map(newsSearchPlan)).size,4);
 process.env.OPENAI_API_KEY='test';for(let attempt=1;attempt<=4;attempt++)await dailyGenerate({kind:'afternoon',attempt,fetcher:async(_,opts)=>{const body=JSON.parse(opts.body);assert.ok(body.instructions.includes(newsSearchPlan(attempt)));assert.equal(body.max_tool_calls,2);return response('SKIP');}});
});
