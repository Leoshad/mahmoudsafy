import test from 'node:test';
import assert from 'node:assert/strict';
import {initial} from '../domain.mjs';
import {careChange as change,careSnapshot as view,careHistory,careExport,labTrend} from '../care.mjs';
// All values below are synthetic test data.
const now=Date.parse('2030-03-20T16:00:00Z'); // 18:00 in Cairo, a Wednesday
const H=3600000,DAY=86400000;
const lab=(x={})=>({test:'Hemoglobin',value:11.2,valueText:'11.20',unit:'g/dL',lo:12,hi:16,rangeText:'12 - 16',flag:'L',date:'2030-03-10',group:'Blood picture',source:'test sheet',verified:true,...x});

test('private entries exist only for Safy: hidden from Mahmoud in entries, week totals, check-in, flare, history pages and export',()=>{
 const s=initial();
 change(s,'Safy','care.entry.add',{kind:'belly',data:{pain:4,where:['colon'],diarrhea:true,note:'secret words'},visibility:'private',occurredAt:now-H},now);
 change(s,'Safy','care.entry.add',{kind:'bathroom',data:{count:3},visibility:'private',occurredAt:now-H},now);
 change(s,'Safy','care.entry.add',{kind:'flare',data:{state:'start'},visibility:'private',occurredAt:now-2*H},now);
 change(s,'Safy','care.entry.add',{kind:'note',data:{text:'old secret'},visibility:'private',occurredAt:now-300*DAY},now);
 const m=view(s,'Mahmoud',now),y=view(s,'Safy',now);
 assert.equal(m.entries.length,0);assert.equal(y.entries.length,3);
 assert.ok(!JSON.stringify(m).includes('secret'));
 assert.equal(m.week[6].pain,null);assert.equal(m.week[6].bathroom,null);assert.equal(m.todayBathroom,0);assert.equal(m.flare.active,false);assert.equal(m.flare.logged,false);assert.equal(m.lastCheckin,null);
 assert.equal(y.week[6].pain,4);assert.equal(y.week[6].bathroom,3);assert.equal(y.flare.active,true);
 assert.equal(careHistory(s,'Mahmoud').entries.length,0);assert.equal(careHistory(s,'Safy').entries.length,4);
 assert.ok(!JSON.stringify(careExport(s,'Mahmoud')).includes('secret'));assert.equal(careExport(s,'Safy').entries.length,4);
});

test('only Safy can make an entry private; Mahmoud edits only his own entries, Safy can edit anything about her',()=>{
 const s=initial();
 assert.throws(()=>change(s,'Mahmoud','care.entry.add',{kind:'note',data:{text:'x'},visibility:'private'},now),/Only Safy/);
 const {id:his}=change(s,'Mahmoud','care.entry.add',{kind:'belly',data:{pain:2},source:'she told me',occurredAt:now-3*H},now);
 const {id:hers}=change(s,'Safy','care.entry.add',{kind:'checkin',data:{moods:['tired','pain']}},now);
 assert.throws(()=>change(s,'Mahmoud','care.entry.edit',{id:hers,revision:1,data:{moods:['okay']}},now),/Only Safy or the person/);
 change(s,'Safy','care.entry.edit',{id:his,revision:1,data:{pain:3,where:['stomach']}},now);
 const e=view(s,'Mahmoud',now).entries.find(x=>x.id===his);assert.equal(e.data.pain,3);assert.equal(e.edited,true);assert.equal(e.editedBy,'Safy');assert.equal(e.loggedBy,'Mahmoud');assert.equal(e.source,'she told me');
 assert.throws(()=>change(s,'Safy','care.entry.edit',{id:his,revision:1,data:{pain:1}},now),/changed/);
 assert.throws(()=>change(s,'Safy','care.entry.edit',{id:his,revision:2,visibility:'private',data:{pain:1}},now),/her own/);
 const {id:p}=change(s,'Safy','care.entry.add',{kind:'note',data:{text:'mine'},visibility:'private'},now);
 assert.throws(()=>change(s,'Mahmoud','care.entry.delete',{id:p,revision:1},now),/not found/,'a private entry must look absent to Mahmoud');
});

test('entries keep when it happened, when it was logged and by whom; validation rejects bad data',()=>{
 const s=initial();const {id}=change(s,'Mahmoud','care.entry.add',{kind:'belly',data:{pain:3,where:['colon']},occurredAt:now-5*H},now);
 const e=view(s,'Safy',now).entries.find(x=>x.id===id);assert.equal(e.occurredAt,now-5*H);assert.equal(e.loggedAt,now);assert.equal(e.loggedBy,'Mahmoud');
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'belly',data:{pain:7}},now),/0 to 5/);
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'belly',data:{}},now),/at least one/);
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'checkin',data:{moods:['happy']}},now),/valid/);
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'note',data:{text:'x'},occurredAt:now+2*H},now),/valid time/);
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'weight',data:{}},now),/Unknown/);
});

test('sleep across midnight is split by Safy’s local day, overlaps are refused, one sleep can be ongoing',()=>{
 const s=initial();const start=Date.parse('2030-03-19T20:00:00Z'),end=Date.parse('2030-03-20T05:00:00Z'); // 22:00 → 07:00 Cairo
 change(s,'Safy','care.entry.add',{kind:'sleep',data:{start,end}},now);
 const w=view(s,'Safy',now).week;assert.equal(w[5].sleepHours,2);assert.equal(w[6].sleepHours,7);
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'sleep',data:{start:start+H,end:end-H}},now),/overlaps/);
 change(s,'Safy','care.entry.add',{kind:'sleep',data:{start:now-2*H,end:null}},now);
 assert.throws(()=>change(s,'Mahmoud','care.entry.add',{kind:'sleep',data:{start:now-H/2,end:null}},now),/current sleep|overlaps/);
 assert.equal(view(s,'Mahmoud',now).week[6].sleepHours,9);
});

test('lab trend follows the printed range: toward = better, away = attention, inside = neutral, no range or other unit = no judgment',()=>{
 const t=(v,p,lo,hi,u='x',pu='x')=>labTrend({value:v,lo,hi,unit:u},p===null?null:{value:p,unit:pu});
 assert.deepEqual(t(11,9,12,16),{status:'below',trend:'better',direction:'up'});
 assert.deepEqual(t(14,17,20,null),{status:'below',trend:'away',direction:'down'});
 assert.deepEqual(t(22,18,12,15),{status:'above',trend:'away',direction:'up'});
 assert.deepEqual(t(25,33,null,20),{status:'above',trend:'better',direction:'down'});
 assert.deepEqual(t(40,50,10,170),{status:'in',trend:'down'});
 assert.deepEqual(t(9,9,16,null),{status:'below',trend:'same'});
 assert.deepEqual(t(4,null,3,5),{status:'in',trend:'single'});
 assert.deepEqual(t(99,105,null,null),{status:'none',trend:'down'});
 assert.deepEqual(t(11,90,12,16,'g/dL','g/L'),{status:'below',trend:'incompatible'});
});

test('lab import skips duplicates; unverified readings stay out of trends and attention; edits keep history',()=>{
 const s=initial();
 const r=change(s,'Mahmoud','care.labs.import',{labs:[lab({value:9.1,valueText:'9.10',date:'2030-01-15'}),lab(),lab({test:'Vitamin D (25-OH)',value:14,valueText:'14',unit:'ng/mL',lo:20,hi:null,rangeText:'<20 Deficiency',flag:'',date:'2030-03-08',group:'Vitamins'}),lab({test:'Vitamin D (25-OH)',value:17,valueText:'17',unit:'ng/mL',lo:20,hi:null,flag:'',date:'2029-05-01',group:'Vitamins'})]},now);
 assert.deepEqual(r,{ok:true,added:4,skipped:0});
 assert.deepEqual(change(s,'Mahmoud','care.labs.import',{labs:[lab()]},now),{ok:true,added:0,skipped:1});
 let v=view(s,'Safy',now);const hb=v.labs.find(t=>t.key==='hemoglobin');assert.equal(hb.trend,'better');assert.equal(hb.latest.valueText,'11.20');assert.equal(hb.previous.date,'2030-01-15');
 assert.deepEqual(v.attention.map(a=>a.test),['Vitamin D (25-OH)']);assert.deepEqual(v.improving,['Hemoglobin']);assert.deepEqual(v.keyLabs.map(t=>t.key),['hemoglobin','vitamin d (25-oh)']);
 change(s,'Mahmoud','care.lab.save',lab({value:18,valueText:'18',date:'2030-03-18',verified:false}),now);
 v=view(s,'Safy',now);const hb2=v.labs.find(t=>t.key==='hemoglobin');assert.equal(hb2.latest.date,'2030-03-10','unverified reading must not become latest');assert.equal(hb2.unverified,1);
 const reading=hb2.readings.find(x=>x.date==='2030-03-10');change(s,'Safy','care.lab.save',lab({id:reading.id,revision:reading.revision,value:11.3,valueText:'11.30'}),now);
 const saved=s.care.labs.find(l=>l.id===reading.id);assert.equal(saved.history.length,1);assert.equal(saved.history[0].valueText,'11.20');assert.equal(saved.history[0].editedBy,'Safy');
 assert.throws(()=>change(s,'Mahmoud','care.lab.save',lab({flag:'X',date:'2030-03-02'}),now),/Flag/);
 assert.throws(()=>change(s,'Mahmoud','care.lab.save',lab({lo:16,hi:12,date:'2030-03-02'}),now),/range/);
 assert.throws(()=>change(s,'Mahmoud','care.lab.save',lab({date:'2030-01-15'}),now),/already has a result/);
});

test('medicines: each scheduled time is its own dose; future start is not due; stopped medicines keep their name',()=>{
 const s=initial();const {id}=change(s,'Mahmoud','care.med.save',{name:'Medicine A',dose:'1',schedule:'daily',times:['09:00','21:00']},now);
 const {id:w}=change(s,'Mahmoud','care.med.save',{name:'Weekly B',schedule:'weekly',weekday:3,times:[]},now);
 change(s,'Mahmoud','care.med.save',{name:'Later C',schedule:'daily',times:['08:00'],startedOn:'2030-04-01'},now);
 let v=view(s,'Safy',now);assert.deepEqual(v.attention.map(a=>[a.name,a.times]),[['Medicine A',['09:00','21:00']],['Weekly B',[]]]);
 change(s,'Safy','care.entry.add',{kind:'dose',data:{med:id,status:'taken',slot:'09:00'}},now);
 assert.throws(()=>change(s,'Mahmoud','care.entry.add',{kind:'dose',data:{med:id,status:'taken',slot:'09:00'}},now),/already logged/);
 assert.throws(()=>change(s,'Mahmoud','care.entry.add',{kind:'dose',data:{med:id,status:'taken',slot:'10:00'}},now),/times/);
 v=view(s,'Safy',now);assert.deepEqual(v.meds.find(m=>m.id===id).pendingToday,['21:00']);assert.equal(v.meds.find(m=>m.id===id).doneToday,false);
 change(s,'Safy','care.entry.add',{kind:'dose',data:{med:id,status:'skipped',slot:'21:00'}},now);change(s,'Mahmoud','care.entry.add',{kind:'dose',data:{med:w,status:'taken'}},now);
 v=view(s,'Mahmoud',now);assert.equal(v.attention.length,0);assert.equal(v.meds.find(m=>m.id===id).lastDose,now);assert.equal(v.meds.find(m=>m.name==='Later C').active,false);
 assert.equal(view(s,'Safy',now+DAY).attention.length,1,'tomorrow the daily doses are due again; weekly is not');
 change(s,'Safy','care.med.stop',{id,revision:1,stoppedOn:'2030-03-20'},now);v=view(s,'Safy',now+DAY);assert.equal(v.attention.length,0);
 const stopped=v.meds.find(m=>m.id===id);assert.equal(stopped.active,false);assert.equal(stopped.name,'Medicine A');
 assert.throws(()=>change(s,'Safy','care.med.save',{name:'X',schedule:'daily',times:[]},now),/at least one time/);
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'dose',data:{med:'nope',status:'taken'}},now),/not found/);
});

test('flare start and end are tracked; week grid marks days with nothing logged',()=>{
 const s=initial();assert.equal(view(s,'Safy',now).flare.logged,false);
 change(s,'Mahmoud','care.entry.add',{kind:'flare',data:{state:'start'},occurredAt:now-3*DAY},now);
 let v=view(s,'Safy',now);assert.equal(v.flare.active,true);assert.equal(v.flare.since,now-3*DAY);assert.equal(v.flare.logged,true);
 change(s,'Safy','care.entry.add',{kind:'flare',data:{state:'end'},occurredAt:now-DAY},now);v=view(s,'Safy',now);assert.equal(v.flare.active,false);assert.equal(v.flare.lastEnd,now-DAY);
 assert.equal(v.week.length,7);assert.equal(v.week[6].day,'2030-03-20');assert.equal(v.week[0].logged,false);assert.equal(v.week[3].logged,true);
});

test('older history pages and the export keep every visible entry, not only the recent window',()=>{
 const s=initial();for(let i=0;i<450;i++)change(s,'Safy','care.entry.add',{kind:'bathroom',data:{count:1},occurredAt:now-i*DAY/2},now);
 const v=view(s,'Mahmoud',now);assert.equal(v.entries.length,241,"120 days at half-day spacing, both ends included");assert.equal(v.olderEntries,true);
 let all=[],before=Infinity,page;do{page=careHistory(s,'Mahmoud',before);all.push(...page.entries);before=page.entries.at(-1)?.occurredAt;}while(page.more);
 assert.equal(all.length,450);assert.equal(new Set(all.map(e=>e.id)).size,450);assert.equal(careExport(s,'Mahmoud').entries.length,450);
});

test('a large record stays fast: snapshot is computed once per change and minute',()=>{
 const s=initial();for(let i=0;i<2000;i++)change(s,'Safy','care.entry.add',{kind:i%3?'bathroom':'belly',data:i%3?{count:1}:{pain:i%6,diarrhea:false},occurredAt:now-i*H},now);
 let t=performance.now();view(s,'Mahmoud',now);const first=performance.now()-t;t=performance.now();for(let i=0;i<20;i++)view(s,'Mahmoud',now);const cached=(performance.now()-t)/20;
 assert.ok(first<400,'first snapshot took '+first.toFixed(0)+'ms');assert.ok(cached<5,'cached snapshot took '+cached.toFixed(1)+'ms');
 change(s,'Safy','care.entry.add',{kind:'bathroom',data:{count:1}},now);assert.equal(view(s,'Mahmoud',now).todayBathroom>0,true,'a change invalidates the cache');
});

test('scheduled doses require slots, weekly untimed doses deduplicate, as-needed doses remain repeatable',()=>{
 const s=initial();const {id}=change(s,'Mahmoud','care.med.save',{name:'Synthetic daily',schedule:'daily',times:['09:00','21:00']},now);
 for(const slot of [undefined,null,''])assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'dose',data:{med:id,status:'taken',slot}},now),/times/);
 assert.equal(view(s,'Safy',now).meds[0].doneToday,false);
 const {id:w}=change(s,'Mahmoud','care.med.save',{name:'Synthetic weekly',schedule:'weekly',weekday:3,times:[]},now);
 change(s,'Safy','care.entry.add',{kind:'dose',data:{med:w,status:'taken'}},now);
 assert.throws(()=>change(s,'Safy','care.entry.add',{kind:'dose',data:{med:w,status:'taken'}},now),/already logged/);
 const {id:p}=change(s,'Mahmoud','care.med.save',{name:'Synthetic as needed',schedule:'as-needed',times:[]},now);
 for(let i=0;i<2;i++)change(s,'Safy','care.entry.add',{kind:'dose',data:{med:p,status:'taken'}},now);
 assert.equal(s.care.entries.filter(e=>e.data.med===p).length,2);
});
test('private doses do not leak through another person’s duplicate checks',()=>{
 const s=initial();const {id}=change(s,'Safy','care.med.save',{name:'Synthetic private dose',schedule:'daily',times:['09:00']},now);
 change(s,'Safy','care.entry.add',{kind:'dose',visibility:'private',data:{med:id,status:'taken',slot:'09:00'}},now);
 assert.equal(view(s,'Mahmoud',now).entries.length,0);
 const shared=change(s,'Mahmoud','care.entry.add',{kind:'dose',data:{med:id,status:'taken',slot:'09:00'}},now);
 assert.equal(view(s,'Mahmoud',now).entries.length,1);
 assert.equal(careHistory(s,'Mahmoud').entries.length,1);
 assert.equal(careExport(s,'Mahmoud').entries.length,1);
 assert.equal(view(s,'Safy',now).entries.length,2);
 assert.throws(()=>change(s,'Mahmoud','care.entry.add',{kind:'dose',data:{med:id,status:'taken',slot:'09:00'}},now),/already logged/);
 assert.equal(view(s,'Mahmoud',now).entries[0].id,shared.id);
});
test('history pages preserve all equal-time entries from the snapshot boundary',()=>{
 const s=initial();for(let i=0;i<850;i++)change(s,'Safy','care.entry.add',{kind:'note',data:{text:'Synthetic row '+i},occurredAt:now},now);
 const v=view(s,'Mahmoud',now);let all=[...v.entries],more=v.olderEntries;
 while(more){const last=all.at(-1),p=careHistory(s,'Mahmoud',last.occurredAt,200,last.id);assert.ok(p.entries.length);all.push(...p.entries);more=p.more;}
 assert.equal(all.length,850);assert.equal(new Set(all.map(e=>e.id)).size,850);
});
test('old-only records are reachable from the first history page, with private records excluded',()=>{
 const s=initial();change(s,'Safy','care.entry.add',{kind:'note',data:{text:'Synthetic older'},occurredAt:now-121*DAY},now);
 change(s,'Safy','care.entry.add',{kind:'note',data:{text:'Synthetic private older'},visibility:'private',occurredAt:now-122*DAY},now);
 assert.equal(view(s,'Mahmoud',now).entries.length,0);assert.equal(view(s,'Mahmoud',now).olderEntries,true);
 assert.equal(careHistory(s,'Mahmoud').entries.length,1);assert.equal(careExport(s,'Safy').entries.length,2);
});
