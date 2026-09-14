const players=['Mahmoud','Safy'];
const empty=()=>({Mahmoud:0,Safy:0});
const leader=t=>t.Mahmoud===t.Safy?null:t.Mahmoud>t.Safy?'Mahmoud':'Safy';
export function crownTotals(s){updateCrown(s);return {...s.competition.totals};}
// One-time import preserves all historical win totals, including trimmed history.
export function updateCrown(s){
 if(s.competition?.schema===1)return;
 const c=s.competition={schema:1,totals:empty(),games:{},results:{},holder:null,revision:0,events:[]};const history=[];
 for(const [key,title] of [['domino','Dominoes'],['ocho','Ocho']]){const old=s[key]?.records?.shared;const wins={...empty(),...old?.wins};c.games[key]={title,wins};for(const n of players)c.totals[n]+=wins[n];
 for(const r of old?.history??[]){if(!players.includes(r.winner)||!['complete','completed'].includes(r.status))continue;const id=JSON.stringify([key,r.id]);if(c.results[id])continue;c.results[id]={game:key,matchId:r.id,winner:r.winner,at:r.at??r.date};history.push(c.results[id]);}}
 const running={...c.totals};for(const r of history)running[r.winner]--;c.holder=leader(running);
 history.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||JSON.stringify([a.game,a.matchId]).localeCompare(JSON.stringify([b.game,b.matchId])));
 for(const r of history){running[r.winner]++;c.holder=leader(running)??c.holder;}
 c.holder=leader(c.totals)??c.holder;
}
// Server-only integration point for any new competitive game. Call before updating
// its legacy ledger, within the same persisted transaction as match completion.
export function recordCompetitiveResult(s,{game,title,matchId,participants,mode,status,winner},now=Date.now()){
 updateCrown(s);
 if(mode!=='shared'||status!=='complete'||!players.includes(winner)||participants?.length!==2||!players.every(n=>participants.includes(n)))return false;
 if(typeof game!=='string'||!game||typeof matchId!=='string'||!matchId)throw new Error('Competitive results require a game and stable match ID.');
 const c=s.competition,key=JSON.stringify([game,matchId]);if(c.results[key])return false;
 c.results[key]={game,matchId,winner,at:new Date(now).toISOString()};
 if(!Object.hasOwn(c.games,game))Object.defineProperty(c.games,game,{value:{title:title||game,wins:empty()},enumerable:true,writable:true,configurable:true});
 c.games[game].wins[winner]++;c.totals[winner]++;const holder=leader(c.totals)??c.holder;
 if(holder!==c.holder){c.revision++;c.events.unshift({id:c.revision,holder,totals:{...c.totals},at:new Date(now).toISOString()});c.events=c.events.slice(0,30);}c.holder=holder;return true;
}
export function crownSnapshot(s,who){if(!players.includes(who))return null;updateCrown(s);const c=s.competition;const games={...c.games};if(s.draw&&!games.draw)games.draw={title:'Draw & Guess',wins:empty()};return {drawCounts:s.draw?.countCrown??false,mode:'shared',holder:c.holder,totals:{...c.totals},revision:c.revision,events:c.events,breakdown:Object.fromEntries(Object.entries(games).map(([k,g])=>[k,g.wins])),gameTitles:Object.fromEntries(Object.entries(games).map(([k,g])=>[k,g.title]))};}
