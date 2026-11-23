
'use strict';
let view='notes',sel=new Set(),q='',gridMode=true,open=null,openNote=null;

let searchHits=new Set(),searchTok=0,soonT=0;
const soonRender=()=>{clearTimeout(soonT);soonT=setTimeout(render,40)};
function visible(){
  const s=q.toLowerCase();
  return notes.filter(n=>{
    if(view==='trash'){if(!n.trashed)return false}
    else if(n.trashed)return false;
    if(view==='notes'&&sel.size&&!(n.labels||[]).some(l=>sel.has(l)))return false;
    return !s||(n.stub?searchHits.has(n.id)||metaText(n).includes(s):noteText(n).includes(s));
  }).sort(byOrder);
}
/* Images form the gallery; videos and audio keep their own players below it. */
const noteOfCard=el=>{const c=el.closest('.card');return c&&notes.find(x=>x.id===c.dataset.id)};
function dimsLearned(n){                          // an image size was filled in later: keep it, without touching the note's modified date
  if(n)commit({keepMod:[n.id],render:false,delay:900});
}
/* How a screen reader announces a card: its title, or the start of its text */
const noteLabel=n=>(n.pinned?'Pinned note: ':'Note: ')+(n.title||(n.stub?n.idxTitle:'')||(n.isList?(n.items||[]).map(i=>i.t).join(', '):(n.body||'')).replace(/\s+/g,' ').trim().slice(0,80)||'empty');
function card(n){
  const body=n.isList
    ?`<ul>${n.items.map((it,i)=>`<li class="${it.d?'d':''}"><button class="ck" data-act="tick" data-i="${i}" aria-label="Toggle item">${ic(it.d?'cbx':'cb0',18)}</button><span>${h(it.t)}</span></li>`).join('')}</ul>`
    :(n.body?`<div class="tx">${n.html||h(n.body)}</div>`:'');
  const media=galleryHTML(imagesOf(n),{maxRows:GAL.gridRows})+(n.att||[]).filter(a=>a.kind!=='image').map(a=>a.kind==='video'?`<video data-m="${h(a.id)}" controls preload="metadata"></video>`:`<audio data-m="${h(a.id)}" controls preload="none"></audio>`).join('');
  const ttl=n.stub?(n.idxTitle||''):n.title;          // a note not read yet shows the title its index line kept
  const sealed=n.enc&&n.stub;                           // an encrypted note that is not unlocked: its card shows only the ciphertext
  const lks=(n.links||[]).length?`<div class="lks">${n.links.map(l=>`<a class="lk" href="${h(l.url)}" target="_blank" rel="noopener noreferrer">${ic('link',16)}<span>${h(linkText(l.url))}</span></a>`).join('')}</div>`:'';
  const cardChip=l=>`<span class="chip"><button class="cl" data-act="lbl" data-l="${h(l)}">${h(l)}</button>${n.trashed?'':`<button class="x" data-act="rmlbl" data-l="${h(l)}" title="Remove label" aria-label="Remove label ${h(l)}">${ic('close',12)}</button>`}</span>`;
  const chips=(n.labels||[]).length?`<div class="chips">${n.labels.map(cardChip).join('')}</div>`:'';
  const acts=n.trashed
    ?`<button class="ib" data-act="restore" title="Restore">${ic('restore',20)}</button><button class="ib" data-act="purge" title="Delete forever">${ic('trash',20)}</button>`
    :`<button class="ib" data-act="colpick" title="Background options" aria-label="Background options">${ic('palette',20)}</button><button class="ib" data-act="lblpick" title="Add label">${ic('label',20)}</button><button class="ib" data-act="amed" title="Add image or video">${ic('image',20)}</button><button class="ib" data-act="cam" title="Take a photo">${ic('camera',20)}</button><button class="ib" data-act="arec" title="Record audio">${ic('mic',20)}</button><button class="ib" data-act="trash" title="Delete">${ic('trash',20)}</button>`;
  return`<div class="card${media?' hasm':''}" data-id="${h(n.id)}" tabindex="-1" role="article" aria-label="${h(noteLabel(n))}" style="--c:var(--k${n.color})">
  ${n.trashed?'':`<button class="ib pin${n.pinned?' on':''}" data-act="pin" data-tip="${n.pinned?'Unpin':'Pin'} note" aria-label="${n.pinned?'Unpin':'Pin'} note">${ic('pin',20)}</button>`}
  ${media?`<div class="cm">${media}</div>`:''}<div class="cb">${sealed?`<h3 class="sealed">${ic('lockOn',16)}Encrypted note</h3>${n.ct?`<div class="ctx" aria-hidden="true">${h(n.ct.replace(/^LBK\d+\./,'').slice(0,200))}…</div>`:''}`:`${ttl?`<h3>${h(ttl)}</h3>`:''}${body}`}${lks}${chips}<div class="acts">${acts}</div></div></div>`;
}
/* Virtual grid glue */
const cardSig=n=>JSON.stringify([n.stub,n.enc&&n.stub?Store.crypto.unlocked:0,!!n.ct,n.title,n.body,n.html,n.isList,n.items,n.labels,n.att,n.links,n.color,n.pinned,n.trashed]);
const VGOPT={
  html:n=>card(n),
  sig:cardSig,
  wire(el){
    galleryWire(el,(img,id)=>{const m=noteOfCard(img);return m&&m.att.find(a=>a.id===id)},img=>dimsLearned(noteOfCard(img)));
    hydrate(el);
    const m=noteOfCard(el);
    if(m&&m.stub){
      if(m.enc&&!Store.crypto.unlocked){if(!m.ct)Store.peek(m).then(soonRender)}      // locked: only the ciphertext is read, to draw the card
      else Store.load(m).then(ok=>{if(ok)soonRender()});                              // the text of a card that has come on screen is read now
    }
  },
  gone(id){if(lpEl&&lpNote&&lpNote.id===id)closeLabelPicker()}
};
/* Note order (order.js): a pinned or unpinned note goes to the top of the section it enters; dragging gives a note a key between its new neighbours. */
function applyOrder(ch){                                  // returns what is needed to undo it
  const undo=[];
  for(const [id,k] of Object.entries(ch)){
    const n=notes.find(x=>x.id===id);if(!n)continue;
    undo.push({id,pos:n.pos});n.pos=k;
  }
  return undo;
}
function restoreOrder(undo){
  for(const u of undo){
    const n=notes.find(x=>x.id===u.id);if(!n)continue;
    if(u.pos===undefined)delete n.pos;else n.pos=u.pos;
  }
}
function moveNote(id,prevId,pinned){
  const ch=placeNote(notes.filter(n=>!n.trashed&&!!n.pinned===pinned),id,prevId);
  const undo=applyOrder(ch);
  if(!undo.length)return;
  commit({keepMod:undo.map(u=>u.id)});          // reordering is not an edit: the modified date stays
  toast('Note moved',{label:'Undo',fn:()=>{restoreOrder(undo);commit({keepMod:undo.map(u=>u.id)})}});
}
const canReorder=()=>view==='notes'&&!q&&Store.state==='ok';    // not in search results, Trash or while the folder is not connected
function moveCardBy(n,d){                                  // keyboard: one place earlier (-1) or later (1) within its section
  const sec=visible().filter(x=>!!x.pinned===!!n.pinned),i=sec.findIndex(x=>x.id===n.id),j=i+d;
  if(i<0||j<0||j>=sec.length)return;
  moveNote(n.id,d<0?(j>0?sec[j-1].id:null):sec[j].id,!!n.pinned);
}
let vgSig='';const vgGrids=new Map();
function vgTeardown(){vgGrids.forEach(g=>g.destroy());vgGrids.clear()}
function render(){
  if(Store.state==='loading'||Store.state==='perm'){
    $('#composer').style.display='none';renderNav();vgTeardown();vgSig='';
    $('#out').innerHTML=Store.state==='loading'
      ?`<div class="empty">${ic('note',120)}<div>Loading notes…</div></div>`
      :`<div class="empty">${ic('note',120)}<div>Reconnect your notes folder</div><div class="hint">Chrome needs your permission to open “${h(Store.folderName)}” again.</div><div class="row"><button class="btn" data-act="reconnect">Reconnect folder</button><button class="btn2" data-act="usebrowser">Use browser storage instead</button></div></div>`;
    return;
  }
  [...sel].forEach(l=>{if(!LB.includes(l))sel.delete(l)});
  renderNav();
  document.querySelectorAll('#nav button[data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===view));
  $('#composer').style.display=view==='notes'&&!q&&Store.state==='ok'?'':'none';
  $('#notes').classList.toggle('list',!gridMode);
  const list=Store.state==='cached'&&!Store.loaded?visible().slice(0,60):visible();
  const grp=view==='notes',pinned=grp?list.filter(n=>n.pinned):[],rest=grp?list.filter(n=>!n.pinned):list;
  let o='';
  if(view==='trash'&&list.length)o+=`<div class="banner"><span>Notes in Trash stay here until you empty it.</span><button data-act="empty">Empty Trash</button></div>`;
  if(pinned.length)o+=`<h2>Pinned</h2><div class="vg" data-k="p"></div>`+(rest.length?'<h2>Others</h2>':'');
  if(rest.length)o+=`<div class="vg" data-k="r"></div>`;
  if(!list.length){
    const m=q?'No matching notes found':view==='notes'&&sel.size?'No notes with the selected labels yet':view==='trash'?'No notes in Trash':'Notes you add appear here';
    o=`<div class="empty">${ic(view==='trash'?'trash':'note',120)}<div>${m}</div></div>`;
  }
  const bar=Store.state!=='cached'?'':`<div class="banner" id="cachebar"><span>${Store.gesturePending?'Showing a saved copy of your notes. Click anywhere to reconnect your folder.':Store.loaded?'Folder access is needed to save your changes. Click anywhere to reconnect.':'Updating from your folder…'}</span>${Store.gesturePending?'<span><button data-act="reconnect">Reconnect</button> <button data-act="usebrowser">Use browser storage</button></span>':''}</div>`;
  /* Only cards in or near the viewport are built (vgrid.js). The page structure (banners, headings, containers) is only
     rebuilt when it changes; otherwise the existing cards are kept and just the ones that changed are replaced. */
  const lockMsg=q&&Store.crypto.hasVault&&!Store.crypto.unlocked&&Store.state==='ok'
    ?`<div class="banner" id="srchbar"><span>Encrypted notes aren’t included while locked. Unlock to search them.</span><button data-act="unlock">Unlock</button></div>`:'';
  const sig=bar+lockMsg+o;
  if(sig!==vgSig){
    vgTeardown();
    $('#out').innerHTML=sig;vgSig=sig;
    $('#out').querySelectorAll('.vg').forEach(host=>vgGrids.set(host.dataset.k,vgMake(host,{...VGOPT,drag:{
      can:canReorder,
      start:()=>closeLabelPicker(),
      commit:(id,prevId)=>moveNote(id,prevId,host.dataset.k==='p')
    }})));
  }
  if(vgGrids.has('p'))vgGrids.get('p').update(pinned,!gridMode);
  if(vgGrids.has('r'))vgGrids.get('r').update(rest,!gridMode);
}

/* Composer */
function collapsed(){
  $('#composer').innerHTML=`<div class="coll" data-c="note"><span>New note…</span><button class="ib" data-c="list" title="New list">${ic('cboxo')}</button></div>`;
}
$('#composer').addEventListener('click',e=>{
  const c=e.target.closest('[data-c]');if(!c||open)return;
  const n=blank();n.labels=[...sel];n.enc=Store.crypto.hasVault;          // with encryption set up, every new note starts encrypted
  if(c.dataset.c==='list'){n.isList=true;n.items=[{t:'',d:false}]}
  openNote=n;open=editor(n,true,finish);
  Drafts.start(n,true,()=>open&&open.api.sync());
  ['input','click','keyup','change'].forEach(t=>open.addEventListener(t,Drafts.touch,true));
  $('#composer').innerHTML='';$('#composer').append(open);
  open.querySelector(n.isList?'.x':'.rt').focus();
});
function finish(n){
  if(open)open.api.cleanup();
  if(open)open.api.linkify();
  const gone=empty(n);
  if(!gone){n.ts=Date.now();notes.unshift(n);save()}
  Drafts.end(n,{discard:gone});
  open=null;openNote=null;collapsed();render();
}
document.addEventListener('mousedown',e=>{
  if(open&&!open.contains(e.target)&&!e.target.closest('.ov'))finish(openNote);
});

/* An outside click only closes an open popover; it doesn't select anything or close the note */
/* After a press that dismisses something, the click that follows it must not reach whatever was underneath. */
function swallowNextClick(){
  const f=ev=>{ev.stopPropagation();ev.preventDefault()};
  document.addEventListener('click',f,{capture:true,once:true});
  setTimeout(()=>document.removeEventListener('click',f,true),350);
}
document.addEventListener('mousedown',e=>{
  if(e.target.closest('.pal,.lpop,[data-e="color"],[data-e="lbl"]'))return;
  const pops=document.querySelectorAll('.editor .pal:not([hidden]),.editor .lpop:not([hidden])');
  if(!pops.length)return;
  pops.forEach(p=>p.hidden=true);
  e.stopPropagation();
  swallowNextClick();
},true);

/* Edit dialog */
let editingN=null;
function openModal(n,opts){
  if(n.enc&&n.stub&&!Store.crypto.unlocked){Crypt.promptUnlock().then(ok=>{if(ok)openModal(n,opts)});return}   // an encrypted note needs the passphrase first
  if(n.stub){Store.load(n).then(ok=>{if(ok&&!n.stub)openModal(n,opts)});return}   // the note's text is read first
  const opener=document.activeElement,returnId=opener&&opener.closest&&opener.closest('.card')?n.id:null;   // opened from a card: focus goes back to it
  const ov=document.createElement('div');ov.className='ov anim';
  const base=sigOf(n);                       // the note as it was when it was opened
  let closing=false,d=null;
  function close(){
    if(closing)return;closing=true;editingN=null;
    if(ed){ed.api.cleanup();ed.api.linkify()}
    const gone=empty(n);
    if(gone)notes=notes.filter(x=>x!==n);
    if(gone||sigOf(n)!==base)save();         // nothing is written for a note that was only looked at
    Drafts.end(n,{discard:gone});            // the draft goes once the note is in the folder
    d.close();                               // the page behind becomes usable again, and the editor flies back out
    render();
    if(returnId)vgFocusCard(returnId);
  }
  editingN=n;
  const ed=editor(n,false,close);ov.append(ed);
  Drafts.start(n,false,()=>ed.api.sync());
  ['input','click','keyup','change'].forEach(t=>ov.addEventListener(t,Drafts.touch,true));
  d=openDialog({overlay:ov,roleEl:ed,label:'Edit note',focus:false,restoreFocus:false,
    onEscape:()=>{                           // Escape first closes an open colour or label picker
      const p=ov.querySelectorAll('.pal:not([hidden]),.lpop:not([hidden])');
      if(p.length){p.forEach(x=>x.hidden=true);return true}
    },
    onRequestClose:close,
    exit:(el,done)=>{el.style.pointerEvents='none';el.classList.remove('open');setTimeout(done,300)}});
  void ov.offsetWidth;ov.classList.add('open');
  if(opts&&opts.record)ed.api.startRec();
  else{
    const f=n.isList?[...ed.querySelectorAll('.x')].pop():ed.querySelector('.rt');
    if(f){f.focus({preventScroll:true});if(f.classList.contains('rt'))caretEnd(f);else f.setSelectionRange(f.value.length,f.value.length)}
    const sc=ed.querySelector('.escroll');if(sc)sc.scrollTop=0;        // like Google Keep, a note opens at its top (the cursor is ready at the end, but the view stays on the images)
  }
}

/* Label picker for the note listing */
let lpEl=null,lpNote=null,lpKind='';
function closeLabelPicker(){
  if(!lpEl)return;
  lpEl.remove();lpEl=null;lpNote=null;lpKind='';
  document.removeEventListener('mousedown',lpDown,true);
  document.removeEventListener('keydown',lpKey,true);
  window.removeEventListener('scroll',lpScroll,true);
  window.removeEventListener('resize',closeLabelPicker);
}
function lpDown(e){
  if(lpEl.contains(e.target)||e.target.closest('[data-act="lblpick"],[data-act="colpick"]'))return;
  closeLabelPicker();e.stopPropagation();
  swallowNextClick();
}
function lpKey(e){if(e.key==='Escape'){e.stopPropagation();closeLabelPicker()}}
function lpScroll(e){if(lpEl&&!lpEl.contains(e.target))closeLabelPicker()}
/* Shows a floating popover beside a button: below it if there is room, else above. It closes on an outside press, Escape, scrolling elsewhere or resizing
   (closeLabelPicker), and is the one popover open at a time (lpEl). */
function popupAt(el,btn){
  document.body.append(el);
  const r=btn.getBoundingClientRect();
  el.style.left=Math.max(8,Math.min(r.left,innerWidth-el.offsetWidth-8))+'px';
  let top=r.bottom+4;if(top+el.offsetHeight>innerHeight-8)top=Math.max(8,r.top-el.offsetHeight-4);
  el.style.top=top+'px';
  lpEl=el;
  document.addEventListener('mousedown',lpDown,true);
  document.addEventListener('keydown',lpKey,true);
  window.addEventListener('scroll',lpScroll,true);
  window.addEventListener('resize',closeLabelPicker);
}
/* Background colour picker for the note listing: same floating popover as the label picker, so the card's own scrolling can't clip it. */
function openColorPicker(n,btn){
  closeLabelPicker();lpNote=n;lpKind='col';
  const el=document.createElement('div');el.className='pal cpop';el.setAttribute('role','group');el.setAttribute('aria-label','Background colour');
  el.innerHTML=NAMES.map((nm,i)=>`<button class="sw${i===n.color?' on':''}" data-i="${i}" style="background:var(--k${i})" title="${nm}" aria-label="${nm}" aria-pressed="${i===n.color}"></button>`).join('');
  el.addEventListener('click',e=>{
    const b=e.target.closest('.sw');if(!b)return;
    n.color=+b.dataset.i;commit();
    el.querySelectorAll('.sw').forEach(s=>{const on=+s.dataset.i===n.color;s.classList.toggle('on',on);s.setAttribute('aria-pressed',on)});
  });
  popupAt(el,btn);
}
function openLabelPicker(n,btn){
  closeLabelPicker();lpNote=n;lpKind='lbl';
  const el=document.createElement('div');el.className='lpop cpop';
  el.innerHTML='<input class="lq" placeholder="Enter label name" aria-label="Label name"><div class="ll"></div>';
  const input=el.querySelector('.lq'),list=el.querySelector('.ll');
  const fill=()=>{
    const raw=input.value.trim(),qv=raw.toLowerCase();
    let o=LB.filter(l=>l.toLowerCase().includes(qv)).map(l=>`<button class="lrow" data-l="${h(l)}">${ic(n.labels.includes(l)?'cbx':'cb0',18)}<span>${h(l)}</span></button>`).join('');
    if(raw&&!LB.some(l=>l.toLowerCase()===qv))o+=`<button class="lrow" data-new="1">${ic('add',18)}<span>Create “${h(raw)}”</span></button>`;
    list.innerHTML=o;
  };
  const apply=()=>{commit();fill()};
  const create=()=>{
    const l=addLabel(input.value);if(!l)return;
    if(!n.labels.includes(l))n.labels=[...n.labels,l];
    input.value='';apply();
  };
  input.addEventListener('input',fill);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();create()}});
  el.addEventListener('click',e=>{
    const b=e.target.closest('.lrow');if(!b)return;
    if(b.dataset.new){create();return}
    const l=b.dataset.l;
    n.labels=n.labels.includes(l)?n.labels.filter(x=>x!==l):[...n.labels,l];
    apply();
  });
  fill();popupAt(el,btn);input.focus();
}

/* Attachments: same-name handling. The new file either replaces the existing one (same position) or gets 1, 2, 3 … added to its name. */
/* Attaching from the note listing */
let pickTarget=null;
const cardFile=document.createElement('input');
cardFile.type='file';cardFile.accept='image/*,video/*';cardFile.multiple=true;cardFile.hidden=true;
document.body.append(cardFile);
cardFile.addEventListener('change',async()=>{
  const n=pickTarget,files=[...cardFile.files];
  cardFile.value='';pickTarget=null;
  if(!n||!files.length)return;
  let added=0,bad=0;
  for(const f of files){
    const kind=mediaKindOf(f);
    if(!kind){bad++;continue}
    try{if(await attach(n,f,kind,f.name))added++}catch(e){bad++}
  }
  if(added){commit()}
  if(bad)toast(`${bad} file${bad===1?' was':'s were'} not added. Only images, videos and audio can be attached, and storage may be full.`);
});

/* Card actions */
$('#out').addEventListener('keydown',e=>{
  if(!e.altKey||!/^Arrow(Up|Down|Left|Right)$/.test(e.key)||!canReorder())return;
  const c=e.target.closest&&e.target.closest('.card');if(!c)return;
  const n=notes.find(x=>x.id===c.dataset.id);if(!n)return;
  e.preventDefault();
  moveCardBy(n,/Up|Left/.test(e.key)?-1:1);
  const nc=document.querySelector('.vg>.card[data-id="'+c.dataset.id+'"]');if(nc)nc.scrollIntoView({block:'nearest'});
});
$('#out').addEventListener('click',e=>{
  const a=e.target.closest('[data-act]');
  if(a&&a.dataset.act==='reconnect'){Store.reconnect();return}
  if(a&&a.dataset.act==='usebrowser'){Store.disconnect();return}
  if(a&&a.dataset.act==='unlock'){Crypt.promptUnlock();return}
  if(a&&a.dataset.act==='empty'){notes.filter(n=>n.trashed).forEach(dropMedia);notes=notes.filter(n=>!n.trashed);commit();return}
  const c=e.target.closest('.card');if(!c)return;
  if(e.target.closest('video,audio,a'))return;
  const n=notes.find(x=>x.id===c.dataset.id);if(!n)return;
  if(!a){openModal(n);return}
  const t=a.dataset.act;
  if(t==='lbl'){sel=new Set([a.dataset.l]);view='notes';render();return}
  if(t==='rmlbl'){n.labels=n.labels.filter(x=>x!==a.dataset.l);commit();return}
  if(t==='amed'){pickTarget=n;cardFile.click();return}
  if(t==='cam'){
    takePhoto().then(async bl=>{
      if(!bl)return;
      try{await attach(n,bl,'image','Photo '+clock()+'.jpg',{auto:true});commit()}
      catch(err){toast('Couldn’t store the photo.')}
    });
    return;
  }
  if(t==='arec'){openModal(n,{record:true});return}
  if(t==='lblpick'){if(lpEl&&lpNote===n&&lpKind==='lbl')closeLabelPicker();else openLabelPicker(n,a);return}
  if(t==='colpick'){if(lpEl&&lpNote===n&&lpKind==='col')closeLabelPicker();else openColorPicker(n,a);return}
  if(t==='tick')n.items[+a.dataset.i].d=!n.items[+a.dataset.i].d;
  else if(t==='pin'){n.pinned=!n.pinned;moveToTop(n)}
  else if(t==='trash'){n.trashed=true;n.pinned=false}
  else if(t==='restore')n.trashed=false;
  else if(t==='purge'){dropMedia(n);notes=notes.filter(x=>x!==n)}
  commit();
});

/* Chrome */
$('#menu').innerHTML=ic('menu');$('#sico').innerHTML=ic('search');
$('#n2').innerHTML=ic('trash');$('#n3').innerHTML=ic('upload');$('#n6').innerHTML=ic('download');$('#n5').innerHTML=ic('gear');

const setVM=()=>{$('#vm').innerHTML=ic(gridMode?'rows':'grid');$('#vm').title=gridMode?'List view':'Grid view'};
setVM();
$('#menu').onclick=()=>document.body.classList.toggle(innerWidth<=700?'open':'min');
$('#vm').onclick=()=>{gridMode=!gridMode;setVM();render()};
/* Search: notes already in memory are matched at once; the pages of the others are looked through in the background (cancelled by the next keystroke). */
function searchStart(){
  const tok=++searchTok;searchHits=new Set();
  if(q)Store.search(q.toLowerCase(),()=>tok===searchTok,id=>{searchHits.add(id);soonRender()});
}
$('#q').oninput=e=>{q=e.target.value.trim();searchStart();render()};
$('#nav').addEventListener('click',e=>{
  if(labelNavClick(e))return;
  const b=e.target.closest('button[data-v]');if(!b)return;
  view=b.dataset.v;document.body.classList.remove('open');render();
});
$('#impbtn').onclick=()=>{document.body.classList.remove('open');importDialog()};
$('#expbtn').onclick=()=>{document.body.classList.remove('open');exportDialog()};
$('#setbtn').onclick=()=>{document.body.classList.remove('open');settingsDialog()};
collapsed();
Host.render=render;Host.collapsed=collapsed;
Host.editingNote=()=>editingN||openNote||null;
Host.flushed=()=>Drafts.check();
Host.ready=()=>Drafts.recover();
Host.crypt=()=>{Crypt.changed();if(q)searchStart();render()};     // unlocking (or locking) while a search is showing runs it again, over the notes that can now be read
Crypt.changed();                                                  // the lock button is drawn (or hidden) from the start, whatever the storage mode
Host.unlock=()=>Crypt.promptUnlock();                  // ask for the passphrase; resolves true once the app is unlocked
Host.needUnlock=()=>{Host.unlock().then(ok=>{if(ok)Store.flush()})};
Host.editing=()=>!!open||!!document.querySelector('.ov .editor');
if(wantFolder)Store.boot();else render();
