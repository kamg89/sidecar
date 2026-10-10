import { HttpError, text, uuid, integer, hash, token, safeEqual, style, publicSession } from './core.js';
import { schemaForCount, debriefPrompt, enrichDebrief } from './debrief.js';
import { classCode, newClassCode, modelId, apiKey, candidateModels, validateAIConnection } from './access.js';

let privateConfig = {};
let configReadAt = 0;
const env = (name) => Deno.env.get(name) || privateConfig[name] || '';
const api = env('SUPABASE_URL') + '/rest/v1/';
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
const origins = ['https://kamg89.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173'];

async function db(table, query = '', method = 'GET', body = undefined) {
  const response = await fetch(api + table + (query ? '?' + query : ''), {
    method, headers: {apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, 'Content-Type':'application/json', Prefer:'return=representation'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) { console.error('Database operation failed', table, response.status); throw new HttpError(500, 'Could not save to the database. Please retry.'); }
  return response.status === 204 ? [] : response.json();
}
async function loadConfig(force=false) {
  if (!force && Date.now()-configReadAt < 60000) return;
  privateConfig = await db('rpc/classroom_server_config','','POST',{});
  configReadAt = Date.now();
}
async function one(table, id) { const rows = await db(table, 'id=eq.' + uuid(id)); if (!rows[0]) throw new HttpError(404, 'This item no longer exists.'); return rows[0]; }
async function sessionData(id, group = null) {
  const session = await one('class_sessions', id);
  const groups = group ? [{id:group.id, name:group.name, position:group.position}] : await db('class_groups', `session_id=eq.${id}&order=position`);
  const slides = await db('class_slides', `session_id=eq.${id}${group ? '&group_id=eq.' + group.id : ''}&order=position,created_at`);
  const blocks = slides.length ? await db('slide_blocks', `slide_id=in.(${slides.map(s=>s.id).join(',')})&order=position,id`) : [];
  const {tester_key_hash, ...instructorSession} = session;
  return {session:group ? publicSession(session) : instructorSession, groups:groups.map(({token_hash,claimant_hash,...g})=>({...g,claimed:Boolean(claimant_hash)})), slides, blocks};
}
async function groupFor(auth) {
  if (!/^[a-f0-9]{64}$/.test(auth)) throw new HttpError(401, 'Open the group link provided by your instructor.');
  const rows = await db('class_groups', 'token_hash=eq.' + await hash(auth));
  if (!rows[0]) throw new HttpError(401, 'This group link is invalid or has been replaced.');
  return rows[0];
}
async function checkTesterScope(body, sessionId) {
  let target;
  if(['get','settings','debrief','history','join_settings'].includes(body.action)) target=body.sessionId||sessionId;
  else if(['save_block','delete_block'].includes(body.action)) {const b=await one('slide_blocks',body.id); target=(await one('class_slides',b.slide_id)).session_id;}
  else if(['save_slide','delete_slide'].includes(body.action)) target=(await one('class_slides',body.id)).session_id;
  else if(body.action==='add_block') target=(await one('class_slides',body.slideId)).session_id;
  else if(['add_slide','rotate_group'].includes(body.action)) target=(await one('class_groups',body.groupId||body.id)).session_id;
  else throw new HttpError(403,'This test link is limited to its own activity.');
  if(target!==sessionId) throw new HttpError(403,'This test link cannot access another activity.');
}
async function authorizeSlide(id, group) {
  const slide = await one('class_slides', id);
  if (group && group.id !== slide.group_id) throw new HttpError(403, 'You can edit only your group’s slides.');
  if (group) {
    const s = await one('class_sessions', slide.session_id);
    if (s.status !== 'live' || (s.ends_at && new Date(s.ends_at).getTime() < Date.now())) throw new HttpError(403, 'Group editing is paused. Your instructor can reopen the activity.');
  }
  return slide;
}

async function generate(sessionId, force = false) {
  await loadConfig(true);
  const data = await sessionData(sessionId);
  const s = data.session;
  if(s.is_test && (s.ai_runs >= 30 || !s.tester_expires_at || new Date(s.tester_expires_at) < new Date())) return {skipped:'This test activity has reached its AI limit or its invitation has expired.'};
  const input = data.slides.map(slide => ({slide_id:slide.id,workspace_id:slide.group_id,slide_number:data.slides.filter(x=>x.group_id===slide.group_id).findIndex(x=>x.id===slide.id)+1,group:s.work_mode==='individual'?'Individual '+((data.groups.find(g=>g.id===slide.group_id)?.position||0)+1):data.groups.find(g=>g.id===slide.group_id)?.name,title:slide.title,blocks:data.blocks.filter(b=>b.slide_id===slide.id).map(b=>({block_id:b.id,label:b.label,text:b.content,contributor:b.contributor||''}))}));
  const populated = input.filter(s=>s.blocks.some(b=>b.text.trim()));
  if (!populated.length) return {skipped:'Waiting for groups to write their first ideas.'};
  const inputHash = await hash(JSON.stringify({version:3,model:env('OPENAI_MODEL'),input,prompt:s.debrief_prompt,focus:s.focus,count:s.slide_count}));
  if (!force && inputHash === s.input_hash) return {skipped:'No new group work since the last debrief.'};
  if (JSON.stringify(input).length > 140000) throw new HttpError(413, 'There is too much text for one debrief. Use shorter group slides.');
  const now = new Date().toISOString();
  const cooldown = new Date(Date.now() - 50000).toISOString();
  const claim = await db('class_sessions', `id=eq.${sessionId}&and=(or(debrief_lock_until.is.null,debrief_lock_until.lt.${now}),or(last_attempt_at.is.null,last_attempt_at.lt.${cooldown}))`, 'PATCH', {debrief_lock_until:new Date(Date.now()+90000).toISOString(),last_attempt_at:now,ai_error:null,ai_runs:s.ai_runs+1});
  if (!claim.length) return {skipped:'An update is already running or was just requested.'};
  try {
    if (!env('OPENAI_API_KEY')) throw new HttpError(503, 'The OpenAI key has not been configured on the server.');
    const result = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', signal:AbortSignal.timeout(55000), headers:{Authorization:`Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type':'application/json'},
      body:JSON.stringify({model:env('OPENAI_MODEL') || 'gpt-4.1-mini',store:false,max_output_tokens:1000+s.slide_count*850,
        instructions:debriefPrompt(s),
        input:JSON.stringify({activity:s.title,instructions:s.instructions,group_work:input}),text:{format:{type:'json_schema',name:'classroom_debrief',strict:true,schema:schemaForCount(s.slide_count)}}})
    });
    if (!result.ok) {
      const code = result.status;
      throw new HttpError(502, code === 401 ? 'OpenAI rejected the API key. Update the server secret.' : code === 429 ? 'OpenAI quota or rate limit reached. Check your API billing and try again.' : 'OpenAI could not finish the debrief. Your group work is saved; try again.');
    }
    const response = await result.json();
    if (response.status !== 'completed') throw new HttpError(502, 'The AI response was incomplete. Please retry.');
    const raw = response.output.flatMap(x=>x.content || []).filter(x=>x.type==='output_text').map(x=>x.text).join('');
    const content = enrichDebrief(JSON.parse(raw),input);
    if (content.slides.length !== s.slide_count) throw new HttpError(502, 'The AI returned the wrong slide count. Please retry.');
    content.evidence_at = now; content.groups_with_content = new Set(populated.map(x=>x.workspace_id)).size; content.total_slides = input.length; content.total_workspaces=data.groups.length; content.model=env('OPENAI_MODEL')||'gpt-4.1-mini';
    await db('debrief_history','', 'POST', {session_id:sessionId,content,input_hash:inputHash});
    await db('class_sessions', `id=eq.${sessionId}`, 'PATCH', {debrief:content,debrief_at:new Date().toISOString(),debrief_lock_until:null,input_hash:inputHash,ai_error:null});
    return {generated:true};
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'The debrief could not finish. Your slides are saved; try again.';
    await db('class_sessions', `id=eq.${sessionId}`, 'PATCH', {ai_error:message,debrief_lock_until:null});
    throw new HttpError(502, message);
  }
}

Deno.serve(async req => {
  const origin = req.headers.get('origin');
  const cors = {'Access-Control-Allow-Origin':origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers':'content-type, x-classroom-key, apikey, authorization', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Vary':'Origin', 'Cache-Control':'no-store'};
  const reply = (data, status = 200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers:cors});
  try {
    if (origin && !origins.includes(origin)) throw new HttpError(403, 'This origin is not allowed.');
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
    await loadConfig();
    const raw = await req.text();
    if (raw.length > 45000) throw new HttpError(413, 'Request too large.');
    let body; try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid request.'); }
    const key = req.headers.get('x-classroom-key') || '';
    if (key.length > 256) throw new HttpError(401, 'Invalid access key.');
    if (body.action === 'tick') {
      if (!env('SCHEDULER_SECRET') || !safeEqual(await hash(key), await hash(env('SCHEDULER_SECRET')))) throw new HttpError(401, 'Unauthorized.');
      const now = new Date().toISOString();
      const due = new Date(Date.now()-50000).toISOString();
      const sessions = await db('class_sessions', `status=eq.live&auto_debrief=eq.true&ends_at=gt.${now}&or=(last_attempt_at.is.null,last_attempt_at.lt.${due})&order=last_attempt_at.asc.nullsfirst&limit=4`);
      const results = [];
      for (const s of sessions) { try { const result=await generate(s.id); results.push(result); if(result.skipped) await db('class_sessions',`id=eq.${s.id}`,'PATCH',{last_attempt_at:now}); } catch(e) {results.push({error:e.message});} }
      return reply({checked:sessions.length,results});
    }
    if(['lookup_class','join_class'].includes(body.action)) {
      const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
      const allowed=await db('rpc/classroom_join_limit','','POST',{p_bucket:await hash(ip+':'+Math.floor(Date.now()/60000))});
      if(!allowed)throw new HttpError(429,'Too many join attempts. Please wait one minute and retry.');
      const code=classCode(body.code);
      const activity=(await db('class_sessions','class_code=eq.'+code))[0];
      if(!activity||!activity.join_enabled||activity.status==='ended'||activity.is_test&&(!activity.tester_expires_at||new Date(activity.tester_expires_at)<new Date()))throw new HttpError(404,'This class code is unavailable. Check the code with your instructor.');
      const groups=await db('class_groups',`session_id=eq.${activity.id}&order=position`);
      if(body.action==='lookup_class')return reply({title:activity.title,mode:activity.work_mode,status:activity.status,groups:activity.work_mode==='group'?groups.map(g=>({id:g.id,name:g.name})):[],capacity:groups.length});
      if(activity.work_mode==='individual'){
        const name=text(body.name,60).trim();if(!name)throw new HttpError(400,'Enter the name you want displayed with your work.');
        if(!/^[a-f0-9]{64}$/.test(body.resumeToken||''))throw new HttpError(400,'Your browser could not create a return code. Please reload.');
        const seat=await db('rpc/classroom_claim_individual','','POST',{p_session:activity.id,p_resume_hash:await hash(body.resumeToken),p_name:name});
        if(!seat)throw new HttpError(409,'All individual places are taken, or joining has closed. Ask your instructor for your return link.');
        return reply(seat);
      }
      const group=groups.find(g=>g.id===uuid(body.groupId));if(!group)throw new HttpError(403,'Choose a group in this class.');
      return reply({token:group.join_token,groupId:group.id});
    }
    const master = Boolean(env('INSTRUCTOR_KEY_SHA256')) && safeEqual(await hash(key), env('INSTRUCTOR_KEY_SHA256'));
    let tester = null;
    if(!master && /^t_[a-f0-9]{64}$/.test(key)) {
      tester = (await db('class_sessions','tester_key_hash=eq.'+await hash(key)))[0];
      if(!tester?.is_test || !tester.tester_expires_at || new Date(tester.tester_expires_at)<new Date()) throw new HttpError(401,'This test invitation has expired or been revoked.');
    }
    const instructor = master || Boolean(tester);
    if(['list','create','tester_access','delete_session','admin_status','admin_models','admin_save'].includes(body.action) && !master) throw new HttpError(tester ? 403 : 401,'This action requires the classroom owner.');
    if(body.action==='admin_status'){await loadConfig(true);return reply({configured:Boolean(env('OPENAI_API_KEY')),model:env('OPENAI_MODEL')||'gpt-4.1-mini'});}
    if(body.action==='admin_models'){
      await loadConfig(true);const candidate=body.apiKey?apiKey(body.apiKey):env('OPENAI_API_KEY');
      if(!candidate)throw new HttpError(400,'Add an OpenAI API key first.');
      const result=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+candidate},signal:AbortSignal.timeout(15000)});
      if(!result.ok)throw new HttpError(400,'Could not load models for this key. Check the key and its permissions. Saved settings are unchanged.');
      const data=await result.json();return reply({models:candidateModels(data.data.map(m=>m.id))});
    }
    if(body.action==='admin_save'){
      await loadConfig(true);const model=modelId(body.model),replacement=body.apiKey?apiKey(body.apiKey):null;
      const candidate=replacement||env('OPENAI_API_KEY');if(!candidate)throw new HttpError(400,'Add an OpenAI API key first.');
      await validateAIConnection(candidate,model);
      await db('rpc/classroom_save_ai_config','','POST',{p_model:model,p_api_key:replacement});
      await loadConfig(true);return reply({saved:true,configured:true,model});
    }
    if(tester) await checkTesterScope(body,tester.id);
    const instructorActions = new Set(['list','create','settings','debrief','history','rotate_group','tester_access','delete_session','join_settings']);
    if (instructorActions.has(body.action) && !instructor) throw new HttpError(401,'Enter your instructor access key.');
    const group = instructor ? null : await groupFor(key);
    if (body.action === 'list') return reply({sessions:await db('class_sessions','select=id,title,status,created_at,ends_at&order=created_at.desc&limit=60')});
    if (body.action === 'create') {
      const mode=body.workMode==='individual'?'individual':'group';
      const count = integer(body.groups,1,mode==='individual'?60:20);
      const sessionId = crypto.randomUUID();
      await db('class_sessions','', 'POST', {id:sessionId,work_mode:mode,class_code:newClassCode(),is_test:Boolean(body.testMode),title:text(body.title,160).trim() || 'Untitled activity',instructions:text(body.instructions,6000),focus:text(body.focus,300),debrief_prompt:text(body.prompt,4000),slide_count:integer(body.slideCount,1,6)});
      try {
        const groups = await Promise.all(Array.from({length:count},async(_,i)=>{const join = token();return {id:crypto.randomUUID(),session_id:sessionId,name:`${mode==='individual'?'Learner':'Group'} ${i+1}`,join_token:join,token_hash:await hash(join),position:i};}));
        await db('class_groups','', 'POST',groups);
        const slides = groups.map(g=>({id:crypto.randomUUID(),session_id:sessionId,group_id:g.id,title:g.name+' · Our reflection'}));
        await db('class_slides','', 'POST',slides);
        const labels = Array.isArray(body.labels) && body.labels.length===3 ? body.labels.map(l=>text(l,160)) : ['What helped us learn?','Where did AI take over the thinking?','One change we would make'];
        await db('slide_blocks','', 'POST',slides.flatMap(s=>labels.map((label,i)=>({slide_id:s.id,label,position:i}))));
      } catch(e) { await db('class_sessions',`id=eq.${sessionId}`,'DELETE'); throw e; }
      return reply(await sessionData(sessionId));
    }
    if (body.action === 'get') return reply(await sessionData(group ? group.session_id : tester ? tester.id : uuid(body.sessionId),group));
    if (body.action === 'tester_access') {
      const session=await one('class_sessions',body.sessionId);
      if(!session.is_test)throw new HttpError(400,'Tester invitations are limited to dedicated test activities.');
      const invite='t_'+token();
      const expires=new Date(Date.now()+7*86400000).toISOString();
      await db('class_sessions',`id=eq.${session.id}`,'PATCH',{tester_key_hash:body.revoke?null:await hash(invite),tester_expires_at:body.revoke?null:expires});
      return reply(body.revoke?{revoked:true}:{token:invite,expires_at:expires});
    }
    if(body.action==='join_settings'){
      const patch={};if('enabled' in body)patch.join_enabled=Boolean(body.enabled);if(body.rotate)patch.class_code=newClassCode();
      await db('class_sessions',`id=eq.${uuid(body.sessionId)}`,'PATCH',patch);return reply({saved:true});
    }
    if (body.action === 'settings') {
      const patch = {};
      if ('title' in body) patch.title = text(body.title,160).trim() || 'Untitled activity';
      if ('instructions' in body) patch.instructions = text(body.instructions,6000);
      if ('focus' in body) patch.focus = text(body.focus,300);
      if ('prompt' in body) patch.debrief_prompt = text(body.prompt,4000);
      if ('slideCount' in body) patch.slide_count = integer(body.slideCount,1,6);
      if ('auto' in body) patch.auto_debrief = Boolean(body.auto);
      if ('status' in body) {
        if (!['draft','live','paused','ended'].includes(body.status)) throw new HttpError(400,'Invalid activity status.');
        patch.status = body.status;
        patch.ends_at = body.status === 'live' ? new Date(Date.now()+integer(body.minutes,1,tester?30:120)*60000).toISOString() : null;
      }
      await db('class_sessions',`id=eq.${uuid(body.sessionId)}`,'PATCH',patch);
      return reply({saved:true});
    }
    if (body.action === 'save_block') {
      const block = await one('slide_blocks',body.id); await authorizeSlide(block.slide_id,group);
      const patch = {revision:integer(body.revision,0,1000000)+1,updated_at:new Date().toISOString()};
      if ('content' in body) patch.content = text(body.content);
      if ('label' in body) patch.label = text(body.label,160);
      if ('contributor' in body) patch.contributor = text(body.contributor,120).trim();
      if ('style' in body) patch.style = style(body.style);
      const changed = await db('slide_blocks',`id=eq.${block.id}&revision=eq.${body.revision}`,'PATCH',patch);
      if (!changed.length) throw new HttpError(409, 'Someone else changed this text. Your draft is kept here; compare it with the saved version.');
      return reply({block:changed[0]});
    }
    if (body.action === 'save_slide') {
      const slide = await authorizeSlide(uuid(body.id),group);
      const patch = {revision:integer(body.revision,0,1000000)+1,updated_at:new Date().toISOString()};
      if ('title' in body) patch.title = text(body.title,160);
      if ('theme' in body) { if (!['paper','sage','midnight'].includes(body.theme)) throw new HttpError(400,'Invalid theme.'); patch.theme = body.theme; }
      const changed = await db('class_slides',`id=eq.${slide.id}&revision=eq.${body.revision}`,'PATCH',patch);
      if (!changed.length) throw new HttpError(409,'This slide changed elsewhere. Refresh before editing it again.');
      return reply({slide:changed[0]});
    }
    if (body.action === 'add_slide') {
      const g = group || await one('class_groups',body.groupId);
      const slides = await db('class_slides',`group_id=eq.${g.id}&order=position.desc`);
      if (slides.length >= 8) throw new HttpError(400,'Each group can have up to eight slides.');
      if (slides.length) await authorizeSlide(slides[0].id,group);
      const newId = crypto.randomUUID();
      await db('class_slides','', 'POST', {id:newId,session_id:g.session_id,group_id:g.id,position:(slides[0]?.position || 0)+1,title:text(body.title || 'Our next idea',160)});
      const originals = body.duplicateId ? await db('slide_blocks',`slide_id=eq.${uuid(body.duplicateId)}&order=position`) : [];
      if (body.duplicateId) { const source=await one('class_slides',body.duplicateId); if(source.group_id!==g.id) {await db('class_slides',`id=eq.${newId}`,'DELETE');throw new HttpError(403,'Duplicate slides within the same group.');} }
      const blocks = originals.length ? originals.map(b=>({slide_id:newId,label:b.label,content:b.content,contributor:b.contributor,style:b.style,position:b.position})) : [{slide_id:newId,label:'Our idea',position:0},{slide_id:newId,label:'Evidence or example',position:1}];
      await db('slide_blocks','', 'POST',blocks);
      return reply({id:newId});
    }
    if (body.action === 'add_block') {
      const s = await authorizeSlide(uuid(body.slideId),group);
      const blocks = await db('slide_blocks',`slide_id=eq.${s.id}&order=position.desc`);
      if(blocks.length>=6) throw new HttpError(400,'Use up to six text boxes per slide.');
      const rows = await db('slide_blocks','','POST',{slide_id:s.id,label:'New text box',position:(blocks[0]?.position || 0)+1});
      return reply({block:rows[0]});
    }
    if (body.action === 'delete_slide') {
      const slide=await authorizeSlide(uuid(body.id),group);
      const siblings=await db('class_slides',`group_id=eq.${slide.group_id}&select=id`);
      if(siblings.length<=1) throw new HttpError(400,'Keep at least one slide per group.');
      await db('class_slides',`id=eq.${slide.id}`,'DELETE'); return reply({deleted:true});
    }
    if (body.action === 'delete_block') {
      const block=await one('slide_blocks',body.id);await authorizeSlide(block.slide_id,group);
      await db('slide_blocks',`id=eq.${block.id}`,'DELETE');return reply({deleted:true});
    }
    if (body.action === 'rotate_group') {
      const join=token(); await db('class_groups',`id=eq.${uuid(body.id)}`,'PATCH',{join_token:join,token_hash:await hash(join)}); return reply({rotated:true});
    }
    if (body.action === 'debrief') return reply(await generate(uuid(body.sessionId),Boolean(body.force)));
    if (body.action === 'history') return reply({history:await db('debrief_history',`session_id=eq.${uuid(body.sessionId)}&order=created_at.desc&limit=12`)});
    if (body.action === 'delete_session') {await db('class_sessions',`id=eq.${uuid(body.sessionId)}`,'DELETE');return reply({deleted:true});}
    throw new HttpError(400,'Unknown action.');
  } catch(error) {
    const status = error instanceof HttpError ? error.status : 500;
    if(status===500) console.error('Classroom request failed',error?.name);
    return reply({error:error instanceof HttpError ? error.message : 'Something went wrong. Please try again.'},status);
  }
});
