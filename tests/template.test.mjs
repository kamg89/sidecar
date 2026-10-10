import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {generateTemplate,templateInput,validateTemplate,templateRows} from '../supabase/functions/classroom/template.js';
import {activitySetupForm,templateReviewForm,readTemplateReview} from '../public/activity-builder.js';

const draft=()=>({title:'Soccer club value',instructions:'Compare benefits to fans with revenue to the club.',debrief_prompt:'Compare the groups using their saved evidence.',slides:[{title:'Who benefits?',prompts:['What does the fan gain?','What evidence supports your explanation?']},{title:'How does the club benefit?',prompts:['What does the club receive?','Where is the trade-off?']}]});
const input=templateInput({description:'Compare value creation and capture in a real soccer club.',workMode:'group'});

test('template generation uses the connected model and rejects refused, incomplete or malformed results',async()=>{
  let request;
  const result=await generateTemplate(input,'private-test-key','gpt-4.1-mini',async(url,options)=>{request=JSON.parse(options.body);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(draft())}]}]})};});
  assert.equal(request.model,'gpt-4.1-mini');assert.equal(request.store,false);assert.equal(request.text.format.strict,true);assert.equal(JSON.parse(request.input).description,input.description);assert.deepEqual(result.template,draft());
  for(const response of [{status:'incomplete'},{status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'{"slides":[]}'}]}]}])await assert.rejects(()=>generateTemplate(input,'private-test-key','gpt-4.1-mini',async()=>({ok:true,json:async()=>response})),/template|description/);
  await assert.rejects(()=>generateTemplate(input,'private-test-key','gpt-4.1-mini',async()=>({ok:false,status:401})),/saved API key/);
  await assert.rejects(()=>generateTemplate(input,'private-test-key','gpt-4.1-mini',async()=>{throw new Error('private detail');}),e=>!e.message.includes('private detail'));
});

test('reviewed templates enforce bounded nonblank prompts and never accept answer content',()=>{
  assert.throws(()=>templateInput({description:'short'}),/Describe/);
  for(const change of [d=>d.slides=[],d=>d.slides=Array(5).fill(d.slides[0]),d=>d.slides[0].prompts=['one'],d=>d.slides[0].prompts[0]=' ',d=>d.slides[0].title='x'.repeat(141)]){const d=draft();change(d);assert.throws(()=>validateTemplate(d));}
  const d=draft();d.slides[0].content='Invented student answer';d.contributor='Fake person';
  const valid=validateTemplate(d);assert(!JSON.stringify(valid).includes('Invented'));assert(!JSON.stringify(valid).includes('Fake'));
});

test('each group gets its own ordered copy, with empty content and attribution',()=>{
  const d=draft(),groups=[{id:'g1'},{id:'g2'}];let serial=0;
  const rows=templateRows(d,groups,'class',()=>String(++serial));
  assert.equal(rows.slides.length,4);assert.equal(new Set(rows.slides.map(s=>s.id)).size,4);
  for(const g of groups){const slides=rows.slides.filter(s=>s.group_id===g.id);assert.deepEqual(slides.map(s=>s.title),d.slides.map(s=>s.title));assert.deepEqual(slides.map(s=>s.position),[0,1]);for(const [i,s] of slides.entries()){const blocks=rows.blocks.filter(b=>b.slide_id===s.id);assert.deepEqual(blocks.map(b=>b.label),d.slides[i].prompts);assert(blocks.every(b=>b.content===''&&b.contributor===''));}}
  assert.equal(templateRows(draft(),Array.from({length:60},(_,id)=>({id})),'class').blocks.length,240);
});

test('setup uses a description and editable preview escapes AI output and preserves changes',()=>{
  const setup=activitySetupForm({description:'A project <example>',workMode:'individual',groups:8},['Compare']);
  assert(!setup.includes('Starter slide prompts'));assert(setup.includes('name="description"'));assert(setup.includes('max="60"'));assert(!setup.includes('<example>'));
  const d=draft();d.title='<script>bad</script>';d.slides[0].prompts[0]='<img src=x onerror=bad()>?';
  const {document}=parseHTML(templateReviewForm(d,{groups:3,workMode:'group'},'gpt-4.1-mini'));
  assert.equal(document.querySelectorAll('script,img').length,0);
  document.querySelector('[data-template-title]').value='Our revised question';
  document.querySelector('[data-template-prompt]').value='A better prompt?';
  const edited=readTemplateReview(document.querySelector('form'));
  assert.equal(edited.slides[0].title,'Our revised question');assert.equal(edited.slides[0].prompts[0],'A better prompt?');assert.equal(edited.instructions,d.instructions);assert.equal(edited.title,d.title);
});
