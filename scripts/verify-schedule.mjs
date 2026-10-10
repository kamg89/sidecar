import {readFile,writeFile} from 'node:fs/promises';
import {config} from '../public/config.js';
const secrets=JSON.parse(await readFile('.private/deployment-secrets.json','utf8'));
async function call(action,payload={}){const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-classroom-key':secrets.instructor_key},body:JSON.stringify({action,...payload})});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
let id;
try{
  const d=await call('create',{title:'Verification — scheduled debrief',instructions:'Reflect on the tutoring experience.',focus:'Find misconceptions and missing reasoning',prompt:'Create one short evidence-based discussion slide.',slideCount:1,groups:1});id=d.session.id;
  await call('save_block',{id:d.blocks[0].id,revision:0,content:'The tutor gave us all four paragraphs and questions at once. We learned more after asking it to wait for our answer and check our understanding before moving on.'});
  await call('settings',{sessionId:id,status:'live',minutes:5,auto:true});
  console.log('Waiting for the actual two-minute server schedule; no manual AI request will be made.');
  const deadline=Date.now()+210000;let generated=false;
  while(Date.now()<deadline){await new Promise(r=>setTimeout(r,10000));const fresh=await call('get',{sessionId:id});if(fresh.session.ai_error)throw new Error(fresh.session.ai_error);if(fresh.session.debrief){generated=true;await writeFile('.private/schedule-verification.json',JSON.stringify({status:'passed',generated_at:fresh.session.debrief_at,checked_at:new Date().toISOString()},null,2),{mode:0o600});console.log('PASS automatic server-generated debrief without an instructor browser');break;}}
  if(!generated)throw new Error('The scheduled debrief did not arrive within 210 seconds.');
}finally{if(id){await call('delete_session',{sessionId:id});console.log('Scheduled-test activity removed.');}}
