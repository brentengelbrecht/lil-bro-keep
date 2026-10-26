"""Characterisation test for folder mode, run against an OPFS directory standing in for the notes folder.
Uses only: the DOM, the files in the folder, and a handful of app entry points (mapped in API below)."""
from playwright.sync_api import sync_playwright
import sys,re
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m); 
    if not c: ok.bad+=1
ok.bad=0
BASE='http://localhost:8765/index.html'
# entry points the test needs; the refactor may rename these, only this map changes
API="""
window.__A={
  load:()=>loadFolder(), flush:()=>flush(), reconcile:()=>runReconcile(), relabel:(a,b)=>relabelStored(a,b),
  addMedia:(n,b,k,name)=>addMedia(n,b,k,name), mode:()=>MODE, fstate:()=>fstate
};"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script("FileSystemHandle.prototype.queryPermission=async()=>'granted';FileSystemHandle.prototype.requestPermission=async()=>'granted'")   # the headless browser crashes on the real call for OPFS handles
    pg.goto(BASE); pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{const root=await navigator.storage.getDirectory();for await(const [n] of root.entries())await root.removeEntry(n,{recursive:true})}""")
    def boot():
        # Attach the folder the way choosing one does (fresh handle, then load it). The 'restore remembered handle at startup' path
        # is not covered: this headless browser crashes when an OPFS handle is read back from IndexedDB.
        pg.evaluate("localStorage.removeItem('keep-mode')"); pg.reload(); pg.wait_for_timeout(700); pg.evaluate(API)
        pg.evaluate("async()=>{ROOT=await navigator.storage.getDirectory();await __A.load()}"); pg.wait_for_timeout(1500)
    boot()
    ok(pg.evaluate("__A.mode()")=='folder' and pg.evaluate("__A.fstate()")=='ok',"boots into folder mode on an empty folder")
    ls=lambda d='': pg.evaluate("""async d=>{let r=await navigator.storage.getDirectory();for(const p of d.split('/').filter(Boolean))r=await r.getDirectoryHandle(p);const o=[];for await(const [n,e] of r.entries())o.push(n+(e.kind==='directory'?'/':''));return o.sort()}""",d)
    rd=lambda path: pg.evaluate("""async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);return await(await(await r.getFileHandle(fn)).getFile()).text()}""",path)
    wr=lambda path,text: pg.evaluate("""async([path,text])=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p,{create:true});const w=await(await r.getFileHandle(fn,{create:true})).createWritable();await w.write(text);await w.close()}""",[path,text])
    rm=lambda path: pg.evaluate("""async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);await r.removeEntry(fn)}""",path)
    root=ls(); ok('styles.css' in root and 'index.html' in root,f"scaffold written: {root}")
    # ---- create notes
    pg.evaluate("""async()=>{
      for(let i=0;i<6;i++){const x=blank();x.title='Note '+i;x.body='body '+i;x.ts=Date.now()-i*60000;x.color=i;if(i===1)x.pinned=true;if(i===2){x.isList=true;x.items=[{t:'a',d:false},{t:'b',d:true}]}if(i===3){x.labels=['work'];LB=['work']}notes.push(x)}
      save();await __A.flush()}""")
    d0=ls('0'); ok(d0==['1.html','2.html','3.html','4.html','5.html','6.html'],f"six note files in bucket 0: {d0}")
    idx=rd('index.html'); ok('keep-index' in idx and idx.count('"t":"Note')>=6 and 'body 0' not in idx,"index.html lists the notes by title and holds no note text")
    ok('Note 2' in rd('0/3.html') and 'keep:meta' in rd('0/3.html'),"note file has page and metadata")
    # ---- reload: everything comes back
    boot()
    titles=lambda: pg.evaluate("notes.slice().sort(byOrder).map(n=>n.title)")
    ok(titles()==['Note 0','Note 1','Note 2','Note 3','Note 4','Note 5'],f"reload restores notes in order {titles()}")
    pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")==6,"cards drawn after reload")
    ok(pg.evaluate("notes.find(n=>n.title==='Note 3').labels.join()")=='work' and pg.evaluate("LB.join()")=='work',"labels restored")
    ok(pg.evaluate("notes.find(n=>n.title==='Note 1').pinned")==True and pg.evaluate("notes.find(n=>n.title==='Note 2').isList")==True,"pinned/list flags restored")
    # ---- reorder persists
    pg.evaluate("""async()=>{const m=notes.filter(n=>!n.pinned).sort(byOrder);moveNote(m[3].id,m[0].id,false);await __A.flush()}""")
    after=titles(); boot(); ok(titles()==after and after.index('Note 4')<after.index('Note 2'),f"manual order persisted across reload {after}")
    ok('"pos"' in rd('index.html'),"order key present in index")
    # ---- media
    r=pg.evaluate("""async()=>{
      const cv=document.createElement('canvas');cv.width=40;cv.height=30;cv.getContext('2d').fillRect(0,0,40,30);
      const bl=await new Promise(r=>cv.toBlob(r,'image/png'));
      const n=notes.find(x=>x.title==='Note 4');const rec=await __A.addMedia(n,bl,'image','pic.png');addAtt(n,rec);save();await __A.flush();
      const u=await mediaURL(rec.id);const im=new Image();im.src=u;await im.decode();
      return {id:rec.id,w:rec.w,h:rec.h,nw:im.naturalWidth}}""")
    print('   media',r)
    ok(r['id'].startswith('media/images/0/') and r['w']==40 and r['h']==30 and r['nw']==40,"image stored under media/images/0 with size, and readable back")
    ok(any(f.endswith('.png') for f in ls('media/images/0')),"media file exists in the folder")
    boot(); pg.wait_for_timeout(600)
    ok(pg.evaluate("[...document.querySelectorAll('.gt img')].some(i=>i.naturalWidth===40)"),"after reload the card shows the stored image")
    # ---- outside edits
    nid=pg.evaluate("notes.find(n=>n.title==='Note 5').id")
    f=rd(f'0/{nid}.html'); wr(f'0/{nid}.html',f.replace('Note 5','Edited elsewhere'))
    pg.evaluate("__A.reconcile()"); pg.wait_for_timeout(800)
    ok(pg.evaluate("notes.some(n=>n.title==='Edited elsewhere')") and not pg.evaluate("notes.some(n=>n.title==='Note 5')"),"a note changed by another copy is picked up")
    base=rd('0/1.html'); new=re.sub(r'"id":\s*"1"','"id": "50"',base).replace('Note','External')
    wr('0/50.html',new); pg.evaluate("__A.reconcile()"); pg.wait_for_timeout(800)
    ok(pg.evaluate("notes.some(n=>n.id==='50')"),"a note file added from outside appears")
    rm('0/50.html'); pg.evaluate("__A.reconcile()"); pg.wait_for_timeout(800)
    ok(not pg.evaluate("notes.some(n=>n.id==='50')"),"a note file deleted from outside disappears")
    # ---- conflict: local edit while another copy changed the same note
    cid=pg.evaluate("notes.find(n=>n.title==='Note 2').id"); cn0=pg.evaluate("notes.length")
    pg.evaluate("c=>{const n=notes.find(x=>x.id===c);n.title='Local edit';save()}",cid)
    wr(f'0/{cid}.html',rd(f'0/{cid}.html').replace('Note 2','Theirs'))
    pg.evaluate("__A.flush()"); pg.wait_for_timeout(1200)
    ts=pg.evaluate("notes.map(n=>n.title)")
    ok(pg.evaluate("notes.length")==cn0+1 and 'Theirs' in ts and any('conflict copy' in t for t in ts),f"conflict keeps both versions ({[t for t in ts if t in('Theirs',) or 'conflict' in t]})")
    ok(pg.locator('.toast').count()>=1,"conflict message shown")
    # ---- label rewrite reaches files the app doesn't know
    wr('0/60.html',re.sub(r'"labels":\s*\[\s*\]','"labels": ["zzz"]',re.sub(r'"id":\s*"1"','"id": "60"',rd('0/1.html'))))
    pg.evaluate("__A.relabel('zzz','yyy')"); pg.wait_for_timeout(1200)
    t=rd('0/60.html'); ok('yyy' in t and 'zzz' not in t,"label rename also rewrites an unknown note file")
    # ---- deleting a note removes its file
    did=pg.evaluate("notes.find(n=>n.title==='Note 0').id")
    pg.evaluate("d=>{notes=notes.filter(n=>n.id!==d);save()}",did); pg.evaluate("__A.flush()"); pg.wait_for_timeout(800)
    ok(f'{did}.html' not in ls('0'),"deleting a note removes its file")
    # ---- settings dialog opens and closes
    pg.click('#setbtn'); pg.wait_for_timeout(300); ok(pg.locator('.ov').count()>=1,"settings dialog opens")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
