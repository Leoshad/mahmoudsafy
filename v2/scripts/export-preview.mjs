import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Export the built React interface for offline review, without hosting or credentials.
const destination=process.argv[2];
if(!destination)throw Error('Provide an output HTML path. Run npm run build first.');
let html=await readFile('dist/index.html','utf8');
const js=html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
const css=html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if(!js||!css)throw Error('Expected a single built script and stylesheet.');
const code=await readFile(resolve('dist',js[1].replace(/^\//,'')),'utf8');
const style=(await readFile(resolve('dist',css[1].replace(/^\//,'')),'utf8')).replace(/@import[^;]+;/g,'');
html=html.replace(js[0],()=>'<script type="module">'+code.replace(/<\/script/gi,'<\\/script')+'</script>');
html=html.replace(css[0],()=>'<style>'+style+'</style>');
html=html.replace(/<link[^>]*rel="icon"[^>]*>/,'');
html=html.replace('<head>','<head><meta name="referrer" content="no-referrer">');
await writeFile(destination,html);
console.log('Offline design preview exported:',destination);
