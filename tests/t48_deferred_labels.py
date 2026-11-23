"""Deferred actions: a label renamed or deleted while encrypted notes are out of reach is written to an encrypted, append-only log, and done to those notes when the
app is next unlocked. Each action is done once per note, in order, never to notes made after it; forged and unknown entries do nothing."""
import re,json
from harness import ok,finish,session
PW='orbit lantern velvet mosaic harbor'
with session(folder=True) as s:
    pg,ev,rd,ls=s.pg,s.evaluate,s.rd,s.ls
    s.boot()
    ev(f"Store.setupEncryption('{PW}')"); s.settle()
    ok('actions.log' in ls('') and rd('actions.log')=='',"the deferred-action log is created, empty, when encryption is set up")
    vt=json.loads(rd('vault.json'))
    ok('log' in vt and vt['log'].get('pub') and vt['log'].get('priv'),"the vault carries a public key for the log and the private key, encrypted")
    ev("""async()=>{const mk=(t,labels,enc)=>{const x=blank();x.title=t;x.body=t+' text';x.labels=labels;x.enc=enc;for(const l of labels)if(!LB.includes(l))LB.push(l);notes.push(x)};
      mk('Enc one',['Work','Home'],true);mk('Enc two',['Work'],true);mk('Enc three',['Other'],true);mk('Plain note',['Work'],false);save();await __A.flush()}""")
    s.settle()
    ids=ev("Object.fromEntries(notes.map(n=>[n.title,n.id]))")
    page=lambda t: f"{int(ids[t])//100}/{ids[t]}.html"
    ct=lambda t: re.search(r'<pre class="ct">(.*?)</pre>',rd(page(t))).group(1)
    labels=lambda: ev("Object.fromEntries(notes.filter(n=>n.enc&&!n.stub).map(n=>[n.title,n.labels]))")
    lines=lambda: [l for l in rd('actions.log').split('\n') if l]
    unlock=lambda: (ev(f"Store.unlock('{PW}')"), s.settle())
    before={t:ct(t) for t in ('Enc one','Enc two','Enc three')}

    # ---- renamed while locked
    ev("Store.lock()"); s.settle()
    ev("renameLabel('Work','Job')"); s.settle()
    log=rd('actions.log')
    ok(len(lines())==1 and lines()[0].startswith('LBKL1.') and 'Work' not in log and 'Job' not in log,"the rename is one sealed line in the log: neither label can be read in it")
    ok(all(ct(t)==before[t] for t in before),"while locked the encrypted notes are not touched")
    ok('Job' in rd(page('Plain note')) and 'Work' not in rd(page('Plain note')),"the plain note is renamed on disk at once")
    ok('Job' in ev("LB") and 'Work' not in ev("LB"),"and the sidebar shows the new name")
    unlock()
    ok(labels()=={'Enc one':['Job','Home'],'Enc two':['Job'],'Enc three':['Other']},f"after unlocking, the log is applied in the background: {labels()}")
    ok(all(ct(t)!=before[t] for t in before) and all('"lp": 1' in rd(page(t)) for t in before),"the pages are rewritten, each noting in its head that it is up to date with 1 log line")
    after={t:ct(t) for t in before}
    ev("Store.lock()"); s.settle(); unlock()
    ok(all(ct(t)==after[t] for t in after),"unlocking again does not rewrite them: an action is done once per note")

    # ---- a note made after an action is not changed by it
    ev("""async()=>{const x=blank();x.title='Made later';x.body='x';x.enc=true;x.labels=['Work'];LB.push('Work');notes.push(x);save();await __A.flush()}"""); s.settle()
    ids=ev("Object.fromEntries(notes.map(n=>[n.title,n.id]))")
    ok('"lp": 1' in rd(page('Made later')),"a note written now is stamped as up to date with the log")
    ev("Store.lock()"); s.settle(); unlock()
    ok(ev("notes.find(n=>n.title==='Made later').labels")==['Work'],"so the old rename Work → Job leaves its new label Work alone")

    # ---- renamed and deleted while unlocked, and in order
    ev("deleteLabel('Home')"); s.settle()
    ok(len(lines())==2 and ev("notes.find(n=>n.title==='Enc one').labels")==['Job'],"a delete while unlocked is logged too, and done to the notes in memory")
    ev("Store.lock()"); s.settle()
    ev("renameLabel('Job','Task')"); s.settle(); ev("renameLabel('Task','Final')"); s.settle()
    ok(len(lines())==4,"two renames made while locked are two more lines")
    unlock()
    ok(labels()['Enc one']==['Final'] and labels()['Enc two']==['Final'],f"they are done in the order made: Job → Task → Final: {labels()}")
    ok(labels()['Enc three']==['Other'],"a note without those labels is not changed")

    # ---- forged and unknown entries
    ev("""async()=>{const f=(await LBE.createVault('some other passphrase words here',{install:false})).vault;
      window.__forged=await LBE.sealLogEntry(f,{op:'delete',label:'Final'});                 // sealed to another vault's key
      window.__unknown=await LBE.sealLogEntry(VAULT,{op:'wipe',label:'Final'});               // a real key, an action the app does not do
      window.__nonstring=await LBE.sealLogEntry(VAULT,{op:'rename',from:['Final'],to:{}})}""")
    cur=rd('actions.log')
    s.wr('actions.log',cur+ev("__forged")+'\n'+ev("__unknown")+'\n'+ev("__nonstring")+'\nnot a log line at all\n')
    ev("Store.lock()"); s.settle(); unlock()
    ok(labels()['Enc one']==['Final'],"a line sealed to another key, an unknown action and a malformed one do nothing")
    ev("Store.lock()"); s.settle()
    ev("renameLabel('Final','Done')"); s.settle(); unlock()
    ok(labels()['Enc one']==['Done'] and len(lines())==9,"and they still count as lines, so a later real action lands in the right place")
    # ---- an older vault (made before the log existed) is upgraded at the next unlock
    v=json.loads(rd('vault.json')); del v['log']; s.wr('vault.json',json.dumps(v)); s.wr('actions.log','')
    ev("Store.lock()"); s.settle(); s.boot()
    ev("Store.crypto.hasVault"); unlock()
    ok('log' in json.loads(rd('vault.json')),"a vault without a log key gets one the first time it is unlocked")
finish()
