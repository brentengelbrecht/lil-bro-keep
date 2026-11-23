from playwright.sync_api import sync_playwright
import json
from harness import ok,finish
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(700)
    pg.evaluate("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      const dims=[[400,300],[300,500],[600,300],[500,500],[300,300],[700,400]];
      for(let i=0;i<dims.length;i++)await putBlob('P'+i,await mk(dims[i][0],dims[i][1],'hsl('+(i*55)+',60%,70%)'));
      let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
      const words='lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
      const txt=n=>Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(' ');
      const out=[];
      for(let i=0;i<400;i++){
        const x=blank();x.title=rnd()<.8?('N'+i+' '+txt(Math.floor(rnd()*5))):'';x.ts=Date.now()-i*1000;x.color=Math.floor(rnd()*12);
        const r=rnd();
        if(r<.25){x.isList=true;x.items=Array.from({length:1+Math.floor(rnd()*7)},()=>({t:txt(1+Math.floor(rnd()*6)),d:rnd()<.3}))}
        else x.body=Array.from({length:1+Math.floor(rnd()*3)},()=>txt(Math.floor(rnd()*40))).join('\\n');
        if(rnd()<.3){const k=1+Math.floor(rnd()*8);x.att=Array.from({length:k},(_,j)=>{const d=dims[Math.floor(rnd()*6)];return {id:'P'+dims.findIndex(q=>q===d),kind:'image',name:'i'+j+'.png',w:d[0],h:d[1]}})}
        out.push(x)}
      out[3].pinned=true;out[10].pinned=true;
      notes=out;save();render()}""")
    pg.wait_for_timeout(1200)
    st=lambda: pg.evaluate("({m:document.querySelectorAll('.vg>.card').length,h:document.querySelector('.vg[data-k=r]').offsetHeight,y:scrollY})")
    s=st(); print(s)
    ok(s['m']<80,f"only {s['m']} of 400 notes are in the page at the top")
    ok(s['h']>5000,f"container reserves full height ({s['h']}px)")
    # estimate accuracy
    acc=pg.evaluate("""()=>{const r=[];document.querySelectorAll('.vg>.card').forEach(c=>{const n=notes.find(x=>x.id===c.dataset.id);const cw=parseFloat(c.style.width);const e=vgEstimate(n,cw),m=c.getBoundingClientRect().height;r.push(Math.abs(e-m)/m)});return {mean:r.reduce((a,b)=>a+b,0)/r.length,max:Math.max(...r),n:r.length}}""")
    print('estimate error',acc)
    # overlap check helper
    ov="""()=>{const cs=[...document.querySelectorAll('.vg>.card')].map(c=>c.getBoundingClientRect());let bad=0;for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){const a=cs[i],b=cs[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)bad++}return bad}"""
    ok(pg.evaluate(ov)==0,"no overlapping cards at top")
    # smooth scroll with anchoring: anchor card moves exactly by scroll delta
    worst=0; steps=0
    for i in range(60):
        a=pg.evaluate("""()=>{let best=null,t=1e9;document.querySelectorAll('.vg>.card').forEach(c=>{const r=c.getBoundingClientRect();if(r.top>80&&r.top<t&&r.bottom<innerHeight){t=r.top;best=c}});return best?[best.dataset.id,t]:null}""")
        if not a: pg.mouse.wheel(0,200); pg.wait_for_timeout(40); continue
        y0=pg.evaluate("scrollY"); pg.evaluate("window.scrollBy(0,150)"); pg.wait_for_timeout(60)
        y1=pg.evaluate("scrollY"); t1=pg.evaluate("id=>{const c=document.querySelector('.vg>.card[data-id=\"'+id+'\"]');return c?c.getBoundingClientRect().top:null}",a[0])
        if t1 is None: continue
        err=abs((a[1]-(y1-y0))-t1); worst=max(worst,err); steps+=1
    print('scroll steps',steps,'worst anchor error',round(worst,2))
    ok(worst<=2,f"cards don't jump while scrolling (worst anchor drift {worst:.1f}px)")
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")<80,"still bounded after scrolling")
    ok(pg.evaluate(ov)==0,"no overlaps mid-scroll")
    # jump to bottom
    pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); pg.wait_for_timeout(500)
    last=pg.evaluate("notes.filter(n=>!n.pinned).sort((a,b)=>b.ts-a.ts).pop().id")
    ok(pg.locator('.vg>.card[data-id="%s"]'%last).count()==1,"oldest note is mounted at the bottom")
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")<80,"bounded at the bottom")
    ok(pg.evaluate(ov)==0,"no overlaps at the bottom")
    # back to top
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(500)
    # incremental update: tick a checklist item
    pg.evaluate("document.querySelectorAll('.vg>.card').forEach((c,i)=>c._tag=i)")
    lid=pg.evaluate("[...document.querySelectorAll('.vg>.card')].map(c=>c.dataset.id).find(id=>notes.find(n=>n.id===id).isList)")
    pg.hover('.vg>.card[data-id="%s"]'%lid); pg.click('.vg>.card[data-id="%s"] [data-act=tick] >> nth=0'%lid); pg.wait_for_timeout(300)
    r=pg.evaluate("""lid=>{const cs=[...document.querySelectorAll('.vg>.card')];return {changed:cs.filter(c=>c._tag===undefined).map(c=>c.dataset.id),same:cs.filter(c=>c._tag!==undefined).length}}""",lid)
    ok(r['changed']==[lid] and r['same']>5,f"ticking an item replaced only that card ({r['changed']}, {r['same']} untouched)")
    # colour via picker
    pg.evaluate("document.querySelectorAll('.vg>.card').forEach((c,i)=>c._tag=i)")
    c0=pg.evaluate("document.querySelector('.vg>.card').dataset.id")
    pg.hover('.vg>.card[data-id="%s"]'%c0); pg.wait_for_timeout(350); pg.click('.vg>.card[data-id="%s"] [data-act=colpick]'%c0);   # wait for the icon bar to finish sliding in
    pg.click('.cpop .sw >> nth=5'); pg.wait_for_timeout(300)
    r=pg.evaluate("()=>[...document.querySelectorAll('.vg>.card')].filter(c=>c._tag===undefined).map(c=>c.dataset.id)")
    ok(r==[c0],f"colour change touched only one card {r}")
    pg.keyboard.press('Escape')
    # resize
    for w in (900,600,1400):
        pg.set_viewport_size({'width':w,'height':800}); pg.wait_for_timeout(500)
        n_cols=pg.evaluate("new Set([...document.querySelectorAll('.vg[data-k=r]>.card')].map(c=>Math.round(c.getBoundingClientRect().left))).size")
        within=pg.evaluate("""()=>{const h=document.querySelector('.vg[data-k=r]').getBoundingClientRect();return [...document.querySelectorAll('.vg[data-k=r]>.card')].every(c=>{const r=c.getBoundingClientRect();return r.left>=h.left-1&&r.right<=h.right+1})}""")
        ok(pg.evaluate(ov)==0 and within and pg.evaluate("document.querySelectorAll('.vg>.card').length")<90,f"width {w}: {n_cols} columns, no overlap, inside container")
    pg.set_viewport_size({'width':1200,'height':800}); pg.wait_for_timeout(400)
    # list mode
    pg.click('#vm'); pg.wait_for_timeout(500)
    wd=pg.evaluate("[...new Set([...document.querySelectorAll('.vg>.card')].map(c=>Math.round(c.getBoundingClientRect().width)))]")
    ok(len(wd)==1 and wd[0]<=602 and pg.evaluate(ov)==0,f"list view: one column {wd}")
    pg.click('#vm'); pg.wait_for_timeout(400)
    # search
    pg.fill('#q','N17 '); pg.wait_for_timeout(500)
    ids=pg.evaluate("[...document.querySelectorAll('.vg>.card h3')].map(h=>h.textContent)")
    ok(len(ids)>=1 and all('N17' in t for t in ids),f"search filters: {ids[:3]}")
    pg.fill('#q',''); pg.wait_for_timeout(500)
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")>5,"clearing search restores the grid")   # was >10 before the note text was made larger (taller cards, fewer in the window)
    # pin moves between sections
    pid=pg.evaluate("[...document.querySelectorAll('.vg[data-k=r]>.card')][2].dataset.id")
    pg.hover('.vg>.card[data-id="%s"]'%pid); pg.click('.vg>.card[data-id="%s"] [data-act=pin]'%pid); pg.wait_for_timeout(500)
    ok(pg.evaluate("p=>!!document.querySelector('.vg[data-k=p]>.card[data-id=\"'+p+'\"]')",pid),"pinned note moves into Pinned section")
    # open editor from a card, close, scroll preserved
    pg.evaluate("window.scrollTo(0,1500)"); pg.wait_for_timeout(400)
    y=pg.evaluate("scrollY"); cid=pg.evaluate("[...document.querySelectorAll('.vg>.card')].find(c=>c.getBoundingClientRect().top>150).dataset.id")
    pg.click('.vg>.card[data-id="%s"] h3, .vg>.card[data-id="%s"] .tx, .vg>.card[data-id="%s"] ul'%(cid,cid,cid)) if False else pg.evaluate("id=>document.querySelector('.vg>.card[data-id=\"'+id+'\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))",cid)
    pg.wait_for_timeout(500); opened=pg.locator('.ov .editor').count()==1
    pg.keyboard.press('Escape'); pg.wait_for_timeout(600)
    ok(opened and abs(pg.evaluate("scrollY")-y)<3,f"editor opens/closes, scroll preserved ({y}->{pg.evaluate('scrollY')})")
    # trash view
    pg.evaluate("window.scrollTo(0,0)"); 
    tid=pg.evaluate("[...document.querySelectorAll('.vg[data-k=r]>.card')][1].dataset.id")
    pg.hover('.vg>.card[data-id="%s"]'%tid); pg.click('.vg>.card[data-id="%s"] [data-act=trash]'%tid); pg.wait_for_timeout(400)
    ok(pg.locator('.vg>.card[data-id="%s"]'%tid).count()==0,"trashed note leaves the grid")
    pg.click('#nav button[data-v=trash]'); pg.wait_for_timeout(500)
    ok(pg.locator('.vg>.card[data-id="%s"]'%tid).count()==1,"…and shows in Trash")
    pg.screenshot(path='shot_v.png')
    # ---- the icon bar slides over the bottom of a note and pushes the labels up
    pg.evaluate("window.scrollTo(0,0)"); pg.mouse.move(5,5); pg.wait_for_timeout(400)
    CID=pg.evaluate("(()=>{const id=document.querySelector('.vg>.card').dataset.id;const n=notes.find(x=>x.id===id);n.labels=['alpha','beta'];commit();Host.render();return id})()"); pg.wait_for_timeout(700)
    G="id=>{const c=document.querySelector('.card[data-id=\"'+id+'\"]'),r=c.getBoundingClientRect(),a=c.querySelector('.acts').getBoundingClientRect(),h=c.querySelector('.chips').getBoundingClientRect();return {bar:Math.round(r.bottom-a.top),chips:Math.round(r.bottom-h.bottom)}}"
    rest=pg.evaluate(G,CID)
    ok(rest['bar']<=2 and rest['chips']<=2,f"at rest the bar is hidden and the labels sit against the bottom of the note {rest}")
    pg.hover('.card[data-id="%s"]'%CID); pg.wait_for_timeout(450); hov=pg.evaluate(G,CID)
    ok(abs(hov['bar']-41)<=2 and abs(hov['chips']-hov['bar'])<=1,f"on hover the bar slides up and pushes the labels up with it {hov}")
    pg.mouse.move(5,5); pg.wait_for_timeout(450); back=pg.evaluate(G,CID)
    ok(back['bar']<=2 and back['chips']<=2,f"when the pointer leaves, the labels sink back to the bottom {back}")
    # ---- labels: every "x" shows while the pointer is over the note, so moving between labels never re-flows them (no wrap/unwrap flicker)
    pg.mouse.move(5,5); pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    pg.evaluate("(()=>{const id=document.querySelector('.vg>.card').dataset.id;const n=notes.find(x=>x.id===id);n.labels=['Recipes','Home','WWWWWWWWWWWWW'];commit();Host.render();window.__lid=id})()"); pg.wait_for_timeout(700)
    LID=pg.evaluate("window.__lid")
    LAY="id=>[...document.querySelectorAll('.card[data-id=\"'+id+'\"] .chip')].map(c=>{const r=c.getBoundingClientRect(),q=c.parentElement.getBoundingClientRect();return [Math.round(r.left-q.left),Math.round(r.top-q.top),Math.round(r.width)]})"
    cb=pg.locator('.card[data-id="%s"]'%LID).bounding_box(); pg.mouse.move(cb['x']+20,cb['y']+20); pg.wait_for_timeout(600)
    ent=pg.evaluate(LAY,LID); same=True
    for i in range(3):
        bb=pg.locator('.card[data-id="%s"] .chip'%LID).nth(i).bounding_box()
        pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2); pg.wait_for_timeout(350)
        same=same and pg.evaluate(LAY,LID)==ent
    ok(same,f"the labels do not move when the pointer moves from one label to another {ent}")
    pg.mouse.move(5,5); pg.wait_for_timeout(500)
    print('errors',errs); b.close()
finish()
