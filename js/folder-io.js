/* folder-io.js: the folder store's file layer. The remembered folder handle (IndexedDB), reading and writing files, where a note's page lives (bucketDir,
   readPage, writePage, eachPage), the media files in the folder, and the saved copy that lets the app start before the folder is reachable.
   It decides nothing about when to write: that is folder.js. */
'use strict';
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
  try{await w.write(data);await w.close()}catch(e){try{await w.abort()}catch(_){quiet('cleaning up after a failed write',_)}throw e}
}
const readFile=async(root,parts,name)=>(await(await dirAt(root,parts)).getFileHandle(name)).getFile();
async function removeFile(root,parts,name){try{await(await dirAt(root,parts)).removeEntry(name)}catch(e){quiet('the file is already gone',e)}}
async function has(root,name){try{await root.getFileHandle(name);return true}catch(e){return false}}
async function hasBuckets(root){for await(const[name,e]of root.entries())if(e.kind==='directory'&&/^\d+$/.test(name))return true;return false}

const existsAt=async(dir,name)=>{try{await(await dirAt(ROOT,dir)).getFileHandle(name);return true}catch(e){return false}};
const statAt=async(dir,name)=>{try{const f=await(await(await dirAt(ROOT,dir)).getFileHandle(name)).getFile();return[f.lastModified,f.size]}catch(e){return null}};

/* ---------- where a note's page lives ---------- */
const bucketDir=id=>[String(bucket(id))];                 // the sub-folder of a note's page (id ÷ 100)
const pageName=id=>id+'.html';
const readPage=(id,root=ROOT)=>readFile(root,bucketDir(id),pageName(id));            // the File of a note's page
const writePage=(id,html,root=ROOT)=>writeFile(root,bucketDir(id),pageName(id),html);
const removePage=(id,root=ROOT)=>removeFile(root,bucketDir(id),pageName(id));
const pageExists=id=>existsAt(bucketDir(id),pageName(id));
const pageStat=id=>statAt(bucketDir(id),pageName(id));            // [modified, size] of a note's page, or null
/* Every note page in the folder, one at a time: {dir, name, id, entry}. The one place that knows how pages are laid out in sub-folders. */
async function* eachPage(root=ROOT){
  for await(const[dir,e]of root.entries()){
    if(e.kind!=='directory'||!/^\d+$/.test(dir))continue;
    for await(const[name,fe]of e.entries()){
      if(fe.kind!=='file'||!/^\d+\.html?$/i.test(name))continue;
      yield{dir,name,id:name.replace(/\.html?$/i,''),entry:fe};
    }
  }
}

/* ---------- saved copy for instant start ---------- */
function cacheSoon(){clearTimeout(cacheTimer);cacheTimer=setTimeout(writeCache,4000)}
async function writeCache(){
  if(MODE!=='folder'||fstate!=='ok')return;
  try{await kvSet('cache',{notes:notes.map(exportNote),labels:LB})}catch(e){quiet('the saved copy is a best effort (storage may be full)',e)}
}

/* ---------- media files in the folder ---------- */
async function putFolderMedia(n,blob,kind,name,dest,dim){
  ensureId(n);
  if(dest===ROOT)await claimId(n);
  const enc=!!n.enc;                                   // attachments of an encrypted note are encrypted files (.enc), in chunks, as they are written (with the key in use: the destination's)
  if(enc&&!LBE.isUnlocked())throw LBE.EncryptError('LOCKED','The app is locked. Unlock it to attach files to an encrypted note.');
  const dir=['media',{image:'images',video:'video',audio:'audio'}[kind]||'images',String(bucket(n.id))];
  const used=new Set((n.att||[]).map(a=>a.id));
  let k=1,path;
  do{path=dir.join('/')+'/'+n.id+'-'+(k++)+'.'+(enc?'enc':extOf(name,blob.type))}while(used.has(path));
  if(enc){
    const d=await dirAt(dest,dir,true),fh=await d.getFileHandle(path.split('/').pop(),{create:true}),w=await fh.createWritable();
    try{await LBE.encryptAttachmentTo(blob,n.id,w);await w.close()}catch(e){try{await w.abort()}catch(_){quiet('cleaning up after a failed write',_)}throw e}
    ATT_TYPE.set(path,blob.type||'');
    return{id:path,kind,name,type:blob.type||'',...dim};
  }
  await writeFile(dest,dir,path.split('/').pop(),blob);
  return{id:path,kind,name,...dim};
}
/* Reads a stored attachment; an encrypted one (.enc) is decrypted, which needs the app to be unlocked (null while it is locked). */
Media.readPath=async path=>{
  if(!ROOT)return null;
  const p=path.split('/'),nm=p.pop(),f=await readFile(ROOT,p,nm);
  if(!/\.enc$/.test(nm))return f;
  if(!LBE.isUnlocked())return null;
  return LBE.decryptAttachment(f,nm.split('-')[0],ATT_TYPE.get(path)||'');
};
Media.removePath=id=>{const p=id.split('/'),n=p.pop();if(ROOT)removeFile(ROOT,p,n)};
