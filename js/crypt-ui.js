/* crypt-ui.js: the encryption dialogs (set up, unlock, change passphrase, reset with the recovery key), the sidebar lock button and the idle auto-lock.
   All the cryptography is in encrypt.js and the engine is in folder-crypt.js; this file reaches them only through Store (store.js) and LilBroEncrypt
   (for the strength check). Encryption is for folder storage only. The dialogs follow the Import and Export dialogs: an icon, a title, a short text,
   one big button, and a plain button at the bottom. */
'use strict';
const Crypt=(()=>{
  /* ---------- parts the dialogs share ---------- */
  const strengthHTML=()=>'<div class="meter" aria-hidden="true"><i></i></div><p class="hint strength" aria-live="polite"></p>';
  /* The strength meter under a passphrase field. Returns a function that checks the field now. */
  function wireStrength(panel,input){
    const bar=panel.querySelector('.meter i'),txt=panel.querySelector('.strength');
    const upd=()=>{
      const s=LilBroEncrypt.checkPassphraseStrength(input.value);
      bar.style.width=Math.min(100,Math.round(s.bits/80*100))+'%';
      bar.style.background=s.ok?(s.bits>=80?'#188038':'#e37400'):'#c5221f';
      txt.textContent=input.value?`${s.label}: ${s.message}`:'';
      return s;
    };
    input.addEventListener('input',upd);
    return upd;
  }
  const say=(d,t)=>{const r=d.panel.querySelector('.res');if(r)r.textContent=t};
  const busyBtn=(b,on,label)=>{if(!b)return;b.disabled=on;if(label)b.textContent=label};
  const focusFirst=d=>{const t=dlgFocusables(d.panel)[0];if(t)t.focus({preventScroll:true})};    // after the content is replaced, focus starts at the top again, as when a dialog opens
  const badge=name=>`<span class="dic">${ic(name,22)}</span>`;
  /* A new passphrase typed twice: says what is wrong, or returns true. */
  function newPassphraseOk(d,check,p1,p2){
    const s=check();
    if(!s.ok){say(d,s.message);return false}
    if(p1.value!==p2.value){say(d,'The two passphrases are different.');return false}
    return true;
  }
  /* Runs work() while the dialog's submit button shows `busy`. On failure the button comes back and why(err) is shown. Resolves true when work() succeeded. */
  async function submitting(d,idle,busy,work,why){
    const b=d.panel.querySelector('[data-c=go]');
    busyBtn(b,true,busy);say(d,'');
    try{await work();return true}
    catch(err){busyBtn(b,false,idle);say(d,why(err));return false}
  }
  const onSubmit=(d,fn)=>d.panel.addEventListener('submit',e=>{e.preventDefault();fn()});
  const onClick=(d,map)=>d.panel.addEventListener('click',e=>{const b=e.target.closest('[data-c]');const f=b&&map[b.dataset.c];if(f)f(b)});

  /* ---------- password manager ----------
     A page cannot write to the system keychain itself. What it can do is be a form the browser's password manager recognises (a username next to the password,
     the right autocomplete values, a submit) and, in browsers that support it, hand the passphrase over to be stored. The browser then asks, and keeps it in its
     own password manager (which on a Mac is protected by the Keychain, and can sync). The person decides; nothing is stored without that. */
  const account=()=>'Lil Bro Keep · '+(Store.folderName||'notes');
  const userField=()=>`<input class="uname" type="text" name="username" autocomplete="username" value="${h(account())}" tabindex="-1" aria-hidden="true" readonly>`;
  async function offerToSave(passphrase){
    try{if(window.PasswordCredential&&navigator.credentials&&navigator.credentials.store)await navigator.credentials.store(new PasswordCredential({id:account(),name:'Lil Bro Keep',password:passphrase}))}
    catch(e){quiet('the browser declined to offer saving the passphrase',e)}
  }
  const passwordField=(id,name,placeholder,autocomplete)=>`<input class="pw" type="password" id="${id}" name="${name}" placeholder="${placeholder}" autocomplete="${autocomplete}" aria-label="${placeholder}">`;
  const wrongKey=err=>err&&(err.code==='WRONG_PASSPHRASE'||err.code==='WRONG_RECOVERY_KEY');

  /* ---------- set up: passphrase, then the recovery key (shown once) ---------- */
  /* opts.pending (with opts.folder, the folder's name): asked while a folder is being picked, before anything is done with it. The vault is only prepared then;
     it is written into the folder when the switch goes ahead (Store.prepareEncryption), and cancelling stops the whole folder change. */
  function setupDialog(opts){
    const pending=!!(opts&&opts.pending);
    const form=`${badge('lockOn')}<h3>Set up encryption</h3>
      ${pending
        ?`<p>Before “${h(opts.folder||'this folder')}” is used, choose a passphrase to protect the notes in it. Notes you add from now on are encrypted, and so are notes copied in from this browser. Notes already in the folder stay as they are.</p>`
        :'<p>Choose one passphrase for all encrypted notes. Notes you write from now on are encrypted; the notes you already have stay as they are.</p>'}
      <p class="hint"><b>A forgotten passphrase cannot be recovered.</b> The next step gives you a recovery key. Keep it somewhere safe.</p>
      ${opts&&opts.replacing?'<p class="hint">This folder already has an encryption setup, but no notes for it to protect. It will be replaced by the new one.</p>':''}
      ${pending?'<p class="hint">Cancel to leave everything as it is: the folder is not used.</p>':''}
      <form class="pwform" autocomplete="on">${userField()}
        ${passwordField('p1','new-password','Passphrase','new-password')}
        ${strengthHTML()}
        ${passwordField('p2','confirm-password','Repeat the passphrase','new-password')}
        <p class="res" aria-live="polite"></p>
        <button class="big" type="submit" data-c="go">Turn on encryption</button>
      </form>
      <div class="cl"><button type="button" class="done" data-c="cancel">Cancel</button></div>`;
    return askDialog({label:'Set up encryption',panelClass:'dlg2',html:form},(d,set)=>{
      const p1=d.panel.querySelector('#p1'),p2=d.panel.querySelector('#p2'),check=wireStrength(d.panel,p1);
      onSubmit(d,async()=>{
        if(!newPassphraseOk(d,check,p1,p2))return;
        let key;
        const done=await submitting(d,'Turn on encryption','Working…',async()=>{key=await(pending?Store.prepareEncryption(p1.value):Store.setupEncryption(p1.value))},err=>'Couldn’t set up encryption: '+((err&&err.message)||err));
        if(!done)return;
        set(true);offerToSave(p1.value);
        d.redraw(`${badge('lockOn')}<h3>Your recovery key</h3>
          <p>Write it down or keep it in a password manager. If you forget your passphrase, this is the only way to open your encrypted notes. It is shown only once.</p>
          <div class="rkey" id="rk">${h(key)}</div>
          <button class="big out" type="button" data-c="copy">Copy recovery key</button>
          <label class="ack"><input type="checkbox" id="ack"> I have saved my recovery key</label>
          <p class="res" aria-live="polite"></p>
          <button class="big" type="button" data-c="fin" disabled>Done</button>`);
        focusFirst(d);
      });
      onClick(d,{cancel:()=>d.close(),fin:()=>d.close(),copy:async()=>{
        try{await navigator.clipboard.writeText(d.panel.querySelector('#rk').textContent);say(d,'Copied.')}catch(err){say(d,'Select the key and copy it.')}
      }});
      d.panel.addEventListener('change',e=>{if(e.target.id==='ack'){const f=d.panel.querySelector('[data-c=fin]');if(f)f.disabled=!e.target.checked}});
    });
  }

  /* ---------- unlock: resolves true once the app is unlocked ---------- */
  let unlockP=null;
  /* The folder has to be reachable to read the vault: a new browser session starts without that, so the first click asks for it. */
  /* opts.once: the prompt the app opens by itself (at start, when a folder is chosen or reconnected) gets one attempt: a wrong passphrase closes it and the app
     stays locked, and the person has to use Unlock in the sidebar to try again. A dialog the person opens (the sidebar, an encrypted note) lets them retry. */
  async function promptUnlock(opts){
    if(Store.crypto.unlocked)return true;
    if(Store.state!=='ok'){await Store.reconnect();if(Store.state!=='ok')return false}
    return unlockP||(unlockP=showUnlock(opts).finally(()=>{unlockP=null}));
  }
  function showUnlock(opts){
    const opener=document.activeElement;
    let mode='pass',usedKey=null;
    const html=()=>mode==='pass'
      ?`${badge('lockOn')}<h3>Unlock encrypted notes</h3>
        <p>Enter your passphrase to read your encrypted notes.</p>
        <form class="pwform" autocomplete="on">${userField()}
          ${passwordField('pw','password','Passphrase','current-password')}
          <p class="res" aria-live="polite"></p>
          <button class="big" type="submit" data-c="go">Unlock</button>
        </form>
        <div class="cl"><button type="button" data-c="alt">Use recovery key</button><button type="button" class="done" data-c="cancel">Cancel</button></div>`
      :`${badge('lockOn')}<h3>Unlock with your recovery key</h3>
        <p>Enter the recovery key you saved when you set up encryption.</p>
        <form class="pwform" autocomplete="off">
          <input class="pw" type="text" id="pw" name="recovery-key" placeholder="Recovery key" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Recovery key">
          <p class="res" aria-live="polite"></p>
          <button class="big" type="submit" data-c="go">Unlock</button>
        </form>
        <div class="cl"><button type="button" data-c="alt">Use passphrase</button><button type="button" class="done" data-c="cancel">Cancel</button></div>`;
    /* Focus is put back by hand: after a successful unlock it goes back without the keyboard ring, because unlocking is an action and not a place to navigate from.
       After a recovery-key unlock the person most likely forgot the passphrase, so a new one is offered before the caller carries on. */
    return askDialog({label:'Unlock encrypted notes',panelClass:'dlg2',html:html(),restoreFocus:false,after:async ok=>{
      if(opener&&opener.isConnected&&!opener.closest('[inert]')){
        try{opener.focus({preventScroll:true})}catch(e){quiet('the opener cannot take focus again',e)}
        if(ok)quietFocus(opener);
      }
      if(ok&&usedKey)await resetDialog({key:usedKey});
    }},(d,set)=>{
      const focus=()=>{const i=d.panel.querySelector('#pw');if(i)i.focus()};
      focus();
      onSubmit(d,async()=>{
        const v=d.panel.querySelector('#pw').value;
        if(!v){say(d,mode==='pass'?'Enter your passphrase.':'Enter your recovery key.');return}
        let lastErr=null;
        const ok=await submitting(d,'Unlock','Unlocking…',async()=>{
          try{if(mode==='pass'){await Store.unlock(v);offerToSave(v)}else{await Store.unlockWithRecoveryKey(v);usedKey=v}}
          catch(e){lastErr=e;throw e}
        },err=>wrongKey(err)?(mode==='pass'?'Wrong passphrase.':'Wrong recovery key.'):'Couldn’t unlock: '+((err&&err.message)||err));
        if(ok){set(true);d.close();return}
        if(opts&&opts.once&&wrongKey(lastErr)){d.close();toast((mode==='pass'?'Wrong passphrase':'Wrong recovery key')+'. The app is locked: use Unlock in the sidebar to try again.')}
      });
      onClick(d,{cancel:()=>d.close(),alt:()=>{mode=mode==='pass'?'key':'pass';d.redraw(html());focus()}});
    });
  }
  /* Keyboard focus without the ring: the ring comes back as soon as the person presses a key or leaves the element. */
  function quietFocus(el){
    el.setAttribute('data-quiet','');
    const off=()=>{el.removeAttribute('data-quiet');el.removeEventListener('blur',off);document.removeEventListener('keydown',off,true)};
    el.addEventListener('blur',off);document.addEventListener('keydown',off,true);
  }

  /* ---------- change the passphrase, or set a new one with the recovery key (no note is re-encrypted) ---------- */
  function changeDialog(){
    return askDialog({label:'Change passphrase',panelClass:'dlg2',html:`${badge('lockOn')}<h3>Change passphrase</h3>
      <p>Your encrypted notes are not rewritten, and your recovery key keeps working.</p>
      <form class="pwform" autocomplete="on">${userField()}
        ${passwordField('p0','password','Current passphrase','current-password')}
        ${passwordField('p1','new-password','New passphrase','new-password')}
        ${strengthHTML()}
        ${passwordField('p2','confirm-password','Repeat the new passphrase','new-password')}
        <p class="res" aria-live="polite"></p>
        <button class="big" type="submit" data-c="go">Change passphrase</button>
      </form>
      <div class="cl"><button type="button" data-c="forgot">Forgot your passphrase?</button><button type="button" class="done" data-c="cancel">Cancel</button></div>`},(d,set)=>{
      const p1=d.panel.querySelector('#p1'),p2=d.panel.querySelector('#p2'),check=wireStrength(d.panel,p1);
      onClick(d,{cancel:()=>d.close(),forgot:async()=>{d.close();await resetDialog({})}});
      onSubmit(d,async()=>{
        if(!newPassphraseOk(d,check,p1,p2))return;
        const done=await submitting(d,'Change passphrase','Working…',()=>Store.changePassphrase(d.panel.querySelector('#p0').value,p1.value),
          err=>err&&err.code==='WRONG_PASSPHRASE'?'The current passphrase is wrong.':(err&&err.message)||String(err));
        if(!done)return;
        set(true);offerToSave(p1.value);d.close();toast('Passphrase changed. Your recovery key still works.');
      });
    });
  }
  /* Set a new passphrase with the recovery key. opts.key: the key just used to unlock (otherwise it is asked for). */
  function resetDialog(opts){
    const key=opts&&opts.key;
    return askDialog({label:'Set a new passphrase',panelClass:'dlg2',html:`${badge('lockOn')}<h3>Set a new passphrase</h3>
      <p>${key?'You unlocked with your recovery key. Choose a new passphrase for next time. The recovery key keeps working.':'Enter your recovery key and choose a new passphrase. The recovery key keeps working.'}</p>
      <form class="pwform" autocomplete="on">${userField()}
        ${key?'':'<input class="pw" type="text" id="rk" name="recovery-key" placeholder="Recovery key" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Recovery key">'}
        ${passwordField('p1','new-password','New passphrase','new-password')}
        ${strengthHTML()}
        ${passwordField('p2','confirm-password','Repeat the new passphrase','new-password')}
        <p class="res" aria-live="polite"></p>
        <button class="big" type="submit" data-c="go">Set new passphrase</button>
      </form>
      <div class="cl"><button type="button" class="done" data-c="cancel">${key?'Not now':'Cancel'}</button></div>`},(d,set)=>{
      const p1=d.panel.querySelector('#p1'),p2=d.panel.querySelector('#p2'),check=wireStrength(d.panel,p1);
      onClick(d,{cancel:()=>d.close()});
      onSubmit(d,async()=>{
        if(!newPassphraseOk(d,check,p1,p2))return;
        const k=key||d.panel.querySelector('#rk').value;
        const done=await submitting(d,'Set new passphrase','Working…',()=>Store.resetPassphrase(k,p1.value),
          err=>wrongKey(err)?'That recovery key is wrong.':(err&&err.message)||String(err));
        if(!done)return;
        set(true);offerToSave(p1.value);d.close();toast('New passphrase set. Your recovery key still works.');
      });
    });
  }

  /* ---------- settings rows, lock button, idle lock ---------- */
  function settingsHTML(){
    const c=Store.crypto;
    if(!c.hasVault)return `<p class="cap">Encryption</p><div class="alist"><button class="arow" data-s="enc-setup">Set up encryption…<u>›</u></button></div><p class="hint">Protects the notes you write from now on with a passphrase. Notes you already have stay as they are.</p>`;
    return `<p class="cap">Encryption</p><div class="alist"><button class="arow" data-s="enc-lock">${c.unlocked?'Lock now':'Unlock…'}<u>›</u></button><button class="arow" data-s="enc-change">Change passphrase…<u>›</u></button></div>`;
  }
  const api={idleMs:5*60*1000,promptUnlock,setupDialog,changeDialog,resetDialog,settingsHTML};
  let idleT=0,lastTouch=0;
  const arm=()=>{clearTimeout(idleT);if(Store.crypto.unlocked)idleT=setTimeout(()=>{Store.lock()},api.idleMs)};
  const touch=()=>{const now=Date.now();if(now-lastTouch<1000)return;lastTouch=now;if(Store.crypto.unlocked)arm()};
  ['pointerdown','pointermove','keydown','wheel','touchstart'].forEach(ev=>document.addEventListener(ev,touch,{passive:true,capture:true}));
  /* Called whenever the vault or the lock changes. */
  api.changed=()=>{
    const b=document.getElementById('lockbtn');if(!b)return;
    const c=Store.crypto;
    b.hidden=!c.hasVault;
    document.getElementById('n7').innerHTML=ic(c.unlocked?'lockOff':'lockOn');
    document.getElementById('locktxt').textContent=c.unlocked?'Lock':'Unlock';
    b.title=c.unlocked?'Lock encrypted notes':'Unlock encrypted notes';
    lastTouch=0;arm();
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const b=document.getElementById('lockbtn');
    if(b)b.onclick=()=>{document.body.classList.remove('open');if(Store.crypto.unlocked)Store.lock();else promptUnlock()};
  });
  return api;
})();
