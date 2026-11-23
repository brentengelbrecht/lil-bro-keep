"""Editor drafts (stage 4): a draft while editing, removed after Close, recovered after a crash, left alone while its tab is open. (Header reused from t40.)\nOld:: the vault, encrypted pages and attachments, locking and unlocking, the mask, and writing while locked. (Header reused from t39.)
Old doc: lazy loading and the links-only index: the index holds no note text, only the notes on screen are read, notes that were not read are
never rewritten or erased by a save, searching looks through unread pages, and disconnecting clears the browser."""
import sys,re,json,base64
from harness import ok,finish,session,BASE,API
API="""
window.__A={load:()=>loadFolder(),flush:()=>flush(),mode:()=>MODE,fstate:()=>fstate};"""
with session(folder=True) as s:
    pg,ev,errs,b,ctx=s.pg,s.evaluate,s.errs,s.browser,s.context
    boot,ls,rd,rdb,wr,rm=s.boot,s.ls,s.rd,s.rdb,s.wr,s.rm
    PASS='orbit lantern velvet mosaic harbor'
    ev=pg.evaluate
    draft=lambda: pg.evaluate("JSON.parse(localStorage.getItem('keep-draft')||'null')")
    boot()
    ev("""async()=>{const x=blank();x.title='Plain one';x.body='original text';notes.push(x);const y=blank();y.title='Plain two';y.body='second';notes.push(y);save();await __A.flush()}"""); s.settle()
    ids=ev("notes.map(n=>n.id)"); pid=ev("notes.find(n=>n.title==='Plain one').id")
    ok(draft() is None,"no draft exists to begin with")
    # ---- a draft is kept while editing, and goes once the note is saved
    ev("openModal(notes.find(n=>n.title==='Plain one'))"); s.settle()
    ok(draft() is None,"opening a note without changing it writes no draft")
    pg.fill('.ov .editor .t','Plain one edited'); s.until_draft('Plain one edited')
    d=draft(); ok(d is not None and d['note']['title']=='Plain one edited' and d['note']['id']==pid and d['isNew']==False,"typing writes a draft of the open note")
    pg.click('.ov .editor [data-e=done]'); s.settle()
    ok(draft() is None and 'Plain one edited' in rd(f'0/{pid}.html'),"closing saves the note, then the draft is removed")
    # ---- a new note: draft, then discarded when closed empty
    pg.click('#composer .coll'); s.settle(); pg.keyboard.type('brand new thought'); s.until("(()=>{const d=JSON.parse(localStorage.getItem('keep-draft')||'null');return !!d&&d.note.body.includes('brand new thought')})()")
    d=draft(); ok(d is not None and d['isNew']==True and 'brand new thought' in d['note']['body'],"a note being written in the new-note bar has a draft too")
    ev("document.querySelector('#composer .rt').textContent='';"); s.pause(900)      # a debounce: time itself is what is waited for
    pg.keyboard.press('Escape'); ev("document.querySelector('#composer [data-e=done]')&&document.querySelector('#composer [data-e=done]').click()"); s.settle()
    ok(draft() is None,"an empty new note leaves no draft")
    # ---- crash: the page goes away with the note open
    ev("openModal(notes.find(n=>n.title==='Plain one edited'))"); s.settle()
    pg.fill('.ov .editor .t','Edited before the crash'); s.until_draft('Edited before the crash')
    ok(draft() is not None,"(draft written before the crash)")
    boot()
    ok(pg.locator('.dlg[aria-label=\"Unsaved edits\"]').count()==1 and 'Edited before the crash' not in pg.inner_text('.dlg'),"the next start offers to continue or discard, without showing the text")
    pg.click('.dlg [data-d=go]'); s.settle()
    ok(pg.locator('.ov .editor').count()==1 and ev("document.querySelector('.ov .editor .t').value")=='Edited before the crash',"continuing opens the editor with the unsaved edits")
    pg.click('.ov .editor [data-e=done]'); s.settle()
    ok('Edited before the crash' in rd(f'0/{pid}.html') and draft() is None,"closing it saves the note and clears the draft")
    # ---- discard
    ev("openModal(notes.find(n=>n.title==='Edited before the crash'))"); s.settle()
    pg.fill('.ov .editor .t','Discard me'); s.until_draft('Discard me')
    boot()
    pg.click('.dlg [data-d=discard]'); s.settle()
    ok(draft() is None and 'Discard me' not in rd(f'0/{pid}.html') and pg.locator('.ov .editor').count()==0,"discarding drops the draft and changes nothing")
    # ---- a draft of a tab that is still open is left alone
    pg2=s.new_tab()
    pg2.goto(BASE); pg2.wait_for_function("()=>typeof loadFolder==='function'"); pg2.evaluate(API); pg2.evaluate("async()=>{ROOT=await navigator.storage.getDirectory();await __A.load()}")
    pg2.evaluate("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.title==='Edited before the crash'))}"); pg2.wait_for_selector('.ov .editor')
    pg2.fill('.ov .editor .t','Typing in the other tab'); s.until_draft('Typing in the other tab')
    ok(draft() is not None,"(the other tab has a draft)")
    pg.bring_to_front(); boot()
    ok(pg.locator('.dlg[aria-label=\"Unsaved edits\"]').count()==0 and draft() is not None,"a draft whose tab is still open is not offered")
    pg2.close(); s.settle(); remove=ev("localStorage.removeItem('keep-draft')")
    # ---- an encrypted note: the draft is plain (a stated trade-off), the prompt shows nothing, continuing needs the passphrase
    ev(f"Store.setupEncryption('{PASS}')"); s.settle()
    ev("""async()=>{const x=blank();x.title='Hidden title';x.body='secret body';x.enc=true;notes.push(x);save();await __A.flush();window.__eid=x.id}"""); s.settle()
    eid=ev("__eid")
    ev(f"openModal(notes.find(n=>n.id==='{eid}'))"); s.settle()
    pg.fill('.ov .editor .t','Hidden title edited'); s.until_draft('Hidden title edited')
    d=draft(); ok(d is not None and d['enc']==True and d['note']['title']=='Hidden title edited',"the draft of an encrypted note holds its text in plain form (documented trade-off)")
    boot()
    ok(pg.locator('.dlg[aria-label=\"Unsaved edits\"]').count()==1 and 'Hidden' not in pg.inner_text('.dlg') and 'Unlock' in pg.inner_text('.dlg'),"the prompt for an encrypted note shows nothing of it and says to unlock")
    pg.click('.dlg [data-d=go]'); s.settle()
    ok(pg.locator('.dlg[aria-label=\"Unlock encrypted notes\"]').count()==1 and pg.locator('.ov .editor').count()==0,"continuing asks for the passphrase before anything opens")
    pg.fill('#pw',PASS); pg.click('.dlg [data-c=go]'); s.settle()
    ok(pg.locator('.ov .editor').count()==1 and ev("document.querySelector('.ov .editor .t').value")=='Hidden title edited',"after unlocking, the editor opens with the unsaved edits")
    pg.click('.ov .editor [data-e=done]'); s.settle()
    pg_=rd(f'{int(eid)//100}/{eid}.html')
    ok(draft() is None and '"enc"' in pg_ and 'Hidden title edited' not in pg_,"closing writes it encrypted and clears the draft")
    # ---- closing while locked keeps the draft until the note is really saved
    ev(f"openModal(notes.find(n=>n.id==='{eid}'))"); s.settle()
    pg.fill('.ov .editor .t','Edited while locking'); s.until_draft('Edited while locking')
    ev("Store.lock()"); s.settle()     # locking writes the edits made so far (the key is still there)
    ok(ev(f"Store.isSaved(notes.find(n=>n.id==='{eid}'))")==True,"locking first writes the open note's edits while it still can")
    pg.fill('.ov .editor .t','Edited after locking'); s.until_draft('Edited after locking')
    pg.click('.ov .editor [data-e=done]'); s.settle()
    ok(draft() is not None and pg.locator('.dlg[aria-label=\"Unlock encrypted notes\"]').count()==1,"if the app locked meanwhile, the draft stays until the passphrase lets the note be saved")
    pg.fill('#pw',PASS); pg.click('.dlg [data-c=go]'); s.settle()
    ok(draft() is None and ev(f"Store.isSaved(notes.find(n=>n.id==='{eid}'))")==True,"then the note is saved and the draft goes")
finish()
