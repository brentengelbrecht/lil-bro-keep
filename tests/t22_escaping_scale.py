"""Hostile values in stored notes must not turn into page markup; and how long the per-note scans take at scale."""
from playwright.sync_api import sync_playwright
import sys
from harness import ok,finish
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:(errs.append('DIALOG '+d.message),d.dismiss()))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    r=pg.evaluate("""async()=>{
      window.__pwned=0;const evil='"><img src=x onerror="window.__pwned=1">';
      const mk=(w,h)=>new Promise(r=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').fillRect(0,0,w,h);c.toBlob(r,'image/png')});
      await putBlob(evil,await mk(30,20));await putBlob(evil+'v',await mk(30,20));
      const n=blank();n.id=evil+'N';n.title=evil;n.body=evil;n.labels=[evil];LB=[evil];
      n.att=[{id:evil,kind:'image',name:evil,w:30,h:20},{id:evil+'v',kind:'video',name:evil},{id:evil+'a',kind:'audio',name:evil}];
      n.links=[{url:'javascript:window.__pwned=1'}];
      notes=[n];render();await new Promise(r=>setTimeout(r,500));
      const card=document.querySelector('.vg>.card');
      const cardOk=card&&card.dataset.id===n.id;
      openModal(n);await new Promise(r=>setTimeout(r,500));
      const ed=document.querySelector('.ov .editor');
      const out={cardOk,pwned:window.__pwned,strayImg:document.querySelectorAll('img[src="x"]').length,editorOpen:!!ed,
        editorId:[...document.querySelectorAll('.ov .editor [data-id]')].every(e=>[evil,evil+'v',evil+'a'].includes(e.dataset.id)),
        att:attTile({id:evil,kind:'image'+evil,name:evil})};
      out.attSafe=!/<img src=x/.test(out.att)&&!/<i>/.test(out.att)&&out.att.includes('&quot;');
      return out}""")
    print(r)
    ok(r['cardOk'] and r['editorOpen'],"a note with hostile id, title, labels and attachment ids still renders as data")
    ok(r['pwned']==0 and r['strayImg']==0,"nothing injected: no stray element, no script ran")
    ok(r['editorId'],"attachment ids in the editor are the exact original strings")
    ok(r['attSafe'],"the folder page's attachment tile escapes id, name and kind")
    # ---- scale: how long do the per-note scans take?
    t=pg.evaluate("""()=>{
      const out=[];for(let i=0;i<2000;i++){const x=blank();x.id='n'+i;x.title='Note '+i;x.body='lorem ipsum '.repeat(20);x.html='';x.labels=['a','b'];
        if(i%3===0)x.att=Array.from({length:4},(_,k)=>({id:'media/images/0/'+i+'-'+k+'.png',kind:'image',name:'p'+k,w:400,h:300}));out.push(x)}
      notes=out;const T=f=>{const t=performance.now();f();return +(performance.now()-t).toFixed(2)};
      const sig=T(()=>notes.forEach(n=>sigOf(n)));
      const csig=T(()=>notes.forEach(n=>cardSig(n)));
      const find=T(()=>{for(let i=0;i<2000;i++)notes.find(n=>n.id==='n'+(1999-i%50))});
      const vis=T(()=>visible());
      return {notes:2000,sigOf_all_ms:sig,cardSig_all_ms:csig,find_2000_lookups_ms:find,visible_ms:vis}}""")
    print(t)
    ok(t['sigOf_all_ms']<60 and t['cardSig_all_ms']<60 and t['visible_ms']<60,f"per-note scans at 2000 notes are cheap {t}")
    print('errors',errs); b.close()
finish()
