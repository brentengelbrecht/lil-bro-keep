from playwright.sync_api import sync_playwright
from harness import ok,finish
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(700)
    pg.evaluate("""async()=>{
      const mk=(w,h,c)=>new Promise(r=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,w,h);cv.toBlob(r,'image/png')});
      const T=blank();T.title='V note';T.ts=Date.now()+5000;
      for(const [id,w,h] of [['V0',400,200],['V1',500,1500],['V2',3000,1000],['V3',900,700]]){await putBlob(id,await mk(w,h,'#789'));T.att.push({id,kind:'image',name:id+'.png',w,h})}
      notes.unshift(T);save();render()}""")
    pg.wait_for_timeout(400)
    id=pg.evaluate("notes[0].id"); pg.click('.card[data-id="%s"] h3'%id); pg.wait_for_timeout(600)
    pg.click('.ov .editor .gal .gt >> nth=0'); pg.wait_for_timeout(500)
    v=lambda: pg.evaluate("""()=>{const sc=document.querySelector('.ivsc'),r=document.querySelector('.ivimg').getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1),cw:sc.clientWidth,ch:sc.clientHeight,sw:sc.scrollWidth,sh:sc.scrollHeight,pct:document.querySelector('.ivl').textContent,zo:document.querySelector('[data-v=zout]').disabled,zi:document.querySelector('[data-v=zin]').disabled}}""")
    for k,name in enumerate(['400x200','500x1500','3000x1000','900x700']):
        if k: pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(450)
        s=v()
        fit=(abs(s['w']-s['cw'])<1.5 or abs(s['h']-s['ch'])<1.5) and s['w']<=s['cw']+1.5 and s['h']<=s['ch']+1.5 and s['sw']<=s['cw'] and s['sh']<=s['ch']
        ok(fit and s['pct']=='100%',f"{name}: starts at 100%, fully visible, larger axis fills window {s['w']}x{s['h']} in {s['cw']}x{s['ch']}")
    base=v()
    pg.click('[data-v=zin]'); pg.click('[data-v=zin]'); pg.click('[data-v=zin]'); pg.click('[data-v=zin]'); 
    s=v(); ok(s['pct']=='200%' and s['zi'] and abs(s['w']/base['w']-2)<.02,f"zoom in stops at 200% ({s['pct']}, {s['w']/base['w']:.2f}x)")
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(450); s=v(); ok(s['pct']=='100%' and not s['zi'],"previous image resets to 100%")
    base=v()
    for _ in range(8): pg.click('[data-v=zout]',force=True)
    s=v(); ok(s['pct']=='40%' and s['zo'] and abs(s['w']/base['w']-0.4)<.02,f"zoom out stops at 40% ({s['pct']}, {s['w']/base['w']:.2f}x)")
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(450); s=v(); ok(s['pct']=='100%' and not s['zo'],"next image resets to 100%")
    # ---- the next image is loaded off screen: it is never painted in the middle before it slides in
    pg.evaluate('''()=>{window.__s=[];const f=()=>{const e=document.querySelector('.ivsc:not(.ivout)');if(e){const i=e.querySelector('.ivimg');window.__s.push([Math.round(e.getBoundingClientRect().left),i&&i.getAttribute('src')||''])}window.__raf=requestAnimationFrame(f)};f()}''')
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(900); pg.evaluate('cancelAnimationFrame(window.__raf)')
    fr=pg.evaluate('window.__s'); first=fr[0][1]; new=[x[0] for x in fr if x[1] not in (first,'')]
    lead=0
    for x in new:
        if abs(x)<5: lead+=1
        else: break
    ok(len(new)>3 and lead==0 and new[0]<-100,f"no flash: the new image starts off screen ({new[:4]})")
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(700)
    # ---- rotation: view only, either direction, remembered per image while the viewer is open
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(450)
    R=lambda: pg.evaluate("(()=>{const i=document.querySelector('.ivimg'),r=i.getBoundingClientRect(),s=document.querySelector('.ivsc').getBoundingClientRect();return {w:r.width,h:r.height,rot:i.style.getPropertyValue('--rot'),fits:r.width<=s.width+1.5&&r.height<=s.height+1.5,nw:i.naturalWidth,nh:i.naturalHeight,src:i.src}})()")
    r0=R()
    pg.click('[data-v=rotr]'); pg.wait_for_timeout(450); r1=R()
    ok(r1['rot']=='90deg' and r1['fits'] and abs(r1['w']/r1['h']-r0['h']/r0['w'])<.02,f"rotate right turns the picture a quarter and it still fits ({r0['w']:.0f}x{r0['h']:.0f} -> {r1['w']:.0f}x{r1['h']:.0f})")
    ok(r1['nw']==r0['nw'] and r1['nh']==r0['nh'] and r1['src']==r0['src'],"rotating changes nothing about the image itself (same file, same pixels)")
    pg.click('[data-v=rotl]'); pg.click('[data-v=rotl]'); pg.wait_for_timeout(450); r2=R()
    ok(r2['rot']=='-90deg' and r2['fits'],"rotate left turns it back and a quarter further the other way")
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(700); r3=R()
    ok(r3['rot']=='0deg',"the next image is not rotated")
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(700); r4=R()
    ok(r4['rot']=='-90deg',"coming back, the first image is still rotated")
    pg.keyboard.press('r'); pg.wait_for_timeout(400); pg.keyboard.press('Shift+R'); pg.wait_for_timeout(400)
    ok(R()['rot']=='-90deg',"R turns right, Shift+R turns left")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('.editor img,.eatt img')&&document.querySelector('.editor img,.eatt img').click()"); pg.wait_for_timeout(500)
    ok(pg.evaluate("document.querySelector('.ivimg')?document.querySelector('.ivimg').style.getPropertyValue('--rot')||'0deg':'none'") in ('0deg','none'),"closing and reopening the viewer starts with no rotation")
    print('errors',errs); b.close()
finish()
