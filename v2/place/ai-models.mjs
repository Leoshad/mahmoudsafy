// Standard USD per million tokens. Keep existing budget caps unchanged.
export const STRONG_MODEL='gpt-6-sol';
export const LIGHT_MODEL='gpt-5.6-luna';
export function modelFor(purpose){return ['draw','activity'].includes(purpose)?LIGHT_MODEL:STRONG_MODEL;}
export function ratesFor(model){if(model===STRONG_MODEL)return {input:2,output:10};if(model===LIGHT_MODEL)return {input:.2,output:1.2};throw Error('Unknown Echo model');}

// Read-only availability check: no generated content, no user data, no API token charge.
export async function verifyEchoModels({fetcher=fetch,log=console.info}={}){
 if(!process.env.OPENAI_API_KEY)return;
 for(const model of [STRONG_MODEL,LIGHT_MODEL]){
  try{const r=await fetcher('https://api.openai.com/v1/models/'+model,{headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},signal:AbortSignal.timeout(10000)});log(JSON.stringify({event:'echo_model_access',model,status:r.status,available:r.ok}));}
  catch{log(JSON.stringify({event:'echo_model_access',model,available:false,reason:'connection_failed'}));}
 }
}
