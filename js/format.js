/* format.js: the notes folder's file format, as pure functions (no folder access, no page).
   Layout: styles.css, index.html, <id/100>/<id>.html, media/{images,video,audio}/<id/100>/<id>-<n>.<ext> */
'use strict';
const bucket=id=>Math.floor(Number(id)/100);
const ATT_ICON={
  image:'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  video:'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  audio:'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'};
const CAN_IMG=/^(jpe?g|png|gif|webp|avif|svg|bmp|ico)$/i,CAN_VID=/^(mp4|m4v|webm|ogv|mov)$/i;
/* One attachment in the strip: a preview where the browser can show one, otherwise a generic icon for its type; the link text is the file name. */
function attTile(a){
  const ext=(/\.([a-z0-9]+)$/i.exec(a.id)||[])[1]||'',src='../'+h(a.id);
  let pv;
  if(a.kind==='image'&&CAN_IMG.test(ext))pv=`<img src="${src}" alt="${h(a.name)}">`;
  else if(a.kind==='video'&&CAN_VID.test(ext))pv=`<video src="${src}#t=0.1" preload="metadata" muted playsinline aria-label="${h(a.name)}"></video>`;
  else pv=`<svg viewBox="0 0 24 24" role="img" aria-label="${h(a.name)}"><title>${h(a.name)}</title><path d="${ATT_ICON[a.kind]||ATT_ICON.image}"/></svg>`;
  return `<a class="att ${h(a.kind)}" href="${src}" title="${h(a.name)}"><span class="pv">${pv}</span><span class="fn">${h(a.name)}</span></a>`;
}
const ATT_CSS=`.attstrip{display:flex;gap:12px;max-width:680px;margin:0 auto 14px;padding-bottom:4px;overflow-x:auto}
.attstrip .att{flex:none;width:132px;color:inherit;text-decoration:none;font-size:.8em}
.attstrip .pv{display:grid;place-items:center;width:132px;height:96px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:rgba(127,127,127,.12);color:var(--mut)}
.attstrip .pv img,.attstrip .pv video{display:block;width:100%;height:100%;object-fit:cover}
.attstrip .pv svg{width:40px;height:40px;fill:currentColor}
.attstrip .fn{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
const LINK_CSS='.content a,.content a:visited,.content a:hover,.content a:active{color:#0b57d0;background:#fff;text-decoration:underline}\n';   /* notes whose imported "modified" date must survive the next save */
const offStr=ms=>{const o=-new Date(ms).getTimezoneOffset(),a=Math.abs(o);return(o>=0?'+':'-')+pad2(Math.floor(a/60))+':'+pad2(a%60)};
const isoOffset=ms=>{
  const d=new Date(ms);if(isNaN(d))return'';
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'T'+pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds())+'.'+String(d.getMilliseconds()).padStart(3,'0')+offStr(ms);
};
/* ---------- page templates ---------- */
const LIGHT=['#fff', '#f6e2dd', '#fde0b4', '#fff8b8', '#e2f6d3', '#b4ddd3', '#d4e4ed', '#aeccdc', '#e3d4f5', '#d3bfdb', '#e9e3d4', '#e9e9ed'];
function stylesCSS(){
  const vars=a=>a.map((c,i)=>`--k${i}:${c}`).join(';');
  const cls=LIGHT.map((_,i)=>`.c${i}{background:var(--k${i})}`).join('');
  return`/* Lil Bro Keep: one stylesheet shared by every note page and the index. Safe to edit. */
:root{--bg:#f6f7f9;--fg:#202124;--mut:#5f6368;--line:#dadce0;${vars(LIGHT)};color-scheme:light}
${cls}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:16px/1.5 Roboto,"Helvetica Neue",Arial,sans-serif}
.nc{max-width:680px;margin:0 auto;padding:20px 24px;border:1px solid var(--line);border-radius:12px}
.status{margin:0 0 8px;font-size:.75em;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.title{margin:0 0 12px;font-size:1.4em;font-weight:500;overflow-wrap:anywhere}
.content{white-space:pre-wrap;overflow-wrap:anywhere}
p.content{margin:0}
${LINK_CSS}${ATT_CSS}ul.list{margin:0;padding:0;list-style:none}
.listitem{display:flex;gap:8px;overflow-wrap:anywhere}
.listitem.done .text{text-decoration:line-through;opacity:.6}
.bullet{flex:none}
.attachments{display:grid;gap:8px;margin:0 0 16px}
.attachments img,.attachments video{max-width:100%;border-radius:8px}
.attachments audio{width:100%}
.links{display:flex;flex-direction:column;gap:6px;margin:16px 0 0}
.links a{color:inherit;word-break:break-all}
.labels{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 0}
.label-name{padding:0 10px;border:1px solid var(--line);border-radius:12px;font-size:.8em;color:var(--mut)}
.dates{margin:16px 0 0;font-size:.8em;color:var(--mut)}
.idx{max-width:760px;margin:0 auto}
.idx h1{font-weight:400}
.idx h2{margin:28px 0 8px;font-size:.8em;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.idx small{font-weight:400}
.idxlist{margin:0;padding:0;list-style:none}
.idxlist li{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)}
.idxlist a{display:flex;align-items:center;gap:10px;min-width:0;color:inherit;text-decoration:none}
.idxlist a:hover .t{text-decoration:underline}
.idxlist .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idxlist .m{flex:none;font-size:.8em;color:var(--mut)}
.sw{flex:none;width:14px;height:14px;border:1px solid var(--line);border-radius:3px}
.sub{color:var(--mut)}
${ENC_CSS}`;
}
const noteTitle=n=>{
  if(n.enc)return'Encrypted note';                        // an encrypted note never shows its title outside the app
  if(n.stub)return n.idxTitle||('Note '+n.id);            // known by its details only: the title the index kept
  const t=n.title.trim()||(n.isList?((n.items.find(i=>i.t.trim())||{}).t||''):n.body.trim().split('\n')[0])||('Note '+n.id);
  return t.length>90?t.slice(0,90)+'…':t;
};
const fdate=ms=>new Date(ms).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' '+offStr(ms);
const numbered=l=>l.map((a,i)=>({n:i+1,path:a.id,kind:a.kind,name:a.name,...(a.w>0&&a.h>0?{w:a.w,h:a.h}:{})}));
function noteHTML(n){
  const meta={v:1,id:n.id,created:isoOffset(n.ts),modified:isoOffset(n.mod||n.ts),pos:n.pos,
    color:n.color,pinned:n.pinned,trashed:n.trashed,list:n.isList,labels:n.labels,links:n.links,
    attachments:{visual:numbered(n.att.filter(a=>a.kind!=='audio')),audio:numbered(n.att.filter(a=>a.kind==='audio'))},sig:n.sig};
  const cm=JSON.stringify(meta,null,2).replace(/--/g,'-\\u002d');
  const strip=n.att.length?`<nav class="attstrip" aria-label="Attachments">\n${n.att.map(attTile).join('\n')}\n</nav>\n`:'';
  const body=n.isList
    ?`<p class="content" version="1">${n.items.map(i=>`<span class="listitem${i.d?' done':''}"><span class="bullet">${i.d?'☑':'☐'}</span><span class="text">${h(i.t)}</span></span>`).join('')}</p>`
    :`<p class="content" version="1">${n.html||h(n.body)}</p>`;
  const flags=[n.pinned&&!n.trashed?'Pinned':'',n.trashed?'In trash':''].filter(Boolean).join(' · ');
  return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(noteTitle(n))}</title>
<link rel="stylesheet" href="../styles.css">
<!-- keep:meta
${cm}
-->
</head>
<body>
${strip}<article class="nc c${n.color}">
${flags?`<div class="status">${flags}</div>\n`:''}${n.title?`<div class="title">${h(n.title)}</div>\n`:''}${body}
${n.links.length?`<div class="links">${n.links.map(l=>`<a href="${h(l.url)}">${h(l.url)}</a>`).join('')}</div>\n`:''}${n.labels.length?`<div class="labels">${n.labels.map(l=>`<span class="label-name">${h(l)}</span>`).join('')}</div>\n`:''}<div class="dates">Created <time datetime="${isoOffset(n.ts)}">${h(fdate(n.ts))}</time> · Edited <time datetime="${isoOffset(n.mod||n.ts)}">${h(fdate(n.mod||n.ts))}</time></div>
</article>
</body>
</html>
`;
}
/* ---------- encrypted notes ----------
   An encrypted note's page keeps in plain sight only what the app needs to sort and sync it: dates, colour, pinned and trashed state, the names of its
   attachment files, and the encryption settings. The title, text, checklist, labels, links and the original attachment names are one encrypted token
   (see encrypt.js), shown in the page as text that only the app can read. */
const ENC_CSS='pre.ct{margin:12px 0 0;font:.7em/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--mut)}\n';
const PRIVATE_LABELS=new Set();   // labels used by encrypted notes: kept out of the index unless an unencrypted note uses them too
function sealedHTML(n,token){
  const iv=(token.split('.')[1]||''),files=n.stub?(n.files||[]):(n.att||[]).map(a=>a.id);
  const lp=n.stub?n.lp:n.logPos;                          // how much of the deferred-action log this note has been brought up to (also inside the ciphertext)
  const meta={v:1,id:n.id,created:isoOffset(n.ts),modified:isoOffset(n.mod||n.ts),pos:n.pos,color:n.color,pinned:n.pinned,trashed:n.trashed,
    enc:{v:1,iv},files,...(lp!==undefined?{lp}:{})};
  const cm=JSON.stringify(meta,null,2).replace(/--/g,'-\\u002d');
  const flags=[n.pinned&&!n.trashed?'Pinned':'',n.trashed?'In trash':''].filter(Boolean).join(' · ');
  return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Encrypted note</title>
<link rel="stylesheet" href="../styles.css">
<!-- keep:meta
${cm}
-->
</head>
<body>
<article class="nc c${n.color}">
${flags?`<div class="status">${flags}</div>\n`:''}<p class="content">This note is encrypted. Open it in Lil Bro Keep.</p>
<pre class="ct">${token}</pre>
<div class="dates">Created <time datetime="${isoOffset(n.ts)}">${h(fdate(n.ts))}</time></div>
</article>
</body>
</html>
`;
}
/* The saved copy keeps every note that has been read in full; a note known by its details only stays that way. */
const exportNote=n=>n.enc?({id:n.id,isList:false,title:'',body:'',html:'',items:[],labels:[],att:[],links:[],color:n.color,pinned:n.pinned,trashed:n.trashed,
  ts:n.ts,mod:n.mod,pos:n.pos,fs:n.fs,enc:true,stub:true,idxTitle:'Encrypted note',lp:n.stub?n.lp:n.logPos}):({plain:n.plain||undefined,id:n.id,title:n.title,body:n.body,html:n.html,isList:n.isList,items:n.items,labels:n.labels,att:n.att,links:n.links,
  color:n.color,pinned:n.pinned,trashed:n.trashed,ts:n.ts,mod:n.mod,pos:n.pos,sig:n.sig,fs:n.fs,stub:n.stub||undefined,idxTitle:n.stub?n.idxTitle:undefined});
/* One line of the index: a link title and the details the app needs to draw a card and order, filter and sync notes. No note text. */
const indexEntry=n=>n.enc?{id:n.id,t:'Encrypted note',enc:true,color:n.color,pinned:n.pinned,trashed:n.trashed,ts:n.ts,mod:n.mod,pos:n.pos,fs:n.fs,lp:n.stub?n.lp:n.logPos}:({id:n.id,t:noteTitle(n),isList:n.isList,labels:n.labels,att:n.att,links:n.links,color:n.color,pinned:n.pinned,trashed:n.trashed,ts:n.ts,mod:n.mod,pos:n.pos,sig:n.sig,fs:n.fs});
const normNote=o=>{
  const n=Object.assign(blank(),o);
  n.id=String(o.id);n.title=n.title||'';n.body=n.body||'';n.html=n.html?cleanRich(n.html):'';delete n.archived;
  n.items=n.items||[];n.labels=n.labels||[];n.att=partAtt(n.att);n.links=n.links||[];
  return n;
};
/* An index line becomes a note known by its details only (a stub): its page is read when it is needed (folder.js loadNote).
   An index written by an earlier version holds whole notes; those are used as they are. */
function fromIndexEntry(e){
  if(e.title!==undefined||e.body!==undefined){const o=normNote(e);o.plain=!e.enc;return o}
  const n=normNote({...e,stub:true,idxTitle:e.enc?'Encrypted note':e.t,title:'',body:'',html:'',items:[]});
  delete n.t;n.plain=!e.enc;return n;
}
function indexHTML(extra){
  const all=[...notes,...(extra||[])];
  const live=n=>!n.trashed;
  const sec=(title,f)=>{
    const l=all.filter(f).sort(byOrder);
    if(!l.length)return'';
    return`<h2>${title} <small>(${l.length})</small></h2>\n<ul class="idxlist">\n${l.map(n=>`<li><a href="${bucket(n.id)}/${n.id}.html"><span class="sw c${n.color}"></span><span class="t">${h(noteTitle(n))}</span></a><span class="m">${!n.enc&&n.labels.length?h(n.labels.join(', '))+' · ':''}${h(fdate(n.ts))}</span></li>`).join('\n')}\n</ul>\n`;
  };
  const data=JSON.stringify({v:2,labels:LB.filter(l=>!PRIVATE_LABELS.has(l)||all.some(n=>!n.enc&&(n.labels||[]).includes(l))),notes:all.map(indexEntry)}).replace(/</g,'\\u003c');
  return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lil Bro Keep</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main class="idx">
<h1>Lil Bro Keep</h1>
<p class="sub">${all.length} note${all.length===1?'':'s'}. This page is rebuilt automatically; every note also works on its own.</p>
${sec('Pinned',n=>live(n)&&n.pinned)}${sec('Notes',n=>live(n)&&!n.pinned)}${sec('Trash',n=>n.trashed)}</main>
<script type="application/json" id="keep-index">${data}</script>
</body>
</html>
`;
}

/* ---------- reading notes back ---------- */
function parseNoteFile(text,fname){
  const m=text.match(/<!--\s*keep:meta\s*([\s\S]*?)\s*-->/);if(!m)return null;
  let meta;try{meta=JSON.parse(m[1])}catch(e){return null}
  if(meta.placeholder)return null;
  const d=new DOMParser().parseFromString(text,'text/html');
  const n=blank();
  n.id=String(meta.id!=null?meta.id:fname.replace(/\.html?$/i,''));
  if(meta.enc){                                   // an encrypted page: only the details in its head are readable (see sealedHTML); the text is a token to decrypt
    n.enc=true;n.stub=true;n.idxTitle='Encrypted note';
    n.color=meta.color||0;n.pinned=!!meta.pinned;n.trashed=!!meta.trashed;
    n.ts=Date.parse(meta.created)||Date.now();n.mod=Date.parse(meta.modified)||n.ts;
    if(typeof meta.pos==='number'&&isFinite(meta.pos))n.pos=meta.pos;
    n.files=Array.isArray(meta.files)?meta.files:[];
    if(typeof meta.lp==='number')n.lp=meta.lp;
    n.ct=((d.querySelector('pre.ct')||{}).textContent||'').trim()||undefined;
    return n;
  }
  n.title=(d.querySelector('.title')||{}).textContent||'';
  n.isList=!!meta.list;
  if(n.isList)n.items=[...d.querySelectorAll('.listitem')].map(r=>({t:(r.querySelector('.text')||{}).textContent||'',d:r.classList.contains('done')}));
  else{const c=d.querySelector('.content');if(c){const x=richFrom(c);n.body=x.body;n.html=x.html}}
  n.color=meta.color||0;n.pinned=!!meta.pinned;n.trashed=!!meta.trashed;
  n.labels=meta.labels||[];n.links=meta.links||[];
  const rd=l=>(l||[]).map((a,i)=>({...a,_i:i})).sort((x,y)=>((x.n||x._i+1)-(y.n||y._i+1)));
  const A=meta.attachments,list=A?[...rd(A.visual||A.media),...rd(A.audio)]:rd(meta.att);     // pages from earlier versions kept a single numbered list
  n.att=partAtt(list.map(a=>({id:a.path,kind:a.kind,name:a.name,...(a.w>0&&a.h>0?{w:a.w,h:a.h}:{})})));
  n.ts=Date.parse(meta.created)||Date.now();n.mod=Date.parse(meta.modified)||n.ts;
  if(typeof meta.pos==='number'&&isFinite(meta.pos))n.pos=meta.pos;
  if(meta.sig)n.sig=meta.sig;
  n.plain=true;                                  // this note is stored unencrypted: it can never be encrypted
  return n;
}
