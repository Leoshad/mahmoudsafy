import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function render(text){
 const node=tag=>({tag,children:[],_text:'',get textContent(){return this._text+this.children.map(n=>n.textContent).join('');},set textContent(v){this._text=v;this.children=[];},append(n){this.children.push(n);},replaceChildren(){this.children=[];this._text='';}});
 const document={createElement:node,createTextNode:text=>({textContent:text})},ctx=vm.createContext({document,URL});
 vm.runInContext(source.slice(source.indexOf('function renderMessageText('),source.indexOf('function paintWallpaper()')),ctx);
 const root=node('p');ctx.renderMessageText(root,{author:'Echo',text,status:'streaming'});
 const all=n=>[...(n.tag==='a'?[n]:[]),...(n.children||[]).flatMap(all)];return {root,links:all(root)};
}
test('Echo links support source labels, bare URLs, Arabic punctuation and balanced parentheses',()=>{const {root,links}=render('راجع [المصدر](https://example.com/a_(b)) و **https://example.org?q=1&b=2**، ثم (https://example.net).');assert.equal(links.length,3);assert.equal(links[0].textContent,'المصدر');assert.equal(links[0].href,'https://example.com/a_(b)');assert.equal(links[1].href,'https://example.org?q=1&b=2');assert.equal(links[2].href,'https://example.net');assert.ok(root.textContent.endsWith('(https://example.net).'));for(const a of links){assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer');}});
test('HTML and unsafe or credential-bearing link destinations remain inert text',()=>{const text='<img src=x onerror=alert(1)> [bad](javascript:alert) [file](data:text/html,test) https://user:pass@example.com';const {root,links}=render(text);assert.equal(links.length,0);assert.equal(root.textContent,text);});
test('streamed and historical content use the same link renderer',()=>{const partial=render('[Source](https://example.com');assert.ok(partial.root.textContent.includes('[Source]('));const complete=render('[Source](https://example.com)');assert.equal(complete.root.textContent,'Source');assert.equal(complete.links[0].href,'https://example.com');});
