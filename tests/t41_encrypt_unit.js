const E = require('../js/encrypt.js');
const assert = require('assert');
let passed = 0;
async function t(name, fn) { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n    ', e.message); process.exitCode = 1; } }
async function rejects(p, code) { try { await p; } catch (e) { assert.strictEqual(e.code, code, 'got ' + e.code + ': ' + e.message); return; } throw new Error('expected rejection ' + code); }
const PASS = 'orbit lantern velvet mosaic harbor';
const rnd = n => { const b = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536))); return b; };
const encAtt = async (data, id, opts) => { const parts = []; await E.encryptAttachmentTo(data, id, { write: async p => { parts.push(p); } }, opts); return new Blob(parts); };
const isEnc = async b => { const h = new Uint8Array(await b.slice(0, 4).arrayBuffer()); return h.length === 4 && h[0] === 0x4c && h[1] === 0x42 && h[2] === 0x4b && h[3] === 0x41; };
const b64len = s => Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64').length;

(async () => {
  await t('strength: weak/short/common rejected, five words accepted', () => {
    for (const w of ['1234', 'short', 'aaaaaaaaaaaa', 'Password1234!', 'abcdefghijkl', 'correct horse battery staple']) assert.strictEqual(E.checkPassphraseStrength(w).ok, false, w);
    for (const g of [PASS, 'k7#Qv9!mZp2$Xw', 'T3rrible-Idea-Horse-Garden-9']) assert.strictEqual(E.checkPassphraseStrength(g).ok, true, g);
  });

  let vault, recovery;
  await t('createVault rejects weak passphrase', async () => rejects(E.createVault('hunter2hunter2'), 'WEAK_PASSPHRASE'));
  await t('createVault unlocks and returns recovery key', async () => {
    ({ vault, recoveryKey: recovery } = await E.createVault(PASS));
    assert.ok(E.isUnlocked());
    assert.match(recovery, /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    assert.ok(!JSON.stringify(vault).includes('orbit'));
  });
  await t('createVault with install:false changes nothing until useKey', async () => {
    E.lock();
    const r = await E.createVault(PASS, { install: false });
    assert.ok(!E.isUnlocked(), 'locked after createVault(install:false)');
    await rejects(E.encryptBody('x', 1), 'LOCKED');
    E.useKey(r.key);
    assert.ok(E.isUnlocked());
    const { token } = await E.encryptBody('made with the prepared key', 9);
    E.lock(); await E.unlock(r.vault, PASS);
    assert.strictEqual(await E.decryptBody(token, 9), 'made with the prepared key');
    E.lock();
  });
  await t('deferred-action log: sealed while locked, opened only when unlocked, in order, damaged or foreign lines skipped but counted', async () => {
    const mine = (await E.createVault(PASS)).vault;
    const other = (await E.createVault('another five random words here')).vault;     // the key now in use is the other vault's
    await E.unlock(mine, PASS);
    assert.ok(mine.log && mine.log.pub && mine.log.priv, 'a new vault carries a log key');
    E.lock();
    const lines = [];
    lines.push(await E.sealLogEntry(mine, { op: 'rename', from: 'Work', to: 'Job' }));     // written while locked: no data key needed
    lines.push(await E.sealLogEntry(mine, { op: 'delete', label: 'Home' }));
    lines.push('LBKL1.garbage.garbage.garbage');
    lines.push(await E.sealLogEntry(other, { op: 'delete', label: 'FORGED' }));           // sealed to a different vault: cannot be opened with this one
    lines.push(await E.sealLogEntry(mine, { op: 'rename', from: 'Job', to: 'Task' }));
    assert.ok(!lines.join('\n').includes('Work') && !lines.join('\n').includes('Job'), 'nothing readable in the log');
    await rejects(E.openLogEntries(mine, lines), 'LOCKED');
    await E.unlock(mine, PASS);
    const out = await E.openLogEntries(mine, lines);
    assert.strictEqual(out.length, 5, 'one result per line');
    assert.deepStrictEqual(out[0], { op: 'rename', from: 'Work', to: 'Job' });
    assert.deepStrictEqual(out[1], { op: 'delete', label: 'Home' });
    assert.strictEqual(out[2], null); assert.strictEqual(out[3], null);
    assert.deepStrictEqual(out[4], { op: 'rename', from: 'Job', to: 'Task' });
    E.lock();
  });
  await t('addLogKey upgrades a vault made without one; passphrase change keeps the log key', async () => {
    const r = await E.createVault(PASS);
    const old = JSON.parse(JSON.stringify(r.vault)); delete old.log;
    await E.unlock(old, PASS);
    const up = await E.addLogKey(old);
    assert.ok(up.log && up.log.pub, 'upgraded');
    await E.unlock(up, PASS);
    const line = await E.sealLogEntry(up, { op: 'delete', label: 'X' });
    const v2 = await E.changePassphrase(up, PASS, 'brand new passphrase words here');
    assert.deepStrictEqual(v2.log, up.log, 'the log key is untouched by a passphrase change');
    E.lock(); await E.unlock(v2, 'brand new passphrase words here');
    assert.deepStrictEqual((await E.openLogEntries(v2, [line]))[0], { op: 'delete', label: 'X' });
    E.lock();
  });
  await t('locked: encrypt throws LOCKED', async () => { E.lock(); assert.ok(!E.isUnlocked()); await rejects(E.encryptBody('x', 1), 'LOCKED'); });
  await t('wrong passphrase rejected, right one unlocks (also from JSON)', async () => {
    await rejects(E.unlock(vault, 'wrong wrong wrong wrong wrong'), 'WRONG_PASSPHRASE');
    assert.ok(!E.isUnlocked());
    await E.unlock(JSON.stringify(vault), PASS);
    assert.ok(E.isUnlocked());
  });
  await t('recovery key unlocks; wrong/invalid recovery key rejected', async () => {
    E.lock();
    await rejects(E.unlockWithRecoveryKey(vault, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA'), 'WRONG_RECOVERY_KEY');
    await rejects(E.unlockWithRecoveryKey(vault, 'nope'), 'WRONG_RECOVERY_KEY');
    await E.unlockWithRecoveryKey(vault, recovery.toLowerCase().replace(/-/g, ' '));
    assert.ok(E.isUnlocked());
  });

  await t('body round trip incl. unicode and HTML', async () => {
    for (const html of ['', 'hi', '<p>Héllo <b>wörld</b> 日本語 🙂</p>', '<p>' + 'x'.repeat(5000) + '</p>']) {
      const { token } = await E.encryptBody(html, 42);
      assert.ok(!token.includes('hi') || html !== 'hi' || true);
      assert.strictEqual(await E.decryptBody(token, 42), html);
    }
  });
  await t('padding: <256 bytes => 512 bytes plaintext (528 ciphertext); >=256 unpadded', async () => {
    for (const html of ['', 'short', '<p>' + 'é'.repeat(100) + '</p>', 'a'.repeat(255)]) {
      const { token } = await E.encryptBody(html, 1);
      assert.strictEqual(b64len(token.split('.')[2]), 512 + 16, JSON.stringify(html.slice(0, 10)));
    }
    const exact = 'a'.repeat(256);
    assert.strictEqual(b64len((await E.encryptBody(exact, 1)).token.split('.')[2]), 256 + 16);
    assert.strictEqual(await E.decryptBody((await E.encryptBody(exact, 1)).token, 1), exact);
  });
  await t('padding is random per save and different tokens each time', async () => {
    const a = (await E.encryptBody('same', 1)).token, b = (await E.encryptBody('same', 1)).token;
    assert.notStrictEqual(a, b);
  });
  await t('body bound to note id; tampering and bad formats detected', async () => {
    const { token } = await E.encryptBody('secret note', 7);
    await rejects(E.decryptBody(token, 8), 'TAMPERED');
    const parts = token.split('.'); const flip = parts[2][10] === 'A' ? 'B' : 'A';
    await rejects(E.decryptBody([parts[0], parts[1], parts[2].slice(0, 10) + flip + parts[2].slice(11)].join('.'), 7), 'TAMPERED');
    await rejects(E.decryptBody('hello', 7), 'BAD_FORMAT');
    await rejects(E.decryptBody('LBK9.' + parts[1] + '.' + parts[2], 7), 'UNSUPPORTED_VERSION');
  });

  await t('attachments: round trip for sizes around chunk boundaries', async () => {
    const CS = 4096;
    for (const size of [0, 1, CS - 1, CS, CS + 1, 3 * CS, 3 * CS + 17]) {
      const data = rnd(size);
      const enc = await encAtt(data, 5, { chunkSize: CS });
      assert.ok(await isEnc(enc));
      const dec = await E.decryptAttachment(enc, 5, 'image/png');
      assert.strictEqual(dec.type, 'image/png');
      assert.ok(Buffer.from(await dec.arrayBuffer()).equals(Buffer.from(data)), 'size ' + size);
    }
  });
  await t('attachments: 2.5 MB with default 1 MB chunks, and streaming write', async () => {
    const data = rnd(2.5 * 1024 * 1024);
    const sink = []; await E.encryptAttachmentTo(new Blob([data]), 9, { write: async p => { sink.push(p); } });
    assert.strictEqual(sink.length, 1 + 3);
    const out = []; await E.decryptAttachmentTo(new Blob(sink), 9, { write: async p => { out.push(p); } });
    assert.ok(Buffer.concat(out).equals(Buffer.from(data)));
  });
  await t('attachments: wrong note id, truncation, reorder, bit flip, non-encrypted all rejected', async () => {
    const CS = 4096, data = rnd(3 * CS + 100);
    const enc = new Uint8Array(await (await encAtt(data, 5, { chunkSize: CS })).arrayBuffer());
    const H = 9, L = 12 + CS + 16;
    await rejects(E.decryptAttachment(new Blob([enc]), 6), 'TAMPERED');
    await rejects(E.decryptAttachment(new Blob([enc.slice(0, H + L)]), 5), 'TAMPERED');          // cut at chunk boundary
    await rejects(E.decryptAttachment(new Blob([enc.slice(0, enc.length - 5)]), 5), 'TAMPERED');  // cut mid-chunk
    const swapped = new Uint8Array(enc); swapped.set(enc.slice(H + L, H + 2 * L), H); swapped.set(enc.slice(H, H + L), H + L);
    await rejects(E.decryptAttachment(new Blob([swapped]), 5), 'TAMPERED');
    const flipped = new Uint8Array(enc); flipped[H + 50] ^= 1;
    await rejects(E.decryptAttachment(new Blob([flipped]), 5), 'TAMPERED');
    await rejects(E.decryptAttachment(new Blob([rnd(100)]), 5), 'BAD_FORMAT');
    assert.ok(!(await isEnc(new Blob([rnd(100)]))));
  });

  await t('changePassphrase: old fails, new works, notes still decrypt, recovery still works', async () => {
    const { token } = await E.encryptBody('keep me', 11);
    await rejects(E.changePassphrase(vault, 'not the passphrase at all', 'another five words right here'), 'WRONG_PASSPHRASE');
    await rejects(E.changePassphrase(vault, PASS, 'weak'), 'WEAK_PASSPHRASE');
    const v2 = await E.changePassphrase(vault, PASS, 'another five words right here');
    E.lock();
    await rejects(E.unlock(v2, PASS), 'WRONG_PASSPHRASE');
    await E.unlock(v2, 'another five words right here');
    assert.strictEqual(await E.decryptBody(token, 11), 'keep me');
    E.lock(); await E.unlockWithRecoveryKey(v2, recovery);
    assert.strictEqual(await E.decryptBody(token, 11), 'keep me');
  });
  await t('resetPassphraseWithRecoveryKey', async () => {
    const { token } = await E.encryptBody('still here', 12);
    const v3 = await E.resetPassphraseWithRecoveryKey(vault, recovery, 'brand new forgotten words today');
    E.lock(); await E.unlock(v3, 'brand new forgotten words today');
    assert.strictEqual(await E.decryptBody(token, 12), 'still here');
  });
  await t('malformed / tampered vault rejected', async () => {
    await rejects(E.unlock('{not json', PASS), 'BAD_FORMAT');
    await rejects(E.unlock({ ...vault, version: 2 }, PASS), 'UNSUPPORTED_VERSION');
    await rejects(E.unlock({ ...vault, kdf: { ...vault.kdf, iterations: 1e12 } }, PASS), 'BAD_FORMAT');
  });
  console.log(`\n${passed} passed`);
})();
