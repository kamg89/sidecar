import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {makeDemo} from '../public/demo.js';
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
test('late classroom polling cannot reopen a departed activity or replace the next one',async()=>{
 const {window,document}=parseHTML('<html><body><div id="app"></div><div id="toast"></div><div id="modal-root"></div></body></html>');
 const data=makeDemo();let hold=false,release,next='second';
 const storage={getItem:()=> 'test-instructor',setItem(){},removeItem(){}};
 Object.assign(globalThis,{document,window,sessionStorage:storage,localStorage:storage,location:{hash:'#session=demo',origin:'http://127.0.0.1:4173',pathname:'/'},history:{replaceState(){}},addEventListener(){},fetch:async(url,opts)=>{
  const p=JSON.parse(opts.body);let result;
  if(p.action==='list')result={sessions:[{...data.session,id:next,title:next+' classroom'}]};
  else if(p.action==='get'){result=structuredClone(data);if(p.sessionId!=='demo'){result.session.id=p.sessionId;result.session.title=p.sessionId+' classroom';}if(hold){hold=false;await new Promise(r=>release=r);}}
  else throw new Error(p.action);
  return {ok:true,status:200,json:async()=>result};
 }});
 const timers=[],originalInterval=setInterval;globalThis.setInterval=fn=>{timers.push(fn);return 0;};await import('../public/app.js?navigation-regression');globalThis.setInterval=originalInterval;await settle();assert(document.querySelector('#workspace'));
 const click=async selector=>{const node=document.querySelector(selector);assert(node,selector);node.dispatchEvent(new window.Event('click',{bubbles:true}));await settle();};
 hold=true;timers[0]();await settle();await click('[data-action="home"]');release();await settle();assert(document.querySelector('.dashboard'));assert.equal(document.querySelector('#workspace'),null);
 await click('[data-action="open-session"]');assert.equal(document.querySelector('.sessionbar h1').textContent,'second classroom');
 next='third';hold=true;timers[0]();await settle();await click('[data-action="home"]');await click('[data-action="open-session"]');assert(document.querySelector('#workspace'));release();await settle();assert.equal(document.querySelector('.sessionbar h1').textContent,'third classroom');assert.equal(document.querySelector('.login-shell'),null);
});
