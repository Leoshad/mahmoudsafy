import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
test('native refresh has no competing document touch interception',()=>{const source=read('comfort.js');assert.doesNotMatch(source,/document\.addEventListener\('touch(?:start|move|end|cancel)'/);assert.doesNotMatch(source,/pull\.ready|let pull=/);});
test('root permits native overscroll while chat and games retain their own scrolling',()=>{const css=read('style.css');assert.match(css,/html,body\{overscroll-behavior-y:auto\}/);assert.doesNotMatch(css,/html,body\{overscroll-behavior-y:none\}/);assert.match(css,/\.timeline\{[^}]*overscroll-behavior:contain/);});
