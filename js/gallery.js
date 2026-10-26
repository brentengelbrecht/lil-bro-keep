/* gallery.js: Google Keep-style image gallery (see google-keep-image-layout-spec.md). Icons and the escaping helper h() come from util.js.
   - groupRows():   ordered images -> rows (first row = N mod 3 when not zero, then rows of 3)
   - galleryHTML(): the same markup for the card (first two rows) and the editor (all rows)
   - galleryWire(): fills in missing image sizes and shows a placeholder for images that fail to load
   - galleryEditor(): editor only: drag-and-drop reordering, keyboard moves, full-window viewer
   The ordered list of attachment ids is the single source of truth. Row heights come from flexbox
   (flex-grow = aspect ratio, flex-basis 0), never from JavaScript pixel maths. */
'use strict';

/* All tunable constants live here. */
const GAL={
  maxPerRow:3,      // images per row
  gridRows:2,       // rows shown on a card in the grid view
  gap:2,            // px between images (also written to --gal-gap for the CSS)
  slideMs:300,      // ms for the viewer's slide between images (must match .ivsl in the CSS)
  holdMs:300,       // press-and-hold time that starts a drag
  moveStart:4,      // px of pointer travel that starts a drag with mouse or pen
  touchSlop:10,     // px of travel on touch that is treated as scrolling, not a drag
  preview:80,       // long side of the floating drag preview, px
  edge:36,          // px from the top or bottom of the note where dragging auto-scrolls
  zoomMin:0.4,      // viewer zoom limits, relative to the initial fit-to-window size (100%)
  zoomMax:2,
  zoomStep:1.25
};
if(typeof document!=='undefined')document.documentElement.style.setProperty('--gal-gap',GAL.gap+'px');

const galRatio=a=>a&&a.w>0&&a.h>0?a.w/a.h:1;     // missing size: 1:1 until the image loads

/* ---------- pure helpers (no DOM) ---------- */

/* Ordered images -> array of rows. N mod 3 images in the first row (if not 0), then rows of 3. */
function groupRows(items,max){
  max=max||GAL.maxPerRow;
  const rows=[],r=items.length%max;let i=0;
  if(r){rows.push(items.slice(0,r));i=r}
  for(;i<items.length;i+=max)rows.push(items.slice(i,i+max));
  return rows;
}
/* New id order after dropping dragId before or after targetId. */
function galDrop(ids,dragId,targetId,after){
  if(dragId===targetId)return ids.slice();
  const rest=ids.filter(x=>x!==dragId),k=rest.indexOf(targetId);
  if(k<0||rest.length===ids.length)return ids.slice();
  rest.splice(after?k+1:k,0,dragId);
  return rest;
}
/* New id order after moving id one place earlier (d=-1) or later (d=1). */
function galStep(ids,id,d){
  const i=ids.indexOf(id),j=i+d;
  if(i<0||j<0||j>=ids.length)return ids.slice();
  const r=ids.slice();r.splice(i,1);r.splice(j,0,id);return r;
}
/* Viewer: the 100% size. The whole image fits inside the window (its larger axis fills the window), aspect ratio kept.
   Smaller images are scaled up, larger ones down. */
function galBaseSize(nw,nh,vw,vh){
  const s=Math.min(vw/nw,vh/nh);
  return{w:nw*s,h:nh*s};
}

/* ---------- markup ---------- */

/* o.maxRows: only the first rows of the full grouping (grid view). o.edit: editor tiles. o.tools(a,i,total): extra HTML inside an editor tile. */
function galleryHTML(imgs,o){
  o=o||{};
  if(!imgs||!imgs.length)return'';                 // zero images: nothing at all
  let rows=groupRows(imgs);
  if(o.maxRows)rows=rows.slice(0,o.maxRows);       // never regroup the visible images
  const tile=a=>{
    const i=imgs.indexOf(a),id=h(a.id);
    const at=o.edit?` tabindex="0" role="button" aria-label="${h(a.name||'Image')}, image ${i+1} of ${imgs.length}. Enter opens it, Alt with the left or right arrow moves it."`:'';
    return`<div class="gt" data-id="${id}" style="--ar:${galRatio(a).toFixed(5)}"${at}><img data-m="${id}" alt="${h(a.name||'')}" draggable="false">${o.tools?o.tools(a,i,imgs.length):''}</div>`;
  };
  return`<div class="gal${o.edit?' edit':''}">${rows.map(r=>`<div class="grow">${r.map(tile).join('')}</div>`).join('')}</div>`;
}

/* Call after setting innerHTML and before hydrate(). find(img,id) returns the attachment record; learned(img,rec) runs when a missing size was filled in. */
function galleryWire(root,find,learned){
  root.querySelectorAll('.gal img[data-m]').forEach(img=>{
    const t=img.closest('.gt');
    img.addEventListener('load',()=>{
      const w=img.naturalWidth,h=img.naturalHeight;if(!w||!h)return;
      t.classList.remove('bad');
      const rec=find&&find(img,img.dataset.m);
      if(rec&&!(rec.w>0&&rec.h>0)){
        rec.w=w;rec.h=h;
        t.style.setProperty('--ar',(w/h).toFixed(5));   // only the CSS changes; grouping never depends on size
        if(learned)learned(img,rec);
      }
    });
    img.addEventListener('error',()=>t.classList.add('bad'));
  });
}

/* ---------- editor behaviour ---------- */

/* o.ids(): ordered image ids. o.items(): ordered image records. o.commit(newIds,movedId): store the new order and redraw. o.src(id): promise of a displayable URL. */
function galleryEditor(root,o){
  const openFor=id=>{
    const items=o.items(),i=items.findIndex(a=>a.id===id);
    if(i>=0)galleryViewer(items.map(a=>({id:a.id,name:a.name,w:a.w,h:a.h})),i,o.src);
  };

  root.addEventListener('click',e=>{
    const mv=e.target.closest('[data-g="mv"]');
    if(mv){e.preventDefault();o.commit(galStep(o.ids(),mv.dataset.id,+mv.dataset.d),mv.dataset.id);return}
    const t=e.target.closest('.gal.edit .gt');
    if(!t||e.target.closest('button'))return;
    openFor(t.dataset.id);
  });
  root.addEventListener('keydown',e=>{
    const t=e.target.classList&&e.target.classList.contains('gt')?e.target:null;if(!t)return;
    if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
      e.preventDefault();o.commit(galStep(o.ids(),t.dataset.id,e.key==='ArrowLeft'?-1:1),t.dataset.id);
    }else if(e.key==='Enter'||e.key===' '){e.preventDefault();openFor(t.dataset.id)}
  });

  /* Drag and drop: only chooses a new index in the id list. The gallery is never reflowed while dragging.
     The gesture (when a press becomes a drag, Escape, scrolling, the swallowed click) is in drag.js; this is what is specific to images. */
  function lift(g){                                                       // the drag starts: dim the origin, show a small preview
    g.id=g.el.dataset.id;g.target=null;
    g.el.classList.add('dragging');root.classList.add('gdragging');
    const im=g.el.querySelector('img'),ar=galRatio({w:im.naturalWidth,h:im.naturalHeight}),L=GAL.preview;
    g.pw=ar>=1?L:Math.round(L*ar);g.ph=ar>=1?Math.round(L/ar):L;
    const pv=document.createElement('div');pv.className='gdrag';
    pv.style.width=g.pw+'px';pv.style.height=g.ph+'px';
    const pi=document.createElement('img');pi.src=im.currentSrc||im.src;pi.alt='';pv.append(pi);
    document.body.append(pv);g.pv=pv;
    track(g);
  }
  /* Where would a drop land? {outside}, {same} or {id,after}. */
  function whereTo(g){
    const gal=g.el.closest('.gal'),gr=gal.getBoundingClientRect(),x=g.x,y=g.y;
    if(x<gr.left||x>gr.right||y<gr.top||y>gr.bottom)return{outside:true};
    const own=g.el.getBoundingClientRect();
    if(x>=own.left&&x<=own.right&&y>=own.top&&y<=own.bottom)return{same:true};
    let best=null,bd=Infinity,br=null;
    for(const t of gal.querySelectorAll('.gt')){
      if(t===g.el)continue;
      const r=t.getBoundingClientRect(),dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom),d=Math.hypot(dx,dy);
      if(d<bd){bd=d;best=t;br=r}
      if(d===0)break;
    }
    if(!best)return{outside:true};
    return{id:best.dataset.id,after:x>=br.left+br.width/2,rect:br,gr};
  }
  function track(g){                                                      // move the preview and the insertion line
    g.pv.style.transform=`translate(${g.x-g.pw/2}px,${g.y-g.ph/2}px)`;
    const t=whereTo(g);
    g.target=t.id?t:null;
    if(!g.target){if(g.ins){g.ins.remove();g.ins=null}return}
    if(!g.ins){g.ins=document.createElement('div');g.ins.className='gins';g.el.closest('.gal').append(g.ins)}
    const r=t.rect;
    g.ins.style.left=(t.after?r.right:r.left)-t.gr.left-1.5+'px';
    g.ins.style.top=r.top-t.gr.top+'px';
    g.ins.style.height=r.height+'px';
  }
  function drop(g,ok){
    g.el.classList.remove('dragging');root.classList.remove('gdragging');
    if(g.pv)g.pv.remove();if(g.ins)g.ins.remove();
    const tg=ok?g.target:null,ids=o.ids();
    if(tg){
      const next=galDrop(ids,g.id,tg.id,tg.after);
      if(next.join('\n')!==ids.join('\n'))o.commit(next,g.id);
    }
  }
  dragGesture(root,{
    hold:GAL.holdMs,distance:GAL.moveStart,slop:GAL.touchSlop,holdMouse:true,       // images also start by holding still, with a mouse too
    pick:e=>{const t=e.target.closest&&e.target.closest('.gal.edit .gt');return t&&!e.target.closest('button')?t:null},
    begin:lift,move:track,end:drop,
    scroll:g=>{const sc=g.el.closest('.escroll');if(!sc)return null;const r=sc.getBoundingClientRect();return{el:sc,top:r.top+GAL.edge,bottom:r.bottom-GAL.edge}}
  });
}

/* ---------- full-window image viewer ---------- */

/* items: [{id,name,w,h}] in stored order; i0: index to open; src(id): promise of a URL. */
function galleryViewer(items,i0,src){
  let i=i0,z=1,tok=0;
  const ov=document.createElement('div');
  ov.className='ov iv';ov.tabIndex=-1;
  ov.innerHTML=`<div class="ivsc"><div class="ivin"><span class="ivbox"><img class="ivimg" alt="" draggable="false"></span></div></div>
    <button class="ib ivb ivx" data-v="x" title="Close" aria-label="Close">${ic('close',24)}</button>
    <div class="ivc" aria-live="polite"></div>
    <button class="ib ivb ivp" data-v="prev" title="Previous image" aria-label="Previous image">${ic('prev',32)}</button>
    <button class="ib ivb ivn" data-v="next" title="Next image" aria-label="Next image">${ic('next',32)}</button>
    <div class="ivz"><button class="ib ivb" data-v="rotl" title="Rotate left (Shift+R)" aria-label="Rotate left">${ic('rotl',24)}</button><button class="ib ivb" data-v="rotr" title="Rotate right (R)" aria-label="Rotate right">${ic('rotr',24)}</button><span class="ivd"></span><button class="ib ivb" data-v="zout" title="Zoom out" aria-label="Zoom out">${ic('zout',24)}</button><span class="ivl">100%</span><button class="ib ivb" data-v="zin" title="Zoom in" aria-label="Zoom in">${ic('zin',24)}</button></div>`;
  const $q=s=>ov.querySelector(s),sc=$q('.ivsc'),img=$q('.ivimg'),box=$q('.ivbox');
  /* Rotation is only for looking: it turns the picture in this viewer (a CSS transform) and is forgotten when the viewer closes.
     The image in the note and the file on disk are never touched. Degrees are kept as a running total (90, 180, 270, 360, -90...)
     so a turn always animates the short way round. */
  const rots=new Map();
  const rotOf=()=>rots.get(items[i].id)||0;
  const setRot=(deg,animate)=>{
    if(!animate)img.style.transition='none';
    img.style.setProperty('--rot',deg+'deg');
    if(!animate){void img.offsetWidth;img.style.transition=''}
  };

  function layout(){
    const nw=img.naturalWidth,nh=img.naturalHeight;if(!nw||!nh)return;
    let vw=sc.clientWidth,vh=sc.clientHeight;
    for(let k=0;k<3;k++){                          // a scrollbar appearing changes the visible size, so settle on it
      const side=((Math.round(rotOf()/90)%2)+2)%2===1;               // turned a quarter: the picture is lying on its side
      const b=side?galBaseSize(nh,nw,vw,vh):galBaseSize(nw,nh,vw,vh);   // fit the picture as it is seen, not as it is stored
      const bw=b.w*z,bh=b.h*z;
      box.style.width=bw+'px';box.style.height=bh+'px';                // the box is what is seen (and scrolled); the image is turned inside it
      img.style.width=(side?bh:bw)+'px';img.style.height=(side?bw:bh)+'px';
      const cw=sc.clientWidth,ch=sc.clientHeight;
      if(cw===vw&&ch===vh)break;vw=cw;vh=ch;
    }
    sc.classList.toggle('can',sc.scrollWidth>sc.clientWidth+1||sc.scrollHeight>sc.clientHeight+1);
  }
  function ui(){
    $q('.ivl').textContent=Math.round(z*100)+'%';
    $q('[data-v="zout"]').disabled=z<=GAL.zoomMin+0.0001;
    $q('[data-v="zin"]').disabled=z>=GAL.zoomMax-0.0001;
    $q('.ivp').hidden=i<=0;$q('.ivn').hidden=i>=items.length-1;       // no wrap-around
    $q('.ivc').textContent=(items[i].name||'')+(items.length>1?`  (${i+1} / ${items.length})`:'');
  }
  /* Sliding between images: the image on screen is copied into a layer that slides out while the new image (once it has loaded)
     slides in from the other side. dir is 1 for next (new image arrives from the right) and -1 for previous. */
  let out=null,outT=0,pend=0;
  function endSlide(){
    clearTimeout(outT);pend=0;
    if(out){out.remove();out=null}
    sc.classList.remove('ivsl');sc.style.transform='';
  }
  function slideIn(){
    if(!pend||!out)return;
    const dir=pend,o=out;pend=0;
    void sc.offsetWidth;                                                         // commit the off-screen position before animating
    sc.style.transition='';sc.classList.add('ivsl');o.classList.add('ivsl');
    o.style.transform=`translateX(${-dir*100}%)`;sc.style.transform='none';
    outT=setTimeout(endSlide,GAL.slideMs+100);                                    // clean up even if no transition ends (hidden tab)
  }
  const bad=()=>{img.classList.add('bad');$q('.ivin').classList.add('bad');slideIn()};
  function show(dir){
    const my=++tok;z=1;ui();
    endSlide();
    if(dir&&img.getAttribute('src')&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
      out=sc.cloneNode(true);out.classList.remove('can','panning');out.classList.add('ivout');
      out.removeAttribute('tabindex');out.setAttribute('aria-hidden','true');
      sc.after(out);out.scrollLeft=sc.scrollLeft;out.scrollTop=sc.scrollTop;pend=dir;
      /* The new image is loaded off screen, on the side it will arrive from, so it is never painted in the middle before the slide starts. */
      sc.style.transition='none';sc.style.transform=`translateX(${dir*100}%)`;
    }
    img.alt=items[i].name||'';img.classList.remove('bad');$q('.ivin').classList.remove('bad');img.removeAttribute('src');
    img.style.width=img.style.height=box.style.width=box.style.height='';sc.scrollLeft=sc.scrollTop=0;setRot(rotOf(),false);
    Promise.resolve(src(items[i].id)).then(u=>{
      if(my!==tok)return;
      if(!u){bad();return}
      img.onload=()=>{if(my===tok){layout();sc.scrollLeft=sc.scrollTop=0;slideIn()}};
      img.onerror=()=>{if(my===tok)bad()};
      img.src=u;
    }).catch(()=>{if(my===tok)bad()});
  }
  function go(d){const j=i+d;if(j<0||j>=items.length)return;i=j;show(d)}
  function zoom(f){
    const nz=Math.max(GAL.zoomMin,Math.min(GAL.zoomMax,z*f));if(Math.abs(nz-z)<1e-6)return;
    const cx=(sc.scrollLeft+sc.clientWidth/2)/Math.max(1,sc.scrollWidth),cy=(sc.scrollTop+sc.clientHeight/2)/Math.max(1,sc.scrollHeight);
    z=nz;layout();ui();
    sc.scrollLeft=cx*sc.scrollWidth-sc.clientWidth/2;sc.scrollTop=cy*sc.scrollHeight-sc.clientHeight/2;
  }
  function rotate(dir){
    if(!img.getAttribute('src')||img.classList.contains('bad'))return;
    const deg=rotOf()+dir*90;rots.set(items[i].id,deg);
    setRot(deg,!matchMedia('(prefers-reduced-motion:reduce)').matches);
    layout();
    sc.scrollLeft=(sc.scrollWidth-sc.clientWidth)/2;sc.scrollTop=(sc.scrollHeight-sc.clientHeight)/2;   // keep the picture centred
  }
  const close=()=>d.close();
  function cleanup(){endSlide();document.removeEventListener('keydown',key,true);window.removeEventListener('resize',layout);tok++}
  function key(e){
    const k=e.key;
    if(k==='ArrowLeft')go(-1);
    else if(k==='ArrowRight')go(1);
    else if(k==='+'||k==='=')zoom(GAL.zoomStep);
    else if(k==='-'||k==='_')zoom(1/GAL.zoomStep);
    else if((k==='r'||k==='R')&&!e.ctrlKey&&!e.metaKey&&!e.altKey)rotate(k==='R'?-1:1);
    else return;
    e.stopPropagation();e.preventDefault();         // the note underneath must not see these keys (Escape would close it)
  }
  ov.addEventListener('click',e=>{
    const b=e.target.closest('[data-v]');if(!b)return;
    const v=b.dataset.v;
    if(v==='x')close();else if(v==='prev')go(-1);else if(v==='next')go(1);
    else if(v==='rotl')rotate(-1);else if(v==='rotr')rotate(1);
    else if(v==='zin')zoom(GAL.zoomStep);else if(v==='zout')zoom(1/GAL.zoomStep);
  });
  sc.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoom(e.deltaY<0?GAL.zoomStep:1/GAL.zoomStep)}},{passive:false});

  /* Click, hold and drag pans the image (mouse and pen; touch uses native scrolling). */
  let pan=null;
  sc.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.pointerType==='touch'||e.target===sc)return;     // target===sc is the scrollbar itself
    pan={x:e.clientX,y:e.clientY,l:sc.scrollLeft,t:sc.scrollTop,id:e.pointerId};
    sc.setPointerCapture(e.pointerId);sc.classList.add('panning');e.preventDefault();
  });
  sc.addEventListener('pointermove',e=>{
    if(!pan||e.pointerId!==pan.id)return;
    sc.scrollLeft=pan.l-(e.clientX-pan.x);sc.scrollTop=pan.t-(e.clientY-pan.y);
  });
  const endPan=e=>{if(pan&&e.pointerId===pan.id){pan=null;sc.classList.remove('panning')}};
  sc.addEventListener('pointerup',endPan);sc.addEventListener('pointercancel',endPan);

  const d=openDialog({overlay:ov,label:'Image viewer',outside:false,focus:'.ivx',onClose:cleanup});   // Escape, focus, and the page behind are handled by the dialog helper
  document.addEventListener('keydown',key,true);
  window.addEventListener('resize',layout);
  show();
}

if(typeof module!=='undefined')module.exports={GAL,groupRows,galDrop,galStep,galBaseSize,galleryHTML};
