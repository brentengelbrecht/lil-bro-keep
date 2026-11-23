"""Google Takeout import and the HTML export (characterisation test: describes how they behave today)."""
from playwright.sync_api import sync_playwright
import sys,base64,json,re
from harness import ok,finish
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
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(600)
    ev=pg.evaluate
    ev("notes=[];LB=[];commit()"); pg.wait_for_timeout(300)
    files=[
      F('shopping.html',page('Shopping',color='BLUE',date='4 Jun 2019, 15:07:08',items=[('Milk',True),('Eggs',False)],pinned=True,labels=['Home'])),
      F('plain.html',page('Plain','First line<br>second line',color='RED',date='18 Oct 2024, 11:55:31',labels=['Work'],links=['https://example.com/x'])),
      F('pic.html',page('With picture','bold text',images=['pic.png'])),
      F('pic.json',json.dumps({'createdTimestampUsec':1500000000000000,'userEditedTimestampUsec':1500000100000000,'textContentHtml':'<b>bold</b> text'}),'application/json'),
      F('pic.png',PNG,'image/png'),
      F('gone.html',page('Gone','deleted note',date='1 Jan 2020, 10:00:00',trashed=True)),
      F('ghost.html',page('Ghost image','see attachment',images=['ghost.jpg'])),
      F('empty.html',page('','')),
      F('random.html','<html><body><p>not a note</p></body></html>'),
    ]
    pg.click('#impbtn'); pg.wait_for_timeout(300)
    ok(pg.locator('.dlg[aria-label="Import from Google Takeout"]').count()==1 and 'Choose folder' in pg.inner_text('.dlg'),"the import dialog opens")
    pg.set_input_files('#fi',files); pg.wait_for_timeout(2500)
    ok(pg.locator('.dlg').count()==0,"the dialog closes by itself once the import is under way")
    res=pg.locator('.toast .tm').last.inner_text(); print('   ',res)
    ok('Imported 5 notes and 1 attachment.' in res,"five notes and one attachment are imported")
    ok('Skipped 2' in res and '1 attachment file was not found' in res,"empty and non-note pages are skipped; a missing attachment is reported")
    T=lambda t: ev("t=>{const n=notes.find(x=>x.title===t);return n&&{isList:n.isList,items:n.items,color:n.color,pinned:n.pinned,trashed:n.trashed,labels:n.labels,links:n.links,body:n.body,html:n.html,att:n.att,ts:n.ts,mod:n.mod}}",t)
    s=T('Shopping')
    ok(s['isList'] and [(i['t'],i['d']) for i in s['items']]==[('Milk',True),('Eggs',False)],"a checklist keeps its items and which are ticked")
    ok(s['color']==6 and s['pinned'] and s['labels']==['Home'],"colour, pinned state and label come across")
    ok(s['ts']==ev("new Date(2019,5,4,15,7,8).getTime()"),"the date is read from the note's own heading as local time")
    ok('Home' in ev("LB"),"the label is added to the label list")
    p_=T('Plain'); ok(p_['body']=='First line\nsecond line' and p_['color']==1 and p_['labels']==['Work'],"text with line breaks, colour and label")
    ok(p_['links']==[{'url':'https://example.com/x'}],"a link in the note is kept")
    c=T('With picture'); ok(len(c['att'])==1 and c['att'][0]['kind']=='image' and c['att'][0]['name']=='pic.png' and c['att'][0]['w']==1,"the attached image is stored with its size")
    ok(('<strong>' in (c['html'] or '') or '<b>' in (c['html'] or '')) and c['body']=='bold text',"bold formatting is taken from the .json file")
    ok(c['ts']==1500000000000 and c['mod']==1500000100000,"with no heading date, the dates come from the .json file")
    ok(T('Gone')['trashed']==True,"a trashed note stays trashed")
    ok(T('Ghost image')['att']==[],"a note whose attachment file is missing is still imported without it")
    n0=ev("notes.length")
    # ---- an import starts from a clean browser: the notes already stored are cleared first (after a confirmation)
    ev("notes.push(Object.assign(blank(),{title:'Leftover note',body:'x'}));LB.push('Leftover label');commit()"); pg.wait_for_timeout(300)
    ev("window.__asked='';window.confirm=m=>{window.__asked=m;return false}")
    pg.click('#impbtn'); pg.wait_for_timeout(200); pg.set_input_files('#fi',files); pg.wait_for_timeout(800)
    ok('clears the 6 notes stored in this browser' in ev("window.__asked") and ev("notes.some(n=>n.title==='Leftover note')") and pg.locator('.dlg').count()==1,"cancelling the confirmation keeps every note and the dialog stays open")
    ev("window.confirm=()=>true")
    pg.set_input_files('#fi',files); pg.wait_for_timeout(2500); res=pg.locator('.toast .tm').last.inner_text()
    ok(not ev("notes.some(n=>n.title==='Leftover note')") and 'Leftover label' not in ev("LB"),"confirming clears the notes and labels that were stored")
    ok('Imported 5 notes' in res and ev("notes.length")==n0,f"the same files imported again give the same five notes, not duplicates: {res[:70]}")
    ev("window.confirm=()=>true")
    # ---- an image file chosen with notes: attached to the note
    pg.click('#impbtn'); pg.wait_for_timeout(200); pg.keyboard.press('Escape'); ok(pg.locator('.dlg').count()==0,"Escape closes the dialog")
    pg.click('#impbtn'); pg.wait_for_timeout(200); pg.click('.dlg [data-i=x]'); ok(pg.locator('.dlg').count()==0,"the Close button closes it")
    pg.click('#impbtn'); pg.wait_for_timeout(200); pg.set_input_files('#fi',[F('readme.txt','hello','text/plain')]); pg.wait_for_timeout(300)
    ok('No HTML note files found' in pg.inner_text('.dlg .res'),"a selection without note files says so")
    pg.keyboard.press('Escape')
    # ---- export
    ev("""()=>{const mk=(o)=>Object.assign(blank(),o);
      notes=[mk({title:'Zebra <script>alert(1)</script>',body:'plain & simple',ts:5}),
             mk({title:'Pinned one',body:'pinned',html:'with <b>bold</b>',pinned:true,ts:4}),
             mk({title:'List',isList:true,items:[{t:'done',d:true},{t:'todo',d:false}],ts:3,labels:['x']}),
             mk({title:'Trashed',body:'t',trashed:true,ts:2})];LB=['x'];commit()}""")
    pg.wait_for_timeout(300)
    pg.click('#expbtn'); pg.wait_for_timeout(300)
    ok(pg.inner_text('.dlg .stat b')=='3' and 'notes in the current view' in pg.inner_text('.dlg .stat'),"the dialog counts the notes in the current view (trash excluded)")
    ev("""()=>{window.__saved=null;window.showSaveFilePicker=async o=>{window.__opts=o;return{name:'my notes.html',createWritable:async()=>({write:async t=>{window.__saved=t},close:async()=>{}})}}}""")
    pg.click('.dlg [data-x=save]'); pg.wait_for_timeout(700)
    html=ev("window.__saved") or ''
    ok('Saved 3 notes to “my notes.html”.' in pg.inner_text('.dlg .res'),"it reports where it saved")
    ok('<title>my notes</title>' in html and '<h1>my notes</h1>' in html,"the page heading is the chosen file name")
    pos=[html.find(x) for x in ('<h2>Pinned one</h2>','<h2>Zebra','<h2>List</h2>')]
    ok(all(x>0 for x in pos) and pos==sorted(pos),"pinned notes come first, then the rest in the order shown")
    ok('&lt;script&gt;' in html and '<script>alert' not in html,"titles are escaped")
    ok('with <b>bold</b>' in html and 'plain &amp; simple' in html,"formatted text keeps its formatting; plain text is escaped")
    ok('☑ done<br>☐ todo' in html and 'Trashed' not in html,"checklists show ticks; trashed notes are left out")
    ok(ev("window.__opts.suggestedName").startswith('lil-bro-keep-') and ev("window.__opts.suggestedName").endswith('.html'),"the suggested file name carries the date")
    # ---- cancelling the picker
    ev("()=>{window.showSaveFilePicker=async()=>{const e=new Error('x');e.name='AbortError';throw e}}"); pg.click('.dlg [data-x=save]'); pg.wait_for_timeout(400)
    ok(pg.inner_text('.dlg .res')=='' ,"cancelling the file picker is silent")
    ev("()=>{window.showSaveFilePicker=async()=>{throw new Error('disk full')}}"); pg.click('.dlg [data-x=save]'); pg.wait_for_timeout(400)
    ok('Couldn’t save the file: disk full' in pg.inner_text('.dlg .res'),"a failure is explained")
    # ---- browsers without a save picker download instead
    ev("()=>{window.showSaveFilePicker=undefined}")
    with pg.expect_download() as dl: pg.click('.dlg [data-x=save]')
    d=dl.value; txt=open(d.path(),encoding='utf-8').read()
    ok(re.match(r'lil-bro-keep-\d{4}-\d\d-\d\d\.html',d.suggested_filename) and '<h2>Pinned one</h2>' in txt,"without a save picker the page is downloaded")
    ok('Downloaded 3 notes' in pg.inner_text('.dlg .res'),"and says so")
    pg.keyboard.press('Escape')
    # ---- only the current view is exported; an empty view cannot be exported
    pg.click('#lbls button[data-lf=x]'); pg.wait_for_timeout(300); pg.click('#expbtn'); pg.wait_for_timeout(200)
    ok(pg.inner_text('.dlg .stat b')=='1' and 'note in the current view' in pg.inner_text('.dlg .stat') and 'notes in' not in pg.inner_text('.dlg .stat'),"a label filter limits the export to the notes shown"); pg.keyboard.press('Escape')
    pg.click('#nav button[data-v=trash]'); pg.wait_for_timeout(300); ev("notes.forEach(n=>n.trashed=false);commit()"); pg.wait_for_timeout(300)
    pg.click('#expbtn'); pg.wait_for_timeout(200)
    ok('no notes in the current view' in pg.inner_text('.dlg') and ev("document.querySelector('.dlg [data-x=save]').disabled"),"with nothing shown the save button is disabled")
    print('errors',errs); b.close()
finish()
