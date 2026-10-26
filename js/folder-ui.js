/* folder-ui.js: everything the person sees about the notes folder: the status line, the reconnect prompt, choosing a folder, the settings dialog. */
'use strict';
function setStatus(t,err){
  const s=document.getElementById('st');if(!s)return;
  s.textContent=(Store.mode==='folder'||err)?t:'';s.classList.toggle('err',!!err);
}

/* While only the saved copy is showing, any click or key press asks Chrome for folder access instead. */
const gate=e=>{
  if(Store.state!=='cached')return;
  if(e.target&&e.target.closest&&e.target.closest('#cachebar'))return;
  e.stopPropagation();e.preventDefault();
  if(Store.gesturePending)Store.reconnect();
};
document.addEventListener('click',gate,true);
document.addEventListener('keydown',e=>{if(e.key==='Tab'||e.key==='Escape'||e.key.startsWith('Arrow')||e.key==='Shift')return;gate(e)},true);

/* ---------- choosing a folder ---------- */
async function pickFolder(out,started){          // started() is called once the long part begins (the dialog can close then); returns the result message
  const say=t=>{out.textContent=t;return t};
  let hd;
  try{hd=await showDirectoryPicker({id:'keep-notes',mode:'readwrite'})}catch(e){return ''}
  say('Checking folder…');
  const existing=await Store.inspect(hd);
  if(existing){
    if(!confirm(`“${hd.name}” already contains notes. Load them into the app?\n\nNotes currently in the app are not copied into it.`)){say('');return ''}
    started&&started();
    await Store.attach(hd,{load:true});
    return say(`Loaded ${notes.length} note${notes.length===1?'':'s'} from “${hd.name}”.`);
  }
  let copy=false;
  if(notes.length)copy=confirm(`Copy the ${notes.length} note${notes.length===1?'':'s'} currently in the app into “${hd.name}”?\n\nOK = copy them. Cancel = start with an empty folder.`);
  started&&started();
  await Store.attach(hd,{copy,report:t=>{out.textContent=t}});
  return say(`Saving to “${hd.name}”. ${notes.length} note${notes.length===1?'':'s'} written.`);
}

/* ---------- settings dialog ---------- */
function settingsDialog(){
  const body=msg=>{
    const ok=Store.canUseFolder,inF=Store.mode==='folder'||Store.state==='perm';     // worked out each time, so the dialog is right after a folder is chosen
    const conn=Store.mode==='folder',name=inF&&Store.folderName;
    return `<span class="dic">${ic('gear',22)}</span><h3>Settings</h3>
    <div class="tile${name?' on':''}">${ic('folder',26)}<span><b>${name?h(Store.folderName):'This browser only'}</b><span class="sub"><i class="dot${conn?'':name?' warn':' off'}"></i>${name?(conn?'Connected: each note is saved as a web page in this folder.':'Waiting for folder access: each note is saved as a web page in this folder.'):'Notes are kept in this browser only. Choose a folder to save them as web pages that a sync service can back up.'}</span></span></div>
    ${name?'<p class="hint">Point Dropbox, Google Drive or iCloud at that folder to sync.</p>':''}
    ${ok?'':'<p class="hint">Folder storage needs desktop Chrome.</p>'}
    ${inF?'<p class="hint">If Chrome asks about folder access when you open the app, choose “Allow on every visit” so it reconnects by itself.</p>':''}
    <button class="big${inF?' out':''}" data-s="choose"${ok?'':' disabled'}>${inF?'Change folder…':'Choose notes folder…'}</button>
    ${conn?`<p class="cap">Advanced</p><div class="alist"><button class="arow" data-s="rebuild" title="Read every note page in the folder and rebuild the list">Rescan folder<u>›</u></button><button class="arow" data-s="css" title="Write a fresh styles.css into the folder">Rewrite stylesheet<u>›</u></button><button class="arow x" data-s="disc" title="Stop saving to the folder and go back to this browser only">Disconnect folder<u>›</u></button></div>`:''}
    <p class="res" aria-live="polite">${h(msg||'')}</p>
    <div class="cl"><button class="done" data-s="x">Close</button></div>`;
  };
  const d=openDialog({label:'Settings',panelClass:'dlg2',html:body(),onClose:()=>Host.render()});
  const draw=msg=>d.redraw(body(msg));
  const say=t=>{const r=d.panel.querySelector('.res');if(r)r.textContent=t};
  d.panel.addEventListener('click',async e=>{
    const b=e.target.closest('[data-s]');if(!b)return;
    const k=b.dataset.s,out=d.panel.querySelector('.res');
    try{
      if(k==='x')d.close();
      else if(k==='choose'){
        let closed=false;
        const t=await withBusy(()=>pickFolder(out,()=>{closed=true;d.close()}));   // once a folder is chosen and confirmed, the writing runs in the background
        if(closed){Host.render();if(t)toast(t,{ms:6000})}else draw(t)
      }
      else if(k==='css'){await Store.rewriteStyles();say('Stylesheet rewritten.')}
      else if(k==='disc'){if(confirm('Stop using the folder? The files stay where they are.\n\nEverything this browser holds is cleared (the saved copy of your notes and any notes stored in this browser), and the app starts again with its two welcome notes.'))await Store.disconnect()}
      else if(k==='rebuild'){
        busyStart();try{
        say('Scanning…');
        const n=await Store.rescan(c=>say(`Scanning… ${c} notes found`));
        draw(`Rescanned: ${n} note${n===1?'':'s'} found.`);
        }finally{busyEnd()}
      }
    }catch(err){const m='Something went wrong: '+((err&&err.message)||err);if(d.closed)toast(m,{ms:8000});else say(m)}
  });
}

Host.status=setStatus;
