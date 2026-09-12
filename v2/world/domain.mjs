import { z } from 'zod';
export const anchors = { center:[320,230], arch:[490,145], edge:[155,170], mirror:[475,290] };
const anchor = z.enum(['center','arch','edge','mirror']);
export const Proposal = z.object({
  dialogue: z.string().min(1).max(1200),
  actions: z.array(z.object({
    kind: z.enum(['move','atmosphere','object','bridge']),
    target: z.enum(['center','arch','edge','mirror','world']),
    value: z.string().max(240),
    label: z.string().max(40)
  }).strict()).max(3)
}).strict();
export function initialState() {
  return { version:1, revision:0, epoch:0, mood:'still', bridge:false,
    positions:{ Mahmoud:'center', Safy:'edge', Echo:'mirror' },
    objects:{}, paused:{Mahmoud:false,Safy:false}, messages:[], receipts:{},
    budget:{reservedMicro:0,requests:0}, pending:null };
}
export function validateProposal(state, raw) {
  const proposal=Proposal.parse(raw), next=structuredClone(state);
  for(const action of proposal.actions) {
    const {kind,target,value,label}=action;
    if(kind==='move') {
      if(!anchors[target]) throw Error('Unknown destination');
      if(target==='arch'&&!next.bridge) throw Error('The arch is disconnected');
      next.positions.Echo=target;
    } else if(kind==='atmosphere') {
      if(target!=='world'||!['still','embers','rose'].includes(value)) throw Error('Unknown atmosphere');
      next.mood=value;
    } else if(kind==='bridge') {
      if(target!=='arch'||!['open','close'].includes(value)) throw Error('Invalid bridge action');
      if(value==='close'&&Object.values(next.positions).includes('arch')) throw Error('An occupied bridge cannot close');
      next.bridge=value==='open';
    } else {
      if(!anchors[target]||!label.trim()||!value.trim()) throw Error('An object needs a place, name and description');
      next.objects[target]={label,description:value};
    }
  }
  return {next,dialogue:proposal.dialogue};
}
export function publicState(s, actor, connected) {
  const {receipts,budget,pending,...view}=s;
  return {...view,actor,connected,busy:!!pending && pending.expires>Date.now(),testRemainingUSD:Math.max(0,(3000000-budget.reservedMicro)/1e6)};
}
export function contextForAI(s,actor,text) {
  return {actor,request:text,world:{mood:s.mood,bridge:s.bridge,positions:s.positions,objects:s.objects},
    conversation:s.messages.filter(m=>m.audience==='ai').slice(-12).map(({actor,text})=>({actor,text}))};
}
export { anchor };
