// Language is an explicit request, never inferred from the alphabet of a message.
export function echoLanguage(prompt='') {
 const s=String(prompt).normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/[ً-ْ]/g,'').toLowerCase();
 if(/(?:don't|do not|never|stop)\s+(?:\w+\s+){0,3}(?:arabic)|(?:مش|متردش|ماتردش|لا ترد|ممنوع).{0,18}(?:عربي|بالعربي)/u.test(s))return 'English';
 return /(?:reply|respond|answer|speak|write|explain|translate|say|tell me)\b.{0,45}\b(?:arabic|egyptian arabic)\b|\b(?:in arabic|arabic please|bel ?3arabi|bel ?araby)\b|(?:رد|جاوب|اتكلم|تكلم|قول|قولي|اشرح|اكتب|ترجم).{0,35}(?:بالعربي|للعربي|باللغة العربية|بالمصري)|^(?:بالعربي|بالمصري)(?:\s|$)/u.test(s)?'Arabic':'English';
}
export const nameInstruction="Safy's Arabic name is صافي, never صفي. Preserve the Latin names Mahmoud and Safy when writing English.";
export function correctSafy(value){return typeof value==='string'?value.replace(/(^|[^\p{L}\p{M}])صفي(?=$|[^\p{L}\p{M}])/gu,'$1صافي'):Array.isArray(value)?value.map(correctSafy):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,correctSafy(v)])):value;}
