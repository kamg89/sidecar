import test from 'node:test';
import assert from 'node:assert/strict';
import { hash, token, safeEqual, uuid, text, integer, style, publicSession, validateDebrief } from '../supabase/functions/classroom/core.js';
test('group capabilities are 256-bit and compared safely',async()=>{
  const a=token(),b=token();assert.equal(a.length,64);assert.notEqual(a,b);assert.match(await hash(a),/^[a-f0-9]{64}$/);assert(safeEqual(a,a));assert(!safeEqual(a,b));assert(!safeEqual(a,undefined));
});
test('untrusted identifiers cannot become database filters',()=>{
  assert.throws(()=>uuid('id&select=*'));assert.throws(()=>text('x'.repeat(6001)));assert.throws(()=>integer(2.5,1,6));assert.throws(()=>integer(7,1,6));assert.equal(uuid(crypto.randomUUID()).length,36);
});
test('formatting accepts only constrained properties',()=>{
  assert.deepEqual(style({bold:true,position:'absolute',color:'#123456'}),{bold:true,color:'#123456'});assert.throws(()=>style({color:'url(https://evil.test)'}));assert.throws(()=>style({align:'inherit;color:red'}));assert.throws(()=>style({size:900}));
});
test('student projection does not contain debrief or private instructions',()=>{
  const s=publicSession({id:'1',title:'A',instructions:'Task',status:'live',ends_at:null,created_at:'now',debrief:'private',debrief_prompt:'private',input_hash:'private',ai_error:'private'});
  assert.deepEqual(Object.keys(s),['id','work_mode','title','instructions','status','ends_at','created_at']);assert(!JSON.stringify(s).includes('private'));
});
test('AI citations must name real slides',()=>{
  const result=validateDebrief({slides:[{title:'A',takeaway:'B',question:'C',notes:'D',bullets:['E'],sources:['valid','invented']}]},new Set(['valid']));assert.deepEqual(result.slides[0].sources,['valid']);assert.throws(()=>validateDebrief({slides:[]},new Set()));
});
