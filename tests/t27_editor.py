"""The note editor, feature by feature (characterisation test: it describes how the editor behaves today)."""
from playwright.sync_api import sync_playwright
import sys
from harness import ok,finish
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
INIT="""
window.__opened=[];window.open=(u)=>{window.__opened.push(u);return null};
navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){}}]});
window.MediaRecorder=class{constructor(){this.mimeType='audio/webm'}start(){}stop(){setTimeout(()=>{this.ondataavailable&&this.ondataavailable({data:new Blob(['abc'],{type:'audio/webm'})});this.onstop&&this.onstop()},10)}};
"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':1000})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.add_init_script(INIT)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    ev=lambda js,*a: pg.evaluate(js,*a)
    def fresh(**kw):
        ev("""(o)=>{const n=blank();Object.assign(n,o);notes=[n];LB=['work'];commit();window.__n=n;openModal(n)}""",kw); pg.wait_for_timeout(700)
    def done(): pg.click('.ov [data-e=done]'); pg.wait_for_timeout(500)
    body=lambda: ev("__n.body"); html=lambda: ev("__n.html")
    # ---------- typing and saving ----------
    fresh()
    pg.click('.ov .t'); pg.keyboard.type('My title'); pg.click('.ov .rt'); pg.keyboard.type('hello world')
    ok(ev("__n.title")=='My title' and body()=='hello world',"typing updates title and body as you go")
    done(); ok(pg.locator('.ov').count()==0 and ev("notes.includes(__n)"),"Done closes the note and keeps it")
    ok(ev("JSON.parse(localStorage.getItem('keep-notes')).some(n=>n.title==='My title')"),"it is saved")
    # ---------- formatting, undo, redo, clear ----------
    fresh(); pg.click('.ov .rt'); pg.keyboard.type('bold me'); pg.keyboard.press('Control+A')
    ok(ev("document.querySelector('.ov [data-e=undo]').disabled"),"undo starts disabled")
    pg.click('.ov [data-e=fb]'); pg.wait_for_timeout(150)
    ok(('<b>' in html() or '<strong>' in html()) and ev("document.querySelector('.ov [data-e=fb]').classList.contains('on')"),"Bold wraps the selection and the button shows it is on")
    ok(not ev("document.querySelector('.ov [data-e=undo]').disabled"),"undo is now available")
    pg.click('.ov [data-e=undo]'); pg.wait_for_timeout(150); ok('<b>' not in html() and 'bold me' in body(),"Undo removes the bold")
    pg.click('.ov [data-e=redo]'); pg.wait_for_timeout(150); ok('<b>' in html() or '<strong>' in html(),"Redo puts it back")
    pg.click('.ov [data-e=fi]'); pg.click('.ov [data-e=fu]'); pg.wait_for_timeout(150)
    ok(('<i>' in html() or '<em>' in html()) and '<u>' in html(),"Italic and underline apply too")
    pg.click('.ov [data-e=fc]'); pg.wait_for_timeout(150); ok(not any(t in html() for t in ('<b>','<i>','<u>','<strong>','<em>')) and body()=='bold me',"Clear formatting strips them and keeps the text")
    pg.click('.ov .t'); ok(ev("document.querySelector('.ov [data-e=fb]').disabled"),"formatting buttons are disabled while the cursor is in the title")
    done()
    # ---------- auto-links, clicking a link, paste ----------
    fresh(); pg.click('.ov .rt'); pg.keyboard.type('see https://example.com now')
    ok(ev("!!document.querySelector('.ov .rt a[href=\"https://example.com/\"], .ov .rt a[href=\"https://example.com\"]')"),"a typed web address becomes a link when you press space")
    pg.click('.ov .rt a'); ok(ev("window.__opened.length")==1 and 'example.com' in ev("window.__opened[0]"),"clicking a link in the note opens it in a new tab")
    ev("""()=>{const r=document.querySelector('.ov .rt');r.focus();caretEnd(r);const dt=new DataTransfer();dt.setData('text/plain','pasted https://b.org text');r.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))}""")
    pg.wait_for_timeout(200); ok('pasted https://b.org text' in body() and ev("document.querySelectorAll('.ov .rt a').length")==2,"pasting inserts plain text and links addresses in it")
    done()
    # ---------- list continuation in text ----------
    fresh(); pg.click('.ov .rt'); pg.keyboard.type('1. one'); pg.keyboard.press('Enter'); pg.keyboard.type('two'); pg.keyboard.press('Enter')
    ok(body().startswith('1. one\n2. two\n3.'),f"Enter after '1. one' starts '2.' and keeps counting: {body()!r}")
    pg.keyboard.press('Enter'); ok('3.' not in body(),"Enter on an empty item ends the list")
    done()
    # ---------- checklist conversion ----------
    fresh(body='alpha\nbeta\ngamma')
    pg.click('.ov [data-e=list]'); pg.wait_for_timeout(200)
    ok(ev("__n.isList")==True and ev("__n.items.map(i=>i.t).join()")=='alpha,beta,gamma' and ev("document.querySelectorAll('.ov .li').length")==3,"text lines become checklist items")
    pg.click('.ov .li >> nth=1 >> [data-e=tick]'); ok(ev("__n.items[1].d")==True and ev("document.querySelectorAll('.ov .li.d').length")==1,"ticking an item marks it done")
    pg.click('.ov .x >> nth=0'); pg.keyboard.press('End'); pg.keyboard.press('Enter'); pg.keyboard.type('inserted')
    ok(ev("__n.items.map(i=>i.t).join()")=='alpha,inserted,beta,gamma',"Enter in an item adds a new item after it")
    pg.click('.ov .li >> nth=1 >> [data-e=rm]'); ok(ev("__n.items.length")==3,"the remove button deletes an item")
    pg.click('.ov [data-e=add]'); ok(ev("__n.items.length")==4,"Add item appends one")
    pg.click('.ov [data-e=list]'); pg.wait_for_timeout(200); ok(ev("__n.isList")==False and body()=='alpha\nbeta\ngamma\n',f"converting back gives the items as lines of text: {body()!r}")
    done()
    # ---------- colour, pin ----------
    fresh(); pg.click('.ov [data-e=color]'); ok(ev("!document.querySelector('.ov .pal').hidden"),"the palette opens")
    pg.click('.ov [data-e=col][data-i="4"]'); pg.wait_for_timeout(150); ok(ev("__n.color")==4 and 'k4' in ev("document.querySelector('.ov .editor').style.getPropertyValue('--c')"),"choosing a colour recolours the note")
    pg.click('.ov [data-e=pin]'); pg.wait_for_timeout(150); ok(ev("__n.pinned")==False,"an outside click on an open palette only closes it (the pin is not toggled)")
    pg.click('.ov [data-e=pin]'); pg.wait_for_timeout(150); ok(ev("__n.pinned")==True and ev("document.querySelector('.ov .pin').classList.contains('on')"),"Pin toggles on")
    done()
    # ---------- labels ----------
    fresh(); pg.click('.ov [data-e=lbl]'); ok(ev("!document.querySelector('.ov .lpop').hidden"),"the label picker opens")
    pg.keyboard.type('fresh'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    ok(ev("LB.includes('fresh')")and ev("__n.labels.includes('fresh')") and ev("document.querySelectorAll('.ov .chip').length")==1,"typing a name and pressing Enter creates and applies a label")
    pg.click('.ov [data-e=lt][data-l=work]'); ok(ev("__n.labels.slice().sort().join()")=='fresh,work',"clicking an existing label applies it")
    pg.click('.ov [data-e=lt][data-l=work]'); ok(ev("__n.labels.join()")=='fresh',"clicking it again removes it")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100); pg.hover('.ov .chip'); pg.click('.ov [data-e=rmlbl][data-l=fresh]'); ok(ev("__n.labels.length")==0 and ev("document.querySelectorAll('.ov .chip').length")==0,"the chip's x removes a label")
    done()
    # ---------- attachments and links ----------
    import base64,os,tempfile
    d=tempfile.mkdtemp(); png=os.path.join(d,'dot.png'); open(png,'wb').write(base64.b64decode(PNG)); txt=os.path.join(d,'note.txt'); open(txt,'w').write('x')
    fresh(); pg.set_input_files('.ov .fmed',png); pg.wait_for_timeout(700)
    ok(ev("__n.att.length")==1 and ev("__n.att[0].kind")=='image' and ev("__n.att[0].w")==1 and ev("document.querySelectorAll('.ov .gal .gt').length")==1,"choosing an image attaches it and shows it in the gallery")
    pg.set_input_files('.ov .fmed',txt); pg.wait_for_timeout(400); ok('isn’t an image' in pg.inner_text('.ov .emsg') and ev("__n.att.length")==1,"a non-media file is refused with a message")
    pg.hover('.ov .gal .gt'); pg.click('.ov .gal .gt >> [data-e=ratt]'); pg.wait_for_timeout(300); ok(ev("__n.att.length")==0 and ev("document.querySelectorAll('.ov .gal').length")==0,"deleting the attachment removes it")
    ev("""()=>{const dt=new DataTransfer();dt.setData('text/uri-list','https://example.org/page');document.querySelector('.ov .editor').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))}""")
    pg.wait_for_timeout(200); ok(ev("!!document.querySelector('.ov .rt a[href^=\"https://example.org\"]')") and 'example.org' in body(),"dropping a web address adds it to the note text as a link")
    ev("""()=>{const e=document.querySelector('.ov .editor'),dt=new DataTransfer();dt.items.add(new File(['x'],'a.png',{type:'image/png'}));e.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}))}""")
    ok(ev("document.querySelector('.ov .editor').classList.contains('drop')"),"dragging a file over the note highlights it")
    done()
    # ---------- voice recording ----------
    fresh(); pg.click('.ov [data-e=arec]'); pg.wait_for_timeout(300)
    ok(ev("!document.querySelector('.ov .rec').hidden") and 'Stop' in pg.inner_text('.ov .rec'),"Record shows the recording bar")
    pg.click('.ov [data-e=rstop]'); pg.wait_for_timeout(800)
    ok(ev("__n.att.length")==1 and ev("__n.att[0].kind")=='audio' and ev("document.querySelector('.ov .rec').hidden") and ev("document.querySelectorAll('.ov .em.au').length")==1,"Stop saves the recording as an audio attachment")
    pg.click('.ov [data-e=arec]'); pg.wait_for_timeout(200); pg.click('.ov [data-e=rcancel]'); pg.wait_for_timeout(500)
    ok(ev("__n.att.length")==1,"Cancel throws a recording away")
    pg.click('.ov [data-e=arec]'); pg.wait_for_timeout(200); done(); pg.wait_for_timeout(400); ok(ev("__n.att.length")==2,"closing the note while recording saves the recording")
    # recording must never touch the note text (it once replaced it with the timer)
    fresh(body='my precious text',html='my precious text'); pg.click('.ov [data-e=arec]'); pg.wait_for_timeout(1300)
    ok(ev("document.querySelector('.ov .rt').textContent")=='my precious text' and 'rtime' in ev("document.querySelector('.ov .rec').innerHTML"),"while recording, the note text is untouched and the timer is in the recording bar")
    ok(ev("/^\\d+:\\d\\d$/.test(document.querySelector('.ov .rec .rtime').textContent)") and ev("document.querySelector('.ov .rec .rtime').textContent")!='0:00',"the timer counts up")
    pg.click('.ov [data-e=rstop]'); pg.wait_for_timeout(800)
    ok(body()=='my precious text' and ev("__n.att.length")==1,f"after Stop the text is still there and the recording is attached: {body()!r}")
    done()
    # ---------- closing paths ----------
    fresh(); pg.click('.ov .rt'); pg.keyboard.type('trash me'); pg.click('.ov [data-e=trash]'); pg.wait_for_timeout(500)
    ok(ev("__n.trashed")==True and pg.locator('.ov').count()==0,"the trash button trashes and closes")
    fresh(); pg.click('.ov .rt'); pg.keyboard.type('esc'); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    ok(pg.locator('.ov').count()==0 and ev("__n.body")=='esc',"Escape closes and keeps the change")
    fresh(); pg.click('.ov [data-e=color]'); pg.keyboard.press('Escape'); ok(ev("document.querySelector('.ov .pal').hidden") and pg.locator('.ov').count()==1,"Escape closes an open palette first, not the note")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    fresh(); pg.mouse.click(30,500); pg.wait_for_timeout(500); ok(pg.locator('.ov').count()==0 and ev("notes.length")==0,"clicking outside closes it, and an empty note is discarded")
    # ---------- the inline composer ----------
    ev("notes=[];commit()"); pg.wait_for_timeout(300)
    pg.click('#composer [data-c=note]'); pg.wait_for_timeout(300); ok(pg.locator('#composer .editor').count()==1,"the composer opens an editor inline")
    pg.keyboard.type('quick thought'); pg.click('#composer [data-e=done]'); pg.wait_for_timeout(500)
    ok(ev("notes.length")==1 and ev("notes[0].body")=='quick thought' and pg.locator('#composer .editor').count()==0,"Done adds the new note at the top")
    pg.click('#composer [data-c=list]'); pg.wait_for_timeout(300); ok(ev("document.querySelectorAll('#composer .li').length")==1,"the list button starts a checklist")
    pg.click('#composer [data-e=done]'); pg.wait_for_timeout(500); ok(ev("notes.length")==1,"an empty new list is not kept")
    print('errors',errs); b.close()
finish()
