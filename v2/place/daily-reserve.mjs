import {repeatedDailyContent} from './daily-content.mjs';
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
  for(const place of places)for(const plan of plans){const title=`Imagine you have two days together in ${place}. Would you rather ${plan}, or let the other person arrange the whole trip? What would make you choose?`;if(!value&&!repeatedDailyContent({title},history))value={title,sources:[],publishedDate:null,reserveFormat:'question'};}
  // A reserve must remain available even during a prolonged provider outage.
  if(!value){
   for(let days=3;days<1003&&!value;days++)for(const place of places){
    const title=`You have ${days} days together in ${place}, with no work to fit around. How would you divide the time between exploring, resting and doing something neither of you has tried? Each of you gets to choose one plan the other will join.`;
    if(!repeatedDailyContent({title},history)){value={title,sources:[],publishedDate:null,reserveFormat:'question'};break;}
   }
  }
 }
 if(!value)return null;
 return {...value,title:kind==='afternoon'?prefix+value.title:value.title,reserveFormat:kind==='afternoon'?'discovery instead of unavailable news':value.reserveFormat||'editorial reserve',reserve:true};
}
