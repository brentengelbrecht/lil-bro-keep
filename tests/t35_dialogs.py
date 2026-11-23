"""Every dialog: announced as a dialog, the page behind is inert, focus goes in and stays in, Escape closes the top one only, focus comes back."""
from playwright.sync_api import sync_playwright
import sys,base64
from harness import ok,finish
PNG=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
INIT="""navigator.mediaDevices.getUserMedia=async o=>{const c=document.createElement('canvas');c.width=64;c.height=48;const g=c.getContext('2d');const d=()=>{g.fillStyle='#08f';g.fillRect(0,0,64,48);requestAnimationFrame(d)};d();return c.captureStream(10)};"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script(INIT)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(700)
    ev=pg.evaluate
    inert=lambda: ev("[document.querySelector('header').inert,document.querySelector('.wrap').inert]")
    inside=lambda sel: ev("s=>{const d=document.querySelector(s);return !!d&&d.contains(document.activeElement)}",sel)
    # ================= the three page dialogs =================
    for name,btn,label in [('Settings','#setbtn','Settings'),('Import','#impbtn','Import from Google Takeout'),('Export','#expbtn','Export notes')]:
        pg.focus(btn); pg.click(btn); pg.wait_for_timeout(300)
        ok(ev("l=>{const d=document.querySelector('.dlg');return d.getAttribute('role')==='dialog'&&d.getAttribute('aria-modal')==='true'&&d.getAttribute('aria-label')===l}",label),f"{name}: announced as a dialog with its name")
        ok(inert()==[True,True],f"{name}: the page behind is inert")
        ok(inside('.dlg'),f"{name}: focus is inside it")
        stay=True
        for _ in range(14):
            pg.keyboard.press('Tab')
            if not inside('.dlg'): stay=False
        for _ in range(14):
            pg.keyboard.press('Shift+Tab')
            if not inside('.dlg'): stay=False
        ok(stay,f"{name}: Tab and Shift+Tab never leave it")
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        ok(pg.locator('.dlg').count()==0 and inert()==[False,False],f"{name}: Escape closes it and the page is usable again")
        ok(ev("document.activeElement.id")==btn[1:],f"{name}: focus goes back to the button that opened it")
    pg.click('#impbtn'); pg.wait_for_timeout(200); pg.mouse.click(30,450); pg.wait_for_timeout(200)
    ok(pg.locator('.dlg').count()==0,"pressing outside the panel closes a page dialog")
    # ================= the editor, the viewer over it, the question over it =================
    ev("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      const n=blank();n.title='Dlg note';n.body='x';n.att=[];
      for(let i=0;i<2;i++){await putBlob('D'+i,await mk(40,30,'#a55'));n.att.push({id:'D'+i,kind:'image',name:'d'+i+'.png',w:40,h:30})}
      notes=[n];commit();window.__n=n}""")
    pg.wait_for_timeout(600)
    pg.focus('.vg>.card'); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    ok(ev("(()=>{const e=document.querySelector('.ov .editor');return e.getAttribute('role')==='dialog'&&e.getAttribute('aria-modal')==='true'&&e.getAttribute('aria-label')==='Edit note'})()"),"the note editor is announced as a dialog")
    ok(inert()==[True,True],"the page behind the editor is inert")
    stay=True
    for _ in range(40):
        pg.keyboard.press('Tab')
        if not inside('.ov .editor'): stay=False
    ok(stay,"Tab cycles inside the editor and never reaches the page behind")
    # viewer over the editor
    pg.click('.ov .editor .gal .gt >> nth=0'); pg.wait_for_timeout(500)
    ok(pg.locator('.ov.iv').count()==1 and ev("document.querySelector('.ov.iv').getAttribute('role')")=='dialog' and inside('.ov.iv'),"the image viewer is a dialog and takes focus")
    ok(ev("document.querySelector('.ov:not(.iv)').inert")==True,"the editor is inert while the viewer is open")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok(pg.locator('.ov.iv').count()==0 and pg.locator('.ov .editor').count()==1 and ev("document.querySelector('.ov').inert")==False,"Escape closes the viewer only, the editor is usable again")
    ok(ev("document.activeElement.classList.contains('gt')"),"focus returns to the image that was opened")
    # the replace question over the editor
    pg.set_input_files('.ov .fmed',{'name':'d0.png','mimeType':'image/png','buffer':PNG}); pg.wait_for_timeout(600)
    ok(pg.locator('[role=alertdialog]').count()==1 and inside('[role=alertdialog]'),"the replace question is an alert dialog and takes focus")
    ok(ev("document.querySelector('.ov:not(:has([role=alertdialog]))').inert")==True,"the editor is inert behind it")
    pg.keyboard.press('Tab'); pg.keyboard.press('Tab'); pg.keyboard.press('Tab'); pg.keyboard.press('Tab')
    ok(inside('[role=alertdialog]'),"Tab stays inside the question")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    ok(pg.locator('[role=alertdialog]').count()==0 and pg.locator('.ov .editor').count()==1,"Escape answers 'cancel' and leaves the editor open")
    # camera over the editor
    pg.click('.ov [data-e=cam]'); pg.wait_for_selector('.dlg.cam [data-c=snap]:not([disabled])',timeout=8000)
    ok(ev("document.activeElement.dataset.c")=='snap' and ev("document.querySelector('.dlg.cam').getAttribute('aria-modal')")=='true',"the camera dialog focuses its Take photo button")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok(pg.locator('.dlg.cam').count()==0 and pg.locator('.ov .editor').count()==1,"Escape closes the camera only")
    # popover first, then the editor
    pg.click('.ov [data-e=color]'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(ev("document.querySelector('.ov .pal').hidden")==True and pg.locator('.ov .editor').count()==1,"Escape closes an open colour picker before the editor")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(700)
    ok(pg.locator('.ov').count()==0 and inert()==[False,False],"the next Escape closes the editor and frees the page")
    ok(ev("document.activeElement.classList.contains('card')"),"focus is back on the note's card")
    # outside click on the editor
    pg.keyboard.press('Enter'); pg.wait_for_timeout(600); pg.mouse.click(20,450); pg.wait_for_timeout(700)
    ok(pg.locator('.ov').count()==0,"pressing outside the editor closes it")
    print('errors',errs); b.close()
finish()
