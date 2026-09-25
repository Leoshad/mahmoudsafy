// Presentation labels, punctuation and paragraph breaks do not make a new post.
export function dailyContentKey(title=''){
 return String(title).normalize('NFKC').toLowerCase()
  .replace(/^\s*from the reserve\s*[·:—–-]\s*not current news\s*/u,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export function sameDailyContent(a,b){
 const left=dailyContentKey(a),right=dailyContentKey(b);
 if(!left||!right)return false;
 if(left===right)return true;
 // Catch a short introduction or a light edit without merging different numeric puzzles.
 const numbers=t=>(t.match(/\b\d+\b/g)||[]).sort().join(',');
 if(numbers(left)!==numbers(right))return false;
 const x=new Set(left.split(' ')),y=new Set(right.split(' '));
 if(Math.min(x.size,y.size)<15)return false;
 const common=[...x].filter(w=>y.has(w)).length;
 return common/Math.max(x.size,y.size)>=.9;
}
export const repeatedDailyContent=(value,items)=>items.some(x=>sameDailyContent(value?.title,x.title));
