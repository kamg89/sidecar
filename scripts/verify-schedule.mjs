import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {config} from '../public/config.js';
const secrets=JSON.parse(await readFile('.private/deployment-secrets.json','utf8'));
async function call(action,payload={}){const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-classroom-key':secrets.instructor_key},body:JSON.stringify({action,...payload})});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
let id;
try{
  const d=await call('create',{title:'Verification — scheduled debrief',instructions:'Reflect on the tutoring experience.',focus:'Find misconceptions and missing reasoning',prompt:'Create one short evidence-based discussion slide.',slideCount:1,groups:1});id=d.session.id;
  await call('save_block',{id:d.blocks[0].id,revision:0,content:'The tutor gave us all four paragraphs and questions at once. We learned more after asking it to wait for our answer and check our understanding before moving on.'});
  await call('settings',{sessionId:id,status:'live',minutes:5,auto:true});
  console.log('Waiting for the actual one-minute server schedule; no manual AI request will be made.');
  async function waitForDraft(previous){
    const deadline=Date.now()+180000;
    while(Date.now()<deadline){await new Promise(r=>setTimeout(r,5000));const fresh=await call('get',{sessionId:id});if(fresh.session.ai_error)throw new Error(fresh.session.ai_error);if(fresh.session.debrief && fresh.session.debrief_at!==previous)return fresh;}
    throw new Error('The scheduled debrief did not arrive within 180 seconds.');
  }
  const first=await waitForDraft(null);
  console.log('PASS first automatic server-generated debrief without an instructor browser');
  const block=first.blocks.find(b=>b.id===d.blocks[0].id);
  await call('save_block',{id:block.id,revision:block.revision,contributor:'Schedule test',content:'After trying both approaches, we learned that answering first exposed a misconception: we confused value creation with immediate revenue. The tutor helped when it asked us to explain who benefited and who retained a return.'});
  const second=await waitForDraft(first.session.debrief_at);
  const intervalSeconds=(Date.parse(second.session.last_attempt_at)-Date.parse(first.session.last_attempt_at))/1000;
  assert(intervalSeconds>=50 && intervalSeconds<=90,`Expected consecutive minute ticks, got ${intervalSeconds} seconds.`);
  assert.notDeepEqual(second.session.debrief,first.session.debrief);
  await writeFile('.private/schedule-verification.json',JSON.stringify({status:'passed',first_generated_at:first.session.debrief_at,second_generated_at:second.session.debrief_at,interval_seconds:intervalSeconds,checked_at:new Date().toISOString()},null,2),{mode:0o600});
  console.log(`PASS changed work regenerated on the next scheduled tick (${intervalSeconds.toFixed(1)} seconds between starts)`);
}finally{if(id){await call('delete_session',{sessionId:id});console.log('Scheduled-test activity removed.');}}
