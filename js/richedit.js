/* richedit.js: the note body as an editable rich-text area (a contenteditable). Plain functions for caret handling and links. */
/* Turns bare http(s) addresses in the note text into <a> links; text already inside a link is left alone, and the caret keeps its place. */
'use strict';
function linkifyAll(r){
  const [a,b]=rangeOffsets(r),had=document.activeElement===r;
  const re=/https?:\/\/[^\s<>"']+/gi;
  const w=document.createTreeWalker(r,NodeFilter.SHOW_TEXT,{acceptNode:t=>t.parentElement&&t.parentElement.closest('a')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[];let t;while((t=w.nextNode()))nodes.push(t);
  let changed=false;
  for(const node of nodes){
    const text=node.nodeValue,hits=[];let m;re.lastIndex=0;
    while((m=re.exec(text))){const u=m[0].replace(/[.,;:!?)\]}]+$/,'');if(safeHref(u))hits.push([m.index,m.index+u.length,u])}
    for(let i=hits.length-1;i>=0;i--){
      const [x,y,u]=hits[i],g=document.createRange();
      g.setStart(node,x);g.setEnd(node,y);
      const an=document.createElement('a');an.setAttribute('href',safeHref(u));g.surroundContents(an);changed=true;
    }
  }
  if(changed&&had)setRangeOffsets(r,a,b);
  return changed;
}
const typedEnd=e=>e.inputType==='insertParagraph'||e.inputType==='insertLineBreak'||(e.inputType==='insertText'&&(e.data===' '||e.data==='\u00a0'));
const sameText=(a,b)=>a.replace(/\s+/g,' ').trim()===b.replace(/\s+/g,' ').trim();
const rtHTML=n=>{let s=n.html||h(n.body).replace(/\n/g,'<br>');if(/<br>$/.test(s))s+='<br>';return s};
function rangeOffsets(r){
  const s=getSelection();if(!s.rangeCount||!r.contains(s.anchorNode))return[0,0];
  const g=s.getRangeAt(0),pre=document.createRange();pre.selectNodeContents(r);pre.setEnd(g.startContainer,g.startOffset);
  const a=pre.toString().length;return[a,a+g.toString().length];
}
function setRangeOffsets(r,a,b){
  const w=document.createTreeWalker(r,NodeFilter.SHOW_TEXT);let pos=0,sn=null,so=0,en=null,eo=0,t;
  while((t=w.nextNode())){
    const L=t.nodeValue.length;
    if(!sn&&a<=pos+L){sn=t;so=a-pos}
    if(!en&&b<=pos+L){en=t;eo=b-pos;break}
    pos+=L;
  }
  if(!sn){caretEnd(r);return}
  const g=document.createRange();g.setStart(sn,so);g.setEnd(en||sn,en?eo:so);
  const s=getSelection();s.removeAllRanges();s.addRange(g);
}
function caretEnd(node){const r=document.createRange();r.selectNodeContents(node);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)}

/* Web addresses on their own lines (a dropped link or pasted list), or null if the text is anything else. */
function urlsIn(text){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
  if(!lines.length)return null;
  const out=[];
  for(let v of lines){
    if(/\s/.test(v))return null;
    if(!/^https?:\/\//i.test(v)){if(/^www\.[^\s.]+\.\S+$/i.test(v))v='https://'+v;else return null}
    try{const u=new URL(v);if(!/^https?:$/.test(u.protocol))return null;out.push(u.href)}catch(e){return null}
  }
  return out;
}

/* The editing behaviour of a note's text area (.rt) inside the editor element el: formatting, undo and redo, links,
   lists typed as text, paste. sync() copies the text area into the note; the editor passes it in.
   Returns what the editor itself needs; everything else is wired to el here. */
function richEdit(el,sync){
  const rt=()=>el.querySelector('.rt');
  /* Undo/redo covers one block operation: one where text was selected (format, clear, cut, delete, type or paste over it). */
  let undoS=null,redoS=null,seen=false;
  const takeSnap=()=>{const r=rt(),[a,b]=rangeOffsets(r);return{html:r.innerHTML,a,b}};
  const hasSelection=()=>{const r=rt(),s=getSelection();return !!(r&&s.rangeCount&&!s.isCollapsed&&r.contains(s.anchorNode)&&r.contains(s.focusNode))};
  const markBlock=()=>{if(hasSelection()){undoS=takeSnap();redoS=null}};
  const restore=sn=>{const r=rt();r.innerHTML=sn.html;r.focus();setRangeOffsets(r,sn.a,sn.b);sync()};
  const undo=()=>{if(!undoS||!rt())return;const cur=takeSnap(),sn=undoS;undoS=null;redoS=cur;restore(sn);update()};
  const redo=()=>{if(!redoS||!rt())return;const cur=takeSnap(),sn=redoS;redoS=null;undoS=cur;restore(sn);update()};
  /* Toolbar state: formatting buttons off while typing in the title, undo/redo enabled, bold/italic/underline lit */
  function update(){
    const s=getSelection(),r=rt(),inside=!!(r&&s&&s.rangeCount&&r.contains(s.anchorNode));
    const onTitle=document.activeElement===el.querySelector('.t');
    el.querySelectorAll('.fmt').forEach(b=>{b.disabled=onTitle});
    const ub=el.querySelector('[data-e="undo"]'),rb=el.querySelector('[data-e="redo"]');
    if(ub)ub.disabled=!undoS;if(rb)rb.disabled=!redoS;
    for(const[k,c]of[['fb','bold'],['fi','italic'],['fu','underline']]){
      const b=el.querySelector(`[data-e="${k}"]`);if(!b)continue;
      let on=false;try{on=inside&&document.queryCommandState(c)}catch(e){}
      b.classList.toggle('on',on);
    }
  }
  const onSel=()=>{if(!el.isConnected){if(seen)document.removeEventListener('selectionchange',onSel);return}seen=true;update()};
  document.addEventListener('selectionchange',onSel);
  el.addEventListener('focusin',()=>update());
  const format=cmd=>{const r=rt();if(!r)return;r.focus();markBlock();document.execCommand(cmd,false,null);sync();update()};
  const clearFormat=()=>{
    const r=rt();if(!r)return;
    const s=getSelection();
    if(!s.rangeCount||s.isCollapsed||!r.contains(s.anchorNode)||!r.contains(s.focusNode))return;   /* nothing selected: do nothing */
    if(document.activeElement!==r)r.focus();
    markBlock();
    document.execCommand('removeFormat');
    sync();update();
  };
  /* Lists typed as text: after a line that starts with "1.", "a." or "-", Enter starts the next line with the next marker,
     indented the same way. Enter on an empty item ends the list. */
  const continueList=e=>{
    const r=rt(),s=getSelection();
    if(!r||!s.rangeCount||!s.isCollapsed||!r.contains(s.anchorNode))return false;
    const g=s.getRangeAt(0),pre=document.createRange(),post=document.createRange();
    pre.selectNodeContents(r);pre.setEnd(g.startContainer,g.startOffset);
    post.selectNodeContents(r);post.setStart(g.startContainer,g.startOffset);
    const before=richFrom(pre.cloneContents()).body.split('\n').pop();
    const after=richFrom(post.cloneContents()).body.split('\n')[0];
    const m=/^(\s*)(?:(\d+)\.|([A-Za-z])\.|(-))(\s+)/.exec(before);
    if(!m||before.length<m[0].length)return false;           // no marker, or the caret is in front of it
    e.preventDefault();
    if(before.length===m[0].length&&!after.trim()){          // an empty item: take the marker away and stop
      s.modify('extend','backward','lineboundary');document.execCommand('delete');return true;
    }
    let next;
    if(m[2]!==undefined)next=(+m[2]+1)+'.';
    else if(m[3]!==undefined){
      if(/^[zZ]$/.test(m[3])){document.execCommand('insertParagraph');return true}
      next=String.fromCharCode(m[3].charCodeAt(0)+1)+'.';
    }else next='-';
    document.execCommand('insertParagraph');
    document.execCommand('insertText',false,m[1]+next+m[5]);
    return true;
  };
  /* A web address dropped on the note is added to the end of the note text as a link. False if there is no text area (a checklist). */
  function appendLinks(urls){
    const r=rt();if(!r)return false;
    for(const u of urls){
      const an=document.createElement('a');an.setAttribute('href',safeHref(u)||u);an.textContent=u;
      const lastEl=r.lastElementChild;
      if(lastEl&&/^(DIV|P)$/.test(lastEl.tagName)&&r.lastChild===lastEl){
        if(!lastEl.textContent.trim()){lastEl.innerHTML='';lastEl.append(an)}
        else{const d=document.createElement('div');d.append(an);r.append(d)}
      }else{
        while(r.lastChild&&r.lastChild.nodeName==='BR')r.removeChild(r.lastChild);
        if(r.textContent.trim().length||r.querySelector('a'))r.append(document.createElement('br'));
        r.append(an);
      }
    }
    caretEnd(r);sync();
    return true;
  }
  /* What happens inside the text area, wired here */
  el.addEventListener('mousedown',e=>{if(e.target.closest('.fmt,[data-e="undo"],[data-e="redo"]'))e.preventDefault()});   // keep the selection when a toolbar button is pressed
  el.addEventListener('beforeinput',e=>{
    if(!e.target.classList||!e.target.classList.contains('rt')||e.inputType==='historyUndo'||e.inputType==='historyRedo')return;
    if(!/^format/.test(e.inputType)||!undoS)markBlock();      // our own format buttons already took their snapshot
    update();
  });
  el.addEventListener('click',e=>{
    const an=e.target.closest&&e.target.closest('.rt a');
    if(an){e.preventDefault();const u=safeHref(an.getAttribute('href'));if(u)window.open(u,'_blank','noopener,noreferrer')}
  });
  el.addEventListener('keydown',e=>{
    if(e.target.classList.contains('rt')&&e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.isComposing)continueList(e);
  });
  el.addEventListener('paste',e=>{                            // pasted text goes in as plain text; pasted files are the editor's business
    if(e.target.classList.contains('lq'))return;
    const cd=e.clipboardData;if(!cd)return;
    if(!cd.getData('text/plain')&&cd.files&&cd.files.length)return;
    if(e.target.closest&&e.target.closest('.rt')){e.preventDefault();document.execCommand('insertText',false,cd.getData('text/plain'));const r=rt();if(r)linkifyAll(r);sync()}
  });
  return{
    rt,undo,redo,format,clearFormat,appendLinks,update,
    /* call around the editor's own sync() when the text area changed */
    beforeSync(e){if(typedEnd(e))linkifyAll(e.target)},                  // an address becomes a link once its last character is typed
    afterSync(e){if(!richFrom(e.target).body)e.target.innerHTML='';update()},   // an emptied note shows its placeholder again
    linkify(){const r=rt();if(r&&linkifyAll(r)){sync();return true}return false}
  };
}

