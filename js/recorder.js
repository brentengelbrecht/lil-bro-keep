/* recorder.js: voice recording for a note (microphone, MediaRecorder).
   createRecorder({bar, say, save}): bar() is the element that shows the recording bar, say(text) shows a message,
   save(blob) stores a finished recording. Returns {start, stop, cancel, show, active}. */
'use strict';
function createRecorder(o){
  let rec=null;
  const fmt=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  const secs=r=>fmt(Math.floor((Date.now()-r.t0)/1000));
  function show(){
    const r=o.bar();if(!r)return;
    if(!rec){r.hidden=true;r.innerHTML='';return}
    r.hidden=false;
    r.innerHTML=`<span class="dot"></span><span class="rtime">${secs(rec)}</span><span class="sp"></span><button class="done" data-e="rstop">Stop</button><button class="done" data-e="rcancel">Cancel</button>`;
  }
  function cancel(){
    if(!rec)return;const r=rec;rec=null;r.discard=true;clearInterval(r.timer);
    try{r.mr.stop()}catch(e){}r.stream.getTracks().forEach(t=>t.stop());show();
  }
  function stop(){                                          // resolves once the recording has been saved
    if(!rec)return Promise.resolve();
    const r=rec;rec=null;clearInterval(r.timer);try{r.mr.stop()}catch(e){}show();return r.finished;
  }
  async function start(){
    if(rec)return;o.say('');
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){o.say('Recording isn’t supported in this browser or page.');return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mr=new MediaRecorder(stream),chunks=[];
      const r=rec={mr,stream,t0:Date.now(),discard:false};
      r.finished=new Promise(res=>r.resolve=res);
      mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      mr.onstop=async()=>{
        try{
          stream.getTracks().forEach(t=>t.stop());
          if(r.discard||!chunks.length)return;
          await o.save(new Blob(chunks,{type:mr.mimeType||'audio/webm'}));
        }catch(e){o.say('Couldn’t save the recording.')}
        finally{r.resolve()}
      };
      r.timer=setInterval(()=>{const b=o.bar(),t=b&&b.querySelector('.rtime');if(t)t.textContent=secs(r)},500);
      mr.start();show();
    }catch(e){rec=null;o.say(e&&e.name==='NotAllowedError'?'Microphone access was blocked.':'Couldn’t start recording.')}
  }
  return{start,stop,cancel,show,get active(){return !!rec}};
}
