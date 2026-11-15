import {readFileSync} from 'node:fs';
// Only operational aggregates: never include messages, file names, user IDs or URLs.
export function memoryObservation(phase, read=readFileSync){
 let containerBytes=null;
 try {const n=Number(read('/sys/fs/cgroup/memory.current','utf8').trim());if(Number.isSafeInteger(n)&&n>=0)containerBytes=n;} catch {}
 return {event:'memory_pdf_resource',phase,processRssBytes:process.memoryUsage.rss(),containerBytes};
}
export function logMemoryObservation(phase){console.info(JSON.stringify(memoryObservation(phase)));}
