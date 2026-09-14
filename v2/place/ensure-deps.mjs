import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
try{require.resolve('web-push');}catch{execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{stdio:'inherit'});}
