/* labels.js: the label list in the sidebar: drawing it, renaming and deleting a label, and the clicks and keys inside it.
   Loads before app.js; it reads app.js state (view, sel, notes, LB) and calls render(), commit() and Store only when something happens. */
'use strict';
let lblEdit=null,lblEditVal='',navBusy=false;
function renderNav(){
  const chk=(on,name)=>`${ic(on?'cboxo':'cb0')}<span>${name}</span>`;
  const all=`<button data-all="1"${sel.size===0&&view==='notes'?' class="on"':''} role="checkbox" aria-checked="${sel.size===0}">${chk(sel.size===0,'All notes')}</button>`;
  const row=l=>{
    const on=sel.has(l);
    if(lblEdit===l)return`<div class="lw editing"><span class="lic">${ic(on?'cboxo':'cb0')}</span><input class="le" value="${h(lblEditVal)}" maxlength="60" aria-label="Rename label"></div>`;
    return`<div class="lw"><button data-lf="${h(l)}"${on&&view==='notes'?' class="on"':''} role="checkbox" aria-checked="${on}">${chk(on,h(l))}</button><button class="la" data-ledit="${h(l)}" title="Rename label" aria-label="Rename label ${h(l)}">${ic('edit',18)}</button><button class="la" data-ldel="${h(l)}" title="Delete label" aria-label="Delete label ${h(l)}">${ic('trash',18)}</button></div>`;
  };
  const hadFocus=document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains('le');
  navBusy=true;$('#lbls').innerHTML=all+LB.map(row).join('');navBusy=false;
  if(hadFocus&&lblEdit!==null){const i=document.querySelector('#lbls .le');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}
}
function startLabelEdit(l){
  lblEdit=l;lblEditVal=l;renderNav();
  const i=document.querySelector('#lbls .le');if(i){i.focus();i.select()}
}
function endLabelEdit(commit){
  if(lblEdit===null)return;
  const old=lblEdit,nv=lblEditVal.trim();
  lblEdit=null;
  if(commit&&nv&&nv!==old)renameLabel(old,nv);else renderNav();
}
/* In-memory notes change first (and are saved); the stored copies are then brought in line in the background. */
function renameLabel(old,nv){
  if(LB.some(l=>l!==old&&l.toLowerCase()===nv.toLowerCase())){toast(`A label named “${nv}” already exists.`);renderNav();return}
  for(const n of notes)if((n.labels||[]).includes(old)){n.labels=[...new Set(n.labels.map(l=>l===old?nv:l))];KEEP_MOD.add(n.id)}
  const k=LB.indexOf(old);if(k>=0)LB[k]=nv;
  LB=[...new Set(LB)].sort((a,b)=>a.localeCompare(b));
  if(sel.delete(old))sel.add(nv);
  commit();
  Store.relabel(old,nv);
}
function deleteLabel(l){
  let count=0;
  for(const n of notes)if((n.labels||[]).includes(l)){n.labels=n.labels.filter(x=>x!==l);KEEP_MOD.add(n.id);count++}
  LB=LB.filter(x=>x!==l);sel.delete(l);
  commit();
  toast(`Label “${l}” deleted${count?` from ${count} note${count===1?'':'s'}`:''}.`);
  Store.relabel(l,null);
}
/* A click inside the sidebar that concerns labels. Returns true when it was handled; the caller handles the other buttons (Notes, Trash). */
function labelNavClick(e){
  const ed=e.target.closest('button[data-ledit]');if(ed){startLabelEdit(ed.dataset.ledit);return true}
  const dl=e.target.closest('button[data-ldel]');if(dl){deleteLabel(dl.dataset.ldel);return true}
  if(e.target.closest('.le'))return true;
  const r=e.target.closest('button[data-lf],button[data-all]');
  if(r){
    if(r.dataset.all)sel.clear();
    else{const l=r.dataset.lf;if(sel.has(l))sel.delete(l);else sel.add(l)}
    view='notes';render();return true;
  }
  return false;
}
$('#nav').addEventListener('input',e=>{if(e.target.classList.contains('le'))lblEditVal=e.target.value});
$('#nav').addEventListener('keydown',e=>{
  if(!e.target.classList.contains('le'))return;
  if(e.key==='Enter'){e.preventDefault();endLabelEdit(true)}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();endLabelEdit(false)}
});
$('#nav').addEventListener('focusout',e=>{if(e.target.classList.contains('le')&&!navBusy)endLabelEdit(true)});
