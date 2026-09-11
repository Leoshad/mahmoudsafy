export type Member={id:string;name:string};
export type Game={id:string;version:1;phase:'ready'|'secrets'|'guesses'|'reveal'|'complete'|'abandoned';round:number;rounds:3;players:string[];ready:string[];secrets:Record<string,number>;guesses:Record<string,number>;scores:Record<string,number>;reveal:null|{secrets:Record<string,number>;guesses:Record<string,number>;points:Record<string,number>}};
export class ActionError extends Error { constructor(message:string, public status=409){super(message)} }
export function startGame(id:string,players:string[]):Game{if(players.length!==2||new Set(players).size!==2)throw new ActionError('Both accounts must join before a game starts.');return{id,version:1,phase:'ready',round:1,rounds:3,players:[...players],ready:[],secrets:{},guesses:{},scores:Object.fromEntries(players.map(p=>[p,0])),reveal:null}}
export function act(input:Game,actor:string,type:string,number?:number):Game{
 const g=structuredClone(input);if(!g.players.includes(actor))throw new ActionError('Not a player.',403);
 if(type==='game.abandon'){if(['complete','abandoned'].includes(g.phase))throw new ActionError('Game has already ended.');g.phase='abandoned';g.secrets={};g.guesses={};g.reveal=null;return g}
 if(type==='game.ready'||type==='game.next'){
  if(g.phase!==(type==='game.ready'?'ready':'reveal'))throw new ActionError('This round has moved on.');
  if(!g.ready.includes(actor))g.ready.push(actor);
  if(g.ready.length===2){if(type==='game.next')g.round++;g.phase='secrets';g.ready=[];g.secrets={};g.guesses={};g.reveal=null;}return g;
 }
 if(type!=='game.secret'&&type!=='game.guess')throw new ActionError('Unknown game action.',400);
 if(!Number.isInteger(number)||number!<1||number!>10)throw new ActionError('Choose a whole number from 1 to 10.',400);
 const secret=type==='game.secret';if(g.phase!==(secret?'secrets':'guesses'))throw new ActionError('This round has moved on.');
 const target=secret?g.secrets:g.guesses;if(actor in target)throw new ActionError('Your choice is already sealed.');target[actor]=number!;
 if(Object.keys(target).length===2){if(secret)g.phase='guesses';else{const points:Record<string,number>={};for(const p of g.players){const other=g.players.find(x=>x!==p)!;const distance=Math.abs(g.guesses[p]-g.secrets[other]);points[p]=distance===0?3:distance===1?1:0;g.scores[p]+=points[p];}g.reveal={secrets:{...g.secrets},guesses:{...g.guesses},points};g.phase=g.round===g.rounds?'complete':'reveal';g.ready=[];}}
 return g;
}
export function projectGame(g:Game|null,actor:string){if(!g)return null;if(!g.players.includes(actor))throw new ActionError('Not a player.',403);const{secrets,guesses,...visible}=g;return{...visible,submitted:Object.keys(secrets),guessed:Object.keys(guesses),mySecret:secrets[actor]??null,myGuess:guesses[actor]??null};}
