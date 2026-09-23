(()=>{'use strict';
let host,button,panel,status,preview,stopButton,sendButton,deleteButton,recorder,stream,blob,url,tick,hold,pressed=false,locked=false,busy=false,token=0,started=0,origin=null,suppressUntil=0;
function label(text){status.textContent=text;}
function tracks(){stream?.getTracks().forEach(t=>t.stop());stream=null;}
function clear(){token++;clearTimeout(hold);clearInterval(tick);pressed=false;locked=false;origin=null;if(recorder&&recorder.state!=='inactive'){recorder.onstop=null;recorder.stop();}recorder=null;tracks();if(url)URL.revokeObjectURL(url);url=null;blob=null;busy=false;if(panel){preview.pause();preview.removeAttribute('src');panel.hidden=true;sendButton.disabled=false;deleteButton.disabled=false;}}
function stop(){pressed=false;clearTimeout(hold);if(recorder?.state==='recording'){recorder.stop();tracks();clearInterval(tick);stopButton.hidden=true;label('Preparing recording…');}else if(!recorder&&!blob&&!busy&&panel&&!panel.hidden){token++;tracks();panel.hidden=true;}}
async function begin(){
 if(!pressed||!host.canStart()||blob||busy)return;
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){panel.hidden=false;label('Voice recording is not supported in this browser.');return;}
 const attempt=++token,owner=host.isCurrent();panel.hidden=false;preview.hidden=true;stopButton.hidden=true;sendButton.hidden=true;deleteButton.hidden=false;label('Allow microphone access to record…');
 try{
  const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
  if(attempt!==token||owner!==host.isCurrent()||(!pressed&&!locked)){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime)throw Error('This browser cannot create a supported recording.');
  recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});const chunks=[];let size=0;
  recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>=7*1024*1024)stop();}};
  recorder.onerror=()=>{clear();panel.hidden=false;label('Recording failed. Please try again.');};
  recorder.onstop=()=>{if(attempt!==token)return;tracks();clearInterval(tick);blob=new Blob(chunks,{type:recorder.mimeType||mime});recorder=null;stopButton.hidden=true;if(blob.size<17){blob=null;label('No sound was recorded. Hold + to try again.');return;}url=URL.createObjectURL(blob);preview.src=url;preview.hidden=false;sendButton.hidden=false;label('Listen before sending');};
  recorder.start(250);started=Date.now();stopButton.hidden=false;
  const update=()=>{const seconds=Math.floor((Date.now()-started)/1000);label((locked?'Recording · locked · ':'Recording · slide up to lock · ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));if(seconds>=300)stop();};update();tick=setInterval(update,250);
 }catch(e){if(attempt!==token)return;tracks();pressed=false;label(e.name==='NotAllowedError'?'Microphone permission was not granted. Allow it, then hold + again.':e.message||'Could not start recording.');}
}
function init(h){host=h;button=h.button;button.classList.add('voice-trigger');button.setAttribute('aria-label','Add photo or MP3 · hold to record voice');button.title='Add photo or MP3 · hold to record voice';
 panel=document.createElement('section');panel.className='voice-recorder';panel.hidden=true;panel.setAttribute('aria-label','Voice recording');
 status=document.createElement('p');status.setAttribute('role','status');preview=document.createElement('audio');preview.controls=true;preview.preload='metadata';preview.hidden=true;
 const controls=document.createElement('div');const add=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;controls.append(b);return b;};
 stopButton=add('Stop',stop);sendButton=add('Send recording',async()=>{if(!blob||busy)return;const attempt=token;busy=true;sendButton.disabled=true;deleteButton.disabled=true;label('Sending recording…');try{await host.send(blob);if(attempt===token)clear();}catch(e){if(attempt!==token)return;label(e.message||'Could not send. Your recording is still here.');busy=false;sendButton.disabled=false;deleteButton.disabled=false;}});deleteButton=add('Delete',clear);
 stopButton.hidden=sendButton.hidden=true;panel.append(status,preview,controls);document.querySelector('#composer').before(panel);
 button.addEventListener('pointerdown',e=>{if(e.button!==0||pressed||recorder||busy||blob||!host.canStart())return;pressed=true;locked=false;origin={x:e.clientX,y:e.clientY,id:e.pointerId};button.setPointerCapture?.(e.pointerId);hold=setTimeout(()=>{suppressUntil=Date.now()+1200;begin();},400);});
 button.addEventListener('pointermove',e=>{if(!pressed||!origin||e.pointerId!==origin.id)return;if(recorder?.state==='recording'){if(origin.y-e.clientY>55){locked=true;label('Recording · locked');}}else if(panel.hidden&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>12){clearTimeout(hold);pressed=false;}});
 const release=()=>{clearTimeout(hold);if(!pressed)return;pressed=false;if(!panel.hidden){suppressUntil=Date.now()+1200;if(!locked)stop();}};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',()=>{if(!locked)stop();});
 button.addEventListener('click',e=>{if(Date.now()<suppressUntil||blob||busy||recorder){e.preventDefault();e.stopImmediatePropagation();}},true);
 button.addEventListener('contextmenu',e=>e.preventDefault());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
 document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause();});},true);
}
window.OurVoice={init,stop,reset:clear};
})();
