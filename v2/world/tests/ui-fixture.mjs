// Disposable UI verification only. No real credentials, provider, users or data.
// This entry point is NEVER a deployment target.
import express from 'express';
import { readFileSync } from 'node:fs';
import { Store } from '../store.mjs';
import { createEngine } from '../engine.mjs';
import { publicState } from '../domain.mjs';
const store=new Store(':memory:'),run=createEngine(store,null),app=express();
app.use(express.json());
app.get('/api/state',(req,res)=>res.json(publicState(store.read(),'Mahmoud',false)));
app.post('/api/command',async(req,res)=>{try{res.json(await run('Mahmoud',req.body));}catch(e){res.status(e.status??400).json({error:e.message});}});
app.get('/',(req,res)=>res.type('html').send(readFileSync(new URL('../public/index.html',import.meta.url),'utf8').replace('OUR WORLD','LOCAL UI TEST · NO LIVE AI')));
app.use(express.static(new URL('../public',import.meta.url).pathname));
app.listen(4174,'0.0.0.0',()=>console.log('Disposable UI fixture on 4174; no real AI or credentials.'));
