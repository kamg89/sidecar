import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { makeDemo } from '../public/demo.js';
import { publicSession } from '../supabase/functions/classroom/core.js';
test('student workspace renders only group editing and never instructor controls',async()=>{
  const {window,document}=parseHTML('<html><body><div id="app"></div><div id="toast"></div><div id="modal-root"></div></body></html>');
  const fixture=makeDemo();fixture.groups=fixture.groups.slice(0,1);fixture.slides=fixture.slides.slice(0,1);fixture.blocks=fixture.blocks.filter(b=>b.slide_id===fixture.slides[0].id);fixture.session=publicSession(fixture.session);
  Object.assign(globalThis,{document,window,sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},location:{hash:'#group=test',origin:'http://127.0.0.1:4173',pathname:'/'},history:{replaceState(){}},addEventListener(){},fetch:async()=>({ok:true,json:async()=>fixture})});
  const originalInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
  await import('../public/app.js?student-test');await new Promise(r=>setImmediate(r));globalThis.setInterval=originalInterval;
  assert.equal(document.querySelectorAll('.thumb').length,1);
  assert(document.querySelector('[contenteditable="true"]'));
  for(const selector of ['#right','[data-action="generate"]','[data-action="debrief-settings"]','[data-action="share"]','[data-action="timer"]','[data-action="export"]'])assert.equal(document.querySelector(selector),null,selector+' must not be available to students');
  assert(!document.body.textContent.includes('Your facilitation notes'));
});
