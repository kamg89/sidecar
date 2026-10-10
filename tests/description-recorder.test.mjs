import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {activitySetupForm} from '../public/activity-builder.js';
import {attachDescriptionRecorder} from '../public/description-recorder.js';
const settle=()=>new Promise(r=>setImmediate(r));

test('voice input preserves typed edits, retries the same audio and releases the microphone',async()=>{
  const {document,window}=parseHTML('<body>'+activitySetupForm({},['Compare'])+'</body>');const form=document.querySelector('form'),input=form.querySelector('#project-description'),button=form.querySelector('[data-voice-record]');let stopped=0,attempts=0,rec;
  Object.defineProperty(input,'maxLength',{value:6000});globalThis.Event=window.Event;
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})}},configurable:true});
  globalThis.MediaRecorder=class{static isTypeSupported(){return true;}constructor(stream,options){this.mimeType=options.mimeType;rec=this;}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob([new Uint8Array(200)])});queueMicrotask(()=>this.onstop());}};
  const dispose=attachDescriptionRecorder(form,async()=>{attempts++;if(attempts===1)throw new Error('Temporary failure');return {text:'Make two slides.'};});
  input.value='Typed before recording.';button.click();await settle();assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(form.dataset.voiceBusy,'true');assert(form.querySelector('[type=submit]').disabled);
  input.value+=' Added while speaking.';button.click();await settle();assert.equal(stopped,1);assert(!form.querySelector('[data-voice-retry]').hidden);assert.equal(input.value,'Typed before recording. Added while speaking.');
  form.querySelector('[data-voice-retry]').click();await settle();assert.equal(input.value,'Typed before recording. Added while speaking.\n\nMake two slides.');assert.equal(attempts,2);assert.equal(form.dataset.voiceBusy,'false');
  button.click();await settle();dispose();await settle();assert.equal(stopped,2);assert.equal(rec.state,'inactive');assert.equal(attempts,2,'Closing during recording must not send audio');
});

test('microphone permission failure and closing during permission keep typing available and stop late streams',async()=>{
  const {document,window}=parseHTML('<body>'+activitySetupForm({},['Compare'])+'</body>');const form=document.querySelector('form'),button=form.querySelector('[data-voice-record]');globalThis.Event=window.Event;
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error('blocked'),{name:'NotAllowedError'});};
  let dispose=attachDescriptionRecorder(form,async()=>{throw new Error('Must not transcribe');});button.click();await settle();assert.match(form.querySelector('#voice-status').textContent,/blocked/);assert(!form.querySelector('[type=submit]').disabled);dispose();
  let resolve,stopped=0;navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);dispose=attachDescriptionRecorder(form,async()=>{throw new Error('Must not transcribe');});button.click();dispose();resolve({getTracks:()=>[{stop:()=>stopped++}]});await settle();assert.equal(stopped,1);
});
