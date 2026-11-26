import {createHash} from 'node:crypto';
// Account filtering precedes this transport step. Legacy streams remain full snapshots.
const fields=['items','messageReactions','activities','personal','court','playlist','care','billiards','messages','ocho','domino','word','crown','daily'];
const HASH=16;
export function snapshotWire(snapshot,previous={}){
 const next={...snapshot},hashes={};
 for(const key of fields){const wire=JSON.stringify(snapshot[key]);if(wire===undefined)continue;const hash=createHash('sha256').update(wire).digest('hex').slice(0,HASH);hashes[key]=hash;if(previous[key]===hash)delete next[key];}
 return {snapshot:next,hashes};
}
// A compact receipt of what this phone already holds, so a routine reconnect sends only what changed.
export function wireToken(hashes){return fields.filter(k=>hashes[k]).map(k=>k+'.'+hashes[k]).join('~');}
export function parseWireToken(token){
 if(typeof token!=='string'||!token||token.length>1200)return null;
 const out={};
 for(const part of token.split('~')){const [k,h]=part.split('.');if(!fields.includes(k)||!/^[0-9a-f]{16}$/.test(h??''))return null;out[k]=h;}
 return Object.keys(out).length?out:null;
}
