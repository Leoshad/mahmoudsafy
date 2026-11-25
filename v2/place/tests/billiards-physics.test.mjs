import {test} from 'node:test';import assert from 'node:assert/strict';import {rack,simulateShot} from '../billiards-physics.mjs';
test('rack contains every ball once and separates cue from rack',()=>{const b=rack();assert.equal(b.length,16);assert.equal(new Set(b.map(x=>x.id)).size,16);assert.ok(b[0].y>b[1].y)});
test('shot is deterministic and stops',()=>{let a=simulateShot(rack(),{angle:-Math.PI/2,power:.8});let b=simulateShot(rack(),{angle:-Math.PI/2,power:.8});assert.deepEqual(a,b);assert.equal(a.firstHit,1);assert.ok(a.steps<4000)});
test('invalid power rejected',()=>assert.throws(()=>simulateShot(rack(),{angle:0,power:3})));
