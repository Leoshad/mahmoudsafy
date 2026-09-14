import {check} from './domain.mjs';
export function journeyView(s,who){return s.journeys?.[who]??{revision:0,unlocked:1,current:null,complete:false};}
export function journeySave(s,who,d){
 check(['Mahmoud','Safy'].includes(who),'Not authorized.',403);
 const old=journeyView(s,who);check(d.revision===old.revision,'Progress changed on another device. Reopen the game to load it.',409);
 check(Number.isInteger(d.unlocked)&&d.unlocked>=1&&d.unlocked<=10,'Invalid level.');
 check(d.current===null||(Number.isInteger(d.current)&&d.current>=1&&d.current<=d.unlocked),'Invalid current level.');
 check(typeof d.complete==='boolean'&&(!d.complete||d.unlocked===10),'Invalid completion.');
 s.journeys??={};s.journeys[who]={revision:old.revision+1,unlocked:d.unlocked,current:d.current,complete:d.complete};return {ok:true,revision:old.revision+1};
}
