from playwright.sync_api import sync_playwright
from harness import ok,finish
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(700)
    pg.evaluate("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      for(let i=0;i<4;i++)await putBlob('Z'+i,await mk(400,300,'hsl('+i*80+',60%,60%)'));
      const A=blank();A.title='With images';A.body='text';A.color=7;A.ts=Date.now()+3000;
      A.att=[0,1,2,3].map(i=>({id:'Z'+i,kind:'image',name:'z'+i,w:400,h:300}));
      const B=blank();B.title='No attach';B.body='plain';B.color=4;B.ts=Date.now()+2000;
      notes.unshift(A,B);save();render()}""")
    pg.wait_for_timeout(700)
    idOf=lambda t: pg.evaluate("t=>notes.find(n=>n.title===t).id",t)
    A=idOf('With images'); B=idOf('No attach')
    r=pg.evaluate("""id=>{const c=document.querySelector('.card[data-id="'+id+'"]'),g=c.querySelector('.gal').getBoundingClientRect(),cb=c.querySelector('.cb').getBoundingClientRect(),cr=c.getBoundingClientRect();
      return {top:g.top-cr.top,left:g.left-cr.left,right:cr.right-g.right,gap:cb.top-g.bottom}}""",A)
    print(r)
    ok(r['top']<=1.5 and r['left']<=1.5 and r['right']<=1.5 and abs(r['gap'])<=0.5,"card: images flush to top/left/right and run straight into the title block")
    pg.hover('.card[data-id="%s"]'%A); pg.wait_for_timeout(300)
    pr=pg.evaluate("""id=>{const c=document.querySelector('.card[data-id="'+id+'"]'),p=c.querySelector('.pin'),r=p.getBoundingClientRect(),el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {op:getComputedStyle(p).opacity,onTop:p===el||p.contains(el)}}""",A)
    ok(pr['op']=='1' and pr['onTop'],f"card with images: pin visible and on top when hovering {pr}")
    pg.screenshot(path='shot_pin.png',clip={'x':250,'y':100,'width':700,'height':500})
    r=pg.evaluate("""id=>{const c=document.querySelector('.card[data-id="'+id+'"]'),cs=getComputedStyle(c),cb=getComputedStyle(c.querySelector('.cb'));return {card:cs.backgroundColor,cb:cb.backgroundColor,h3top:c.querySelector('h3').getBoundingClientRect().top-c.getBoundingClientRect().top}}""",B)
    print(r)
    ok(r['card']==r['cb'] and r['card']!='rgb(255, 255, 255)',"no attachments: colour fills the whole note, including above the title")
    # editor
    pg.click('.card[data-id="%s"] h3'%A); pg.wait_for_timeout(600)
    e=pg.evaluate("""()=>{const ed=document.querySelector('.ov .editor'),sc=ed.querySelector('.escroll').getBoundingClientRect(),g=ed.querySelector('.gal').getBoundingClientRect(),b=ed.querySelector('.ebody').getBoundingClientRect(),pin=ed.querySelector('.pin'),pr=pin.getBoundingClientRect(),el=document.elementFromPoint(pr.left+pr.width/2,pr.top+pr.height/2);
      return {top:g.top-sc.top,left:g.left-sc.left,right:sc.right-g.right,gap:b.top-g.bottom,pin:pin===el||pin.contains(el)}}""")
    print(e)
    ok(e['top']<=0.5 and e['left']<=0.5 and e['right']<=0.5 and abs(e['gap'])<=0.5,"editor: images flush to top/left/right and run straight into the title")
    ok(e['pin'],"editor: pin button sits above the images")
    pg.screenshot(path='shot_ed2.png')
    print('errors',errs); b.close()
finish()
