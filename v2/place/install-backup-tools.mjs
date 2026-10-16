import {mkdir,mkdtemp,writeFile,readFile,chmod,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const destination=join(dirname(fileURLToPath(import.meta.url)),'backup-bin');
const specs=[{name:'restic',url:'https://github.com/restic/restic/releases/download/v0.19.1/restic_0.19.1_linux_amd64.bz2',archive:'f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c',binary:'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639'}, {name:'rclone',url:'https://downloads.rclone.org/v1.73.0/rclone-v1.73.0-linux-amd64.zip',archive:'2a69bf23b6e937b03f4b6f71e97154543d81610b2e5d209e9a2b96b1f9c2d803',binary:'744af2c0a9a38706c0f6e049ff1854a7d5ea3369fe10f6bec4477d873c9cf81e'}];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.platform!=='linux'||process.arch!=='x64')throw Error('Backup tools require Linux x64.');
await mkdir(destination,{recursive:true});
for(const spec of specs){
 const target=join(destination,spec.name);
 try{if(hash(await readFile(target))===spec.binary)continue;}catch{}
 const work=await mkdtemp(join(destination,'.install-'));
 try{
  const response=await fetch(spec.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Backup tool download failed.');
  const bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==spec.archive)throw Error('Backup tool archive checksum mismatch.');
  const archive=join(work,'archive');await writeFile(archive,bytes);
  const binary=spec.name==='restic'?execFileSync('bzip2',['-dc',archive],{maxBuffer:128*1024*1024}):execFileSync('unzip',['-p',archive,'rclone-v1.73.0-linux-amd64/rclone'],{maxBuffer:128*1024*1024});
  if(hash(binary)!==spec.binary)throw Error('Backup tool binary checksum mismatch.');
  const temp=join(work,spec.name);await writeFile(temp,binary);await chmod(temp,0o755);await rename(temp,target);
 }finally{await rm(work,{recursive:true,force:true});}
}
