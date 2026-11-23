/* media.js: where attachment data lives and how it is shown.
   Browser mode keeps blobs in IndexedDB. Folder mode keeps them as files; the folder engine registers how to read and remove those. */
'use strict';
const Media={readPath:()=>Promise.resolve(null),removePath(){}};
/* Media storage: blobs live in IndexedDB, notes keep only small references */
const DB=new Promise((res,rej)=>{
  try{const r=indexedDB.open('keep-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('m');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}
});
const idb=(mode,fn)=>DB.then(db=>new Promise((res,rej)=>{
  const t=db.transaction('m',mode),r=fn(t.objectStore('m'));
  t.oncomplete=()=>res(r.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);
}));
let asked=false;
const putBlob=(id,b)=>{if(!asked){asked=true;try{navigator.storage.persist()}catch(e){quiet('asking for persistent storage is only a request',e)}}return idb('readwrite',s=>s.put(b,id))};
const isPath=id=>String(id).includes('/');
const getBlob=id=>isPath(id)?Media.readPath(id):idb('readonly',s=>s.get(id));
const URLS=new Map();
const mediaURL=id=>{
  if(!URLS.has(id))URLS.set(id,getBlob(id).then(b=>b?URL.createObjectURL(b):''));
  return URLS.get(id);
};
function resetMediaCache(){for(const[,p]of URLS)p.then(u=>u&&URL.revokeObjectURL(u)).catch(()=>{});URLS.clear()}
const MIME_EXT={jpeg:'jpg',quicktime:'mov',mpeg:'mp3','x-m4a':'m4a','3gpp':'3gp','x-matroska':'mkv'};
function extOf(name,type){
  const m=/\.([a-z0-9]{1,5})$/i.exec(name||'');if(m)return m[1].toLowerCase();
  const t=(type||'').split(';')[0].split('/')[1]||'bin';
  return(MIME_EXT[t]||t).replace(/[^a-z0-9]/g,'')||'bin';
}
/* Stores one media file and returns its attachment record {id,kind,name}.
   In folder mode id is the path relative to the notes folder; in browser mode it's a random key. */
/* An image's pixel size is measured once, when it is attached, so the gallery can reserve its space before it loads. */
function measureImage(blob){
  return new Promise(res=>{
    const u=URL.createObjectURL(blob),im=new Image();let done=false;
    const end=v=>{if(done)return;done=true;URL.revokeObjectURL(u);res(v)};
    im.onload=()=>end(im.naturalWidth>0&&im.naturalHeight>0?{w:im.naturalWidth,h:im.naturalHeight}:null);
    im.onerror=()=>end(null);
    setTimeout(()=>end(null),8000);
    im.src=u;
  });
}
function removeBlob(id){
  const p=URLS.get(id);URLS.delete(id);
  if(p)p.then(u=>u&&URL.revokeObjectURL(u)).catch(()=>{});
  if(isPath(id))Media.removePath(id);
  else idb('readwrite',s=>s.delete(id)).catch(()=>{});
}
const dropMedia=n=>[...(n.att||[]).map(a=>a.id),...(n.files||[])].forEach(removeBlob);     // n.files: the files of an encrypted note that has not been unlocked (its attachment list is not readable)

/* Which kind of attachment is this file? 'image' | 'video' | 'audio' | '' */
const mediaKindOf=f=>/^image\//.test(f.type)?'image':/^video\//.test(f.type)?'video':/^audio\//.test(f.type)?'audio':'';
function mediaKind(file,hint){
  if(hint)return hint;
  const t=file.type||'';
  if(/\.(3gp|3gpp|amr|mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i.test(file.name))return'audio';
  if(t.startsWith('image/'))return'image';
  if(t.startsWith('audio/'))return'audio';
  if(t.startsWith('video/')||/\.(mp4|m4v|mov|webm|ogv|mkv)$/i.test(file.name))return'video';
  return'image';
}

/* Fill in every [data-m] element under root with its media (an object URL), asynchronously. */
function hydrate(root){
  root.querySelectorAll('[data-m]').forEach(el=>{
    if(el.getAttribute('src'))return;
    const bad=()=>{const t=el.isConnected&&el.closest('.gt');if(t)t.classList.add('bad')};
    mediaURL(el.dataset.m).then(u=>{if(!el.isConnected)return;if(u)el.src=u;else bad()}).catch(bad);
  });
}
