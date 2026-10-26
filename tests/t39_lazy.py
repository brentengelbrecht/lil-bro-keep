"""Lazy loading and the links-only index: the index holds no note text, only the notes on screen are read, notes that were not read are
never rewritten or erased by a save, searching looks through unread pages, and disconnecting clears the browser."""
from playwright.sync_api import sync_playwright
import sys,re,json
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
BASE='http://localhost:8765/index.html'
API="""
window.__A={load:()=>loadFolder(),flush:()=>flush(),mode:()=>MODE,fstate:()=>fstate};"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script("FileSystemHandle.prototype.queryPermission=async()=>'granted';FileSystemHandle.prototype.requestPermission=async()=>'granted';window.confirm=()=>true")
    pg.goto(BASE); pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{const root=await navigator.storage.getDirectory();for await(const [n] of root.entries())await root.removeEntry(n,{recursive:true})}""")
    def boot():
        pg.evaluate("localStorage.removeItem('keep-mode')"); pg.reload(); pg.wait_for_timeout(700); pg.evaluate(API)
        pg.evaluate("async()=>{ROOT=await navigator.storage.getDirectory();await __A.load()}"); pg.wait_for_timeout(1500)
    ls=lambda d='': pg.evaluate("""async d=>{let r=await navigator.storage.getDirectory();for(const p of d.split('/').filter(Boolean))r=await r.getDirectoryHandle(p);const o=[];for await(const [n,e] of r.entries())o.push(n+(e.kind==='directory'?'/':''));return o.sort()}""",d)
    rd=lambda path: pg.evaluate("""async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);return await(await(await r.getFileHandle(fn)).getFile()).text()}""",path)
    wr=lambda path,text: pg.evaluate("""async([path,text])=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p,{create:true});const w=await(await r.getFileHandle(fn,{create:true})).createWritable();await w.write(text);await w.close()}""",[path,text])
    rm=lambda path: pg.evaluate("""async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);await r.removeEntry(fn)}""",path)
    boot()
    # ---- 300 notes, each with its own word in the body
    pg.evaluate("""async()=>{
      for(let i=0;i<300;i++){const x=blank();x.title='Note '+i;x.body='alpha body number '+i+(i===5?' needleword':'');x.ts=Date.now()-i*60000;x.color=i%12;notes.push(x)}
      save();await __A.flush()}""")
    pg.wait_for_timeout(500)
    idx=rd('index.html')
    ok('needleword' not in idx and 'alpha body' not in idx,"index.html holds no note text")
    entries=pg.evaluate("""async()=>{const d=new DOMParser().parseFromString(await(await(await(await navigator.storage.getDirectory()).getFileHandle('index.html')).getFile()).text(),'text/html');return JSON.parse(d.getElementById('keep-index').textContent).notes}""")
    ok(len(entries)==300 and all('body' not in e and 'title' not in e and 'items' not in e and e.get('t') for e in entries),"every index entry has a link title and details, no text fields")
    ok('href="0/' in idx and 'Note 7' in idx,"the readable list still links to every note page")
    # ---- reload: nothing is read until it is needed
    boot()
    loaded=pg.evaluate("notes.filter(n=>!n.stub).length"); stubs=pg.evaluate("notes.filter(n=>n.stub).length")
    ok(stubs>150 and 0<loaded<150,f"after start-up only the cards near the screen are read ({loaded} read, {stubs} not)")
    ok(pg.evaluate("document.querySelector('.vg>.card h3')?.textContent")=='Note 0',"first card shows its title")
    ok(pg.evaluate("document.querySelector('.vg>.card .tx')?.textContent")=='alpha body number 0',"first card shows its text once read")
    # ---- reading is not an edit: no file is rewritten
    before=pg.evaluate("""async()=>{const r=await navigator.storage.getDirectory(),d=await r.getDirectoryHandle('0'),o={};for await(const [n,e] of d.entries()){const f=await e.getFile();o[n]=[f.lastModified,f.size]}return o}""")
    pg.evaluate("async()=>{await Store.loadAll(notes);await __A.flush()}"); pg.wait_for_timeout(1200)
    after=pg.evaluate("""async()=>{const r=await navigator.storage.getDirectory(),d=await r.getDirectoryHandle('0'),o={};for await(const [n,e] of d.entries()){const f=await e.getFile();o[n]=[f.lastModified,f.size]}return o}""")
    ok(pg.evaluate("notes.every(n=>!n.stub)") and before==after,"reading every note rewrites no file")
    # ---- a change to a note that was not read keeps its text
    boot()
    far=pg.evaluate("notes.slice().sort(byOrder).pop().id")
    ok(pg.evaluate("id=>notes.find(n=>n.id===id).stub",far)==True,"the last note has not been read")
    pg.evaluate("id=>{const n=notes.find(x=>x.id===id);n.pinned=true;n.color=4;save()}",far); pg.evaluate("__A.flush()"); pg.wait_for_timeout(1200)
    t=rd(f'{int(far)//100}/{far}.html')
    ok('alpha body number 299' in t and '"pinned": true' in t,"pinning a note that was not read keeps its text in the file")
    ok(pg.evaluate("id=>notes.find(n=>n.id===id).body",far)=='alpha body number 299',"and the note now has its text in memory")
    # ---- an unreadable page is never overwritten
    boot()
    bad=pg.evaluate("notes.slice().sort(byOrder)[298].id"); wr(f'{int(bad)//100}/{bad}.html','<p>damaged, no metadata</p>')
    pg.evaluate("id=>{const n=notes.find(x=>x.id===id);n.pinned=true;save()}",bad); pg.evaluate("__A.flush()"); pg.wait_for_timeout(1200)
    ok(rd(f'{int(bad)//100}/{bad}.html')=='<p>damaged, no metadata</p>',"a page that cannot be read is left as it is, not overwritten")
    # ---- opening a note that was not read
    boot()
    far=pg.evaluate("notes.slice().sort(byOrder)[250].id")
    pg.evaluate("id=>openModal(notes.find(n=>n.id===id))",far); pg.wait_for_timeout(900)
    ok(pg.evaluate("document.querySelector('.editor .rt')?.textContent")=='alpha body number 250',"opening a note that was not read shows its text")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    # ---- search looks through pages that were not read
    boot()
    pg.fill('#q','needleword'); pg.wait_for_timeout(2500)
    shown=pg.evaluate("[...document.querySelectorAll('.vg>.card h3')].map(h=>h.textContent)")
    ok(shown==['Note 5'],f"search finds text in a note that was not read: {shown}")
    pg.fill('#q','zzzznothing'); pg.wait_for_timeout(2500)
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")==0 and 'No matching notes' in pg.evaluate("document.querySelector('#out').textContent"),"a search with no match shows none")
    pg.fill('#q',''); pg.wait_for_timeout(600)
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")>3,"clearing the search shows the notes again")
    # ---- an import in folder mode clears the browser's own leftovers but keeps the folder's notes
    boot(); n_before=pg.evaluate("notes.length")
    pg.evaluate("async()=>{localStorage.setItem('keep-notes','[1]');localStorage.setItem('keep-labels','[]');await putBlob('blob2',new Blob(['x']))}")
    pg.evaluate("clearBrowserForImport()"); pg.wait_for_timeout(300)
    ok(pg.evaluate("localStorage.getItem('keep-notes')")is None and pg.evaluate("async()=>(await getBlob('blob2'))||null")is None and pg.evaluate("notes.length")==n_before,"before an import in folder mode the browser's leftovers are cleared and the folder's notes stay")
    # ---- an index written by the earlier version (whole notes) still loads
    old=json.dumps({'v':1,'labels':[],'notes':[{'id':'1','title':'Old index note','body':'old body','html':'','isList':False,'items':[],'labels':[],'att':[],'links':[],'color':0,'pinned':False,'trashed':False,'ts':1700000000000}]})
    pg.evaluate("async()=>{const root=await navigator.storage.getDirectory();for await(const [n] of root.entries())await root.removeEntry(n,{recursive:true})}")
    wr('index.html','<html><body><script type="application/json" id="keep-index">'+old+'</script></body></html>')
    boot()
    ok(pg.evaluate("notes.length")==1 and pg.evaluate("notes[0].stub")!=True and pg.evaluate("notes[0].title")=='Old index note',"an index with whole notes (earlier version) loads as before")
    # ---- disconnecting clears the browser and shows the two welcome notes
    pg.evaluate("""async()=>{localStorage.setItem('keep-notes',JSON.stringify([{id:'x1',title:'Old browser note',body:'b',html:'',isList:false,items:[],labels:['L'],att:[],links:[],color:0,pinned:false,trashed:false,ts:1}]));localStorage.setItem('keep-labels','["L"]');
      await putBlob('blob1',new Blob(['x']));await kvSet('cache',{notes:[],labels:[]})}""")
    with pg.expect_navigation(): pg.evaluate("disconnectFolder()")
    pg.wait_for_timeout(900)
    ok(pg.evaluate("Store.mode")=='browser' and pg.evaluate("notes.map(n=>n.title).join('|')")=='Welcome to Lil Bro Keep|Try a checklist',"after disconnecting the app shows its two welcome notes")
    ok(pg.evaluate("localStorage.getItem('keep-notes')")is None and pg.evaluate("localStorage.getItem('keep-labels')")is None and pg.evaluate("LB.length")==0,"browser-stored notes and labels are gone")
    ok(pg.evaluate("async()=>(await getBlob('blob1'))||null")is None and pg.evaluate("async()=>await kvGet('cache')")is None,"stored media and the saved copy are gone")
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
