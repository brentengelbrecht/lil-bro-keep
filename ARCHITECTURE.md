# Lil Bro Keep: how the code is organised

Plain `<script>` files, not ES modules (modules are blocked when a page is opened from disk). They are loaded in the order below, which is the order in `index.html`. **A file may only use things defined in files above it.**
The one deliberate way back up is `Host` (in `model.js`): four hooks (`render`, `collapsed`, `editing`, `status`) that `app.js` and `folder-ui.js` fill in at start-up.

## Files

Folders: `js/` holds every script, `css/` the stylesheet, `icons/` the icons, `tests/` the tests. Only `index.html` sits in the project root, and it loads everything as `js/<name>.js` and `css/styles.css`. The names in the tables below are file names inside those folders.

Not scripts:

| file | what it is |
|---|---|
| `index.html` | the page shell: header, sidebar, the two containers the app draws into (`#composer`, `#out`), the script and stylesheet tags (each carries `?v=<number>`), the tab icon (inline SVG) and the progress animation (inline SVG image) |
| `css/styles.css` | all the styling for the app (always light; there is no dark mode). The notes folder gets its own generated stylesheet, written by `format.js` |
| `icons/` | `icon.svg` and PNG icons. Nothing links to them yet (no manifest or `apple-touch-icon`) |

Scripts, in load order:

| file | what it is |
|---|---|
| `order.js` | note order: the sort key (`pos` if set, else `ts`), `byOrder`, where a dragged note goes (pure, unit-tested) |
| `util.js` | depends on nothing else. Icon table `P` and `ic()`, `h()` escaping, `uid`, the busy indicator and progress ring (`busyStart`, `busyEnd`, `withBusy`, `busyProgress`, `spinUpdate`), `toast`, small text helpers (`pad2`, `clock`, `linkText`) |
| `dialog.js` | every dialog goes through `openDialog()`: dialog semantics, the page behind made inert, focus trapped inside and restored, Escape closes the topmost one, dialogs stack |
| `drag.js` | `dragGesture()`: the pointer gesture behind every drag-to-reorder (press-and-move or press-and-hold, Escape, auto-scroll, swallowed click). It knows nothing about what is dragged |
| `richtext.js` | `richFrom()` and `safeHref()`: turns pasted or stored HTML into the small safe subset notes use (bold, italic, underline, links, line breaks) |
| `richedit.js` | the note's text area: caret helpers, auto-links, and `richEdit()` (formatting, undo/redo, typed lists, paste) |
| `model.js` | what a note is (`blank`, `sigOf`), shared state (`notes`, `LB`, `KEEP_MOD`), colour names, the `Host` hooks |
| `format.js` | the notes folder's file format as pure functions: `noteHTML`, `parseNoteFile`, `indexHTML`, the generated stylesheet. No folder access, no page |
| `media.js` | attachment data: IndexedDB blobs, object URLs, image sizes (`measureImage`), `hydrate()`. The folder engine registers how to read and remove files through `Media` |
| `folder.js` | the folder store: reading, writing, syncing, conflicts, locks, repair. **No dialogs and no markup.** It tells the person things only through `toast`, the busy indicator and `Host.status`, and reaches the page only through `Host` |
| `store.js` | **the persistence interface** (`Store`), the browser backend (localStorage), `addMedia`, and `commit()` |
| `folder-ui.js` | what people see about the folder: status line, reconnect prompt, choose-folder and Settings dialogs |
| `capture.js` | getting attachments into a note: name clashes (`uniqueName`), the replace-or-keep-both question (`askReplace`), the camera (`takePhoto`) |
| `gallery.js` | image rows (`groupRows`, `galleryHTML`, `galleryWire`), what is specific to dragging images and moving them with the keyboard (`galleryEditor`), and the full-window image viewer |
| `vgrid.js` | the virtual masonry grid: only cards near the viewport exist; what is specific to dragging cards (slot, placeholder); keyboard movement between cards |
| `recorder.js` | `createRecorder()`: voice recording for a note |
| `editor.js` | `editor(note, isNew, done)`: the note editor, assembled from the pieces above (`richedit.js`, `recorder.js`, `gallery.js`, `capture.js`): markup functions and a table of what each button does |
| `labels.js` | the label list in the sidebar: drawing it, rename and delete, and the clicks and keys inside it (`labelNavClick`) |
| `takeout.js` | import from Google Takeout: reading the HTML and .json files, matching notes already in the app, and the Import dialog |
| `export.js` | export the notes shown in the main view as one web page, and the Export dialog |
| `app.js` | the page: filtering and search, rendering the grid and cards, opening the editor (`openModal`), the colour and label pickers, applying a new note order (`applyOrder`, `moveNote`), event wiring and start-up |

`labels.js`, `takeout.js` and `export.js` load before `app.js`. They read `app.js` state (`view`, `sel`, `notes`, `LB`) and call `render()`, `commit()` and `visible()` only when something happens, so they hold no start-up code that depends on `app.js`.

Every script starts with `'use strict';`. Top-level functions and `let`/`const` are still shared between scripts as before. `tests/t1.py` fails if any script on the page is not strict, and a new script needs one function added to its list.

## The persistence interface

Everything outside `store.js`, `folder.js` and `folder-ui.js` talks to storage through `Store`:

- **State:** `Store.mode` (`'browser'` or `'folder'`), `Store.state` (`'ok'`, `'loading'`, `'perm'` needs reconnecting, `'cached'` showing a saved copy), `Store.loaded`, `Store.gesturePending`, `Store.folderName`, `Store.canUseFolder`.
- **Notes and media:** `Store.save()`, `Store.addMedia()`, `Store.flush()`, `Store.relabel(old, new)` (bring stored notes in line after a label rename or delete).
- **Folder lifecycle:** `Store.boot()`, `Store.reconnect()`, `Store.disconnect()`, and, used by the folder dialogs, `Store.inspect()`, `Store.attach()`, `Store.rescan()`, `Store.rewriteStyles()`.

While the folder is not connected (`Store.state` is not `'ok'`), nothing is written to browser storage, so a saved copy can never replace the real browser copy.

## Rules of thumb

- **Changing notes:** change the note objects, then call `commit()` (saves, then redraws). `commit({keepMod:[ids]})` when the change is not an edit (reordering, an image-size backfill), `commit({render:false})` while a note is open in the editor, `commit({delay:ms})` to save once after a quiet moment.
- **Talking to storage:** only through `Store`. Nothing outside `store.js`, `folder.js` and `folder-ui.js` should touch `ROOT`, `MODE`, `fstate` or folder files, and nothing outside `store.js` and `folder.js` should read or write `localStorage` notes.
- **Adding another backend** (for example a native folder on a phone): implement what `folder.js` offers behind `Store` (load, save changed notes, media read/write/remove, rescan) and keep `format.js` unchanged, so every app can share one folder.
- **Dialogs:** open every dialog with `openDialog()` (`dialog.js`), never by hand, so Escape, Tab, focus return and the inert page behind work the same everywhere. Something that must take Escape before a dialog does (a drag in progress) listens on `window`.
- **Drags:** every drag-to-reorder uses `dragGesture()` (`drag.js`). The caller supplies what is specific to it.
- **Keyboard in the grid:** the grid is one Tab stop (`vgrid.js`): arrow keys move between cards, Enter or Space opens, Alt+arrows reorder. A new button inside a card needs no extra work: its tab order is managed with the card.
- **Putting values into HTML:** anything that can come from a stored note or file (titles, labels, ids, attachment names and kinds, link addresses) goes through `h()` first, including values inside attributes. `tests/t22_escaping_scale.py` checks this with hostile values.
- **Icons:** one table, `P` in `util.js`, drawn with `ic(name, size)`.
- **Order of notes:** use `byOrder` / `pos` in `order.js`. Do not sort notes by `ts` directly in the view. (`folder.js` sorts by `ts` once, deliberately, when it renumbers notes copied into a new folder.)
- **Colours:** a note stores a colour as an index (0 to 11). The palette must be kept in step in three places: `--k0` to `--k11` in `styles.css`, the light colours in `format.js` (the generated folder stylesheet) and the names in `model.js`.
- **Pure files:** `order.js` and `format.js` use no DOM and no page state, so they can be tested alone.
- **Strict mode** is not enabled yet.

## Releasing

Every script and stylesheet tag in `index.html` carries `?v=<number>`. Bump all of them together on each release, and replace every changed file in the app folder (keeping the `js/` and `css/` folders), or the browser may keep an old stylesheet or script.

## Tests

Python Playwright scripts (headless Chromium) in `tests/`, plus one Node test.

- `python3 tests/run_all.py` runs the suites listed in `tests/run_all.py`: the Node test `tests/t36_order_logic.js` first, then each Python test `tests/t<N>*.py` in numeric order. A new test file has to be added to the `suites` list and the `names` map in that file. It starts its own web server (port 8765). Needs Python with Playwright and Chromium, and Node for the order test. A timeout counts as a failure.
- The folder tests use the browser's private file system in place of a real folder.
- `tests/coverage.py` runs the browser tests with code coverage on and lists what they never execute. Its file list comes from the script tags in `index.html`. Run it in batches (`python3 tests/coverage.py t7 t10`), then `python3 tests/coverage.py --report`. Last measured: 94.9% of code bytes (comments excluded), with 24 suites.
- What the tests cannot cover (real folder picker and sync service, a real Takeout export, camera, microphone, touch, screen reader) is listed in `AGENTS.md`.
