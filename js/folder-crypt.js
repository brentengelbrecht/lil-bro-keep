/* folder-crypt.js: encryption in the folder store. The vault (vault.json), unlocking and locking, reading encrypted pages, writing them, and turning a note's
   attachments back into plain files. All the scrambling itself is in encrypt.js (LBE); this file decides when it happens. Dialogs: crypt-ui.js. */
'use strict';
const LBE=window.LilBroEncrypt;                       // encrypt.js: every encryption and decryption call goes through it
let VAULT=null;                                       // the vault file's contents (vault.json), or null: encryption has not been set up
const ATT_TYPE=new Map();                            // media type of each encrypted attachment file (it is kept inside the encrypted note)
let LOG=null;                                         // the deferred-action log, read and opened: {entries:[…]}. Only while unlocked.
const LOG_FILE='actions.log';

/* ---------- encryption: vault, locking, and writing encrypted notes ----------
   Everything that scrambles or unscrambles goes through encrypt.js (LBE). The vault (vault.json in the folder's root) holds the wrapped keys; the app
   starts locked, and the data key lives only in memory while it is unlocked. */
const readVault=async()=>JSON.parse(await(await readFile(ROOT,[],'vault.json')).text());
/* Whether a vault exists is remembered in this browser (keep-vault), so the Lock button can show before the folder is reachable again, which is how every browser
   session starts. The vault itself can only be read once the folder is. */
const vaultHint=()=>{try{return localStorage.getItem('keep-vault')==='1'}catch(e){return false}};
const setVaultHint=on=>{try{if(on)localStorage.setItem('keep-vault','1');else localStorage.removeItem('keep-vault')}catch(e){quiet('storage is unavailable: the vault hint is only a shortcut',e)}};
async function loadVault(){
  try{VAULT=await readVault();setVaultHint(true)}
  catch(e){if(e&&e.name==='NotFoundError'){VAULT=null;setVaultHint(false)}}      // any other failure: keep what is known
}
const writeVault=v=>withLock(()=>writeFile(ROOT,[],'vault.json',JSON.stringify(v,null,2)));
/* A page is read and, when it is encrypted and the app is unlocked, its text is decrypted. Locked, an encrypted note stays a stub (sealed). */
async function parseNoteAsync(text,fname,apply){
  const p=parseNoteFile(text,fname);
  if(p&&p.enc&&p.ct&&LBE.isUnlocked()){
    try{
      const j=JSON.parse(await LBE.decryptBody(p.ct,p.id));
      Object.assign(p,{title:j.title||'',body:j.body||'',html:j.html?cleanRich(j.html):'',isList:!!j.isList,items:j.items||[],labels:j.labels||[],links:j.links||[],att:partAtt(j.att)});
      if(j.sig)p.sig=j.sig;
      if(typeof j.logPos==='number')p.logPos=j.logPos;delete p.lp;
      delete p.stub;delete p.idxTitle;delete p.ct;delete p.files;
      for(const a of p.att)if(a.type!==undefined)ATT_TYPE.set(a.id,a.type);
      if(apply&&LOG&&applyPending(p,true))p.deferredApplied=true;           // actions logged while this note was out of reach are done now (the caller saves it)
      noteOpened(p);
    }catch(e){quiet('a page that cannot be decrypted (damaged, or made with another key) stays sealed',e)}                                       // damaged or not made with this key: it stays sealed
  }
  return p;
}
/* An encrypted note's labels are known only after it is opened: they join the sidebar, and stay out of the index. */
function noteOpened(n){
  for(const l of n.labels||[]){PRIVATE_LABELS.add(l);if(!LB.includes(l)){LB.push(l);LB.sort((a,b)=>a.localeCompare(b))}}
}
/* The text of a note's page: plain, or encrypted when the note is. */
async function pageFor(n){
  if(n.plain&&n.enc)n.enc=false;                       // a note that is stored unencrypted is never written encrypted again, whatever a draft or an import says
  if(!n.enc){await plainMedia(n);return noteHTML(n)}
  if(n.stub){                                         // still sealed (not unlocked or never opened): only its details changed, so its ciphertext is kept
    if(!n.ct){const r=await readNoteFile(n);if(!r||!r.p.ct)throw LBE.EncryptError('BAD_FORMAT','The encrypted note could not be read.');n.ct=r.p.ct;n.files=r.p.files}
    return sealedHTML(n,n.ct);
  }
  if(LOG)n.logPos=LOG.entries.length;                  // a note is written up to date with the log: it has had every action in it
  const o={title:n.title,body:n.body,html:n.html,isList:n.isList,items:n.items,labels:n.labels,links:n.links,att:n.att,sig:n.sig,logPos:n.logPos},body=JSON.stringify(o,(k,v)=>(v===''||v===false||v===undefined||(Array.isArray(v)&&!v.length))?undefined:v);    // empty fields are left out, so a short note stays short and is padded
  return sealedHTML(n,(await LBE.encryptBody(body,n.id)).token);
}
/* A note that has been made unencrypted gets plain copies of its attachments (streamed, so large videos are fine). The encrypted files are deleted only after the
   page that points to the plain ones has been written (n._del), so an interruption leaves extra files, never a broken note. */
async function plainMedia(n){
  let changed=false;
  for(const a of n.att||[]){
    if(!/\.enc$/.test(a.id))continue;
    const p=a.id.split('/'),nm=p.pop(),d=await dirAt(ROOT,p,true),ext=extOf(a.name,a.type);
    let k=0,out;
    do{out=nm.replace(/\.enc$/,'')+(k?'_'+k:'')+'.'+ext;k++}while(await existsAt(p,out));
    const src=await readFile(ROOT,p,nm),fh=await d.getFileHandle(out,{create:true}),w=await fh.createWritable();
    try{await LBE.decryptAttachmentTo(src,n.id,w);await w.close()}catch(e){try{await w.abort()}catch(_){quiet('cleaning up after a failed decryption',_)}try{await d.removeEntry(out)}catch(_){quiet('cleaning up after a failed decryption',_)}throw e}
    (n._del=n._del||[]).push({dir:p,name:nm});
    a.id=p.join('/')+'/'+out;delete a.type;changed=true;
  }
  if(changed)resetMediaCache();
}
/* ---------- deferred actions ----------
   Some changes cannot reach encrypted notes while the app is locked (the labels are inside the ciphertext). They are written to an append-only log in the folder
   (actions.log, one sealed line per action; see encrypt.js for how a line can be written without the key) and done when the app is next unlocked.
   Every encrypted note remembers how many log lines it is up to date with (logPos, inside the ciphertext; lp in its page head as a hint), so each action is
   done once per note, however many times the note is opened, and notes made after an action are never changed by it. */
async function appendLine(root,name,line){
  const fh=await root.getFileHandle(name,{create:true}),f=await fh.getFile(),size=f.size;
  const prefix=size>0&&(await f.slice(size-1,size).text())!=='\n'?'\n':'';        // a line cut short by a crash must not run into the next one
  const w=await fh.createWritable({keepExistingData:true});
  try{await w.seek(size);await w.write(prefix+line+'\n');await w.close()}
  catch(e){try{await w.abort()}catch(_){quiet('cleaning up after a failed append',_)}throw e}
}
async function upgradeVault(){                        // a vault made before the log existed gets its log key (needs the app unlocked)
  const v=await LBE.addLogKey(VAULT);
  await writeVault(v);VAULT=v;
}
async function loadLog(){
  LOG=null;
  if(!VAULT||!VAULT.log)return;
  let text='';
  try{text=await(await readFile(ROOT,[],LOG_FILE)).text()}catch(e){quiet('there is no log yet',e)}
  LOG={entries:await LBE.openLogEntries(VAULT,text.split('\n').filter(Boolean))};      // one entry per line; a line that cannot be opened is null and counts as a line
}
const labelIn={
  rename(n,a){if(typeof a.from!=='string'||typeof a.to!=='string'||!n.labels.includes(a.from))return false;n.labels=[...new Set(n.labels.map(l=>l===a.from?a.to:l))];return true},
  delete(n,a){if(typeof a.label!=='string'||!n.labels.includes(a.label))return false;n.labels=n.labels.filter(l=>l!==a.label);return true},
};
/* Brings a decrypted note up to date with the log. Only the actions listed in labelIn are ever done, whatever the log says. Returns true if the note moved on
   (its labels changed or only its place in the log), which means it has to be written. A note that has never been written (fromDisk false) is new: the log's
   past is not for it, so it starts at the end. A note written before the log existed has no place yet and starts at the beginning. */
function applyPending(n,fromDisk){
  if(!LOG)return false;
  const len=LOG.entries.length;
  let i=n.logPos;
  if(i===undefined){if(!fromDisk){n.logPos=len;return false}i=0}
  if(i>=len)return false;
  for(;i<len;i++){
    const a=LOG.entries[i];
    if(a&&Object.prototype.hasOwnProperty.call(labelIn,a.op))labelIn[a.op](n,a);
  }
  n.logPos=len;
  return true;
}
/* Records an action. Known in memory at once (notes written from now on carry the right position), written to the log in the background. Returns the promise of
   the file write, or null when there is no encryption. */
function deferAction(action){
  if(!VAULT)return null;
  const entry={...action};
  if(LOG)LOG.entries.push(entry);
  return(async()=>{
    try{
      if(!VAULT.log){
        if(!LBE.isUnlocked()){Host.status('This folder’s encryption was set up by an older version: unlock once, then rename the label again, so it can reach the encrypted notes.',true);return false}
        await upgradeVault();
      }
      const line=await LBE.sealLogEntry(VAULT,{...action,ts:Date.now()});
      await withLock(()=>appendLine(ROOT,LOG_FILE,line));
      return true;
    }catch(e){
      if(LOG&&LOG.entries[LOG.entries.length-1]===entry)LOG.entries.pop();
      Host.status('Couldn’t record the label change for the encrypted notes: '+((e&&e.message)||e),true);
      return false;
    }
  })();
}
/* After unlocking (and after a label change): the encrypted notes still behind the log are brought up to date, one at a time in the background. A note that is not
   read yet is read, which does it; the page is then rewritten by the normal save. Notes known to be up to date (lp) are not even opened. */
let sweeping=false;
async function applyDeferredActions(){
  if(sweeping||!LOG||!LOG.entries.length)return;
  sweeping=true;busyStart();
  try{
    for(const n of notes.filter(x=>x.enc)){
      if(!LOG||!LBE.isUnlocked())break;
      if(n.stub){if((n.lp||0)>=LOG.entries.length)continue;await loadNote(n)}
      else if(applyPending(n,!!n.fs))save();
      await new Promise(r=>setTimeout(r,0));
    }
  }finally{busyEnd();sweeping=false}
}
/* A locked encrypted note is drawn as its ciphertext: read the token from its page (nothing is decrypted). */
async function peekSealed(n){
  if(!n.enc||!n.stub||n.ct||MODE!=='folder'||!ROOT||fstate!=='ok')return;
  const r=await readNoteFile(n);
  if(r&&r.p.ct){n.ct=r.p.ct;n.files=r.p.files}
}
/* Encryption chosen while a folder is being picked. The person is asked first (the passphrase and recovery key), but nothing is written and no key is put to use
   until the switch to that folder really goes ahead: the vault is kept here (PENDING) and written into the folder by attachFolder. Cancelling leaves no trace. */
let PENDING=null;
async function prepareEncryption(passphrase){
  const r=await LBE.createVault(passphrase,{install:false});
  PENDING={vault:r.vault,key:r.key};
  return r.recoveryKey;
}
const discardPendingEncryption=()=>{PENDING=null};
/* The switch goes ahead: vault.json is written into the folder and its key is put to use (so notes copied in can be encrypted with it). */
async function commitPendingEncryption(hd){
  if(!PENDING)return false;
  await removeFile(hd,[],'vault.json');               // an old vault (a folder whose notes are gone) is deleted, then the new one written
  await writeFile(hd,[],'vault.json',JSON.stringify(PENDING.vault,null,2));
  await writeFile(hd,[],LOG_FILE,'');                  // a new, empty log (an old one belonged to the old vault's key)
  LBE.useKey(PENDING.key);
  return true;
}
/* The folder is now the active one: its vault is the app's vault. */
function adoptPendingEncryption(){
  if(!PENDING)return;
  LBE.useKey(PENDING.key);VAULT=PENDING.vault;LOG={entries:[]};setVaultHint(true);PENDING=null;Host.crypt();      // (loading a folder locks the app: the person has just typed the passphrase, so it is unlocked again)
}
async function setupEncryption(passphrase){
  if(MODE!=='folder'||fstate!=='ok')throw LBE.EncryptError('BAD_FORMAT','Encryption needs a notes folder.');
  const r=await LBE.createVault(passphrase);
  await writeVault(r.vault);VAULT=r.vault;setVaultHint(true);
  LOG={entries:[]};await writeFile(ROOT,[],LOG_FILE,'');           // the deferred-action log starts empty
  Host.crypt();return r.recoveryKey;
}
async function afterUnlock(){
  loadFailed.clear();
  try{if(VAULT&&!VAULT.log)await upgradeVault();await loadLog()}
  catch(e){Host.status('Couldn’t read the deferred-action log: '+((e&&e.message)||e),true)}
  Host.crypt();
  setTimeout(applyDeferredActions,0);                 // in the background: the app is usable at once
}
async function unlockApp(passphrase){await LBE.unlock(VAULT,passphrase);await afterUnlock()}
async function unlockWithRecovery(key){await LBE.unlockWithRecoveryKey(VAULT,key);await afterUnlock()}
/* Locks: pending changes are written first (they need the key), then the key and every decrypted note are dropped from memory. The note being edited is
   left as it is; saving it later asks for the passphrase again. */
async function lockApp(){
  if(!LBE.isUnlocked())return;
  await flush();
  LBE.lock();LOG=null;
  const keep=Host.editingNote();
  for(const n of notes){
    if(!n.enc||n.stub||n===keep||lastW.get(n.id)!==sigOf(n))continue;      // a note with changes that could not be written is not dropped
    n.files=(n.att||[]).map(a=>a.id);
    Object.assign(n,{title:'',body:'',html:'',isList:false,items:[],labels:[],links:[],att:[],sig:undefined,stub:true,idxTitle:'Encrypted note',ct:undefined,lp:n.logPos,logPos:undefined});
    lastW.set(n.id,sigOf(n));
  }
  LB=LB.filter(l=>!PRIVATE_LABELS.has(l)||notes.some(x=>!x.enc&&(x.labels||[]).includes(l)));
  PRIVATE_LABELS.clear();ATT_TYPE.clear();resetMediaCache();
  Host.crypt();
}
/* Forgotten passphrase: the recovery key sets a new one. */
async function resetPassphraseApp(recoveryKey,next){
  const v=await LBE.resetPassphraseWithRecoveryKey(VAULT,recoveryKey,next);
  await writeVault(v);VAULT=v;
}
async function changePassphraseApp(current,next){
  const v=await LBE.changePassphrase(VAULT,current,next);
  await writeVault(v);VAULT=v;
}
