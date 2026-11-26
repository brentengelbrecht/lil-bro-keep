"""Compares how the app looks with an old stylesheet and the current one: computed styles of every element in about twenty states (cards and their hover,
the colour and label pickers, every dialog, the editor with and without the padlock, a narrow window). Zero differences means a CSS refactor changed nothing.

  git show HEAD:css/styles.css > /tmp/old.css      # or any earlier copy
  python3 tests/css_compare.py /tmp/old.css
"""
import sys
from harness import finish, session
with session(folder=True) as s:
    pg,ev,boot=s.pg,s.evaluate,s.boot
    PASS='orbit lantern velvet mosaic harbor'
    ev=pg.evaluate
    OLD=open(sys.argv[1],encoding='utf-8').read() if len(sys.argv)>1 else sys.exit('usage: python3 tests/css_compare.py OLD.css  (compared with css/styles.css)')
    NEWCSS=open('css/styles.css',encoding='utf-8').read()
    DUMP="""()=>{const out=[];const P=['display','position','top','right','bottom','left','width','height','margin','padding','border','border-radius','background','background-image','color','font','opacity','z-index','gap','flex','grid-template-columns','overflow','cursor','box-shadow','outline','transform','min-width','max-width','max-height','align-items','justify-content','white-space','text-overflow','visibility','pointer-events','content'];
      for(const el of document.querySelectorAll('body *')){const cs=getComputedStyle(el);const o={};for(const p of P)o[p]=cs.getPropertyValue(p);out.push([el.tagName+'.'+(el.className&&el.className.baseVal===undefined?el.className:''),o])}return out}"""
    def run(css,tag):
        pg.route('**/css/styles.css*',lambda r: r.fulfill(status=200,content_type='text/css',body=css))
        res={}
        pg.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';document.head.append(s)})")
        s.boot()
        ev("""async()=>{const mk=(t,b,c,p,l)=>{const x=blank();x.title=t;x.body=b;x.color=c;x.pinned=!!p;x.labels=l||[];notes.push(x);for(const a of x.labels)if(!LB.includes(a))LB.push(a)};
          mk('Alpha','first note text',1,true,['Work']);mk('Beta','second',3,false,['Home','Work']);mk('Gamma','third note with more text to wrap around the card width and make a taller card',5);mk('Delta','',7);
          const l=blank();l.title='List';l.isList=true;l.items=[{t:'one',d:true},{t:'two',d:false}];l.color=2;notes.push(l);save();await __A.flush()}"""); s.settle()
        ev(f"Store.setupEncryption('{PASS}')"); s.settle()
        ev("""async()=>{const x=blank();x.title='Secret';x.body='hidden';x.enc=true;x.color=4;notes.push(x);save();await __A.flush()}"""); s.settle()
        ev("async()=>{await kvSet('dir',await navigator.storage.getDirectory());localStorage.setItem('keep-mode','folder')}")
        pg.reload(); pg.wait_for_selector('.dlg[aria-label="Unlock encrypted notes"]',timeout=20000); pg.keyboard.press('Escape'); s.settle()   # real start-up path: the unlock prompt is dismissed, so the app starts locked
        def snap(name): print('  ..',tag,name,flush=True); res[name]=ev(DUMP)
        snap('home locked')
        pg.hover('.vg>.card >> nth=0'); s.settle(); snap('card hover')
        pg.hover('.vg>.card >> nth=0'); s.settle(); snap('card hover 2')
        pg.mouse.move(5,5)
        ev("(()=>{const b=document.querySelectorAll('.vg>.card')[1].querySelector('[data-act=colpick]');b&&b.click()})()"); s.settle(); snap('colour picker')
        pg.keyboard.press('Escape'); s.settle()
        ev("(()=>{const b=document.querySelectorAll('.vg>.card')[1].querySelector('[data-act=lblpick]');b&&b.click()})()"); s.settle(); snap('label picker')
        pg.keyboard.press('Escape'); s.settle()
        pg.click('#expbtn'); s.settle(); snap('export dialog'); pg.keyboard.press('Escape'); s.settle()
        pg.click('#impbtn'); s.settle(); snap('import dialog'); pg.keyboard.press('Escape'); s.settle()
        pg.click('#setbtn'); s.settle(); snap('settings dialog'); pg.keyboard.press('Escape'); s.settle()
        pg.click('#lockbtn'); s.settle(); snap('unlock dialog'); pg.fill('#pw','wrong'); pg.keyboard.press('Enter'); s.settle(); snap('unlock wrong'); pg.fill('#pw',PASS); pg.keyboard.press('Enter'); s.settle()
        snap('home unlocked')
        ev("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.title==='Beta'))}"); s.settle(); snap('editor plain')
        ev("document.querySelector('.ov .editor .pin')&&document.querySelector('.ov .editor .pin').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))"); snap('editor pin hover')
        pg.keyboard.press('Escape'); s.settle()
        ev("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.title==='Secret'))}"); s.settle(); snap('editor encrypted')
        snap('padlock hover')
        pg.keyboard.press('Escape'); s.settle()
        ev("void(window.__c=Crypt.changeDialog())"); s.settle(); snap('change dialog'); pg.keyboard.press('Escape'); s.settle()
        ev("void(window.__r=Crypt.resetDialog({}))"); s.settle(); snap('reset dialog'); pg.keyboard.press('Escape'); s.settle()
        ev("async()=>{await Store.loadAll(notes);openModal(notes.find(n=>n.title==='List'))}"); s.settle(); snap('editor list'); pg.keyboard.press('Escape'); s.settle()
        pg.set_viewport_size({'width':420,'height':800}); s.settle(); snap('narrow home'); pg.set_viewport_size({'width':1200,'height':900})
        pg.unroute('**/css/styles.css*')
        return res
    # fresh OPFS for each run
    def wipe(): s.wipe(); pg.evaluate("localStorage.clear()")
    a=run(OLD,'old'); wipe(); pg.evaluate("indexedDB.databases&&indexedDB.databases().then(d=>d.forEach(x=>indexedDB.deleteDatabase(x.name)))")
    b=run(NEWCSS,'new')
    total=0; shown=0
    for name in a:
        A,B=a[name],b.get(name)
        if B is None: print('MISSING state',name); continue
        if len(A)!=len(B): print(f'STATE {name}: element count differs {len(A)} vs {len(B)}'); total+=1; continue
        d=[]
        for i,((ta,sa),(tb,sb)) in enumerate(zip(A,B)):
            for p in sa:
                if sa[p]!=sb[p]: d.append((i,ta,p,sa[p],sb[p]))
        print(f'STATE {name}: {len(A)} elements, {len(d)} property differences'); total+=len(d)
        for x in d[:6]: print('    ',x)
    print('TOTAL DIFFERENCES',total)

finish()
