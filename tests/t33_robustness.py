"""Things that used to fail silently now say so, and unreadable data is kept rather than replaced."""
from playwright.sync_api import sync_playwright
import sys,re
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script("FileSystemHandle.prototype.queryPermission=async()=>'granted';FileSystemHandle.prototype.requestPermission=async()=>'granted'")
    ev=pg.evaluate; toasts=lambda: ' '.join(pg.locator('.toast').all_inner_texts())
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    # ---- browser storage full or blocked
    ev("()=>{window.__orig=Storage.prototype.setItem;Storage.prototype.setItem=function(){const e=new Error('quota');e.name='QuotaExceededError';throw e};}")
    ev("()=>{notes[0].title='changed';save()}"); pg.wait_for_timeout(300)
    ok('Couldn’t save your notes' in toasts() and 'full or blocked' in toasts(),"a failed save in browser storage is reported")
    n=pg.locator('.toast').count(); ev("()=>{save();save()}"); pg.wait_for_timeout(200)
    ok(pg.locator('.toast').count()==n,"…but not repeatedly")
    ev("()=>{Storage.prototype.setItem=window.__orig}")
    # ---- saved notes that cannot be read are kept, not replaced
    for label,raw in [('broken JSON','{not json'),('the wrong kind of data','{"a":1}')]:
        ev("r=>{localStorage.clear();localStorage.setItem('keep-notes',r)}",raw); pg.reload(); pg.wait_for_timeout(1500)
        keys=ev("Object.keys(localStorage).filter(k=>k.startsWith('keep-notes-unreadable'))")
        ok(len(keys)==1 and ev("k=>localStorage.getItem(k)",keys[0])==raw,f"{label}: the unreadable data is kept under a backup key")
        ok('couldn’t be read' in toasts() and ev("notes.length")>0,f"{label}: the person is told, and the sample notes are shown")
        ev("()=>{notes[0].title='after';save()}"); pg.wait_for_timeout(200)
        ok(ev("k=>localStorage.getItem(k)",keys[0])==raw and 'after' in ev("localStorage.getItem('keep-notes')"),f"{label}: a later save does not touch the backup")
    ev("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(1200)
    ok(ev("Object.keys(localStorage).filter(k=>k.startsWith('keep-notes-unreadable')).length")==0 and 'couldn’t be read' not in toasts(),"a first run with no saved notes raises no warning")
    # ---- a folder that holds a file that is not a readable note
    ev("async()=>{const r=await navigator.storage.getDirectory();for await(const [n] of r.entries())await r.removeEntry(n,{recursive:true});localStorage.removeItem('keep-mode')}")
    pg.reload(); pg.wait_for_timeout(600)
    wr=lambda path,text: ev("""async([path,text])=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p,{create:true});const w=await(await r.getFileHandle(fn,{create:true})).createWritable();await w.write(text);await w.close()}""",[path,text])
    rd=lambda path: ev("""async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);return await(await(await r.getFileHandle(fn)).getFile()).text()}""",path)
    ev("""async()=>{ROOT=await navigator.storage.getDirectory();await loadFolder();
      for(let i=0;i<2;i++){const x=blank();x.title='Good '+i;notes.push(x)}save();await flush()}"""); pg.wait_for_timeout(800)
    ok('couldn’t be read' not in toasts(),"a healthy folder raises no warning")
    wr('0/80.html','<html><body>this is not a note page</body></html>')
    ev("async()=>{await runReconcile()}"); pg.wait_for_timeout(1000)
    ok('1 file in the folder couldn’t be read as a note and was left out: 0/80.html' in toasts(),f"an unreadable note file is reported by name: {toasts()[:110]}")
    k=pg.locator('.toast').count(); ev("async()=>{await runReconcile();await runReconcile()}"); pg.wait_for_timeout(800)
    ok(pg.locator('.toast').count()==k,"…once, not on every check")
    ev("()=>document.querySelectorAll('.toast .tx2').forEach(b=>b.click())"); pg.wait_for_timeout(300)
    wr('0/81.html','garbage'); ev("async()=>{await runReconcile()}"); pg.wait_for_timeout(800)
    ok('2 files' in toasts() and '0/81.html' in toasts(),"a second unreadable file is reported too")
    ev("async()=>{const r=await navigator.storage.getDirectory(),d=await r.getDirectoryHandle('0');await d.removeEntry('80.html');await d.removeEntry('81.html')}")
    ev("()=>document.querySelectorAll('.toast .tx2').forEach(b=>b.click())"); ev("async()=>{await runReconcile()}"); pg.wait_for_timeout(800)
    ok(ev("notes.length")==2 and pg.locator('.toast').count()==0,"once the files are gone nothing is reported, and the real notes are untouched")
    ok(ev("async()=>{const r=await navigator.storage.getDirectory(),d=await r.getDirectoryHandle('0');const o=[];for await(const [n] of d.entries())o.push(n);return o.sort().join()}")=='1.html,2.html',"unreadable files are never deleted by the app")
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
