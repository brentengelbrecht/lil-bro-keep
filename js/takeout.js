/* takeout.js: import from Google Takeout (HTML note files, with the .json and media files that go with them) and the Import dialog.
   Loads before app.js; it works on the notes list and calls commit() and the Store only when an import runs. */
'use strict';
const COL={DEFAULT:0,RED:1,ORANGE:2,YELLOW:3,GREEN:4,TEAL:5,BLUE:6,CERULEAN:7,DARK_BLUE:7,PURPLE:8,PINK:9,BROWN:10,GRAY:11};
const MEDIA_EXT=/\.(jpe?g|png|gif|webp|bmp|avif|heic|heif|3gp|3gpp|amr|mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|mp4|m4v|mov|webm|ogv|mkv)$/i;
const baseName=p=>decodeURIComponent(p.split(/[?#]/)[0]).split('/').pop().toLowerCase();
const MON={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
/* Takeout's heading date ("18 Oct 2024, 11:55:31") has no zone: it is the exporter's local time, so it is read as local time. */
function parseHeadingDate(s){
  s=String(s||'').replace(/\s+/g,' ').trim();
  const m=/^(\d{1,2}) ([A-Za-z]{3,})\.?,? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AaPp])\.?[Mm]\.?)?$/.exec(s);
  if(m){
    const mo=MON[m[2].slice(0,3).toLowerCase()];
    if(mo!==undefined){
      let hr=+m[4];if(m[7])hr=hr%12+(m[7].toLowerCase()==='p'?12:0);
      return new Date(+m[3],mo,+m[1],hr,+m[5],+(m[6]||0)).getTime();
    }
  }
  const t=Date.parse(s);return isNaN(t)?NaN:t;
}
const sigKey=s=>s.startsWith('v2:')?s.slice(3):s.slice(s.indexOf('|')+1);
/* Some Takeout pages write an emoji as two numeric references, one per UTF-16 half ("&#55357;&#56834;"). An HTML parser turns each half into a
   replacement character, so the emoji is lost. Join each pair into the one character it stands for before parsing. */
const NUMREF='&#(?:[xX]([0-9a-fA-F]+)|([0-9]+));';
function joinSurrogateRefs(text){
  const val=(h,d)=>h?parseInt(h,16):parseInt(d,10);
  return text.replace(new RegExp(NUMREF+'\\s*'+NUMREF,'g'),(m,h1,d1,h2,d2)=>{
    const hi=val(h1,d1),lo=val(h2,d2);
    return hi>=0xD800&&hi<=0xDBFF&&lo>=0xDC00&&lo<=0xDFFF?String.fromCharCode(hi,lo):m;
  });
}
function parseTakeout(text,file){
  text=joinSurrogateRefs(text);
  const d=new DOMParser().parseFromString(text,'text/html');
  if(!d.querySelector('.note,.title,.content,.listitem'))return null;
  const root=d.querySelector('.note')||d.body,n=blank();
  for(const c of [...root.classList,...d.body.classList]){const k=c.toUpperCase();if(k in COL){n.color=COL[k];break}}
  n.title=(d.querySelector('.title')?.textContent||'').trim();
  const rows=[...d.querySelectorAll('.listitem')];
  if(rows.length){
    n.isList=true;
    n.items=rows.map(r=>({t:(r.querySelector('.text')?.textContent||'').trim(),d:/[\u2611\u2612\u2713\u2714]/.test(r.querySelector('.bullet')?.textContent||'')||r.classList.contains('checked')||!!r.querySelector('.checked')}));
  }else{
    const c=d.querySelector('.content');
    if(c){c.querySelectorAll('br').forEach(b=>b.replaceWith('\n'));n.body=c.textContent.trim()}
  }
  const refs=[],seenR=new Set();
  const addRef=(src,hint,strict)=>{
    if(!src||/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src))return;
    let b;try{b=baseName(src)}catch(e){return}
    if(!b||seenR.has(b)||(!strict&&!MEDIA_EXT.test(b)))return;
    seenR.add(b);refs.push({name:b,hint});
  };
  /* Keep lets a note have a background picture; it is decoration, not an attachment, so it is never imported. */
  const isBg=el=>!!el.closest('[class*="background" i],[id*="background" i],[data-background]')||/background-image/i.test(el.getAttribute('style')||'')||/background/i.test(el.getAttribute('alt')||'');
  d.querySelectorAll('img[src],audio[src],video[src],source[src]').forEach(el=>{
    if(isBg(el))return;
    let t=el.tagName.toLowerCase();if(t==='source')t=(el.parentElement?el.parentElement.tagName:'').toLowerCase();
    addRef(el.getAttribute('src'),t==='img'?'image':(t==='audio'||t==='video')?t:'',!!el.closest('.attachment,.attachments'));
  });
  d.querySelectorAll('a[href]').forEach(a=>!isBg(a)&&addRef(a.getAttribute('href'),'',!!a.closest('.attachment,.attachments')));
  n.links=[];
  d.querySelectorAll('.chips a[href],a.annotation').forEach(a=>{
    if(a.classList.contains('label-name')||a.closest('.label'))return;
    try{const u=new URL(a.getAttribute('href')||'');if(/^https?:$/.test(u.protocol)&&!n.links.some(l=>l.url===u.href))n.links.push({url:u.href})}catch(e){quiet('a link that is not a valid URL is skipped',e)}
  });
  n._refs=refs;
  n.labels=[...new Set([...d.querySelectorAll('.label-name,.chips .label')].map(x=>x.textContent.trim()).filter(Boolean))];
  n.pinned=!!d.querySelector('.pinned');
  n.trashed=!!d.querySelector('.trashed');
  const head=d.querySelector('.date')||d.querySelector('.heading');
  let when=NaN;
  if(head){const c=head.cloneNode(true);c.querySelectorAll('.meta-icons').forEach(x=>x.remove());when=parseHeadingDate(c.textContent)}
  n._dateSrc=isNaN(when)?'none':'heading';
  n.ts=isNaN(when)?(file.lastModified||Date.now()):when;
  n.mod=n.ts;
  const content=n.isList?n.items.map(i=>i.t).join('\n'):n.body;
  n.sig='v2:'+n.title+'|'+content+(!n.title&&!content?'|'+refs.map(r=>r.name).join(','):'');
  return empty(n)&&!refs.length?null:n;
}
/* An import starts from a clean browser: every note, label and stored media file the browser holds is cleared first (the two welcome notes included), so imported
   notes never mix with leftovers. In folder mode the notes live in the folder, not in the browser, so only the browser's own leftovers go and the folder's notes stay. */
async function clearBrowserForImport(){
  if(Store.mode==='browser'){notes.forEach(dropMedia);notes.splice(0);LB.splice(0);return}
  try{['keep-notes','keep-labels'].forEach(k=>localStorage.removeItem(k))}catch(e){quiet('storage is unavailable',e)}
  try{await idb('readwrite',s=>s.clear())}catch(e){quiet('the media store is unavailable',e)}
  resetMediaCache();
}
/* With encryption set up, imported notes are encrypted like every new note, so the app must be unlocked first. That is asked before the busy spinner starts: nothing is
   in progress while the passphrase is awaited, and a cancel changes nothing. */
async function importFiles(files,out){
  if(Store.crypto.hasVault&&!Store.crypto.unlocked&&!(await Host.unlock())){out.textContent='Import cancelled: unlock to import into encrypted notes.';return}
  return withBusy(()=>importFilesImpl(files,out));
}
async function importFilesImpl(files,out){
  const all=[...files],pages=all.filter(f=>/\.html?$/i.test(f.name));
  if(!pages.length){out.textContent='No HTML note files found in that selection.';return}
  /* The notes that are already encrypted are read now: their import signatures are inside the encrypted text, and a repeated import is matched by them. */
  const encrypting=Store.crypto.hasVault;
  if(encrypting)await Store.loadAll(notes.filter(n=>n.enc));
  await clearBrowserForImport();
  const idx=new Map(),jsons=new Map();
  const dirOf=f=>(f.webkitRelativePath||'').split('/').slice(0,-1).join('/');
  const stem=f=>(dirOf(f)+'|'+f.name.replace(/\.[^.]+$/,'')).toLowerCase();
  for(const f of all){
    const k=f.name.toLowerCase();if(!idx.has(k))idx.set(k,[]);idx.get(k).push(f);
    if(/\.json$/i.test(f.name))jsons.set(stem(f),f);
  }
  const find=(name,html)=>{const c=idx.get(name);return c?(c.find(f=>dirOf(f)===dirOf(html))||c[0]):null};
  const byKey=new Map();
  for(const x of notes)if(x.sig){const k=sigKey(x.sig);if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(x)}
  let added=0,merged=0,skipped=0,media=0,missing=0,failed=0,i=0;
  const pr=busyProgress(pages.length);
  try{
  for(const f of pages){
    out.textContent=`Importing ${++i} of ${pages.length}…`;pr.set(i-1);
    try{
      const n=parseTakeout(await f.text(),f);
      if(!n){skipped++;continue}
      /* date priority: the note's own heading date, then the matching .json file, then the file's timestamp */
      let jd=null;const jf=jsons.get(stem(f));
      if(jf)try{jd=JSON.parse(await jf.text())}catch(err){quiet('no JSON file, or not valid JSON: only the page is used',err)}
      if(n._dateSrc==='none'&&jd){
        const c=Number(jd.createdTimestampUsec)/1000,e=Number(jd.userEditedTimestampUsec)/1000;
        if(c||e){n.ts=c||e;n.mod=e||c;n._dateSrc='json'}
      }
      /* bold, italic and underline are only present in the .json export (the HTML export has plain text) */
      if(!n.isList&&jd&&typeof jd.textContentHtml==='string'){
        try{const x=richOf(jd.textContentHtml);if(x.html&&sameText(x.body,n.body)){n.html=x.html;n.body=x.body}}catch(err){quiet('the richer text could not be read: the plain text stays',err)}
      }
      const src=n._dateSrc;delete n._dateSrc;
      n.labels=n.labels.map(addLabel);
      const refs=n._refs;delete n._refs;
      const list=byKey.get(sigKey(n.sig)),ex=list&&list.length?list.shift():null,t=ex||n;
      if(!ex&&encrypting)n.enc=true;                      // set before any attachment is stored, so the files are encrypted too
      if(ex&&ex.stub&&!(await Store.load(ex))){skipped++;continue}     // the matching note's text is needed to merge into it
      t.att=t.att||[];t.links=t.links||[];
      let changed=false;
      for(const r of refs){
        const mf=find(r.name,f);
        if(!mf){missing++;continue}
        if(ex&&t.att.some(x=>x.name.toLowerCase()===mf.name.toLowerCase()))continue;
        try{addAtt(t,await addMedia(t,mf,mediaKind(mf,r.hint),mf.name));media++;changed=true}
        catch(e){failed++}
      }
      if(ex){
        if(src!=='none'&&(ex.ts!==n.ts||ex.mod!==n.mod)){ex.ts=n.ts;ex.mod=n.mod;KEEP_MOD.add(ex.id);changed=true}
        if(n.html&&!ex.isList&&!ex.html){ex.html=n.html;ex.body=n.body;changed=true}
        ex.sig=n.sig;
        ex.labels=ex.labels||[];
        for(const l of n.labels)if(!ex.labels.includes(l)){ex.labels.push(l);changed=true}
        for(const l of n.links)if(!ex.links.some(x=>x.url===l.url)){ex.links.push(l);changed=true}
        if(changed)merged++;else skipped++;
        continue;
      }
      if(empty(n)){skipped++;continue}
      notes.push(n);added++;
    }catch(e){skipped++}
  }
  }finally{pr.end()}
  commit();
  out.textContent=`Imported ${added} note${added===1?'':'s'} and ${media} attachment${media===1?'':'s'}.`
    +(merged?` Updated ${merged} existing note${merged===1?'':'s'} (dates, formatting, labels, links or attachments).`:'')
    +(skipped?` Skipped ${skipped} (duplicates, empty or not notes).`:'')
    +(missing?` ${missing} attachment file${missing===1?' was':'s were'} not found among your selection. Choose the whole Keep folder to include them.`:'')
    +(failed?` ${failed} attachment${failed===1?'':'s'} couldn’t be stored (browser storage may be full).`:'');
}
function importDialog(){
  const d=openDialog({label:'Import from Google Takeout',panelClass:'dlg2',html:`<span class="dic">${ic('upload',22)}</span><h3>Import from Google Takeout</h3>
    <p>Unzip your Takeout download, then choose what to import.</p>
    <button class="tile on" data-i="dir">${ic('folder',26)}<span><b>Choose folder</b><span class="sub">Recommended: choose the whole Keep folder to bring in images, audio and video too</span></span></button>
    <button class="tile" data-i="files">${ic('file',26)}<span><b>Choose files</b><span class="sub">Select the note files (.html) together with their image, audio and video files</span></span></button>
    <div class="tags" aria-label="What is imported"><i>Text</i><i>Checklists</i><i>Labels</i><i>Links</i><i>Images</i><i>Audio</i><i>Video</i><i>Colors</i><i>Pinned</i><i>Original dates</i></div>
    <p class="hint">Some phone voice memos (.3gp, .amr) may not play in every browser.</p>
    ${Store.crypto.hasVault?'<p class="hint">Encryption is on, so imported notes are encrypted, and you may be asked for your passphrase.</p>':''}
    <p class="res" aria-live="polite"></p>
    <div class="cl"><button class="done" data-i="x">Close</button></div>
    <input type="file" id="fi" multiple hidden><input type="file" id="fd" webkitdirectory multiple hidden>`});
  const p=d.panel,out=p.querySelector('.res');
  p.addEventListener('click',e=>{
    const b=e.target.closest('[data-i]');if(!b)return;
    if(b.dataset.i==='files')p.querySelector('#fi').click();
    else if(b.dataset.i==='dir')p.querySelector('#fd').click();
    else d.close();
  });
  for(const id of ['#fi','#fd'])p.querySelector(id).onchange=e=>{
    const files=[...e.target.files];e.target.value='';
    if(!files.some(f=>/\.html?$/i.test(f.name))){importFiles(files,out);return}   // nothing to import: that answer is instant, so it is shown in the dialog
    /* A real import runs in the background (the ring in the header shows progress), so the dialog gets out of the way and the result comes as a message. */
    let last='';const quiet={set textContent(t){last=t}};
    if(Store.mode==='browser'&&notes.length&&!confirm(`Importing first clears the ${notes.length} note${notes.length===1?'':'s'} stored in this browser, the welcome notes included. Continue?`))return;
    d.close();
    importFiles(files,quiet).then(()=>toast(last,{ms:Math.min(15000,Math.max(5000,last.length*70))}),err=>toast('Import failed: '+((err&&err.message)||err)));
  };
}
