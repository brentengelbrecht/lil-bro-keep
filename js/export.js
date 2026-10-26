/* export.js: export the notes shown in the main view as one web page, and the Export dialog.
   Loads before app.js; it asks app.js for visible() and view when the dialog opens. */
'use strict';
/* Export: the notes currently shown in the main view, as a single web page */
function exportList(){
  const l=visible();
  return view==='notes'?[...l.filter(n=>n.pinned),...l.filter(n=>!n.pinned)]:l;
}
function exportHTML(list,title){
  title=title||'Lil Bro Keep';
  const body=n=>n.isList?n.items.map(i=>(i.d?'☑ ':'☐ ')+h(i.t)).join('<br>'):(n.html||h(n.body).replace(/\n/g,'<br>'));
  const parts=list.map(n=>`<h2>${h(n.title.trim()||'Untitled')}</h2>\n<p>${body(n)}</p>`).join('\n\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<style>body{max-width:720px;margin:2rem auto;padding:0 1rem;font:16px/1.6 Georgia,"Times New Roman",serif;color:#202124}h1{font-size:1.6rem}h2{margin:2rem 0 .25rem;font-size:1.25rem}p{margin:0}a,a:visited,a:hover{color:#0b57d0;background:#fff;text-decoration:underline}</style>
</head>
<body>
<h1>${h(title)}</h1>
${parts}
</body>
</html>
`;
}
async function saveExport(list,out){
  await Store.loadAll(list);                              // notes not read yet are read first
  const d=new Date(),suggested=`lil-bro-keep-${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}.html`;
  const base=nm=>nm.replace(/\.[^.]+$/,'');
  if(window.showSaveFilePicker){
    let fh;
    try{fh=await showSaveFilePicker({suggestedName:suggested,types:[{description:'HTML page',accept:{'text/html':['.html','.htm']}}]})}
    catch(e){if(e&&e.name==='AbortError'){out.textContent='';return}throw e}
    const html=exportHTML(list,base(fh.name));          // the heading is the file name that was chosen
    const w=await fh.createWritable();await w.write(html);await w.close();
    out.textContent=`Saved ${list.length} note${list.length===1?'':'s'} to “${fh.name}”.`;
  }else{
    const html=exportHTML(list,base(suggested));
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=suggested;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    out.textContent=`Downloaded ${list.length} note${list.length===1?'':'s'} as “${suggested}”. This browser saves to its download folder.`;
  }
}
function exportDialog(){
  const list=exportList(),n=list.length;
  const d=openDialog({label:'Export notes',panelClass:'dlg2',html:`<span class="dic">${ic('download',22)}</span><h3>Export notes</h3>
    ${n?`<div class="stat"><b>${n}</b>note${n===1?'':'s'} in the current view</div>
    <p>Saved as a single web page. Each note becomes a heading with its text underneath, in the order shown. Labels, images, audio and video are not included.</p>`:'<p>There are no notes in the current view to export.</p>'}
    <button class="big" data-x="save"${n?'':' disabled'}>Choose location and save</button>
    <p class="res" aria-live="polite"></p>
    <div class="cl"><button class="done" data-x="close">Close</button></div>`});
  const out=d.panel.querySelector('.res');
  d.panel.addEventListener('click',async e=>{
    const b=e.target.closest('[data-x]');if(!b)return;
    if(b.dataset.x==='close'){d.close();return}
    try{await withBusy(()=>saveExport(list,out))}
    catch(err){out.textContent='Couldn’t save the file: '+((err&&err.message)||err)}
  });
}
