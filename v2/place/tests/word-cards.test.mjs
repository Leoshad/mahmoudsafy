import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../store.mjs';import {saveWordWinCards,CARDS_FROM} from '../word-cards.mjs';
const entry=(id,date,winner)=>({id,kind:'daily',date:new Date(date).toISOString(),winner,answer:'smile',answerDisplay:'smile',results:{Mahmoud:{solved:true,tries:3,hints:1,ms:250000},Safy:{solved:true,tries:2,hints:2,ms:475000}}});
test('today’s word winner gets one card in Our Chat, ties and old results get none',()=>{
 const store=new Store(':memory:');const s={word:{records:{history:[entry('a',CARDS_FROM+60000,'Safy'),entry('b',CARDS_FROM+30000,null),entry('c',CARDS_FROM-60000,'Mahmoud'),{...entry('d',CARDS_FROM+90000,'Mahmoud'),kind:'challenge'}]}}};
 assert.equal(saveWordWinCards(store,s),true);assert.equal(saveWordWinCards(store,s),false);
 const cards=store.db.prepare("SELECT * FROM messages WHERE id LIKE 'word-win:%'").all();
 assert.equal(cards.length,1);assert.equal(cards[0].author,'Together');
 assert.equal(cards[0].text,'Safy won today’s word\nSMILE\n2 tries · 2 letters shown · 7:55');
 assert.equal(cards[0].createdAt,new Date(CARDS_FROM+60000).toISOString());
});
