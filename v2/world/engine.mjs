import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { anchor, contextForAI, validateProposal } from './domain.mjs';
import { RESERVE_MICRO, TEST_LIMIT_MICRO } from './provider.mjs';
export const Command=z.discriminatedUnion('type',[
 z.object({id:z.uuid(),type:z.literal('move'),target:anchor}).strict(),
 z.object({id:z.uuid(),type:z.literal('pause'),value:z.boolean()}).strict(),
 z.object({id:z.uuid(),type:z.literal('message'),text:z.string().trim().min(1).max(1000),to:z.enum(['partner','ai'])}).strict()
]);
export class WorldError extends Error {constructor(message,status=409){super(message);this.status=status;}}
export function createEngine(store,provider){
  return async (actor,input)=>{
    if(!['Mahmoud','Safy'].includes(actor)) throw new WorldError('Sign in first',401);
    const cmd=Command.parse(input), hash=createHash('sha256').update(JSON.stringify(cmd)).digest('hex');
    const key=`${actor}:${cmd.id}`, job=randomUUID();
    const prepared=store.transaction(s=>{
      if(s.pending&&s.pending.expires<Date.now()) {s.receipts[s.pending.key].result={status:'failed',message:'AI request expired. No automatic retry.'};s.pending=null;}
      const old=s.receipts[key];
      if(old){if(old.hash!==hash)throw new WorldError('Request ID already used');return {result:old.result};}
      if(Object.keys(s.receipts).length>=20000)throw new WorldError('Trial command limit reached');
      let context=null;
      if(cmd.type==='move') {
        if(cmd.target==='arch'&&!s.bridge)throw new WorldError('The arch needs a bridge first');
        s.positions[actor]=cmd.target;
      } else if(cmd.type==='pause') {s.paused[actor]=cmd.value;s.epoch++;}
      else {
        if(cmd.to==='ai') {
          if(!provider)throw new WorldError('AI is not connected yet',503);
          if(Object.values(s.paused).some(Boolean))throw new WorldError('Just Us is on. Each person must release their own pause.');
          if(s.pending)throw new WorldError('Echo is answering. Your draft is safe; send it after this turn.');
          if(s.budget.reservedMicro+RESERVE_MICRO>TEST_LIMIT_MICRO)throw new WorldError('The one-time AI test allowance is used up',429);
          context=contextForAI(s,actor,cmd.text);
          s.budget.reservedMicro+=RESERVE_MICRO;s.budget.requests++;
          s.pending={id:job,key,epoch:s.epoch,expires:Date.now()+45000};
        }
        s.messages.push({id:cmd.id,actor,text:cmd.text,audience:cmd.to==='ai'?'ai':'partners'});
        s.messages=s.messages.slice(-120);
      }
      s.revision++;
      const result={status:context?'pending':'done'};
      s.receipts[key]={hash,result};
      return {context,result};
    });
    if(!prepared.context)return prepared.result;
    try {
      const proposal=await provider(prepared.context);
      return store.transaction(s=>{
        if(s.pending?.id!==job) return s.receipts[key].result;
        if(s.pending.epoch!==s.epoch||s.pending.expires<Date.now()||Object.values(s.paused).some(Boolean)) {
          s.pending=null;s.receipts[key].result={status:'cancelled',message:'Response discarded because privacy mode changed or the request expired.'};return s.receipts[key].result;
        }
        const {next,dialogue}=validateProposal(s,proposal);
        next.messages.push({id:job,actor:'Echo',text:dialogue,audience:'ai'});
        next.messages=next.messages.slice(-120);next.pending=null;next.revision++;
        next.receipts[key].result={status:'done'};Object.assign(s,next);return next.receipts[key].result;
      });
    } catch(e) {
      return store.transaction(s=>{
        if(s.pending?.id===job)s.pending=null;
        // Never expose provider bodies, secrets or unvalidated model output.
        s.receipts[key].result={status:'failed',message:'Echo could not complete a valid turn. The world was not changed. No automatic retry.'};
        return s.receipts[key].result;
      });
    }
  };
}
