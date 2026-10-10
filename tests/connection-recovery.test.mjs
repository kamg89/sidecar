import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};

test('connection loss stays visible, retains edits, and hidden tabs resume with a fresh read',async()=>{
  const {window,document}=parseHTML('<body><div id="app"></div><div id="toast"></div><div id="modal-root"></div></body>');
  let active=null,hidden=false,offline=false,reads=0;
  Object.defineProperty(document,'activeElement',{get:()=>active});Object.defineProperty(document,'hidden',{get:()=>hidden});
  const storage={getItem:()=>null,setItem(){},removeItem(){}};
  const data={session:{id:'session1',title:'Recovery',instructions:'Explain your idea.',status:'live',ends_at:new Date(Date.now()+600000).toISOString()},groups:[{id:'g1',name:'Group 1'}],slides:[{id:'s1',group_id:'g1',title:'Our idea',revision:0,theme:'paper'}],blocks:[{id:'b1',slide_id:'s1',label:'Explain',content:'Saved thought',contributor:'',style:{},revision:0}]};
  Object.assign(globalThis,{document,window,sessionStorage:storage,localStorage:storage,location:{hash:'#group='+'a'.repeat(64),origin:'https://test.invalid',pathname:'/'},history:{replaceState(){}},addEventListener(){},fetch:async(url,options)=>{const p=JSON.parse(options.body);if(p.action==='get')reads++;if(offline)throw new TypeError('Network unavailable');if(p.action==='get')return {ok:true,json:async()=>structuredClone(data)};if(p.action==='save_block'){Object.assign(data.blocks[0],p,{revision:data.blocks[0].revision+1});return {ok:true,json:async()=>({block:structuredClone(data.blocks[0])})};}throw new Error(p.action);}});
  const timers=[],originalInterval=setInterval;globalThis.setInterval=fn=>{timers.push(fn);return 0;};await import('../public/app.js?connection-test');globalThis.setInterval=originalInterval;await settle();
  offline=true;timers[0]();await settle();assert.equal(document.querySelector('#editing-badge').textContent,'Reconnecting…');assert.match(document.querySelector('#editor-status').textContent,/Connection lost/);
  active=document.querySelector('[data-field=content]');active.textContent='My thought while the network is down';active.dispatchEvent(new window.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,750));
  timers[0]();await settle();assert.match(document.querySelector('#editor-status').textContent,/draft kept/);assert.match(document.querySelector('#student-state').textContent,/Keep this tab open/);assert.equal(active.textContent,'My thought while the network is down');assert.equal(data.blocks[0].content,'Saved thought');
  hidden=true;const before=reads;timers[0]();await settle();assert.equal(reads,before,'Hidden tabs do not keep polling');
  offline=false;hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));await settle();assert.equal(reads,before+1);assert.equal(active.textContent,'My thought while the network is down');assert.equal(document.querySelector('#editing-badge').textContent.trim(),'Editing open');
  await new Promise(r=>setTimeout(r,5000));assert.equal(data.blocks[0].content,'My thought while the network is down');assert.equal(document.querySelector('#editor-status').textContent,'All changes saved');
});
