import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {videoId,mediaChange,position,youtubeService} from '../media.mjs';
import {initial} from '../domain.mjs';
import {Store} from '../store.mjs';
import {createApp} from '../server.mjs';
const song={videoId:'M7lc1UVf-VE',title:'Example song',channel:'Example channel',duration:240};
const apply=(s,who,type,data={})=>mediaChange(s,who,type,{session:s.media?.id,revision:s.media?.revision,...data});
test('YouTube URLs reject foreign hosts, credentials, malformed IDs and playlists',()=>{
 for(const url of ['https://youtu.be/M7lc1UVf-VE?si=abc','https://music.youtube.com/watch?v=M7lc1UVf-VE','https://www.youtube.com/shorts/M7lc1UVf-VE'])assert.equal(videoId(url),song.videoId);
 for(const url of ['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','http://youtube.com/watch?v=M7lc1UVf-VE','https://user:password@youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com/playlist?list=abc','javascript:alert(1)'])assert.throws(()=>videoId(url));
});
test('invitation consent, stale controls, queue and ownership survive serialization',()=>{
 let s=initial();apply(s,'Mahmoud','media.create',{mode:'music',track:song});const invitation=s.media.invitation.id;
 assert.deepEqual(s.media.participants,['Mahmoud']);assert.equal(s.media.playing,false);
 assert.throws(()=>apply(s,'Safy','media.control',{position:0,playing:true}),/Join/);
 assert.throws(()=>apply(s,'Mahmoud','media.join',{invitation}),/expired/);
 apply(s,'Safy','media.join',{invitation});assert.deepEqual(s.media.participants,['Mahmoud','Safy']);
 apply(s,'Mahmoud','media.control',{position:20,playing:true});assert.equal(position(s.media,s.media.updatedAt+3000),23);
 assert.throws(()=>apply(s,'Safy','media.control',{revision:1,position:50,playing:true}),/changed/);
 assert.throws(()=>apply(s,'Safy','media.control',{position:NaN,playing:true}),/Invalid/);
 apply(s,'Safy','media.enqueue',{track:song});s=JSON.parse(JSON.stringify(s));assert.equal(s.media.queue[0].by,'Safy');
 apply(s,'Mahmoud','media.next');assert.equal(s.media.position,0);assert.equal(s.media.playing,true);assert.equal(s.media.queue.length,0);
 apply(s,'Mahmoud','media.leave');assert.equal(s.media.owner,'Safy');assert.deepEqual(s.media.participants,['Safy']);
 assert.throws(()=>apply(s,'Mahmoud','media.end'),/Join/);apply(s,'Safy','media.end');assert.equal(s.media,null);
});
test('decline and expired invitations do not admit the recipient; new sessions cannot overwrite',()=>{
 const s=initial();apply(s,'Mahmoud','media.create',{mode:'video',track:song});const first=s.media.invitation.id;
 apply(s,'Safy','media.decline',{invitation:first});assert.equal(s.media.invitation,null);assert.deepEqual(s.media.participants,['Mahmoud']);
 apply(s,'Mahmoud','media.invite');assert.notEqual(s.media.invitation.id,first);assert.throws(()=>apply(s,'Safy','media.join',{invitation:first}),/expired/);
 assert.throws(()=>mediaChange(s,'Safy','media.join',{session:s.media.id,invitation:s.media.invitation.id},Date.now()+700000),/expired/);
 assert.throws(()=>apply(s,'Safy','media.create',{mode:'video',track:song}),/End/);
});
const youtubeItem={id:song.videoId,snippet:{title:song.title,channelTitle:song.channel,liveBroadcastContent:'none'},contentDetails:{duration:'PT4M'},status:{embeddable:true,privacyStatus:'public'}};
test('search uses server credential, bounded video and song results, cached requests and sanitized errors',async()=>{
 let requests=0,reservations=0;const service=youtubeService({key:()=> 'fake-test-key',reserve:()=>reservations++,fetcher:async(url,opts)=>{requests++;assert.equal(opts.headers['X-Goog-Api-Key'],'fake-test-key');assert.ok(!url.href.includes('fake-test-key'));if(url.pathname.endsWith('/search')){assert.equal(url.searchParams.has('videoCategoryId'),false);return Response.json({items:[{id:{videoId:song.videoId}}]});}return Response.json({items:[youtubeItem,{...youtubeItem,status:{embeddable:false}}]});}});
 assert.equal((await service.search('Example')).length,1);await service.search('Example');assert.equal(requests,2);assert.equal(reservations,1);
 assert.equal((await service.resolve(song.videoId)).title,song.title);
 await assert.rejects(()=>youtubeService({key:()=>''}).search('abc'),/not ready/);
 await assert.rejects(()=>youtubeService({key:()=> 'secret',fetcher:async()=>new Response('secret provider response',{status:403})}).search('abc'),e=>!e.message.includes('secret')&&e.status===502);
});
test('media HTTP authenticates both users, verifies metadata, deduplicates and broadcasts consent',async()=>{
 process.env.MAHMOUD_EMAIL='mahmoud@example.test';process.env.SAFY_EMAIL='safy@example.test';process.env.YOUTUBE_API_KEY='test-only';
 const store=new Store(':memory:');const authFetch=async(url,opts)=>{const name=url.includes('/token?')?JSON.parse(opts.body).email.split('@')[0]:opts.headers.Authorization.split(' ')[1];const user={id:name+'-uid',email:name+'@example.test',email_confirmed_at:'2026-01-01'};return Response.json(url.includes('/token?')?{user,access_token:name,refresh_token:name,expires_in:3600}:user);};
 const server=createApp({store,origin:'http://localhost',secret:'testing secret with at least thirty two characters',testing:true,authFetch,mediaFetch:async url=>Response.json(url.pathname.endsWith('/search')?{items:[{id:{videoId:song.videoId}}]}:{items:[youtubeItem]})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cookies={};
 const request=async(who,path,data)=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:'http://localhost',Cookie:cookies[who]??'','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookies[who]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
 const command=(who,type,data={},id=randomUUID())=>request(who,'command',{id,type,data:{session:store.state().media?.id,revision:store.state().media?.revision,...data}});
 try{
 assert.equal((await request('none','media/search?q=Example')).status,401);
 for(const who of ['mahmoud','safy'])await request(who,'login',{email:who+'@example.test',password:'test'});
 assert.equal((await request('mahmoud','media/search?q=Example')).data.items[0].title,song.title);
 const id=randomUUID(),payload={mode:'music',track:{...song,title:'Forged title'},queue:[{...song,title:'Forged queued title'}]};
 const once={id,type:'media.create',data:payload};assert.equal((await request('mahmoud','command',once)).status,200);assert.equal((await request('mahmoud','command',once)).status,200);
 assert.equal(store.state().media.track.title,song.title);assert.equal(store.state().media.queue[0].title,song.title);
 assert.equal((await command('safy','media.control',{position:0,playing:true})).status,403);
 const controller=new AbortController(),sse=await fetch(base+'/api/events',{headers:{Cookie:cookies.mahmoud},signal:controller.signal}),reader=sse.body.getReader();await reader.read();
 const invite=store.state().media.invitation.id;assert.equal((await command('safy','media.join',{invitation:invite})).status,200);
 let content='';for(let i=0;i<5&&!content.includes('"Mahmoud","Safy"');i++)content+=new TextDecoder().decode((await reader.read()).value);controller.abort();assert.match(content,/"Mahmoud","Safy"/);
 assert.equal((await command('safy','media.control',{position:17,playing:true})).status,200);
 assert.equal((await request('mahmoud','state')).data.media.position,17);
 assert.equal((await command('safy','media.play',{track:{...song,title:'Forged next title'}})).status,200);assert.equal(store.state().media.track.title,song.title);assert.equal(store.state().media.position,0);assert.equal(store.state().media.playing,true);
 assert.equal((await command('mahmoud','media.end')).status,200);assert.equal((await request('safy','state')).data.media,null);
 const html=await fetch(base);assert.match(html.headers.get('content-security-policy'),/frame-src https:\/\/www.youtube.com/);assert.equal(html.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
 }finally{await new Promise(r=>server.close(r));store.close();delete process.env.YOUTUBE_API_KEY;}
});

test('recipient replaces only an expired or declined solo session with exact revision',()=>{
 const s=initial();mediaChange(s,'Safy','media.create',{mode:'video',track:song},1000);const old=structuredClone(s.media);
 const data={mode:'video',track:song,replaceSession:old.id,replaceRevision:old.revision};
 assert.throws(()=>mediaChange(s,'Mahmoud','media.create',data,2000),/End/);
 assert.throws(()=>mediaChange(s,'Mahmoud','media.create',{...data,replaceRevision:99},700000),/End/);
 mediaChange(s,'Mahmoud','media.create',data,700000);assert.notEqual(s.media.id,old.id);assert.deepEqual(s.media.participants,['Mahmoud']);
 assert.throws(()=>mediaChange(s,'Mahmoud','media.join',{session:old.id,invitation:old.invitation.id},700001),/ended/);
 mediaChange(s,'Safy','media.join',{session:s.media.id,invitation:s.media.invitation.id},700001);
 assert.throws(()=>mediaChange(s,'Safy','media.create',{...data,replaceSession:s.media.id,replaceRevision:s.media.revision},1400000),/End/);
 const declined=initial();mediaChange(declined,'Safy','media.create',{mode:'video',track:song});
 mediaChange(declined,'Mahmoud','media.decline',{session:declined.media.id,invitation:declined.media.invitation.id});
 mediaChange(declined,'Mahmoud','media.create',{mode:'video',track:song,replaceSession:declined.media.id,replaceRevision:declined.media.revision});assert.equal(declined.media.owner,'Mahmoud');
});

test('either participant can replace playing or finished track without ending session or changing consent',()=>{
 const s=initial();apply(s,'Mahmoud','media.create',{mode:'video',track:song});apply(s,'Safy','media.join',{invitation:s.media.invitation.id});const id=s.media.id;
 apply(s,'Mahmoud','media.enqueue',{track:song});
 for(const who of ['Mahmoud','Safy']){apply(s,who,'media.control',{position:song.duration,playing:false});apply(s,who,'media.play',{track:{...song,videoId:'abcdefghijk',title:'Next song'}});assert.equal(s.media.id,id);assert.deepEqual(s.media.participants,['Mahmoud','Safy']);assert.equal(s.media.position,0);assert.equal(s.media.playing,true);assert.equal(s.media.invitation,null);assert.equal(s.media.queue.length,1);}
});
