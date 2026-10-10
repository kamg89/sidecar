const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceButton=(label,slideId,blockId='')=>`<button class="group-jump" data-action="show-source" data-slide-id="${escape(slideId)}" data-block-id="${escape(blockId)}" title="Show ${escape(label)}’s original slide">${escape(label)}<span aria-hidden="true"> ↗</span></button>`;
export function linkGroups(value,slide,data){
 const text=String(value??'');if(!data)return escape(text);
 let out='',from=0;
 for(const match of text.matchAll(/\bGroups?\s+\d+(?:\s*(?:,\s*(?:and\s+)?|and\s+|&\s*)\d+)*/gi)){
  out+=escape(text.slice(from,match.index));let cursor=0;
  for(const number of match[0].matchAll(/\d+/g)){
   const group=data.groups.find(g=>g.name.toLowerCase()==='group '+Number(number[0]));
   const example=slide.examples?.find(x=>x.group?.toLowerCase()==='group '+Number(number[0]));
   const target=example?data.slides.find(s=>s.id===example.slide_id):data.slides.find(s=>s.group_id===group?.id&&slide.sources?.includes(s.id))||data.slides.find(s=>s.group_id===group?.id);
   const start=cursor===0?0:number.index,label=match[0].slice(start,number.index+number[0].length);
   out+=escape(match[0].slice(cursor,start))+(target?sourceButton(label,target.id,example?.block_id):escape(label));cursor=number.index+number[0].length;
  }
  out+=escape(match[0].slice(cursor));from=match.index+match[0].length;
 }
 return out+escape(text.slice(from));
}
export function exampleCards(examples) {
 if(!examples?.length)return '';
 return `<div class="evidence-cards">${examples.map(x=>`<figure class="evidence-card"><span class="evidence-kind">${x.kind==='quote'?(x.excerpt?'Excerpt from the group’s words':'From the group’s words'):'Summary of the group’s idea'}</span><blockquote>${x.kind==='quote'?'“':''}${escape(x.text)}${x.kind==='quote'?'”':''}</blockquote><figcaption><strong>${x.slide_id?sourceButton(x.group||'Group',x.slide_id,x.block_id):escape(x.group||'Group')}</strong>${x.contributor?`<span> · ${escape(x.contributor)}</span>`:''}<small>Slide ${Number(x.slide_number)||1}</small></figcaption></figure>`).join('')}</div>`;
}
export function renderDebriefSlide(slide,{index=0,total=1,title,evidenceAt,data}={}) {
 const linked=value=>linkGroups(value,slide,data);
 return `<article class="projection-slide" aria-label="Debrief slide ${index+1}"><header class="projection-header"><span><span aria-hidden="true">${slide.examples?.length&&!slide.bullets.length?'💬':'💡'}</span> CLASS DEBRIEF</span><span>${escape(String(index+1).padStart(2,'0'))} / ${escape(String(total).padStart(2,'0'))}</span></header><h1>${linked(slide.title)}</h1>${slide.takeaway?`<p class="projection-takeaway">${linked(slide.takeaway)}</p>`:''}<div class="projection-body ${!slide.examples?.length||!slide.bullets.length?'no-examples':''}">${slide.bullets.length?`<ul>${slide.bullets.map(b=>`<li>${linked(b)}</li>`).join('')}</ul>`:''}${exampleCards(slide.examples||[])}</div>${slide.question?`<div class="projection-question"><span><span aria-hidden="true">🎯</span> DISCUSS</span><p>${linked(slide.question)}</p></div>`:''}<footer class="projection-footer"><span>${escape(title||'Class discussion')}</span><span>${evidenceAt?'Saved work · '+escape(new Date(evidenceAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):''}</span></footer></article>`;
}
