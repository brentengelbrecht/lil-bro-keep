"""Locked-app behaviour (stage 3): ciphertext cards, search and export while locked. (Header reused from t40.)\nOld:: the vault, encrypted pages and attachments, locking and unlocking, the mask, and writing while locked. (Header reused from t39.)
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
    ev("""async()=>{const x=blank();x.title='Plain note';x.body='visible plain text';x.labels=['PlainLabel'];LB.push('PlainLabel');notes.push(x);save();await __A.flush()}"""); s.settle()
    ev(f"Store.setupEncryption('{PASS}')"); s.settle()
    ev("""async()=>{const x=blank();x.title='Hidden title';x.body='needleword in a secret body';x.enc=true;x.labels=['PrivLabel'];LB.push('PrivLabel');notes.push(x);save();await __A.flush();window.__id=x.id}"""); s.settle()
    ev("Store.lock()"); s.settle()
    # ---- cards
    card=lambda: pg.evaluate("[...document.querySelectorAll('.vg>.card')].map(c=>({t:c.querySelector('h3')?.textContent||'',sealed:!!c.querySelector('h3.sealed'),ctx:c.querySelector('.ctx')?.textContent||'',aria:c.getAttribute('aria-label'),all:c.textContent}))")
    cs=card(); enc=[c for c in cs if c['sealed']]
    ok(len(enc)==1 and enc[0]['t']=='Encrypted note',"a locked encrypted note is a card titled “Encrypted note”")
    ok(len(enc[0]['ctx'])>100 and 'needleword' not in enc[0]['all'] and 'Hidden title' not in enc[0]['all'],f"it shows ciphertext, never its text ({len(enc[0]['ctx'])} characters of it)")
    ok(enc[0]['aria']=='Note: Encrypted note',f"its accessible name hides the title: {enc[0]['aria']}")
    ok(any(c['t']=='Plain note' and 'visible plain text' in c['all'] for c in cs),"unencrypted notes are shown as usual while locked")
    ok('PrivLabel' not in ev("LB") and 'PlainLabel' in ev("LB") and 'PrivLabel' not in pg.inner_text('#nav'),"the sidebar lists only labels of unencrypted notes while locked")
    # ---- unencrypted notes stay fully usable
    pid=ev("notes.find(n=>n.title==='Plain note').id")
    ev("openModal(notes.find(n=>n.title==='Plain note'))"); s.settle()
    ok(pg.locator('.dlg[aria-label=\"Unlock encrypted notes\"]').count()==0 and pg.locator('.ov .editor').count()==1,"an unencrypted note opens without a passphrase")
    pg.fill('.ov .editor .t','Plain note edited'); pg.click('.ov .editor [data-e=done]'); s.settle()
    ok('Plain note edited' in rd(f'{int(pid)//100}/{pid}.html'),"and can be edited and saved while the app is locked")
    # ---- search while locked
    pg.fill('#q','needleword'); s.settle()
    ok('Encrypted notes aren’t included while locked. Unlock to search them.' in pg.inner_text('#srchbar') and 'No matching notes found' in pg.inner_text('#out'),"a search while locked says encrypted notes are not included, and finds nothing")
    pg.fill('#q','visible plain'); s.settle()
    ok(pg.locator('.vg>.card').count()==1 and pg.locator('#srchbar').count()==1,"a search finds unencrypted notes while locked, with the message above the results")
    pg.fill('#q','needleword'); s.settle()
    pg.click('#srchbar [data-act=unlock]'); s.settle()
    ok(pg.locator('.dlg[aria-label=\"Unlock encrypted notes\"]').count()==1,"the message has an Unlock button")
    pg.fill('#pw',PASS); pg.click('.dlg [data-c=go]'); s.settle()
    ok(ev("Store.crypto.unlocked")==True and pg.locator('#srchbar').count()==0,"unlocking removes the message")
    shown=pg.evaluate("[...document.querySelectorAll('.vg>.card h3')].map(h=>h.textContent)")
    ok(shown==['Hidden title'],f"and the search restarts and now finds the encrypted note: {shown}")
    pg.fill('#q',''); s.settle()
    # ---- export while locked leaves encrypted notes out
    ev("Store.lock()"); s.settle()
    msg=ev("""async()=>{window.showSaveFilePicker=undefined;const out=document.createElement('div');await saveExport(visible(),out);return out.textContent}""")
    ok('1 encrypted note was left out because the app is locked' in msg and 'Downloaded 1 note' in msg,f"exporting while locked leaves encrypted notes out and says so: {msg[:120]}")
finish()
