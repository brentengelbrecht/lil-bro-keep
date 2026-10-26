"""Starting the app with a remembered notes folder: access still granted, access needing a click (with and without a saved copy),
no remembered folder at all, and choosing 'use browser storage'.
The browser's own way of remembering a folder (a handle in IndexedDB) crashes this headless browser when read back, so the lookup is replaced
by a stand-in that returns the folder; everything after the lookup is the app's normal code."""
from playwright.sync_api import sync_playwright
import sys
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
INIT="""
FileSystemHandle.prototype.queryPermission=async()=>localStorage.getItem('__perm')||'granted';
FileSystemHandle.prototype.requestPermission=async()=>localStorage.getItem('__req')||'granted';
window.__dirStub=null;
if(!localStorage.getItem('__nodir'))navigator.storage.getDirectory().then(h=>{window.__dirStub=h});
const og=IDBObjectStore.prototype.get;
IDBObjectStore.prototype.get=function(k){
  const req=og.call(this,k);
  if(k==='dir'){
    Object.defineProperty(req,'result',{get:()=>window.__dirStub});
    const st=this;let n=0;
    const again=()=>{if(window.__dirStub||localStorage.getItem('__nodir')||n++>400)return;const r2=og.call(st,'__wait__');r2.onsuccess=again};   // keeps the lookup open until the folder is ready
    req.addEventListener('success',again);
  }
  return req;
};
window.confirm=()=>true;
"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script(INIT)
    ev=pg.evaluate
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    # ---- set up a folder holding three notes (attached the way choosing a folder does), and let the saved copy be written
    ev("async()=>{const r=await navigator.storage.getDirectory();for await(const [n] of r.entries())await r.removeEntry(n,{recursive:true});localStorage.removeItem('keep-mode')}")
    pg.reload(); pg.wait_for_timeout(600)
    ev("""async()=>{ROOT=await navigator.storage.getDirectory();await loadFolder();
      for(let i=0;i<3;i++){const x=blank();x.title='Folder note '+i;x.body='b'+i;x.ts=Date.now()-i*1000;notes.push(x)}
      save();await flush();await writeCache();localStorage.setItem('keep-mode','folder')}""")   # the saved copy is normally written 4 s after the last change
    pg.wait_for_timeout(500)
    def start(perm='granted',nodir=False,req='granted'):
        ev("([p,n,r])=>{localStorage.setItem('__perm',p);localStorage.setItem('__req',r);n?localStorage.setItem('__nodir','1'):localStorage.removeItem('__nodir')}",[perm,nodir,req])
        pg.reload(); pg.wait_for_timeout(2500)
    st=lambda: ev("({mode:Store.mode,state:Store.state,gesture:Store.gesturePending,loaded:Store.loaded,titles:notes.map(n=>n.title).sort(),bar:!!document.getElementById('cachebar'),composer:document.getElementById('composer').style.display})")
    # ---- access still granted: straight in
    start('granted'); s=st(); print('   ',s)
    ok(s['mode']=='folder' and s['state']=='ok' and s['titles']==['Folder note 0','Folder note 1','Folder note 2'] and not s['bar'],"access granted: the folder's notes load and the page is fully usable")
    ok(ev("document.querySelectorAll('.vg>.card').length")==3 and s['composer']!='none',"cards and the new-note box are shown")
    # ---- access needs a click, but a saved copy exists
    start('prompt'); s=st(); print('   ',s)
    ok(s['state']=='cached' and s['gesture'] and s['titles']==['Folder note 0','Folder note 1','Folder note 2'],"access needs a click: the saved copy of the notes is shown meanwhile")
    ok(s['bar'] and 'Click anywhere to reconnect' in pg.inner_text('#cachebar') and s['composer']=='none',"a banner says so, and new-note is hidden")
    # saving while only the saved copy is showing must not copy the folder's notes into the browser-storage copy
    ev("localStorage.setItem('keep-notes',JSON.stringify([{id:'old',title:'OLD BROWSER NOTE',body:'',ts:1}]))")
    ev("()=>{save()}"); pg.wait_for_timeout(300)
    ok(ev("JSON.parse(localStorage.getItem('keep-notes'))[0].title")=='OLD BROWSER NOTE',"a save while only the saved copy is showing leaves the browser-storage copy alone")
    ev("localStorage.setItem('__perm','granted')")
    pg.mouse.click(700,500); pg.wait_for_timeout(2000); s=st()
    ok(s['state']=='ok' and s['loaded'] and not s['bar'],"clicking anywhere reconnects and the banner goes")
    ok(ev("document.querySelectorAll('.vg>.card').length")==3,"the notes are still there")
    # ---- the banner's own buttons
    start('prompt'); ev("localStorage.setItem('__perm','granted')"); pg.click('#cachebar [data-act=reconnect]'); pg.wait_for_timeout(2000)
    ok(st()['state']=='ok',"the Reconnect button in the banner works")
    # ---- access needs a click and there is no saved copy
    ev("async()=>{await kvDel('cache')}"); start('prompt'); s=st()
    ok(s['state']=='perm' and 'Reconnect your notes folder' in pg.inner_text('#out'),"with no saved copy a full-page Reconnect prompt is shown")
    ev("localStorage.setItem('__perm','granted')"); pg.click('#out [data-act=reconnect]'); pg.wait_for_timeout(2000); s=st()
    ok(s['state']=='ok' and s['titles']==['Folder note 0','Folder note 1','Folder note 2'],"Reconnect brings the notes back")
    # ---- permission refused when asked
    ev("async()=>{await kvDel('cache')}"); start('prompt',req='denied'); pg.click('#out [data-act=reconnect]'); pg.wait_for_timeout(1500)
    ok(st()['state']=='perm',"if the browser refuses, the prompt stays")
    # ---- use browser storage instead
    with pg.expect_navigation(): pg.click('#out [data-act=usebrowser]')
    pg.wait_for_timeout(1200)
    ok(ev("localStorage.getItem('keep-mode')") is None and ev("Store.mode")=='browser',"Use browser storage instead switches back to browser mode")
    # ---- no remembered folder at all
    ev("localStorage.setItem('keep-mode','folder')"); start('granted',nodir=True); pg.wait_for_timeout(1500)
    ok(ev("localStorage.getItem('keep-mode')") is None and ev("Store.mode")=='browser',"folder mode with no remembered folder falls back to browser mode")
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
