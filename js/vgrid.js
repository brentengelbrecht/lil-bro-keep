/* vgrid.js: virtual masonry for the notes area.
   Only cards in or near the viewport exist in the page. The rest are just numbers (a position and a height).
   - Layout is our own: n columns of equal width; each note goes into the shortest column, in list order
     (so newest-first reads left to right, like Google Keep). The container gets the full height, cards are absolutely positioned.
   - A card's height is an estimate until the card has been on screen; then the measured height is cached and used.
   - When a height is corrected, everything below it moves, and scrolling is adjusted so what the person is looking at stays put.
   - Cards are kept by note id. A card is only rebuilt when its content signature changes, so changing one note touches one card.
   Needs gallery.js (groupRows, GAL). The app supplies the card HTML, the signature and the wiring. */
'use strict';

const VG={
  gap:16,          // px between cards
  colW:240,        // minimum column width, as before with column-width
  overscan:1,      // render this many viewport heights above and below the viewport
  cardMax:32       // a card is never taller than the window minus this (see .card max-height)
};

const vgHeights=new Map();   // note id -> {cw, h}: last measured height at that column width
const vgSet=new Set();       // live grids
let vgRaf=0;

/* Height of a card before it has been measured. The picture part is exact (it follows from the stored sizes); text is approximate. */
function vgEstimate(n,cw){
  const inner=cw-32;
  let h=2;                                              // card border
  const att=n.att||[],imgs=att.filter(a=>a.kind==='image');
  let media=0;
  if(imgs.length)groupRows(imgs).slice(0,GAL.gridRows).forEach((r,i)=>{
    const s=r.reduce((t,a)=>t+(a.w>0&&a.h>0?a.w/a.h:1),0);
    media+=(cw-2-GAL.gap*(r.length-1))/s+(i?GAL.gap:0);
  });
  media+=att.filter(a=>a.kind==='video').length*Math.min(320,Math.max(48,(cw-2)*.5625))
        +att.filter(a=>a.kind==='audio').length*54;
  h+=media||12;                                         // card padding-top when there is no media
  h+=media?12:4;                                        // padding of the coloured block (no top padding when the card has no media)
  const tt=n.stub?(n.idxTitle||''):n.title;             // a note not read yet: its index title and a guess at two lines of text
  if(tt)h+=Math.max(1,Math.ceil(tt.length*9.7/(inner-28)))*26.6+8;
  if(n.stub)h+=n.enc?110:58;
  if(n.isList){
    let lh=0;
    for(const it of n.items||[])lh+=Math.max(1,Math.ceil((it.t||'').length*8.7/(inner-34)))*25.3+9;
    h+=Math.min(320,lh)+8;                              // a long checklist is cut off at 320px (.card ul)
  }else if(n.body){
    let lines=0;
    for(const l of String(n.body).split('\n'))lines+=Math.max(1,Math.ceil(l.length*8.7/inner));
    h+=Math.min(320,lines*25.3)+8;
  }
  if((n.links||[]).length)h+=n.links.length*28+8;
  if((n.labels||[]).length)h+=Math.max(1,Math.ceil(n.labels.reduce((t,l)=>t+l.length*7+40,0)/inner))*34+8+4;   // +4: .chips has 2px padding above and below
  /* With a mouse the icon row is a bar that slides over the bottom of the note and takes no room (see .acts in the CSS); with touch it is a row of its own. */
  if(matchMedia('(hover:hover)').matches)h=Math.max(h+((n.labels||[]).length?2:12),88);else h+=32;
  return Math.min(h,Math.max(120,innerHeight-VG.cardMax));
}

/* Change the layout while keeping the card the person is looking at where it is. */
function vgAnchored(fn){
  let a=null,top=Infinity;
  document.querySelectorAll('.vg>.card:not(.dragging)').forEach(c=>{
    const r=c.getBoundingClientRect();
    if(r.bottom>0&&r.top<top){top=r.top;a=c}
  });
  fn();
  if(a&&a.isConnected){
    const d=a.getBoundingClientRect().top-top;
    if(Math.abs(d)>.5)window.scrollBy(0,d);
  }
}
function vgSchedule(){
  if(vgRaf)return;
  vgRaf=requestAnimationFrame(()=>{vgRaf=0;vgAnchored(()=>vgSet.forEach(g=>g.sync()))});
}
window.addEventListener('scroll',vgSchedule,{passive:true});
window.addEventListener('resize',vgSchedule);

/* ---------- keyboard: the grid is one Tab stop; arrow keys move between cards ----------
   One card (vgCur) has tabindex 0, and so do its buttons; every other card and its buttons have -1, so Tab passes through the grid in one step.
   Arrow keys move to the neighbouring card (worked out from the layout, so cards that are not on screen can be reached), Enter or Space opens
   the focused card, Home and End go to the first and last. Moving to a card that is off screen scrolls it into view. */
let vgCur=null;
function vgTabStops(el,on){el.tabIndex=on?0:-1;el.querySelectorAll('button,a[href]').forEach(x=>{x.tabIndex=on?0:-1})}
function vgSetCur(id){
  if(vgCur===id)return;
  vgCur=id;
  document.querySelectorAll('.vg>.card').forEach(c=>vgTabStops(c,c.dataset.id===id));
}
function vgEnsureCur(){                                   // the Tab stop must exist: if its card is gone, it moves to the first card
  const gs=[...vgSet];
  if(vgCur&&gs.some(g=>g.has(vgCur)))return;
  const g=gs.find(x=>x.ids().length);
  vgSetCur(g?g.ids()[0]:null);
}
function vgMove(from,id,dir){
  const gs=[...vgSet].filter(g=>g.ids().length),gi=gs.indexOf(from);
  let target=null;
  if(dir==='home'){target=gs[0].ids()[0];window.scrollTo(0,0)}      // back to the very top, composer and headings included
  else if(dir==='end'){const l=gs[gs.length-1].ids();target=l[l.length-1]}
  else{
    target=from.near(id,dir);
    if(!target&&dir==='down'&&gs[gi+1])target=gs[gi+1].edge('top',from.xOf(id));       // past the last card of a section: into the next section
    if(!target&&dir==='up'&&gs[gi-1])target=gs[gi-1].edge('bottom',from.xOf(id));
  }
  if(target)vgFocusCard(target);
}
function vgFocusCard(id){                                  // focus a card, scrolling it into view and drawing it first if it is not on screen
  const g=[...vgSet].find(x=>x.has(id));if(!g)return false;
  const el=g.reveal(id);if(el){el.focus({preventScroll:true});return true}
  return false;
}

/* host: the container element. o: {html(n), sig(n), wire(el,n), gone(id), drag?}
   o.drag (optional, makes the cards draggable): {can(), start(), commit(id, prevId)}
   commit is told which note was dropped and which note it now follows (null = the top); the app decides what that means for the data. */
function vgCreate(host,o){
  let items=[],view=[],pos=[],single=false,W=0,cw=0,cols=1,drag=null,dg=null,measuredCw=0;
  const mounted=new Map(),tpl=document.createElement('template');
  const hostRO=new ResizeObserver(()=>{if(Math.abs(host.clientWidth-W)>.5)vgSchedule()});
  const cardRO=new ResizeObserver(es=>{
    let changed=false;
    for(const e of es){if(measure(e.target))changed=true}
    if(changed)vgSchedule();
  });
  hostRO.observe(host);

  const heightOf=n=>{const c=vgHeights.get(n.id);return c&&Math.abs(c.cw-cw)<.5?c.h:vgEstimate(n,cw)};
  function measure(el){                                  // returns true when the cached height changed
    const id=el.dataset.id,h=el.getBoundingClientRect().height;
    if(!id||!h||!cw)return false;
    const c=vgHeights.get(id);
    if(c&&Math.abs(c.cw-cw)<.5&&Math.abs(c.h-h)<.4)return false;
    vgHeights.set(id,{cw,h});return true;
  }
  function place(el,p){
    el.style.width=cw+'px';
    el.style.transform=`translate(${p.x}px,${p.y}px)`;
  }
  /* While a card is being dragged, the layout is of the list with that card taken out and put back at the slot it is hovering over. */
  function dragView(){
    const others=items.filter(n=>n.id!==drag.id);
    drag.slot=Math.max(0,Math.min(others.length,drag.slot));
    others.splice(drag.slot,0,drag.note);
    return others;
  }
  function layout(){
    W=host.clientWidth;
    if(!W)return false;
    cols=single?1:Math.max(1,Math.floor((W+VG.gap)/(VG.colW+VG.gap)));
    cw=(W-(cols-1)*VG.gap)/cols;
    view=drag?dragView():items;
    const colH=new Array(cols).fill(0);
    pos=view.map(n=>{
      let c=0;for(let k=1;k<cols;k++)if(colH[k]<colH[c])c=k;
      const h=heightOf(n),p={x:c*(cw+VG.gap),y:colH[c],h};
      colH[c]+=h+VG.gap;return p;
    });
    host.style.height=(view.length?Math.max(...colH)-VG.gap:0)+'px';
    view.forEach((n,i)=>{
      const el=mounted.get(n.id);if(!el)return;
      if(drag&&n.id===drag.id){drag.slotPos=pos[i];return}      // the dragged card follows the pointer instead
      place(el,pos[i]);
    });
    if(drag&&drag.ph&&drag.slotPos){
      drag.ph.style.width=cw+'px';drag.ph.style.height=drag.slotPos.h+'px';
      drag.ph.style.transform=`translate(${drag.slotPos.x}px,${drag.slotPos.y}px)`;
    }
    return true;
  }
  function mk(n){
    tpl.innerHTML=o.html(n).trim();
    const el=tpl.content.firstElementChild;
    el._sig=o.sig(n);
    o.wire(el,n);
    vgTabStops(el,n.id===vgCur);
    return el;
  }
  function unmount(id){
    const el=mounted.get(id);if(!el)return;
    cardRO.unobserve(el);el.remove();mounted.delete(id);
    if(o.gone)o.gone(id);
  }
  /* Mount the cards near the viewport, unmount the rest, and settle on measured heights. */
  function sync(){
    for(let pass=0;pass<4;pass++){
      if(!layout())return;
      const r=host.getBoundingClientRect(),vh=innerHeight,over=vh*VG.overscan;
      const top=-r.top-over,bot=-r.top+vh+over;
      const want=new Set(),fresh=[];
      if(drag)want.add(drag.id);
      view.forEach((n,i)=>{
        const p=pos[i];
        if(p.y+p.h>top&&p.y<bot){
          want.add(n.id);
          if(!mounted.has(n.id)){
            const el=mk(n);place(el,p);host.append(el);cardRO.observe(el);mounted.set(n.id,el);fresh.push(el);
          }
        }
      });
      [...mounted.keys()].forEach(id=>{
        if(!want.has(id)&&!mounted.get(id).contains(document.activeElement))unmount(id);
      });
      let changed=false;
      fresh.forEach(el=>{if(measure(el))changed=true});   // reading the heights now, before anything is painted
      /* When the card width has changed (the window is being resized) every cached height is for another width. The cards on screen
         already have their new width, so read their real heights now, in this frame, instead of laying out from estimates and
         correcting a frame later (that back-and-forth was the flicker). */
      if(cw!==measuredCw){measuredCw=cw;mounted.forEach(el=>{if(measure(el))changed=true})}
      if(!changed)return;
    }
    layout();
  }

  /* ---------- drag to reorder ---------- */
  /* The gesture (when a press becomes a drag, Escape, scrolling, the swallowed click) is in drag.js; this is what is specific to cards.
     While dragging, `drag` is that gesture's state plus: the dragged note, the slot it is hovering over, and where it started. */
  const interactive='button,a,input,textarea,select,[contenteditable],video,audio';
  function liftCard(g){
    const id=g.el.dataset.id,idx=items.findIndex(n=>n.id===id);
    if(idx<0||!g.el.isConnected)return false;
    if(o.drag.start)o.drag.start();
    const r=g.el.getBoundingClientRect();
    Object.assign(g,{id,note:items[idx],slot:idx,orig:idx,offX:g.x0-r.left,offY:g.y0-r.top,lock:0,slotPos:null});
    drag=g;
    g.el.classList.add('dragging');host.classList.add('vgdrag');document.documentElement.classList.add('vgdragging');
    g.ph=document.createElement('div');g.ph.className='vgph';g.ph.style.transition='none';host.append(g.ph);   // appears in place, it does not glide in
    if(window.getSelection)getSelection().removeAllRanges();
    layout();follow();
    g.ph.getBoundingClientRect();g.ph.style.transition='';
  }
  /* The card hovering over another card's middle takes that card's place; the others slide out of the way. */
  function follow(){
    if(!drag)return;
    const r=host.getBoundingClientRect(),px=drag.x-r.left,py=drag.y-r.top;
    drag.el.style.transform=`translate(${px-drag.offX}px,${py-drag.offY}px)`;
    const now=performance.now();
    if(now<drag.lock){                                           // just moved: look again once the cards have settled
      if(!drag.lt)drag.lt=setTimeout(()=>{if(drag){drag.lt=0;follow()}},drag.lock-now+10);
      return;
    }
    let k=-1;
    for(let i=0;i<view.length;i++){
      if(view[i].id===drag.id)continue;
      const p=pos[i];
      if(px>=p.x+cw*.15&&px<=p.x+cw*.85&&py>=p.y+p.h*.15&&py<=p.y+p.h*.85){k=i;break}
    }
    let slot=drag.slot;
    if(k>=0)slot=k;
    else if(py<0)slot=0;
    else if(py>parseFloat(host.style.height)+10)slot=items.length-1;
    if(slot!==drag.slot){drag.slot=slot;drag.lock=performance.now()+220;sync()}
  }
  function dropCard(g,ok){
    clearTimeout(g.lt);
    const prev=g.slot>0?view[g.slot-1].id:null,moved=ok&&g.slot!==g.orig;
    host.classList.add('vgsettle');                             // the card glides into its slot instead of jumping
    g.el.classList.remove('dragging');g.ph.remove();
    host.classList.remove('vgdrag');document.documentElement.classList.remove('vgdragging');
    drag=null;
    if(moved)o.drag.commit(g.id,prev);else sync();
    setTimeout(()=>host.classList.remove('vgsettle'),320);
  }
  if(o.drag)dg=dragGesture(host,{
    hold:350,distance:5,slop:10,                                 // a mouse only starts by moving; touch starts by holding
    pick:e=>{
      const el=e.target.closest&&e.target.closest('.card');
      return el&&el.parentNode===host&&!e.target.closest(interactive)&&o.drag.can()?el:null;
    },
    begin:liftCard,move:follow,end:dropCard,
    scroll:()=>({top:64+50,bottom:innerHeight-60})              // clear of the sticky header
  });

  /* keyboard */
  host.addEventListener('focusin',e=>{
    const c=e.target.closest&&e.target.closest('.card');
    if(c&&c.parentNode===host)vgSetCur(c.dataset.id);
  });
  host.addEventListener('keydown',e=>{
    if(!e.target.classList||!e.target.classList.contains('card')||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;   // only the card itself, not its buttons; Alt+arrows reorder (app.js)
    if(e.key==='Enter'||e.key===' '){e.preventDefault();e.target.click();return}
    const dir={ArrowDown:'down',ArrowUp:'up',ArrowLeft:'left',ArrowRight:'right',Home:'home',End:'end'}[e.key];
    if(!dir)return;
    e.preventDefault();vgMove(api,e.target.dataset.id,dir);
  });
  const idx=id=>view.findIndex(n=>n.id===id);
  const api={
    sync,
    ids:()=>items.map(n=>n.id),
    has:id=>items.some(n=>n.id===id),
    xOf:id=>{const i=idx(id);return i<0?0:pos[i].x},
    /* The neighbouring card in a direction: up/down stay in the column, left/right go to the card in the next column closest in height. */
    near(id,dir){
      const i=idx(id);if(i<0||!pos[i])return null;
      const p=pos[i];let best=-1,bd=Infinity;
      for(let j=0;j<pos.length;j++){
        const q=pos[j];
        if(dir==='down'||dir==='up'){
          if(Math.abs(q.x-p.x)>1)continue;
          const d=dir==='down'?q.y-p.y:p.y-q.y;
          if(d>.5&&d<bd){bd=d;best=j}
        }else{
          const tx=p.x+(dir==='right'?1:-1)*(cw+VG.gap);
          if(Math.abs(q.x-tx)>1)continue;
          const d=Math.abs(q.y+q.h/2-(p.y+p.h/2));
          if(d<bd){bd=d;best=j}
        }
      }
      return best<0?null:view[best].id;
    },
    /* The top or bottom card of the column nearest to x: where the arrow lands when it enters this section from the next one */
    edge(where,x){
      let best=-1,bx=Infinity,by=0;
      pos.forEach((q,j)=>{
        const dx=Math.abs(q.x-x);
        if(dx<bx-1||(Math.abs(dx-bx)<=1&&(where==='top'?q.y<by:q.y>by))){bx=dx;by=q.y;best=j}
      });
      return best<0?null:view[best].id;
    },
    /* Make sure a card is drawn and on screen (below the sticky header), and return its element. */
    reveal(id){
      const i=idx(id);if(i<0)return null;
      const hr=host.getBoundingClientRect(),p=pos[i],top=hr.top+p.y,bottom=top+p.h,head=64+12;
      if(top<head)window.scrollBy(0,top-head);
      else if(bottom>innerHeight-8)window.scrollBy(0,Math.min(bottom-innerHeight+16,top-head));
      sync();
      return mounted.get(id)||null;
    },
    /* New list (and list/grid mode). Cards whose content did not change are kept as they are. */
    update(list,isSingle){
      items=list;single=!!isSingle;
      if(drag&&!list.some(n=>n.id===drag.id))dg.cancel();
      const by=new Map(list.map(n=>[n.id,n]));
      for(const [id,el] of [...mounted]){
        const n=by.get(id);
        if(!n){unmount(id);continue}
        if(el._sig!==o.sig(n)&&!(drag&&drag.id===id)){
          vgHeights.delete(id);
          const ne=mk(n);
          ne.style.width=el.style.width;ne.style.transform=el.style.transform;
          cardRO.unobserve(el);el.replaceWith(ne);cardRO.observe(ne);mounted.set(id,ne);
        }
      }
      vgAnchored(sync);
      vgEnsureCur();
    },
    destroy(){
      if(dg)dg.cancel();
      hostRO.disconnect();cardRO.disconnect();
      [...mounted.keys()].forEach(unmount);
      vgSet.delete(this);
    },
    count:()=>mounted.size
  };
  return api;
}
function vgMake(host,o){const g=vgCreate(host,o);vgSet.add(g);return g}

if(typeof module!=='undefined')module.exports={VG,vgEstimate};
