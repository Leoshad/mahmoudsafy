import {check} from './domain.mjs';
export const buzzKinds={electric:['⚡','Buzz'],love:['❤️','Love'],kiss:['💋','Kiss'],angry:['😡','Grrr!'],need:['🔔','I need you']};
export function createBuzz(store,who,id,kind,now=Date.now()){
 check(Object.hasOwn(buzzKinds,kind),'Choose a Buzz effect.');
 const s=store.state();check(now-(s.buzzLast?.[who]??0)>=10000,'Wait 10 seconds between Buzzes.',429);
 s.buzzLast={...s.buzzLast,[who]:now};store.save(s);
 const to=who==='Mahmoud'?'Safy':'Mahmoud',event={id,from:who,to,kind,at:now};
 store.message({id,author:who,text:`${buzzKinds[kind][0]} ${buzzKinds[kind][1]} · to ${to}`,aiAllowed:false});
 return event;
}
