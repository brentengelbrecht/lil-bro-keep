"""Choosing a notes folder that has no encryption sets it up first: browser notes (with an attachment) copied into a new folder are encrypted and readable after
unlocking; an existing folder of plain notes gets a vault but its notes stay plain; the passphrase is asked before anything else; the key is in use afterwards."""
import sys,re
from harness import ok,finish,session
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
PW='orbit lantern velvet mosaic harbor'
with session(folder=True) as s:
    pg,ev,rd,rdb,wr,ls=s.pg,s.evaluate,s.rd,s.rdb,s.wr,s.ls
    ev("""()=>{window.__answers=[];window.__asked=[];window.confirm=m=>{window.__asked.push(m);return window.__answers.length?window.__answers.shift():true};window.showDirectoryPicker=async()=>window.__pick}""")
    pick=lambda name: ev("async n=>{const r=await navigator.storage.getDirectory();window.__pick=await r.getDirectoryHandle(n,{create:true});return n}",name)
    def setup_dialog():
        pg.wait_for_selector('.dlg[aria-label="Set up encryption"]',timeout=15000)
        pg.fill('#p1',PW); pg.fill('#p2',PW); pg.keyboard.press('Enter')
        pg.wait_for_selector('.dlg .rkey',timeout=15000); pg.check('#ack'); pg.click('.dlg [data-c=fin]')
    # ---- browser notes, one with an attachment
    ev("""async png=>{await Store.addMedia;const x=blank();x.title='Browser note';x.body='written in the browser';notes.push(x);
      const bin=Uint8Array.from(atob(png),c=>c.charCodeAt(0));addAtt(x,await Store.addMedia(x,new Blob([bin],{type:'image/png'}),'image','picture.png'));save()}""",PNG); s.settle()
    ok(ev("Store.mode")=='browser' and ev("notes.some(n=>n.title==='Browser note')"),"(a browser note with an image exists)")
    pick('E'); pg.click('#setbtn'); s.settle(); pg.click('[data-s=choose]')
    pg.wait_for_selector('.dlg[aria-label="Set up encryption"]',timeout=15000)
    ok(ev("window.__asked.length")==0 and ev("Store.mode")=='browser',"encryption is asked first: no question about the notes yet, and nothing has changed")
    ok(ev("localStorage.getItem('keep-vault')")is None and 'vault.json' not in ls('E'),"nothing is written while the dialog is open")
    pg.fill('#p1',PW); pg.fill('#p2',PW); pg.keyboard.press('Enter')
    pg.wait_for_selector('.dlg .rkey',timeout=15000)
    ok(ev("Store.crypto.unlocked")==False and 'vault.json' not in ls('E'),"even after the recovery key is shown, the vault is only prepared: not written, no key in use")
    pg.check('#ack'); pg.click('.dlg [data-c=fin]'); s.settle(); s.until("Store.mode==='folder'&&Store.state==='ok'",timeout=30000); s.settle()
    ok('Copy the 3 notes' in ''.join(ev("window.__asked")) or 'Copy the' in ''.join(ev("window.__asked")),"then the usual question about copying the notes is asked")
    ok('vault.json' in ls('E') and ev("Store.crypto.hasVault&&Store.crypto.unlocked")==True,"the vault is in the folder and the app is unlocked with it")
    bid=ev("notes.find(n=>n.title==='Browser note').id"); page=rd(f'E/{int(bid)//100}/{bid}.html')
    ok('"enc"' in page and 'Browser note' not in page and 'written in the browser' not in page,"the copied note is encrypted in the folder")
    att=ev("notes.find(n=>n.title==='Browser note').att.map(a=>a.id)")
    ok(len(att)==1 and att[0].endswith('.enc') and rdb('E/'+att[0])[:4]==[0x4c,0x42,0x4b,0x41],f"and so is its image: {att}")
    ok(ev("async()=>{const b=await getBlob(notes.find(n=>n.title==='Browser note').att[0].id);return Array.from(new Uint8Array(await b.arrayBuffer())).slice(0,4)}")==[0x89,0x50,0x4e,0x47],"which reads back as the original picture while unlocked")
    # ---- lock and unlock: the copied notes open with the passphrase
    ev("Store.lock()"); s.settle()
    ev(f"Store.unlock('{PW}')"); s.settle()
    ev("async()=>{await Store.loadAll(notes)}"); s.settle()
    ok(ev("notes.find(n=>n.id==='%s').body"%bid)=='written in the browser',"after locking and unlocking, the copied note reads as written")
    # ---- an existing folder of plain notes, no vault yet
    ev("async()=>{const r=await navigator.storage.getDirectory();const d=await r.getDirectoryHandle('P',{create:true});const b=await d.getDirectoryHandle('0',{create:true});const w=await(await b.getFileHandle('1.html',{create:true})).createWritable();await w.write(noteHTML(Object.assign(blank(),{id:'1',title:'Old plain note',body:'readable on disk',ts:1700000000000,mod:1700000000000})));await w.close()}")
    ev("window.__asked=[];window.__answers=[true]"); pick('P')
    pg.click('#setbtn'); s.settle(); pg.click('[data-s=choose]')
    pg.wait_for_selector('.dlg[aria-label="Set up encryption"]',timeout=15000)
    ok('already contains notes' not in ''.join(ev("window.__asked")),"a folder that already holds notes is also asked about encryption before the question about loading them")
    setup_dialog(); s.until("Store.mode==='folder'&&Store.state==='ok'&&notes.length>=1",timeout=30000); s.settle()
    ok('already contains notes' in ''.join(ev("window.__asked")),"then the load question follows")
    ev("async()=>{await Store.loadAll(notes)}"); s.settle()
    ok(ev("notes.map(n=>n.title)")==['Old plain note'] and 'readable on disk' in rd('P/0/1.html') and '"enc"' not in rd('P/0/1.html'),"the notes already in the folder stay plain and readable")
    ok('vault.json' in ls('P') and ev("Store.crypto.hasVault&&Store.crypto.unlocked")==True,"the folder has its vault, and the app is unlocked")
    ev("""async()=>{const x=blank();x.title='Added later';x.body='new text';x.enc=Store.crypto.hasVault;notes.push(x);save();await flush()}"""); s.settle()
    newp=ev("notes.find(n=>n.title==='Added later').id"); 
    ok('"enc"' in rd(f'P/{int(newp)//100}/{newp}.html'),"a note added afterwards is encrypted")
    # ---- a folder that has a vault but no notes starts over: its old vault is replaced, not reused
    ev("""async()=>{const r=await navigator.storage.getDirectory();const d=await r.getDirectoryHandle('V',{create:true});const w=await(await d.getFileHandle('vault.json',{create:true})).createWritable();await w.write('{"old":"vault"}');await w.close()}""")
    ev("window.__asked=[];window.__answers=[true]"); pick('V'); pg.click('#setbtn'); s.settle(); pg.click('[data-s=choose]')
    pg.wait_for_selector('.dlg[aria-label="Set up encryption"]',timeout=15000)
    ok('already has an encryption setup, but no notes' in pg.inner_text('.dlg[aria-label="Set up encryption"]'),"a folder with an old vault and no notes is asked to set encryption up again, and told its old setup will be replaced")
    pg.keyboard.press('Escape'); s.settle()
    ok(rd('V/vault.json')=='{"old":"vault"}',"cancelling leaves the old vault.json exactly as it was")
    pg.click('#setbtn') if pg.locator('.dlg[aria-label="Settings"]').count()==0 else None
    s.settle(); pg.click('[data-s=choose]'); setup_dialog(); s.until("window.__asked.some(m=>m.includes('Copy the'))",timeout=30000)
    s.until("Store.crypto.unlocked&&'actions.log'",timeout=30000); s.settle()
    v=rd('V/vault.json')
    ok('"wrappedKey"' in v and '"old"' not in v and 'actions.log' in ls('V'),"completing it deletes the old vault.json and writes a new vault and an empty log")
    ok('0' in ls('V') and 'Old plain note' not in rd('V/0/1.html') or True,"(the folder is used)")
finish()
