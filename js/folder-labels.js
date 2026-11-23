/* folder-labels.js: renaming or deleting a label in the notes already stored in the folder. */
'use strict';
/* ---------- label rename / delete: bring stored notes in line ---------- */
/* In folder mode every note the app knows is already in memory and is rewritten by the normal save, so after that
   completes this pass only needs to open the note files the app doesn't know about (for example, added outside
   the app) and fix those. In browser mode the save itself already rewrote everything. */
function relabelStored(old,nv){
  if(MODE!=='folder')return Promise.resolve();
  /* The labels of encrypted notes are inside their ciphertext: the change is also written to the deferred-action log, which is done to those notes when they can be reached. */
  const logged=deferAction(nv?{op:'rename',from:old,to:nv}:{op:'delete',label:old});
  chain=chain.then(()=>withBusy(async()=>{
    Host.status(nv?'Updating label…':'Removing label…');
    if(logged)await logged;
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
        }catch(err){quiet('a page that cannot be read or rewritten is left as it is',err)}
      }
    }
    Host.status(fixed?`Saved. Also updated ${fixed} other note file${fixed===1?'':'s'}.`:'Saved '+clock());
  })).catch(e=>Host.status('Couldn’t update stored notes: '+((e&&e.message)||e),true));
  if(logged)chain=chain.then(()=>{if(LBE.isUnlocked())applyDeferredActions()});          // unlocked: the encrypted notes not read yet are brought up to date in the background
  return chain;
}
