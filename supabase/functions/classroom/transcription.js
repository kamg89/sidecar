import {HttpError} from './core.js';

export const TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe';
export const MAX_AUDIO_BYTES=2*1024*1024;
const formats={'audio/webm':'webm','video/webm':'webm','audio/mp4':'mp4','video/mp4':'mp4','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3'};

export async function readAudio(req) {
  const type=(req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!formats[type])throw new HttpError(415,'This recording format is unsupported. Try another browser or type your description.');
  if(Number(req.headers.get('content-length'))>MAX_AUDIO_BYTES)throw new HttpError(413,'Recording is too large. Keep your explanation under 90 seconds.');
  const reader=req.body?.getReader();
  if(!reader)throw new HttpError(400,'No recording received. Please try again.');
  const chunks=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_AUDIO_BYTES){await reader.cancel();throw new HttpError(413,'Recording is too large. Keep your explanation under 90 seconds.');}chunks.push(value);}
  } finally {reader.releaseLock();}
  if(size<100)throw new HttpError(400,'The recording was empty or too short. Please try again.');
  return new File(chunks,'description.'+formats[type],{type});
}

export async function transcribeAudio(file,key,fetcher=fetch) {
  if(!key)throw new HttpError(503,'Ask the owner to connect an API key in AI settings. You can still type your description.');
  const body=new FormData();body.append('file',file);body.append('model',TRANSCRIPTION_MODEL);body.append('response_format','json');
  let response;
  try {response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body,signal:AbortSignal.timeout(55000)});}
  catch {throw new HttpError(502,'Transcription could not finish. Retry the recording or type your description.');}
  if(!response.ok)throw new HttpError(502,response.status===429?'OpenAI is at its rate or usage limit. Try again shortly, or type your description.':'The recording could not be transcribed. Retry or type your description; your existing text is kept.');
  const data=await response.json().catch(()=>null);
  if(typeof data?.text!=='string'||!data.text.trim())throw new HttpError(502,'No speech was recognized. Speak closer to the microphone and try again.');
  if(data.text.length>12000)throw new HttpError(502,'The transcript is too long. Record a shorter explanation.');
  return {text:data.text.trim(),model:TRANSCRIPTION_MODEL};
}
