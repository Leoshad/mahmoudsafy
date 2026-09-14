// Personal trial: only Mahmoud's completed solo matches count.
const players=['Mahmoud','Computer'];
export function crownTotals(s){return Object.fromEntries(players.map(n=>[n,['domino','ocho'].reduce((sum,k)=>sum+(s[k]?.records?.solo?.Mahmoud?.wins?.[n]??0),0)]));}
function leader(t){return t.Mahmoud===t.Computer?null:t.Mahmoud>t.Computer?'Mahmoud':'Computer';}
function historicalHolder(s,totals){
 const rows=['domino','ocho'].flatMap(k=>(s[k]?.records?.solo?.Mahmoud?.history??[]).filter(r=>players.includes(r.winner)).map(r=>({...r,time:Date.parse(r.date??r.at)}))).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 const running={...totals};for(const r of rows)running[r.winner]--;let holder=leader(running);
 for(const r of rows){running[r.winner]++;holder=leader(running)??holder;}return holder;
}
export function updateCrown(s,now=Date.now()){
 const totals=crownTotals(s),prior=s.crownTrial;
 if(!prior){s.crownTrial={holder:leader(totals)??historicalHolder(s,totals),totals,revision:0,events:[]};return;}
 const holder=leader(totals)??prior.holder;
 if(holder&&holder!==prior.holder){prior.revision++;prior.events=[{id:prior.revision,holder,totals:{...totals},at:new Date(now).toISOString()},...prior.events].slice(0,20);}
 prior.holder=holder;prior.totals=totals;
}
export function crownSnapshot(s,who){if(who!=='Mahmoud')return null;updateCrown(s);return {...s.crownTrial,mode:'solo',breakdown:Object.fromEntries(['domino','ocho'].map(k=>[k,Object.fromEntries(players.map(n=>[n,s[k]?.records?.solo?.Mahmoud?.wins?.[n]??0]))]))};}
