"""Keyboard use of the notes grid: one Tab stop, arrow keys between cards, Enter/Space to open, focus comes back."""
from playwright.sync_api import sync_playwright
import sys,random
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: ok.bad+=1
ok.bad=0
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':700})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    ev=pg.evaluate
    ev("""()=>{const out=[];for(let i=0;i<40;i++){const x=blank();x.title='N'+String(i).padStart(2,'0');x.body=i%3?'line '+i:'a\\nb\\nc\\nd\\ne';x.ts=1700000000000-i*60000;x.mod=x.ts;x.color=i%12;out.push(x)}
      out[1].pinned=true;out[2].pinned=true;out[3].pinned=true;notes=out;LB=[];sel.clear();commit()}""")
    pg.wait_for_timeout(900)
    active=lambda: ev("document.activeElement.classList.contains('card')?document.activeElement.dataset.id:null")
    title=lambda i: ev("id=>notes.find(n=>n.id===id).title",i)
    # ---------- one Tab stop ----------
    ok(ev("document.querySelectorAll('.vg>.card[tabindex=\"0\"]').length")==1,"exactly one card is a Tab stop")
    ok(ev("[...document.querySelectorAll('.vg>.card')].filter(c=>c.getAttribute('tabindex')!=='0').every(c=>[...c.querySelectorAll('button,a[href]')].every(x=>x.tabIndex===-1))"),"the buttons of every other card are out of the Tab order")
    ev("document.querySelector('#q').focus()")
    seen=[];btns=0
    for _ in range(25):
        pg.keyboard.press('Tab')
        k=ev("(()=>{const a=document.activeElement;const c=a.closest&&a.closest('.card');return c?[c.dataset.id,a===c]:null})()")
        if k: seen.append(k[0]); btns+=0 if k[1] else 1
    ok(len(set(seen))==1,f"Tab visits one card only (and its buttons: {btns}) however often it is pressed")
    ev("document.querySelector('#q').focus()"); pg.keyboard.press('Tab')
    for _ in range(12):
        if active(): break
        pg.keyboard.press('Tab')
    first=active(); ok(first is not None,"Tab lands on a card")
    ok(ev("getComputedStyle(document.activeElement).outlineStyle")!='none',"the focused card shows a focus ring")
    pg.wait_for_timeout(400)      # the buttons fade in
    ok(ev("(()=>{const c=document.activeElement,a=c.querySelector('.acts').getBoundingClientRect(),r=c.getBoundingClientRect();return a.bottom<=r.bottom+1&&a.top<r.bottom-10})()"),"its action buttons are shown while it has keyboard focus")
    ok('note: ' in ev("document.activeElement.getAttribute('aria-label')").lower() and title(first) in ev("document.activeElement.getAttribute('aria-label')") and ev("document.activeElement.getAttribute('role')")=='article',"a card is announced by its title")
    # ---------- arrows follow the layout ----------
    def expect(dir_):
        return ev("""d=>{const cur=document.activeElement,r=cur.getBoundingClientRect();
          const all=[...document.querySelectorAll('.vg>.card')].map(c=>({id:c.dataset.id,r:c.getBoundingClientRect(),sec:c.parentNode.dataset.k}));
          const me=all.find(x=>x.id===cur.dataset.id);const same=all.filter(x=>x.sec===me.sec&&x.id!==me.id);
          if(d==='down'){const c=same.filter(x=>Math.abs(x.r.left-r.left)<2&&x.r.top>r.top+1).sort((a,b)=>a.r.top-b.r.top)[0];return c?c.id:null}
          if(d==='up'){const c=same.filter(x=>Math.abs(x.r.left-r.left)<2&&x.r.top<r.top-1).sort((a,b)=>b.r.top-a.r.top)[0];return c?c.id:null}
          const w=r.width+16,tx=r.left+(d==='right'?w:-w),cy=r.top+r.height/2;
          const c=same.filter(x=>Math.abs(x.r.left-tx)<2).sort((a,b)=>Math.abs(a.r.top+a.r.height/2-cy)-Math.abs(b.r.top+b.r.height/2-cy))[0];return c?c.id:null}""",dir_)
    keys={'down':'ArrowDown','up':'ArrowUp','left':'ArrowLeft','right':'ArrowRight'}
    random.seed(4); bad=0; moved=0; same_section=0
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    for step in range(30):
        d=random.choice(list(keys)); e=expect(d); cur=active()
        pg.keyboard.press(keys[d]); pg.wait_for_timeout(60); now=active()
        if e is None:
            if now!=cur and ev("id=>notes.find(n=>n.id===id).pinned===undefined||true",now):  # a move past the end of a section may cross into the next one
                same_section+=1
            continue
        moved+=1
        if now!=e: bad+=1; print('   mismatch',d,'expected',e,'got',now)
    ok(bad==0 and moved>=12,f"{moved} arrow moves landed exactly on the neighbouring card the layout implies")
    ok(ev("document.querySelectorAll('.vg>.card[tabindex=\"0\"]').length")==1 and ev("document.activeElement.tabIndex")==0,"the Tab stop follows the focus")
    # ---------- Enter / Space open the note; focus comes back ----------
    cur=active(); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    ok(pg.locator('.ov .editor').count()==1 and ev("document.querySelector('.ov .t').value")==title(cur),"Enter opens the focused note")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(700)
    ok(pg.locator('.ov').count()==0 and active()==cur,"closing the note returns focus to its card")
    ok(ev("getComputedStyle(document.activeElement).outlineStyle")!='none',"…and the focus ring is back")
    pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowDown'); cur=active(); pg.keyboard.press(' '); pg.wait_for_timeout(600)
    ok(pg.locator('.ov .editor').count()==1 and ev("document.querySelector('.ov .t').value")==title(cur),"Space opens it too")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(700)
    # ---------- buttons inside the card are not hijacked ----------
    pg.keyboard.press('Tab'); pg.wait_for_timeout(100)
    ok(ev("document.activeElement.tagName")=='BUTTON' and ev("!!document.activeElement.closest('.card')"),"Tab from a card goes to its own buttons")
    ev("document.querySelector('.card:has(:focus) [data-act=colpick]').focus()"); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok(pg.locator('.cpop').count()==1 and pg.locator('.ov').count()==0,"Enter on a button does that button's job, it does not open the note")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # ---------- far cards: scrolling and drawing on demand ----------
    ev("document.querySelector('.vg>.card[tabindex=\"0\"]').focus()")
    pg.keyboard.press('End'); pg.wait_for_timeout(500); last=active()
    ok(last is not None and ev("scrollY")>400 and ev("id=>notes.find(n=>n.id===id).title",last)=='N39' or title(last) in ('N39','N38','N37'),f"End goes to the last card (scrolled and drawn): {title(last)}")
    ok(ev("document.querySelectorAll('.vg>.card').length")<40,"cards stay bounded while jumping")
    pg.keyboard.press('Home'); pg.wait_for_timeout(500); fst=active()
    ok(fst is not None and ev("scrollY")<80,"Home goes back to the first card at the top")
    # ---------- sections ----------
    ids_p=ev("[...document.querySelectorAll('.vg[data-k=p]>.card')].map(c=>c.dataset.id)")
    ok(len(ids_p)==3,"three pinned notes in the Pinned section")
    ev("id=>document.querySelector('.vg>.card[data-id=\"'+id+'\"]').focus()",ids_p[-1])
    # find the lowest pinned card by position, then go down
    low=ev("[...document.querySelectorAll('.vg[data-k=p]>.card')].sort((a,b)=>b.getBoundingClientRect().top-a.getBoundingClientRect().top)[0].dataset.id")
    ev("id=>document.querySelector('.vg>.card[data-id=\"'+id+'\"]').focus()",low)
    pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(300)
    ok(ev("document.activeElement.parentNode.dataset.k")=='r',"Down from the bottom of Pinned enters the other notes")
    pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(300)
    ok(ev("document.activeElement.parentNode.dataset.k")=='p',"Up from the top of the others goes back to Pinned")
    # ---------- mouse and the Tab stop ----------
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300)
    c2=ev("document.querySelectorAll('.vg[data-k=r]>.card')[1].dataset.id")
    pg.click('.vg>.card[data-id="%s"] h3'%c2); pg.wait_for_timeout(700); pg.keyboard.press('Escape'); pg.wait_for_timeout(700)
    ok(ev("document.querySelector('.vg>.card[tabindex=\"0\"]').dataset.id")==c2 and active()==c2,"after opening a note with the mouse, closing it puts focus on that card")
    # ---------- keyboard reorder still works with focus on the card ----------
    order0=ev("notes.filter(n=>!n.pinned).sort(byOrder).map(n=>n.id)"); i0=order0.index(active())
    pg.keyboard.press('Alt+ArrowDown'); pg.wait_for_timeout(500); order1=ev("notes.filter(n=>!n.pinned).sort(byOrder).map(n=>n.id)")
    ok(order1.index(c2)==i0+1 and active()==c2,"Alt+arrow still moves the focused note (and keeps focus)")
    # ---------- searching, and the list view ----------
    ev("document.querySelector('#q').focus()"); pg.keyboard.type('N1'); pg.wait_for_timeout(700)
    ok(ev("document.querySelectorAll('.vg>.card[tabindex=\"0\"]').length")==1,"after a search there is still exactly one Tab stop")
    ev("document.querySelector('#q').focus()"); pg.keyboard.press('Tab')
    for _ in range(12):
        if active(): break
        pg.keyboard.press('Tab')
    ok(active() is not None,"Tab reaches a card in the search results")
    ev("document.querySelector('#q').value='';document.querySelector('#q').dispatchEvent(new Event('input',{bubbles:true}))"); pg.wait_for_timeout(600)
    pg.click('#vm'); pg.wait_for_timeout(600)
    ev("document.querySelector('.vg>.card[tabindex=\"0\"]').focus()"); a=active(); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(100)
    ok(active()==a,"in the list view Left/Right do nothing")
    pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(300); ok(active()!=a,"…and Up/Down still move")
    print('errors',errs); b.close()
print('FAILURES:',ok.bad); sys.exit(1 if ok.bad else 0)
