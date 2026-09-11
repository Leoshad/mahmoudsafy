import {ActionError} from './game.ts';
export const V1_REF='oiwxwogdfjgrapigiqrw';
export const V2_REF='hvjcugehjwqtrvzgbwnq';
export function assertV2(url:string){if(new URL(url).hostname!==`${V2_REF}.supabase.co`)throw Error('Refusing to connect outside the authorized V2 project.');}
export function pauseBy(current:string[],actor:string,paused:boolean){return paused?[...new Set([...current,actor])]:current.filter(id=>id!==actor)}
export function canPublish(epoch:number,jobEpoch:number,status:string){return epoch===jobEpoch&&status==='running'}
// USD micro-units. Conservative reservation includes generator and verifier, no cache assumptions.
export const REQUEST_RESERVE=30_000;
export const TEST_LIMIT=4_000_000; // $4 x conservative 4.75 SAR/USD < SAR 20, including fees reserve.
export const MONTHLY_AI_LIMIT=6_000_000; // $6; fixed hosting + tax/FX reserve remains below SAR 80.
export function reserveBudget(spent:number,reserved:number,limit:number){if(spent+reserved+REQUEST_RESERVE>limit)throw new ActionError('AI allowance reached. Your room and game still work.',429);return reserved+REQUEST_RESERVE}
export function costMicro(input:number,output:number){return Math.ceil(input*.2+output*1.2)}
