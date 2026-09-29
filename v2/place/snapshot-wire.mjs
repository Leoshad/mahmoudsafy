import {createHash} from 'node:crypto';
// Account filtering precedes this transport step. Legacy streams remain full snapshots.
const fields=['items','messageReactions','activities','personal','court','playlist','draw'];
export function snapshotWire(snapshot,previous={}){
 const next={...snapshot},hashes={};
 for(const key of fields){const wire=JSON.stringify(snapshot[key]);if(wire===undefined)continue;const hash=createHash('sha256').update(wire).digest('hex');hashes[key]=hash;if(previous[key]===hash)delete next[key];}
 return {snapshot:next,hashes};
}
