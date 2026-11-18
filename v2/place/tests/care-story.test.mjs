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
