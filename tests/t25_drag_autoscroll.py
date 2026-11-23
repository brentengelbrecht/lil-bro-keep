"""Dragging near the top or bottom edge scrolls: the page for cards, the note for images in the editor."""
from playwright.sync_api import sync_playwright
import sys
from harness import ok,finish
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':700})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      const out=[];for(let i=0;i<60;i++){const x=blank();x.title='T'+String(i).padStart(2,'0');x.body='line\\nline\\nline';x.ts=1700000000000-i*60000;x.mod=x.ts;out.push(x)}
      const g=blank();g.title='G note';g.ts=1600000000000;g.att=[];
      for(let i=0;i<15;i++){await putBlob('A'+i,await mk(400,300,'hsl('+i*24+',60%,60%)'));g.att.push({id:'A'+i,kind:'image',name:'a'+i,w:400,h:300})}
      out.push(g);notes=out;commit();window.__g=g}""")
    pg.wait_for_timeout(900)
    # ---- cards: drag toward the bottom edge, the page scrolls
    c=pg.evaluate("(()=>{const r=document.querySelector('.vg>.card').getBoundingClientRect();return [r.left+r.width/2,r.top+30]})()")
    pg.mouse.move(*c); pg.mouse.down(); pg.mouse.move(c[0]+12,c[1]+12,steps=3); pg.mouse.move(c[0]+12,690,steps=6)
    y0=pg.evaluate("scrollY"); pg.wait_for_timeout(900); y1=pg.evaluate("scrollY")
    ok(y1>y0+100,f"dragging a card to the bottom edge scrolls the page ({y0} -> {y1})")
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")<40,"cards stay bounded while auto-scrolling")
    pg.keyboard.press('Escape'); pg.mouse.up(); pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelectorAll('.vgph').length")==0,"Escape ends it")
    # ---- images: drag toward the bottom edge of the editor, the note scrolls
    pg.evaluate("window.scrollTo(0,0);openModal(__g)"); pg.wait_for_timeout(900)
    ok(pg.evaluate("document.querySelector('.ov .escroll').scrollTop")==0,"a note with 15 images opens at its top")
    info=pg.evaluate("""()=>{const sc=document.querySelector('.ov .escroll'),r=sc.getBoundingClientRect();return {over:sc.scrollHeight>sc.clientHeight+50,bottom:r.bottom,left:r.left+r.width/2,top:r.top}}""")
    ok(info['over'],"editor with 15 images overflows, so it scrolls")
    t=pg.evaluate("(()=>{const r=document.querySelector('.ov .editor .gal .gt').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
    pg.mouse.move(*t); pg.mouse.down(); pg.mouse.move(t[0]+12,t[1]+6,steps=3); pg.mouse.move(info['left'],info['bottom']-8,steps=6)
    s0=pg.evaluate("document.querySelector('.ov .escroll').scrollTop"); pg.wait_for_timeout(900); s1=pg.evaluate("document.querySelector('.ov .escroll').scrollTop")
    ok(s1>s0+100,f"dragging an image to the bottom edge scrolls the note ({s0} -> {s1})")
    pg.mouse.move(info['left'],info['top']+8,steps=4); pg.wait_for_timeout(900); s2=pg.evaluate("document.querySelector('.ov .escroll').scrollTop")
    ok(s2<s1-100,f"and to the top edge scrolls back ({s1} -> {s2})")
    pg.keyboard.press('Escape'); pg.mouse.up(); pg.wait_for_timeout(300)
    print('errors',errs); b.close()
finish()
