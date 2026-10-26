"""Touch: press-and-hold then move reorders (cards in the grid, images in the editor); a quick swipe is a scroll and reorders nothing."""
from playwright.sync_api import sync_playwright
import sys
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1200,'height':1600},has_touch=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    cdp=ctx.new_cdp_session(pg)
    def touch(t,x=0,y=0): cdp.send('Input.dispatchTouchEvent',{'type':t,'touchPoints':[] if t=='touchEnd' else [{'x':x,'y':y,'id':1,'radiusX':1,'radiusY':1}]})
    def hold_drag(frm,to,hold=500,steps=12):
        touch('touchStart',*frm); pg.wait_for_timeout(hold)
        for i in range(1,steps+1):
            touch('touchMove',frm[0]+(to[0]-frm[0])*i/steps,frm[1]+(to[1]-frm[1])*i/steps); pg.wait_for_timeout(25)
        pg.wait_for_timeout(450); mid=pg.evaluate("[document.querySelectorAll('.vgph').length,document.querySelectorAll('.gdrag').length]")
        touch('touchEnd'); pg.wait_for_timeout(600); return mid
    def swipe(frm,dy=60,steps=4):
        touch('touchStart',*frm)
        for i in range(1,steps+1): touch('touchMove',frm[0],frm[1]+dy*i/steps); pg.wait_for_timeout(15)
        pg.wait_for_timeout(150); mid=pg.evaluate("[document.querySelectorAll('.vgph').length,document.querySelectorAll('.gdrag').length]")
        touch('touchEnd'); pg.wait_for_timeout(500); return mid
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      const out=[];for(let i=0;i<12;i++){const x=blank();x.title='T'+String(i).padStart(2,'0');x.body=i%3?'line '+i:'a\\nb\\nc\\nd';x.ts=1700000000000-i*60000;x.mod=x.ts;out.push(x)}
      const g=blank();g.title='G note';g.ts=1600000000000;g.att=[];const dims=[[400,300],[300,300],[300,400],[500,300],[300,300],[400,400],[600,300]];
      for(let i=0;i<7;i++){await putBlob('G'+i,await mk(dims[i][0],dims[i][1],'hsl('+i*50+',60%,60%)'));g.att.push({id:'G'+i,kind:'image',name:'g'+i,w:dims[i][0],h:dims[i][1]})}
      out.push(g);notes=out;commit();window.__g=g}""")
    pg.wait_for_timeout(900)
    model=lambda: pg.evaluate("notes.filter(n=>n.title!=='G note').sort(byOrder).map(n=>n.title)")
    ctr=lambda sel: pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}",sel)
    cardc=lambda t: ctr('.vg>.card:has(h3:text-is("%s"))'%t) if False else pg.evaluate("t=>{const c=[...document.querySelectorAll('.vg>.card')].find(c=>c.querySelector('h3')&&c.querySelector('h3').textContent===t);const r=c.getBoundingClientRect();return [r.left+r.width/2,r.top+40]}",t)
    # ---- cards: a quick swipe is a scroll
    before=model(); mid=swipe(cardc('T05'))
    ok(mid==[0,0] and model()==before,f"quick swipe on a card does not start a drag {mid}")
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    # ---- cards: hold then move
    a=cardc('T04'); t=cardc('T01'); mid=hold_drag(a,t)
    after=model()
    ok(mid[0]==1,f"holding shows the placeholder while dragging {mid}")
    ok(after!=before and after.index('T04')<before.index('T04'),f"press-and-hold then move reorders the cards: T04 {before.index('T04')} -> {after.index('T04')}")
    ok(pg.evaluate("document.querySelectorAll('.ov').length")==0,"no note opened by the touch drag")
    # ---- images in the editor
    pg.evaluate("openModal(__g)"); pg.wait_for_timeout(700)
    ids=lambda: pg.evaluate("[...document.querySelectorAll('.ov .editor .gal .gt')].map(t=>t.dataset.id)")
    tile=lambda i: pg.evaluate("i=>{const r=document.querySelectorAll('.ov .editor .gal .gt')[i].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,r.width]}",i)
    base=ids(); ok(base==['G0','G1','G2','G3','G4','G5','G6'],"editor open with 7 images")
    mid=swipe(tile(4)[:2]); ok(mid==[0,0] and ids()==base,f"quick swipe on an image does not start a drag {mid}")
    s=tile(6); d=tile(0); mid=hold_drag(s[:2],[d[0]-d[2]*0.3,d[1]],hold=450)
    ok(mid[1]==1,f"holding shows the drag preview {mid}")
    ok(ids()==['G6']+base[:6],f"press-and-hold then move reorders images: {ids()}")
    ok(pg.evaluate("document.querySelectorAll('.ov.iv').length")==0,"no viewer opened by the touch drag")
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
