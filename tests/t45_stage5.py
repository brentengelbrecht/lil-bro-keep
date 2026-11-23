"""Stage 5: encrypted import, the rule that a note stored unencrypted is never written encrypted, and decrypting large attachments when a note is made unencrypted. (Header reused from t40.)\nOld:: a draft while editing, removed after Close, recovered after a crash, left alone while its tab is open. (Header reused from t40.)\nOld:: the vault, encrypted pages and attachments, locking and unlocking, the mask, and writing while locked. (Header reused from t39.)
Old doc: lazy loading and the links-only index: the index holds no note text, only the notes on screen are read, notes that were not read are
never rewritten or erased by a save, searching looks through unread pages, and disconnecting clears the browser."""
import sys,re,json,base64
from harness import ok,finish,session
PNG=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
def page(title='',content='',color='',date='',extra='',items=None,pinned=False,trashed=False,labels=(),links=(),images=()):
    cls='note'+(' '+color if color else '')
    body=f'<div class="{cls}">'
    if pinned: body+='<div class="pinned">Pinned</div>'
    if trashed: body+='<div class="trashed">Trashed</div>'
    if date: body+=f'<div class="heading"><div class="meta-icons"><span>icons</span></div>{date}</div>'
    body+=f'<div class="title">{title}</div>'
    if items is not None:
        body+='<div class="content"><ul class="list">'+''.join(f'<li class="listitem{" checked" if d else ""}"><span class="bullet">{"&#9745;" if d else "&#9744;"}</span><span class="text">{t}</span></li>' for t,d in items)+'</ul></div>'
    else: body+=f'<div class="content">{content}</div>'
    if images: body+='<div class="attachments">'+''.join(f'<div class="attachment"><img src="{i}" alt="Image"></div>' for i in images)+'</div>'
    chips=''.join(f'<span class="chip label"><span class="label-name">{l}</span></span>' for l in labels)+''.join(f'<a class="chip annotation" href="{u}">{u}</a>' for u in links)
    if chips: body+=f'<div class="chips">{chips}</div>'
    body+=extra+'</div>'
    return f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>{title}</title></head><body>{body}</body></html>'
def F(name,text,mime='text/html'): return {'name':name,'mimeType':mime,'buffer':text if isinstance(text,bytes) else text.encode()}
with session(folder=True) as s:
    pg,ev,errs,b,ctx=s.pg,s.evaluate,s.errs,s.browser,s.context
    boot,ls,rd,rdb,wr,rm=s.boot,s.ls,s.rd,s.rdb,s.wr,s.rm
    PASS='orbit lantern velvet mosaic harbor'
    ev=pg.evaluate
    boot()
    ev("async()=>{const x=blank();x.title='Legacy plain';x.body='written before encryption';notes.push(x);save();await __A.flush()}"); s.settle()
    legacy=ev("notes.find(n=>n.title==='Legacy plain').id")
    ev(f"Store.setupEncryption('{PASS}')"); s.settle()
    files=[
      F('shopping.html',page('Shopping',color='BLUE',date='4 Jun 2019, 15:07:08',items=[('Milk',True),('Eggs',False)],pinned=True,labels=['Home'])),
      F('plain.html',page('Plain','First line<br>second line',color='RED',date='18 Oct 2024, 11:55:31',labels=['Work'],links=['https://example.com/x'])),
      F('pic.html',page('With picture','bold text',images=['pic.png'])),
      F('pic.png',PNG,'image/png'),
    ]
    # ---- importing while locked asks for the passphrase; cancelling changes nothing
    ev("Store.lock()"); s.settle()
    n0=ev("notes.length")
    pg.click('#impbtn'); s.settle()
    ok('imported notes are encrypted' in pg.inner_text('.dlg'),"the import dialog says imported notes are encrypted when encryption is on")
    pg.set_input_files('#fi',files); s.settle()
    ok(pg.locator('.dlg[aria-label=\"Unlock encrypted notes\"]').count()==1,"a locked app asks for the passphrase before importing")
    pg.keyboard.press('Escape'); s.settle()
    ok(ev("notes.length")==n0 and 'cancelled' in pg.locator('.toast .tm').last.inner_text().lower(),"cancelling imports nothing")
    # ---- import for real
    pg.click('#impbtn'); s.settle(); pg.set_input_files('#fi',files); s.settle()
    pg.fill('#pw',PASS); pg.click('.dlg [data-c=go]'); s.settle()
    res=pg.locator('.toast .tm').last.inner_text(); print('   ',res)
    ok('Imported 3 notes and 1 attachment' in res,"after unlocking, the notes and the attachment are imported")
    imp=ev("notes.filter(n=>n.id!==%s).map(n=>[n.title,n.enc===true])"%json.dumps(legacy))
    ok(len(imp)==3 and all(e for _,e in imp),f"every imported note is encrypted: {imp}")
    s.settle()
    pages=[rd(f'0/{i}.html') for i in range(1,5) if True]
    alltext=' '.join(pages)
    ok(not any(w in alltext for w in ('Shopping','Milk','With picture','example.com','Home','Work')) and 'written before encryption' in alltext,"no imported text, label or link is readable in the folder (the old plain note still is)")
    atts=ev("notes.find(n=>n.title==='With picture').att.map(a=>[a.id,a.name])")
    ok(len(atts)==1 and atts[0][0].endswith('.enc') and atts[0][1]=='pic.png',f"the imported image is an encrypted file: {atts}")
    raw=rdb(atts[0][0]); ok(raw[:4]==[0x4c,0x42,0x4b,0x41],"and is not a readable PNG on disk")
    idx=rd('index.html')
    ok(idx.count('"enc":true')==3 and 'Shopping' not in idx and 'Home' not in idx and 'Work' not in idx and 'Legacy plain' in idx,"the index shows only placeholders for the three, and the plain note as before")
    ok(ev("notes.find(n=>n.title==='Shopping').labels")==['Home'] and ev("notes.find(n=>n.title==='Shopping').pinned")==True and ev("notes.find(n=>n.title==='Shopping').color")>0,"unlocked, labels, pin and colour are all there")
    # ---- importing the same files again is matched, not duplicated
    n1=ev("notes.length")
    pg.click('#impbtn'); s.settle(); pg.set_input_files('#fi',files); s.settle()
    res=pg.locator('.toast .tm').last.inner_text(); print('   ',res)
    ok(ev("notes.length")==n1 and 'Imported 0 notes' in res,f"importing again adds no duplicates (encrypted notes are matched too): {res[:90]}")
    # ---- a note stored unencrypted is never written encrypted, even by a stale draft
    ev("Store.lock()"); s.settle()
    ev("""id=>{const n=notes.find(x=>x.id===id);localStorage.setItem('keep-draft',JSON.stringify({v:1,sid:'dead-session',ts:Date.now(),isNew:false,enc:true,
      note:{id:n.id,title:'Stale draft edit',body:'edited by a draft that says enc',html:'',isList:false,items:[],labels:[],links:[],att:[],color:0,pinned:false,trashed:false,ts:n.ts,mod:n.mod,pos:n.pos,enc:true}}))}""",legacy)
    boot()
    pg.click('.dlg [data-d=go]'); s.settle()
    pg.fill('#pw',PASS); pg.click('.dlg [data-c=go]'); s.settle()
    ok(pg.locator('.ov .editor').count()==1 and pg.locator('.ov .editor .encb').count()==0,"the draft opens for the old note, with no padlock button")
    pg.click('.ov .editor [data-e=done]'); s.settle()
    pg_=rd(f'{int(legacy)//100}/{legacy}.html')
    ok('Stale draft edit' in pg_ and '"enc"' not in pg_ and ev(f"notes.find(n=>n.id==='{legacy}').enc")!=True,"the draft's edit is saved, but the note stays unencrypted")
    # ---- decrypting large attachments when a note is made unencrypted
    ev("""async()=>{const x=blank();x.title='Big attachments';x.body='two files';x.enc=true;notes.push(x);
      const mk=(n,k)=>{const a=new Uint8Array(n);for(let i=0;i<n;i++)a[i]=(i*k+7)%256;return a};
      addAtt(x,await Store.addMedia(x,new Blob([mk(2621440,7)],{type:'audio/mpeg'}),'audio','one.mp3'));
      addAtt(x,await Store.addMedia(x,new Blob([mk(1100000,13)],{type:'audio/mpeg'}),'audio','two.mp3'));
      save();await __A.flush();window.__bid=x.id}"""); s.settle()
    bid=ev("__bid")
    encs=ev(f"notes.find(n=>n.id==='{bid}').att.map(a=>a.id)")
    ok(len(encs)==2 and all(p.endswith('.enc') for p in encs),f"two large attachments are stored encrypted: {encs}")
    ev(f"openModal(notes.find(n=>n.id==='{bid}'))"); s.settle()
    pg.click('.ov .editor .encb'); s.settle()
    pg.click('.ov .editor [data-e=done]'); s.settle()
    plain=ev(f"notes.find(n=>n.id==='{bid}').att.map(a=>[a.id,a.type])")
    ok(all(p.endswith('.mp3') and t is None for p,t in plain),f"both become plain files and lose their stored type: {plain}")
    same=ev("""async()=>{const x=notes.find(n=>n.id===window.__bid);const mk=(n,k)=>{const a=new Uint8Array(n);for(let i=0;i<n;i++)a[i]=(i*k+7)%256;return a};
      const out=[];for(const [a,k,n] of [[x.att[0],7,2621440],[x.att[1],13,1100000]]){const ps=a.id.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);
        const b=new Uint8Array(await(await(await r.getFileHandle(fn)).getFile()).arrayBuffer()),e=mk(n,k);out.push(b.length===e.length&&b.every((v,i)=>v===e[i]))}return out}""")
    ok(same==[True,True],"their bytes are exactly the originals after the chunked decryption")
    left=[f for f in ls(f'media/audio/{int(bid)//100}') if f.endswith('.enc')]
    ok(left==[],f"no encrypted copies are left behind: {left}")
    pg_=rd(f'{int(bid)//100}/{bid}.html')
    ok('Big attachments' in pg_ and '.mp3' in pg_ and '"enc"' not in pg_,"and the page points to the plain files")
finish()
