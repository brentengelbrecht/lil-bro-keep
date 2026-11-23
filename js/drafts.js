/* drafts.js: editor drafts. The rule is: do not lose data if at all possible.
   While a note is open in the editor, a copy of it is kept in the browser (localStorage, key keep-draft). It is removed once the note has been closed and
   written to the folder. If the browser or the tab dies first, the next start finds the draft and offers to continue editing it or to discard it.
   Folder storage only (browser storage saves a note at once).

   SECURITY: a draft is NOT encrypted, not even for an encrypted note (or for attachments added during the session: their files are encrypted, but the
   draft holds the note's text). That is a deliberate choice. The protection is closing the note, which writes it encrypted to the folder and deletes the
   draft. A note left open, or a crash before Close, leaves a readable copy in this browser's storage until the draft is continued or discarded.

   Only one draft exists at a time. Each page has a random session id and holds a Web Lock named after it for as long as it is open; at start, a draft whose
   session still holds its lock belongs to a tab that is open and is left alone, otherwise it is left over from a crash. */
'use strict';
const Drafts=(()=>{
  const KEY='keep-draft',SID=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Math.random()).slice(2)+Date.now();
  const lockName=sid=>'lil-bro-keep-session-'+sid;
  if(navigator.locks&&navigator.locks.request)navigator.locks.request(lockName(SID),()=>new Promise(()=>{}));   // held until this page closes or crashes
  let cur=null,closing=null,timer=0,dirty=false;
  const on=()=>Store.mode==='folder';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}};
  const remove=()=>{try{localStorage.removeItem(KEY)}catch(e){quiet('storage is unavailable: there is no draft to remove',e)}};
  const copy=n=>({id:n.id,title:n.title,body:n.body,html:n.html,isList:n.isList,items:n.items,labels:n.labels,links:n.links,att:n.att,color:n.color,pinned:n.pinned,
    trashed:n.trashed,ts:n.ts,mod:n.mod,pos:n.pos,sig:n.sig,enc:!!n.enc,plain:n.plain||undefined});
  function write(){
    clearTimeout(timer);timer=0;
    if(!cur||!on()||!dirty)return;
    dirty=false;
    try{cur.sync&&cur.sync()}catch(e){quiet('the editor could not copy what is on screen: the previous draft stays',e)}
    if(empty(cur.n)){remove();return}
    try{localStorage.setItem(KEY,JSON.stringify({v:1,sid:SID,ts:Date.now(),isNew:cur.isNew,enc:!!cur.n.enc,note:copy(cur.n)}))}catch(e){quiet('storage is full or unavailable: a draft is a best effort',e)}
  }
  /* The editor is open on note n (isNew: it has not been saved yet). sync() copies what is on screen into the note. */
  function start(n,isNew,sync){if(on()){cur={n,isNew,sync};dirty=false}}
  function touch(){if(!cur||!on())return;dirty=true;clearTimeout(timer);timer=setTimeout(write,600)}
  /* The editor was closed. The draft stays until the note is really in the folder. */
  function end(n,o){
    if(!cur)return;
    write();cur=null;
    if(o&&o.discard){remove();closing=null;return}
    closing={n};
    Store.flush().then(check);
  }
  function check(){
    if(closing&&Store.isSaved(closing.n)){closing=null;remove()}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)write()});
  window.addEventListener('beforeunload',write);

  const isLive=async sid=>{
    try{const q=await navigator.locks.query();return[...(q.held||[]),...(q.pending||[])].some(l=>l.name===lockName(sid))}catch(e){return false}
  };
  /* At start: offer to continue a draft left by a session that is gone. Nothing is shown of an encrypted note's text until it is unlocked. */
  async function recover(){
    if(!on()||Store.state!=='ok'||cur)return;
    const d=read();
    if(!d||!d.note||d.sid===SID||await isLive(d.sid))return;
    const ask=await askDialog({label:'Unsaved edits',panelClass:'dlg2',html:`<span class="dic">${ic(d.enc?'lockOn':'note',22)}</span><h3>Unsaved edits from a previous session</h3>
        <p>${d.enc?'A note you were editing was not saved before the app closed. Unlock to continue editing it, or discard the changes.':'A note you were editing was not saved before the app closed. Continue editing it, or discard the changes.'}</p>
        <button class="big" data-d="go">${d.enc?'Unlock and continue':'Continue'}</button>
        <div class="cl"><button class="done" data-d="discard">Discard</button></div>`},(dlg,set)=>{
      dlg.panel.addEventListener('click',e=>{const b=e.target.closest('[data-d]');if(!b)return;set(b.dataset.d);dlg.close()});
    },'later');
    if(ask==='discard'){remove();return}
    if(ask!=='go')return;
    if(d.enc&&!Store.crypto.unlocked&&!(await Host.unlock()))return;     // the draft stays until it is continued or discarded
    const x=d.note;
    let n=notes.find(m=>m.id===x.id);
    const wasPlain=!!(n&&n.plain);                                                 // what the folder holds decides: a note stored unencrypted stays unencrypted
    if(n){for(const k of Object.keys(n))delete n[k];Object.assign(n,x)}           // the note takes the draft's content (it is written to the folder on the next save)
    else{n=normNote({...x});notes.unshift(n)}
    if(wasPlain){n.plain=true;n.enc=false}
    delete n.stub;delete n.idxTitle;delete n.ct;delete n.files;
    save();
    openModal(n);
  }
  return{start,touch,end,check,recover};
})();
