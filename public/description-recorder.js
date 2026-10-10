const MIC='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
const STOP='<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor"/></svg>';
const MAX_BYTES=2*1024*1024,MAX_SECONDS=90;
export function voiceInputMarkup(){return `<button type="button" class="voice-button" data-voice-record aria-label="Dictate project description" title="Dictate project description" aria-pressed="false" aria-describedby="voice-status">${MIC}</button>`;}

export function attachDescriptionRecorder(form,transcribe) {
  const button=form.querySelector('[data-voice-record]'),status=form.querySelector('#voice-status'),retry=form.querySelector('[data-voice-retry]'),input=form.querySelector('#project-description'),submit=form.querySelector('button[type=submit]'),overflow=form.querySelector('#voice-transcript');
  let disposed=false,busy=false,recorder,stream,timer,deadline,controller,recording,started=0,parts=[],size=0,tooLarge=false,recordingFailed=false;
  const supported=Boolean(navigator.mediaDevices?.getUserMedia&&globalThis.MediaRecorder);
  function tracksOff(){stream?.getTracks().forEach(track=>track.stop());stream=null;clearInterval(timer);clearTimeout(deadline);}
  function setBusy(value){busy=value;form.dataset.voiceBusy=String(value);submit.disabled=value||form.dataset.modelsLoading==='true';}
  function resetButton(){button.innerHTML=MIC;button.setAttribute('aria-label','Dictate project description');button.title='Dictate project description';button.setAttribute('aria-pressed','false');button.disabled=!supported;}
  function stop(){if(recorder?.state==='recording'){button.disabled=true;recorder.stop();tracksOff();}}
  function fail(message){if(disposed)return;status.textContent=message;status.classList.add('error-text');setBusy(false);resetButton();retry.hidden=!recording;}
  async function upload(){
    if(disposed||!recording)return;
    setBusy(true);button.disabled=true;retry.hidden=true;status.classList.remove('error-text');status.textContent='Transcribing your explanation…';controller=new AbortController();
    try {
      const result=await transcribe(recording,controller.signal);if(disposed)return;
      const next=[input.value.trimEnd(),result.text].filter(Boolean).join('\n\n');
      if(next.length>input.maxLength){overflow.hidden=false;overflow.value=result.text;status.textContent='Your description is full. Copy the transcript below and shorten your description; nothing was replaced.';overflow.focus();}
      else {input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='Added to your description. Review the wording, then generate your template.';input.focus();}
      recording=null;
    } catch(error){if(!disposed)fail(error.message||'Transcription failed. Retry or type your description.');}
    finally{if(!disposed){setBusy(false);resetButton();}controller=null;}
  }
  async function toggle(){
    if(recorder?.state==='recording'){stop();return;}if(busy||disposed)return;
    recording=null;retry.hidden=true;overflow.hidden=true;status.classList.remove('error-text');setBusy(true);button.disabled=true;status.textContent='Allow microphone access to explain your project.';
    try {
      const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
      if(disposed){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('This browser cannot record a supported format. Try Chrome or Safari, or type your description.');
      recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:48000});parts=[];size=0;tooLarge=false;recordingFailed=false;
      recorder.ondataavailable=event=>{if(disposed||!event.data.size)return;size+=event.data.size;if(size>MAX_BYTES){tooLarge=true;parts=[];stop();}else if(!tooLarge)parts.push(event.data);};
      recorder.onerror=()=>{recordingFailed=true;parts=[];tracksOff();fail('The microphone stopped unexpectedly. Please try again or type your description.');};
      recorder.onstop=()=>{tracksOff();if(disposed||recordingFailed)return;if(tooLarge){fail('Recording is too large. Try a shorter explanation.');return;}recording=new Blob(parts,{type:recorder.mimeType});parts=[];if(recording.size<100){recording=null;fail('No recording was captured. Please try again.');return;}upload();};
      recorder.start(1000);started=Date.now();button.innerHTML=STOP;button.disabled=false;button.setAttribute('aria-label','Stop recording and transcribe');button.title='Stop recording and transcribe';button.setAttribute('aria-pressed','true');
      const update=()=>{status.textContent=`Recording · ${Math.min(MAX_SECONDS,Math.floor((Date.now()-started)/1000))} / ${MAX_SECONDS}s · Tap the stop icon when finished.`;};update();timer=setInterval(update,1000);deadline=setTimeout(stop,MAX_SECONDS*1000);
    } catch(error){tracksOff();const message=error.name==='NotAllowedError'?'Microphone access was blocked. Allow it in your browser settings, or type your description.':error.name==='NotFoundError'?'No microphone found. Connect one or type your description.':error.message;fail(message);}
  }
  button.addEventListener('click',toggle);retry.addEventListener('click',upload);
  if(!supported){button.disabled=true;status.textContent='Voice input is unavailable in this browser. You can type your description.';}
  return ()=>{disposed=true;controller?.abort();if(recorder?.state==='recording')recorder.stop();tracksOff();recording=null;parts=[];button.removeEventListener('click',toggle);retry.removeEventListener('click',upload);};
}
