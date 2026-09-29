import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const tests=readdirSync(new URL('../tests/',import.meta.url)).filter(n=>n.endsWith('browser-check.mjs')).sort();
let failed=0;
for(const name of tests){const result=spawnSync(process.execPath,[new URL('../tests/'+name,import.meta.url).pathname],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,env:process.env});if(result.status!==0){failed++;console.error('FAIL '+name+'\n'+(result.stderr||result.error?.message||'')+'\n'+(result.stdout||'').slice(-5000));}else console.log('PASS '+name);}
console.log(`${tests.length-failed}/${tests.length} browser checks passed`);process.exitCode=failed?1:0;
