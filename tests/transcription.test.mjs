import test from 'node:test';
import assert from 'node:assert/strict';
import {readAudio,transcribeAudio,MAX_AUDIO_BYTES,TRANSCRIPTION_MODEL} from '../supabase/functions/classroom/transcription.js';
import {hash} from '../supabase/functions/classroom/core.js';

test('audio uploads are bounded without trusting Content-Length and accept browser recording types',async()=>{
  for(const type of ['audio/webm;codecs=opus','audio/mp4']){const file=await readAudio(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':type},body:new Uint8Array(150)}));assert.equal(file.size,150);}
  for(const [type,size,status] of [['text/html',150,415],['audio/webm',0,400],['audio/webm',MAX_AUDIO_BYTES+1,413]])await assert.rejects(()=>readAudio(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':type},body:new Uint8Array(size)})),e=>e.status===status);
});

test('transcription uses a fixed audio model and multipart data; failures do not expose provider secrets',async()=>{
  const file=new File([new Uint8Array(150)],'speech.webm',{type:'audio/webm'});
  const result=await transcribeAudio(file,'private-test',async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.body.get('model'),TRANSCRIPTION_MODEL);assert.equal(options.body.get('file').size,150);assert.equal(options.body.get('response_format'),'json');assert.equal(options.headers.Authorization,'Bearer private-test');return Response.json({text:'Create two comparison slides.'});});
  assert.equal(result.text,'Create two comparison slides.');assert.equal(result.model,TRANSCRIPTION_MODEL);
  for(const response of [Response.json({error:'private-test'},{status:401}),Response.json({text:''}),new Response('bad json')])await assert.rejects(()=>transcribeAudio(file,'private-test',async()=>response),e=>e.status===502&&!e.message.includes('private-test'));
});

test('only workspace instructors can transcribe, with a separate rate limit and no audio storage',async()=>{
  const owner='owner',sandbox='w_'+'a'.repeat(64),tester='t_'+'b'.repeat(64);let handler,allow=true,calls=0,buckets=[];
  const secrets={INSTRUCTOR_KEY_SHA256:await hash(owner),TEST_INSTRUCTOR_TOKEN:sandbox,TEST_INSTRUCTOR_EXPIRES_AT:new Date(Date.now()+60000).toISOString(),OPENAI_API_KEY:'server-only'};
  globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'service'})[name]},serve:fn=>handler=fn};
  globalThis.fetch=async(url,options={})=>{
    if(url.includes('rpc/classroom_server_config'))return Response.json(secrets);
    if(url.includes('tester_key_hash='))return Response.json([{id:'test',is_test:true,tester_expires_at:secrets.TEST_INSTRUCTOR_EXPIRES_AT}]);
    if(url.includes('rpc/classroom_instructor_login_limit')){buckets.push(JSON.parse(options.body).p_bucket);return Response.json(allow);}
    if(url==='https://api.openai.com/v1/audio/transcriptions'){calls++;return Response.json({text:'Compare value creation and capture.'});}
    throw new Error('Unexpected request or storage write: '+url);
  };
  await import('../supabase/functions/classroom/index.ts?transcription');
  const call=(key,size=150)=>handler(new Request('https://test.invalid?action=transcribe_description',{method:'POST',headers:{'Content-Type':'audio/webm','x-classroom-key':key},body:new Uint8Array(size)}));
  for(const key of ['', 'c'.repeat(64),tester])assert([401,403].includes((await call(key)).status));assert.equal(calls,0);
  for(const key of [owner,sandbox]){const r=await call(key);assert.equal(r.status,200);assert(!(await r.text()).includes('server-only'));}assert.equal(calls,2);assert.notEqual(buckets[0],buckets[1]);
  assert.equal((await call(owner,MAX_AUDIO_BYTES+1)).status,413);assert.equal(calls,2);
  allow=false;assert.equal((await call(sandbox)).status,429);assert.equal(calls,2);
});
