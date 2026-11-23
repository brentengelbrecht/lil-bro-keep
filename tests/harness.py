"""Shared helpers for the browser tests.

  from harness import ok, finish, session

  with session(folder=True) as s:           # a browser, one page, and the notes-folder helpers
      pg, ev = s.pg, s.evaluate
      s.boot()                              # reload the app on an (empty) folder in the browser's private file system
      ...
      ok(cond, 'what is being checked')
  finish()                                  # prints the failure count and sets the exit code

Waiting: prefer a condition to a pause.
  s.settle()        until the app has nothing in flight (no pending save, scan, lazy read or spinner, no dialog button showing "working")
                    and stays that way for a short quiet moment
  s.until(js, arg)  until a JavaScript expression is true (page.wait_for_function)
  s.pause(ms)       a real pause, for the few things that are about time itself (a debounce, an idle timeout)
"""
import sys
from contextlib import contextmanager
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8765/index.html'
API = """
window.__A={load:()=>loadFolder(),flush:()=>flush(),mode:()=>MODE,fstate:()=>fstate};"""
GRANT = ("FileSystemHandle.prototype.queryPermission=async()=>'granted';"
         "FileSystemHandle.prototype.requestPermission=async()=>'granted';window.confirm=()=>true")
SETTLED = """()=>{
  const g=n=>{try{return (0,eval)(n)}catch(e){return undefined}};
  const idle=!g('pending')&&!g('reconciling')&&!(g('loading')&&g('loading').size);
  const spin=document.querySelector('#spin'),busy=spin&&getComputedStyle(spin).display!=='none';
  const working=document.querySelector('.dlg [data-c=go][disabled]');
  return idle&&!busy&&!working}"""
STATE = """()=>{const g=n=>{try{return (0,eval)(n)}catch(e){return 'ERR '+e.message}};const x=document.querySelector('#spin');
  return {pending:g('pending'),reconciling:g('reconciling'),loading:g('loading&&loading.size'),spin:x&&getComputedStyle(x).display,working:!!document.querySelector('.dlg [data-c=go][disabled]')}}"""
_OPFS = {
    'ls': """async d=>{let r=await navigator.storage.getDirectory();for(const p of d.split('/').filter(Boolean))r=await r.getDirectoryHandle(p);const o=[];for await(const [n,e] of r.entries())o.push(n);return o.sort()}""",
    'rd': """async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);return await(await(await r.getFileHandle(fn)).getFile()).text()}""",
    'rdb': """async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);return Array.from(new Uint8Array(await(await(await r.getFileHandle(fn)).getFile()).arrayBuffer()))}""",
    'wr': """async([path,text])=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p,{create:true});const w=await(await r.getFileHandle(fn,{create:true})).createWritable();await w.write(text);await w.close()}""",
    'rm': """async path=>{const ps=path.split('/'),fn=ps.pop();let r=await navigator.storage.getDirectory();for(const p of ps)r=await r.getDirectoryHandle(p);await r.removeEntry(fn)}""",
    'wipe': """async()=>{const root=await navigator.storage.getDirectory();for await(const [n] of root.entries())await root.removeEntry(n,{recursive:true})}""",
}


def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg, flush=True)
    if not cond:
        ok.bad += 1


ok.bad = 0


def finish():
    print('FAILURES:', ok.bad)
    sys.exit(1 if ok.bad else 0)


class Session:
    def __init__(self, browser, context, page, folder):
        self.browser, self.context, self.pg, self.errs = browser, context, page, []
        self.evaluate = page.evaluate
        page.on('pageerror', lambda e: self.errs.append(str(e)))
        page.on('console', lambda m: self.errs.append(m.text) if m.type == 'error' else None)
        self.folder = folder

    # ---- waiting
    def settle(self, timeout=20000, quiet=150):
        """Waits until the app is idle and stays idle for a short quiet moment (work started by the last action, which may be asynchronous, registers itself in that time)."""
        try:
            for _ in range(20):
                self.pg.wait_for_function(SETTLED, timeout=timeout)
                self.pg.wait_for_timeout(quiet)
                if self.pg.evaluate(SETTLED):
                    break
        except Exception:
            print('settle() timed out; the app still reports:', self.pg.evaluate(STATE), flush=True)
            raise
        self.pg.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")

    def until(self, js, arg=None, timeout=20000):
        """Waits until a JavaScript expression is true; or, with arg, until the arrow function js(arg) is."""
        self.pg.wait_for_function(('()=>(' + js + ')') if arg is None else js, arg=arg, timeout=timeout)

    def pause(self, ms):
        self.pg.wait_for_timeout(ms)

    def until_draft(self, title, timeout=10000):
        """The editor draft (keep-draft) holds this title: it is written a moment after typing stops."""
        self.pg.wait_for_function("t=>{const d=JSON.parse(localStorage.getItem('keep-draft')||'null');return !!d&&d.note.title===t}", arg=title, timeout=timeout)

    # ---- the notes folder in the browser's private file system
    def ls(self, d=''): return self.pg.evaluate(_OPFS['ls'], d)
    def rd(self, path): return self.pg.evaluate(_OPFS['rd'], path)
    def rdb(self, path): return self.pg.evaluate(_OPFS['rdb'], path)
    def wr(self, path, text): return self.pg.evaluate(_OPFS['wr'], [path, text])
    def rm(self, path): return self.pg.evaluate(_OPFS['rm'], path)
    def wipe(self): self.pg.evaluate(_OPFS['wipe'])

    def boot(self):
        """Reloads the app and opens the folder (the private file system's root) as the notes folder."""
        pg = self.pg
        pg.evaluate("localStorage.removeItem('keep-mode')")
        pg.reload()
        pg.wait_for_function("()=>typeof loadFolder==='function'&&typeof Store!=='undefined'")
        pg.evaluate(API)
        pg.evaluate("async()=>{ROOT=await navigator.storage.getDirectory();await __A.load()}")
        self.settle()

    def new_tab(self):
        page = self.context.new_page()
        if self.folder:
            page.add_init_script(GRANT)
        return page


@contextmanager
def session(folder=False, width=1200, height=900, url=BASE, wipe=True):
    """A browser and one page. With folder=True the page may use the File System Access API without prompts, and the private file system is emptied."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        s = Session(browser, context, page, folder)
        if folder:
            page.add_init_script(GRANT)
        page.goto(url)
        if folder:
            page.wait_for_function("()=>typeof Store!=='undefined'")
            if wipe:
                s.wipe()
        try:
            yield s
        finally:
            if s.errs:
                print('errors', s.errs)
            browser.close()
