import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
try{for(const name of ['sharp','web-push','puppeteer-core','@sparticuz/chromium','@fontsource/noto-sans-arabic/400.css','@fontsource/noto-emoji/400.css'])require.resolve(name);}catch{execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{stdio:'inherit'});}
