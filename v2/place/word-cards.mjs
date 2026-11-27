import {createHash} from 'node:crypto';
// When today's word is decided, the winner (by the agreed rules) gets a card in Our Chat, like the shared hug card.
// Only results decided after this feature shipped get a card, so old history never floods the chat.
export const CARDS_FROM=Date.parse('2026-11-27T13:00:00Z');
const clock=ms=>{const t=Math.max(0,Math.round((ms||0)/1000));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
export function saveWordWinCards(store,s){
 const history=s.word?.records?.history;if(!Array.isArray(history))return false;let added=false;
 for(const h of history.slice(0,5)){
  if(h.kind!=='daily'||!h.winner||!(Date.parse(h.date)>=CARDS_FROM))continue;
  const id='word-win:'+createHash('sha256').update(h.id).digest('hex');
  if(store.db.prepare('SELECT 1 FROM messages WHERE id=?').get(id))continue;
  const r=h.results?.[h.winner]??{},tries=r.tries??0,hints=r.hints??0;
  const text=h.winner+' won today’s word\n'+String(h.answerDisplay||h.answer||'').toUpperCase()+'\n'+tries+' '+(tries===1?'try':'tries')+' · '+hints+' '+(hints===1?'letter':'letters')+' shown · '+clock(r.ms);
  store.message({id,author:'Together',text,status:'sent'});store.db.prepare('UPDATE messages SET createdAt=? WHERE id=?').run(h.date,id);added=true;
 }
 return added;
}
