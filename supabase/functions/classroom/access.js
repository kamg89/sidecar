import {HttpError,text} from './core.js';
export function classCode(value){const code=text(value,30).replace(/[\s-]/g,'').toUpperCase();if(!/^[A-F0-9]{12}$/.test(code))throw new HttpError(400,'Enter the 12-character class code your instructor shared.');return code;}
export function newClassCode(){return [...crypto.getRandomValues(new Uint8Array(6))].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();}
export function modelId(value){const model=text(value,100);if(!/^gpt-[A-Za-z0-9._-]+$/.test(model)||/audio|realtime|transcrib|tts|image|search|codex|research|chat-latest|instruct/.test(model))throw new HttpError(400,'Choose a text model for structured classroom debriefs.');return model;}
export function apiKey(value){const key=text(value,512).trim();if(!/^sk-[A-Za-z0-9_-]{17,}$/.test(key))throw new HttpError(400,'Enter a valid OpenAI API key, or leave it blank to keep the saved key.');return key;}
export function candidateModels(ids){return [...new Set(ids)].filter(id=>{try{modelId(id);return /^gpt-(?:4\.1|4o|5|6)(?:[-.]|$)/.test(id)&&!/-\d{4}-\d{2}-\d{2}$/.test(id);}catch{return false;}}).sort((a,b)=>a.localeCompare(b));}
export function outputText(response){return (response.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');}
export async function validateAIConnection(key,model,fetcher=fetch){
 const r=await fetcher('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(55000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_output_tokens:1500,instructions:'Return exactly {"ok":true}. This is a connection check, not a classroom task.',input:'Check the connection.',text:{format:{type:'json_schema',name:'connection_check',strict:true,schema:{type:'object',additionalProperties:false,properties:{ok:{type:'boolean'}},required:['ok']}}}})});
 if(!r.ok)throw new HttpError(400,r.status===401?'OpenAI rejected this key. The saved settings were not changed.':r.status===429?'OpenAI quota or rate limit reached. Check billing; the saved settings were not changed.':'This model/key could not produce a structured response. Choose another model; the saved settings were not changed.');
 const response=await r.json();let output;try{output=JSON.parse(outputText(response));}catch{}
 if(response.status!=='completed'||output?.ok!==true)throw new HttpError(400,'The connection check did not finish. The saved settings were not changed.');
}
