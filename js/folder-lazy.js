/* folder-lazy.js: notes known by their details only. At start the index gives each note's details but not its text; the page is read when a card is drawn,
   when the note is opened, before it is rewritten, exported or searched. Also the background search through the pages of notes that are not read yet. */
'use strict';
/* ---------- notes known by their details only (lazy loading) ----------
   At start-up the index gives every note's details (colour, pin, labels, attachments, dates, a title for its link) but not its text. Such a note is a
   "stub" (n.stub). Its page is read when a card for it is drawn, when it is opened, before it is rewritten, exported or searched.
   Reading a page never counts as an edit: lastW is brought in step so the note is not written back. */
const loading=new Map(),loadFailed=new Set();
async function readNoteFile(n){                       // {p: the parsed page, fs: the file's date and size}, or null
  try{
    const f=await readPage(n.id),p=await parseNoteAsync(await f.text(),pageName(n.id),true);
    return p?{p,fs:[f.lastModified,f.size]}:null;
  }catch(e){return null}
}
function applyLoaded(n,r){
  const clean=lastW.get(n.id)===sigOf(n),p=r.p;
  if(clean){                                          // nothing changed here since the index: the page is the whole truth
    for(const k of Object.keys(n))delete n[k];
    Object.assign(n,p);n.fs=r.fs;
    if(p.deferredApplied){delete n.deferredApplied;save()}         // changed by logged actions: it has to be written
    else lastW.set(n.id,sigOf(n));
  }else{                                              // a pending change (pin, colour, label...) stays; only the text comes from the page
    Object.assign(n,{title:p.title,body:p.body,html:p.html,items:p.items,isList:p.isList});
    if(p.enc)Object.assign(n,{labels:p.labels,links:p.links,att:p.att,sig:p.sig,logPos:p.logPos});   // everything private comes from the ciphertext (only the colour, pin and trash are the local change)
    if(p.deferredApplied)save();
    delete n.stub;delete n.idxTitle;delete n.lp;n.fs=r.fs;
  }
  if(n.enc)noteOpened(n);
}
function loadNote(n){                                 // resolves true once the note has its text
  if(!n.stub)return Promise.resolve(true);
  if(MODE!=='folder'||!ROOT||fstate!=='ok'||loadFailed.has(n.id))return Promise.resolve(false);
  if(n.enc&&!LBE.isUnlocked())return Promise.resolve(false);     // an encrypted note's text needs the passphrase
  if(!loading.has(n.id))loading.set(n.id,(async()=>{
    try{
      const r=await readNoteFile(n);if(!r){loadFailed.add(n.id);return false}
      if(r.p.stub){n.ct=r.p.ct;n.files=r.p.files;loadFailed.add(n.id);return false}      // still sealed: it could not be decrypted (damaged, or not made with this key)
      if(n.stub)applyLoaded(n,r);return true}
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
