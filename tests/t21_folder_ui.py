"""Folder dialogs: choosing a folder (empty / existing / cancelled), rewriting the stylesheet, rescanning, disconnecting.
The browser's folder picker is replaced by a function that returns a directory inside the browser's private file system."""
from playwright.sync_api import sync_playwright
import sys,re
from harness import ok,finish
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script("FileSystemHandle.prototype.queryPermission=async()=>'granted';FileSystemHandle.prototype.requestPermission=async()=>'granted'")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{const root=await navigator.storage.getDirectory();for await(const [n] of root.entries())await root.removeEntry(n,{recursive:true});
      localStorage.removeItem('keep-mode');window.__answers=[];window.confirm=m=>{window.__asked=(window.__asked||[]).concat(m);return window.__answers.length?window.__answers.shift():true};
      window.showDirectoryPicker=async()=>window.__pick}""")
    pg.reload(); pg.wait_for_timeout(600)
    pg.evaluate("""()=>{window.__answers=[];window.confirm=m=>{window.__asked=(window.__asked||[]).concat(m);return window.__answers.length?window.__answers.shift():true};window.showDirectoryPicker=async()=>window.__pick}""")
    pick=lambda name: pg.evaluate("async n=>{const r=await navigator.storage.getDirectory();window.__pick=await r.getDirectoryHandle(n,{create:true});return n}",name)
    ls=lambda path: pg.evaluate("""async path=>{let r=await navigator.storage.getDirectory();for(const p of path.split('/').filter(Boolean))r=await r.getDirectoryHandle(p);const o=[];for await(const [n,e] of r.entries())o.push(n+(e.kind==='directory'?'/':''));return o.sort()}""",path)
    rd=lambda path: pg.evaluate("""async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);return await(await(await r.getFileHandle(fn)).getFile()).text()}""",path)
    wr=lambda path,text: pg.evaluate("""async([path,text])=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p,{create:true});const w=await(await r.getFileHandle(fn,{create:true})).createWritable();await w.write(text);await w.close()}""",[path,text])
    PW='orbit lantern velvet mosaic harbor'
    def setup_dialog():          # the encryption step that now comes first when a folder without a vault is chosen
        pg.wait_for_selector('.dlg[aria-label="Set up encryption"]',timeout=15000)
        pg.fill('#p1',PW); pg.fill('#p2',PW); pg.keyboard.press('Enter')
        pg.wait_for_selector('.dlg .rkey',timeout=15000); pg.check('#ack'); pg.click('.dlg [data-c=fin]'); pg.wait_for_timeout(300)
    res=lambda: pg.evaluate("document.querySelector('.dlg .res').textContent")
    opendlg=lambda: (pg.click('#setbtn'),pg.wait_for_timeout(250))
    ok(pg.evaluate("Store.mode")=='browser',"starts in browser mode with the two sample notes")
    # ---- settings in browser mode
    opendlg(); txt=pg.inner_text('.dlg'); ok('this browser only' in txt and 'Choose notes folder' in txt and pg.locator('[data-s=disc]').count()==0,"browser-mode settings offer to choose a folder only")
    # ---- cancelled: folder holds notes, person says no
    pickA=pick('A'); wr('A/index.html','<html><body><script id="keep-index" type="application/json">{"notes":[],"labels":[]}</script></body></html>')
    pg.evaluate("window.__answers=[false]"); pg.click('[data-s=choose]')
    pg.wait_for_selector('.dlg[aria-label="Set up encryption"]',timeout=15000)
    ok('already contains notes' not in ''.join(pg.evaluate("window.__asked||[]")),"a folder without encryption is asked about encryption first, before the question about its notes")
    ok('“A”' in pg.inner_text('.dlg[aria-label="Set up encryption"]'),"the dialog names the folder")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    ok(pg.evaluate("Store.mode")=='browser' and 'vault.json' not in ls('A'),"cancelling the encryption step stops the folder change and writes nothing")
    ok('already contains notes' not in ''.join(pg.evaluate("window.__asked||[]")),"…and the folder question is never asked")
    pg.click('[data-s=choose]'); setup_dialog(); pg.wait_for_timeout(700)
    ok(pg.evaluate("Store.mode")=='browser',"declining to load an existing folder changes nothing")
    ok('vault.json' not in ls('A') and pg.evaluate("Store.crypto.hasVault")==False and pg.evaluate("Store.crypto.unlocked")==False,"…and the encryption prepared for it leaves no trace: no vault.json, no key in use")
    pg.evaluate("window.__asked=[]")
    # ---- empty folder, copy notes in
    rm=pg.evaluate("async()=>{const r=await navigator.storage.getDirectory();await r.removeEntry('A',{recursive:true})}")
    pick('A'); pg.evaluate("window.__answers=[true]"); pg.click('[data-s=choose]'); setup_dialog(); pg.wait_for_timeout(1800)
    T=lambda: pg.locator('.toast .tm').last.inner_text()
    ok(pg.locator('.dlg').count()==0,"the settings dialog closes once the folder is chosen")
    ok(pg.evaluate("Store.mode")=='folder' and 'Saving to' in T(),f"choosing an empty folder and copying the notes works: {T()}")
    ok(ls('A/0')==['1.html','2.html'] and 'styles.css' in ls('A') and 'index.html' in ls('A'),f"notes written to the folder: {ls('A')} {ls('A/0')}")
    ok('Copy the 2 notes' in ''.join(pg.evaluate("window.__asked")),"asked whether to copy the notes in")
    ok('vault.json' in ls('A') and pg.evaluate("Store.crypto.hasVault&&Store.crypto.unlocked")==True,"the folder has its vault, and the app is unlocked (the passphrase was just typed)")
    ok('"enc"' in rd('A/0/1.html') and 'Welcome' not in rd('A/0/1.html'),"the notes copied in from the browser are encrypted")
    opendlg()
    ok('Change folder' in pg.inner_text('.dlg') and pg.locator('[data-s=rebuild]').count()==1,"settings now show the folder options")
    ok(pg.inner_text('.dlg .tile b')=='A' and 'Connected' in pg.inner_text('.dlg .tile'),"settings name the folder and say it is connected")
    # ---- rewrite stylesheet
    wr('A/styles.css','/* broken */'); pg.click('[data-s=css]'); pg.wait_for_timeout(500)
    ok(len(rd('A/styles.css'))>200 and 'Stylesheet rewritten' in res(),"rewrite stylesheet restores it")
    # ---- rescan picks up a file added outside
    base=rd('A/0/1.html'); wr('A/0/70.html',re.sub(r'"id":\s*"1"','"id": "70"',base).replace('Welcome','Outside'))
    pg.click('[data-s=rebuild]'); pg.wait_for_timeout(1500)
    ok('Rescanned: 3 notes found' in res(),f"rescan counts the note added outside: {res()}")
    ok(pg.evaluate("notes.some(n=>n.id==='70')"),"…and loads it")
    # ---- choose an existing folder (A again)
    pg.evaluate("window.__asked=[];window.__answers=[true]"); pick('A'); pg.click('[data-s=choose]'); pg.wait_for_timeout(1800)
    ok('Loaded 3 notes' in T() and 'already contains notes' in ''.join(pg.evaluate("window.__asked")),f"choosing a folder that has notes loads them: {T()}")
    pg.wait_for_selector('.dlg[aria-label="Unlock encrypted notes"]',timeout=15000)
    ok(True,"a folder that has a vault asks for the passphrase as soon as it is loaded")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    ok(pg.evaluate("Store.crypto.hasVault&&!Store.crypto.unlocked")==True,"cancelling leaves the app locked, the folder loaded")
    # ---- a new empty folder, start empty
    opendlg(); pick('C'); pg.evaluate("window.__answers=[false]"); pg.click('[data-s=choose]'); setup_dialog(); pg.wait_for_timeout(1500)
    ok('0 notes written' in T() and pg.evaluate("notes.length")==0,f"empty folder, not copying: {T()}")
    ok(set(ls('C'))>={'styles.css','index.html','vault.json'},"scaffold and vault written into the new folder")
    ok(pg.evaluate("Store.crypto.unlocked")==True and 'Copy the' not in ''.join(pg.evaluate("window.__asked")[-1:]),"switching from a folder does not offer to copy its encrypted or unread notes")
    # ---- disconnect
    opendlg(); pg.evaluate("window.__answers=[true]")
    with pg.expect_navigation(): pg.click('[data-s=disc]')
    pg.wait_for_timeout(800)
    ok(pg.evaluate("localStorage.getItem('keep-mode')")is None and pg.evaluate("Store.mode")=='browser',"disconnect returns to browser storage")
    print('errors',errs); b.close()
finish()
