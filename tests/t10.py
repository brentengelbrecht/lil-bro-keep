from playwright.sync_api import sync_playwright
from harness import ok,finish
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(700)
    pg.evaluate("""()=>{
      const out=[];for(let i=0;i<14;i++){const x=blank();x.title='T'+String(i).padStart(2,'0');x.body=i%3?'line '+i:'a\\nb\\nc\\nd';x.ts=1700000000000-i*60000;x.mod=x.ts;x.color=i%12;out.push(x)}
      out[2].pinned=true;out[5].pinned=true;out[7].pinned=true;out[3].labels=['work'];out[9].labels=['work'];out[11].labels=['work'];LB=['work'];
      notes=out;save();render()}""")
    pg.wait_for_timeout(700)
    def order(sec):
        items=pg.evaluate("""s=>{const host=document.querySelector('.vg[data-k="'+s+'"]'),t=host.getBoundingClientRect().top;
          return [...host.querySelectorAll(':scope>.card')].map(c=>{const r=c.getBoundingClientRect();return [r.top-t,c.querySelector('h3')?c.querySelector('h3').textContent:'']})}""",sec)
        mo=pg.evaluate("s=>notes.filter(n=>!n.trashed&&(s==='p')===!!n.pinned).sort(byOrder).map(n=>n.title)",sec)
        ix=lambda n: mo.index(n) if n in mo else 999
        return [n for y,n in sorted(items,key=lambda a:(round(a[0]),ix(a[1])))]   # cards whose tops differ by under a pixel count as a tie
    model=lambda sec: pg.evaluate("s=>notes.filter(n=>!n.trashed&&(s==='p')===!!n.pinned).sort(byOrder).map(n=>n.title)",sec)
    ok(order('r')==model('r') and order('p')==model('p'),f"default order is created-descending: {order('r')[:4]}")
    ok(order('r')[0]=='T00',"newest first")
    box=lambda sec,t: pg.evaluate("([s,t])=>{const h=[...document.querySelectorAll('.vg[data-k=\"'+s+'\"]>.card')].find(c=>c.querySelector('h3').textContent===t);const r=h.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}",[sec,t])
    vis=lambda sec: pg.evaluate("""s=>{const host=document.querySelector('.vg[data-k="'+s+'"]'),t=host.getBoundingClientRect().top;
      return [...host.querySelectorAll(':scope>.card,:scope>.vgph')].map(c=>{const r=c.getBoundingClientRect();return [Math.round((r.top-t)*2)/2,r.left,r.top,r.width,r.height,c.classList.contains('vgph')?'PH':(c.querySelector('h3')?c.querySelector('h3').textContent:''),c.classList.contains('dragging')]}).filter(x=>!x[6]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])}""",sec)
    def drag(sec,src,dst,steps=14,release=True):
        o0=order(sec); target=o0.index(dst)               # the dragged note ends up at the index the target card had
        x,y,w,h=box(sec,src)
        pg.mouse.move(x+w/2,y+30); pg.mouse.down(); pg.mouse.move(x+w/2+12,y+34,steps=3); pg.wait_for_timeout(350)
        for _ in range(12):
            v=vis(sec); i=[k for k,c in enumerate(v) if c[5]=='PH']
            if i and i[0]==target: break
            c=v[target]; pg.mouse.move(c[1]+c[3]/2,c[2]+c[4]/2,steps=steps); pg.wait_for_timeout(350)
        pg.wait_for_timeout(300)
        if release: pg.mouse.up(); pg.wait_for_timeout(600)
    # 1. drag a later card onto an earlier one
    before=order('r'); mod0=pg.evaluate("notes.map(n=>n.mod)")
    drag('r',before[8],before[1])
    after=order('r'); print(before[:10]); print(after[:10])
    exp=before[:]; src=exp.pop(8); exp.insert(1,src)
    ok(after==exp,"dropping onto an earlier card puts the note in that slot")
    ok(after==model('r'),"screen order equals stored order")
    ok(pg.evaluate("notes.filter(n=>n.pos!==undefined).length")==1,"only the moved note got an explicit position")
    ok(pg.evaluate("notes.map(n=>n.mod)")==mod0,"modified dates untouched")
    ok(pg.locator('.toast .ta').count()==1,"toast with Undo shown")
    pg.click('.toast .ta'); pg.wait_for_timeout(500)
    ok(order('r')==before and pg.evaluate("notes.filter(n=>n.pos!==undefined).length")==0,"Undo restores order and removes the position")
    # 2. drag an earlier card onto a later one
    mb=model('r'); drag('r',mb[0],mb[6]); ma=model('r')
    exp=mb[:]; s=exp.pop(0); exp.insert(6,s)
    ok(ma==exp and order('r')==ma,f"earlier -> later works: {ma[:8]}")
    exp=ma
    # persists
    pg.reload(); pg.wait_for_timeout(900)
    ok(order('r')==exp and model('r')==exp,"order survives reload")
    # 3. Escape cancels
    cur=order('r'); x,y,w,h=box('r',cur[2]); X,Y,W,H=box('r',cur[7])
    pg.mouse.move(x+w/2,y+30); pg.mouse.down(); pg.mouse.move(x+w/2+12,y+34,steps=3); pg.mouse.move(X+W/2,Y+H/2,steps=10); pg.wait_for_timeout(400)
    ok(pg.locator('.vgph').count()==1 and pg.locator('.vg>.card.dragging').count()==1,"placeholder and lifted card while dragging")
    ok(pg.evaluate("document.querySelectorAll('.vg>.card').length")<40,"bounded while dragging")
    pg.keyboard.press('Escape'); pg.mouse.up(); pg.wait_for_timeout(500)
    ok(order('r')==cur and pg.locator('.vgph').count()==0,"Escape cancels")
    # 4. plain click still opens the note, and a drag does not
    pg.click('.vg[data-k=r]>.card h3 >> nth=1'); pg.wait_for_timeout(500)
    ok(pg.locator('.ov .editor').count()==1,"click still opens the note"); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    ok(pg.locator('.ov .editor').count()==0,"closed")
    # 5. pinned section reorder stays inside the section
    pb=order('p'); drag('p',pb[2],pb[0]); pa=order('p')
    ok(pa==[pb[2],pb[0],pb[1]] and order('r')==cur,f"pinned reorder {pa}")
    # dropping an unpinned card on a pinned one does not move it across
    x,y,w,h=box('r',cur[0]); X,Y,W,H=box('p',pa[0])
    pg.mouse.move(x+w/2,y+30); pg.mouse.down(); pg.mouse.move(x+w/2+12,y+34,steps=3); pg.mouse.move(X+W/2,Y+H/2,steps=10); pg.wait_for_timeout(300); pg.mouse.up(); pg.wait_for_timeout(500)
    ok(order('p')==pa and 'T00' not in order('p'),"cannot drag across sections")
    # 6. pin / unpin move to top
    t=order('r')[4]; id=pg.evaluate("t=>notes.find(n=>n.title===t).id",t)
    pg.hover('.vg>.card[data-id="%s"]'%id); pg.click('.vg>.card[data-id="%s"] [data-act=pin]'%id); pg.wait_for_timeout(600)
    ok(order('p')[0]==t,f"pinning puts the note at the top of Pinned ({order('p')[:2]})")
    pg.hover('.vg>.card[data-id="%s"]'%id); pg.click('.vg>.card[data-id="%s"] [data-act=pin]'%id); pg.wait_for_timeout(600)
    ok(order('r')[0]==t,"unpinning puts it at the top of Others")
    # 7. keyboard
    cur=order('r'); id=pg.evaluate("t=>notes.find(n=>n.title===t).id",cur[3])
    pg.hover('.vg>.card[data-id="%s"]'%id); pg.focus('.vg>.card[data-id="%s"] [data-act=colpick]'%id); pg.keyboard.press('Alt+ArrowUp'); pg.wait_for_timeout(500)
    e=cur[:]; e[2],e[3]=e[3],e[2]
    ok(order('r')==e,"Alt+Up moves one earlier")
    pg.focus('.vg>.card[data-id="%s"] [data-act=colpick]'%id); pg.keyboard.press('Alt+ArrowDown'); pg.keyboard.press('Alt+ArrowDown'); pg.wait_for_timeout(500)
    e=cur[:]; e.pop(2); e.insert(4,cur[3]) 
    print(order('r')[:6])
    # 8. label view
    pg.click('#lbls button[data-lf=work]'); pg.wait_for_timeout(600)
    lv=order('r'); ok(len(lv)==3,f"label view shows 3 notes {lv}")
    drag('r',lv[2],lv[0]); lv2=order('r')
    ok(lv2==[lv[2],lv[0],lv[1]],f"reorder inside a label view {lv2}")
    pg.click('#lbls button[data-lf=work]'); pg.wait_for_timeout(600)
    allo=order('r'); ok(allo==model('r') and allo.index(lv2[0])<allo.index(lv2[1])<allo.index(lv2[2]),"full order consistent with the label-view order")
    # 9. search and trash: no drag
    pg.fill('#q','T0'); pg.wait_for_timeout(500); s0=order('r'); x,y,w,h=box('r',s0[0]); X,Y,W,H=box('r',s0[2])
    pg.mouse.move(x+w/2,y+30); pg.mouse.down(); pg.mouse.move(x+w/2+12,y+34,steps=3); pg.mouse.move(X+W/2,Y+H/2,steps=8); pg.wait_for_timeout(300)
    ok(pg.locator('.vgph').count()==0,"no dragging in search results"); pg.mouse.up(); pg.fill('#q',''); pg.wait_for_timeout(500)
    # 10. list view
    pg.evaluate("document.querySelectorAll('.toast .tx2').forEach(b=>b.click())"); pg.wait_for_timeout(400)
    pg.click('#vm'); pg.wait_for_timeout(500); print('   state before list drag: q=',repr(pg.evaluate('q')),'sel',pg.evaluate('[...sel]'),'cards',pg.evaluate("document.querySelectorAll('.vg>.card').length"),'gridMode',pg.evaluate('gridMode'),'view',pg.evaluate('view'),'scrollY',pg.evaluate('scrollY'),'toast',pg.locator('.toast').count()); mb=model('r'); drag('r',mb[1],mb[0],steps=10); la=model('r')
    e=mb[:]; s=e.pop(1); e.insert(0,s); ok(la==e and order('r')==la[:len(order('r'))],"drag works in list view"); print('   la==e',la==e,'screen==la',order('r')==la,'drag started?'); print('   list',mb[:7],'->',la[:7],'screen',order('r')[:7], 'scrollY',pg.evaluate('scrollY'))
    pg.click('#vm'); pg.wait_for_timeout(500)
    # 11. new note goes to top
    pg.click('#composer'); pg.wait_for_timeout(300); pg.keyboard.type('Brand new'); pg.keyboard.press('Tab'); pg.mouse.click(1100,700); pg.wait_for_timeout(600)
    print(order('r')[:3])
    # 12. storage round trip of pos
    rt=pg.evaluate("""()=>{const n=blank();n.pos=123456.789;n.ts=1;const html=noteHTML(n);const m=html.match(/keep:meta\\s*([\\s\\S]*?)\\s*-->/);return JSON.parse(m[1]).pos}""")
    ok(rt==123456.789,"pos is written to the note file metadata")
    print('errors',errs); b.close()
finish()
