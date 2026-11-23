/*
 * encrypt.js - Lil Bro Keep note encryption.
 *
 * All encryption and decryption code lives in this file. It uses only the
 * browser's Web Crypto API (no dependencies).
 *
 * Works as a classic script (<script src="encrypt.js">, which also works when
 * the app is opened from file://) and exposes window.LilBroEncrypt. In Node it
 * is also available through require().
 *
 * Design (see the Note Encryption Spec):
 *  - AES-256-GCM, with the key derived from one master passphrase (PBKDF2-SHA256,
 *    600,000 iterations).
 *  - Envelope keys: a random data key encrypts notes; the passphrase (and the
 *    recovery key) only wrap that data key. The wrapped keys live in a "vault"
 *    object that the app stores in a small file in the notes folder root.
 *  - Per-note random IV. The note id is bound to every ciphertext as GCM
 *    authenticated data, so ciphertexts cannot be swapped between notes.
 *  - Bodies under 256 bytes are padded to 512 bytes before encryption.
 *  - Attachments are encrypted in 1 MB chunks, each with its own IV. Chunk
 *    position and a final-chunk marker are authenticated, so chunks cannot be
 *    reordered or cut off.
 *  - The data key lives only in memory (non-extractable) while unlocked.
 *
 * The idle lock timer is not here: it needs the app's own flush-then-lock order, so it lives in crypt-ui.js.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LilBroEncrypt = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  // ---------------------------------------------------------------- constants
  var FORMAT_VERSION = 1;
  var PBKDF2_ITERATIONS = 600000;
  var MAX_ACCEPTED_ITERATIONS = 10000000; // guards against a tampered vault file hanging the app
  var SALT_BYTES = 16;
  var IV_BYTES = 12;
  var TAG_BYTES = 16;
  var CHUNK_SIZE = 1024 * 1024;
  var MIN_CHUNK_SIZE = 4096;
  var MAX_CHUNK_SIZE = 64 * 1024 * 1024;
  var PAD_MIN_BYTES = 256; // bodies below this are padded...
  var PAD_TARGET_BYTES = 512; // ...up to exactly this many bytes
  var PAD_OPEN = '<!--pad:';
  var PAD_CLOSE = '-->';
  var BODY_PREFIX = 'LBK' + FORMAT_VERSION; // token: LBK1.<iv>.<ciphertext>
  var ATT_MAGIC = [0x4c, 0x42, 0x4b, 0x41]; // "LBKA"
  var ATT_HEADER_BYTES = 9; // magic(4) + version(1) + chunkSize(4)
  var MIN_PASSPHRASE_LENGTH = 12;
  var MIN_PASSPHRASE_BITS = 55;

  var AAD_VAULT_PASSPHRASE = 'lbk:v1:vault:passphrase';
  var AAD_VAULT_RECOVERY = 'lbk:v1:vault:recovery';
  var AAD_VAULT_LOGKEY = 'lbk:v1:vault:logkey';
  var INFO_LOG = 'lbk:v1:log';
  var LOG_PREFIX = 'LBKL1';
  var HKDF_INFO_RECOVERY = 'lbk:v1:recovery';
  var BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  // ------------------------------------------------------------------- errors
  /**
   * Error with a machine-readable code:
   * LOCKED, WRONG_PASSPHRASE, WRONG_RECOVERY_KEY, WEAK_PASSPHRASE, TAMPERED,
   * BAD_FORMAT, UNSUPPORTED_VERSION, NO_WEBCRYPTO.
   */
  function EncryptError(code, message) {
    var e = new Error(message);
    e.name = 'EncryptError';
    e.code = code;
    return e;
  }

  function subtle() {
    if (!root.crypto || !root.crypto.subtle) {
      throw EncryptError('NO_WEBCRYPTO', 'Web Crypto is not available (needs a secure context such as https, localhost or file://).');
    }
    return root.crypto.subtle;
  }

  // ------------------------------------------------------------ small helpers
  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  function randomBytes(n) {
    return root.crypto.getRandomValues(new Uint8Array(n));
  }

  function b64uEncode(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var bin = '';
    for (var i = 0; i < u8.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uDecode(str) {
    if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) {
      throw EncryptError('BAD_FORMAT', 'Invalid encoded data.');
    }
    var s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin;
    try {
      bin = atob(s);
    } catch (e) {
      throw EncryptError('BAD_FORMAT', 'Invalid encoded data.');
    }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function noteIdString(noteId) {
    var s = String(noteId === undefined || noteId === null ? '' : noteId);
    if (!s) throw EncryptError('BAD_FORMAT', 'A note id is required.');
    return s;
  }

  // ----------------------------------------------------------- key state
  var dataKey = null; // non-extractable AES-GCM key; null while locked

  function isUnlocked() {
    return dataKey !== null;
  }

  /** Forget the data key. Encrypted content can't be read or written until unlock. */
  function lock() {
    dataKey = null;
  }

  function requireKey() {
    if (!dataKey) throw EncryptError('LOCKED', 'The app is locked. Unlock it to continue.');
    return dataKey;
  }

  // ---------------------------------------------------- passphrase strength
  var COMMON_FRAGMENTS = ['password', 'passw0rd', 'qwerty', 'letmein', 'iloveyou', 'welcome', 'admin', 'monkey', 'dragon', '123456', 'abcdef', '111111', 'secret'];

  /**
   * Heuristic passphrase check (not a substitute for a dictionary-based meter).
   * Requires 12+ characters and about 55 estimated bits. Five or more separate
   * words count 11 bits each (an estimate that assumes the words were chosen at
   * random); other input is scored by character variety, with penalties for
   * repeats, sequences and common passwords.
   * Returns { ok, bits, label, message }.
   */
  function checkPassphraseStrength(passphrase) {
    var p = typeof passphrase === 'string' ? passphrase.normalize('NFKC') : '';
    var chars = Array.from(p);
    var len = chars.length;
    var bits;

    var words = p.split(/[\s\-_.,]+/).filter(Boolean);
    var wordy = words.length >= 4 && words.every(function (w) { return /^\p{L}{3,}$/u.test(w); });

    if (wordy) {
      bits = words.length * 11;
    } else {
      var pool = 0;
      if (/[a-z]/.test(p)) pool += 26;
      if (/[A-Z]/.test(p)) pool += 26;
      if (/[0-9]/.test(p)) pool += 10;
      if (/[ !-\/:-@\[-`{-~]/.test(p)) pool += 33;
      if (/[^\x00-\x7f]/.test(p)) pool += 100;
      var unique = new Set(chars).size;
      var effective = unique + (len - unique) * 0.25;
      for (var i = 0; i + 2 < len; i++) {
        var d1 = chars[i + 1].codePointAt(0) - chars[i].codePointAt(0);
        var d2 = chars[i + 2].codePointAt(0) - chars[i + 1].codePointAt(0);
        if (d1 === d2 && Math.abs(d1) === 1) effective -= 1;
      }
      bits = pool ? Math.max(0, effective) * Math.log2(pool) : 0;
      var lower = p.toLowerCase();
      if (COMMON_FRAGMENTS.some(function (f) { return lower.indexOf(f) !== -1; })) bits = Math.min(bits, 25);
    }
    bits = Math.round(bits);

    var label = bits < 40 ? 'very weak' : bits < MIN_PASSPHRASE_BITS ? 'weak' : bits < 80 ? 'good' : 'strong';
    if (len < MIN_PASSPHRASE_LENGTH) {
      return { ok: false, bits: bits, label: 'too short', message: 'Use at least ' + MIN_PASSPHRASE_LENGTH + ' characters.' };
    }
    if (bits < MIN_PASSPHRASE_BITS) {
      return { ok: false, bits: bits, label: label, message: 'Too easy to guess. Use about five random words, or a longer mix of characters.' };
    }
    return { ok: true, bits: bits, label: label, message: 'Passphrase accepted.' };
  }

  // ------------------------------------------------------- vault / key wrap
  async function deriveKeyFromPassphrase(passphrase, salt, iterations) {
    var base = await subtle().importKey('raw', utf8(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );
  }

  async function deriveKeyFromRecovery(recoveryBytes, salt) {
    var base = await subtle().importKey('raw', recoveryBytes, 'HKDF', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: salt, info: utf8(HKDF_INFO_RECOVERY) },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );
  }

  async function wrapDataKey(key, kek, aad) {
    var iv = randomBytes(IV_BYTES);
    var ct = await subtle().wrapKey('raw', key, kek, { name: 'AES-GCM', iv: iv, additionalData: utf8(aad) });
    return { iv: b64uEncode(iv), data: b64uEncode(ct) };
  }

  function unwrapDataKey(wrapped, kek, aad, extractable) {
    return subtle().unwrapKey(
      'raw',
      b64uDecode(wrapped.data),
      kek,
      { name: 'AES-GCM', iv: b64uDecode(wrapped.iv), additionalData: utf8(aad) },
      { name: 'AES-GCM' },
      !!extractable,
      ['encrypt', 'decrypt']
    );
  }

  function generateRecoveryKeyBytes() {
    return randomBytes(20); // 160 bits
  }

  function recoveryBytesToString(bytes) {
    var bits = 0, value = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += BASE32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
      value &= (1 << bits) - 1;
    }
    return out.match(/.{4}/g).join('-'); // e.g. ABCD-EFGH-...
  }

  function recoveryStringToBytes(text) {
    var s = String(text).replace(/[\s-]/g, '').toUpperCase();
    if (s.length !== 32 || !/^[A-Z2-7]+$/.test(s)) {
      throw EncryptError('WRONG_RECOVERY_KEY', 'That is not a valid recovery key.');
    }
    var bits = 0, value = 0, out = [];
    for (var i = 0; i < s.length; i++) {
      value = (value << 5) | BASE32.indexOf(s[i]);
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
        value &= (1 << bits) - 1;
      }
    }
    return new Uint8Array(out);
  }

  function parseVault(vaultOrJson) {
    var v = vaultOrJson;
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch (e) { throw EncryptError('BAD_FORMAT', 'The vault file is damaged.'); }
    }
    if (!v || v.format !== 'lilbrokeep-vault') throw EncryptError('BAD_FORMAT', 'Not a Lil Bro Keep vault.');
    if (v.version !== FORMAT_VERSION) throw EncryptError('UNSUPPORTED_VERSION', 'This vault was made by a newer version of the app.');
    var ok = v.kdf && v.kdf.name === 'PBKDF2-SHA256' && Number.isInteger(v.kdf.iterations) &&
      v.kdf.iterations > 0 && v.kdf.iterations <= MAX_ACCEPTED_ITERATIONS && typeof v.kdf.salt === 'string' &&
      v.wrappedKey && typeof v.wrappedKey.iv === 'string' && typeof v.wrappedKey.data === 'string' &&
      v.recovery && typeof v.recovery.salt === 'string' && v.recovery.wrappedKey &&
      typeof v.recovery.wrappedKey.iv === 'string' && typeof v.recovery.wrappedKey.data === 'string';
    if (!ok) throw EncryptError('BAD_FORMAT', 'The vault file is damaged.');
    return v;
  }

  function requireStrong(passphrase) {
    var s = checkPassphraseStrength(passphrase);
    if (!s.ok) throw EncryptError('WEAK_PASSPHRASE', s.message);
  }

  /**
   * First-time setup. Creates the vault and, unless opts.install is false, leaves the app unlocked with its key.
   * Returns { vault, recoveryKey, key }. The app stores JSON.stringify(vault) in the
   * notes folder and shows recoveryKey ONCE for the user to save. With install:false nothing
   * changes in memory: the key is only returned, to be put to use later with useKey(key).
   */
  async function createVault(passphrase, opts) {
    requireStrong(passphrase);
    var fresh = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

    var salt = randomBytes(SALT_BYTES);
    var kek = await deriveKeyFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS);
    var wrappedKey = await wrapDataKey(fresh, kek, AAD_VAULT_PASSPHRASE);

    var recoveryBytes = generateRecoveryKeyBytes();
    var recoverySalt = randomBytes(SALT_BYTES);
    var recoveryKek = await deriveKeyFromRecovery(recoveryBytes, recoverySalt);
    var recoveryWrapped = await wrapDataKey(fresh, recoveryKek, AAD_VAULT_RECOVERY);

    var logKey = await makeLogKey(fresh);
    var vault = {
      format: 'lilbrokeep-vault',
      version: FORMAT_VERSION,
      kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: b64uEncode(salt) },
      wrappedKey: wrappedKey,
      recovery: { kdf: 'HKDF-SHA256', salt: b64uEncode(recoverySalt), wrappedKey: recoveryWrapped },
      log: logKey
    };
    var key = await unwrapDataKey(wrappedKey, kek, AAD_VAULT_PASSPHRASE, false); // non-extractable copy
    if (!opts || opts.install !== false) dataKey = key;
    return { vault: vault, recoveryKey: recoveryBytesToString(recoveryBytes), key: key };
  }

  // ------------------------------------------------------------ deferred-action log
  /*
   * Work that cannot be done while the app is locked (for example renaming a label inside encrypted notes) is written to an append-only log to be done later.
   * Entries are written while LOCKED, when there is no data key, so they are sealed to a public key kept in the vault (ECDH P-256 + HKDF + AES-GCM, a fresh
   * ephemeral key per entry). The matching private key is in the vault too, encrypted by the data key: only an unlocked app can read the log.
   * Anyone who can write to the folder can append an entry (that is what a public key means); the app therefore applies only a short list of harmless actions.
   */
  async function makeLogKey(dataKeyForWrapping) {
    var pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var pub = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
    var priv = await subtle().exportKey('pkcs8', pair.privateKey);
    var iv = randomBytes(IV_BYTES);
    var ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: utf8(AAD_VAULT_LOGKEY) }, dataKeyForWrapping, priv);
    return { v: 1, alg: 'ECDH-P256', pub: b64uEncode(pub), priv: { iv: b64uEncode(iv), data: b64uEncode(ct) } };
  }

  /** A vault made before the log existed gets a log key (needs the app unlocked). Returns the new vault object; the app writes it over vault.json. */
  async function addLogKey(vaultOrJson) {
    var vault = JSON.parse(JSON.stringify(parseVault(vaultOrJson)));
    if (!vault.log) vault.log = await makeLogKey(requireKey());
    return vault;
  }

  async function logAesKey(sharedBits) {
    var base = await subtle().importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(INFO_LOG) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /** Seals one action (any JSON object) for the log. Works while locked. Returns one line of text to append. */
  async function sealLogEntry(vaultOrJson, action) {
    var vault = parseVault(vaultOrJson);
    if (!vault.log) throw EncryptError('BAD_FORMAT', 'This vault has no deferred-action log yet.');
    var pub = await subtle().importKey('raw', b64uDecode(vault.log.pub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    var eph = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    var key = await logAesKey(await subtle().deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256));
    var iv = randomBytes(IV_BYTES);
    var ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: utf8(INFO_LOG) }, key, utf8(JSON.stringify(action)));
    var epk = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
    return LOG_PREFIX + '.' + b64uEncode(epk) + '.' + b64uEncode(iv) + '.' + b64uEncode(ct);
  }

  /**
   * Opens log lines (needs the app unlocked). Returns an array as long as `lines`: the action object, or null for a line that could not be opened
   * (damaged, not sealed to this vault's key, or not an object). Positions are kept because the app counts applied entries by position.
   */
  async function openLogEntries(vaultOrJson, lines) {
    var vault = parseVault(vaultOrJson);
    if (!vault.log) return lines.map(function () { return null; });
    var key = requireKey();
    var privBytes;
    try {
      privBytes = await subtle().decrypt({ name: 'AES-GCM', iv: b64uDecode(vault.log.priv.iv), additionalData: utf8(AAD_VAULT_LOGKEY) }, key, b64uDecode(vault.log.priv.data));
    } catch (e) {
      throw EncryptError('TAMPERED', 'The log key in the vault could not be opened.');
    }
    var priv = await subtle().importKey('pkcs8', privBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var entry = null;
      try {
        var p = String(lines[i]).trim().split('.');
        if (p.length === 4 && p[0] === LOG_PREFIX) {
          var epk = await subtle().importKey('raw', b64uDecode(p[1]), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
          var aes = await logAesKey(await subtle().deriveBits({ name: 'ECDH', public: epk }, priv, 256));
          var plain = await subtle().decrypt({ name: 'AES-GCM', iv: b64uDecode(p[2]), additionalData: utf8(INFO_LOG) }, aes, b64uDecode(p[3]));
          var obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) entry = obj;
        }
      } catch (e) { entry = null; }
      out.push(entry);
    }
    return out;
  }

  /** Puts a key made by createVault(…, {install:false}) to use: the app is unlocked with it. */
  function useKey(key) {
    dataKey = key;
  }

  /** Unlock with the passphrase. Resolves true, or throws WRONG_PASSPHRASE. */
  async function unlock(vaultOrJson, passphrase) {
    var vault = parseVault(vaultOrJson);
    var kek = await deriveKeyFromPassphrase(passphrase, b64uDecode(vault.kdf.salt), vault.kdf.iterations);
    try {
      dataKey = await unwrapDataKey(vault.wrappedKey, kek, AAD_VAULT_PASSPHRASE, false);
    } catch (e) {
      if (e && e.code) throw e;
      throw EncryptError('WRONG_PASSPHRASE', 'Wrong passphrase.');
    }
    return true;
  }

  async function unwrapWithRecovery(vault, recoveryKey, extractable) {
    var kek = await deriveKeyFromRecovery(recoveryStringToBytes(recoveryKey), b64uDecode(vault.recovery.salt));
    try {
      return await unwrapDataKey(vault.recovery.wrappedKey, kek, AAD_VAULT_RECOVERY, extractable);
    } catch (e) {
      if (e && e.code) throw e;
      throw EncryptError('WRONG_RECOVERY_KEY', 'Wrong recovery key.');
    }
  }

  /** Unlock with the recovery key. Resolves true, or throws WRONG_RECOVERY_KEY. */
  async function unlockWithRecoveryKey(vaultOrJson, recoveryKey) {
    dataKey = await unwrapWithRecovery(parseVault(vaultOrJson), recoveryKey, false);
    return true;
  }

  async function rewrapForPassphrase(vault, extractableKey, newPassphrase) {
    requireStrong(newPassphrase);
    var salt = randomBytes(SALT_BYTES);
    var iterations = Math.max(vault.kdf.iterations, PBKDF2_ITERATIONS);
    var kek = await deriveKeyFromPassphrase(newPassphrase, salt, iterations);
    var next = JSON.parse(JSON.stringify(vault));
    next.kdf = { name: 'PBKDF2-SHA256', iterations: iterations, salt: b64uEncode(salt) };
    next.wrappedKey = await wrapDataKey(extractableKey, kek, AAD_VAULT_PASSPHRASE);
    return next;
  }

  /**
   * Change the passphrase without re-encrypting any notes. Returns the new vault
   * object, which the app must write over the old vault file.
   */
  async function changePassphrase(vaultOrJson, currentPassphrase, newPassphrase) {
    var vault = parseVault(vaultOrJson);
    var kek = await deriveKeyFromPassphrase(currentPassphrase, b64uDecode(vault.kdf.salt), vault.kdf.iterations);
    var key;
    try {
      key = await unwrapDataKey(vault.wrappedKey, kek, AAD_VAULT_PASSPHRASE, true);
    } catch (e) {
      throw EncryptError('WRONG_PASSPHRASE', 'Wrong passphrase.');
    }
    return rewrapForPassphrase(vault, key, newPassphrase);
  }

  /** Forgotten passphrase: set a new one using the recovery key. Returns the new vault. */
  async function resetPassphraseWithRecoveryKey(vaultOrJson, recoveryKey, newPassphrase) {
    var vault = parseVault(vaultOrJson);
    var key = await unwrapWithRecovery(vault, recoveryKey, true);
    return rewrapForPassphrase(vault, key, newPassphrase);
  }

  // ------------------------------------------------------------- note bodies
  function randomText(n) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    while (out.length < n) {
      var bytes = randomBytes(Math.max(16, n * 2));
      for (var i = 0; i < bytes.length && out.length < n; i++) {
        if (bytes[i] < 248) out += alphabet[bytes[i] % 62]; // 248 = 62 * 4, avoids modulo bias
      }
    }
    return out;
  }

  /** Bodies under 256 UTF-8 bytes get a random HTML comment so they total exactly 512 bytes. */
  function padBody(html) {
    var bytes = utf8(html).length;
    if (bytes >= PAD_MIN_BYTES) return html;
    var fill = PAD_TARGET_BYTES - bytes - PAD_OPEN.length - PAD_CLOSE.length;
    return html + PAD_OPEN + randomText(fill) + PAD_CLOSE;
  }

  function stripPadding(html) {
    return html.replace(/<!--pad:[A-Za-z0-9]*-->$/, '');
  }

  function bodyAad(noteId) {
    return utf8('lbk:v1:note:' + noteIdString(noteId) + ':body');
  }

  /**
   * Encrypt the inner HTML of a note's <body>. Requires the app to be unlocked.
   * Returns { token, version, iv }. The app puts `token` (a single line of text) in the
   * page; version and iv are available if the app also wants them in metadata.
   * Padding is added fresh on every call.
   */
  async function encryptBody(html, noteId) {
    var key = requireKey();
    var iv = randomBytes(IV_BYTES);
    var ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: bodyAad(noteId) }, key, utf8(padBody(String(html))));
    var ivText = b64uEncode(iv);
    return { token: BODY_PREFIX + '.' + ivText + '.' + b64uEncode(ct), version: FORMAT_VERSION, iv: ivText };
  }

  /** Decrypt a body token back to the original HTML (padding removed). */
  async function decryptBody(token, noteId) {
    var key = requireKey();
    var parts = String(token).trim().split('.');
    if (parts.length !== 3 || !/^LBK\d+$/.test(parts[0])) throw EncryptError('BAD_FORMAT', 'This is not an encrypted note body.');
    if (parts[0] !== BODY_PREFIX) throw EncryptError('UNSUPPORTED_VERSION', 'This note was encrypted by a newer version of the app.');
    var iv = b64uDecode(parts[1]);
    var ct = b64uDecode(parts[2]);
    if (iv.length !== IV_BYTES || ct.length < TAG_BYTES) throw EncryptError('BAD_FORMAT', 'The encrypted note is damaged.');
    var plain;
    try {
      plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv, additionalData: bodyAad(noteId) }, key, ct);
    } catch (e) {
      throw EncryptError('TAMPERED', 'The note could not be decrypted. It is damaged, was modified, or belongs to a different note.');
    }
    return stripPadding(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  }

  // ------------------------------------------------------------- attachments
  function toBlob(data) {
    if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data]);
    throw EncryptError('BAD_FORMAT', 'Expected a Blob, File, ArrayBuffer or typed array.');
  }

  function chunkAad(noteId, index, isFinal) {
    return utf8('lbk:v1:att:' + noteIdString(noteId) + ':' + index + ':' + (isFinal ? 1 : 0));
  }

  function checkChunkSize(size) {
    if (!Number.isInteger(size) || size < MIN_CHUNK_SIZE || size > MAX_CHUNK_SIZE) {
      throw EncryptError('BAD_FORMAT', 'Invalid chunk size.');
    }
  }

  /**
   * Async generator of Uint8Array parts of the encrypted file: a header, then
   * one (IV + ciphertext) part per chunk. Only one chunk is held in memory.
   */
  async function* encryptAttachmentChunks(data, noteId, options) {
    var key = requireKey();
    var chunkSize = (options && options.chunkSize) || CHUNK_SIZE;
    checkChunkSize(chunkSize);
    var blob = toBlob(data);

    var header = new Uint8Array(ATT_HEADER_BYTES);
    header.set(ATT_MAGIC, 0);
    header[4] = FORMAT_VERSION;
    new DataView(header.buffer).setUint32(5, chunkSize, false);
    yield header;

    for (var offset = 0, index = 0; ; offset += chunkSize, index++) {
      var end = Math.min(offset + chunkSize, blob.size);
      var isFinal = end >= blob.size;
      var plain = await blob.slice(offset, end).arrayBuffer();
      var iv = randomBytes(IV_BYTES);
      var ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: chunkAad(noteId, index, isFinal) }, key, plain));
      var part = new Uint8Array(IV_BYTES + ct.length);
      part.set(iv, 0);
      part.set(ct, IV_BYTES);
      yield part;
      if (isFinal) break; // an empty file still produces one (empty) final chunk
    }
  }

  /**
   * Stream-encrypt straight into a writable (anything with write(), such as a
   * FileSystemWritableFileStream). The caller closes the writable.
   */
  async function encryptAttachmentTo(data, noteId, writable, options) {
    for await (var part of encryptAttachmentChunks(data, noteId, options)) await writable.write(part);
  }

  /** True if the Blob starts with the encrypted-attachment header. */
  async function isEncryptedAttachment(data) {
    var head = new Uint8Array(await toBlob(data).slice(0, 4).arrayBuffer());
    return head.length === 4 && ATT_MAGIC.every(function (b, i) { return head[i] === b; });
  }

  /** Async generator of decrypted Uint8Array chunks, one chunk in memory at a time. */
  async function* decryptAttachmentChunks(data, noteId) {
    var key = requireKey();
    var blob = toBlob(data);
    var total = blob.size;
    if (total < ATT_HEADER_BYTES || !(await isEncryptedAttachment(blob))) {
      throw EncryptError('BAD_FORMAT', 'This is not an encrypted attachment.');
    }
    var header = new Uint8Array(await blob.slice(0, ATT_HEADER_BYTES).arrayBuffer());
    if (header[4] !== FORMAT_VERSION) throw EncryptError('UNSUPPORTED_VERSION', 'This attachment was encrypted by a newer version of the app.');
    var chunkSize = new DataView(header.buffer).getUint32(5, false);
    checkChunkSize(chunkSize);
    if (total - ATT_HEADER_BYTES < IV_BYTES + TAG_BYTES) throw EncryptError('BAD_FORMAT', 'The encrypted attachment is truncated.');

    var encLen = IV_BYTES + chunkSize + TAG_BYTES;
    for (var offset = ATT_HEADER_BYTES, index = 0; offset < total; offset += encLen, index++) {
      var end = Math.min(offset + encLen, total);
      var isFinal = end >= total;
      if (end - offset < IV_BYTES + TAG_BYTES) throw EncryptError('BAD_FORMAT', 'The encrypted attachment is truncated.');
      var part = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
      try {
        var plain = await subtle().decrypt(
          { name: 'AES-GCM', iv: part.subarray(0, IV_BYTES), additionalData: chunkAad(noteId, index, isFinal) },
          key,
          part.subarray(IV_BYTES)
        );
      } catch (e) {
        throw EncryptError('TAMPERED', 'The attachment could not be decrypted. It is damaged, incomplete, or belongs to a different note.');
      }
      yield new Uint8Array(plain);
    }
  }

  /** Decrypt an attachment to a Blob. Pass the original media type (kept inside the encrypted note body) as `type`. */
  async function decryptAttachment(data, noteId, type) {
    var parts = [];
    for await (var part of decryptAttachmentChunks(data, noteId)) parts.push(part);
    return new Blob(parts, { type: type || 'application/octet-stream' });
  }

  /** Stream-decrypt into a writable (for decrypting large files in place). The caller closes the writable. */
  async function decryptAttachmentTo(data, noteId, writable) {
    for await (var part of decryptAttachmentChunks(data, noteId)) await writable.write(part);
  }

  // --------------------------------------------------------------------- API
  return {
    FORMAT_VERSION: FORMAT_VERSION,
    PBKDF2_ITERATIONS: PBKDF2_ITERATIONS,
    CHUNK_SIZE: CHUNK_SIZE,
    EncryptError: EncryptError,

    checkPassphraseStrength: checkPassphraseStrength,

    createVault: createVault,
    useKey: useKey,
    addLogKey: addLogKey,
    sealLogEntry: sealLogEntry,
    openLogEntries: openLogEntries,
    unlock: unlock,
    unlockWithRecoveryKey: unlockWithRecoveryKey,
    changePassphrase: changePassphrase,
    resetPassphraseWithRecoveryKey: resetPassphraseWithRecoveryKey,
    lock: lock,
    isUnlocked: isUnlocked,

    encryptBody: encryptBody,
    decryptBody: decryptBody,

    encryptAttachmentTo: encryptAttachmentTo,
    decryptAttachment: decryptAttachment,
    decryptAttachmentTo: decryptAttachmentTo
  };
});
