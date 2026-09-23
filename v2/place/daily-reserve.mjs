import {morningFallback} from './daily-editorial.mjs';
import {nightFallback} from './daily-fallback.mjs';
// Offline editorial reserve: never presented as a current news report.
export function scheduledReserve(kind,items,key){
 const prefix='From the reserve · not current news\n\n';
 const history=items.map(x=>({...x,title:x.title?.replace(prefix,'')}));
 let value=kind==='morning'?morningFallback(history):nightFallback(history,key);
 if(!value&&kind==='morning'){
  const places=['a quiet seaside town','a city neither of you knows','a cabin with no plans','your favourite familiar place','a train journey with a window seat','a small hotel in the old part of town'];
  const plans=['keep the destination a surprise','choose everything together','take turns planning each day','leave one whole day unplanned'];
  const used=new Set(history.map(x=>x.title));
  for(const place of places)for(const plan of plans){const title=`Imagine you have two days together in ${place}. Would you rather ${plan}, or let the other person arrange the whole trip? What would make you choose?`;if(!value&&!used.has(title))value={title,sources:[],publishedDate:null,reserveFormat:'question'};}
  // A reserve must remain available even during a prolonged provider outage.
  if(!value)value=morningFallback([]);
 }
 if(!value)return null;
 return {...value,title:kind==='afternoon'?prefix+value.title:value.title,reserveFormat:kind==='afternoon'?'discovery instead of unavailable news':value.reserveFormat||'editorial reserve',reserve:true};
}
