/* order.js: the order of notes in the main view.
   Default: newest first, by created time (ts). Dragging a note gives it an explicit `pos`; a note without `pos` is ordered by `ts`.
   A note's sort key is therefore `pos` if it has one, otherwise `ts`, and the view is sorted by that key, highest first.
   Moving a note rewrites only that note's key (a value between its new neighbours), so in folder mode one drag changes one file.
   Everything here is pure (no DOM), so it can be tested on its own. */
'use strict';

const ORD={
  minGap:0.01,   // when two neighbours' keys are closer than this (ms), the neighbourhood is respaced instead of halving again
  step:1         // spacing used when respacing, and the nudge used for "above everything" / "below everything"
};

const orderKey=n=>typeof n.pos==='number'&&isFinite(n.pos)?n.pos:n.ts;
const byOrder=(a,b)=>orderKey(b)-orderKey(a)||(a.id<b.id?-1:a.id>b.id?1:0);

/* The key that puts a note at the top of the section it is entering. `section` = the other notes of that section. */
function topKey(section){
  return section.length?Math.max(...section.map(orderKey))+ORD.step:Date.now();
}

/* Where does a moved note go? `all` = every note of the section (any order, may include the moved one), `id` = the moved note,
   `prevId` = the note it must come right after (the one above it in the view), or null for the very top.
   Returns {noteId: newKey}: normally just the moved note. When the gap it lands in is too narrow, a few neighbours are respaced as well. */
function placeNote(all,id,prevId){
  const rest=all.filter(n=>n.id!==id).sort(byOrder);
  const t=prevId?rest.findIndex(n=>n.id===prevId)+1:0;          // index the note will have among `rest`
  const hi=t>0?orderKey(rest[t-1]):null,lo=t<rest.length?orderKey(rest[t]):null;
  if(hi==null&&lo==null)return{};                              // alone in its section
  if(hi==null)return{[id]:lo+ORD.step};                         // top
  if(lo==null)return{[id]:hi-ORD.step};                         // bottom
  if(hi-lo>=ORD.minGap)return{[id]:(hi+lo)/2};
  /* Crowded: respace a window of neighbours around the slot, widening it until there is room. */
  let from=Math.max(0,t-3),to=Math.min(rest.length,t+3),up,low;
  for(;;){
    up=from>0?orderKey(rest[from-1]):Infinity;
    low=to<rest.length?orderKey(rest[to]):-Infinity;
    const count=to-from+1;
    if(!isFinite(up)||!isFinite(low)||up-low>=(count+1)*ORD.step)break;
    from=Math.max(0,from-count);to=Math.min(rest.length,to+count);
  }
  const win=rest.slice(from,to);win.splice(t-from,0,{id});      // the moved note sits at its slot in the window
  const count=win.length,out={};
  if(isFinite(up)&&isFinite(low)){const s=(up-low)/(count+1);win.forEach((n,i)=>{out[n.id]=up-s*(i+1)})}
  else if(isFinite(low)){const top=Math.max(orderKey(rest[from]),low+count+1);win.forEach((n,i)=>{out[n.id]=top-i})}
  else if(isFinite(up)){win.forEach((n,i)=>{out[n.id]=up-1-i})}
  else{const top=orderKey(rest[0]);win.forEach((n,i)=>{out[n.id]=top-i})}
  return out;
}

if(typeof module!=='undefined')module.exports={ORD,orderKey,byOrder,topKey,placeNote};
