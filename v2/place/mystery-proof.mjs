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

// Different deductive mechanisms, selected against recent case files.
export function diverseMysteryProof(difficulty='medium',history=[],avoid=''){
 const families=['timeline','statements','access'];
 const markers={timeline:'Timeline clues',statements:'Witness statements',access:'Access records'};
 const candidates=families.filter(f=>f!==avoid);
 candidates.sort((a,b)=>{const index=f=>{const i=history.findIndex(t=>t.includes(markers[f]));return i<0?1e6:i;};return index(b)-index(a);});
 const family=candidates[0];
 if(family==='timeline')return {...mysteryProof(difficulty),family};
 const n=difficulty==='easy'?4:difficulty==='hard'?6:5,names=shuffle(['Alex','Blair','Casey','Drew','Ellis','Fran','Harper','Jules']).slice(0,n),culprit=randomInt(n);
 if(family==='statements'){
  const count=1,statements=names.map((_,i)=>({text:'The culprit is '+names[(i+1)%n]+'.',ok:c=>c===(i+1)%n}));
  // A signed record excludes everyone except two; one witness's verified false statement resolves the pair.
  const other=(culprit+1)%n,witness=(other+n-1)%n;
  const facts='Witness statements\nSuspects: '+names.join(', ')+'. Exactly one caused the incident. Each person makes the following claim:\n'+statements.map((s,i)=>names[i]+': “'+s.text+'”').join('\n')+'\n\nExactly one of these statements is true. A reliable independent record proves the culprit is either '+names[culprit]+' or '+names[other]+'. A verified recording proves '+names[witness]+"’s statement is false. No other assumptions about who lies are allowed.\n\nWho is responsible, and whose statement is true?";
  const possible=names.map((_,i)=>i).filter(c=>(c===culprit||c===other)&&!statements[witness].ok(c)&&statements.filter(s=>s.ok(c)).length===count);
  if(possible.length!==1)throw Error('Witness evidence is not unique.');
  const truthful=(culprit+n-1)%n;
  return {family,facts,activity:{kind:'case',difficulty,hints:['Separate the verified records from the suspects’ claims.','Test each of the two remaining suspects against the statement known to be false.','With one candidate left, check which accusation becomes true.'],answer:names[culprit],explanation:'The independent record leaves '+names[culprit]+' and '+names[other]+'. '+names[witness]+' accuses '+names[other]+', but that statement is verified false, ruling out '+names[other]+'. Therefore '+names[culprit]+' is responsible. Only '+names[truthful]+' makes a true statement, satisfying the one-true-statement rule.'}};
 }
 const badges=shuffle(['amber','blue','coral','green','ivory','violet']).slice(0,n),keys=shuffle(['circle','square','triangle','star','diamond','crescent']).slice(0,n);
 const group=[culprit,(culprit+1)%n],otherGroup=[culprit,(culprit+2)%n];
 const facts='Access records\nSuspects: '+names.join(', ')+'. The incident required both an accepted badge and a matching physical key. Badges and keys could not be borrowed, copied or transferred; no remote access was possible. Only one person performed the action.\n\nVerified inventory\n'+names.map((name,i)=>name+' held the '+badges[i]+' badge and the '+keys[i]+' key.').join('\n')+'\n\nThe door log accepts only '+group.map(i=>badges[i]).join(' or ')+' badges. The lock record accepts only '+otherGroup.map(i=>keys[i]).join(' or ')+' keys. Both records are complete and reliable.\n\nWho alone could have performed the action? Explain which record rules out each alternative.';
 const possible=names.map((_,i)=>i).filter(i=>group.includes(i)&&otherGroup.includes(i));if(possible.length!==1)throw Error('Access evidence is not unique.');
 return {family,facts,activity:{kind:'case',difficulty,hints:['Both conditions must hold for the same person.','List the badge holders allowed by the door, then separately list the accepted key holders.','Compare the two lists: keep only the name present in both.'],answer:names[culprit],explanation:'Accepted badge holders: '+group.map(i=>names[i]).join(', ')+'. Accepted key holders: '+otherGroup.map(i=>names[i]).join(', ')+'. The only intersection is '+names[culprit]+'. Every other suspect lacks at least one required credential, and transfer and remote access are excluded.'}};
}
