import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {activityModel,responseBudget} from '../supabase/functions/classroom/access.js';
import {generateTemplate} from '../supabase/functions/classroom/template.js';
import {modelName,modelOptions,activityStatus} from '../public/model-choice.js';
import {publicSession} from '../supabase/functions/classroom/core.js';

test('activity choices preserve exact model identities and omit incompatible endpoints',()=>{
  for(const id of ['gpt-5.6-luna','gpt-5.6-terra','gpt-6-astra','gpt-4.1-mini'])assert.equal(activityModel(id),id);
  assert.equal(activityModel('', 'gpt-5.6-terra'),'gpt-5.6-terra');
  for(const id of ['gpt-5-pro','gpt-5.6-luna-realtime','other/model','gpt-6-codex','gpt-5.6-luna-2026-01-01'])assert.throws(()=>activityModel(id));
  assert.equal(publicSession({id:'s',ai_model:'gpt-5.6-luna'}).ai_model,undefined);
});

test('Luna and Terra requests use the selected model with a bounded reasoning allowance',async()=>{
  assert.deepEqual(responseBudget('gpt-4.1-mini',4500),{max_output_tokens:4500});
  for(const model of ['gpt-5.6-luna','gpt-5.6-terra']){
    let request;
    const result=await generateTemplate({description:'Compare two sports clubs.'},'fake-secret',model,async(url,options)=>{request=JSON.parse(options.body);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({title:'Sports',instructions:'Compare clubs.',debrief_prompt:'Use student evidence.',slides:[{title:'Compare',prompts:['Who benefits?','Who receives revenue?']}]})}]}]})};});
    assert.equal(request.model,model);assert.equal(request.reasoning.effort,'low');assert.equal(request.max_output_tokens,8500);assert.equal(result.model,model);
  }
});

test('friendly dropdown labels distinguish versions and preserve the saved selection',()=>{
  assert.equal(modelName('gpt-5.6-luna'),'Luna · GPT-5.6');assert.equal(modelName('gpt-6-luna'),'Luna · GPT-6');
  const {document}=parseHTML('<select>'+modelOptions(['gpt-5.6-terra','gpt-5.6-luna','gpt-4.1-mini'],'gpt-5.6-terra','gpt-4.1-mini')+'</select>');
  assert.equal(document.querySelector('[selected]').getAttribute('value'),'gpt-5.6-terra');assert(document.querySelector('option').textContent.includes('workspace default'));
  assert.equal(activityStatus({status:'draft'}),'Ready to start');assert.equal(activityStatus({status:'live',ends_at:'2020-01-01'}),'Time ended');
});
