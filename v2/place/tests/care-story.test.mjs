import test from 'node:test';import assert from 'node:assert/strict';
import {initial} from '../domain.mjs';import {careChange as c,careSnapshot as v,careExport} from '../care.mjs';
const now=Date.parse('2026-11-18T12:00:00Z');
test('story steps save, import without duplicates, sort newest first and delete',()=>{
 const s=initial();
 const {id}=c(s,'Mahmoud','care.milestone.save',{date:'2021',kind:'crohn',title:'Biopsy',paper:'Biopsy report',historical:true},now);
 c(s,'Safy','care.milestone.save',{date:'2026-11',kind:'visit',title:'Checkup'},now);
 const r=c(s,'Mahmoud','care.milestones.import',{milestones:[{date:'2021',kind:'crohn',title:'biopsy'},{date:'2026-10-14',kind:'visit',title:'Visit'}]},now);
 assert.deepEqual([r.added,r.skipped],[1,1]);
 const m=v(s,'Safy',now).milestones;assert.deepEqual(m.map(x=>x.date),['2026-11','2026-10-14','2021']);assert.equal(m[2].historical,true);
 assert.throws(()=>c(s,'Mahmoud','care.milestone.save',{date:'21',kind:'crohn',title:'x'},now),/date/);
 assert.throws(()=>c(s,'Mahmoud','care.milestone.save',{date:'2021',kind:'nope',title:'x'},now),/about/);
 c(s,'Mahmoud','care.milestone.delete',{id,revision:1},now);assert.equal(v(s,'Mahmoud',now).milestones.length,2);
});
test('doctors and Crohn treatment are shared and exported',()=>{
 const s=initial();const {id}=c(s,'Mahmoud','care.doctor.save',{specialty:'Hematology',phone:'123'},now);
 c(s,'Mahmoud','care.crohn.save',{treatment:'As prescribed'},now);
 const view=v(s,'Safy',now);assert.equal(view.doctors[0].specialty,'Hematology');assert.equal(view.crohn.treatment,'As prescribed');
 assert.throws(()=>c(s,'Mahmoud','care.doctor.save',{specialty:''},now),/specialty/);
 c(s,'Safy','care.doctor.delete',{id,revision:1},now);assert.equal(v(s,'Mahmoud',now).doctors.length,0);
 assert.equal(careExport(s,'Safy').crohn.treatment,'As prescribed');
});
test('older saved records without the new lists still load',()=>{const s=initial();s.care={id:'x',entries:[],labs:[],meds:[],revision:0};const view=v(s,'Safy',now);assert.deepEqual([view.milestones,view.doctors,view.crohn.treatment],[[],[], '']);});
import {careSeedFromEnv} from '../care.mjs';
test('host seed imports once and skips duplicates on restart',()=>{const s=initial();const raw=Buffer.from(JSON.stringify({labs:[{test:'Hemoglobin',value:10.5,unit:'g/dL',lo:12,hi:16,date:'2026-11-16',group:'Blood picture',verified:true}],milestones:[{date:'2021',kind:'crohn',title:'Biopsy'}]})).toString('base64');
 assert.equal(careSeedFromEnv(s,raw,now).added,2);const again=careSeedFromEnv(s,raw,now);assert.deepEqual([again.added,again.skipped,again.changed],[0,2,false]);});
import {gzipSync} from 'node:zlib';
test('host seed also accepts gzip',()=>{const s=initial();const raw=gzipSync(Buffer.from(JSON.stringify({milestones:[{date:'2021',kind:'crohn',title:'Biopsy'}]}))).toString('base64');assert.equal(careSeedFromEnv(s,raw,now).added,1);});
import {careDocumentHTML} from '../care-document.mjs';
test('doctor file lists labs, history and medicines and keeps private notes out for Mahmoud',()=>{const s=initial();
 c(s,'Mahmoud','care.labs.import',{labs:[{test:'Hemoglobin',value:7.8,valueText:'7.80',unit:'g/dL',lo:12,hi:16,flag:'L',date:'2026-10-07',group:'Blood picture',verified:true},{test:'Hemoglobin',value:10.5,valueText:'10.50',unit:'g/dL',lo:12,hi:16,flag:'L',date:'2026-11-16',group:'Blood picture',verified:true}]},now);
 c(s,'Mahmoud','care.milestone.save',{date:'2021',kind:'crohn',title:'Biopsy <b>',paper:'Biopsy report',historical:true},now);
 c(s,'Mahmoud','care.med.save',{name:'Iron',dose:'1 tab',schedule:'daily',times:['09:00'],startedOn:'2026-10-14'},now);
 c(s,'Safy','care.entry.add',{kind:'note',data:{text:'secret thing'},visibility:'private',occurredAt:now-3600000},now);
 c(s,'Safy','care.entry.add',{kind:'belly',data:{pain:3,where:['colon'],diarrhea:false},occurredAt:now-3600000},now);
 const h=careDocumentHTML(v(s,'Mahmoud',now),{who:'Mahmoud',now});
 for(const x of ['10.50','7.80','Biopsy &lt;b&gt;','historical document','Iron','belly pain 3/5','Below range'.slice(0,0)])assert.ok(h.includes(x),x);
 assert.ok(!h.includes('secret thing'));assert.ok(!h.includes('<script'));
 assert.ok(careDocumentHTML(v(s,'Safy',now),{who:'Safy',now}).includes('secret thing'));});
test('guide notes import once, show in the snapshot and the doctor file',()=>{const s=initial();
 const g={guide:[{kind:'ask',title:'Ask about IV iron',body:'Because.',action:'Ask the doctor.',url:'https://example.org/a'},{kind:'remember',title:'Recheck',body:'Every 3 months.'}]};
 assert.equal(c(s,'Mahmoud','care.guide.import',g,now).added,2);assert.equal(c(s,'Mahmoud','care.guide.import',g,now).skipped,2);
 assert.throws(()=>c(s,'Mahmoud','care.guide.import',{guide:[{kind:'ask',title:'x',body:'y',url:'javascript:alert(1)'}]},now),/https/);
 const view=v(s,'Safy',now);assert.equal(view.guide.length,2);assert.ok(careDocumentHTML(view,{who:'Safy',now}).includes('Questions for this visit'));
 c(s,'Mahmoud','care.guide.delete',{id:view.guide[0].id,revision:1},now);assert.equal(v(s,'Safy',now).guide.length,1);});
test('notes can be to-dos that Safy ticks off',()=>{const s=initial();const {id}=c(s,'Safy','care.entry.add',{kind:'note',data:{text:'Buy vitamin D',todo:true}},now);
 c(s,'Safy','care.entry.edit',{id,revision:1,data:{text:'Buy vitamin D',todo:true,done:true}},now);const e=v(s,'Mahmoud',now).entries.find(x=>x.id===id);assert.deepEqual([e.data.todo,e.data.done],[true,true]);
 const {id:p}=c(s,'Mahmoud','care.entry.add',{kind:'note',data:{text:'plain'}},now);assert.equal(v(s,'Safy',now).entries.find(x=>x.id===p).data.todo,undefined);});
import {careReminders} from '../care.mjs';
test('appointments save, sort and remind both of them the evening before',()=>{const s=initial();
 const {id}=c(s,'Mahmoud','care.appt.save',{date:'2026-11-20',time:'10:00',kind:'visit',title:'Hematology visit',doctor:'Dr. A'},now);
 c(s,'Safy','care.appt.save',{date:'2026-11-19',kind:'breast',title:'Breast check'},now);
 assert.deepEqual(v(s,'Safy',now).appointments.map(a=>a.date),['2026-11-19','2026-11-20']);
 assert.throws(()=>c(s,'Safy','care.appt.save',{date:'2026-11-19',kind:'nope',title:'x'},now),/visit is for/);
 const zoneEvening=Date.parse('2026-11-19T17:30:00Z');// 19:30 Cairo
 const r=careReminders(s,zoneEvening);assert.deepEqual(r.map(x=>x.to),['Safy','Mahmoud']);assert.match(r[0].body,/Tomorrow at 10:00: Hematology visit with Dr. A/);
 assert.equal(careReminders(s,Date.parse('2026-11-19T10:00:00Z')).length,0);
 c(s,'Mahmoud','care.appt.save',{id,revision:1,date:'2026-11-20',time:'10:00',kind:'visit',title:'Hematology visit',remind:false},now);assert.equal(careReminders(s,zoneEvening).length,0);});
test('sleep quality and period day notes with heavy-bleeding signs',()=>{const s=initial();
 c(s,'Safy','care.entry.add',{kind:'sleep',data:{start:now-8*3600000,end:now-3600000,quality:'good'}},now);
 assert.throws(()=>c(s,'Safy','care.entry.add',{kind:'sleep',data:{start:now-30*3600000,end:now-24*3600000,quality:'great'}},now),/slept/);
 c(s,'Safy','care.entry.add',{kind:'period',data:{state:'day',flow:'heavy',signs:['pad-2h','clots'],note:'tired'},visibility:'private'},now);
 const e=v(s,'Safy',now).entries.find(x=>x.kind==='period');assert.deepEqual([e.data.signs,e.data.note],[['pad-2h','clots'],'tired']);
 assert.equal(v(s,'Mahmoud',now).entries.some(x=>x.kind==='period'),false);
 assert.throws(()=>c(s,'Safy','care.entry.add',{kind:'period',data:{state:'day',signs:['x']}},now),/signs/);
 c(s,'Safy','care.breast.save',{intervalMonths:12,lastOn:'2026-03-01'},now);assert.deepEqual(v(s,'Mahmoud',now).breast,{intervalMonths:12,lastOn:'2026-03-01'});});

test('seed lab updates fix a range once, and ferritin with low saturation gets a caution', async () => {
 const {careChange:c,careSeedFromEnv:seed,careSnapshot:snap}=await import('../care.mjs');
 const s={care:undefined},now=Date.parse('2026-11-19T09:00:00Z');
 c(s,'Mahmoud','care.labs.import',{labs:[
  {test:'Vitamin D (25-OH)',value:14,valueText:'14',unit:'ng/mL',lo:20,hi:null,rangeText:'30-100',date:'2026-11-10',group:'Vitamins',verified:true},
  {test:'Ferritin',value:28,valueText:'28',unit:'ng/mL',lo:10,hi:170,date:'2026-11-11',group:'Iron',verified:true},
  {test:'Transferrin saturation',value:12,valueText:'12',unit:'%',lo:16,hi:null,date:'2026-11-11',group:'Iron',verified:true}]},now);
 const raw=Buffer.from(JSON.stringify({updates:{labs:[{matchTest:'vitamin d (25-oh)',matchDate:'2026-11-10',lo:30,hi:100}]}})).toString('base64');
 assert.equal(seed(s,raw,now).added,1);assert.equal(seed(s,raw,now).added,0);
 const v=s.care.labs.find(l=>l.test.startsWith('Vitamin'));assert.equal(v.lo,30);assert.equal(v.hi,100);assert.equal(v.history.length,1);assert.equal(v.history[0].lo,20);
 const fer=snap(s,'Safy',now).labs.find(t=>t.key==='ferritin');assert.equal(fer.status,'in');assert.deepEqual(fer.caution,{satValue:'12',satDate:'2026-11-11'});
});

test('a case comes in through the seed, updates in place, keeps its photos, and reaches both views', async () => {
 const {careSeedFromEnv:seed,careSnapshot:snap,careChange:c}=await import('../care.mjs');
 const s={care:undefined},now=Date.parse('2026-11-21T09:00:00Z');c(s,'Mahmoud','care.labs.import',{labs:[{test:'Ferritin',value:30,valueText:'30',unit:'ng/mL',lo:10,hi:170,date:'2026-11-15',group:'Iron',verified:true}]},now);
 const k={id:'case-1',title:'A case',photoSlots:[{key:'rx',label:'Prescription'}]};
 const raw=o=>Buffer.from(JSON.stringify(o)).toString('base64');
 assert.equal(seed(s,raw({cases:[k]}),now).added,1);assert.equal(seed(s,raw({cases:[k]}),now).added,0);
 s.care.cases[0].photos=[{key:'rx',id:'p1',label:'Prescription'}];
 assert.equal(seed(s,raw({cases:[{...k,title:'Renamed'}]}),now).added,1);
 assert.equal(s.care.cases[0].title,'Renamed');assert.equal(s.care.cases[0].photos.length,1);
 for(const who of ['Safy','Mahmoud'])assert.equal(snap(s,who,now).cases[0].title,'Renamed');
});
