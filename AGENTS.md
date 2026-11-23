# AGENTS.md: Lil Bro Keep

For an AI agent that must understand, extend, or rebuild this app. It records what the source code cannot tell you: why things are the way they are, what was decided, what was tried and dropped, and the traps found on the way. Read `ARCHITECTURE.md` (the file map and rules) alongside it. The source is the truth for *how*; this file is the truth for *why*.

**Inherited vs decided.** The app began as four files supplied by the user (`index.html`, `styles.css`, `storage.js`, `app.js`, plus icons) and a hand-written spec, `google-keep-image-layout-spec.md`. Features that existed at the start (composer, 12 note colours, pinning, trash, labels, search, grid/list, checklists, rich text, image/video/audio attachments, voice recording, camera, Google Takeout import, HTML export, browser and folder storage with conflict handling, saved copy, toasts, the equalizer spinner) were not discussed in the work described here, so their *reasons* are unknown; where this file says "inherited" it means exactly that. Everything marked **Decided** was an explicit choice, usually the user's, in the work that followed.

The document is organised by screen area: Foundations, Header, Sidebar, Main area, Editor, then Open items.

---

## 1. Foundations

### 1.1 Product and the user's priorities
- A Google Keep look-alike, client-only, plain HTML/CSS/JS, no build step, no dependencies.
- **Local file storage is a major requirement** (Decided). Folder mode (every note is a standalone HTML file in a folder the person chooses) is the main storage; browser storage is the fallback.
- **Mobile**: a PWA was considered and **rejected** (Decided): phone browsers lack the File System Access API, so the folder requirement cannot be met. Direction is a *dedicated mobile app later* (a native wrapper that reuses the web code, with a native folder plugin). To keep that open: the note file format must stay identical across apps so one synced folder serves both, and storage goes through the `Store` interface so a third backend can be added.
- **Scale**: hundreds of notes. Verified comfortable at 2,000 (per-note scans take milliseconds).
- Mimic Google Keep where the user specified it (image layout, default order, opening a note at its top). The user uses the app's own search bar, not Ctrl+F.

### 1.2 How the user wants to work (follow this)
- **Nothing may break.** Before changing risky code, write tests that pin down current behaviour; change; run all tests. This was applied to every refactor and it caught real regressions each time.
- For substantial work the user wants a plan and options first, then answers briefly ("do this one"). Offer 2-4 options with a recommendation and the cost of each.
- The user values: stating what could *not* be tested, measuring instead of guessing, and not over-claiming.

### 1.3 Architecture outcome and its reasons
Plain `<script>` files loaded in a fixed order (`index.html`); a file may only use things defined in files above it. Rules are in `ARCHITECTURE.md`; the reasons:
- **Layering + `Host` hooks.** The original `storage.js` called into `app.js` and vice versa (a circular dependency held together by global scope). Lower layers now reach the page only through four hooks in `Host` (`render`, `collapsed`, `editing`, `status`) that the page fills in at start-up.
- **`Store` facade** (`store.js`) is the only thing the UI talks to for persistence. Reason: it is the seam for a future native-folder backend.
- **`commit()`** (in `store.js`) is the one way to "save and redraw", with options `keepMod` (a reorder or size backfill must not change the modified date), `render:false`, `delay`. Reason: the same save+render pair was hand-written in 12 places and each new feature had to remember the details.
- **`openDialog()`** (`dialog.js`): every dialog is opened through it. **`dragGesture()`** (`drag.js`): every drag-to-reorder uses it. Both exist because the same logic had been written several times by hand and diverged.
- **Classic scripts, not ES modules** (Decided): modules are blocked when a page is opened from disk, and the user may do that.
- **Cache busting:** every script/stylesheet tag in `index.html` carries `?v=<number>`; bump all of them together on each release.
- **Strict mode** is not yet enabled; a scratch run passed the whole suite, so it is a safe step (see Open items).
- One icon table (`P` in `util.js`, drawn with `ic(name,size)`). Anything that can come from a stored note or file (titles, labels, ids, attachment names and kinds, link addresses) goes through `h()` before it enters HTML, including inside attributes; a test with hostile values guards this.

### 1.4 Direct build path (the order that avoids the detours)
1. Note model, sanitiser (`richtext.js`), order logic (`order.js`), folder file format (`format.js`, pure functions).
2. Stores: browser store, media blobs, folder engine, then the `Store` facade and `commit()`. Build the `Host` hook idea in from the start.
3. Page shell: header, sidebar, grid rendering.
4. Build the **virtual masonry grid** directly (do not start with CSS multi-column; see 4.4) and the gallery rows from the spec.
5. Shared `openDialog()` and `dragGesture()` *before* writing any dialog or drag feature.
6. Editor, assembled from separate pieces (rich text, recorder, attachments), not as one closure.
7. Progress ring/spinner.
8. Tests alongside each step; the harness (1.5) is worth building first.

### 1.5 Test harness and environment (traps, none of which the source shows)
- Tests are Python Playwright scripts (headless Chromium) in `tests/`; `python3 tests/run_all.py` starts its own web server and runs the suites listed in its `suites` list (the Python tests `tests/t<N>*.py`, plus the Node test `tests/t36_order_logic.js`, which runs first; `python3 tests/run_all.py word ...` runs only suites whose title or file name contains a word, which keeps one call short), so **a new test file must be added to that list and to the `names` map in `tests/run_all.py`**; a timeout counts as a failure; `tests/coverage.py` runs them with JS coverage via the browser profiler (run in batches, then `--report`).
- **Background processes do not survive between tool calls** in this environment: start the web server in the same command as the test (`(nohup python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1; python3 tests/...`). Never `pkill -f chrom...` (the command line itself matches and kills your own shell).
- **Folder mode is tested against OPFS** (`navigator.storage.getDirectory()`), which behaves like a notes folder. In this headless browser, *reading a folder handle back out of IndexedDB crashes the browser*. So: tests attach OPFS the way choosing a folder does; and the start-up path (`t31`) replaces the stored-handle lookup with a stand-in (it wraps `IDBObjectStore.prototype.get` for the key `dir`). Permission calls are stubbed (`queryPermission`/`requestPermission`), because calling the real one on an OPFS handle also crashes it.
- Playwright `evaluate("window.x=async()=>...")` **calls** a string that evaluates to a function; wrap in `()=>{...}` to assign.
- Camera and microphone are stand-ins (canvas `captureStream`, fake `MediaRecorder`); touch is simulated with CDP touch events; coverage taken before each click/reload (page-initiated reloads otherwise discard it).
- A test that stops mid-way with "Target closed" usually means the browser crashed (see the handle note), not a logic failure.
- **`tests/harness.py` is the shared test code** (do not copy its parts into a test): `ok()` and `finish()` (one failure counter and exit code), and `session(folder=True)`, a browser plus page with the folder helpers (`boot`, `rd`, `rdb`, `wr`, `ls`, `rm`, `wipe`, `new_tab`). **Wait for a condition, not a time**: `s.settle()` waits until nothing is in flight (no pending save, scan, lazy read, spinner or "working" dialog button) and stays that way a short moment, `s.until(js)` waits for an expression, `s.pause(ms)` is only for things that are about time (a debounce). The older tests still use fixed `wait_for_timeout` sleeps and carry their own setup; move one onto the harness when it is next touched. `tests/css_compare.py OLD.css` compares computed styles of about twenty states with an old stylesheet: use it to prove that a CSS refactor changed nothing.
- The suites (24): order logic, image-layout geometry (section 11.1 numbers, drops, viewer sizes, strict mode on every script), colour picker, viewer zoom, virtual grid, card/pin/colour layout, ordering and drag, progress ring, folder mode, folder dialogs, escaping and scale, image drag, touch drag, drag auto-scroll, open-at-top, editor, import/export, folder start-up, labels/replace/camera, robustness, keyboard grid, dialogs, two copies on one folder (`t37`: two pages sharing one folder, the lock, conflicts), error and edge paths (`t38`: failed saves, stopping use of the folder, copy into a new folder, drops on the editor, viewer pan, card pop-up and camera). Last measured coverage: 94.9% of code, all files including `dialog.js`.

### 1.6 Lessons that cost time (so you do not repeat them)
- A `flex-grow` that sums to less than 1 only fills that fraction of the row. See 4.3.
- Option objects with the same key used for two things silently overwrote each other (`move` was both a pixel threshold and a callback). Name options distinctly.
- `notes` starts as `null`, not `[]`, before loading: an empty-list default made the "no readable saved notes, show samples" fallback unreachable.
- Reading `el.querySelector('.rt')` to update the recording timer hit the note body (same class) and overwrote the user's text. Use unique class names for different roles.
- Escape ordering: dialogs listen for Escape in the capture phase on `document`; a drag in progress must win, so `drag.js` listens on `window` (which runs first).
- An outside click while a popover is open *only closes the popover* by design (the click is swallowed). Tests must account for it.

---

## 2. Header area

Layout, left to right: progress slot, menu button, logo and name, search, spacer, status line, view toggle. It is sticky, 64 px high; the sidebar's top offset depends on that number.

### 2.1 Progress indicator (spinner and ring)
- **Decided**: a **progress ring with a percentage** for background jobs whose progress is measurable, and the **existing equalizer spinner** for jobs that are not. Four proposals were shown visually (task-count badge, ring, label pill "Importing 17 / 40", equalizer bars used as a 5-step meter); the user chose the ring for measurable work and the existing spinner otherwise. The other three were dropped.
- Measurable today: saving notes to the folder (changed notes + deletions + the final index write) and importing (one step per note file). Not measurable, so they keep the spinner: rescanning/checking the folder, export, attaching one file.
- Rule: the ring replaces the spinner only while *every* running job reports progress (combined percentage); any job without a percentage returns the display to the spinner. The number is capped at 99 while work is running. A job registers with `busyProgress(total)` inside `withBusy`.
- **No flicker (Decided):** the indicator chooses the ring at once, but goes back to the spinner only after the ring has not been wanted for 0.9 s in a row (`SPIN_HOLD` in `util.js`). Before, a background folder save that started in the middle of an import was busy before it had said how far along it was, and its progress ended before its work did, so the indicator flipped between ring and spinner many times. While the ring is held without a job to measure, it keeps its last percentage.
- **Position (Decided):** the slot is in the header **right of the search box** (it used to be left of the menu button). The slot is 0 wide while idle, with a negative left margin that cancels the header gap, so nothing moves until it appears.
- The slot appears after a short delay (so quick jobs never flash). Brand amber `#d9921a`; ring number colour `#8a5a00` for contrast; tooltip "Working in the background: 42%".

### 2.2 Menu button
Desktop: toggles a collapsed icon-only sidebar (`body.min`, 72 px). Width ≤ 700 px: toggles a slide-over drawer (`body.open`).

### 2.3 Search
Case-insensitive substring over title, body, checklist items, label names and link addresses. Re-renders on every keystroke. While a search is active, **drag-reordering is disabled** (results are a filtered slice).

### 2.4 Status line
Shows folder-mode status ("Saving 3 of 12…") and errors (red). Empty in browser mode.

### 2.5 View toggle
Grid <-> list. **Not persisted** (grid on load). List view is a single column, max 600 px, centred, and uses the same virtual grid with one column.

---

## 3. Sidebar

Contents: "All notes", the label list, Trash, Import, Export, Settings.

### 3.1 Labels
- Multi-select: choosing several labels shows notes that have **any** of them.
- Names are unique **case-insensitively** and sorted with `localeCompare`. Only the sidebar's rename field limits length (60 characters); the editor's new-label field has no limit.
- Rename (pencil, on hover): Enter commits, Escape cancels, clicking away commits, an empty name is ignored, a name that already exists (any case) is refused with a toast. Renaming rewrites the label on every note, keeps the selection on the new name, and in folder mode also rewrites the label in **stored note files the app has not loaded** (`Store.relabel`), so nothing is left under the old name.
- Delete removes the label from every note, with a toast stating how many notes were affected.

### 3.2 Trash
Trashing unpins. Trashed notes stay until "Empty Trash" (no automatic expiry; inherited, differs from Google Keep). Cards in Trash offer Restore and Delete forever; drag-reorder is off there.

### 3.3 Import (Google Takeout)
Inherited feature, now covered by tests. Behaviours worth knowing: the heading date is parsed as **local time**; with no heading date the paired `.json` supplies created/edited times; bold/italic from the `.json` text replaces the plain text only if the two texts are the same; a note whose attachment file is not among the selection is still imported (and the miss is reported); empty notes and non-note pages are skipped; importing the same files twice adds nothing. **Caveat: the tests use sample files built from what the parser expects, never a real Takeout export.**

### 3.4 Export
One HTML page of the notes **in the current view**: pinned first, then the rest in view order; titles escaped; checklists with ☑/☐; labels and media are not included. Uses the save-file picker, with a download fallback; cancelling the picker is silent.

### 3.5 Settings, storage modes and the folder format
- **Browser mode**: notes and labels in `localStorage`; attachment data in IndexedDB.
- **Folder mode** (desktop Chromium only): `styles.css`, `index.html` (a readable list of links with a JSON block of each note's *details*, no note text), one page per note at `<id/100>/<id>.html` with its metadata as JSON in an HTML comment, and media under `media/{images,video,audio}/<id/100>/<id>-<n>.<ext>`. The format is inherited; **it must not change incompatibly** (see 1.1). The additions made in this work are optional keys, so older files still load: `pos` (manual order) on a note and `w`/`h` (pixel size) on image attachments.
- Choosing a folder: if it already holds notes the app offers to **load them** (the notes currently in the app are *not* merged); if empty it offers to **copy** the current notes in or start empty. Also: Rescan, Rewrite stylesheet, Disconnect.
- Start-up when a folder is remembered: access granted -> load; needs a click -> show the **saved copy** with a banner ("Click anywhere to reconnect"); no saved copy -> a full-page Reconnect prompt; no remembered folder -> fall back to browser mode. While the folder is not connected nothing is written to browser storage (fixed: a save in that state used to overwrite the browser copy).
- **Lazy loading (decided):** the index gives every note's details (`id`, link title, colour, pin, trash, labels, attachments, links, dates, order key, file size/date) but no text. A note held only by those is a **stub** (`n.stub`, with `n.idxTitle`). Its page is read when a card for it is drawn, when it is opened, before it is rewritten, before an export, and when a search needs it (`loadNote`, `loadMany`, `searchFiles` in `folder.js`). Reading is never an edit: `lastW` is brought in step so nothing is rewritten. A page that cannot be read is never overwritten. An index written by the earlier version (whole notes) still loads.
- **Search** matches loaded notes and the labels/links of stubs at once, then looks through the pages of the rest in the background (cancelled by the next keystroke); matches are loaded as they are found.
- **Import clears first (decided):** a Takeout import starts from a clean browser. In browser mode every stored note, label and media file is cleared first (welcome notes included), after a confirmation that says how many notes go; re-importing the same files therefore gives the same notes, not an update of the old ones. In folder mode the notes live in the folder, so only the browser's own leftovers are cleared and the folder's notes stay and are merged as before.
- **Encryption (stage 2; folder storage only):** set up in Settings (a passphrase with a strength check, then a recovery key shown once); `vault.json` in the folder root holds the wrapped keys. **The app always starts locked.** After setup every new note starts encrypted (`n.enc`); notes written earlier stay plain. A note's page keeps only dates, colour, pinned/trashed, the names of its `.enc` attachment files and the encryption settings readable (`sealedHTML`); the title, text, checklist, labels, links, original attachment names/types and import signature are one encrypted JSON token (`pre.ct`), padded to 512 bytes when under 256, bound to the note id. The index shows "Encrypted note" and an `enc` flag, no labels/links/attachments, and leaves out labels only encrypted notes use (`PRIVATE_LABELS`). Locked, an encrypted note is a stub (`stub` + `enc`) that keeps its ciphertext when only its details change (pin, colour, trash); it never shows its text. **The padlock** in the editor turns encryption off for that note, after a confirmation; once a note has been *saved* unencrypted (`n.plain`) the padlock is gone and the save code never writes it encrypted again. Making a note unencrypted decrypts its attachments to plain files (streamed) and deletes the `.enc` files only after the new page is written. Locking writes pending changes first, then drops every decrypted note except the one being edited; saving that note later asks for the passphrase. Idle lock: 5 minutes (`Crypt.idleMs`). **Locked app (stage 3):** only encrypted notes are blocked; plain notes stay fully usable. A locked encrypted note is drawn as a card titled "Encrypted note" with its ciphertext (`peekSealed` reads the token, nothing is decrypted); its aria-label hides the title. Search while locked covers plain notes only and shows a banner ("Encrypted notes aren't included while locked", with an Unlock button); locking or unlocking while a search is showing restarts it (`Host.crypt` calls `searchStart`). An export leaves out encrypted notes that are locked and says so. Locking first writes pending edits (including the open note's), then drops the decrypted notes.
- **Conventions from the maintainability pass:** (1) **No empty `catch`.** A failure that is expected and safe to ignore is written `catch(e){quiet('why it is safe',e)}` (`util.js`); set `localStorage.keep-debug='1'` to see them in the console. (2) **Where a note's page lives** is only in `folder-io.js` (`bucketDir`, `pageName`, `readPage`, `writePage`, `removePage`, `pageExists`, `pageStat`, `eachPage`); do not build `[String(bucket(id))]` paths elsewhere. (3) **A dialog that answers with a value** uses `askDialog(opts, wire, fallback)` (`dialog.js`). (4) **Popovers** use `popupAt(el, btn)` and `swallowNextClick()` (`app.js`). (5) **The page asks for the passphrase through `Host.unlock()`**, never by calling `Crypt` from a lower layer. (6) **CSS tokens:** colours that repeat (`--hover`, `--hover-2`, `--tint`, `--accent`, `--accent-dark`, `--danger`, `--ink-2`), corner radii (`--r-sm/md/lg/round`) and spacing steps (`--sp-1..4`) are in `:root`; use them instead of literals, and write a selector once (merge into the existing rule). The corner buttons (card pin, editor pin, editor padlock) share one rule.
- **Reconnecting asks for the passphrase (decided):** when a folder is chosen or reconnected (`loadFolder({unlock:true})`, from `reconnectFolder` and the load path of `attachFolder`) and it has a vault, the unlock dialog opens by itself once the folder is loaded; cancelling leaves the app locked with the folder loaded. A plain start with permission already granted does not ask (the app stays locked until the person unlocks it). A folder that was just given encryption in the same change is already unlocked and is not asked again.
- **The sidebar lock button must really hide:** `.side button[hidden]{display:none}` (the button rule alone would show a `hidden` button), and `Crypt.changed()` runs at start-up so its icon and label are right whatever the storage mode. It shows only when a vault is known (`keep-vault`).
- **The Lock button is known before the folder is** (`keep-vault` in localStorage records that a vault exists): it shows as *Unlock* at the start of every browser session, and clicking it reconnects the folder first (a user gesture) and then asks for the passphrase. After a **recovery-key unlock** a *Set a new passphrase* dialog follows at once (`resetDialog`, `Store.resetPassphrase`); the change dialog also has *Forgot your passphrase?*.
- **Deferred-action log (decided):** the labels of encrypted notes are inside their ciphertext, so a label rename or delete cannot reach them while they are locked (or read). Each rename/delete is therefore also written as one sealed line to `actions.log` in the folder root (created empty when encryption is set up) and done to the encrypted notes later. **Because a line must be written while locked, when there is no data key, it is sealed to a public key stored in `vault.json`** (`vault.log.pub`; ECDH P-256 + HKDF + AES-GCM, a fresh ephemeral key per line); the private key is in the vault too, encrypted by the data key, so only an unlocked app can read the log (`encrypt.js`: `sealLogEntry`, `openLogEntries`, `addLogKey`). The log is **position-based**: line *i* is the *i*-th action; every encrypted note keeps `logPos` (inside its ciphertext; `lp` as a plain hint in its page head, the index and the saved copy) = how many lines it is up to date with, so each action is done once per note, in order, and a note written after an action is stamped as up to date and never touched by it (`applyPending`, `deferAction`, `applyDeferredActions` in `folder-crypt.js`). After an unlock, and after any label change, a background sweep brings the notes that are behind up to date; a note that is not read yet is read (which does it) and then saved normally; a note whose `lp` is current is not even opened. Only `rename` and `delete` of a label are ever done (`labelIn`), whatever the log says. A line that cannot be opened counts as a line. A vault made before the log existed gets a log key the first time it is unlocked. `sigOf` includes the log position, so moving on counts as a change that must be written.
- **Known issues with the log (accepted, and the reasons to revisit them):** (1) *Anyone who can write to the folder can append a line* (that is what a public key means), so a forged line is possible; the damage is limited to renaming or deleting a label in encrypted notes, because nothing else is ever done, but it is not authenticated and cannot be (no secret exists while locked). (2) *Not truly append-only on disk:* the File System Access API replaces a file on close, so two writers (two devices, a tab and a sync client) can lose a line or make a conflicted copy; one app instance serialises its own writes, nothing serialises two devices. (3) *Order and exactly-once rely on line position:* a sync merge that reorders or conflicts the file would apply actions out of order or twice. (4) *Write amplification:* after the first action every encrypted note behind the log is rewritten once (to record its position), which is a burst of sync traffic. (5) *The log only grows:* it cannot be compacted without the key, and compacting while another device is behind would lose its actions; it is opened and decrypted at every unlock. (6) *Metadata:* the size and the number of lines show how often labels were changed (no padding). (7) *Eventual consistency:* until the sweep finishes, the labels of encrypted notes that are not read yet show the old names; plain notes are renamed at once. (8) *Failure while recording:* if the line cannot be written after the in-memory entry was made, the entry is removed again and a message says so, but notes written in that moment may carry a position one ahead; and a vault without a log key cannot defer anything until it is unlocked once.
- **A folder with an old vault but no notes starts over (decided):** `pickFolder` treats a folder with `vault.json` and no notes like a folder without a vault: the set-up dialog opens (with a notice that the old setup will be replaced), and only when the change goes ahead is the old `vault.json` deleted and a new vault and an empty `actions.log` written. Cancelling leaves the old file as it was.
- **Choosing a notes folder sets up encryption first (decided):** in `pickFolder`, right after the folder is picked and inspected, a folder with no `vault.json` gets the set-up dialog (`Crypt.setupDialog({pending:true})`) before any question about its notes. The vault is only *prepared* (`Store.prepareEncryption`, `PENDING` in `folder-crypt.js`): nothing is written and no key is in use until `attachFolder` goes ahead; cancelling the dialog, or declining the following load/copy question, stops the whole change and leaves no trace (`discardPendingEncryption` in a `finally`). When it goes ahead: `vault.json` is written, the new key is put to use (`LBE.useKey`) and the app stays unlocked (loading a folder normally locks it). Notes copied in from browser storage are then encrypted (like imported ones), attachments included; notes already in the folder stay plain. A folder that already has a vault gets no dialog. Switching from one folder to another copies only notes that are readable without a key and already read (`copyableNotes`); encrypted or unread notes stay in the old folder, and the copy question says how many. No spinner runs while a question waits (`pickFolder` uses `working()` around the long parts only). There is no "skip": encryption is part of using a folder.
- **Encryption dialogs** (`crypt-ui.js`) follow the Import/Export pattern (`.dlg2`: icon badge, title, short text, one `.big` button, a plain `.cl` button). The passphrase fields are real `<form>`s with an invisible username (`.uname`, excluded from the dialog's focus order) and `autocomplete` values (`new-password`, `current-password`), and the passphrase is offered to `navigator.credentials.store` where the browser has `PasswordCredential`, so the browser's password manager can offer to keep it (on a Mac that manager is protected by the Keychain). The page cannot write to the system keychain itself and nothing is stored without the browser asking. The recovery key is never offered. After a successful unlock the focus returns to the opener without the keyboard ring (`quietFocus`, until the next key press); cancelling restores focus as every other dialog does. A locked card is redrawn when the app is unlocked (the unlock state is in `cardSig`), which is what reads and decrypts it.
- **Editor drafts (stage 4, `drafts.js`; folder storage only):** while a note is open in the editor a copy is kept in localStorage (`keep-draft`, written about 0.6 s after typing stops, and when the page is hidden or closed). It is removed once the note has been closed and `Store.isSaved(n)` is true (checked after the flush and after every later flush, so a note that could not be written while locked keeps its draft until it can). **A draft is not encrypted, even for an encrypted note: a deliberate trade-off, stated in the file header; closing the note is the protection.** One draft at most; each page has a session id and holds a Web Lock `lil-bro-keep-session-<id>`; at start a draft whose lock is still held belongs to an open tab and is left alone, otherwise a dialog offers Continue / Discard (it shows nothing of an encrypted note's text, and Continue asks for the passphrase first). Continuing applies the draft to the note, saves it, and opens the editor. Known limit: attachment files added in a session whose draft is discarded stay in the folder.
- **Import with encryption (stage 5):** with a vault, a Takeout import needs the app unlocked (it asks first; cancelling changes nothing), reads the already-encrypted notes so a repeated import is matched by their signatures (kept inside the encrypted text), and makes every new note encrypted *before* its attachments are stored, so those files are `.enc` too. Notes it merges into keep their own state (an old plain note stays plain). The import dialog says so.
- **Notes stored unencrypted are never written encrypted (decided, enforced in the save code):** `pageFor` forces `enc=false` when `n.plain`; the editor ignores the padlock for such a note; a recovered draft takes the note's on-disk state, not its own `enc`. Switching a note to unencrypted streams every attachment file through chunked decryption from disk (the editor does not need to have loaded it), writes the plain files, then the page, then deletes the `.enc` files.
- Known limits: attachment files added in a session whose draft is discarded stay in the folder; a note switched to unencrypted may already be in a sync service's version history in its encrypted form (harmless) and the plain form stays there too.
- **Disconnecting** (settings, or "Use browser storage instead") clears everything the browser holds (saved copy, browser-stored notes and labels, stored media) and restarts from the two welcome notes. The folder's files are not touched.
- **Conflicts** (inherited behaviour, tested): a local edit and an outside edit of the same note keep both versions; files edited or added or deleted outside are picked up by a background check.
- **Robustness decisions**: a failed browser-mode save shows a message (at most every 30 s); unreadable stored notes are copied to `keep-notes-unreadable-<time>` *before* anything can overwrite them and the person is told; unreadable note files in a folder are reported once by name and never deleted.

### 3.6 Dialogs (Import, Export, Settings, and the editor's own)
**Decided**: all go through `openDialog()`: announced as dialogs, the page behind is `inert`, focus goes in and Tab stays in, Escape closes the topmost one only, focus returns to where it was, nested dialogs stack (viewer over editor, "replace file?" over editor, camera over editor). Pressing outside closes the page dialogs and the editor but **not** the replace question.

---

## 4. Main area

### 4.1 Composer, sections, banners, messages
- Collapsed composer: "New note…" with a list button; expanding it shows the editor inline.
- Headings "Pinned" and "Others"; empty states with an icon; a Trash banner; the folder reconnect banners (3.5).
- Toasts: 4.5 s (7 s when they carry an action such as Undo). Undo is used for reordering.

### 4.2 Card
Decisions, all explicit:
- The note colour starts **at the title and runs down**; **above the title the card is white**. If the note has **no attachments the colour fills the whole card**, including the strip above the title.
- **Images run flush** to the card's top and side edges and straight into the title block (no gaps). The pin button sits **above** the images (it was hidden behind them at first).
- The card's action row starts with a **palette** icon (Decided) so colour can change without opening the note. Its picker is a **floating popover on the body** (not inside the card), because cards scroll and would clip it.
- **Icon bar and labels on a card (Decided):** with a mouse, the icon row (`.acts`) is a container of its own that takes **no room** while hidden. It slides up from the bottom of the note (0.2 s) when the pointer enters the card, or when keyboard focus is inside it, and slides back down when the pointer leaves. The labels (`.chips`) are a separate container sitting **against the bottom of the note**; as the bar comes in it pushes the labels up by exactly its height (`--acts-h`, 40px), and when it leaves they sink back until their bottom edge is at the bottom of the note. The labels container has 4px padding above and 8px below (the gap to the icons is that 8px plus the bar's own 4px). The note text stops at the top of the labels container (or of the bar when the note has no labels), because both have the note colour and cover it; the text is not re-wrapped. A note shorter than 88px is given that minimum height so its first line is still visible above the bar. With touch (`hover:none`) there is no hover, so the icon row stays a normal row at the bottom of the card, always visible, and the labels sit above it. Tests that click a card's icon must wait about 0.3 s after hovering for the bar to finish sliding in; clicking while it is still moving can miss, and Playwright's auto-scroll then closes the pop-up (the pop-ups close on any scroll).
- **Label "x" buttons on a card (Decided):** the "x" that removes a label shows on **all** labels of a note while the pointer is anywhere over the note (or keyboard focus is inside it), not only on the label under the pointer. Before, the hovered last label widened, wrapped to the next row (out from under the pointer), shrank, moved back and so on: a flicker. A browser cannot move the pointer, so the fix is that no label's width depends on which label is hovered. Known side effect: when the "x" buttons make the last label wrap, the note becomes one row (34px) taller while hovered and the notes below it move down, and back up when the pointer leaves. Google Keep instead overlays the "x" on the label without changing its width; that was the other option.
- **Date in the editor (Decided):** at the right end of the editor's label row, which sits just above the icon bar, the note shows "Edited <date and time>" (12-hour clock with AM/PM, for example "2 Mar 2026, 5:45 PM") when it was modified after it was created, otherwise "Created <date and time>". While you are typing it moves to "now" as soon as the note differs from how it was when the editor opened. A brand-new note (not yet saved) shows no date. The modified date (`n.mod`) is kept by `stampMod()` in `store.js` for browser storage (a save compares each note's signature with its last saved one) and by the folder writer for folder storage; reorders and size backfills do not count as edits (`keepMod`).
- **A card never scrolls (Decided).** In the grid, scrolling always moves the whole grid, never an individual note; the note only scrolls once it is open in the editor. A card is cut off instead: text at 320px (`.tx`), a checklist at 320px (`.card ul`), and the whole card at the window height minus 32px (`.card`, `overflow: clip`, so focus cannot scroll it either). The virtual grid's height estimate applies the same limits (`vgrid.js`). Before this, a card was a scroll container with fading scrollbars.
- Clicking anywhere on a card, images included, opens the note; the card shows **no "+N" counter** for hidden images.
- A card is announced to screen readers as "Note: title" / "Pinned note: title".

### 4.3 Image layout (from the spec; the spec file is the source of truth except for the viewer, see 5.4)
- Justified rows, equal height per row, row fills the width, never cropped; **max 3 per row; if N mod 3 is not 0 the *first* row is the short one** ("remainder first"), then rows of 3. The grid shows the first **two** rows of the full grouping (never regrouping the visible images); the editor shows all.
- Implemented with flexbox: tile `aspect-ratio` = width/height, `flex-basis:0`, and flex-grow proportional to the aspect ratio. **Trap**: grow factors summing to less than 1 (a lone portrait) leave the row short, so the grow is **ratio x 1000**.
- Size comes from the stored `w`/`h`, **measured when the image is attached** (so the space is reserved before the image loads). Images without a size use 1:1 until they load, then the size is stored (without changing the note's modified date). A failed load shows a neutral "Image unavailable" tile.
- The gallery itself never scrolls; in the editor the note scrolls (a card in the grid does not scroll at all).

### 4.4 Virtual masonry grid
- **Decided**: render only cards in or near the viewport (about one viewport of overscan each way). The earlier version rendered everything with CSS multi-column.
- Consequence the user accepted: cards are placed **Keep-style, left to right into the shortest column** (newest first reads across), not the multi-column top-to-bottom order. Columns: `floor((width+gap)/(240+gap))`, gap 16.
- Heights are **estimated first** (images exactly from stored sizes, text approximately; about 4% average error) and **replaced by measured heights** once a card has been on screen; layout is recomputed, and **scroll anchoring** keeps the card you are looking at fixed when estimates are corrected.
- Cards are reused by note id and rebuilt only when a content signature changes, so changing one note touches one card.
- Dropped: lazy-loading images only (does not bound the card count); a lookup table by id (ids are assigned later in folder mode, so it can go stale; measured scans are cheap).
- Window scrolls (not an inner container). Ctrl+F will not find un-rendered notes: accepted.

### 4.5 Order and drag-to-reorder
- **Default order**: newest first by created time (`ts`).
- **Decided**: manual order is an optional per-note numeric key `pos`; the sort key is `pos` if present else `ts`, highest first, ties by id. A drag rewrites **only the dragged note** (one file in folder mode) with a value between its new neighbours; if the gap becomes too small, a few neighbours are respaced. Dropped: a separate ordered list of ids (goes stale on add/delete/outside edits and rewrites a shared file), string fractional keys.
- **Within a section only** (Pinned vs Others never mix by dragging). **Pin/unpin moves the note to the top of the section it enters.** Reordering never changes the modified date. After a move a toast offers **Undo** (restores the previous key, or removes it).
- Drag works in default and label views, grid and list; off in search results, Trash, and while the folder is not connected.
- Gesture: mouse needs about 5 px of movement; touch needs a ~350 ms press-and-hold (moving first means scrolling); live reflow with a dashed placeholder; auto-scroll near the edges (clear of the sticky header); Escape cancels; the click after a drag is swallowed.
- Keyboard: **Alt + arrow keys** moves the focused note one place.

### 4.6 Keyboard in the grid
- **Decided**: the grid is **one Tab stop**; **arrow keys** move between cards (up/down stay in the column, left/right go to the neighbouring column's closest card, past the bottom/top of a section crosses into the next/previous section); **Enter or Space opens** the note; Home/End jump to first/last. Cards that are not rendered are reached by computing from layout and scrolling them in. Closing the editor returns focus to the card.
- Dropped: making every card a Tab stop (very long Tab sequence).
- Implementation constraint: buttons of non-current cards are removed from the tab order; the focus ring and the revealed action buttons use `:focus-visible` so mouse users see no ring.

---

## 5. Editor

Used as a dialog (opening an existing note) and inline (composer).

### 5.1 Structure and look
- From top: a white strip (hidden when the note has images), the **attachments area** (images flush to the edges and top, then video/audio players, then links), then title and text (coloured block), then the footer: recording bar, message line, label chips, toolbar (bold, italic, underline, clear formatting, palette, label, image, camera, record, list toggle, trash, undo/redo, Done).
- For a note without images the editor keeps a short white strip above the title (not changed when the card got a fully coloured background; the user only asked for the grid).
- The editor never exceeds the window; the note scrolls, not the gallery; no always-reserved scrollbar space (it showed as a coloured stripe).
- **Opens scrolled to the top** like Google Keep (Decided); the cursor is still placed at the end so typing works at once. Cause of the earlier bug: focusing the text area scrolled it into view.

### 5.2 Text
- Rich text is a small sanitised subset; typed lists ("1.", "a.", "-") continue on Enter and end on an empty item; typed web addresses become links when you press space; paste is plain text; undo/redo snapshots one "block" (a selection operation). Inherited behaviours, now covered by tests.
- Checklists: converting text<->list keeps content; Enter adds an item after the current one; items can be ticked/removed.
- Nothing is written for a note that was only looked at; an empty new note is discarded.

### 5.3 Attachments
- Files by picker, drop or paste; only image, video and audio are accepted (others refused with a message). Dropped web addresses are appended to the text as links.
- Same-name file -> a **replace / keep both / cancel** question (keep both names it "name 1.ext").
- Camera dialog (needs a camera; blocked or missing camera gives a clear message). **Voice recording**: the recording bar shows a timer; closing the note while recording saves the recording; the timer must never touch the note text (see 1.6).

### 5.4 Image gallery and viewer
- Tile toolbar: move earlier, move later, delete. **Drag to reorder** (hold ~300 ms or move ~4 px, also with a mouse), floating 80 px preview, drop line, auto-scroll; keyboard Alt+arrows on a focused tile; the moved images take over the *image slots* of the attachment list (videos and audio keep theirs).
- **Viewer** (clicking an image in the editor; not on cards): **Decided** (changed from the spec): opens at **100% = the whole image fitted to the window** (smaller images are scaled up), zoom **40%-200%** in steps of 1.25, arrows (and arrow keys) go to the previous/next image **at 100% again**, no wrap-around, close button top-left, Escape closes the viewer only, drag pans, Ctrl+wheel zooms. The spec's "shorter axis" sizing and 4x zoom are **superseded** and the spec document is out of date on this.
- **Sliding between images (Decided):** the picture on screen is copied into a layer that slides out while the new one slides in, using a CSS transition on `transform` (`.ivsl`, 0.3 s). The new image is positioned off screen, on the side it arrives from, *before* its file is assigned, so it loads out of sight and is never painted in the middle first (before, one frame showed it at the centre before it jumped away). On the way the two pictures share the screen in every proportion from 100/0 to 0/100; at the end the new one is the one on screen. A literal 10% at a time would be `steps(10)` on `.ivsl`, which looks jerky, so it is not used. Reduced motion: instant.
- **Rotation in the viewer (Decided):** two buttons (left and right, in the zoom bar) and the keys **R** (right) and **Shift+R** (left) turn the picture by 90 degrees. It is for looking only: a CSS rotation on `.ivimg` inside `.ivbox` (the box has the size of the picture as seen, so zoom, pan and scrolling work on the rotated picture). It never touches the image in the editor, the stored data or the file on disk. Each image keeps its own turn while the viewer is open (`rots` map in `openViewer`); closing the viewer forgets it. The degrees are a running total so a turn always animates the short way round; with reduced motion it is instant.
- Image list in the editor is the same ordered list as the card; the viewer covers all images, including those hidden on the card.

### 5.5 Colour, labels, pin, closing
- Palette and label picker are popovers inside the editor; Escape closes an open popover before the note. Pinning moves the note to the top of its section.
- Closing: Done, trash, Escape, or pressing outside; focus returns to the originating card.
- Colours are 12, indexed 0-11 (CSS variables `--k0..--k11`), names in `model.js`; Takeout colour names map onto them in the import code.

---

## 6. Open items and known gaps

**Tests**
1. About 5% of code never ran. The largest blocks: the lock-protected number claim for a note saved after its media (`claimId`), attachments in a conflict copy (`keepBoth`), `appendLinks` edge cases, `recorder.js` (84%) and the Takeout import's rarer branches (88%). (`disconnectFolder` shows as never run only because the page reloads and drops coverage; `t38` does exercise it.)
2. Needs a human: the real folder picker in desktop Chrome (and a real sync service), a **real Takeout export**, a real camera/microphone, a real touch device, a screen reader (VoiceOver/NVDA), and remembering the folder across restarts (the test uses a stand-in).

**Code**
- The agreed plan (steps 1 to 5) is finished: the Takeout import, export and label list are in `takeout.js`, `export.js` and `labels.js`, every script is strict, and the `galEsc` duplicate is gone.

**Documentation**
- `google-keep-image-layout-spec.md`: the viewer section and its test table (11.5) no longer match the app (see 5.4).

**Minor**
- While only the saved copy is showing, `Store.mode` reports `'browser'`.
- The mobile app (1.1) has no code yet; its design constraints are in 1.1 and 1.3.
- **Import: attachment filenames in a different Unicode form are not matched (Decided: left as is).** The import finds a note's attachment files by comparing names as plain lowercase strings (`baseName` and the `idx` map in `js/takeout.js`). A name with accents or other non-ASCII characters can be stored in a composed form (one character for "é") or a decomposed form (e plus a combining accent); macOS often writes the decomposed form, while the note's HTML refers to the composed one. The two look identical but do not compare equal, so the attachment is reported as "not found among your selection" and dropped; the note itself still imports. Found by test with "café photo.png"; not tried on a real Takeout export. Names that are plain ASCII are not affected. The user chose not to fix it because the content matters more than file names. If it is ever fixed: normalise both sides with `String.prototype.normalize('NFC')` (in `baseName` and where `idx` keys are built from `f.name`), and add a test with a decomposed filename.

---

## 7. Reverting the text size change

Note text was made larger on request: title +3px (16px to 19px), body and checklist text +3px (14px to 17px), and line spacing (the space between lines, line-height minus font size) +2px. Sizes stay in `rem`. All of it is controlled by four variables at the top of `css/styles.css` (`:root`), used by `.card h3`, `.tx`, `.card li`, `.editor .t`, `.editor textarea`, `.li .x` and `.rt`:

| variable | now | before |
|---|---|---|
| `--fs-title` | `1.1875rem` | `1rem` |
| `--fs-body` | `1.0625rem` | `.875rem` |
| `--lh-title` | `1.4` | `1.35` on cards, `1.45` in the editor (inherited from `body`) |
| `--lh-body` | `1.49` | `1.45` (inherited from `body`) |
| `--note-fg` | `#222222` | `#202124` (`--fg`, inherited) |

To revert: set the variables to the "before" values (the editor title then gets 1.35 instead of 1.45, a 2px difference). Also revert the text-height estimate in `vgEstimate` (`js/vgrid.js`): title 9.7 px per character and 26.6 px per line (before: 8.2 and 21.6), body and list items 8.7 px per character and 25.3 px per line (before: 7.2 and 20). The estimate only matters until a card has been measured, so being slightly off is harmless, but it is kept close to the real heights.

---

## 8. Dialogs that close by themselves

- **Import (Decided):** once the person has chosen files or a folder that contain note pages, the dialog closes and the import runs in the background (the ring in the header shows progress). The result is shown as a toast (about 5 to 15 s, depending on its length). If the selection has no note pages, the answer is instant, so the dialog stays open and shows it.
- **Choose folder in Settings (Decided):** after the folder has been picked and any "load / copy?" question answered, the dialog closes and the writing or loading runs in the background; the result is a toast. If the person says no to the question, the dialog stays open. Errors after the dialog has closed also come as a toast.
- Consequence: the app can be used while an import is running. Notes are added to the list as each page is processed and saved at the end (`commit()`). This was not possible before, because the open dialog blocked the page. A test of editing during an import has not been written.

---

## 9. Look of the Import, Export and Settings dialogs (Decided: option A, cards and tiles)

Chosen from three mockups (A cards and tiles, B one tabbed sheet with list rows, C friendly and guided). Only these three dialogs use it, through the class `dlg2` on the panel (`panelClass:'dlg2'`); every other dialog keeps the plain `.dlg` look. Behaviour, ids and `data-` attributes did not change (`data-i`, `data-x`, `data-s`, `#fi`, `#fd`), so handlers and tests work as before.

- Shape: a round yellow icon (the same icon as the sidebar entry), the title, a line of text, then the choices, then Close at the bottom right.
- **Import:** two tiles, "Choose folder" (highlighted, recommended) and "Choose files"; small tags list what is imported; a hint about phone voice memos.
- **Export:** a large count of the notes in the current view, one sentence on the result, and one big yellow button "Choose location and save" (disabled when there is nothing to export).
- **Settings:** a storage tile (folder name with a green "Connected" dot, an amber dot while waiting for folder access, or "This browser only"), a big button (yellow "Choose notes folder…" when not connected, outlined "Change folder…" when connected), and, only when connected, an "Advanced" list: Rescan folder, Rewrite stylesheet, Disconnect folder (in red).
- The result message (`.res`) is hidden while empty. CSS is in `styles.css` under "Import, Export and Settings dialogs".
- Icons `folder` and `file` were added to the icon list in `util.js`.

---

## 10. Encryption icons (saved, not yet used in the app)

Two icon pairs for "encryption on / off" on a note, designed on a mockup canvas and kept in `js/util.js` (`PS`, used through the usual `ic(name, size)`). They are **2px outlines** (round caps and joins, `fill: none`, `currentColor`), like the other icons in a note's bottom row, so they are drawn by a stroke branch of `ic()`; the older icons stay filled paths in `P`.

| name | meaning | drawing |
|---|---|---|
| `lockOn` | encryption on | padlock, shackle closed (left leg at x=8, right leg at x=16), short keyhole line |
| `lockOff` | encryption off | same padlock; the shackle is hinged on its **right** leg (at x=10) and swings over so its free end is to the **left** of the attached leg, above the body (path `M10 10V6a4 4 0 0 0-8 0`) |
| `maskOn` | encryption on | domino mask outline with two eye holes |
| `maskOff` | encryption off | the same mask with a diagonal slash |

**The feature uses the padlock pair** (`lockOn` / `lockOff`): in a note's editor (closed = encrypted) and, with the opposite meaning of locked / unlocked, on the sidebar lock button. The mask pair is kept in `util.js` but is not used. The 4px arc of `lockOff` was shifted so that its outer edge, with the stroke, stays inside the 24px box (no clipping).
