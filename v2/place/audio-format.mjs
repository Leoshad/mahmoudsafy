// Accept MPEG Layer III frames, optionally preceded by a bounded ID3v2 tag.
export function isMP3(b){
 let offset=0;
 if(b.toString('ascii',0,3)==='ID3'){
  if(b.length<10||b[3]<2||b[3]>4||[...b.subarray(6,10)].some(n=>n>127))return false;
  offset=10+((b[6]<<21)|(b[7]<<14)|(b[8]<<7)|b[9]);
  if(b[3]===4&&(b[5]&16))offset+=10;
 }
 if(offset+4>b.length)return false;
 const a=b[offset],v=b[offset+1],r=b[offset+2];
 return a===255&&(v&224)===224&&(v&24)!==8&&(v&6)===2&&(r>>4)>0&&(r>>4)<15&&((r>>2)&3)!==3;
}
