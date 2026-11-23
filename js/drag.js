/* drag.js: the pointer gesture behind every drag-to-reorder in the app (image order in the editor, note order in the grid).
   It knows nothing about what is being dragged. It decides when a press becomes a drag, keeps the drag alive, and tidies up afterwards:
     - mouse / pen:  press and move a few pixels starts a drag (o.holdMouse also lets a press-and-hold start one)
     - touch:        press and hold starts a drag; moving before the hold is up means the person is scrolling, so nothing starts
     - while dragging: the pointer is captured, touch scrolling is blocked, Escape cancels, the page scrolls near the edges
     - afterwards:   the click that follows a drag is swallowed so it cannot open the note or viewer under the pointer
   Options: o.hold (ms), o.distance (px), o.slop (px), o.holdMouse (bool); defaults are in DRAG below.
   The caller supplies what is specific (all coordinates are client coordinates):
     o.pick(e)        which element does this press grab? null means ignore it (not allowed now, or a button was pressed)
     o.begin(g)       the drag starts. g = {el, id of pointer, x0,y0 (press point), x,y (now)}; the caller may add its own fields to g.
                      Return false to refuse.
     o.move(g)        the pointer moved (or the page scrolled under it): g.x, g.y are current
     o.end(g, ok)     the drag is over; ok is false when it was cancelled (Escape, pointercancel, cancel()). The caller removes its own
                      visuals here and commits the result.
     o.scroll(g)      optional: {el, top, bottom} scroll el (omit el for the window) while the pointer is above top or below bottom
   Returns {cancel(), active}. */
'use strict';

const DRAG={hold:300,distance:5,slop:10,maxScroll:20};   // ms to hold, px of mouse movement that starts a drag, px of touch movement that means scrolling

function dragGesture(root,o){
  const hold=o.hold||DRAG.hold,movePx=o.distance||DRAG.distance,slop=o.slop||DRAG.slop;
  let pend=null,g=null,raf=0;

  const onTouch=e=>{if(g)e.preventDefault()};        // once a drag has started the page must not scroll under the finger
  function dropPending(){
    if(!pend)return;
    clearTimeout(pend.timer);pend=null;
    if(!g)document.removeEventListener('touchmove',onTouch);
  }
  function start(){
    const p=pend;if(!p||g)return;
    clearTimeout(p.timer);pend=null;
    g={el:p.el,pid:p.pid,type:p.type,x0:p.x0,y0:p.y0,x:p.x,y:p.y};
    if(o.begin(g)===false){g=null;document.removeEventListener('touchmove',onTouch);return}
    try{g.el.setPointerCapture(g.pid)}catch(err){quiet('pointer capture is refused when the pointer is already gone',err)}
    window.addEventListener('keydown',onKey,true);        // on window, so a drag in progress gets Escape before any dialog does
    raf=requestAnimationFrame(loop);
  }
  function loop(){
    if(!g)return;
    const s=o.scroll&&o.scroll(g);
    if(s){
      let d=0;
      if(g.y<s.top)d=-Math.min(DRAG.maxScroll,(s.top-g.y)/3+2);
      else if(g.y>s.bottom)d=Math.min(DRAG.maxScroll,(g.y-s.bottom)/3+2);
      if(d){
        if(s.el){const b=s.el.scrollTop;s.el.scrollTop+=d;if(s.el.scrollTop!==b)o.move(g)}
        else{const b=scrollY;window.scrollBy(0,d);if(scrollY!==b)o.move(g)}
      }
    }
    raf=requestAnimationFrame(loop);
  }
  function finish(ok){
    const d=g;if(!d)return;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown',onKey,true);document.removeEventListener('touchmove',onTouch);
    try{d.el.releasePointerCapture(d.pid)}catch(err){quiet('the pointer capture was already released',err)}
    const sw=ev=>{ev.stopPropagation();ev.preventDefault()};
    root.addEventListener('click',sw,{capture:true,once:true});
    setTimeout(()=>root.removeEventListener('click',sw,true),0);
    g=null;
    o.end(d,ok);
  }
  function onKey(e){if(e.key==='Escape'){e.stopPropagation();e.preventDefault();finish(false)}}

  root.addEventListener('pointerdown',e=>{
    if(e.button!==0||pend||g)return;
    const el=o.pick(e);if(!el)return;
    pend={el,pid:e.pointerId,type:e.pointerType,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY};
    if(e.pointerType==='touch'||o.holdMouse)pend.timer=setTimeout(start,hold);
    if(e.pointerType==='touch')document.addEventListener('touchmove',onTouch,{passive:false});
  });
  root.addEventListener('pointermove',e=>{
    if(g){
      if(e.pointerId!==g.pid)return;
      g.x=e.clientX;g.y=e.clientY;e.preventDefault();o.move(g);return;
    }
    if(!pend||e.pointerId!==pend.pid)return;
    pend.x=e.clientX;pend.y=e.clientY;
    const far=Math.hypot(pend.x-pend.x0,pend.y-pend.y0);
    if(pend.type==='touch'){if(far>slop)dropPending()}      // moving before the hold is up: a scroll
    else if(far>=movePx)start();
  });
  root.addEventListener('pointerup',e=>{
    if(g&&e.pointerId===g.pid)finish(true);else if(pend&&e.pointerId===pend.pid)dropPending();
  });
  root.addEventListener('pointercancel',e=>{
    if(g&&e.pointerId===g.pid)finish(false);else if(pend&&e.pointerId===pend.pid)dropPending();
  });
  root.addEventListener('contextmenu',e=>{if(pend||g)e.preventDefault()});

  return{cancel(){if(g)finish(false);else dropPending()},get active(){return !!g}};
}
