"""A note opens scrolled to its top (like Google Keep), with the cursor ready at the end, for text notes and checklists; typing then follows the cursor."""
from playwright.sync_api import sync_playwright
import sys
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':700})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      const a=blank();a.title='Many images';a.body='x';a.ts=3;a.att=[];
      for(let i=0;i<12;i++){await putBlob('P'+i,await mk(400,300,'hsl('+i*30+',60%,60%)'));a.att.push({id:'P'+i,kind:'image',name:'p'+i,w:400,h:300})}
      const b=blank();b.title='Long list';b.ts=2;b.isList=true;b.items=Array.from({length:40},(_,i)=>({t:'item '+i,d:false}));
      const c=blank();c.title='Long text';c.ts=1;c.body=Array.from({length:60},(_,i)=>'line '+i).join('\\n');
      notes=[a,b,c];commit();window.__a=a;window.__b=b;window.__c=c}""")
    pg.wait_for_timeout(800)
    info=lambda: pg.evaluate("""()=>{const s=document.querySelector('.ov .escroll'),f=document.activeElement;return {top:s.scrollTop,over:s.scrollHeight>s.clientHeight+50,focus:f?f.className:'',sel:getSelection().rangeCount>0}}""")
    close=lambda: (pg.keyboard.press('Escape'),pg.wait_for_timeout(500))
    for name,var in [('12 images','__a'),('a 40-item checklist','__b'),('60 lines of text','__c')]:
        pg.evaluate(f"openModal({var})"); pg.wait_for_timeout(800); i=info()
        ok(i['over'] and i['top']==0,f"{name}: opens at the top ({i})")
        ok(('rt' in i['focus'].split() or 'x' in i['focus'].split()) and i['sel'],f"{name}: the cursor is still ready to type")
        close()
    # typing scrolls to the cursor, as it should
    pg.evaluate("openModal(__c)"); pg.wait_for_timeout(700); pg.keyboard.type('hello'); pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelector('.ov .escroll').scrollTop")>200,"typing brings the cursor into view")
    close()
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
