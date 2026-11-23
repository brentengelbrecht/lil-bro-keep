"""Encryption (stage 2): the vault, encrypted pages and attachments, locking and unlocking, the mask, and writing while locked. (Header reused from t39.)
Old doc: lazy loading and the links-only index: the index holds no note text, only the notes on screen are read, notes that were not read are
never rewritten or erased by a save, searching looks through unread pages, and disconnecting clears the browser."""
import sys,re,json,base64
from harness import ok,finish,session
API="""
window.__A={load:()=>loadFolder(),flush:()=>flush(),mode:()=>MODE,fstate:()=>fstate};"""
with session(folder=True) as s:
    pg,ev,errs,b,ctx=s.pg,s.evaluate,s.errs,s.browser,s.context
    boot,ls,rd,rdb,wr,rm=s.boot,s.ls,s.rd,s.rdb,s.wr,s.rm
    PASS='orbit lantern velvet mosaic harbor'
    PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    ev=pg.evaluate
    boot()
    # ---- a note written before encryption exists stays plain, and has no mask
    ev("""async()=>{const x=blank();x.title='Legacy plain';x.body='old text';notes.push(x);save();await __A.flush()}"""); s.settle()
    ev("openModal(notes.find(n=>n.title==='Legacy plain'))"); s.settle()
    ok(pg.locator('.ov .editor .encb').count()==0,"without encryption set up there is no padlock button")
    pg.keyboard.press('Escape'); s.settle()
    # ---- set up
    ok(ev("Store.crypto.hasVault")==False and ev("Store.crypto.available")==True,"encryption is not set up yet, and is available in folder mode")
    r=ev("Store.setupEncryption('hunter2hunter2').then(()=>'ok',e=>e.code)"); ok(r=='WEAK_PASSPHRASE',f"a weak passphrase is refused: {r}")
    key=ev(f"Store.setupEncryption('{PASS}')")
    ok(re.match(r'^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$',key) is not None,f"setting up returns a recovery key: {key}")
    vt=rd('vault.json')
    ok(ev("Store.crypto.hasVault&&Store.crypto.unlocked")==True and 'orbit' not in vt and key.replace('-','') not in vt.replace('-','') and '"wrappedKey"' in vt,"the vault file holds wrapped keys only, not the passphrase or recovery key")
    # ---- an encrypted note with an encrypted attachment
    ev("""async png=>{const x=blank();x.title='Secret title';x.body='secret body text';x.enc=true;x.labels=['PrivLabel'];x.links=[{url:'https://example.com/secret-link'}];x.color=3;
      LB.push('PrivLabel');notes.push(x);
      const bin=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
      addAtt(x,await Store.addMedia(x,new Blob([bin],{type:'image/png'}),'image','passport-scan.png'));
      window.__sid=x.id;save();await __A.flush()}""",PNG); s.settle()
    sid=ev("__sid"); page=rd(f'{int(sid)//100}/{sid}.html')
    ok('keep:meta' in page and '"enc"' in page and '<title>Encrypted note</title>' in page and '<pre class="ct">LBK1.' in page,"the page has readable details and an encrypted token")
    ok(not any(w in page for w in ('Secret title','secret body text','PrivLabel','secret-link','passport-scan','"labels"','"sig"')),"title, text, labels, links and attachment names are not in the page")
    ok('"color": 3' in page and '"files"' in page and '.enc' in page,"colour and the names of the attachment files stay readable")
    ct=re.search(r'<pre class="ct">(.*?)</pre>',page).group(1)
    ev("""async()=>{const x=blank();x.title='Hi';x.body='x';x.enc=true;notes.push(x);save();await __A.flush();window.__short=x.id}"""); s.settle()
    sh=ev("__short"); sct=re.search(r'<pre class="ct">(.*?)</pre>',rd(f'{int(sh)//100}/{sh}.html')).group(1)
    ok(len(sct.split('.')[2])==704,f"a short note is padded to 512 bytes before it is encrypted ({len(sct.split('.')[2])} characters of ciphertext = 528 bytes)")
    att=ev("notes.find(n=>n.id===__sid).att[0]"); apath=att['id']
    ok(apath.endswith('.enc') and att['name']=='passport-scan.png' and att['type']=='image/png',f"the attachment is stored as an .enc file: {apath}")
    raw=rdb(apath); ok(raw[:4]==[0x4c,0x42,0x4b,0x41] and raw[1:4]!=[0x50,0x4e,0x47],"the attachment file on disk is encrypted, not a PNG")
    dec=ev("async id=>{const b=await getBlob(id);return Array.from(new Uint8Array(await b.arrayBuffer()))}",apath)
    ok(dec[:4]==[0x89,0x50,0x4e,0x47] and len(dec)==len(__import__('base64').b64decode(PNG)),"it reads back as the original image while unlocked")
    idx=rd('index.html')
    ok('Secret' not in idx and 'PrivLabel' not in idx and 'Encrypted note' in idx and '"enc":true' in idx,"index.html shows only the placeholder title and the encrypted flag")
    # ---- the editor of a new note offers the mask, on
    ev("document.querySelector('#composer .coll').click()"); s.settle()
    ok(pg.locator('#composer .editor .encb.on').count()==1,"a new note starts encrypted: the padlock is closed")
    ev("collapsed();open=null;openNote=null"); s.settle()
    ev("openModal(notes.find(n=>n.title==='Legacy plain'))"); s.settle()
    ok(pg.locator('.ov .editor .encb').count()==0,"a note that was saved unencrypted has no padlock button")
    pg.keyboard.press('Escape'); s.settle()
    # ---- lock
    ev("Store.lock()"); s.settle()
    ok(ev("Store.crypto.unlocked")==False and ev("notes.find(n=>n.id===__sid).stub")==True and ev("notes.find(n=>n.id===__sid).title")=='' and 'PrivLabel' not in ev("LB"),"locking drops the decrypted note and its labels from memory")
    ok(ev("async id=>(await getBlob(id))||null",apath) is None,"an encrypted attachment cannot be read while locked")
    ok(ev("document.querySelector('#lockbtn').hidden")==False and 'Unlock' in ev("document.querySelector('#lockbtn').textContent"),"the sidebar shows an Unlock button")
    # ---- details can change while locked; the ciphertext is kept
    ev("""id=>{const n=notes.find(x=>x.id===id);n.pinned=true;save()}""",sid); ev("__A.flush()"); s.settle()
    page2=rd(f'{int(sid)//100}/{sid}.html'); ct2=re.search(r'<pre class="ct">(.*?)</pre>',page2).group(1)
    ok('"pinned": true' in page2 and ct2==ct,"pinning a locked note rewrites its details and keeps the same ciphertext")
    # ---- start again: the app starts locked; opening asks for the passphrase
    boot(); ev(f"window.__sid='{sid}'")
    ok(ev("Store.crypto.hasVault")==True and ev("Store.crypto.unlocked")==False,"after a restart the app is locked")
    ok(ev("notes.find(n=>n.id===__sid).idxTitle")=='Encrypted note' and ev("notes.find(n=>n.id===__sid).stub")==True,"the encrypted note is shown by its placeholder title")
    ev("openModal(notes.find(n=>n.id===__sid))"); s.settle()
    ok(pg.locator('.dlg[aria-label="Unlock encrypted notes"]').count()==1,"opening an encrypted note asks for the passphrase")
    pg.fill('#pw','not the passphrase'); pg.click('.dlg [data-c=go]'); s.settle()
    ok('Wrong passphrase' in pg.inner_text('.dlg .res') and ev("Store.crypto.unlocked")==False,"a wrong passphrase is refused")
    pg.fill('#pw',PASS); pg.click('.dlg [data-c=go]'); s.settle()
    ok(ev("Store.crypto.unlocked")==True and pg.locator('.dlg[aria-label="Unlock encrypted notes"]').count()==0,"the right passphrase unlocks")
    ok(pg.locator('.ov .editor').count()==1 and ev("document.querySelector('.ov .editor .t').value")=='Secret title' and 'secret body text' in ev("document.querySelector('.ov .editor .rt').textContent"),"and the note opens with its title and text")
    ok(pg.locator('.ov .editor .encb.on').count()==1 and ev("notes.find(n=>n.id===__sid).labels")==['PrivLabel'] and ev("notes.find(n=>n.id===__sid).att[0].name")=='passport-scan.png',"labels and original attachment names are back")
    ok('PrivLabel' in ev("LB"),"its label joins the sidebar once unlocked")
    # ---- editing while the app locks (idle): saving then asks for the passphrase again
    ev("Store.lock()"); s.settle()
    ok(ev("!notes.find(n=>n.id===__sid).stub&&notes.find(n=>n.id===__sid).title==='Secret title'")==True,"the note being edited is not dropped when the app locks")
    pg.fill('.ov .editor .t','Secret title edited'); s.settle()
    pg.click('.ov .editor [data-e=done]'); s.settle()
    ok(pg.locator('.dlg[aria-label="Unlock encrypted notes"]').count()==1,"closing the note after it was locked asks for the passphrase to save it")
    pg.fill('#pw',PASS); pg.click('.dlg [data-c=go]'); s.settle()
    page3=rd(f'{int(sid)//100}/{sid}.html')
    ok('Secret title edited' not in page3 and re.search(r'<pre class="ct">(.*?)</pre>',page3).group(1)!=ct and ev("lastW.get(__sid)===sigOf(notes.find(n=>n.id===__sid))"),"after unlocking, the edit is saved, still encrypted")
    # ---- recovery key and changing the passphrase
    ev("Store.lock()"); s.settle()
    ok(ev("Store.unlockWithRecoveryKey('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA').then(()=>'ok',e=>e.code)")=='WRONG_RECOVERY_KEY',"a wrong recovery key is refused")
    ev(f"Store.unlockWithRecoveryKey('{key}')"); s.settle()
    ok(ev("Store.crypto.unlocked")==True,"the recovery key unlocks")
    ev(f"Store.changePassphrase('{PASS}','second five random words here')"); s.settle()
    ev("Store.lock()"); s.settle()
    ok(ev(f"Store.unlock('{PASS}').then(()=>'ok',e=>e.code)")=='WRONG_PASSPHRASE',"the old passphrase no longer works")
    ev("Store.unlock('second five random words here')"); s.settle()
    ok(ev("Store.crypto.unlocked")==True,"the new passphrase does")
    ok('Secret title edited' in ev("async()=>{await Store.loadAll(notes);return notes.find(n=>n.id===__sid).title}"),"notes encrypted before the change still open")
    # ---- idle auto-lock
    ev("Crypt.idleMs=500;Crypt.changed()"); s.until("!Store.crypto.unlocked",timeout=8000)
    ok(ev("Store.crypto.unlocked")==False,"the app locks itself after the idle time")
    ev("Crypt.idleMs=300000"); ev("Store.unlock('second five random words here')"); s.settle()
    # ---- the mask: cancelling keeps encryption; confirming makes the note unencrypted, for good
    ev("window.confirm=()=>false"); ev("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.id===__sid))}"); s.settle()
    pg.click('.ov .editor .encb'); s.settle()
    ok(pg.locator('.ov .editor .encb.on').count()==1 and ev("notes.find(n=>n.id===__sid).enc")==True,"declining the confirmation keeps the note encrypted")
    ev("window.confirm=()=>true"); pg.click('.ov .editor .encb'); s.settle()
    ok(pg.locator('.ov .editor .encb.on').count()==0 and pg.locator('.ov .editor .encb').count()==1 and ev("notes.find(n=>n.id===__sid).enc")==False,"confirming opens the padlock")
    pg.click('.ov .editor .encb'); s.settle()
    ok(ev("notes.find(n=>n.id===__sid).enc")==True,"until the note is saved it can be switched back")
    pg.click('.ov .editor .encb'); s.settle()
    pg.click('.ov .editor [data-e=done]'); s.settle()
    page4=rd(f'{int(sid)//100}/{sid}.html')
    ok('Secret title edited' in page4 and 'secret body text' in page4 and '"enc"' not in page4,"saved unencrypted: the page is readable and has no encryption settings")
    napath=ev("notes.find(n=>n.id===__sid).att[0].id")
    ok(napath.endswith('.png') and rdb(napath)[:4]==[0x89,0x50,0x4e,0x47],f"its attachment is a plain image again: {napath}")
    ok(apath not in [f'media/images/{int(sid)//100}/'+x for x in ls(f'media/images/{int(sid)//100}')],"the encrypted attachment file is gone")
    ok('Secret title edited' in rd('index.html'),"the index shows the real title again")
    ok(ev("notes.find(n=>n.id===__sid).plain")==True,"the note is marked as saved unencrypted")
    ev("openModal(notes.find(n=>n.id===__sid))"); s.settle()
    ok(pg.locator('.ov .editor .encb').count()==0,"the padlock button is gone for it from now on")
    pg.keyboard.press('Escape'); s.settle()
    # ---- the same after a restart
    boot(); ev(f"window.__sid='{sid}'")
    ev("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.id===__sid))}"); s.settle()
    ok(pg.locator('.ov .editor .encb').count()==0 and ev("notes.find(n=>n.id===__sid).enc")!=True,"after a restart it is still unencrypted, with no padlock button")
    pg.keyboard.press('Escape'); s.settle()
finish()
