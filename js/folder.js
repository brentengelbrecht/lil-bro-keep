/* folder.js: the folder store. Every note becomes a standalone HTML page in a folder the person chooses (File System Access API, desktop Chrome).
   This file knows how to read, write, sync and repair that folder. It has no dialogs and no page code: when it needs the page it goes through Host
   (render, collapsed, editing, status). The dialogs are in folder-ui.js; the rest of the app reaches it through Store (store.js). */
'use strict';
let MODE='browser',ROOT=null,fstate='ok',loaded=false,pending=false;
let lastW=new Map(),lastLB='[]',saveTimer=null,chain=Promise.resolve();
let gesturePending=false,reqBusy=false,reconciling=false,indexDirty=false,cacheTimer=null;
const RES=new Set();

/* ---------- remembered folder handle (IndexedDB) ---------- */
const KV=new Promise((res,rej)=>{
  try{const r=indexedDB.open('keep-meta',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}
});
const kvOp=(mode,fn)=>KV.then(db=>new Promise((res,rej)=>{
  const t=db.transaction('kv',mode),r=fn(t.objectStore('kv'));
  t.oncomplete=()=>res(r.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);
}));
const kvGet=k=>kvOp('readonly',s=>s.get(k));
const kvSet=(k,v)=>kvOp('readwrite',s=>s.put(v,k));
const kvDel=k=>kvOp('readwrite',s=>s.delete(k));

/* ---------- file helpers ---------- */
async function dirAt(root,parts,create){let d=root;for(const p of parts)d=await d.getDirectoryHandle(p,{create:!!create});return d}
async function writeFile(root,parts,name,data){
  const d=await dirAt(root,parts,true),fh=await d.getFileHandle(name,{create:true}),w=await fh.createWritable();
  try{await w.write(data);await w.close()}catch(e){try{await w.abort()}catch(_){}throw e}
}
const readFile=async(root,parts,name)=>(await(await dirAt(root,parts)).getFileHandle(name)).getFile();
async function removeFile(root,parts,name){try{await(await dirAt(root,parts)).removeEntry(name)}catch(e){}}
async function has(root,name){try{await root.getFileHandle(name);return true}catch(e){return false}}
async function hasBuckets(root){for await(const[name,e]of root.entries())if(e.kind==='directory'&&/^\d+$/.test(name))return true;return false}

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
  for await(const[name,e]of ROOT.entries()){
    if(e.kind!=='directory'||!/^\d+$/.test(name))continue;
    for await(const[fn,fe]of e.entries()){
      if(fe.kind!=='file'||!/^\d+\.html?$/i.test(fn))continue;
      let n=null;try{const f=await fe.getFile();n=parseNoteFile(await f.text(),fn);if(n){n.fs=[f.lastModified,f.size];found.push(n)}}catch(err){}
      if(!n)bad.add(name+'/'+fn);
      if(report)report(found.length);
    }
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
  RES.clear();loadFailed.clear();
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
      if(up!==t)await writeFile(ROOT,[],'styles.css',up);
    }catch(e){}
  }
  if(!(await has(ROOT,'index.html')))await writeFile(ROOT,[],'index.html',indexHTML());
}
async function loadFolder(){
  let data=null;
  try{data=await readIndex()}catch(e){}
  adopt(data||{notes:[],labels:[]});resetMediaCache();
  MODE='folder';fstate='ok';loaded=true;pending=false;gesturePending=false;
  try{localStorage.setItem('keep-mode','folder')}catch(e){}
  Host.status('');Host.collapsed();Host.render();
  await ensureScaffold();
  runReconcile();
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
const existsAt=async(dir,name)=>{try{await(await dirAt(ROOT,dir)).getFileHandle(name);return true}catch(e){return false}};
const statAt=async(dir,name)=>{try{const f=await(await(await dirAt(ROOT,dir)).getFileHandle(name)).getFile();return[f.lastModified,f.size]}catch(e){return null}};
async function freeId(){
  let m=0;
  for(const x of notes)if(/^\d+$/.test(x.id))m=Math.max(m,+x.id);
  for(const r of RES)m=Math.max(m,r);
  let top=-1;
  for await(const[name,e]of ROOT.entries())if(e.kind==='directory'&&/^\d+$/.test(name))top=Math.max(top,+name);
  if(top>=0){const d=await ROOT.getDirectoryHandle(String(top));for await(const[fn]of d.entries()){const mm=/^(\d+)\.html?$/i.exec(fn);if(mm)m=Math.max(m,+mm[1])}}
  let id=m+1;
  while(await existsAt([String(bucket(id))],id+'.html'))id++;
  RES.add(id);return String(id);
}
/* Called before media is stored for a note that has not been saved yet: makes sure no other copy already owns the number. */
async function claimId(n){
  if(claimed.has(n.id)||lastW.has(n.id))return;
  await withLock(async()=>{
    if(await existsAt([String(bucket(n.id))],n.id+'.html'))n.id=await freeId();
    claimed.add(n.id);
    await writeFile(ROOT,[String(bucket(n.id))],n.id+'.html','<!-- keep:meta\n{"id":"'+n.id+'","placeholder":true}\n-->\n');
  });
}
async function keepBoth(n,theirs,cur,todo){
  const copy=JSON.parse(JSON.stringify(n));
  Object.assign(copy,{att:[],fs:undefined});
  copy.id=await freeId();claimed.add(copy.id);
  copy.title=(n.title.trim()||'Untitled')+' (conflict copy)';copy.mod=Date.now();
  for(const a of n.att){try{const bl=await getBlob(a.id);if(bl)addAtt(copy,await putFolderMedia(copy,bl,a.kind,a.name,ROOT,a.w>0&&a.h>0?{w:a.w,h:a.h}:null))}catch(e){}}
  notes.push(copy);todo.push(copy);
  for(const k of Object.keys(n))delete n[k];          // the note itself takes the other copy's version, in place
  Object.assign(n,theirs);n.fs=cur;lastW.set(n.id,sigOf(n));
  toast(`Another copy of the app changed “${(theirs.title||'a note').trim()||'a note'}” while you were editing it. Your version was kept as a new note.`);
}
async function indexExtras(ids){
  try{
    const d=await readIndex();if(!d)return[];
    const out=[];
    for(const n of d.notes)if(!ids.has(n.id)&&await existsAt([String(bucket(n.id))],n.id+'.html'))out.push(n);
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
  let unread=0;
  for(const n of todo){
    pr.set(k++,steps());
    if(n.stub&&!(await loadNote(n))){unread++;continue}     // never write a page whose text could not be read: it would erase it
    let dir=[String(bucket(n.id))];
    if(!lastW.has(n.id)){
      if(!claimed.has(n.id)&&await existsAt(dir,n.id+'.html')){n.id=await freeId();dir=[String(bucket(n.id))];changedIds=true}
    }else{
      const cur=await statAt(dir,n.id+'.html');
      if(cur&&n.fs&&(cur[0]!==n.fs[0]||cur[1]!==n.fs[1])){
        let theirs=null;
        try{theirs=parseNoteFile(await(await readFile(ROOT,dir,n.id+'.html')).text(),n.id+'.html')}catch(e){}
        if(theirs&&sigOf(theirs)!==lastW.get(n.id)){await keepBoth(n,theirs,cur,todo);changedIds=true;wrote=true;continue}
      }
    }
    n.mod=(KEEP_MOD.has(n.id)||!lastW.has(n.id))?(n.mod||n.ts):Date.now();KEEP_MOD.delete(n.id);
    const s=sigOf(n),html=noteHTML(n);
    await writeFile(ROOT,dir,n.id+'.html',html);
    const wf=await readFile(ROOT,dir,n.id+'.html');n.fs=[wf.lastModified,wf.size];
    lastW.set(n.id,s);claimed.delete(n.id);wrote=true;
    if(todo.length>20&&++i%20===0)Host.status(`Saving ${i} of ${todo.length}…`);
  }
  for(const id of gone){pr.set(todo.length+(g++),steps());await removeFile(ROOT,[String(bucket(id))],id+'.html');lastW.delete(id);wrote=true}
  pr.set(todo.length+gone.length,steps());
  await writeFile(ROOT,[],'index.html',indexHTML(await indexExtras(new Set(notes.map(n=>n.id)))));
  lastLB=lbNow;indexDirty=false;pending=false;Host.status('Saved '+clock());cacheSoon();
  if(wrote&&bc)try{bc.postMessage({t:'saved'})}catch(e){}
  if(unread)Host.status(`${unread} note${unread===1?'':'s'} couldn’t be read from the folder, so ${unread===1?'its':'their'} changes were not saved.`,true);
  if(changedIds)Host.render();
  }finally{pr.end()}
}
window.addEventListener('beforeunload',e=>{if(MODE==='folder'&&pending){e.preventDefault();e.returnValue=''}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&MODE==='folder'){if(pending)flush();writeCache()}});

/* ---------- saved copy for instant start ---------- */
function cacheSoon(){clearTimeout(cacheTimer);cacheTimer=setTimeout(writeCache,4000)}
async function writeCache(){
  if(MODE!=='folder'||fstate!=='ok')return;
  try{await kvSet('cache',{notes:notes.map(exportNote),labels:LB})}catch(e){}
}

/* ---------- background check of the folder against the index ---------- */
const idle=()=>new Promise(res=>{const t=()=>Host.editing()?setTimeout(t,600):res();t()});
async function reconcile(){
  const byId=new Map(notes.map(n=>[n.id,n])),base=new Map(notes.map(n=>[n.id,n.fs?n.fs.join():''])),seen=new Set(),changes=[],bad=new Set();
  for await(const[name,e]of ROOT.entries()){
    if(e.kind!=='directory'||!/^\d+$/.test(name))continue;
    for await(const[fn,fe]of e.entries()){
      if(fe.kind!=='file'||!/^\d+\.html?$/i.test(fn))continue;
      const id=fn.replace(/\.html?$/i,'');seen.add(id);
      const f=await fe.getFile(),fs=[f.lastModified,f.size],cur=byId.get(id);
      if(cur&&cur.fs&&cur.fs.join()===fs.join())continue;
      let n=null;try{n=parseNoteFile(await f.text(),fn);if(n){n.fs=fs;changes.push(n)}}catch(err){}
      if(!n)bad.add(name+'/'+fn);
    }
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

/* ---------- notes known by their details only (lazy loading) ----------
   At start-up the index gives every note's details (colour, pin, labels, attachments, dates, a title for its link) but not its text. Such a note is a
   "stub" (n.stub). Its page is read when a card for it is drawn, when it is opened, before it is rewritten, exported or searched.
   Reading a page never counts as an edit: lastW is brought in step so the note is not written back. */
const loading=new Map(),loadFailed=new Set();
async function readNoteFile(n){                       // {p: the parsed page, fs: the file's date and size}, or null
  try{
    const f=await readFile(ROOT,[String(bucket(n.id))],n.id+'.html'),p=parseNoteFile(await f.text(),n.id+'.html');
    return p?{p,fs:[f.lastModified,f.size]}:null;
  }catch(e){return null}
}
function applyLoaded(n,r){
  const clean=lastW.get(n.id)===sigOf(n),p=r.p;
  if(clean){                                          // nothing changed here since the index: the page is the whole truth
    for(const k of Object.keys(n))delete n[k];
    Object.assign(n,p);n.fs=r.fs;lastW.set(n.id,sigOf(n));
  }else{                                              // a pending change (pin, colour, label...) stays; only the text comes from the page
    Object.assign(n,{title:p.title,body:p.body,html:p.html,items:p.items,isList:p.isList});
    delete n.stub;delete n.idxTitle;n.fs=r.fs;
  }
}
function loadNote(n){                                 // resolves true once the note has its text
  if(!n.stub)return Promise.resolve(true);
  if(MODE!=='folder'||!ROOT||fstate!=='ok'||loadFailed.has(n.id))return Promise.resolve(false);
  if(!loading.has(n.id))loading.set(n.id,(async()=>{
    try{const r=await readNoteFile(n);if(!r){loadFailed.add(n.id);return false}if(n.stub)applyLoaded(n,r);return true}
    finally{loading.delete(n.id)}
  })());
  return loading.get(n.id);
}
async function loadMany(list){                        // a few pages at a time; resolves true if every note was read
  const todo=list.filter(n=>n.stub);let ok=true,i=0;
  await Promise.all(Array.from({length:Math.min(8,todo.length)},async()=>{while(i<todo.length){if(!(await loadNote(todo[i++])))ok=false}}));
  return ok;
}
/* Search: looks through the pages of notes that are not loaded. A match is loaded and reported with onHit(id). current() says whether this search is still the one wanted. */
async function searchFiles(s,current,onHit){
  if(MODE!=='folder'||!ROOT||fstate!=='ok')return;
  busyStart();
  try{
    for(const n of notes.slice()){
      if(!current())return;
      if(!n.stub)continue;
      const r=await readNoteFile(n);
      if(!current())return;
      if(r&&noteText(r.p).includes(s)&&n.stub){applyLoaded(n,r);onHit(n.id)}
    }
  }finally{busyEnd()}
}

/* ---------- label rename / delete: bring stored notes in line ---------- */
/* In folder mode every note the app knows is already in memory and is rewritten by the normal save, so after that
   completes this pass only needs to open the note files the app doesn't know about (for example, added outside
   the app) and fix those. In browser mode the save itself already rewrote everything. */
function relabelStored(old,nv){
  if(MODE!=='folder')return Promise.resolve();
  chain=chain.then(()=>withBusy(async()=>{
    Host.status(nv?'Updating label…':'Removing label…');
    await doFlush();
    const known=new Set(notes.map(n=>n.id));
    let fixed=0;
    for await(const[dirName,e]of ROOT.entries()){
      if(e.kind!=='directory'||!/^\d+$/.test(dirName))continue;
      for await(const[fn,fe]of e.entries()){
        if(fe.kind!=='file'||!/^\d+\.html?$/i.test(fn)||known.has(fn.replace(/\.html?$/i,'')))continue;
        try{
          const n=parseNoteFile(await(await fe.getFile()).text(),fn);
          if(!n||!n.labels.includes(old))continue;
          n.labels=[...new Set(nv?n.labels.map(l=>l===old?nv:l):n.labels.filter(l=>l!==old))];
          await writeFile(ROOT,[dirName],fn,noteHTML(n));fixed++;
        }catch(err){}
      }
    }
    Host.status(fixed?`Saved. Also updated ${fixed} other note file${fixed===1?'':'s'}.`:'Saved '+clock());
  })).catch(e=>Host.status('Couldn’t update stored notes: '+((e&&e.message)||e),true));
  return chain;
}

/* ---------- startup, reconnect, disconnect ---------- */
async function bootFolder(){busyStart();try{await bootFolderImpl()}finally{busyEnd()}}
async function bootFolderImpl(){
  fstate='loading';Host.render();
  let hd=null;try{hd=await kvGet('dir')}catch(e){}
  if(!hd){try{localStorage.removeItem('keep-mode')}catch(e){}location.reload();return}
  ROOT=hd;
  let p='prompt';try{p=await hd.queryPermission({mode:'readwrite'})}catch(e){}
  let cache=null;try{cache=await kvGet('cache')}catch(e){}
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
  try{ok=(await ROOT.requestPermission({mode:'readwrite'}))==='granted'}catch(e){}
  reqBusy=false;
  if(!ok)return;
  gesturePending=false;
  if(loaded){fstate='ok';Host.render();flush()}else await loadFolder();
}
/* Stops using the folder and clears everything this browser holds (the saved copy, browser-stored notes and labels, their media), so the app starts again
   from its first view: the two welcome notes. The files in the folder are not touched. */
async function disconnectFolder(){
  try{await kvDel('dir');await kvDel('cache')}catch(e){}
  try{['keep-mode','keep-notes','keep-labels'].forEach(k=>localStorage.removeItem(k))}catch(e){}
  try{await idb('readwrite',s=>s.clear())}catch(e){}
  resetMediaCache();
  location.reload();
}

/* ---------- media files in the folder ---------- */
async function putFolderMedia(n,blob,kind,name,dest,dim){
  ensureId(n);
  if(dest===ROOT)await claimId(n);
  const dir=['media',{image:'images',video:'video',audio:'audio'}[kind]||'images',String(bucket(n.id))];
  const used=new Set((n.att||[]).map(a=>a.id));
  let k=1,path;
  do{path=dir.join('/')+'/'+n.id+'-'+(k++)+'.'+extOf(name,blob.type)}while(used.has(path));
  await writeFile(dest,dir,path.split('/').pop(),blob);
  return{id:path,kind,name,...dim};
}
Media.readPath=path=>{const p=path.split('/'),n=p.pop();return ROOT?readFile(ROOT,p,n):Promise.resolve(null)};
Media.removePath=id=>{const p=id.split('/'),n=p.pop();if(ROOT)removeFile(ROOT,p,n)};

/* ---------- operations the dialogs use ---------- */
/* Does this folder already hold notes? (Saves anything pending first and forgets the saved copy.) */
async function inspectFolder(hd){
  await flush();try{await kvDel('cache')}catch(e){}
  return (await has(hd,'index.html'))||(await hasBuckets(hd));
}
/* Start using hd. o.load: read the notes already in it. Otherwise o.copy says whether the notes now in the app are copied into it.
   o.report(text) is told how far it has got. */
async function attachFolder(hd,o){
  const say=o.report||(()=>{});
  if(o.load){ROOT=hd;await kvSet('dir',hd);await loadFolder();return}
  if(o.copy){
    const src=JSON.parse(JSON.stringify(notes)).sort((a,b)=>a.ts-b.ts);
    let seq=0,done=0;const total=src.reduce((s,n)=>s+(n.att||[]).length,0);
    for(const n of src){
      n.id=String(++seq);
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
  try{localStorage.setItem('keep-mode','folder')}catch(e){}
  await kvSet('dir',hd);
  await ensureScaffold();
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
