(()=>{'use strict';
// Lightweight onset/tempo estimate: steady loud audio is not treated as a beat.
class MusicBeat {
 constructor(){this.previous=null;this.floor=.002;this.lastBeat=-Infinity;this.intervals=[];this.bpm=null;}
 sample(values,now){
  if(!this.previous)this.previous=new Float32Array(values.length);
  const count=Math.min(values.length,96);let flux=0,power=0;
  for(let i=1;i<count;i++){const v=values[i]/255;power+=v;flux+=Math.max(0,v-this.previous[i]);this.previous[i]=v;}
  power/=Math.max(1,count-1);flux/=Math.max(1,count-1);
  const beat=power>.008&&flux>Math.max(.004,this.floor*2.1)&&now-this.lastBeat>240;
  this.floor=this.floor*.94+flux*.06;
  if(beat){const gap=now-this.lastBeat;if(gap>=280&&gap<=1400){this.intervals.push(gap);this.intervals=this.intervals.slice(-9);const ordered=[...this.intervals].sort((a,b)=>a-b),median=ordered[Math.floor(ordered.length/2)],consistent=this.intervals.filter(v=>Math.abs(v-median)<median*.2);this.bpm=consistent.length>=3?60000/(consistent.reduce((a,b)=>a+b,0)/consistent.length):null;}else this.intervals=[];this.lastBeat=now;}
  if(now-this.lastBeat>3000)this.bpm=null;
  return {beat,bpm:this.bpm,power};
 }
}
window.OurMusicBeat=MusicBeat;
})();
