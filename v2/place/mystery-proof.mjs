import {randomInt} from 'node:crypto';
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const permutations=a=>a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];
export function mysteryProof(difficulty='medium'){
 const n=difficulty==='easy'?4:difficulty==='hard'?6:5,names=shuffle(['Alex','Blair','Casey','Drew','Ellis','Fran','Harper','Jules']).slice(0,n),order=shuffle(names),slot=randomInt(1,n-1),all=permutations(names);let candidates=[];
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const a=order[i],b=order[j];candidates.push({text:a+' visited before '+b+'.',ok:p=>p.indexOf(a)<p.indexOf(b)});if(j===i+1)candidates.push({text:b+' visited immediately after '+a+'.',ok:p=>p.indexOf(b)===p.indexOf(a)+1});}
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j){const name=order[i];candidates.push({text:name+' was not visitor number '+(j+1)+'.',ok:p=>p[j]!==name});}
 let clues=[],solutions=all;
 for(const c of shuffle(candidates)){const next=solutions.filter(c.ok);if(next.length<solutions.length){clues.push(c);solutions=next;}if(solutions.length===1)break;}
 // Remove redundant clues while keeping a single full order.
 for(let i=clues.length-1;i>=0;i--){const reduced=clues.filter((_,j)=>i!==j);if(all.filter(p=>reduced.every(c=>c.ok(p))).length===1)clues=reduced;}
 solutions=all.filter(p=>clues.every(c=>c.ok(p)));if(solutions.length!==1)throw Error('Mystery evidence is not unique.');
 const times=Array.from({length:n},(_,i)=>'8:'+String(i*5).padStart(2,'0'));
 const facts='Verified case file\nSuspects: '+names.join(', ')+'. Each visited the secured room exactly once, alone, in one of these slots: '+times.join(', ')+'. Each visit ended before the next began. No one else entered, no objects passed between visitors, and there was no remote access or accomplice.\n\nThe tamper-proof sensor establishes that the object was switched during the '+times[slot]+' visit. The sole visitor in that slot made the switch. All records and clues below are accurate and complete; no outside assumptions are needed.\n\nTimeline clues\n'+clues.map((c,i)=>(i+1)+'. '+c.text).join('\n')+'\n\nWho made the switch? Reconstruct the visits together.';
 return {facts,activity:{kind:'case',difficulty,hints:['Arrange the suspects in the available time slots; do not guess from motives.','Combine the order clues before using the exclusions. Try one possible order and discard it as soon as it breaks a clue.','The sensor fixes which visit matters. Once your order satisfies every clue, look at the visitor in that slot.'],answer:order[slot],explanation:'The only order satisfying every clue is:\n'+order.map((name,i)=>times[i]+' — '+name).join('\n')+'\n\nCheck the clues:\n'+clues.map(c=>c.text).join('\n')+'\n\nThe switch happened at '+times[slot]+', so '+order[slot]+' made it. All '+all.length+' possible visitor orders were checked; only this one satisfies every clue.'}};
}
