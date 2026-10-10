import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../supabase/functions/classroom/core.js';

test('only workspace instructors can generate templates; throttling and preview do not create activities',async()=>{
  const owner='test-owner',sandbox='w_'+'a'.repeat(64),tester='t_'+'b'.repeat(64);
  const secrets={INSTRUCTOR_KEY_SHA256:await hash(owner),TEST_INSTRUCTOR_TOKEN:sandbox,TEST_INSTRUCTOR_EXPIRES_AT:new Date(Date.now()+60000).toISOString(),OPENAI_API_KEY:'server-only',OPENAI_MODEL:'gpt-4.1-mini'};
  let handler,allow=true,aiCalls=0;const writes=[];
  globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://database.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-service'})[name]},serve:fn=>handler=fn};
  globalThis.fetch=async(url,options={})=>{
    if(url==='https://api.openai.com/v1/responses'){aiCalls++;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({title:'A project',instructions:'Compare your evidence.',debrief_prompt:'Use student work.',slides:[{title:'Our thinking',prompts:['What is your claim?','What is your evidence?']}]})}]}]});}
    if(url.includes('rpc/classroom_server_config'))return Response.json(secrets);
    if(url.includes('rpc/classroom_instructor_login_limit')){writes.push({url,body:JSON.parse(options.body)});return Response.json(allow);}
    if(url.includes('tester_key_hash='))return Response.json([{id:'test',is_test:true,tester_expires_at:secrets.TEST_INSTRUCTOR_EXPIRES_AT}]);
    throw new Error('Unexpected database call: '+url);
  };
  await import('../supabase/functions/classroom/index.ts');
  const call=key=>handler(new Request('https://function.invalid',{method:'POST',headers:{'Content-Type':'application/json','x-classroom-key':key},body:JSON.stringify({action:'generate_template',description:'Analyze the causes of a historical event with source evidence.'})}));
  for(const key of ['', 'c'.repeat(64), tester])assert([401,403].includes((await call(key)).status));
  assert.equal(aiCalls,0);
  for(const key of [owner,sandbox]){const response=await call(key);assert.equal(response.status,200);assert.equal((await response.json()).template.slides.length,1);}
  assert.equal(aiCalls,2);assert.equal(writes.length,2);assert.notEqual(writes[0].body.p_bucket,writes[1].body.p_bucket);
  allow=false;assert.equal((await call(sandbox)).status,429);assert.equal(aiCalls,2);
  assert(writes.every(w=>w.url.includes('rpc/classroom_instructor_login_limit')));
});
