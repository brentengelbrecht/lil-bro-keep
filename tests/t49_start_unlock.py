"""Starting the app on a folder that has a vault asks for the passphrase: correct unlocks, cancelling or a wrong one leaves the app locked, and an unsaved draft
of an encrypted note is offered only after that (so the passphrase is not asked twice)."""
from harness import ok,finish,session
PW='orbit lantern velvet mosaic harbor'
DLG='.dlg[aria-label="Unlock encrypted notes"]'
with session(folder=True) as s:
    pg,ev=s.pg,s.evaluate
    s.boot()
    ev(f"Store.setupEncryption('{PW}')"); s.settle()
    ev("""async()=>{const x=blank();x.title='Hidden title';x.body='hidden text';x.enc=true;notes.push(x);const y=blank();y.title='Plain one';y.body='open text';notes.push(y);save();await __A.flush()}"""); s.settle()
    def restart():
        ev("async()=>{await kvSet('dir',await navigator.storage.getDirectory());localStorage.setItem('keep-mode','folder')}")
        pg.reload()
    # ---- a plain restart (permission already granted): the prompt comes by itself
    restart(); pg.wait_for_selector(DLG,timeout=20000)
    ok(ev("Store.state")=='ok' and ev("Store.crypto.unlocked")==False,"starting on a folder with a vault opens the unlock dialog, the folder loaded and the app locked")
    # ---- a wrong passphrase gets one attempt: the dialog closes and the app stays locked
    pg.fill('#pw','not the passphrase at all'); pg.keyboard.press('Enter')
    pg.wait_for_selector(DLG,state='detached',timeout=20000); s.settle()
    ok(ev("Store.crypto.unlocked")==False and 'Wrong passphrase' in pg.locator('.toast .tm').last.inner_text() and 'Unlock in the sidebar' in pg.locator('.toast .tm').last.inner_text(),"a wrong passphrase closes the start-up prompt, says so, and leaves the app locked")
    ok(pg.locator('.vg>.card h3.sealed').count()==1 and 'Plain one' in pg.inner_text('.vg') and 'Unlock' in ev("document.querySelector('#lockbtn').textContent"),"started locked: the encrypted note shows as ciphertext, the plain note is usable, the sidebar offers Unlock")
    # ---- retrying is done with Unlock in the sidebar, whose dialog lets the person try again in place
    pg.click('#lockbtn'); pg.wait_for_selector(DLG,timeout=20000)
    pg.fill('#pw','still not the passphrase'); pg.keyboard.press('Enter')
    s.until("document.querySelector('.dlg .res')&&document.querySelector('.dlg .res').textContent.includes('Wrong passphrase')",timeout=20000)
    ok(pg.locator(DLG).count()==1 and ev("Store.crypto.unlocked")==False,"the sidebar's Unlock dialog refuses a wrong passphrase and stays open for another try")
    pg.fill('#pw',PW); pg.keyboard.press('Enter'); s.settle()
    ok(ev("Store.crypto.unlocked")==True,"and a correct one unlocks")
    # ---- cancelling the start-up prompt
    restart(); pg.wait_for_selector(DLG,timeout=20000)
    pg.click(f'{DLG} [data-c=cancel]'); s.settle()
    ok(pg.locator(DLG).count()==0 and ev("Store.crypto.unlocked")==False and ev("Store.state")=='ok',"cancelling the start-up prompt leaves the app locked, the folder loaded")
    # ---- the right passphrase
    restart(); pg.wait_for_selector(DLG,timeout=20000)
    pg.fill('#pw',PW); pg.keyboard.press('Enter'); s.settle()
    ok(ev("Store.crypto.unlocked")==True and 'Hidden title' in pg.inner_text('.vg') and 'hidden text' in pg.inner_text('.vg'),"the right passphrase unlocks at start and the encrypted note opens at once")
    # ---- an unsaved draft of an encrypted note: unlock first, then the draft is offered, without a second passphrase prompt
    ev("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.title==='Hidden title'))}"); s.settle()
    pg.fill('.ov .editor .t','Hidden title edited'); s.until_draft('Hidden title edited')
    restart(); pg.wait_for_selector(DLG,timeout=20000)
    ok(pg.locator('.dlg[aria-label="Unsaved edits"]').count()==0,"with a draft waiting, the passphrase comes first")
    pg.fill('#pw',PW); pg.keyboard.press('Enter')
    pg.wait_for_selector('.dlg[aria-label="Unsaved edits"]',timeout=20000)
    ok(ev("Store.crypto.unlocked")==True,"then the unsaved edits are offered")
    pg.click('.dlg [data-d=go]'); pg.wait_for_selector('.ov .editor',timeout=20000)
    ok(pg.locator(DLG).count()==0 and ev("document.querySelector('.ov .editor .t').value")=='Hidden title edited',"continuing opens them without asking for the passphrase again")
    # ---- cancelling the passphrase with a draft waiting still offers the draft (which asks to unlock when continued)
    pg.click('.ov .editor [data-e=done]'); s.settle()
    ev("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.title==='Hidden title edited'))}"); s.settle()
    pg.fill('.ov .editor .t','Hidden title edited twice'); s.until_draft('Hidden title edited twice')
    restart(); pg.wait_for_selector(DLG,timeout=20000)
    pg.click(f'{DLG} [data-c=cancel]')
    pg.wait_for_selector('.dlg[aria-label="Unsaved edits"]',timeout=20000)
    ok(ev("Store.crypto.unlocked")==False,"if the passphrase was cancelled the draft is still offered, and the app is still locked")
finish()
