"""Renaming and deleting labels from the sidebar; the replace-or-keep-both dialog when a file name is already attached; the camera dialog."""
from playwright.sync_api import sync_playwright
import sys,base64
from harness import ok,finish
PNG=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
INIT="""
window.__camMode='ok';
navigator.mediaDevices.getUserMedia=async o=>{
  if(!o.video)return{getTracks:()=>[{stop(){}}]};
  if(window.__camMode==='denied'){const e=new Error('x');e.name='NotAllowedError';throw e}
  if(window.__camMode==='none'){const e=new Error('x');e.name='NotFoundError';throw e}
  const c=document.createElement('canvas');c.width=64;c.height=48;const g=c.getContext('2d');
  const draw=()=>{g.fillStyle='#08f';g.fillRect(0,0,64,48);requestAnimationFrame(draw)};draw();
  return c.captureStream(10)};
"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script(INIT)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    ev=pg.evaluate
    # ================= labels in the sidebar =================
    ev("""()=>{const mk=(t,l)=>Object.assign(blank(),{title:t,labels:l,ts:Date.now()});
      notes=[mk('n1',['alpha']),mk('n2',['alpha','beta']),mk('n3',['beta'])];LB=['alpha','beta'];sel.clear();commit()}""")
    pg.wait_for_timeout(500)
    labels=lambda: ev("notes.map(n=>n.title+':'+n.labels.slice().sort().join('+')).join(' ')")
    ok(pg.locator('#lbls button[data-lf]').count()==2,"the sidebar lists the labels")
    pg.click('#lbls button[data-lf=alpha]'); pg.wait_for_timeout(200)
    ok(ev("[...sel]")==['alpha'],"clicking a label filters by it")
    pg.hover('#lbls .lw >> nth=0'); pg.click('#lbls [data-ledit=alpha]'); pg.wait_for_timeout(200)
    ok(pg.locator('#lbls input.le').count()==1 and ev("document.activeElement.classList.contains('le')"),"the pencil turns the label into an input, focused")
    pg.keyboard.type('gamma'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    ok(ev("LB")==['beta','gamma'] and labels()=='n1:gamma n2:beta+gamma n3:beta',f"renaming changes the list and every note using it: {labels()}")
    ok(ev("[...sel]")==['gamma'],"a selected label stays selected under its new name")
    # duplicate
    pg.hover('#lbls .lw >> nth=0'); pg.click('#lbls [data-ledit=beta]'); pg.keyboard.type('GAMMA'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    ok('already exists' in ' '.join(pg.locator('.toast').all_inner_texts()) and ev("LB")==['beta','gamma'],"a name that already exists (any case) is refused with a message")
    # escape cancels
    pg.hover('#lbls .lw >> nth=0'); pg.click('#lbls [data-ledit=beta]'); pg.keyboard.type('zzz'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok(ev("LB")==['beta','gamma'] and pg.locator('#lbls input.le').count()==0,"Escape abandons the rename")
    # clicking away commits
    pg.hover('#lbls .lw >> nth=0'); pg.click('#lbls [data-ledit=beta]'); pg.keyboard.type('delta'); pg.mouse.click(700,600); pg.wait_for_timeout(500)
    ok(ev("LB")==['delta','gamma'] and 'n3:delta' in labels(),"clicking elsewhere keeps the new name")
    # an empty name is ignored
    pg.hover('#lbls .lw >> nth=0'); pg.click('#lbls [data-ledit=delta]'); pg.keyboard.press('Control+A'); pg.keyboard.press('Delete'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok(ev("LB")==['delta','gamma'],"an empty name changes nothing")
    # delete
    pg.hover('#lbls .lw >> nth=1'); pg.click('#lbls [data-ldel=gamma]'); pg.wait_for_timeout(400)
    ok('Label “gamma” deleted from 2 notes' in ' '.join(pg.locator('.toast').all_inner_texts()) and ev("LB")==['delta'] and labels()=='n1: n2:delta n3:delta',f"deleting removes the label from the list and from the notes: {labels()}")
    ok(ev("[...sel]")==[],"and from the selection")
    # ================= replace-or-keep-both =================
    ev("""()=>{const n=blank();n.title='files';notes=[n];LB=[];sel.clear();commit();window.__n=n;openModal(n)}"""); pg.wait_for_timeout(800)
    def attach(name='a.png'): pg.set_input_files('.ov .fmed',{'name':name,'mimeType':'image/png','buffer':PNG}); pg.wait_for_timeout(500)
    names=lambda: ev("__n.att.map(a=>a.name).join()")
    attach(); ok(names()=='a.png' and pg.locator('[role=alertdialog]').count()==0,"a new name attaches without asking")
    attach(); ok(pg.locator('[role=alertdialog]').count()==1 and 'already attached' in pg.inner_text('[role=alertdialog]') and 'a 1.png' in pg.inner_text('[role=alertdialog]'),"the same name asks what to do, and says what 'keep both' would be called")
    pg.click('[data-r=rename]'); pg.wait_for_timeout(600); ok(names()=='a.png,a 1.png',"keep both adds it as 'a 1.png'")
    old=ev("__n.att[0].id"); attach(); pg.click('[data-r=replace]'); pg.wait_for_timeout(600)
    ok(names()=='a.png,a 1.png' and ev("__n.att[0].id")!=old,"replace swaps the file and keeps one entry")
    attach(); pg.click('[data-r=cancel]'); pg.wait_for_timeout(500); ok(names()=='a.png,a 1.png' and pg.locator('[role=alertdialog]').count()==0,"cancel attaches nothing")
    attach(); pg.keyboard.press('Escape'); pg.wait_for_timeout(500); ok(names()=='a.png,a 1.png' and pg.locator('[role=alertdialog]').count()==0 and pg.locator('.ov .editor').count()==1,"Escape cancels the question only, not the note")
    # ================= camera =================
    n0=ev("__n.att.length")
    pg.click('.ov [data-e=cam]'); pg.wait_for_selector('.dlg.cam [data-c=snap]:not([disabled])',timeout=8000)
    ok(pg.locator('.dlg.cam').count()==1,"the camera dialog opens and the take-photo button becomes ready")
    pg.click('.dlg.cam [data-c=snap]'); pg.wait_for_timeout(900)
    ok(pg.locator('.dlg.cam').count()==0 and ev("__n.att.length")==n0+1 and ev("__n.att[__n.att.length-1].kind")=='image' and ev("__n.att[__n.att.length-1].name").startswith('Photo '),"taking a photo attaches it as 'Photo …'")
    pg.click('.ov [data-e=cam]'); pg.wait_for_selector('.dlg.cam [data-c=snap]:not([disabled])'); pg.click('.dlg.cam [data-c=x]'); pg.wait_for_timeout(300)
    ok(pg.locator('.dlg.cam').count()==0 and ev("__n.att.length")==n0+1,"Cancel closes it with nothing attached")
    pg.click('.ov [data-e=cam]'); pg.wait_for_selector('.dlg.cam'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok(pg.locator('.dlg.cam').count()==0 and pg.locator('.ov .editor').count()==1,"Escape closes the camera only")
    for mode,text in [('denied','Camera access was blocked.'),('none','No camera was found.')]:
        ev(f"window.__camMode='{mode}'"); pg.click('.ov [data-e=cam]'); pg.wait_for_timeout(500)
        ok(text in pg.inner_text('.dlg.cam .res'),f"{mode}: the dialog explains: {text}"); pg.click('.dlg.cam [data-c=x]'); pg.wait_for_timeout(200)
    print('errors',errs); b.close()
finish()
