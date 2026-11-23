"""Encryption dialogs: same look as Import/Export, password-manager form fields, focus, and cards that open when the app is unlocked. (Header reused from t40.)\nOld:: a draft while editing, removed after Close, recovered after a crash, left alone while its tab is open. (Header reused from t40.)\nOld:: the vault, encrypted pages and attachments, locking and unlocking, the mask, and writing while locked. (Header reused from t39.)
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
    ev=pg.evaluate
    boot()
    ev("async()=>{const x=blank();x.title='Plain';x.body='p';notes.push(x);save();await __A.flush()}"); s.settle()
    # ---- set up: the dialog has the same parts as Export
    ev("void(window.__p=Crypt.setupDialog())"); s.settle()
    shape=lambda: pg.evaluate("""()=>{const p=document.querySelector('.dlg');return {cls:p.className,dic:!!p.querySelector('.dic svg'),h3:p.querySelector('h3')?.textContent,big:[...p.querySelectorAll('button.big')].map(b=>b.textContent),done:p.querySelector('.cl .done')?.textContent,focus:document.activeElement.id||document.activeElement.textContent}}""")
    sh=shape()
    ok('dlg2' in sh['cls'] and sh['dic'] and sh['h3']=='Set up encryption' and sh['big']==['Turn on encryption'] and sh['done']=='Cancel',f"the set-up dialog has an icon, a title, one big button and a plain button, like Export: {sh}")
    f=pg.evaluate("""()=>{const q=s=>document.querySelector('.dlg '+s);return {user:q('input[name=username]').autocomplete,u:q('input[name=username]').value,p1:q('#p1').autocomplete,p2:q('#p2').autocomplete,form:!!q('form'),submit:q('button[type=submit]').textContent}}""")
    ok(f['user']=='username' and 'Lil Bro Keep' in f['u'] and f['p1']=='new-password' and f['p2']=='new-password' and f['form'] and f['submit']=='Turn on encryption',f"it is a form a password manager recognises: {f}")
    ok(sh['focus']=='p1',"focus starts in the passphrase field")
    pg.fill('#p1','short'); pg.keyboard.press('Enter'); s.settle()
    ok('Use at least 12 characters' in pg.inner_text('.dlg .res'),"Enter submits the form, and a weak passphrase is refused with the reason")
    pg.fill('#p1',PASS); pg.fill('#p2',PASS+'x'); pg.keyboard.press('Enter'); s.settle()
    ok('different' in pg.inner_text('.dlg .res'),"a mismatch is reported")
    pg.fill('#p2',PASS); pg.keyboard.press('Enter'); s.settle()
    sh=shape()
    ok(sh['h3']=='Your recovery key' and pg.locator('.dlg .rkey').count()==1 and sh['big']==['Copy recovery key','Done'] and pg.locator('.dlg [data-c=fin]').is_disabled(),"the recovery key step is in the same style, with Done disabled")
    ok(sh['focus']=='Copy recovery key',f"focus moves to the top of the new step: {sh['focus']}")
    pg.check('#ack'); s.settle()
    ok(pg.locator('.dlg [data-c=fin]').is_enabled(),"ticking the box enables Done")
    pg.click('.dlg [data-c=fin]'); s.settle()
    ok(pg.locator('.dlg').count()==0 and ev("Store.crypto.hasVault&&Store.crypto.unlocked")==True,"Done closes it, with encryption on")
    # ---- an encrypted note, locked
    ev("""async()=>{const x=blank();x.title='Hidden title';x.body='hidden text';x.enc=true;notes.push(x);save();await __A.flush()}"""); s.settle()
    ev("Store.lock()"); s.settle()
    ok(pg.locator('.vg>.card h3.sealed').count()==1,"(the encrypted note is shown as ciphertext while locked)")
    # ---- unlock from the sidebar, by keyboard
    pg.click('#lockbtn'); s.settle()
    sh=shape()
    ok(sh['h3']=='Unlock encrypted notes' and sh['big']==['Unlock'] and sh['dic'] and sh['done']=='Cancel' and sh['focus']=='pw',f"the unlock dialog matches: {sh}")
    u=pg.evaluate("""()=>{const q=s=>document.querySelector('.dlg '+s);return [q('input[name=username]').autocomplete,q('#pw').autocomplete,q('#pw').type]}""")
    ok(u==['username','current-password','password'],f"it offers the browser's saved passphrase: {u}")
    pg.fill('#pw',PASS); pg.keyboard.press('Enter'); s.settle()
    ok(pg.locator('.vg>.card h3.sealed').count()==0 and 'Hidden title' in pg.inner_text('.vg') and 'hidden text' in pg.inner_text('.vg'),"after unlocking, the encrypted cards on screen open at once (no ciphertext left)")
    foc=ev("""()=>{const b=document.activeElement;return {id:b.id,outline:getComputedStyle(b).outlineStyle,quiet:b.hasAttribute('data-quiet')}}""")
    ok(foc['id']=='lockbtn' and foc['outline']=='none' and foc['quiet'],f"focus is back on the Lock button without the ring: {foc}")
    pg.keyboard.press('Tab'); s.settle()
    ok(ev("document.querySelector('#lockbtn').hasAttribute('data-quiet')")==False,"the ring comes back as soon as a key is pressed")
    # ---- cancelling puts focus back as every other dialog does (with the ring after a keyboard close)
    ev("Store.lock()"); s.settle()
    pg.click('#lockbtn'); s.settle(); pg.keyboard.press('Escape'); s.settle()
    foc=ev("""()=>{const b=document.activeElement;return {id:b.id,outline:getComputedStyle(b).outlineStyle}}""")
    ok(foc['id']=='lockbtn' and foc['outline']!='none' and ev("Store.crypto.unlocked")==False,f"Escape closes it and returns focus to the Lock button: {foc}")
    # ---- recovery-key mode and the change dialog
    pg.click('#lockbtn'); s.settle(); pg.click('.dlg [data-c=alt]'); s.settle()
    sh=shape(); ok(sh['h3']=='Unlock with your recovery key' and sh['focus']=='pw',f"switching to the recovery key keeps the style and focuses the field: {sh['h3']}")
    ok(pg.evaluate("document.querySelector('.dlg #pw').autocomplete")=='off',"the recovery key is not offered to the password manager")
    pg.keyboard.press('Escape'); s.settle()
    ev(f"Store.unlock('{PASS}')"); s.settle()
    ev("void(window.__c=Crypt.changeDialog())"); s.settle()
    sh=shape(); c=pg.evaluate("""()=>[...document.querySelectorAll('.dlg input.pw')].map(i=>i.autocomplete)""")
    ok(sh['h3']=='Change passphrase' and sh['big']==['Change passphrase'] and sh['done']=='Cancel' and c==['current-password','new-password','new-password'],f"the change dialog matches too: {sh['h3']} {c}")
    pg.keyboard.press('Escape'); s.settle()
    # ---- the unsaved-edits prompt matches
    ev("openModal(notes.find(n=>n.title==='Plain'))"); s.settle()
    pg.fill('.ov .editor .t','Plain edited'); s.settle()
    boot()
    sh=shape(); ok(sh['h3']=='Unsaved edits from a previous session' and sh['big']==['Continue'] and sh['done']=='Discard',f"the unsaved-edits prompt matches: {sh}")
finish()
