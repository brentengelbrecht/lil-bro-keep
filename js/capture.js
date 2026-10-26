/* capture.js: getting attachments into a note: naming clashes, the replace-or-keep-both question, and the camera. */
'use strict';
function uniqueName(n,name){
  const m=/^(.*?)(\.[^.]*)?$/.exec(name),base=m[1],ext=m[2]||'';
  const taken=new Set(n.att.map(a=>a.name.toLowerCase()));
  let k=1;while(taken.has((base+' '+k+ext).toLowerCase()))k++;
  return base+' '+k+ext;
}
function askReplace(name,newName){
  return new Promise(res=>{
    const d=openDialog({label:'Replace attachment',role:'alertdialog',z:85,outside:false,focus:'.btn',
      html:`<h3>Attachment already exists</h3>
      <p>“${h(name)}” is already attached to this note. Replace the existing attachment?</p>
      <p class="hint">If you choose No, the new file is added as “${h(newName)}”.</p>
      <div class="row"><button class="btn" data-r="replace">Yes, replace</button><button class="btn2" data-r="rename">No, keep both</button></div>
      <div class="row end"><button class="done" data-r="cancel">Cancel</button></div>`,
      onClose:v=>res(v==='replace'||v==='rename'?v:'cancel')});
    d.panel.addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b)d.close(b.dataset.r)});
  });
}
async function attach(n,blob,kind,name,opts){
  const same=n.att.findIndex(a=>a.name.toLowerCase()===name.toLowerCase());
  let at=-1;
  if(same>=0){
    if(opts&&opts.auto)name=uniqueName(n,name);
    else{
      const v=await askReplace(name,uniqueName(n,name));
      if(v==='cancel')return false;
      if(v==='replace')at=same;else name=uniqueName(n,name);
    }
  }
  const rec=await addMedia(n,blob,kind,name);
  if(at>=0){
    const old=n.att[at];
    if((old.kind==='audio')===(rec.kind==='audio'))n.att[at]=rec;else{n.att.splice(at,1);addAtt(n,rec)}
    removeBlob(old.id);
  }else addAtt(n,rec);
  return true;
}
/* A drop anywhere else on the page must never navigate away to the file. */
window.addEventListener('dragover',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files'))e.preventDefault()});
window.addEventListener('drop',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files'))e.preventDefault()});

/* Camera: live preview, then a still photo returned as a JPEG blob (or null if cancelled) */
function takePhoto(){
  return new Promise(resolve=>{
    let stream=null;
    const d=openDialog({label:'Take a photo',panelClass:'cam',z:80,
      html:'<h3>Take a photo</h3><video autoplay playsinline muted></video><p class="res" aria-live="polite"></p><div class="row end"><button class="done" data-c="x">Cancel</button><button class="btn" data-c="snap" disabled>Take photo</button></div>',
      onClose:blob=>{if(stream)stream.getTracks().forEach(t=>t.stop());resolve(blob instanceof Blob?blob:null)}});
    const video=d.panel.querySelector('video'),res=d.panel.querySelector('.res'),snap=d.panel.querySelector('[data-c="snap"]');
    d.panel.addEventListener('click',e=>{
      const b=e.target.closest('[data-c]');if(!b)return;
      if(b.dataset.c==='x'){d.close();return}
      const w=video.videoWidth,ht=video.videoHeight;if(!w)return;
      const c=document.createElement('canvas');c.width=w;c.height=ht;c.getContext('2d').drawImage(video,0,0,w,ht);
      c.toBlob(bl=>d.close(bl),'image/jpeg',0.92);
    });
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){res.textContent='A camera isn’t available in this browser or page.';return}
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}}).then(s=>{
      if(d.closed){s.getTracks().forEach(t=>t.stop());return}
      stream=s;video.addEventListener('loadedmetadata',()=>{snap.disabled=false;snap.focus()},{once:true});video.srcObject=s;
    }).catch(e=>{res.textContent=e&&e.name==='NotAllowedError'?'Camera access was blocked.':e&&e.name==='NotFoundError'?'No camera was found.':'Couldn’t start the camera.'});
  });
}
