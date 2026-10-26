/* editor.js: the note editor: one element holding a note being written. Used in a dialog (openModal) and inline for a new note (composer).
   It is put together from: richedit.js (the text area), recorder.js (voice), gallery.js (images), capture.js (camera, attaching).
   editor(note, isNew, done) returns the element; done(note) is called when the person closes it. */
'use strict';

/* ---------- markup (plain functions of the note) ---------- */
function editorHTML(n,isNew,pal){
  return `<button class="ib pin${n.pinned?' on':''}" data-e="pin" data-tip="${n.pinned?'Unpin':'Pin'} note" aria-label="${n.pinned?'Unpin':'Pin'} note">${ic('pin',20)}</button>
    <div class="escroll">
    <div class="etop"></div>
    <div class="eatt"></div>
    <div class="ebody">
    <input class="t" placeholder="Title" value="${h(n.title)}" aria-label="Title">
    <div>${n.isList
      ?n.items.map((it,i)=>`<div class="li${it.d?' d':''}"><button class="ck" data-e="tick" data-i="${i}" aria-label="Toggle item">${ic(it.d?'cbx':'cb0',18)}</button><input class="x" data-i="${i}" value="${h(it.t)}" placeholder="List item"><button class="ck" data-e="rm" data-i="${i}" aria-label="Remove item">${ic('close',18)}</button></div>`).join('')+`<button class="add" data-e="add">${ic('add',18)} List item</button>`
      :`<div class="rt" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note" data-ph="${isNew?'New note…':'Note'}">${rtHTML(n)}</div>`}</div>
    </div>
    </div>
    <div class="efoot">
    <div class="rec" hidden></div><div class="emsg" role="status"></div>
    <div class="chips echips"></div>
    <div class="bar">
      ${n.isList?'':`<button class="ib fmt" data-e="fb" data-tip="Bold" aria-label="Bold">${ic('bold',20)}</button><button class="ib fmt" data-e="fi" data-tip="Italic" aria-label="Italic">${ic('italic',20)}</button><button class="ib fmt" data-e="fu" data-tip="Underline" aria-label="Underline">${ic('underline',20)}</button><button class="ib fmt" data-e="fc" data-tip="Clear formatting" aria-label="Clear formatting">${ic('clearfmt',20)}</button>`}
      <button class="ib" data-e="color" data-tip="Background options" aria-label="Background options">${ic('palette',20)}</button>
      <button class="ib" data-e="lbl" data-tip="Add label" aria-label="Add label">${ic('label',20)}</button>
      <button class="ib" data-e="amed" data-tip="Add image or video" aria-label="Add image or video">${ic('image',20)}</button>
      <button class="ib" data-e="cam" data-tip="Take a photo" aria-label="Take a photo">${ic('camera',20)}</button>
      <button class="ib" data-e="arec" data-tip="Record audio" aria-label="Record audio">${ic('mic',20)}</button>
      <button class="ib" data-e="list" data-tip="${n.isList?'Hide checkboxes':'Show checkboxes'}" aria-label="${n.isList?'Hide checkboxes':'Show checkboxes'}">${ic('cb0',20)}</button>
      ${isNew?'':`<button class="ib" data-e="trash" data-tip="Delete note" aria-label="Delete note">${ic('trash',20)}</button>`}
      <span class="sp"></span>${n.isList?'':`<button class="ib" data-e="undo" data-tip="Undo" aria-label="Undo" disabled>${ic('undo',20)}</button><button class="ib" data-e="redo" data-tip="Redo" aria-label="Redo" disabled>${ic('redo',20)}</button>`}<button class="done" data-e="done">Close</button>
      <input type="file" class="fmed" accept="image/*,video/*" multiple hidden>
      <div class="lpop" hidden><input class="lq" placeholder="Enter label name" aria-label="Label name"><div class="ll"></div></div>
      <div class="pal"${pal?'':' hidden'}>${NAMES.map((nm,i)=>`<button class="sw${i===n.color?' on':''}" data-e="col" data-i="${i}" style="background:var(--k${i})" title="${nm}" aria-label="${nm}"></button>`).join('')}</div>
    </div>
    </div>`;
}
/* The attachments area above the title: image gallery, then video and audio players, then links. */
function attachmentsHTML(n){
    const tools=(a,i,tot)=>`<div class="gtools"><button class="ib rm" data-g="mv" data-d="-1" data-id="${h(a.id)}" title="Move earlier" aria-label="Move ${h(a.name)} earlier"${i===0?' disabled':''}>${ic('prev',18)}</button><button class="ib rm" data-g="mv" data-d="1" data-id="${h(a.id)}" title="Move later" aria-label="Move ${h(a.name)} later"${i===tot-1?' disabled':''}>${ic('next',18)}</button><button class="ib rm" data-e="ratt" data-id="${h(a.id)}" title="Delete attachment" aria-label="Delete ${h(a.name)}">${ic('trash',18)}</button></div>`;
  return galleryHTML(imagesOf(n),{edit:true,tools})+n.att.filter(a=>a.kind!=='image').map(a=>{
      const rm=`<button class="ib rm tr" data-e="ratt" data-id="${h(a.id)}" data-tip="Delete attachment" aria-label="Delete ${h(a.name)}">${ic('trash',18)}</button>`;
      if(a.kind==='audio')return`<div class="em au"><audio data-m="${h(a.id)}" controls preload="none"></audio>${rm}</div>`;
      return`<div class="em vid"><video data-m="${h(a.id)}" controls preload="metadata"></video>${rm}</div>`;
    }).join('')+n.links.map((l,i)=>`<div class="em lkr"><a class="lk" href="${h(l.url)}" target="_blank" rel="noopener noreferrer">${ic('link',16)}<span>${h(linkText(l.url))}</span></a><button class="ib rm" data-e="rlink" data-i="${i}" title="Remove link" aria-label="Remove link">${ic('close',16)}</button></div>`).join('');
}
function labelChipsHTML(n){return n.labels.map(l=>`<span class="chip"><span class="cl">${h(l)}</span><button class="x" data-e="rmlbl" data-l="${h(l)}" title="Remove label" aria-label="Remove label ${h(l)}">${ic('close',12)}</button></span>`).join('');}
/* The rows of the label picker: every label matching what was typed, and "Create ..." when it is new. */
function labelRowsHTML(n,raw){
  const qv=raw.toLowerCase();
  let o=LB.filter(l=>l.toLowerCase().includes(qv)).map(l=>`<button class="lrow" data-e="lt" data-l="${h(l)}">${ic(n.labels.includes(l)?'cbx':'cb0',18)}<span>${h(l)}</span></button>`).join('');
  if(raw&&!LB.some(l=>l.toLowerCase()===qv))o+=`<button class="lrow" data-e="lnew">${ic('add',18)}<span>Create “${h(raw)}”</span></button>`;
  return o;
}

/* ---------- the editor ---------- */
function editor(n,isNew,done){
  const el=document.createElement('div');
  const sync=()=>{                                      // copy what is on screen into the note
    n.title=el.querySelector('.t').value;
    if(n.isList)el.querySelectorAll('.x').forEach(i=>n.items[+i.dataset.i].t=i.value);
    else{const x=richFrom(el.querySelector('.rt'));n.body=x.body;n.html=x.html}
  };
  const fit=()=>{const t=el.querySelector('textarea');if(t){t.style.height='auto';t.style.height=Math.max(60,t.scrollHeight)+'px'}};
  n.att=partAtt(n.att);n.links=n.links||[];
  const sig0=sigOf(n);                                   // the note as it was when the editor opened: if it differs, an edit is pending and the date shown is now
  /* "Edited <date>" when the note was changed after it was created, otherwise "Created <date>". A brand-new note has no date yet. */
  const dateText=()=>{
    if(isNew)return'';
    const mod=sigOf(n)!==sig0?Date.now():(n.mod||n.ts),edited=mod>n.ts;
    const when=new Date(edited?mod:n.ts).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).replace(/\b([ap])m\b/i,m=>m.toUpperCase());   // 12-hour clock: "9:30 AM"
    return(edited?'Edited ':'Created ')+when;
  };
  const msg=t=>{const m=el.querySelector('.emsg');if(m)m.textContent=t};
  const closePops=()=>el.querySelectorAll('.pal,.lpop').forEach(p=>p.hidden=true);
  const togglePop=sel=>{const p=el.querySelector(sel),was=p.hidden;closePops();p.hidden=!was;return p};

  const rich=richEdit(el,sync);
  const fillAtt=()=>{
    el.classList.toggle('hasg',imagesOf(n).length>0);
    el.querySelector('.eatt').innerHTML=attachmentsHTML(n);
    galleryWire(el,(img,id)=>n.att.find(a=>a.id===id),()=>commit({keepMod:[n.id],render:false,delay:900}));
    hydrate(el);
  };
  const recorder=createRecorder({
    bar:()=>el.querySelector('.rec'),say:msg,
    save:async blob=>{await attach(n,blob,'audio','Recording '+clock(),{auto:true});fillAtt();save()}
  });

  /* ----- attachments and links ----- */
  const isMedia=f=>/^(image|video|audio)\//.test(f.type);
  const addFiles=async files=>{
    msg('');
    for(const f of files){
      const kind=mediaKindOf(f);
      if(!kind){msg(`“${f.name}” isn’t an image, video or audio file.`);continue}
      try{await attach(n,f,kind,f.name)}
      catch(e){msg(`Couldn’t store “${f.name}”. Browser storage may be full or unavailable.`)}
    }
    fillAtt();
  };
  const addLinks=urls=>{
    msg('');
    for(const u of urls)if(!n.links.some(l=>l.url===u))n.links.push({url:u});
    fillAtt();
  };
  const takePicture=()=>{
    closePops();msg('');
    takePhoto().then(async bl=>{
      if(!bl)return;
      try{await attach(n,bl,'image','Photo '+clock()+'.jpg',{auto:true});fillAtt()}
      catch(err){msg('Couldn’t store the photo.')}
    });
  };

  /* ----- labels ----- */
  const fillDate=()=>{const e=el.querySelector('.edate'),t=dateText();if(e&&e.textContent!==t)e.textContent=t};
  const fillChips=()=>{el.querySelector('.echips').innerHTML=labelChipsHTML(n)+(isNew?'':`<span class="edate">${h(dateText())}</span>`)};
  const fillL=()=>{el.querySelector('.ll').innerHTML=labelRowsHTML(n,el.querySelector('.lq').value.trim())};
  const toggleL=l=>{n.labels=n.labels.includes(l)?n.labels.filter(x=>x!==l):[...n.labels,l];fillChips();fillL()};
  const createLabel=inp=>{                               // a new (or existing) label typed into the picker
    const l=addLabel(inp.value);
    if(l){save();if(!n.labels.includes(l))n.labels=[...n.labels,l];inp.value='';fillChips();fillL()}
  };

  const draw=(focus,pal)=>{
    el.className='editor';el.style.setProperty('--c',`var(--k${n.color})`);
    el.innerHTML=editorHTML(n,isNew,pal);
    const f=focus&&el.querySelector(focus);
    if(f){f.focus();if(f.classList.contains('rt'))caretEnd(f);else if(f.value)f.setSelectionRange(f.value.length,f.value.length)}
    fit();fillChips();fillAtt();recorder.show();rich.update();
  };
  const fin=async n2=>{if(recorder.active)await recorder.stop();rich.linkify();done(n2)};

  /* ----- what the buttons do (data-e on the button picks the entry) ----- */
  const act={
    undo:()=>rich.undo(), redo:()=>rich.redo(),
    fb:()=>rich.format('bold'), fi:()=>rich.format('italic'), fu:()=>rich.format('underline'), fc:()=>rich.clearFormat(),
    color:()=>{togglePop('.pal')},
    lbl:()=>{const p=togglePop('.lpop');if(!p.hidden){fillL();el.querySelector('.lq').focus()}},
    amed:()=>{closePops();el.querySelector('.fmed').click()},
    cam:takePicture,
    arec:()=>{closePops();recorder.start()},
    rstop:()=>{recorder.stop()}, rcancel:()=>recorder.cancel(),
    ratt:b=>{const id=b.dataset.id;n.att=n.att.filter(x=>x.id!==id);removeBlob(id);fillAtt()},
    rlink:(b,i)=>{n.links.splice(i,1);fillAtt()},
    rmlbl:b=>{n.labels=n.labels.filter(x=>x!==b.dataset.l);fillChips();fillL()},
    lt:b=>toggleL(b.dataset.l),
    lnew:()=>createLabel(el.querySelector('.lq')),
    col:(b,i)=>{n.color=i;draw(null,true)},
    pin:()=>{n.pinned=!n.pinned;moveToTop(n);draw()},
    tick:(b,i)=>{n.items[i].d=!n.items[i].d;draw()},
    rm:(b,i)=>{n.items.splice(i,1);draw()},
    add:()=>{n.items.push({t:'',d:false});draw('.x:last-of-type')},
    list:()=>{
      if(n.isList){n.body=n.items.map(x=>x.t).join('\n');n.items=[];n.isList=false;n.html=''}
      else{n.items=n.body.split('\n').filter(s=>s.trim()).map(t=>({t,d:false}));if(!n.items.length)n.items=[{t:'',d:false}];n.body='';n.html='';n.isList=true}
      draw(n.isList?'.x':'.rt');
    },
    trash:()=>{n.trashed=true;n.pinned=false;fin(n)},
    done:()=>fin(n)
  };
  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-e]');if(!b)return;
    sync();
    const f=act[b.dataset.e];if(f)f(b,+b.dataset.i);
  });

  /* ----- typing ----- */
  el.addEventListener('input',e=>{
    const inRt=e.target.classList.contains('rt');
    if(inRt)rich.beforeSync(e);
    sync();
    if(inRt)rich.afterSync(e);
    if(e.target.classList.contains('lq'))fillL();
    fillDate();
  });
  el.addEventListener('click',()=>setTimeout(fillDate,0));   // colour, labels, attachments and so on change the note too
  el.addEventListener('keydown',e=>{
    if(e.target.classList.contains('lq')&&e.key==='Enter'){e.preventDefault();createLabel(e.target);return}
    if(e.target.classList.contains('x')&&e.key==='Enter'){        // Enter in a checklist item adds the next item
      e.preventDefault();sync();const i=+e.target.dataset.i+1;
      n.items.splice(i,0,{t:'',d:false});draw(`.x[data-i="${i}"]`);
    }
  });

  /* ----- files and web addresses dropped, pasted or chosen ----- */
  el.addEventListener('paste',e=>{
    if(e.target.classList.contains('lq'))return;
    const cd=e.clipboardData;if(!cd)return;
    if(!cd.getData('text/plain')&&cd.files&&cd.files.length){
      const fs=[...cd.files].filter(isMedia);
      if(fs.length){e.preventDefault();addFiles(fs)}
    }
  });
  el.addEventListener('dragover',e=>{
    const t=e.dataTransfer?[...e.dataTransfer.types]:[];
    if(t.includes('Files')||t.includes('text/uri-list')){e.preventDefault();el.classList.add('drop')}
  });
  el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.classList.remove('drop')});
  el.addEventListener('drop',e=>{
    el.classList.remove('drop');
    const dt=e.dataTransfer;if(!dt||e.target.classList.contains('lq'))return;
    if(dt.files&&dt.files.length){
      e.preventDefault();
      const fs=[...dt.files].filter(isMedia),skipped=dt.files.length-fs.length;
      if(fs.length)addFiles(fs).then(()=>{if(skipped)msg(`${skipped} file${skipped===1?' was':'s were'} skipped: only images, videos and audio can be attached.`)});
      else msg('Only images, videos and audio can be attached.');
      return;
    }
    const urls=urlsIn(dt.getData('text/uri-list'))||urlsIn(dt.getData('text/plain'));
    if(urls){e.preventDefault();msg('');if(!rich.appendLinks(urls))addLinks(urls)}
  });
  el.addEventListener('change',e=>{
    const t=e.target;
    if(t.classList.contains('fmed')){addFiles([...t.files]);t.value=''}
  });

  galleryEditor(el,{
    ids:()=>imagesOf(n).map(a=>a.id),
    items:()=>imagesOf(n),
    src:mediaURL,
    commit:(ids,id)=>{
      reorderImages(n,ids);fillAtt();
      const t=[...el.querySelectorAll('.gal .gt')].find(x=>x.dataset.id===id);if(t)t.focus({preventScroll:true});
    }
  });
  /* what the page needs from an open editor */
  el.api={cleanup:recorder.cancel,startRec:recorder.start,linkify:rich.linkify};
  draw();
  return el;
}
