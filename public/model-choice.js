const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function modelName(id) {
  const named=/^gpt-([\d.]+)-(luna|terra|sol|astra)$/.exec(id||'');
  if(named)return named[2][0].toUpperCase()+named[2].slice(1)+' · GPT-'+named[1];
  return (id||'Workspace default').replace(/^gpt-/,'GPT-').replace(/-(mini|nano)$/,' $1');
}
export function modelOptions(models,selected,defaultModel) {
  const preferred=['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol','gpt-6-luna','gpt-6-sol','gpt-6-astra','gpt-6.1-sol'];
  const rank=id=>id===defaultModel?-1:preferred.includes(id)?preferred.indexOf(id):100;
  return [...new Set(models)].sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).map(id=>`<option value="${escape(id)}" ${id===selected?'selected':''}>${escape(modelName(id))}${id===defaultModel?' · workspace default':''}</option>`).join('');
}
export function activityStatus(session) {
  if(session.status==='live'&&session.ends_at&&Date.parse(session.ends_at)<=Date.now())return 'Time ended';
  return {draft:'Ready to start',live:'Live now',paused:'Paused',ended:'Ended'}[session.status]||'Ready';
}
