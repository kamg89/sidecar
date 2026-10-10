import {renderDebriefSlide} from './debrief-view.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function textParts(value,limit=240){
 const parts=[];let chars=Array.from(String(value||''));
 while(chars.length>limit){let cut=limit;for(let i=limit;i>limit*.6;i--)if(/\s/.test(chars[i-1])){cut=i;break;}parts.push(chars.splice(0,cut).join(''));}if(chars.length||!parts.length)parts.push(chars.join(''));return parts;
}
// Keep the font fixed. Split content across views instead of shrinking it.
export function debriefPages(deck,data,measure=()=>true){
 const pages=[];
 for(const [logical,slide] of deck.slides.entries()){
  const fits=s=>measure(renderDebriefSlide(s,{index:logical,total:deck.slides.length,data}));
  const add=s=>pages.push({slide:s,logical});
  if(fits(slide)){add(slide);continue;}
  const core={...slide,examples:[]};
  if(fits(core))add(core);
  else {
   const atoms=[['takeaway',slide.takeaway],...slide.bullets.map(b=>['bullet',b]),['question',slide.question]].filter(x=>x[1]);
   for(const [kind,value] of atoms){let limit=240,parts;do{parts=textParts(value,limit).map(part=>({...slide,takeaway:kind==='takeaway'?part:'',bullets:kind==='bullet'?[part]:[],question:kind==='question'?part:'',examples:[]}));limit=Math.floor(limit/2);}while(parts.some(s=>!fits(s))&&limit>=15);parts.forEach(add);}
  }
  for(const example of slide.examples||[])add({...slide,takeaway:'',bullets:[],question:'',examples:[example]});
 }
 return pages;
}
export function groupPages(slide,blocks,group,measure=()=>true){
 const pages=[];
 for(const block of blocks){let limit=300,parts;do{parts=textParts(block.content||'No response yet.',limit).map(content=>({slide,group,block:{...block,content},part:0}));limit=Math.floor(limit/2);}while(parts.some(p=>!measure(renderGroupPage(p)))&&limit>=15);parts.forEach((p,i)=>pages.push({...p,part:i,totalParts:parts.length}));}
 if(!pages.length)pages.push({slide,group,block:{label:'This slide is empty.',content:'Add a response in the editor.'},part:0,totalParts:1});
 return pages;
}
export function renderGroupPage(page){const {slide,group,block,part,totalParts}=page;return `<article class="projection-slide group-projection"><header class="projection-header"><span><span aria-hidden="true">✍️</span> ${e(group?.name||'Student work')}</span><span>${totalParts>1?'Continued response · '+(part+1)+' / '+totalParts:'Student work'}</span></header><h1>${e(slide.title)}</h1><div class="projection-body no-examples"><section class="group-response"><h2>${e(block.label)}</h2><p class="group-response-text">${e(block.content)}</p>${block.contributor?`<p class="group-response-names">${e(block.contributor)}</p>`:''}</section></div><footer class="projection-footer"><span>Original student response</span><span>${e(group?.name||'')}</span></footer></article>`;}
export function measureProjection(html){const host=document.createElement('div');host.className='projection-stage projection-measure';host.innerHTML=html;document.body.append(host);const s=host.querySelector('.projection-slide'),b=host.querySelector('.projection-body');const fits=!s?.clientHeight||(s.scrollHeight<=s.clientHeight+1&&(!b||b.scrollHeight<=b.clientHeight+1));host.remove();return fits;}
