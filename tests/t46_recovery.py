"""Lock button before the folder is reconnected, and setting a new passphrase with the recovery key. (Header reused from t40.)\nOld: same look as Import/Export, password-manager form fields, focus, and cards that open when the app is unlocked. (Header reused from t40.)\nOld:: a draft while editing, removed after Close, recovered after a crash, left alone while its tab is open. (Header reused from t40.)\nOld:: the vault, encrypted pages and attachments, locking and unlocking, the mask, and writing while locked. (Header reused from t39.)
Old doc: lazy loading and the links-only index: the index holds no note text, only the notes on screen are read, notes that were not read are
never rewritten or erased by a save, searching looks through unread pages, and disconnecting clears the browser."""
import sys,re,json,base64
from harness import ok,finish,session
API="""
window.__A={load:()=>loadFolder(),flush:()=>flush(),mode:()=>MODE,fstate:()=>fstate};"""
with session(folder=True) as s:
    pg,ev,errs,b,ctx=s.pg,s.evaluate,s.errs,s.browser,s.context
    boot,ls,rd,rdb,wr,rm=s.boot,s.ls,s.rd,s.rdb,s.wr,s.rm
    PASS='orbit lantern velvet mosaic harbor'; NEW='second five random words here'; THIRD='third five random words again'
    ev=pg.evaluate
    boot()
    key=ev(f"Store.setupEncryption('{PASS}')"); s.settle()
    ev("async()=>{const x=blank();x.title='Hidden title';x.body='hidden text';x.enc=true;notes.push(x);save();await __A.flush()}"); s.settle()
    # ---- a new browser session: the folder needs a click before it can be read, but the Lock button is already there
    ev("async()=>{await kvSet('dir',await navigator.storage.getDirectory());localStorage.setItem('keep-mode','folder')}")
    pg.add_init_script("FileSystemHandle.prototype.queryPermission=async()=>'prompt'")
    pg.reload(); s.settle()
    st=ev("[Store.state,document.querySelector('#lockbtn').hidden,document.querySelector('#lockbtn').textContent.trim(),!!document.querySelector('#n7 svg'),localStorage.getItem('keep-vault')]")
    ok(st[0] in ('perm','cached') and st[1]==False and st[2]=='Unlock' and st[3]==True and st[4]=='1',f"before the folder is reconnected the sidebar already shows Unlock with its padlock: {st}")
    pg.click('#lockbtn'); s.settle()
    ok(ev("Store.state")=='ok' and pg.locator('.dlg[aria-label=\"Unlock encrypted notes\"]').count()==1,"clicking it reconnects the folder, then asks for the passphrase")
    pg.fill('#pw',PASS); pg.keyboard.press('Enter'); s.settle()
    ok(ev("Store.crypto.unlocked")==True and 'Hidden title' in pg.inner_text('.vg'),"after unlocking, the encrypted note opens")
    # ---- a folder without a vault forgets the hint
    # ---- unlock with the recovery key: a new passphrase is offered straight away
    ev("Store.lock()"); s.settle()
    pg.click('#lockbtn'); s.settle(); pg.click('.dlg [data-c=alt]'); s.settle()
    pg.fill('#pw',key); pg.keyboard.press('Enter'); s.settle()
    shape=ev("""()=>{const p=document.querySelector('.dlg');return p?{h3:p.querySelector('h3')?.textContent,big:[...p.querySelectorAll('button.big')].map(b=>b.textContent),done:p.querySelector('.cl .done')?.textContent,rk:!!p.querySelector('#rk')}:null}""")
    ok(ev("Store.crypto.unlocked")==True and shape and shape['h3']=='Set a new passphrase' and shape['big']==['Set new passphrase'] and shape['done']=='Not now' and not shape['rk'],f"after a recovery-key unlock, the app offers a new passphrase (and does not ask for the key again): {shape}")
    pg.fill('#p1','weak'); pg.fill('#p2','weak'); pg.keyboard.press('Enter'); s.settle()
    ok('Use at least 12 characters' in pg.inner_text('.dlg .res'),"a weak new passphrase is refused")
    pg.fill('#p1',NEW); pg.fill('#p2',NEW); pg.keyboard.press('Enter'); s.settle()
    ok(pg.locator('.dlg').count()==0 and 'New passphrase set' in pg.locator('.toast .tm').last.inner_text(),"setting it closes the dialog and says so")
    ev("Store.lock()"); s.settle()
    ok(ev(f"Store.unlock('{PASS}').then(()=>'ok',e=>e.code)")=='WRONG_PASSPHRASE',"the old passphrase no longer works")
    ev(f"Store.unlock('{NEW}')"); s.settle()
    ok(ev("Store.crypto.unlocked")==True,"the new one does")
    ev("Store.lock()"); s.settle()
    ev(f"Store.unlockWithRecoveryKey('{key}')"); s.settle()
    ok(ev("Store.crypto.unlocked")==True,"and the same recovery key still works")
    # ---- 'Not now' keeps the passphrase as it was
    ev("Store.lock()"); s.settle()
    pg.click('#lockbtn'); s.settle(); pg.click('.dlg [data-c=alt]'); s.settle()
    pg.fill('#pw',key); pg.keyboard.press('Enter'); s.settle()
    pg.click('.dlg [data-c=cancel]'); s.settle()
    ok(pg.locator('.dlg').count()==0 and ev("Store.crypto.unlocked")==True,"Not now leaves the app unlocked, with the passphrase unchanged")
    # ---- Forgot your passphrase? in the change dialog
    ev("void(window.__c=Crypt.changeDialog())"); s.settle()
    ok(pg.locator('.dlg [data-c=forgot]').count()==1,"the change dialog has “Forgot your passphrase?”")
    pg.click('.dlg [data-c=forgot]'); s.settle()
    ok(ev("document.querySelector('.dlg h3').textContent")=='Set a new passphrase' and pg.locator('.dlg #rk').count()==1,"it opens the new-passphrase dialog, which asks for the recovery key")
    pg.fill('#rk','AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA'); pg.fill('#p1',THIRD); pg.fill('#p2',THIRD); pg.keyboard.press('Enter'); s.settle()
    ok('recovery key is wrong' in pg.inner_text('.dlg .res'),"a wrong recovery key is refused")
    pg.fill('#rk',key); pg.keyboard.press('Enter'); s.settle()
    ok(pg.locator('.dlg').count()==0,"the right one sets the new passphrase")
    ev("Store.lock()"); s.settle()
    ev(f"Store.unlock('{THIRD}')"); s.settle()
    ok(ev("Store.crypto.unlocked")==True and 'hidden text' in ev("async()=>{await Store.loadAll(notes);return notes.find(n=>n.title==='Hidden title').body}") ,"the new passphrase opens the notes written under the old ones")
    # ---- reconnecting a folder that has a vault asks for the passphrase straight away
    ev("Store.lock()"); s.settle()
    ev("async()=>{await kvSet('dir',await navigator.storage.getDirectory());localStorage.setItem('keep-mode','folder')}")
    pg.reload(); s.until("typeof Store!=='undefined'&&(Store.state==='perm'||Store.state==='cached')",timeout=20000)
    ok(pg.locator('.dlg').count()==0,"(a new session: the folder needs a click, no dialog yet)")
    pg.mouse.click(700,600)
    pg.wait_for_selector('.dlg[aria-label="Unlock encrypted notes"]',timeout=20000)
    ok(ev("Store.state")=='ok',"clicking to reconnect the folder opens the unlock dialog by itself, without pressing Lock")
    pg.fill('#pw',NEW if False else THIRD); pg.keyboard.press('Enter'); s.settle()
    ok(ev("Store.crypto.unlocked")==True,"and unlocking from it works")
    # ---- after disconnecting, the lock button is gone, not shown without its icon
    ev("setTimeout(disconnectFolder,0)")
    s.until("typeof Store!=='undefined'&&Store.mode==='browser'&&notes.length===2",timeout=30000)
    lb=ev("(()=>{const b=document.querySelector('#lockbtn');return {hidden:b.hidden,display:getComputedStyle(b).display,hasVault:Store.crypto.hasVault}})()")
    ok(lb['hidden'] and lb['display']=='none' and not lb['hasVault'],f"after disconnecting the folder the sidebar has no Lock row: {lb}")
finish()
