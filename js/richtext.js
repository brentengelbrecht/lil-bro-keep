/* richtext.js: turns pasted or stored HTML into the small, safe subset the notes use (bold, italic, underline, links, line breaks). */
'use strict';
function safeHref(s){try{const u=new URL(String(s||'').trim());return /^https?:$/.test(u.protocol)?u.href:''}catch(e){return''}}
function richFrom(root){
  const runs=[],BLOCK=/^(div|p|li|ul|ol|h[1-6]|blockquote|pre)$/;
  let started=false,needNL=false,fresh=false;
  const add=(t,k,hf)=>{if(!t)return;const l=runs[runs.length-1];if(l&&l.k===k&&l.hf===hf&&l.t!=='\n')l.t+=t;else runs.push({t,k,hf})};
  const nl=()=>runs.push({t:'\n',k:0,hf:''});
  const walk=(node,k,blk,hf)=>{
    const kids=[...node.childNodes];
    kids.forEach((c,ix)=>{
      const last=ix===kids.length-1;
      if(c.nodeType===3){
        const parts=c.nodeValue.replace(/\u00a0/g,' ').replace(/[\u200b\r]/g,'').split('\n');
        parts.forEach((p,j)=>{if(j>0){nl();needNL=false}if(p){if(needNL){nl();needNL=false}started=true;fresh=false;add(p,k,hf)}});
        if(parts.length>1)started=true;
      }else if(c.nodeType===1){
        const tag=c.tagName.toLowerCase();
        if(tag==='br'){if(blk&&last)return;if(needNL){nl();needNL=false}started=true;fresh=false;nl()}
        else if(BLOCK.test(tag)){if(started&&!fresh)nl();started=true;needNL=false;fresh=true;walk(c,k,true,hf);fresh=false;needNL=true}
        else if(tag==='a')walk(c,k,blk&&last,safeHref(c.getAttribute('href'))||hf);
        else{
          let m=k;const sy=c.style||{};
          if(tag==='b'||tag==='strong'||/^(bold|[6-9]00)$/.test(sy.fontWeight||''))m|=1;
          if(tag==='i'||tag==='em'||sy.fontStyle==='italic')m|=2;
          if(tag==='u'||/underline/.test(sy.textDecorationLine||sy.textDecoration||''))m|=4;
          walk(c,m,blk&&last,hf);
        }
      }
    });
  };
  walk(root,0,true,'');
  const wrap=(s,k,hf)=>{s=h(s);if(k&4)s='<u>'+s+'</u>';if(k&2)s='<em>'+s+'</em>';if(k&1)s='<strong>'+s+'</strong>';if(hf)s='<a href="'+h(hf)+'" target="_blank" rel="noopener noreferrer">'+s+'</a>';return s};
  return{body:runs.map(r=>r.t).join(''),html:runs.some(r=>r.k||r.hf)?runs.map(r=>r.t==='\n'?'<br>':wrap(r.t,r.k,r.hf)).join(''):''};
}
function richOf(s){const t=document.createElement('template');t.innerHTML=s;return richFrom(t.content)}
function cleanRich(s){return richOf(s).html}
