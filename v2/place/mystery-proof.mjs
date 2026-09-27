import {randomInt} from 'node:crypto';
// A closed, verifiable clue set. Echo supplies the fictional scene; evidence and
// solution remain generated and checked together, never inferred from prose.
export function mysteryProof(difficulty='medium'){
 const pool=['Alex','Blair','Casey','Drew','Ellis','Fran','Harper','Jules'];
 for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 const n=difficulty==='easy'?3:difficulty==='hard'?6:4,names=pool.slice(0,n),culprit=randomInt(n);
 const attributes=[['badge','amber','blue'],['route','east','west'],['shift','early','late']];
 const used=difficulty==='easy'?2:3,patterns=Array.from({length:8},(_,i)=>i);
 const target=randomInt(2**used),others=patterns.filter(x=>x<2**used&&x!==target);
 for(let i=others.length-1;i>0;i--){const j=randomInt(i+1);[others[i],others[j]]=[others[j],others[i]];}
 const rows=names.map((name,i)=>({name,bits:i===culprit?target:others.pop()}));
 const facts=rows.map(r=>r.name+': '+attributes.slice(0,used).map(([label,a,b],i)=>label+' '+((r.bits>>i)&1?b:a)).join(', ')).join('\n');
 const evidence=attributes.slice(0,used).map(([label,a,b],i)=>({label,value:(target>>i)&1?b:a}));
 const matches=rows.filter(r=>evidence.every((_,i)=>((r.bits>>i)&1)===((target>>i)&1)));
 if(matches.length!==1)throw Error('Mystery evidence is not unique.');
 const rule='Case facts (complete and reliable): exactly one listed person acted alone. Each person used only their own badge, assigned route and shift; no lending, disguises, accomplices or altered records are possible. The culprit must match EVERY recorded clue below. These facts are exhaustive; do not assume extra events.';
 const clues=evidence.map((e,i)=>(i+1)+'. The culprit’s '+e.label+' was '+e.value+'.').join('\n');
 const title=rule+'\n\nSuspect records\n'+facts+'\n\nVerified evidence\n'+clues+'\n\nWho fits all the evidence? Compare your theories together.';
 return {facts:title,activity:{kind:'case',difficulty,hints:['Eliminate anyone who does not match the first recorded clue.','A match to just one clue is not enough. Compare the remaining records with the next clue.','Keep only the person who matches every recorded clue at the same time.'],answer:matches[0].name,explanation:rows.map(r=>{const mismatch=evidence.filter((e,i)=>((r.bits>>i)&1)!==((target>>i)&1));return r.name+': '+(mismatch.length?'ruled out by '+mismatch.map(x=>x.label).join(' and ')+'.':'matches all recorded clues.');}).join('\n')}};
}
