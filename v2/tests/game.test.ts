import test from 'node:test';
import assert from 'node:assert/strict';
import {startGame,act,projectGame,Game} from '../server/game.ts';
import {pauseBy,canPublish,reserveBudget,TEST_LIMIT,REQUEST_RESERVE,assertV2} from '../server/policy.ts';
const players=['mahmoud','safy'];
function ready(){let g=startGame('one',players);g=act(g,players[0],'game.ready');return act(g,players[1],'game.ready')}
function round(g:Game){g=act(g,'mahmoud','game.secret',2);g=act(g,'safy','game.secret',8);g=act(g,'mahmoud','game.guess',8);return act(g,'safy','game.guess',3)}
test('only two distinct members can start',()=>{assert.throws(()=>startGame('one',['m']));assert.throws(()=>startGame('one',['m','m']))});
test('both must be ready; repeated ready never starts early',()=>{let g=startGame('one',players);g=act(g,'mahmoud','game.ready');g=act(g,'mahmoud','game.ready');assert.equal(g.phase,'ready');assert.throws(()=>act(g,'stranger','game.ready'))});
test('other secret and guess never appear before reveal',()=>{let g=ready();g=act(g,'mahmoud','game.secret',2);g=act(g,'safy','game.secret',8);g=act(g,'safy','game.guess',3);const p=projectGame(g,'mahmoud')!;assert.equal(p.mySecret,2);assert.equal(p.myGuess,null);assert.equal(p.reveal,null);assert.ok(!('secrets' in p));assert.ok(!('guesses' in p));assert.throws(()=>projectGame(g,'stranger'))});
test('secret is immutable; guesses wait for both secrets',()=>{let g=ready();g=act(g,'mahmoud','game.secret',2);assert.throws(()=>act(g,'mahmoud','game.secret',5));assert.throws(()=>act(g,'safy','game.guess',2))});
test('reject invalid and unknown actions without mutating original',()=>{const g=ready();for(const n of [0,11,2.5,NaN])assert.throws(()=>act(g,'mahmoud','game.secret',n));assert.throws(()=>act(g,'mahmoud','game.cheat',5));assert.deepEqual(g.secrets,{})});
test('reveal and exact/near scoring happen together once',()=>{const g=round(ready());assert.equal(g.phase,'reveal');assert.deepEqual(g.scores,{mahmoud:3,safy:1});assert.deepEqual(g.reveal?.points,{mahmoud:3,safy:1});assert.throws(()=>act(g,'safy','game.guess',3))});
test('three rounds finish and restore from serialized canonical state',()=>{let g=ready();for(let i=1;i<=3;i++){g=round(JSON.parse(JSON.stringify(g)));assert.equal(g.round,i);if(i<3){g=act(g,'mahmoud','game.next');assert.equal(g.phase,'reveal');g=act(g,'safy','game.next');assert.deepEqual(g.secrets,{});assert.equal(g.reveal,null)}}assert.equal(g.phase,'complete');assert.deepEqual(g.scores,{mahmoud:9,safy:3});assert.throws(()=>act(g,'mahmoud','game.next'))});
test('abandon wipes unrevealed secret, does not produce a winner',()=>{let g=ready();g=act(g,'mahmoud','game.secret',7);g=act(g,'safy','game.abandon');assert.equal(g.phase,'abandoned');assert.deepEqual(g.secrets,{});assert.equal(g.reveal,null)});
test('Just Us requires each requester to resume their own permission',()=>{let p=pauseBy([],'mahmoud',true);p=pauseBy(p,'safy',true);p=pauseBy(p,'mahmoud',false);assert.deepEqual(p,['safy']);assert.deepEqual(pauseBy(p,'safy',false),[])});
test('old AI result cannot publish after pause/resume or cancellation',()=>{assert.equal(canPublish(3,2,'running'),false);assert.equal(canPublish(2,2,'cancelled'),false);assert.equal(canPublish(2,2,'running'),true)});
test('reservations count in spending ceiling',()=>{assert.equal(reserveBudget(0,0,TEST_LIMIT),REQUEST_RESERVE);assert.throws(()=>reserveBudget(TEST_LIMIT-REQUEST_RESERVE,1,TEST_LIMIT));assert.throws(()=>reserveBudget(TEST_LIMIT,0,TEST_LIMIT))});
test('all V1 and arbitrary project URLs are rejected',()=>{assert.throws(()=>assertV2('https://oiwxwogdfjgrapigiqrw.supabase.co'));assert.throws(()=>assertV2('https://example.com'));assert.doesNotThrow(()=>assertV2('https://hvjcugehjwqtrvzgbwnq.supabase.co'))});
