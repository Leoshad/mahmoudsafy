import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm,stat,statfs} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {check} from './domain.mjs';
import {planMemoryBatches} from './memory-batch-plan.mjs';

// Ephemeral files live in private temporary directories. No application data is modified.
export function createMemoryExportJobs({store,renderer,origin,retentionMs=30*60*1000}){
 const jobs=new Map();let active=false;
 async function dispose(j){clearTimeout(j.timer);j.controller.abort();jobs.delete(j.id);if(j.dir)await rm(j.dir,{recursive:true,force:true});}
 function find(id,who,sid){const j=jobs.get(id);check(j&&j.who===who&&j.sid===sid,'Export is unavailable or expired. Start a new export.',404);return j;}
 function arm(j){clearTimeout(j.timer);j.timer=setTimeout(()=>void dispose(j),retentionMs);j.timer.unref();}
 function view(j){return {id:j.id,state:j.state,done:j.done,total:j.total,error:j.error||null};}
 async function run(j,data,batches){
  try{j.dir=await mkdtemp(join(tmpdir(),'our-place-memories-'));j.total=batches.length;
   for(let i=0;i<batches.length;i++){
    j.controller.signal.throwIfAborted();const part=batches[i];const pdf=await renderer(part,store,{origin,signal:j.controller.signal});
    check(Buffer.isBuffer(pdf)&&pdf.subarray(0,5).toString()==='%PDF-','The PDF could not be prepared.',500);
    const disk=await statfs(j.dir);check(Number(disk.bavail)*Number(disk.bsize)>pdf.length+128*1024*1024,'Not enough temporary storage to prepare this export. Please try a smaller date range.',507);j.totalBytes+=pdf.length;
    await writeFile(join(j.dir,`${i+1}.pdf`),pdf,{mode:0o600,flag:'wx'});j.done=i+1;arm(j);
   }j.state='ready';
  }catch(e){j.state='failed';j.error=e?.status&&(e.status<500||e.status===507)?e.message:'The export could not be prepared. Please try again.';if(j.dir){await rm(j.dir,{recursive:true,force:true});j.dir=null;}}
  finally{active=false;arm(j);}
 }
 function start(data,who,sid){check(!active,'Another memory export is running. Please wait.',429);const batches=planMemoryBatches(data);check(batches.length<=10000,'This archive requires more than 10,000 parts. Select a date range.',413);const id=randomUUID(),j={id,who,sid,state:'working',done:0,total:batches.length,totalBytes:0,controller:new AbortController(),dir:null};jobs.set(id,j);active=true;arm(j);setImmediate(()=>void run(j,data,batches));return view(j);}
 async function serve(id,who,sid,part,res){const j=find(id,who,sid);check(j.state==='ready','Export is not ready.',409);check(Number.isSafeInteger(part)&&part>=1&&part<=j.total,'Part not found.',404);const file=join(j.dir,`${part}.pdf`),info=await stat(file);res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':info.size,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="Our-Place-Memories-${String(part).padStart(3,'0')}-of-${String(j.total).padStart(3,'0')}.pdf"`});createReadStream(file).on('error',()=>res.destroy()).pipe(res);}
 return {start,status:(id,who,sid)=>view(find(id,who,sid)),cancel:(id,who,sid)=>dispose(find(id,who,sid)),serve,close:()=>Promise.all([...jobs.values()].map(dispose))};
}
