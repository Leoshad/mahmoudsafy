import {check} from './domain.mjs';
export const buzzKinds={electric:['⚡','Buzz'],love:['❤️','Love'],kiss:['💋','Kiss'],angry:['😡','Grrr!'],need:['🔔','I need you'],sad:['😔','Feeling sad'],miss:['🥺','I miss you'],side:['💕','You’re not alone']};
export function createBuzz(store,who,id,kind,now=Date.now()){
 check(Object.hasOwn(buzzKinds,kind),'Choose a Buzz effect.');
 const s=store.state();
 const to=who==='Mahmoud'?'Safy':'Mahmoud',event={id,from:who,to,kind,at:now,sequence:(s.buzzSequence??0)+1};
 s.buzzSequence=event.sequence;s.buzzPending={...s.buzzPending,[to]:event};store.save(s);
 store.message({id,author:who,text:`${buzzKinds[kind][0]} ${buzzKinds[kind][1]} · to ${to}`,aiAllowed:false});
 return event;
}

export function acknowledgeBuzz(store,who,id){return store.tx(()=>{const s=store.state();if(s.buzzPending?.[who]?.id!==id)return false;delete s.buzzPending[who];store.save(s);return true;});}
