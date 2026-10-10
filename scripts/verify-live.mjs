// Live integration test. Creates and removes its own disposable activity.
// Requires .private/deployment-secrets.json; never prints credentials.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { config } from '../public/config.js';
const secrets=JSON.parse(await readFile('.private/deployment-secrets.json','utf8'));
async function call(action,payload={},key=secrets.instructor_key,expected=200){
  const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-classroom-key':key},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(85000)});
  const result=await r.json();assert.equal(r.status,expected,`${action}: ${JSON.stringify(result)}`);return result;
}
const pass=m=>console.log('PASS '+m);
await call('list',{},'invalid',401);pass('unauthenticated instructor access rejected');
let id;
try{
  const data=await call('create',{title:'Verification — disposable test',instructions:'Explain value creation and value capture using a sports example.',focus:'Compare ideas and surface productive disagreements',prompt:'Identify agreement, disagreement, and one question. Cite the group slides.',slideCount:2,groups:2,labels:['Value creation','Value capture','A question']});
  id=data.session.id;const [g1,g2]=data.groups;const b1=data.blocks.find(b=>b.slide_id===data.slides.find(s=>s.group_id===g1.id).id);const b2=data.blocks.find(b=>b.slide_id===data.slides.find(s=>s.group_id===g2.id).id);
  await call('save_block',{id:b1.id,revision:0,content:'Test'},g1.join_token,403);pass('editing blocked until instructor starts');
  await call('settings',{sessionId:id,status:'live',minutes:8,auto:false});
  await call('save_block',{id:b1.id,revision:0,content:'A basketball coach creates value by helping players improve. The coach captures payment for the lesson.'},g1.join_token);
  await call('save_block',{id:b2.id,revision:0,content:'A free soccer program creates skills and friendships. The club may benefit from a stronger future talent pool.'},g2.join_token);
  pass('two group clients save independent slides');
  await call('save_block',{id:b2.id,revision:1,content:'Unauthorized'},g1.join_token,403);pass('cross-group write rejected');
  await call('save_block',{id:b1.id,revision:0,content:'Stale draft'},g1.join_token,409);pass('concurrent stale edit rejected without data loss');
  const own=await call('get',{sessionId:id},g1.join_token);assert.equal(own.groups.length,1);assert(own.slides.every(s=>s.group_id===g1.id));assert(!('debrief' in own.session));assert(!('debrief_prompt' in own.session));assert(!JSON.stringify(own).includes(g2.join_token));pass('student receives only own group and no private prompt');
  await call('debrief',{sessionId:id},g1.join_token,401);await call('settings',{sessionId:id,auto:true},g1.join_token,401);pass('student cannot invoke AI or change activity settings');
  const added=await call('add_slide',{groupId:g1.id},g1.join_token);await call('delete_slide',{id:added.id},g1.join_token);pass('slide add and delete');
  const generated=await call('debrief',{sessionId:id,force:true});assert(generated.generated,JSON.stringify(generated));const after=await call('get',{sessionId:id});assert.equal(after.session.debrief.slides.length,2);assert(after.session.debrief.slides.every(s=>s.sources.every(id=>data.slides.some(x=>x.id===id))));pass('real OpenAI structured debrief generated and saved with valid references');
  const afterStudent=await call('get',{},g1.join_token);assert(!('debrief' in afterStudent.session));pass('generated debrief remains inaccessible to student');
  const unchanged=await call('debrief',{sessionId:id,force:false});assert.match(unchanged.skipped,/No new/);pass('unchanged work skips an AI call');
  const history=await call('history',{sessionId:id});assert.equal(history.history.length,1);pass('debrief history saved');
  await call('rotate_group',{id:g1.id});await call('get',{},g1.join_token,401);pass('replaced group link revoked');
  await call('settings',{sessionId:id,status:'ended'});await call('save_block',{id:b2.id,revision:1,content:'After end'},g2.join_token,403);pass('ending an activity closes student editing');
  await writeFile('.private/verification.json',JSON.stringify({time:new Date().toISOString(),status:'passed',debrief:after.session.debrief},null,2),{mode:0o600});
}finally{if(id){await call('delete_session',{sessionId:id});pass('disposable test activity removed');}}
