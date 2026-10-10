import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {config} from '../public/config.js';
import {randomBytes} from 'node:crypto';
const {instructor_key}=JSON.parse(await readFile('.private/deployment-secrets.json','utf8'));
async function call(action,payload={},key=instructor_key,status=200){const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-classroom-key':key},body:JSON.stringify({action,...payload})});const d=await r.json();assert.equal(r.status,status,`${action}: ${d.error||'unexpected status'}`);return d;}
const ids=[];let originalModel,changed=false;
try{
 const settings=await call('admin_status');originalModel=settings.model;assert.equal(settings.configured,true);assert.deepEqual(Object.keys(settings).sort(),['configured','model']);
 const models=await call('admin_models');assert(models.models.includes(originalModel));
 await call('admin_save',{model:originalModel,apiKey:'invalid'},instructor_key,400);assert.equal((await call('admin_status')).model,originalModel);
 await call('admin_save',{model:'gpt-nonexistent-testing-model'},instructor_key,400);assert.equal((await call('admin_status')).model,originalModel);console.log('PASS admin model listing; rejected settings preserve the saved configuration; API never returns the secret');
 const base={title:'Verification — class entry',instructions:'Discuss how AI helped or hindered learning.',focus:'Compare evidence',prompt:'Summarize the actual examples.',groups:2,slideCount:1};
 const group=await call('create',base);ids.push(group.session.id);const individual=await call('create',{...base,workMode:'individual'});ids.push(individual.session.id);
 const info=await call('lookup_class',{code:group.session.class_code},'');assert.equal(info.groups.length,2);assert(!JSON.stringify(info).includes('join_token'));assert(!('debrief' in info));
 const join=await call('join_class',{code:group.session.class_code,groupId:group.groups[0].id},'');assert.equal(join.token,group.groups[0].join_token);
 await call('join_class',{code:group.session.class_code,groupId:individual.groups[0].id},'',403);
 for(const action of ['admin_status','admin_models','admin_save']){await call(action,{model:originalModel},join.token,401);await call(action,{model:originalModel},'',401);}
 await call('join_settings',{sessionId:group.session.id,enabled:false});await call('lookup_class',{code:group.session.class_code},'',404);await call('get',{},join.token);await call('join_settings',{sessionId:group.session.id,enabled:true,rotate:true});await call('lookup_class',{code:group.session.class_code},'',404);console.log('PASS class code entry, group isolation, closed/replaced codes, and student/admin boundary');
 const code=individual.session.class_code,resumeA=randomBytes(32).toString('hex'),resumeB=randomBytes(32).toString('hex');
 const roster=await call('lookup_class',{code},'');assert.deepEqual(roster.groups,[]);assert.equal(roster.mode,'individual');
 const [a,b]=await Promise.all([call('join_class',{code,name:'Alex (test)',resumeToken:resumeA},''),call('join_class',{code,name:'Sam (test)',resumeToken:resumeB},'')]);assert.notEqual(a.groupId,b.groupId);
 const again=await call('join_class',{code,name:'Same student',resumeToken:resumeA},'');assert.equal(again.token,a.token);
 await call('join_class',{code,name:'Third (test)',resumeToken:randomBytes(32).toString('hex')},'',409);
 const own=await call('get',{},a.token),other=await call('get',{},b.token);assert.equal(own.groups.length,1);assert.equal(own.groups[0].name,'Alex (test)');assert(own.blocks.every(x=>x.contributor==='Alex (test)'));assert(!JSON.stringify(own).includes('claimant_hash'));
 await call('settings',{sessionId:individual.session.id,status:'live',minutes:5,auto:false});
 await call('save_block',{id:other.blocks[0].id,revision:0,content:'Cross-student edit'},a.token,403);
 await call('save_block',{id:own.blocks[0].id,revision:0,content:'The tutor waited for my attempt. Explaining my own sports example helped me notice that value creation can happen before a business earns revenue.'},a.token);
 console.log('PASS concurrent individual joins allocate separate decks; same-browser return is stable; other individual work stays inaccessible');
 const testActivity=await call('create',{...base,groups:1,testMode:true});ids.push(testActivity.session.id);const invite=await call('tester_access',{sessionId:testActivity.session.id});await call('admin_status',{},invite.token,403);await call('admin_save',{model:originalModel},invite.token,403);
 const alternate=models.models.includes('gpt-4o-mini')&&originalModel!=='gpt-4o-mini'?'gpt-4o-mini':originalModel;
 await call('admin_save',{model:alternate});changed=true;assert.equal((await call('admin_status')).model,alternate);
 await call('debrief',{sessionId:individual.session.id,force:true});const debrief=(await call('get',{sessionId:individual.session.id})).session.debrief;assert.equal(debrief.model,alternate);assert.equal(debrief.groups_with_content,1);assert.equal(debrief.total_workspaces,2);assert(debrief.slides[0].sources.includes(own.slides[0].id));assert(debrief.slides[0].examples.some(x=>x.contributor==='Alex (test)'));
 console.log('PASS real model change, structured AI synthesis of individual work, saved contributor attribution and coverage');
 await writeFile('.private/admin-join-verification.json',JSON.stringify({checked_at:new Date().toISOString(),status:'passed',tested_model:alternate,original_model:originalModel},null,2),{mode:0o600});
}finally{if(changed){await call('admin_save',{model:originalModel});console.log('Original model restored.');}for(const id of ids)await call('delete_session',{sessionId:id});console.log('Disposable activities removed.');}
