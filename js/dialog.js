/* dialog.js: every dialog in the app is opened through openDialog(), so they all behave the same way:
     - announced as a dialog (role, aria-modal, aria-label)
     - the page behind it is inert: it cannot be tabbed into, clicked, or read by a screen reader
     - focus moves into the dialog, Tab stays inside it, and Escape closes the topmost dialog only
     - when it closes, focus goes back to where it was
   A dialog opened over another one (the "replace file?" question over the editor, the image viewer over the editor) stacks on top of it.

   openDialog(o) returns {ov, panel, close(value), redraw(html)}. Options:
     label            accessible name (required)
     html             the content of the panel (standard dialog). Or:
     overlay, roleEl  a ready-made overlay element, and the element inside it that is the dialog (the editor, the image viewer)
     role             'dialog' (default) or 'alertdialog'
     panelClass       extra class for the panel, e.g. 'cam'
     className, z     extra class and z-index for the overlay
     outside          closing by pressing outside the panel (default true)
     escape           Escape closes it (default true); onEscape(e) may handle it first and return true
     onRequestClose() what happens when the person asks to close (Escape, outside press). Default: close()
     onClose(value)   after it has closed
     exit(ov, done)   animate out, then call done() to remove the overlay (default: removed at once)
     focus            selector of the element to focus first; false to leave focus alone; default the first button or field
     restoreFocus     put focus back where it was on closing (default true) */
'use strict';

const dlgStack=[];
const dlgInert=new Map();              // element -> how many dialogs made it inert
function dlgSetInert(el,on){
  if(!el)return;
  const n=(dlgInert.get(el)||0)+(on?1:-1);
  if(n>0){dlgInert.set(el,n);el.inert=true}else{dlgInert.delete(el);el.inert=false}
}
const DLG_FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[contenteditable=true],[tabindex]:not([tabindex="-1"])';
const dlgFocusables=root=>[...root.querySelectorAll(DLG_FOCUSABLE)].filter(e=>!e.hidden&&e.getClientRects().length&&!e.closest('[hidden],[inert]'));

function openDialog(o){
  const opener=document.activeElement;
  const ov=o.overlay||document.createElement('div');
  if(!o.overlay)ov.className='ov'+(o.className?' '+o.className:'');
  if(o.z)ov.style.zIndex=o.z;
  let panel=null,roleEl;
  if(o.html!==undefined){
    panel=document.createElement('div');panel.className='dlg'+(o.panelClass?' '+o.panelClass:'');
    panel.innerHTML=o.html;ov.append(panel);roleEl=panel;
  }else roleEl=o.roleEl||ov;
  roleEl.setAttribute('role',o.role||'dialog');roleEl.setAttribute('aria-modal','true');roleEl.setAttribute('aria-label',o.label);
  const below=dlgStack[dlgStack.length-1];
  const inertEls=below?[below.ov]:[document.querySelector('header'),document.querySelector('.wrap')];
  const d={ov,panel,o,closed:false,
    close(value){
      if(d.closed)return;d.closed=true;
      const i=dlgStack.indexOf(d);if(i>=0)dlgStack.splice(i,1);
      inertEls.forEach(e=>dlgSetInert(e,false));
      const done=()=>ov.remove();
      if(o.exit)o.exit(ov,done);else done();
      if(o.restoreFocus!==false&&opener&&opener.isConnected&&opener.focus&&!opener.closest('[inert]'))try{opener.focus({preventScroll:true})}catch(e){}
      if(o.onClose)o.onClose(value);
    },
    redraw(html){                                   // replace the content, keeping focus on the same button if it is still there
      if(!panel)return;
      const a=document.activeElement,k=a&&panel.contains(a)?[...a.attributes].find(x=>x.name.startsWith('data-')):null;
      panel.innerHTML=html;
      const t=k&&panel.querySelector(`[${k.name}="${CSS.escape(k.value)}"]`);
      if(t&&!t.disabled)t.focus({preventScroll:true});
    }
  };
  d.request=why=>{if(o.onRequestClose)o.onRequestClose(why);else d.close(why)};
  inertEls.forEach(e=>dlgSetInert(e,true));
  dlgStack.push(d);
  if(o.outside!==false)ov.addEventListener('mousedown',e=>{if(e.target===ov)d.request('outside')});
  if(!ov.isConnected)document.body.append(ov);
  if(o.focus!==false){
    const t=(o.focus&&ov.querySelector(o.focus))||dlgFocusables(ov)[0]||roleEl;
    if(t===roleEl&&!roleEl.hasAttribute('tabindex'))roleEl.tabIndex=-1;
    t.focus({preventScroll:true});
  }
  return d;
}

/* One listener for all dialogs, acting on the topmost: Escape closes it, Tab stays inside it. */
document.addEventListener('keydown',e=>{
  const d=dlgStack[dlgStack.length-1];if(!d)return;
  if(e.key==='Escape'){
    e.stopImmediatePropagation();e.preventDefault();
    if(d.o.onEscape&&d.o.onEscape(e)===true)return;
    if(d.o.escape!==false)d.request('escape');
    return;
  }
  if(e.key==='Tab'){
    const f=dlgFocusables(d.ov);
    if(!f.length){e.preventDefault();return}
    const a=document.activeElement,inside=d.ov.contains(a);
    if(!inside){e.preventDefault();(e.shiftKey?f[f.length-1]:f[0]).focus()}
    else if(e.shiftKey&&a===f[0]){e.preventDefault();f[f.length-1].focus()}
    else if(!e.shiftKey&&a===f[f.length-1]){e.preventDefault();f[0].focus()}
  }
},true);
