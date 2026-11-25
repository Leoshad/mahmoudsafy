import test from 'node:test';
import assert from 'node:assert/strict';
import {careChange,careNotices} from '../care.mjs';

const at=(iso)=>Date.parse(iso); // Cairo is UTC+2 in November
const fresh=()=>({version:1,personal:{profiles:{Safy:{zone:'Africa/Cairo'}}}});

test('a sleep Mahmoud logs reaches Safy once, after a quiet gap',()=>{
 const s=fresh(),t=at('2026-11-25T10:00:00Z');
 careChange(s,'Mahmoud','care.entry.add',{kind:'sleep',data:{start:at('2026-11-25T00:00:00Z'),end:at('2026-11-25T04:00:00Z')}},t);
 assert.deepEqual(careNotices(s,t+60000),[]);
 const out=careNotices(s,t+3*60000);
 assert.equal(out.length,1);assert.equal(out[0].to,'Safy');
 assert.equal(out[0].body,'Mahmoud logged your sleep: 2:00 AM → 6:00 AM (4 h).');
 assert.deepEqual(careNotices(s,t+10*60000),[]);
});

test('several quick entries become one message',()=>{
 const s=fresh(),t=at('2026-11-25T10:00:00Z');
 careChange(s,'Mahmoud','care.entry.add',{kind:'note',data:{text:'Tired today'}},t);
 careChange(s,'Mahmoud','care.appt.save',{title:'Checkup',date:'2026-12-01',kind:'visit'},t+30000);
 careChange(s,'Mahmoud','care.labs.import',{labs:[{test:'Ferritin',date:'2026-11-20',value:20,unit:'ng/mL'},{test:'Hemoglobin',date:'2026-11-20',value:11,unit:'g/dL'}]},t+60000);
 assert.deepEqual(careNotices(s,t+2*60000),[]);
 const out=careNotices(s,t+4*60000);
 assert.equal(out.length,1);assert.equal(out[0].body,'Mahmoud added 4 things to your health page.');
});

test('nothing when Safy logs herself',()=>{
 const s=fresh(),t=at('2026-11-25T10:00:00Z');
 careChange(s,'Safy','care.entry.add',{kind:'note',data:{text:'ok'}},t);
 assert.deepEqual(careNotices(s,t+5*60000),[]);
});

test('held during the night and sent at 8 in the morning',()=>{
 const s=fresh(),t=at('2026-11-25T21:30:00Z'); // 23:30 Cairo
 careChange(s,'Mahmoud','care.entry.add',{kind:'period',data:{state:'start',flow:'medium'}},t);
 assert.deepEqual(careNotices(s,at('2026-11-26T03:00:00Z')),[]);
 const out=careNotices(s,at('2026-11-26T06:01:00Z'));
 assert.equal(out.length,1);assert.equal(out[0].body,'Mahmoud logged your period.');
});
