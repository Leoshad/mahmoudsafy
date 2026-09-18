// Editorial reserve verified against NASA on 2026-09-18. Never used as current news.
const url='https://science.nasa.gov/venus/venus-facts/';
const reserve=[
 "Venus finishes a trip around the Sun before it finishes turning once. Its year takes about 225 Earth days; one full rotation takes 243. Those are different clocks: a rotation is not the same as the interval between sunrises.",
 "An asteroid got its official name because someone misread their own handwriting. An illustrator copied 2002 VE onto a children's space poster, then read it as Zoozve. The mistake was eventually traced, proposed as a name, and officially approved in 2024.",
 "The bright 'morning star' and 'evening star' can be the same planet: Venus, seen at different points in its orbit. Through a telescope it also shows phases, like the Moon. You're watching sunlight reach different parts of the same world."
];
export function nightFallback(items,key){
 const used=new Set(items.map(x=>x.title));
 const title=reserve.find(x=>!used.has(x));
 if(title)return {title,sources:[{url,title:'NASA · Venus facts'}],publishedDate:null};
 // An original arithmetic puzzle, not an externally sourced factual claim.
 // For x+y=S, x+z=T, y+z=U, x=(S+T-U)/2. Unique positive integer solution.
 let n=Number(key.slice(0,10).replaceAll('-',''))%97+3;
 for(let i=0;i<1000;i++,n++){
  const a=n,b=n+7,c=n+13;
  const text=`A small puzzle for tonight: three sealed boxes each contain a different number of coins. A and B together contain ${a+b}; A and C contain ${a+c}; B and C contain ${b+c}. How many coins are in each box? No guessing is needed. Compare what gets counted twice.`;
  if(!used.has(text))return {title:text,sources:[],publishedDate:null};
 }
 return null;
}
