"""Two copies of the app (two pages of one browser) open on the same folder: they share the browser's private file system,
the cross-copy messages and the Web Lock, like two tabs on one real folder. Checks: a save shows up in the other copy,
two copies adding a note at the same moment never reuse a number or lose a note, writes take turns on the lock,
and an edit to the same note in both copies keeps both versions."""
from playwright.sync_api import sync_playwright
import sys
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
BASE='http://localhost:8765/index.html'
with sync_playwright() as p:
    b=p.chromium.launch(); cx=b.new_context(viewport={'width':1100,'height':800})
    cx.add_init_script("FileSystemHandle.prototype.queryPermission=async()=>'granted';FileSystemHandle.prototype.requestPermission=async()=>'granted'")
    errs=[]
    A=cx.new_page(); B=cx.new_page()
    for pg in (A,B):
        pg.on('pageerror',lambda e,pg=pg:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    A.goto(BASE); A.wait_for_timeout(600)
    A.evaluate("""async()=>{const root=await navigator.storage.getDirectory();for await(const [n] of root.entries())await root.removeEntry(n,{recursive:true})}""")
    def boot(pg):
        pg.evaluate("localStorage.removeItem('keep-mode')"); pg.reload(); pg.wait_for_timeout(700)
        pg.evaluate("async()=>{ROOT=await navigator.storage.getDirectory();await loadFolder()}"); pg.wait_for_timeout(1200)
    B.goto(BASE); B.wait_for_timeout(500)
    boot(A); boot(B)
    ok(A.evaluate("[MODE,fstate]")==['folder','ok'] and B.evaluate("[MODE,fstate]")==['folder','ok'],"both copies run in folder mode on the same folder")
    titles=lambda pg: pg.evaluate("notes.map(n=>n.title).sort()")
    files=lambda: A.evaluate("""async()=>{const r=await(await navigator.storage.getDirectory()).getDirectoryHandle('0');const o=[];for await(const [n] of r.entries())o.push(n);return o.sort()}""")
    ids=lambda pg: pg.evaluate("notes.map(n=>n.id).sort()")
    add=lambda pg,t: pg.evaluate("t=>{const x=blank();x.title=t;x.body='b '+t;notes.push(x);save()}",t)
    # ---- a save in one copy reaches the other without a reload
    add(A,'From A'); A.evaluate("flush()"); B.wait_for_timeout(3500)
    ok('From A' in titles(B),f"a note saved in copy A appears in copy B on its own ({titles(B)})")
    ok(B.evaluate("pending")==False,"copy B has nothing waiting to save after picking it up")
    # ---- two copies add a note at the same moment: different numbers, nothing lost
    both=lambda: [pg.evaluate("t=>{const x=blank();x.title=t;x.body='b '+t;notes.push(x);save()}",t) for pg,t in ((A,'Both A'),(B,'Both B'))]
    both()
    A.evaluate("()=>{window.__fa=flush()}"); B.evaluate("()=>{window.__fb=flush()}")      # both start before either finishes
    A.evaluate("__fa"); B.evaluate("__fb"); A.wait_for_timeout(500)
    fl=files()
    ok(len([f for f in fl if f.endswith('.html')])==3,f"three note files in the folder after the simultaneous adds: {fl}")
    A.evaluate("runReconcile()"); B.evaluate("runReconcile()"); A.wait_for_timeout(1500)
    for nm,pg in (('A',A),('B',B)):
        ok(titles(pg)==['Both A','Both B','From A'],f"copy {nm} shows all three notes ({titles(pg)})")
        ok(len(set(ids(pg)))==3,f"copy {nm}: three different note numbers {ids(pg)}")
    # ---- writes take turns on the Web Lock
    A.evaluate("""()=>{window.__held=new Promise(res=>{navigator.locks.request('lil-bro-keep-folder',()=>new Promise(r=>{window.__rel=r;res(true)}))})}""")
    A.evaluate("__held")
    add(B,'Waits for lock'); B.evaluate("()=>{window.__done=false;window.__fl=flush().then(()=>{window.__done=true})}")
    B.wait_for_timeout(1500)
    ok(B.evaluate("__done")==False and 'Waits for lock' not in A.evaluate("""async()=>{const r=await(await navigator.storage.getDirectory()).getDirectoryHandle('0');let s='';for await(const [n,e] of r.entries())if(n.endsWith('.html'))s+=await(await e.getFile()).text();return s}"""),"while copy A holds the lock, copy B's save does not run")
    A.evaluate("__rel()"); B.evaluate("__fl"); B.wait_for_timeout(500)
    ok(B.evaluate("__done")==True and len([f for f in files() if f.endswith('.html')])==4,f"once the lock is released the save completes ({files()})")
    # ---- the same note edited in both copies: both versions kept
    A.evaluate("runReconcile()"); A.wait_for_timeout(1200)
    nid=A.evaluate("notes.find(n=>n.title==='From A').id")
    A.evaluate("c=>{notes.find(x=>x.id===c).title='A edit';save()}",nid)
    B.evaluate("c=>{const n=notes.find(x=>x.id===c);n.title='B edit';save()}",nid)
    A.evaluate("flush()"); A.wait_for_timeout(400); B.evaluate("flush()"); B.wait_for_timeout(1500)
    tb=titles(B)
    ok('A edit' in tb and any('conflict copy' in t and 'B edit' in t for t in tb),f"copy B keeps the other copy's version and its own as a conflict copy ({tb})")
    ok(B.locator('.toast').count()>=1,"copy B is told about the conflict")
    A.evaluate("runReconcile()"); A.wait_for_timeout(1500)
    ok(titles(A)==titles(B),f"after another check both copies show the same notes ({titles(A)})")
    # ---- a delete in one copy reaches the other
    did=A.evaluate("notes.find(n=>n.title==='Both B').id")
    A.evaluate("d=>{notes=notes.filter(n=>n.id!==d);save()}",did); A.evaluate("flush()"); B.wait_for_timeout(3500)
    ok('Both B' not in titles(B),f"a note deleted in copy A disappears from copy B ({titles(B)})")
    print('errors',errs); ok(errs==[],"no errors in either copy")
    b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
