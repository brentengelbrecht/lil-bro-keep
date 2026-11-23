/* folder.js: the folder store's engine. Every note becomes a standalone HTML page in a folder the person chooses (File System Access API, desktop Chrome).
   This file decides what is written when (ids, saving, flushing, conflicts, the index), checks the folder against what the app holds (scan, reconcile), and
   starts, reconnects and disconnects. The pieces it uses are in sibling files, loaded before it: folder-io.js (reading and writing files, where pages live,
   media, the saved copy), folder-lazy.js (notes known by their details only, search), folder-crypt.js (vault, locking, encrypted pages), folder-labels.js
   (label rename and delete in stored notes). No dialogs and no page code: when it needs the page it goes through Host. Dialogs are in folder-ui.js;
   the rest of the app reaches the store through Store (store.js). */
'use strict';
let MODE='browser',ROOT=null,fstate='ok',loaded=false,pending=false;
let lastW=new Map(),lastLB='[]',saveTimer=null,chain=Promise.resolve();
let gesturePending=false,reqBusy=false,reconciling=false,indexDirty=false,cacheTimer=null;
const RES=new Set();

/* ---------- ids and media ---------- */
function ensureId(n){
  if(/^\d+$/.test(n.id))return;
  let m=0;
  for(const x of notes)if(/^\d+$/.test(x.id))m=Math.max(m,+x.id);
  for(const r of RES)m=Math.max(m,r);
  n.id=String(m+1);RES.add(m+1);
}
/* Files in the folder that look like notes (1.html, 17.html ...) but could not be read as one. They are reported, never dropped silently. */
let unreadable=new Set(),warnedUnreadable=new Set();
function warnUnreadable(bad){
  unreadable=bad;
  const fresh=[...bad].filter(x=>!warnedUnreadable.has(x));
  warnedUnreadable=new Set([...warnedUnreadable].filter(x=>bad.has(x)));fresh.forEach(x=>warnedUnreadable.add(x));
  if(!fresh.length)return;
  const all=[...bad];
  toast(`${all.length} file${all.length===1?'':'s'} in the folder couldn’t be read as ${all.length===1?'a note and was':'notes and were'} left out: ${all.slice(0,3).join(', ')}${all.length>3?', …':''}`);
}
async function scanFolder(report){
  const found=[],bad=new Set();
  for await(const pg of eachPage()){
    let n=null;try{const f=await pg.entry.getFile();n=await parseNoteAsync(await f.text(),pg.name);if(n){n.fs=[f.lastModified,f.size];found.push(n)}}catch(err){quiet('a page that cannot be read is reported as unreadable',err)}
    if(!n)bad.add(pg.dir+'/'+pg.name);
    if(report)report(found.length);
  }
  warnUnreadable(bad);
  return{notes:found,labels:[...new Set(found.flatMap(n=>n.labels))]};
}
async function readIndex(){
  const d=new DOMParser().parseFromString(await(await readFile(ROOT,[],'index.html')).text(),'text/html');
  const el=d.getElementById('keep-index');if(!el)return null;
  const data=JSON.parse(el.textContent);
  return data&&Array.isArray(data.notes)?{notes:data.notes.map(fromIndexEntry),labels:data.labels||[]}:null;
}
function adopt(data){
  notes=data.notes;
  LB=[...new Set([...(data.labels||[]),...notes.flatMap(n=>n.labels)])].sort((a,b)=>a.localeCompare(b));
  RES.clear();loadFailed.clear();PRIVATE_LABELS.clear();
  lastW=new Map(notes.map(n=>[n.id,sigOf(n)]));lastLB=JSON.stringify(LB);
}
async function ensureScaffold(){
  if(!(await has(ROOT,'styles.css')))await writeFile(ROOT,[],'styles.css',stylesCSS());
  else{
    try{
      const t=await(await readFile(ROOT,[],'styles.css')).text();
      let up=t.replace(/@media \(prefers-color-scheme:dark\)\{:root\{[^}]*\}\}\n?/,'').replace('color-scheme:light dark','color-scheme:light');
      if(!up.includes('p.content{margin:0}'))up=up.replace(/\s*$/,'\n')+'p.content{margin:0}\n';
      if(!up.includes('.content a:visited'))up=up.replace(/\s*$/,'\n')+LINK_CSS;
      if(!up.includes('.attstrip'))up=up.replace(/\s*$/,'\n')+ATT_CSS;
      if(!up.includes('pre.ct'))up=up.replace(/\s*$/,'\n')+ENC_CSS;
      if(up!==t)await writeFile(ROOT,[],'styles.css',up);
    }catch(e){quiet('a stylesheet that cannot be updated is left as it is',e)}
  }
  if(!(await has(ROOT,'index.html')))await writeFile(ROOT,[],'index.html',indexHTML());
}
/* opts.unlock: a folder has just been chosen or reconnected, so if it has a vault the passphrase is asked for now (after a plain start the app stays locked until asked). */
async function loadFolder(opts){
  let data=null;
  try{data=await readIndex()}catch(e){quiet('no readable index: the folder is scanned instead',e)}
  adopt(data||{notes:[],labels:[]});resetMediaCache();
  LBE.lock();VAULT=null;LOG=null;                                 // the app always starts locked
  MODE='folder';fstate='ok';loaded=true;pending=false;gesturePending=false;
  try{localStorage.setItem('keep-mode','folder')}catch(e){quiet('storage is unavailable: the mode is only remembered for next time',e)}
  Host.status('');Host.collapsed();Host.render();
  await ensureScaffold();
  await loadVault();
  Host.crypt();
  runReconcile();
  Host.ready();
  if(opts&&opts.unlock&&VAULT&&!LBE.isUnlocked())setTimeout(()=>Host.unlock(),0);
}

function folderSave(){
  notes.forEach(ensureId);
  pending=true;Host.status('Saving…');
  clearTimeout(saveTimer);saveTimer=setTimeout(flush,1000);
}
function flush(){
  clearTimeout(saveTimer);
  chain=chain.then(()=>withBusy(doFlush)).catch(e=>{
    if(e&&(e.name==='NotAllowedError'||e.name==='SecurityError')){fstate='cached';gesturePending=true;Host.render()}
    else Host.status('Couldn’t save: '+((e&&e.message)||e),true);
  });
  return chain;
}
/* More than one copy of the app can be open at once (other tabs or windows, or another computer syncing the same folder).
   A .lock file is not used: a page cannot create a file "only if it does not exist", a sync service copies files with a delay,
   and a crash would leave a stale lock behind. Instead:
   - writes and id allocation take a Web Lock, so copies in the same browser take turns;
   - a new note number is checked against the folder (and claimed with a placeholder file when media is stored first);
   - before a note file is overwritten, its size and date are compared with what this copy last saw: if another copy changed it,
     the other version is kept and this copy's version is saved as a separate "conflict copy";
   - copies tell each other when they have saved, and the others re-check the folder. */
const claimed=new Set();
const bc=typeof BroadcastChannel==='function'?new BroadcastChannel('lil-bro-keep'):null;
let syncT=null;
if(bc)bc.onmessage=e=>{
  if(e.data&&e.data.t==='saved'&&MODE==='folder'&&fstate==='ok'){clearTimeout(syncT);syncT=setTimeout(()=>{if(!pending)runReconcile()},1500)}
};
function withLock(fn){return(navigator.locks&&navigator.locks.request)?navigator.locks.request('lil-bro-keep-folder',fn):fn()}
async function freeId(){
  let m=0;
  for(const x of notes)if(/^\d+$/.test(x.id))m=Math.max(m,+x.id);
  for(const r of RES)m=Math.max(m,r);
  let top=-1;
  for await(const[name,e]of ROOT.entries())if(e.kind==='directory'&&/^\d+$/.test(name))top=Math.max(top,+name);
  if(top>=0){const d=await ROOT.getDirectoryHandle(String(top));for await(const[fn]of d.entries()){const mm=/^(\d+)\.html?$/i.exec(fn);if(mm)m=Math.max(m,+mm[1])}}
  let id=m+1;
  while(await pageExists(id))id++;
  RES.add(id);return String(id);
}
/* Called before media is stored for a note that has not been saved yet: makes sure no other copy already owns the number. */
async function claimId(n){
  if(claimed.has(n.id)||lastW.has(n.id))return;
  await withLock(async()=>{
    if(await pageExists(n.id))n.id=await freeId();
    claimed.add(n.id);
    await writePage(n.id,'<!-- keep:meta\n{"id":"'+n.id+'","placeholder":true}\n-->\n');
  });
}
async function keepBoth(n,theirs,cur,todo){
  const copy=JSON.parse(JSON.stringify(n));
  Object.assign(copy,{att:[],fs:undefined});
  copy.id=await freeId();claimed.add(copy.id);
  copy.title=(n.title.trim()||'Untitled')+' (conflict copy)';copy.mod=Date.now();
  for(const a of n.att){try{const bl=await getBlob(a.id);if(bl)addAtt(copy,await putFolderMedia(copy,bl,a.kind,a.name,ROOT,a.w>0&&a.h>0?{w:a.w,h:a.h}:null))}catch(e){quiet('an attachment that cannot be copied is left out of the conflict copy',e)}}
  notes.push(copy);todo.push(copy);
  for(const k of Object.keys(n))delete n[k];          // the note itself takes the other copy's version, in place
  Object.assign(n,theirs);n.fs=cur;lastW.set(n.id,sigOf(n));
  toast(`Another copy of the app changed “${(theirs.title||'a note').trim()||'a note'}” while you were editing it. Your version was kept as a new note.`);
}
async function indexExtras(ids){
  try{
    const d=await readIndex();if(!d)return[];
    const out=[];
    for(const n of d.notes)if(!ids.has(n.id)&&await pageExists(n.id))out.push(n);
    return out;
  }catch(e){return[]}
}
function doFlush(){return withLock(doFlushLocked)}
async function doFlushLocked(){
  if(MODE!=='folder'||!ROOT||fstate!=='ok')return;
  const live=new Set(),todo=[];
  for(const n of notes){if(!/^\d+$/.test(n.id))ensureId(n);live.add(n.id);if(lastW.get(n.id)!==sigOf(n))todo.push(n)}
  const gone=[...lastW.keys()].filter(id=>!live.has(id)),lbNow=JSON.stringify(LB);
  if(!todo.length&&!gone.length&&lbNow===lastLB&&!indexDirty){pending=false;Host.status('Saved '+clock());return}
  const steps=()=>todo.length+gone.length+1,pr=busyProgress(steps());
  let i=0,k=0,g=0,changedIds=false,wrote=false;
  try{
  let unread=0,needUnlock=0;
  for(const n of todo){
    pr.set(k++,steps());
    if(n.stub&&!n.enc&&!(await loadNote(n))){unread++;continue}     // never write a page whose text could not be read: it would erase it (an encrypted note that is still sealed keeps its ciphertext as it is)
    if(!lastW.has(n.id)){
      if(!claimed.has(n.id)&&await pageExists(n.id)){n.id=await freeId();changedIds=true}
    }else{
      const cur=await pageStat(n.id);
      if(cur&&n.fs&&(cur[0]!==n.fs[0]||cur[1]!==n.fs[1])){
        let theirs=null;
        try{theirs=await parseNoteAsync(await(await readPage(n.id)).text(),pageName(n.id))}catch(e){quiet('their page cannot be read: it is treated as gone',e)}
        if(theirs&&sigOf(theirs)!==lastW.get(n.id)){await keepBoth(n,theirs,cur,todo);changedIds=true;wrote=true;continue}
      }
    }
    n.mod=(KEEP_MOD.has(n.id)||!lastW.has(n.id))?(n.mod||n.ts):Date.now();KEEP_MOD.delete(n.id);
    let html;
    try{html=await pageFor(n)}catch(e){if(e&&e.code==='LOCKED'){needUnlock++;continue}throw e}      // an encrypted note cannot be written while the app is locked: it stays pending
    const s=sigOf(n);
    await writePage(n.id,html);
    const wf=await readPage(n.id);n.fs=[wf.lastModified,wf.size];
    for(const d of (n._del||[]))await removeFile(ROOT,d.dir,d.name);delete n._del;      // plain copies of attachments are in place and the page points to them: the encrypted files can go
    n.plain=!n.enc;if(n.enc&&!n.stub)noteOpened(n);
    lastW.set(n.id,s);claimed.delete(n.id);wrote=true;
    if(todo.length>20&&++i%20===0)Host.status(`Saving ${i} of ${todo.length}…`);
  }
  for(const id of gone){pr.set(todo.length+(g++),steps());await removePage(id);lastW.delete(id);wrote=true}
  pr.set(todo.length+gone.length,steps());
  await writeFile(ROOT,[],'index.html',indexHTML(await indexExtras(new Set(notes.map(n=>n.id)))));
  lastLB=lbNow;indexDirty=false;pending=false;Host.status('Saved '+clock());cacheSoon();Host.flushed();
  if(wrote&&bc)try{bc.postMessage({t:'saved'})}catch(e){quiet('the other tab is gone',e)}
  if(unread)Host.status(`${unread} note${unread===1?'':'s'} couldn’t be read from the folder, so ${unread===1?'its':'their'} changes were not saved.`,true);
  if(needUnlock){Host.status(`Unlock to save changes to ${needUnlock===1?'an encrypted note':'encrypted notes'}.`,true);Host.needUnlock()}
  if(changedIds)Host.render();
  }finally{pr.end()}
}
window.addEventListener('beforeunload',e=>{if(MODE==='folder'&&pending){e.preventDefault();e.returnValue=''}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&MODE==='folder'){if(pending)flush();writeCache()}});

/* ---------- background check of the folder against the index ---------- */
const idle=()=>new Promise(res=>{const t=()=>Host.editing()?setTimeout(t,600):res();t()});
async function reconcile(){
  const byId=new Map(notes.map(n=>[n.id,n])),base=new Map(notes.map(n=>[n.id,n.fs?n.fs.join():''])),seen=new Set(),changes=[],bad=new Set();
  for await(const pg of eachPage()){
    seen.add(pg.id);
    const f=await pg.entry.getFile(),fs=[f.lastModified,f.size],cur=byId.get(pg.id);
    if(cur&&cur.fs&&cur.fs.join()===fs.join())continue;
    let n=null;try{n=await parseNoteAsync(await f.text(),pg.name);if(n){n.fs=fs;changes.push(n)}}catch(err){quiet('a page that cannot be read is reported as unreadable',err)}
    if(!n)bad.add(pg.dir+'/'+pg.name);
  }
  warnUnreadable(bad);
  return{changes,removed:notes.filter(n=>n.fs&&!seen.has(n.id)).map(n=>n.id),base};
}
/* Applies what the scan found, but only while no note is being edited, and never over unsaved local changes. */
async function applyReconcile(r){
  await idle();
  const byId=new Map(notes.map(n=>[n.id,n]));loadFailed.clear();
  const stale=cur=>lastW.get(cur.id)!==sigOf(cur)||(cur.fs?cur.fs.join():'')!==r.base.get(cur.id);
  let count=0,fsOnly=false;
  for(const n of r.changes){
    const cur=byId.get(n.id);
    if(cur){
      if(stale(cur))continue;
      if(sigOf(n)===sigOf(cur)){cur.fs=n.fs;fsOnly=true;continue}
      notes[notes.indexOf(cur)]=n;
    }else notes.push(n);
    lastW.set(n.id,sigOf(n));count++;
  }
  for(const id of r.removed){
    const cur=byId.get(id);
    if(!cur||stale(cur))continue;
    notes=notes.filter(x=>x!==cur);lastW.delete(id);count++;
  }
  if(count||fsOnly){
    LB=[...new Set([...LB,...notes.flatMap(n=>n.labels)])].sort((a,b)=>a.localeCompare(b));
    indexDirty=true;
    if(count)Host.render();
    folderSave();
  }
  return count;
}
async function runReconcile(){
  if(reconciling)return;reconciling=true;
  try{
    Host.status('Checking folder…');
    busyStart();let r;try{r=await reconcile()}finally{busyEnd()}
    const n=await applyReconcile(r);
    Host.status(pending?'Saving…':n?`Updated ${n} note${n===1?'':'s'} from the folder`:'');
  }catch(e){Host.status('')}
  finally{reconciling=false}
  cacheSoon();
}

/* ---------- startup, reconnect, disconnect ---------- */
async function bootFolder(){busyStart();try{await bootFolderImpl()}finally{busyEnd()}}
async function bootFolderImpl(){
  fstate='loading';Host.render();
  let hd=null;try{hd=await kvGet('dir')}catch(e){quiet('no remembered folder',e)}
  if(!hd){try{localStorage.removeItem('keep-mode')}catch(e){quiet('storage is unavailable',e)}location.reload();return}
  ROOT=hd;
  Host.crypt();                                                  // the Lock button shows at once if a vault is known, before the folder can be read
  let p='prompt';try{p=await hd.queryPermission({mode:'readwrite'})}catch(e){quiet('the permission cannot be queried: it is treated as needing a click',e)}
  let cache=null;try{cache=await kvGet('cache')}catch(e){quiet('there is no saved copy',e)}
  const haveCache=!!(cache&&Array.isArray(cache.notes));
  if(haveCache){
    notes=cache.notes.map(normNote);LB=(cache.labels||[]).slice();
    fstate='cached';gesturePending=p!=='granted';Host.render();
  }
  if(p==='granted')await loadFolder();
  else if(!haveCache){fstate='perm';Host.render()}
}
async function reconnectFolder(){
  if(reqBusy)return;reqBusy=true;
  let ok=false;
  try{ok=(await ROOT.requestPermission({mode:'readwrite'}))==='granted'}catch(e){quiet('the permission request failed: the person can try again',e)}
  reqBusy=false;
  if(!ok)return;
  gesturePending=false;
  if(loaded){fstate='ok';Host.render();flush()}else await loadFolder({unlock:true});
}
/* Stops using the folder and clears everything this browser holds (the saved copy, browser-stored notes and labels, their media), so the app starts again
   from its first view: the two welcome notes. The files in the folder are not touched. */
async function disconnectFolder(){
  try{await kvDel('dir');await kvDel('cache')}catch(e){quiet('nothing remembered to forget',e)}
  try{['keep-mode','keep-notes','keep-labels','keep-draft','keep-vault'].forEach(k=>localStorage.removeItem(k))}catch(e){quiet('storage is unavailable',e)}
  try{await idb('readwrite',s=>s.clear())}catch(e){quiet('the media store is unavailable',e)}
  resetMediaCache();
  location.reload();
}

/* ---------- operations the dialogs use ---------- */
/* The notes that can be copied into another folder. From browser storage: all of them. From a folder: the notes that are readable without a key and have been
   read; an encrypted note belongs to its own folder's vault and stays there. */
function copyableNotes(){return MODE==='folder'?notes.filter(n=>!n.enc&&!n.stub):notes}
/* Does this folder already hold notes? (Saves anything pending first and forgets the saved copy.) */
async function inspectFolder(hd){
  await flush();try{await kvDel('cache')}catch(e){quiet('there is no saved copy to remove',e)}
  return (await has(hd,'index.html'))||(await hasBuckets(hd));
}
/* Start using hd. o.load: read the notes already in it. Otherwise o.copy says whether the notes now in the app are copied into it.
   o.report(text) is told how far it has got. */
async function attachFolder(hd,o){
  const say=o.report||(()=>{});
  const fresh=await commitPendingEncryption(hd);          // encryption chosen while picking the folder: its vault goes into the folder first
  if(o.load){ROOT=hd;await kvSet('dir',hd);await loadFolder({unlock:!fresh});if(fresh)adoptPendingEncryption();return}
  if(o.copy){
    const src=JSON.parse(JSON.stringify(copyableNotes())).sort((a,b)=>a.ts-b.ts);
    let seq=0,done=0;const total=src.reduce((s,n)=>s+(n.att||[]).length,0);
    for(const n of src){
      n.id=String(++seq);
      if(fresh&&!n.plain&&!n.enc)n.enc=true;                  // notes from this browser are encrypted when the folder gets encryption, like imported ones
      const old=n.att||[];n.att=[];
      for(const a of old){
        const blob=await getBlob(a.id);if(!blob)continue;
        n.att.push(await putFolderMedia(n,blob,a.kind,a.name,hd,a.w>0&&a.h>0?{w:a.w,h:a.h}:null));
        say(`Copying media ${++done} of ${total}…`);
      }
    }
    notes=src;
  }else{notes=[];LB=[]}
  RES.clear();
  ROOT=hd;MODE='folder';fstate='ok';loaded=true;lastW=new Map();lastLB='[]';resetMediaCache();
  try{localStorage.setItem('keep-mode','folder')}catch(e){quiet('storage is unavailable: the mode is only remembered for next time',e)}
  await kvSet('dir',hd);
  await ensureScaffold();
  if(fresh)adoptPendingEncryption();
  say('Writing notes…');
  await doFlush();
  Host.collapsed();Host.render();
}
async function rescanFolder(report){
  await flush();
  const data=await scanFolder(report);
  adopt(data);await writeFile(ROOT,[],'index.html',indexHTML());
  return notes.length;
}
const rewriteStyles=()=>writeFile(ROOT,[],'styles.css',stylesCSS());
