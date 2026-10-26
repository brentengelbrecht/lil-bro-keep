/* store.js: where notes are kept. The rest of the app talks to Store and never to the two backends directly.
     browser backend: notes and labels in localStorage, attachment data in IndexedDB (media.js).
     folder backend:  one HTML page per note in a chosen folder (folder.js); its dialogs are in folder-ui.js.
   The backends are chosen by Store.mode ('browser' or 'folder'). Everything below is what both of them offer. */
'use strict';
let rawNotes=null,notesUnreadable=false;
notes=null;                               // nothing loaded yet (model.js starts it as an empty list)
try{rawNotes=localStorage.getItem('keep-notes')}catch(e){}
try{notes=JSON.parse(rawNotes)}catch(e){notesUnreadable=!!rawNotes}
if(rawNotes&&notes!==null&&!Array.isArray(notes))notesUnreadable=true;
if(notesUnreadable){                      // never let the next save silently replace data that exists but could not be read
  try{localStorage.setItem('keep-notes-unreadable-'+Date.now(),rawNotes)}catch(e){}
  setTimeout(()=>toast('Your saved notes couldn’t be read, so sample notes are shown. The unreadable data was kept in this browser (keys starting “keep-notes-unreadable”).'),600);
}
if(!Array.isArray(notes))notes=seed();
try{LB=JSON.parse(localStorage.getItem('keep-labels'))||[]}catch(e){}
if(!Array.isArray(LB))LB=[];
notes.forEach(n=>{n.labels=n.labels||[];n.att=partAtt(n.att);n.links=n.links||[];n.html=n.html?cleanRich(n.html):'';delete n.archived;n.labels.forEach(l=>{if(!LB.includes(l))LB.push(l)})});
LB.sort((a,b)=>a.localeCompare(b));
const wantFolder=(()=>{try{return localStorage.getItem('keep-mode')==='folder'}catch(e){return false}})();
if(wantFolder){notes=[];LB=[]}
/* Browser storage: what each note looked like when it was last saved, so that a save can tell which notes really changed and set their modified date
   (folder storage does the same when it writes a note's file). A reorder or a size backfill is not an edit: those ids are in KEEP_MOD. */
const SAVED_SIG=new Map();
notes.forEach(n=>SAVED_SIG.set(n.id,sigOf(n)));
function stampMod(){
  notes.forEach(n=>{
    const s=sigOf(n),old=SAVED_SIG.get(n.id);
    if(old!==undefined&&old!==s&&!KEEP_MOD.has(n.id))n.mod=Date.now();
    KEEP_MOD.delete(n.id);SAVED_SIG.set(n.id,s);
  });
}
let saveWarned=0;
const save=()=>{
  if(MODE==='folder'){folderSave();return}
  if(wantFolder)return;                   // the folder is not connected yet: what is on screen is only a saved copy, and must not replace browser storage
  stampMod();
  try{localStorage.setItem('keep-notes',JSON.stringify(notes));localStorage.setItem('keep-labels',JSON.stringify(LB))}
  catch(e){                               // storage full or blocked: say so (at most every 30 s) instead of losing edits silently
    if(Date.now()-saveWarned>30000){saveWarned=Date.now();toast('Couldn’t save your notes: this browser’s storage is full or blocked. Export your notes to keep a copy.')}
  }
};
function addMedia(...a){return withBusy(()=>addMediaImpl(...a))}
async function addMediaImpl(n,blob,kind,name,dest){
  const dim=kind==='image'?await measureImage(blob):null;
  dest=dest||(MODE==='folder'?ROOT:null);
  if(!dest){const id=uid();await putBlob(id,blob);return{id,kind,name,...dim}}
  return putFolderMedia(n,blob,kind,name,dest,dim);
}


const Store={
  get mode(){return MODE},                       // 'browser' | 'folder'
  get state(){return fstate},                    // folder only: 'ok' | 'loading' | 'perm' (needs reconnecting) | 'cached' (showing a saved copy)
  get gesturePending(){return gesturePending},   // a click is needed to ask for folder access
  get loaded(){return loaded},                   // the folder has been read
  get folderName(){return ROOT?ROOT.name:''},
  get canUseFolder(){return !!window.showDirectoryPicker},
  save,                                          // persist all notes (browser: now; folder: soon, then written)
  addMedia,                                      // store an attachment, returns its record {id,kind,name,w,h}
  boot:()=>bootFolder(), reconnect:()=>reconnectFolder(), disconnect:()=>disconnectFolder(),
  flush:()=>flush(),
  load:n=>loadNote(n),                           // read a note's text if it is not loaded yet (folder only); resolves true when it has its text
  loadAll:l=>loadMany(l),                        // the same for a list of notes
  search:(s,current,onHit)=>searchFiles(s,current,onHit),   // folder only: look through the pages of notes that are not loaded
  relabel:(a,b)=>relabelStored(a,b),             // a label was renamed or removed: bring stored notes in line
  // used by the folder dialogs
  inspect:hd=>inspectFolder(hd), attach:(hd,o)=>attachFolder(hd,o), rescan:r=>rescanFolder(r), rewriteStyles:()=>rewriteStyles(),
};

/* The one way to put a change on disk and on screen: change the notes, then commit().
   keepMod: ids whose modified date must not move (a reorder or a size backfill is not an edit).
   render:false: only save (the editor does this while a note is open).  delay: ms, saves once after a quiet moment. */
let commitT=0;
function commit(o){
  o=o||{};
  (o.keepMod||[]).forEach(id=>KEEP_MOD.add(id));
  const go=()=>{save();if(o.render!==false)Host.render()};
  if(o.delay){clearTimeout(commitT);commitT=setTimeout(go,o.delay)}else go();
}
