"""Image reordering in the note editor: mouse drag, press-and-hold, cancel paths, keyboard, buttons, and that a click still opens the viewer."""
from playwright.sync_api import sync_playwright
import sys
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':1600})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      const dims=[[400,300],[300,300],[300,400],[500,300],[300,300],[400,400],[600,300]];
      const n=blank();n.title='G note';n.body='x';n.att=[];
      for(let i=0;i<7;i++){await putBlob('G'+i,await mk(dims[i][0],dims[i][1],'hsl('+i*50+',60%,60%)'));n.att.push({id:'G'+i,kind:'image',name:'g'+i+'.png',w:dims[i][0],h:dims[i][1]})}
      notes=[n];commit();window.__n=n;openModal(n)}""")
    pg.wait_for_timeout(800)
    ids=lambda: pg.evaluate("[...document.querySelectorAll('.ov .editor .gal .gt')].map(t=>t.dataset.id)")
    stored=lambda: pg.evaluate("__n.att.map(a=>a.id)")
    box=lambda i: pg.evaluate("i=>{const r=document.querySelectorAll('.ov .editor .gal .gt')[i].getBoundingClientRect();return [r.left,r.top,r.width,r.height]}",i)
    cnt=lambda s: pg.evaluate("s=>document.querySelectorAll(s).length",s)
    rows=lambda: pg.evaluate("[...document.querySelectorAll('.ov .editor .gal .grow')].map(r=>r.children.length)")
    base=['G0','G1','G2','G3','G4','G5','G6']
    ok(ids()==base and rows()==[1,3,3],f"editor shows 7 images as 1+3+3: {rows()}")
    def start_drag(i,dx=12):
        x,y,w,h=box(i); pg.mouse.move(x+w/2,y+h/2); pg.mouse.down(); pg.mouse.move(x+w/2+dx,y+h/2+6,steps=3)
    # ---- 1. drag the last onto the left half of the first
    start_drag(6); X,Y,W,H=box(0); pg.mouse.move(X+W*0.2,Y+H/2,steps=8); pg.wait_for_timeout(100)
    ok(cnt('.gdrag')==1 and cnt('.gins')==1 and cnt('.gt.dragging')==1,"preview, drop indicator and dimmed origin while dragging")
    ok(rows()==[1,3,3],"gallery does not reflow while dragging")
    pg.mouse.up(); pg.wait_for_timeout(300)
    exp=['G6','G0','G1','G2','G3','G4','G5']
    ok(ids()==exp and stored()==exp,f"A6 onto left half of A0 -> {ids()}")
    ok(cnt('.gdrag')==0 and cnt('.gins')==0 and cnt('.ov.iv')==0,"preview and indicator gone; no viewer opened by the drag")
    # ---- 2. first onto the right half of the fourth
    start_drag(0); X,Y,W,H=box(3); pg.mouse.move(X+W*0.85,Y+H/2,steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    e=exp[:]; s=e.pop(0); k=e.index(exp[3]); e.insert(k+1,s)
    ok(ids()==e,f"drop on right half -> {ids()} (expected {e})")
    cur=ids()
    # ---- 3. Escape cancels
    start_drag(2); X,Y,W,H=box(5); pg.mouse.move(X+W/2,Y+H/2,steps=6); pg.keyboard.press('Escape'); pg.mouse.up(); pg.wait_for_timeout(300)
    ok(ids()==cur and cnt('.gdrag')==0 and cnt('.ov .editor')==1,"Escape cancels the drag and keeps the note open")
    # ---- 4. release outside the gallery cancels
    start_drag(2); gb=pg.evaluate("(()=>{const r=document.querySelector('.ov .editor .gal').getBoundingClientRect();return [r.right,r.top]})()")
    pg.mouse.move(gb[0]+60,gb[1]-30,steps=8); ok(cnt('.gins')==0,"no indicator outside the gallery"); pg.mouse.up(); pg.wait_for_timeout(300)
    ok(ids()==cur,"release outside the gallery cancels")
    # ---- 5. press and hold (no movement) also starts a drag with the mouse, releasing in place changes nothing
    x,y,w,h=box(4); pg.mouse.move(x+w/2,y+h/2); pg.mouse.down(); pg.wait_for_timeout(500)
    ok(cnt('.gdrag')==1,"press-and-hold starts a drag even without movement")
    pg.mouse.up(); pg.wait_for_timeout(300); ok(ids()==cur and cnt('.ov.iv')==0,"released in place: nothing moves, no viewer")
    # ---- 6. a plain click opens the viewer
    x,y,w,h=box(1); pg.mouse.click(x+w/2,y+h/2); pg.wait_for_timeout(500)
    ok(cnt('.ov.iv')==1,"a quick click opens the image viewer"); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok(cnt('.ov.iv')==0 and cnt('.ov .editor')==1,"Escape closes only the viewer")
    # ---- 7. keyboard and buttons
    pg.focus('.ov .editor .gal .gt >> nth=0'); pg.keyboard.press('Alt+ArrowRight'); pg.wait_for_timeout(200)
    e=cur[:]; e[0],e[1]=e[1],e[0]; ok(ids()==e,"Alt+Right moves the focused image later")
    pg.hover('.ov .editor .gal .gt >> nth=2'); pg.click('.ov .editor .gal .gt >> nth=2 >> [data-g=mv][data-d="-1"]'); pg.wait_for_timeout(200)
    e2=e[:]; e2[1],e2[2]=e2[2],e2[1]; ok(ids()==e2,"the 'move earlier' button works")
    ok(stored()==ids(),"stored order matches")
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
