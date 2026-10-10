import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {config} from '../public/config.js';
const {instructor_key}=JSON.parse(await readFile('.private/deployment-secrets.json','utf8'));
async function call(action,payload={},key=instructor_key,status=200){const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-classroom-key':key},body:JSON.stringify({action,...payload})});const d=await r.json();assert.equal(r.status,status,`${action}: ${JSON.stringify(d)}`);return d;}
const setup=testMode=>({title:'Verification — tester scope',instructions:'A test activity.',focus:'Compare ideas',prompt:'Summarize evidence.',slideCount:1,groups:1,testMode});
const ids=[];
try{
  const own=await call('create',setup(true));ids.push(own.session.id);const other=await call('create',setup(false));ids.push(other.session.id);
  const invite=await call('tester_access',{sessionId:own.session.id});const key=invite.token;
  const initial=await call('get',{},key);assert.equal(initial.session.id,own.session.id);assert(!('tester_key_hash' in initial.session));console.log('PASS scoped tester link loads only its own classroom');
  await call('list',{},key,403);await call('create',setup(true),key,403);await call('delete_session',{sessionId:own.session.id},key,403);await call('tester_access',{sessionId:own.session.id},key,403);console.log('PASS tester cannot list, create, delete, or grant owner access');
  await call('get',{sessionId:other.session.id},key,403);await call('settings',{sessionId:other.session.id,status:'live',minutes:3},key,403);await call('history',{sessionId:other.session.id},key,403);await call('debrief',{sessionId:other.session.id},key,403);
  await call('save_block',{id:other.blocks[0].id,revision:0,content:'Cross-scope'},key,403);await call('save_slide',{id:other.slides[0].id,revision:0,title:'Cross-scope'},key,403);await call('add_slide',{groupId:other.groups[0].id},key,403);await call('rotate_group',{id:other.groups[0].id},key,403);console.log('PASS cross-activity reads, writes, group links and AI requests rejected');
  await call('settings',{sessionId:own.session.id,status:'live',minutes:3,auto:false},key);
  await call('save_block',{id:own.blocks[0].id,revision:0,contributor:'Alex (test)',content:'The group prefers answering before seeing feedback.'},key);
  const ownAgain=await call('get',{},key);assert.equal(ownAgain.blocks.find(b=>b.id===own.blocks[0].id).contributor,'Alex (test)');console.log('PASS tester can start and edit its own activity');
  const group=await call('get',{},own.groups[0].join_token);assert(!('tester_key_hash' in group.session));assert(!('debrief' in group.session));
  await call('tester_access',{sessionId:own.session.id,revoke:true});await call('get',{},key,401);console.log('PASS revoked tester link immediately rejected');
}finally{for(const id of ids)await call('delete_session',{sessionId:id});console.log('Disposable permission-test activities removed.');}
