"""Image-layout geometry: row grouping, row sizes at a 600 px width, drop and step order, viewer base size. Numbers are the spec's section 11.1 cases."""
from playwright.sync_api import sync_playwright
import sys
from harness import ok,finish
near=lambda a,b,t=0.6: abs(a-b)<=t
# aspect ratios (width/height) -> expected rows of [w,h] tiles, container 600 px wide, gap 2 px
cases={
 1:([1.333],[[[600,450]]],450),
 2:([0.75],[[[600,800]]],800),
 3:([1.5,1.5],[[[299,199.3],[299,199.3]]],199.3),
 4:([0.5,1.5],[[[149.5,299],[448.5,299]]],299),
 5:([0.5,1.5,1.0],[[[99.3,198.7],[298,198.7],[198.7,198.7]]],198.7),
 6:([1,1,1],[[[198.7,198.7]]*3],198.7),
 7:([0.75,1.5,1.0,1.5],[[[600,800]],[[223.5,149],[149,149],[223.5,149]]],951),
 8:([1.5,1.0,1.0,1.0,1.0],[[[358.8,239.2],[239.2,239.2]],[[198.7,198.7]]*3],439.9)}
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':900,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(500)
    ev=pg.evaluate
    for k,(ars,want,h) in cases.items():
        res=ev("""([ars])=>{
          const imgs=ars.map((r,i)=>({id:'i'+i,name:'n'+i,w:Math.round(r*1000),h:1000}));
          const d=document.createElement('div');d.style.cssText='width:600px;position:absolute;left:0;top:0;background:#fff';
          d.innerHTML=galleryHTML(imgs);document.body.append(d);
          const rows=[...d.querySelectorAll('.grow')].map(r=>[...r.children].map(t=>{const b=t.getBoundingClientRect();return [b.width,b.height]}));
          const g=d.querySelector('.gal').getBoundingClientRect();
          d.remove();return {rows,h:g.height}}""",[ars])
        shape=[len(r) for r in res['rows']]==[len(r) for r in want]
        same=shape and all(near(a,c) for rw,rc in zip(res['rows'],want) for t,tc in zip(rw,rc) for a,c in zip(t,tc))
        ok(same,f"11.1 case {k}: tile sizes match {want}")
        ok(near(res['h'],h,1),f"11.1 case {k}: total height {h} px (got {res['h']:.1f})")
        if k==7: ok(near(res['rows'][0][0][0],600,0.5) and near(res['rows'][0][0][1],800,0.5),"11.1 case 7: lone first image is 600x800")
    ok(ev("galleryHTML([])")=='' and ev("galleryHTML(null)")=='',"zero images: no markup at all")
    rows=ev("[1,2,3,4,5,6,7,8,9,10,15].map(n=>groupRows([...Array(n).keys()]).map(r=>r.length).join('+'))")
    ok(rows==['1','2','3','1+3','2+3','3+3','1+3+3','2+3+3','3+3+3','1+3+3+3','3+3+3+3+3'],"grouping: N mod 3 first, then rows of 3")
    ok(ev("galleryHTML([1,2,3,4,5,6,7].map(i=>({id:'a'+i,w:10,h:10})),{maxRows:2}).split('class=\"grow\"').length-1")==2,"card view shows only the first two rows")
    ok(ev("galleryHTML([1,2,3,4,5,6,7].map(i=>({id:'a'+i,w:10,h:10})),{maxRows:2}).split('class=\"gt\"').length-1")==4,"card view never regroups: 1+3 tiles")
    ok(ev("galDrop(['A','B','C','D'],'D','A',false)")==['D','A','B','C'],"drop D before A")
    ok(ev("galDrop(['A','B','C','D'],'A','C',true)")==['B','C','A','D'],"drop A after C")
    ok(ev("galDrop(['A','B','C','D'],'B','B',true)")==['A','B','C','D'],"drop on itself changes nothing")
    ok(ev("galDrop(['A','B'],'Z','A',true)")==['A','B'],"unknown dragged id changes nothing")
    ok(ev("galStep(['A','B','C'],'B',-1)")==['B','A','C'] and ev("galStep(['A','B','C'],'B',1)")==['A','C','B'],"step moves one place")
    ok(ev("galStep(['A','B','C'],'A',-1)")==['A','B','C'] and ev("galStep(['A','B','C'],'C',1)")==['A','B','C'],"step stops at both ends")
    v=ev("[galBaseSize(400,200,1000,800),galBaseSize(2000,6000,1000,800),galBaseSize(6000,2000,1000,800)]")
    ok(near(v[0]['w'],1000,.01) and near(v[0]['h'],500,.01),"viewer: small wide image scaled up to fill the width")
    ok(near(v[1]['h'],800,.01) and near(v[1]['w'],266.67,.01),"viewer: tall image fits the height")
    ok(near(v[2]['w'],1000,.01) and near(v[2]['h'],333.33,.01),"viewer: very wide image fits the width")
    # every script runs in strict mode: reading .caller on a sloppy function gives null, on a strict one it throws
    fns={'order':'topKey','util':'busyStart','dialog':'dlgSetInert','drag':'dragGesture','richtext':'safeHref','richedit':'linkifyAll','model':'partAtt','format':'attTile','media':'resetMediaCache','folder':'ensureId','store':'addMedia','folder-ui':'setStatus','folder-io':'bucketDir','folder-lazy':'loadNote','folder-crypt':'noteOpened','folder-labels':'relabelStored','encrypt':'LilBroEncrypt.checkPassphraseStrength','crypt-ui':'Crypt.settingsHTML','drafts':'Drafts.check','capture':'uniqueName','gallery':'groupRows','vgrid':'vgEstimate','recorder':'createRecorder','editor':'editorHTML','labels':'labelNavClick','takeout':'parseHeadingDate','export':'exportList','app':'visible'}
    res=ev("""fns=>Object.fromEntries(Object.entries(fns).map(([f,n])=>{try{const fn=eval(n);fn.caller;return[f,false]}catch(e){return[f,e instanceof TypeError]}}))""",fns)
    ok(all(res.values()),"every script runs in strict mode"+('' if all(res.values()) else f" (sloppy: {[k for k,v in res.items() if not v]})"))
    ok(len(res)==ev("[...document.scripts].filter(s=>s.src).length"),"the strict-mode check covers every script on the page")
    ok(errs==[],f"no page errors {errs}")
    b.close()
finish()
