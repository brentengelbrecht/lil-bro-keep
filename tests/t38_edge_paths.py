"""Paths the other suites never reach: a save that fails (permission lost, any other error), stopping use of the folder, copying notes
into a new folder, files and links dropped on the editor, the image viewer's pan and wheel zoom, list numbering by letter,
the card's label pop-up and camera button, and how a file is classed as image, audio or video."""
from playwright.sync_api import sync_playwright
import sys
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
BASE='http://localhost:8765/index.html'
INIT="FileSystemHandle.prototype.queryPermission=async()=>'granted';FileSystemHandle.prototype.requestPermission=async()=>'granted'"
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script(INIT)
    pg.add_init_script("window.__png=async()=>await(await fetch('data:image/png;base64,%s')).blob()"%PNG)      # survives the reloads below
    pg.goto(BASE); pg.wait_for_timeout(600)
    ev=pg.evaluate
    # ============ how a file is classed ============
    k=ev("""()=>{const f=(n,t)=>({name:n,type:t});return[mediaKind(f('a.png',''),'audio'),mediaKind(f('v.3gp','video/3gpp'),''),mediaKind(f('x.bin','audio/ogg'),''),
      mediaKind(f('c.mkv',''),''),mediaKind(f('d.mp4','video/mp4'),''),mediaKind(f('e.png','image/png'),''),mediaKind(f('f.xyz',''),''),
      mediaKindOf({type:'image/jpeg'}),mediaKindOf({type:'video/mp4'}),mediaKindOf({type:'audio/mpeg'}),mediaKindOf({type:'text/plain'})]}""")
    ok(k==['audio','audio','audio','video','video','image','image','image','video','audio',''],f"files are classed by hint, extension and type: {k}")
    # ============ files and links dropped on the editor ============
    def fresh(**kw):
        ev("""(o)=>{const n=blank();Object.assign(n,o);notes=[n];LB=['work'];commit();window.__n=n;openModal(n)}""",kw); pg.wait_for_timeout(700)
    def drop(files=(),uri=None,text=None):
        pg.evaluate("""async([files,uri,text])=>{
          const dt=new DataTransfer();
          for(const [name,type] of files)dt.items.add(new File([name==='a.png'||type==='image/png'?await(await __png()).arrayBuffer():new TextEncoder().encode('hello')],name,{type}));
          if(uri)dt.setData('text/uri-list',uri);if(text)dt.setData('text/plain',text);
          document.querySelector('.ov .t').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))}""",[list(files),uri,text])
        pg.wait_for_timeout(600)
    msg=lambda: ev("(document.querySelector('.ov .emsg')||{}).textContent||''")
    fresh(); drop(files=[('a.png','image/png'),('notes.txt','text/plain')])
    ok(ev("__n.att.length")==1 and ev("__n.att[0].kind")=='image',"dropping a picture and a text file attaches only the picture")
    ok('1 file was skipped' in msg(),f"and says one file was skipped: {msg()!r}")
    drop(files=[('notes.txt','text/plain')]); ok(msg()=='Only images, videos and audio can be attached.',f"dropping only a text file says nothing can be attached: {msg()!r}")
    drop(uri='https://example.com/page'); ok('example.com/page' in (ev("__n.html")or'')+ev("__n.body"),"dropping a web address adds it to the note text as a link")
    ok('<a' in (ev("__n.html")or''),"the address is a real link in the note")
    drop(uri='https://example.org/second'); ok('example.org/second' in (ev("__n.html")or''),"a second dropped address is added after the first")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    fresh(isList=True,items=[{'t':'milk','d':False}]); drop(uri='https://example.com/list')
    ok(ev("(__n.links||[]).some(l=>/example.com\\/list/.test(l.url))"),"on a checklist a dropped address is added to the note's links")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # ============ list numbering by letter ============
    fresh(); pg.click('.ov .rt'); pg.keyboard.type('a. one'); pg.keyboard.press('Enter'); pg.keyboard.type('two'); pg.keyboard.press('Enter')
    ok(ev("__n.body").startswith('a. one\nb. two\nc.'),f"Enter after 'a. one' continues with 'b.' then 'c.': {ev('__n.body')!r}")
    pg.keyboard.press('Control+a'); pg.keyboard.press('Delete'); pg.keyboard.type('z. last'); pg.keyboard.press('Enter'); pg.keyboard.type('after')
    ok(ev("__n.body")=='z. last\nafter',f"after 'z.' the list ends instead of running past the alphabet: {ev('__n.body')!r}")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # ============ the image viewer: wheel zoom and drag to pan ============
    ev("""async()=>{const n=blank();n.title='pics';const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle='#08f';g.fillRect(0,0,400,300);
      const bl=await new Promise(r=>c.toBlob(r,'image/png'));addAtt(n,await addMedia(n,bl,'image','big.png'));notes=[n];commit();window.__n=n;openModal(n)}"""); pg.wait_for_timeout(900)
    pg.click('.ov .gt'); pg.wait_for_timeout(900)
    ok(pg.locator('.ivsc').count()==1,"clicking the picture opens the viewer")
    lab=lambda: pg.inner_text('.ivl')
    box=pg.locator('.ivsc').bounding_box(); cx,cy=box['x']+box['width']/2,box['y']+box['height']/2
    pg.mouse.move(cx,cy)
    pg.keyboard.down('Control'); 
    for _ in range(4): pg.mouse.wheel(0,-100); pg.wait_for_timeout(120)
    pg.keyboard.up('Control'); pg.wait_for_timeout(300)
    z=lab(); ok(z!='100%',f"Ctrl and the mouse wheel zoom the picture in ({z})")
    s0=ev("[document.querySelector('.ivsc').scrollLeft,document.querySelector('.ivsc').scrollTop]")
    pg.mouse.move(cx,cy); pg.mouse.down(); pg.mouse.move(cx-120,cy-80,steps=6)
    ok(pg.locator('.ivsc.panning').count()==1,"holding the button down on the zoomed picture starts a pan")
    pg.mouse.up(); pg.wait_for_timeout(200)
    s1=ev("[document.querySelector('.ivsc').scrollLeft,document.querySelector('.ivsc').scrollTop]")
    ok(s1[0]>s0[0] or s1[1]>s0[1],f"dragging moves the picture ({s0} -> {s1})")
    ok(pg.locator('.ivsc.panning').count()==0,"letting go ends the pan")
    pg.keyboard.down('Control'); 
    for _ in range(8): pg.mouse.wheel(0,100); pg.wait_for_timeout(100)
    pg.keyboard.up('Control'); pg.wait_for_timeout(200); ok(lab()=='40%',f"the wheel zooms out to the 40% limit ({lab()})")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    # ============ the card's label pop-up and camera button ============
    ev("""()=>{const n=blank();n.title='card';n.body='x';notes=[n];LB=['work','home'];commit();window.__n=n}"""); pg.wait_for_timeout(500)
    C='.card'
    def pop(): pg.hover(C); pg.wait_for_timeout(350); pg.click(C+' [data-act=lblpick]',force=True); pg.wait_for_timeout(300)
    pop(); pg.click('.cpop .lrow[data-l=work]'); pg.wait_for_timeout(300)
    ok(ev("__n.labels")==['work'],f"clicking a label in the card pop-up adds it: {ev('__n.labels')}")
    pg.click('.cpop .lrow[data-l=work]'); pg.wait_for_timeout(300); ok(ev("__n.labels")==[],"clicking it again takes it off")
    pg.fill('.cpop .lq','zeta'); pg.wait_for_timeout(200); ok(pg.locator('.cpop .lrow[data-new]').count()==1,"typing a new name offers to create it")
    pg.click('.cpop .lrow[data-new]'); pg.wait_for_timeout(300); ok(ev("__n.labels")==['zeta'] and ev("LB.includes('zeta')"),"clicking 'Create' makes the label and applies it")
    pg.fill('.cpop .lq','eta'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300); ok(ev("__n.labels.includes('eta')"),"Enter in the box also creates and applies a label")
    pg.keyboard.press('Escape'); pg.mouse.click(5,5); pg.wait_for_timeout(300)
    ev("()=>{takePhoto=async()=>await __png()}")
    pg.hover(C); pg.wait_for_timeout(350); pg.click(C+' [data-act=cam]',force=True); pg.wait_for_timeout(900)
    ok(ev("__n.att.length")==1 and ev("__n.att[0].name").startswith('Photo '),f"the card's camera button stores the photo ({ev('__n.att.map(a=>a.name)')})")
    ev("()=>{window.__attach=attach;attach=async()=>{throw new Error('full')}}")
    pg.hover(C); pg.wait_for_timeout(350); pg.click(C+' [data-act=cam]',force=True); pg.wait_for_timeout(900)
    ok(pg.locator('.toast').filter(has_text='Couldn’t store the photo').count()>=1,"if storing fails the person is told")
    # ============ folder mode: a save that fails ============
    ev("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700)
    ev("""async()=>{const root=await navigator.storage.getDirectory();for await(const [n] of root.entries())await root.removeEntry(n,{recursive:true})}""")
    ev("async()=>{ROOT=await navigator.storage.getDirectory();await loadFolder()}"); pg.wait_for_timeout(1200)
    ok(ev("[MODE,fstate]")==['folder','ok'],"folder mode is on")
    ev("""()=>{window.__w=writeFile;writeFile=async()=>{const e=new Error('revoked');e.name='NotAllowedError';throw e};const n=blank();n.title='Will fail';notes.push(n);save()}""")
    ev("flush()"); pg.wait_for_timeout(700)
    ok(ev("fstate")=='cached',f"losing permission while saving switches to the saved copy (fstate={ev('fstate')})")
    ok(pg.locator('[data-act=reconnect]').count()>=1,"and the page offers to reconnect")
    ev("()=>{writeFile=__w}"); ev("Store.reconnect()"); pg.wait_for_timeout(1500)
    ok(ev("fstate")=='ok',f"reconnecting brings the folder back (fstate={ev('fstate')})")
    files=ev("""async()=>{const r=await(await navigator.storage.getDirectory()).getDirectoryHandle('0');let s='';for await(const [n,e] of r.entries())s+=await(await e.getFile()).text();return s}""")
    ok('Will fail' in files,"the note that failed to save is written once access is back")
    ev("""()=>{writeFile=async()=>{throw new Error('disk full')};const n=blank();n.title='Second';notes.push(n);save()}""")
    ev("flush()"); pg.wait_for_timeout(700)
    ok('Couldn’t save: disk full' in pg.inner_text('#st'),f"any other failure is shown: {pg.inner_text('#st')!r}")
    ev("()=>{writeFile=__w}"); ev("flush()"); pg.wait_for_timeout(800)
    # ============ folder mode: copy notes into a new folder ============
    ev("""async()=>{const n=notes[0];addAtt(n,await addMedia(n,await __png(),'image','pic.png'));save();await flush()}"""); pg.wait_for_timeout(500)
    rep=ev("""async()=>{const log=[];const hd=await(await navigator.storage.getDirectory()).getDirectoryHandle('other',{create:true});
      await attachFolder(hd,{copy:true,report:t=>log.push(t)});return log}""")
    ok(any('Copying media 1 of 1' in t for t in rep),f"copying reports its progress: {rep}")
    ls=lambda d: ev("""async d=>{let r=await(await navigator.storage.getDirectory()).getDirectoryHandle('other');for(const p of d.split('/').filter(Boolean))r=await r.getDirectoryHandle(p);const o=[];for await(const [n] of r.entries())o.push(n);return o.sort()}""",d)
    ok('index.html' in ls('') and ls('0')[0].endswith('.html'),f"the notes were written into the new folder: {ls('')}")
    ok(any(n.endswith('.png') for n in ls('media/images/0')),f"and their pictures were copied too: {ls('media/images/0')}")
    ok(ev("notes.length")==2,"the app still has all its notes")
    # ============ folder mode: stop using the folder ============
    pg.click('#setbtn'); pg.wait_for_timeout(400)
    pg.once('dialog',lambda d:d.dismiss()); pg.click('[data-s=disc]'); pg.wait_for_timeout(500)
    ok(ev("MODE")=='folder',"saying no to 'Stop using the folder' changes nothing")
    pg.once('dialog',lambda d:d.accept())
    with pg.expect_navigation(): pg.click('[data-s=disc]')
    pg.wait_for_timeout(900)
    ok(ev("[MODE,localStorage.getItem('keep-mode')]")==['browser',None],f"saying yes goes back to the notes stored in the browser ({ev('[MODE,localStorage.getItem(\"keep-mode\")]')})")
    # ---- the editor shows "Created <date>" or, once the note was modified after it was created, "Edited <date>"
    pg.goto(BASE); pg.wait_for_timeout(600)
    ev("""(()=>{notes.length=0;const mk=o=>Object.assign(blank(),o);
      notes.push(mk({id:'DA',title:'Untouched',body:'hello',ts:Date.parse('2026-01-05T09:30:00')}));
      notes.push(mk({id:'DB',title:'Old edit',body:'hello',ts:Date.parse('2026-01-05T09:30:00'),mod:Date.parse('2026-03-02T17:45:00')}));
      notes.push(mk({id:'DC',title:'To edit',body:'hello',ts:Date.parse('2026-01-05T09:30:00')}));
      commit();Host.render()})()"""); pg.wait_for_timeout(500)
    DT=lambda: ev("(document.querySelector('.editor .edate')||{textContent:''}).textContent")
    def op(i): pg.click('.card[data-id=%s] h3'%i); pg.wait_for_timeout(450)
    def cl(): pg.keyboard.press('Escape'); pg.wait_for_timeout(450)
    op('DA'); ok(DT()=='Created 5 Jan 2026, 9:30 AM',f"an untouched note shows its created date ({DT()})"); cl()
    op('DB'); ok(DT()=='Edited 2 Mar 2026, 5:45 PM',f"a note modified after it was created shows the modified date ({DT()})"); cl()
    op('DC'); pg.click('.editor .rt'); pg.keyboard.type(' more'); pg.wait_for_timeout(300)
    ok(DT().startswith('Edited ') and '2026' in DT(),f"typing switches it to Edited, now ({DT()})"); cl()
    ok(ev("(()=>{const n=notes.find(x=>x.id==='DC');return n.mod>n.ts})()"),"saving stamps the modified date of a changed note")
    op('DA'); cl(); ok(ev("notes.find(x=>x.id==='DA').mod===undefined"),"opening and closing a note without changing it does not stamp it")
    print('errors',errs); ok(errs==[],"no errors")
    b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
