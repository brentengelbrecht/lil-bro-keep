"""Runs the browser tests with JavaScript coverage on and reports which code they never executed.
Usage (from the project folder): python3 tests/coverage.py [--detail]. Slower than run_all.py."""
import sys,os,runpy,subprocess,time,json,re,collections
from playwright.sync_api import sync_playwright,Browser
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
srv=subprocess.Popen([sys.executable,'-m','http.server','8765'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
union={}      # file -> bytearray of covered flags (1 = ran in at least one test)
source={}
pages=[]      # (page, cdp session)
def merge(entries):
    for e in entries:
        m=re.match(r'https?://[^/]+/([^?]+\.js)',e.get('url',''))
        if not m:continue
        name=m.group(1)
        if name not in source:source[name]=open(os.path.join(root,name),encoding='utf-8').read()
        n=len(source[name])
        cov=bytearray(n)
        rs=[r for fn in e['functions'] for r in fn['ranges']]
        rs.sort(key=lambda r:(r['startOffset'],-(r['endOffset']-r['startOffset'])))
        for r in rs:
            a,b=min(r['startOffset'],n),min(r['endOffset'],n)
            cov[a:b]=(b'\x01' if r['count']>0 else b'\x00')*(b-a)
        u=union.setdefault(name,bytearray(n))
        for i in range(n):
            if cov[i]:u[i]=1
def take(pg):
    for p,cdp in pages:
        if p is pg:
            try:merge(cdp.send('Profiler.takePreciseCoverage')['result'])
            except Exception as ex:print('take failed',ex,file=sys.stderr)
def instrument(pg):
    cdp=pg.context.new_cdp_session(pg)
    cdp.send('Profiler.enable');cdp.send('Profiler.startPreciseCoverage',{'callCount':True,'detailed':True})
    pages.append((pg,cdp));return pg
from playwright.sync_api import BrowserContext,Page
for cls in (Browser,BrowserContext):
    orig=cls.new_page
    def make(orig):
        def f(self,*a,**k):return instrument(orig(self,*a,**k))
        return f
    cls.new_page=make(orig)
for meth in ('reload','goto','click'):
    orig=getattr(Page,meth)
    def make2(orig):
        def f(self,*a,**k):
            take(self);return orig(self,*a,**k)
        return f
    setattr(Page,meth,make2(orig))
orig_close=Browser.close
def close(self,*a,**k):
    for pg,cdp in pages:
        try:merge(cdp.send('Profiler.takePreciseCoverage')['result'])
        except Exception:pass
    pages.clear();return orig_close(self,*a,**k)
Browser.close=close
import base64
STATE=os.environ.get('COV_STATE','/tmp/cov_union.json')
if os.path.exists(STATE):
    for k,v in json.load(open(STATE)).items():
        union[k]=bytearray(base64.b64decode(v));source[k]=open(os.path.join(root,k),encoding='utf-8').read()
args=[a for a in sys.argv[1:] if not a.startswith('--')]
tests=[a for a in args]
try:
    for t in tests:
        sys.argv=[t]
        try:runpy.run_path(f'tests/{t}.py',run_name='__main__')
        except SystemExit:pass
        print('ran',t,file=sys.stderr)
finally:
    srv.terminate()
    json.dump({k:base64.b64encode(bytes(v)).decode() for k,v in union.items()},open(STATE,'w'))
if '--report' not in sys.argv[1:] and tests:
    sys.exit(0)
# the file list comes from the script tags in index.html, in load order, so a new script is never left out of the report
order=[m[:-3] for m in re.findall(r'<script[^>]+src="([^"?]+\.js)',open(os.path.join(root,'index.html'),encoding='utf-8').read())]
out={}
for f in order:
    name=f+'.js'
    if name not in union:continue
    s=source[name];u=union[name]
    # ignore blank space and comment-only text when judging; count code bytes only
    code=bytearray(len(s));i=0
    for m in re.finditer(r'/\*.*?\*/|//[^\n]*|\s+',s,re.S):
        pass
    mask=bytearray(b'\x01'*len(s))
    for m in re.finditer(r'/\*.*?\*/|(?<![:\'"])//[^\n]*|\s+',s,re.S):mask[m.start():m.end()]=b'\x00'*(m.end()-m.start())
    tot=sum(mask);cov=sum(1 for i in range(len(s)) if mask[i] and u[i])
    # uncovered runs (code only) of useful size
    runs=[];i=0
    while i<len(s):
        if mask[i] and not u[i]:
            j=i
            while j<len(s) and (not u[j] or not mask[j]):j+=1
            seg=s[i:j]
            if sum(mask[i:j])>=120:runs.append((sum(mask[i:j]),s[:i].count('\n')+1,s[i:j].strip().split('\n')[0][:90]))
            i=j
        else:i+=1
    out[f]=(cov,tot,sorted(runs,reverse=True))
print('\nCODE COVERED BY THE TESTS (bytes of code, comments excluded)')
T=C=0
for f in order:
    if f in out:
        c,t,_=out[f];T+=t;C+=c;print(f'  {f:14s} {100*c/t:5.1f}%   ({t-c} bytes never run)')
print(f'  {"all":14s} {100*C/T:5.1f}%')
print('\nBIGGEST BLOCKS NEVER RUN (bytes, file:line, first line)')
allruns=[(b,f,l,t) for f,(c,tt,r) in out.items() for (b,l,t) in r]
for b,f,l,t in sorted(allruns,reverse=True)[:40]:print(f'  {b:5d}  {f}.js:{l:<4d} {t}')
