import qrcode from './vendor/qrcode-2.0.4.js';
import { displayCode } from './admin-join.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function joinLink(code,base=location.origin+location.pathname){
  const clean=String(code).replace(/[\s-]/g,'').toUpperCase();
  if(!/^[A-HJKMNP-Z2-9]{6}$/.test(clean)&&!/^[A-F0-9]{12}$/.test(clean))throw new Error('This activity does not have a valid join code.');
  const url=new URL(base);url.search='';url.hash='join&code='+clean;return url.href;
}
export function qrMatrix(value){const qr=qrcode(0,'Q');qr.addData(value,'Byte');qr.make();return Array.from({length:qr.getModuleCount()},(_,y)=>Array.from({length:qr.getModuleCount()},(_,x)=>qr.isDark(y,x)));}
export function qrSvg(value){
  const matrix=qrMatrix(value),size=matrix.length+8;
  const path=matrix.flatMap((row,y)=>row.flatMap((dark,x)=>dark?[`M${x+4},${y+4}h1v1h-1z`]:[])).join('');
  return `<svg class="join-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Scan to join this class" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
export function joinPresentation(session,base=location.origin+location.pathname){
  const url=joinLink(session.class_code,base),manual=new URL(base);manual.hash='join';manual.search='';
  const open=session.join_enabled&&session.status!=='ended';
  return `<div class="join-project-copy"><div class="join-project-brand"><img src="icon.svg" alt=""> sidecar <span>YOUR CLASSROOM, TOGETHER</span></div><p class="join-project-activity">${escape(session.title)}</p><h1 id="join-project-title">Scan. <br>Join. <br><em>Think together.</em></h1><p class="join-project-instruction">Open your phone’s camera and scan the code.<br>${session.work_mode==='individual'?'Enter your name to open your own slides.':'Then choose your assigned group number.'}</p><div class="join-project-status ${open?'':'is-closed'}" role="status"><span class="dot"></span>${open?'Ready to join · no account needed':session.status==='ended'?'This activity has ended':'Joining is closed · please wait'}</div></div><div class="join-project-entry">${qrSvg(url)}<div class="join-project-manual"><span>Or enter the class code</span><strong>${escape(displayCode(session.class_code))}</strong><a href="${escape(manual.href)}" target="_blank" rel="noopener">${escape(manual.host+manual.pathname+'#join')}</a></div></div>`;
}
