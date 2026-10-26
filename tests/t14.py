from playwright.sync_api import sync_playwright
def ok(c,m): print(('PASS ' if c else 'FAIL ')+m)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':700})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(700)
    st=lambda: pg.evaluate("""()=>({busy:document.body.classList.contains('busy'),det:document.body.classList.contains('det'),
      ring:getComputedStyle(document.getElementById('ring')).display,spin:getComputedStyle(document.getElementById('spin')).display,
      txt:document.getElementById('ringtxt').textContent,off:document.getElementById('ringarc').style.strokeDashoffset,title:document.getElementById('spinslot').title})""")
    w=lambda: pg.wait_for_timeout(120)
    ok(not st()['busy'],"idle: nothing shown")
    # an unmeasurable job -> equalizer spinner
    pg.evaluate("busyStart()"); w(); s=st(); ok(s['busy'] and not s['det'] and s['spin']=='block' and s['ring']=='none',f"job without a percentage shows the spinner {s['title']}")
    pg.evaluate("busyEnd()"); w()
    # a measurable job -> ring
    pg.evaluate("window.J=null;busyStart();window.J=busyProgress(10);J.set(4)"); w(); s=st()
    ok(s['det'] and s['ring']=='block' and s['spin']=='none' and s['txt']=='40',f"measurable job shows ring at 40% (offset {s['off']}, {s['title']})")
    pg.screenshot(path='shot_ring.png',clip={'x':0,'y':0,'width':420,'height':70})
    # a second job that cannot report -> back to the spinner
    pg.evaluate("busyStart()"); w(); s=st(); ok(s['det'] and s['ring']=='block',"the ring is kept at first, so a short job without a percentage cannot make it flicker")
    pg.wait_for_timeout(1000); s=st(); ok(not s['det'] and s['spin']=='block',"adding a job with no percentage switches back to the spinner (after a short hold)")
    pg.evaluate("busyEnd()"); w(); s=st(); ok(s['det'] and s['txt']=='40',"…and back to the ring when it finishes")
    # two measurable jobs -> combined
    pg.evaluate("busyStart();window.K=busyProgress(30);K.set(20)"); w(); s=st()
    ok(s['det'] and s['txt']=='60',f"two measurable jobs combine: (4+20)/(10+30)=60% -> {s['txt']}")
    pg.evaluate("J.set(10);K.set(30)"); w(); ok(st()['txt']=='99',"never shows 100 while still running (caps at 99)")
    pg.evaluate("J.end();K.end();busyEnd();busyEnd()"); w(); s=st(); ok(not s['busy'] and not s['det'],"all done: hidden")
    # an import with background saves starting in the middle of it: the indicator must not flip between the ring and the spinner
    r=pg.evaluate("""()=>new Promise(res=>{
      const T=ms=>new Promise(r=>setTimeout(r,ms));const log=[];let last=null,run=true;const t0=performance.now();
      const loop=()=>{const m=document.body.classList.contains('det')?'ring':'spin';if(m!==last){log.push(m);last=m}if(run)requestAnimationFrame(loop)};loop();
      (async()=>{busyStart();const pr=busyProgress(40);
        const imp=(async()=>{for(let i=0;i<40;i++){pr.set(i);await T(40)}pr.end();busyEnd()})();
        for(const at of [400,1000]){await T(at-(performance.now()-t0));busyStart();await T(60);const fp=busyProgress(3);for(let k=0;k<3;k++){fp.set(k);await T(60)}fp.end();await T(40);busyEnd()}
        await imp;await T(200);run=false;res(log)})()})""")
    ok(r==['spin','ring','spin'],f"no ring/spinner flicker while background saves start inside an import {r}")
    # real folder save through the browser's private file system
    r=pg.evaluate("""async()=>{
      ROOT=await navigator.storage.getDirectory();MODE='folder';fstate='ok';loaded=true;
      for await(const [n] of ROOT.entries())await ROOT.removeEntry(n,{recursive:true});
      const out=[];for(let i=0;i<120;i++){const x=blank();x.id=String(i+1);x.title='N'+i;x.body='b'+i;x.ts=Date.now()-i*1000;out.push(x)}
      notes=out;lastW.clear();
      const seen=[];const obs=new MutationObserver(()=>{if(document.body.classList.contains('det'))seen.push(+document.getElementById('ringtxt').textContent)});
      obs.observe(document.getElementById('ringtxt'),{childList:true,characterData:true,subtree:true});
      const sawDet=[];const o2=new MutationObserver(()=>sawDet.push(document.body.classList.contains('det')));o2.observe(document.body,{attributes:true,attributeFilter:['class']});
      pending=true;await flush();await new Promise(r=>setTimeout(r,300));obs.disconnect();o2.disconnect();
      let files=0;for await(const [n,e] of ROOT.entries())if(e.kind==='directory')for await(const f of e.entries())files++;
      return {files,seen:[...new Set(seen)],sawDet:sawDet.includes(true),busyAfter:document.body.classList.contains('busy')}}""")
    print(r)
    ok(r['files']==120,"120 notes written to the folder")
    ok(r['sawDet'] and len(r['seen'])>1 and r['seen']==sorted(r['seen']),f"ring appeared during the real save and climbed steadily {r['seen'][:8]}...")
    ok(not r['busyAfter'],"ring gone when the save finished")
    print('errors',errs); b.close()
