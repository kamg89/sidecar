import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {makeDemo} from '../public/demo.js';
test('outside tester opens its activity without owner login or owner-only controls',async()=>{
  const {window,document}=parseHTML('<html><body><div id="app"></div><div id="toast"></div><div id="modal-root"></div></body></html>');
  const fixture=makeDemo();fixture.session.is_test=true;const calls=[];
  Object.assign(globalThis,{document,window,sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},location:{hash:'#test=t_abc',origin:'http://127.0.0.1:4173',pathname:'/'},history:{replaceState(){}},addEventListener(){},fetch:async(url,request)=>{calls.push(JSON.parse(request.body));return {ok:true,json:async()=>fixture};}});
  const interval=globalThis.setInterval;globalThis.setInterval=()=>0;
  await import('../public/app.js?tester-interface');await new Promise(r=>setImmediate(r));globalThis.setInterval=interval;
  assert.equal(calls[0].action,'get');assert(!calls.some(c=>c.action==='list'));
  assert(document.querySelector('#right'));assert(document.body.textContent.includes('Isolated test classroom'));
  assert(!document.querySelector('[data-action="home"]'));assert(!document.querySelector('#login'));
  document.querySelector('[data-action="activity-settings"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  await new Promise(r=>setImmediate(r));assert(!document.querySelector('[data-action="delete-session"]'));assert(!document.querySelector('[data-action="invite-tester"]'));
});
