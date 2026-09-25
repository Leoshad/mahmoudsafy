import {repeatedDailyContent} from './daily-content.mjs';
// Editorial reserve verified against NASA on 2026-09-18. Never used as current news.
const url='https://science.nasa.gov/venus/venus-facts/';
const reserve=[
 "Venus finishes a trip around the Sun before it finishes turning once. Its year takes about 225 Earth days; one full rotation takes 243. Those are different clocks: a rotation is not the same as the interval between sunrises.",
 "An asteroid got its official name because someone misread their own handwriting. An illustrator copied 2002 VE onto a children's space poster, then read it as Zoozve. The mistake was eventually traced, proposed as a name, and officially approved in 2024.",
 "The bright 'morning star' and 'evening star' can be the same planet: Venus, seen at different points in its orbit. Through a telescope it also shows phases, like the Moon. You're watching sunlight reach different parts of the same world."
];
export function nightFallback(items,key){
 const title=reserve.find(title=>!repeatedDailyContent({title},items));
 if(title)return {title,sources:[{url,title:'NASA · Venus facts'}],publishedDate:null};
 // An original arithmetic puzzle, not an externally sourced factual claim.
 // For x+y=S, x+z=T, y+z=U, x=(S+T-U)/2. Unique positive integer solution.
 let n=Number(key.slice(0,10).replaceAll('-',''))%97+3;
 for(let i=0;i<1000;i++,n++){
  const a=n,b=n+7,c=n+13;
  const text=`A small puzzle for tonight: three sealed boxes each contain a different number of coins. A and B together contain ${a+b}; A and C contain ${a+c}; B and C contain ${b+c}. How many coins are in each box? No guessing is needed. Compare what gets counted twice.`;
  const alternatives=[
   text,
   'You have nine identical-looking coins. Exactly one is heavier; the other eight weigh the same. Using a balance scale only twice, how can you be certain which coin is heavier?',
   'Three boxes are labelled Apples, Oranges, and Mixed. Every label is wrong. You may take one fruit from one box without looking inside. Which box do you choose, and how does that single fruit let you correct all three labels?',
   'Four people need to cross a narrow bridge at night with one torch. Their crossing times are 1, 2, 7 and 10 minutes. At most two can cross together, travelling at the slower person’s speed, and the torch must accompany every crossing. Can they all get across in 17 minutes?',
   'A rope takes exactly one hour to burn from end to end, but burns unevenly, so half its length need not mean half an hour. You have two such ropes and a lighter. How can you measure exactly 45 minutes?',
   'There are 100 closed lockers in a row. On pass one you toggle every locker; on pass two, every second locker; on pass three, every third, continuing through pass 100. Which lockers finish open, and what do those locker numbers have in common?',
   'Two players take turns removing one, two or three stones from a pile of 21. Whoever takes the last stone wins. You move first. What first move guarantees a win if you keep playing correctly, and what pattern do you maintain?'
  ];
  // If today's coin puzzle was consumed by another slot, prefer a different puzzle entirely.
  const candidate=alternatives.find(title=>!repeatedDailyContent({title},items));
  if(candidate)return {title:candidate,sources:[],publishedDate:null};
 }
 return null;
}
