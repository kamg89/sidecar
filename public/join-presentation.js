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
  return `<div class="join-project-copy"><div class="join-project-brand"><img src="icon.svg" alt=""> sidecar</div><h1 id="join-project-title">Join the class.</h1><p class="join-project-activity">${escape(session.title)}</p><p class="join-project-instruction">📱 Scan the QR code<br>or open the link and enter:</p><div class="join-large-code" aria-label="Class code">${escape(displayCode(session.class_code))}</div><p class="join-project-instruction">${session.work_mode==='individual'?'Enter your name to open your own slides.':'Choose your assigned group number.'}</p><div class="join-project-status ${open?'':'is-closed'}" role="status"><span class="dot"></span>${open?(['draft','live'].includes(session.status)?'Join and start writing · no account needed':'Join now · writing is paused'):session.status==='ended'?'This activity has ended':'Joining is closed · please wait'}</div></div><div class="join-project-entry">${qrSvg(url)}<span class="qr-caption">Scan with your phone camera</span></div><div class="join-project-link"><span>On a computer? Open this link</span><a href="${escape(manual.href)}" target="_blank" rel="noopener">${escape(manual.host+manual.pathname+'#join')}</a></div>`;
}
