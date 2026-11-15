import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryObservation} from '../memory-observer.mjs';
test('diagnostic emits only process and container byte totals',()=>{
 const r=memoryObservation('working',()=> '12345\n');
 assert.deepEqual(Object.keys(r),['event','phase','processRssBytes','containerBytes']);
 assert.equal(r.containerBytes,12345);assert.ok(r.processRssBytes>0);
});
test('diagnostic tolerates unavailable container metric',()=>{
 const r=memoryObservation('start',()=>{throw Error('unavailable')});assert.equal(r.containerBytes,null);
});
