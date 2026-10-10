import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {joinLink,qrMatrix,qrSvg,joinPresentation} from '../public/join-presentation.js';

test('QR decodes independently to a code-prefilled student link, never an instructor fragment',()=>{
  for(const code of ['ABC234','679ECA7CB9ED']){
    const url=joinLink(code,'https://kamg89.github.io/sidecar/?private=secret#test=secret');
    assert.equal(url,`https://kamg89.github.io/sidecar/#join&code=${code}`);
    const matrix=qrMatrix(url),scale=5,width=(matrix.length+8)*scale,pixels=new Uint8ClampedArray(width*width*4).fill(255);
    matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y+4)*scale+dy)*width+(x+4)*scale+dx)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}}));
    assert.equal(jsQR(pixels,width,width)?.data,url);
    const svg=qrSvg(url);assert(svg.includes(`viewBox="0 0 ${matrix.length+8} ${matrix.length+8}"`));assert(svg.includes('fill="#fff"'));
  }
  assert.throws(()=>joinLink('foo<script>','https://example.com'));
});
test('join projection escapes names and contains only student entry information',()=>{
  const html=joinPresentation({title:'<img src=x onerror=alert(1)>',class_code:'ABC234',join_enabled:true,status:'draft',work_mode:'group',debrief:{secret:'PRIVATE DEBRIEF'},legacy_class_code:'ABCDEF123456'},'https://kamg89.github.io/sidecar/');
  assert(html.includes('ABC-234'));assert(html.includes('assigned group'));assert(!html.includes('PRIVATE DEBRIEF'));assert(!html.includes('ABCDEF123456'));assert(!html.includes('<img src=x'));
  const closed=joinPresentation({title:'Closed',class_code:'ABC234',join_enabled:false,status:'live'},'https://example.com/');assert(closed.includes('Joining is closed'));
});
test('vendored QR encoder is exactly the pinned, licensed package source',async()=>{
  assert.equal(await readFile(new URL('../public/vendor/qrcode-2.0.4.js',import.meta.url),'utf8'),await readFile(new URL('../node_modules/qrcode-generator/dist/qrcode.mjs',import.meta.url),'utf8'));
});
test('scanned link looks up the class automatically without sending remembered instructor access',async()=>{
  const {document,window}=parseHTML('<html><body><div id="app"></div><div id="toast"></div><div id="modal-root"></div></body></html>');
  let hashChanged;const calls=[],storage={getItem:()=> 'remembered-private-key',setItem(){},removeItem(){}};
  Object.assign(globalThis,{document,window,sessionStorage:storage,localStorage:storage,location:{hash:'#join&code=abc-234',origin:'https://kamg89.github.io',pathname:'/sidecar/'},history:{replaceState(){}},addEventListener(name,fn){if(name==='hashchange')hashChanged=fn;},fetch:async(url,options)=>{calls.push(options);return{ok:true,json:async()=>({id:'class-id',title:'Your class',mode:'group',groups:[{id:'group-2',name:'Group 2'}]})};}});
  const interval=setInterval;globalThis.setInterval=()=>0;await import('../public/app.js?qr-join-test');globalThis.setInterval=interval;
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,1);assert.equal(calls[0].headers['x-classroom-key'],'');assert.equal(JSON.parse(calls[0].body).action,'lookup_class');
  assert(document.querySelector('#join-group'));assert.equal(document.querySelector('#class-code').value,'ABC-234');assert.equal(document.querySelector('#join-group option[value="group-2"]').textContent,'Group 2');assert.equal(document.querySelector('#right'),null);
  location.hash='#join&code=DEF567';await hashChanged();assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].body).code,'DEF567');assert.equal(document.querySelector('#class-code').value,'DEF-567');
});
