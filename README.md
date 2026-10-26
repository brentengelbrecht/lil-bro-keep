# Lil Bro Keep

A notes app in the style of Google Keep that keeps **your notes as files in a folder on your own computer**. Sync that folder with Dropbox, Google Drive or iCloud and you have cloud backup without storing anything in anyone's cloud directly.

It is plain HTML, CSS and JavaScript: no build step, no frameworks, no server, no account. Open `index.html` in desktop Chrome and it runs.

> **Not affiliated with Google.** Lil Bro Keep is an independent look-alike. It was renamed, and given its own logo and accent colours, to keep clear of Google's branding.

## Authoring

- **Framework:** Vibe
- **Agent:** Claude (Free)
- **LLM:** Sonnet 5.5

## Contents

- [Getting started](#getting-started)
- [How it differs from Google Keep](#how-it-differs-from-google-keep)
- [The top bar](#the-top-bar)
- [The sidebar](#the-sidebar)
- [The main area](#the-main-area)
- [The note editor](#the-note-editor)
- [Everything else](#everything-else)
- [Limits and things to know](#limits-and-things-to-know)
- [Licence](#licence)

---

## Getting started

1. Download or clone this repository. Alternatively, run it from https://lilbrokeep.github.io.
2. Open `index.html` in **desktop Chrome**. You can double-click it (no web server needed).
3. Start writing notes. Out of the box, they are saved in the browser.
4. To keep your notes in a folder you can sync and back up, open **Settings** in the sidebar and choose a notes folder (see [Notes folder storage](#notes-folder-storage)).

**Browser support.** Choosing a notes folder needs a browser feature that only desktop Chrome offers in practice. Safari, Firefox and phone browsers can still use the app in browser-storage mode, but not folder mode.

---

## How it differs from Google Keep

If you know Keep, these are the things that work differently or that Keep doesn't have.

**Your data is a folder of readable files**
- Every note is a standalone HTML page in a folder you choose. Double-click any note file and it opens in any browser, with its pictures, audio and video, no app required.
- Files have plain numeric names (no titles in file names) and are grouped in sub-folders of a hundred, so the folder stays easy to navigate. Everything belonging to note `20050` can be found by searching for `20050`.
- The folder is designed to be synced by Dropbox, Google Drive or iCloud. Nothing is sent to a server by the app.

**Import and export**
- Imports a **Google Takeout** export (HTML, and JSON when present) including labels, colours, pinned state, original dates, images, audio, video and web links. Importing the same export twice never creates duplicates (with a notes folder, a second import also repairs earlier ones in place).
- Exports the notes you are currently looking at as a single HTML page.

**Deliberate omissions and changes**
- **No Archive.** Notes that were archived in Keep come in as ordinary notes.
- **No reminders, drawings or collaboration.**
- **Always light.** There is no dark mode.
- **Trash never empties itself.** Notes stay there until you empty it or delete them forever. Keep deletes after seven days.
- **Newest-created first.** The default order is by the date a note was created, not the date it was last edited. Re-ordering never changes a note's edited date.
- **Sidebar labels are checkboxes.** Tick several labels in the sidebar to see notes that have *any* of them.
- **Sidebar labels are edited in place** from the sidebar (pencil and bin icons on hover). A rename or delete is applied to every note, including note files in your folder that the app hasn't loaded.
- **Sidebar has Import, Export and Settings** built in.

**Editing extras**
- Bold, italic, underline and clear formatting.
- Typed lists continue automatically: type `1.`, `a.` or `-` followed by a space and press Enter.
- Web addresses become links as you type, paste or drop them.
- Take a photo with your camera, or record a voice clip, straight from the note editor **or from the hover row on a note card**, without opening the note.
- Pictures are laid out in tidy, never-cropped rows, with the odd one out at the top (see [Pictures in notes](#pictures-in-notes)).

**Feel**
- Cards are laid out left to right into the shortest column. Only cards near the screen are drawn, so hundreds of notes stay quick (tested comfortably with 2,000).
- Progress is shown as a ring with a percentage when the app can measure it, or an animated equaliser when it can't.
- A pastel, amber-accented look with a sticky-note logo.
- Fully usable from the keyboard.

---

## The top bar

From left to right:

| Item | What it does |
|---|---|
| **Menu button** | On a wide window, collapses the sidebar to icons only. On a narrow window, slides the sidebar in and out. |
| **Logo and name** | The amber sticky-note logo and "Lil Bro Keep". |
| **Search** | Finds notes as you type. It looks at titles, text, checklist items, label names and link addresses. Reordering notes by drag is switched off while a search is active, because the results are only a slice of your notes. |
| **Progress indicator** | Appears (after a brief delay, so quick jobs never flash) while the app is busy in the background: saving to your folder, importing, scanning the folder, or applying a label rename or delete. A **ring with a percentage** shows when progress can be measured (saving, importing). A row of **five animated amber bars** shows otherwise. It disappears when the work is done. |
| **Status line** | Shows folder messages such as "Saving 3 of 12…" and errors in red. Empty in browser mode. Hidden on narrow windows. |
| **View toggle** | Switches between a multi-column grid and a single centred column. The page starts in grid view each time. |

---

## The sidebar

| Entry | What it does |
|---|---|
| **All notes** | Shows every note that isn't in the Trash. Selected when the app starts. |
| **Labels** | One checkbox row per label. Tick one or more to show only notes carrying any of them. Unticking the last one returns to All notes. New notes created while labels are ticked start with those labels, so they don't vanish from view. |
| **Trash** | Deleted notes. Each can be **Restored** or **Deleted forever**, and the whole Trash can be emptied. Notes in Trash can't be edited, and you can't reorder them. |
| **Import** | Import from Google Takeout (see [Importing from Google Takeout](#importing-from-google-takeout)). |
| **Export** | Save the notes you're looking at as one HTML page. |
| **Settings** | Storage mode and notes folder. |

### Working with labels

- **Create** a label by typing its name into a note's label picker and pressing Enter. This also applies it to that note.
- **Rename**: hover over a label and click the pencil. The name becomes a text box. Enter or clicking away saves it, Escape cancels. Empty names and names that already exist (ignoring upper/lower case) are refused. Changing only the capitalisation is fine.
- **Delete**: hover and click the bin. The label disappears from the sidebar and from every note straight away, and a message tells you how many notes were affected. There is no confirmation prompt and no undo.
- Label names are unique (ignoring upper/lower case) and sorted alphabetically. Only the sidebar's rename box limits a name, to 60 characters; the label field in the editor has no limit.
- In notes-folder mode, a rename or delete is also applied to note files on disk that the app hasn't loaded, so nothing is left under the old name. Renaming a label does not change a note's "edited" date.

---

## The main area

### New-note bar
"New note…" sits at the top. Click it to expand into a full editor in place. A checklist button next to it starts a list instead of text. An empty new note is discarded when you close it.

### Sections
Notes are split into **Pinned** (at the top) and **Others**. Empty views show a friendly message. In Trash, a banner explains what you're looking at.

### Note cards
- **Colour** runs from the title downwards; the area above the title is white. A note with no attachments is coloured all over.
- **Pictures** run to the edges at the top of the card. The first two rows are shown, and there is no "+N" counter for the rest (open the note to see them all).
- A card never grows taller than the window; if it's long, the card scrolls, and scrollbars fade in only when you hover.
- **Click anywhere** on a card, pictures included, to open the note.
- **Hover row** (not shown for notes in the Trash): colour palette, label picker, add image or video, camera, microphone, and delete. You can attach files or take a photo straight from the card. The microphone opens the note and starts recording.
- **Label chips** on a card: click the name to filter by that label; hover and click the **×** to remove it from the note.
- **Pin** icon at the top corner. Pinned notes show a tilted pin.

### Reordering by dragging
- Drag a card to put it where you want it. This works in the main view and in label views, in grid and single-column layouts. It does **not** work in search results, in Trash, or while the notes folder is disconnected.
- You can only move a note **within its section**: pinned notes stay among pinned notes, others among others. Pinning or unpinning a note puts it at the top of the section it enters.
- On a touch screen, press and hold for about a third of a second to pick a card up; moving sooner scrolls the page.
- The page scrolls automatically when you drag near the top or bottom edge. **Escape** cancels a drag.
- After a move, a message offers **Undo**.
- Reordering changes only the note you moved, so in folder mode only one file is rewritten, and its "edited" date is untouched.
- **Keyboard:** hold **Alt** and use the arrow keys to move the focused note one place.

### Keyboard navigation of the grid
- The whole grid is **one Tab stop**, so you aren't forced to Tab through hundreds of cards.
- **Arrow keys** move between cards (up and down within a column, left and right to the neighbouring column), crossing between the Pinned and Others sections.
- **Enter** or **Space** opens the focused note. **Home** and **End** jump to the first and last note.
- Closing a note returns you to the card you came from.

### Messages
Short messages ("toasts") appear at the bottom of the screen for about four and a half seconds, longer when they carry an action such as Undo.

---

## The note editor

A note opens in a window over the page (or inline, in the new-note bar). It always opens **scrolled to the top**, with the cursor at the end of the text ready to type.

### Layout, top to bottom
1. Pictures and videos, edge to edge
2. Audio players
3. Links
4. Title and text (the coloured block)
5. Recording bar (only while recording) and message line
6. Label chips
7. Toolbar

The editor never grows taller than the window; the note scrolls, not the picture gallery. Clicking outside the editor, pressing **Esc**, **Done** or the bin all close it, and focus returns to the card.

### Text
- **Bold, italic, underline** and **clear formatting** (the first four toolbar buttons, also Ctrl/Cmd + B, I and U). Buttons light up for the text at the cursor. With no selection they apply to what you type next. Clear formatting acts on the selection. These buttons are hidden on checklists.
- **Pasting** text always pastes plain text, so notes stay tidy.
- **Typed lists**: type `1.`, `a.` (or `A.`) or `-` followed by a space; pressing Enter starts the next item (`2.`, `b.`, `-`). Pressing Enter on an empty item ends the list. Decimals like `1.5` aren't treated as lists.
- **Undo and redo** buttons sit at the right of the toolbar; the usual keyboard shortcuts also work.

### Checklists
Switch a note between text and checklist at any time without losing content. Enter adds a new item after the current one. Tick items off, remove them with their ×.

### Links
- A web address typed in the text becomes a link when you press space or Enter. Links open in a new tab when clicked.
- Pasting an address into the title or a list item, or dragging a link from the address bar, a tab or a web page onto the note, adds it as a link. A dropped link is added to the end of the text.
- Only `http` and `https` addresses become links; anything else stays text. A web address in the middle of a sentence is left as text when pasted.

### Attachments
- **Add** with the image button (pictures and video in one picker, several at once), the **camera** button (live preview, then Take photo; rear camera on phones), or the **microphone** button (starts recording immediately).
- **Drag and drop** pictures, video and audio onto an open note, or **paste** a screenshot. Other file types are refused with a message.
- **Same file name?** You're asked whether to **Replace** the existing one, **Keep both** (the new one is named "name 1.ext") or **Cancel**.
- **Recording** shows a red timer with Stop and Cancel. Closing the note while recording saves the clip.
- Hover over an attachment to reveal a bin that deletes it and its file permanently.

### Pictures in notes
- Pictures are arranged in rows of up to **three**, all the same height within a row, filling the width, and **never cropped or stretched**.
- If the number of pictures isn't a multiple of three, the **first row is the short one**, then rows of three. Adding or removing a picture can change the rows above it, which is expected.
- Cards show the first two rows; the editor shows all of them.
- **Reorder** pictures in the editor by dragging (hold about a third of a second, or just drag), or with the "move earlier" and "move later" buttons on a picture, or Alt + arrow keys on a focused picture. A line shows where it will land; Escape cancels.
- **Full-window viewer**: click a picture in the editor. It opens fitted to the window (small pictures are scaled up). Zoom between 40% and 200%, drag to pan, Ctrl + scroll wheel to zoom. Left and right arrows (on screen or on the keyboard) go to the previous or next picture, with no wrap-around. The × at the top left or **Esc** closes it.

### Toolbar
Bold, italic, underline, clear formatting · colour palette · label picker · image or video · camera · microphone · checklist toggle · delete · undo and redo · **Done**.

Every icon is a grey outline that darkens when you hover over it, with an instant tooltip.

### Colours
Twelve soft pastel colours: Default (white), Blush, Apricot, Butter, Pale green, Seafoam, Mist, Sky blue, Lavender, Mauve, Sand and Fog. Pick from the palette icon in the editor or on a card.

### Labels
Open the label picker to tick and untick labels, or type a name and press Enter to create a new one. The picker stays open so you can choose several. Hover over a label chip and click its **×** to remove it.

### Pin
The pin icon pins and unpins the note. Pinning moves it to the top of the Pinned section.

### Saving
Notes save automatically. A note you only looked at is never rewritten, and its dates stay as they were.

---

## Everything else

### Storage modes

**Browser storage** (the default) keeps notes in the browser and pictures, audio and video in its internal database. It's convenient, but clearing site data deletes everything, so treat it as a starting point.

**Notes folder** keeps everything as files in a folder you choose. Choose **Settings → Choose notes folder…** and pick a sub-folder of your synced folder, for example `Dropbox/Keep-Notes`. (Chrome won't allow top-level Documents, Desktop or Downloads.)

- If the folder already holds notes, the app **loads them**. Notes currently in the app are not merged in.
- If the folder is empty, you can **copy** your current notes into it or **start empty**. Your browser copy is left untouched as a backup.
- Other Settings actions: **Rescan folder**, **Rewrite stylesheet** and **Disconnect**.

### What's in the folder

```
Keep-Notes/
  index.html        a readable list of your notes (also used by the app for fast start-up)
  styles.css        the one shared stylesheet for every note page
  0/                1.html … 99.html
  200/              20000.html … 20099.html
  media/
    images/200/     20050-1.jpg
    video/200/      20050-2.mp4
    audio/200/      20050-3.webm
```

- Each note's details (dates, colour, pinned state, labels, and the original names of attachments) are stored in a hidden comment at the top of its page. Dates carry a time-zone offset, for example `2024-10-18T11:55:31.000+01:00`.
- `index.html` is only a speed-up: it holds a link and the details of each note (colour, labels, dates…) but none of the note text, which is read from each note's page as it is needed. Every note page stands on its own, and **Rescan folder** rebuilds the index from them.
- **Stop using the folder** (Settings) clears everything this browser holds and starts again with the two welcome notes; the files in the folder stay where they are.
- Because the format is plain HTML, other tools, or a future phone app, can read the same folder.

### Fast start and reconnecting
- The app keeps a **saved copy** of your notes in the browser so the first notes appear instantly at launch.
- Chrome normally asks you to **re-grant access** to the folder each session. If it does, you'll see a banner ("Click anywhere to reconnect"); your first click asks Chrome for permission. Choose **"Allow on every visit"** when it appears to avoid being asked again. If you deny access, you can switch to browser storage instead.
- While the folder isn't connected, nothing is written to the browser copy, so it can't be overwritten by mistake.
- A quiet **background check** compares the folder with what the app knows and picks up notes added, edited or deleted outside the app. Changes wait until you close any note you have open, and **never overwrite** edits you haven't saved.
- If you edit the same note in two places at once, **both versions are kept**; the other version is saved as a separate "conflict copy" note and you're told.

### Importing from Google Takeout
Use **Import** in the sidebar. Choose the whole Google Keep folder from your Takeout download (recommended, so pictures and audio can be found), or select individual files.

- **Brought across:** titles, text, checklists (with ticked items), colours, pinned state, labels, web links, images, audio and video, and dates.
- **Dates:** the date shown at the top of each exported note is used as both the created and edited date. If it's missing, the matching JSON file's dates are used, then the file's own date.
- **Formatting:** bold, italic and underline are imported when the note's matching `.json` file is selected too, since the HTML export doesn't carry them. Formatting inside checklist items can't be kept.
- **Starts clean:** an import first clears everything this browser holds (notes, labels, stored media, the two welcome notes included), after asking you to confirm. When you use a notes folder the folder's notes are kept and only the browser's own leftovers are cleared.
- **Safe to repeat:** importing the same files again gives the same notes, with nothing duplicated; with a notes folder, notes you've already imported are matched by title and content and updated in place.
- **Reported:** the dialog tells you how many notes were imported or updated and how many attachments couldn't be found or stored.
- **Skipped:** empty notes and pages that aren't notes.

### Exporting
**Export** writes the notes in your current view (respecting any label filter or search; in Trash it exports the Trash) as one HTML page, pinned notes first. The file name you choose becomes the page title. Checklists appear as ☐ and ☑ lines, and formatting and links are kept. Labels and attachments are not included.

### Dialogs and accessibility
All dialogs (Import, Export, Settings, "replace file?", camera, picture viewer) behave consistently: they're announced to screen readers, the page behind them is inert, focus moves inside and Tab stays there, **Esc** closes only the topmost one, and focus returns to where you were. Clicking outside closes the page dialogs and the editor, but not the "replace file?" question. Popovers (colour palette, label picker) close when you click anywhere off them, without selecting or triggering anything, and Esc closes a popover before it closes the note. Cards announce themselves to screen readers as "Note: title" or "Pinned note: title". Animations are turned off for people who prefer reduced motion.

### Safety and robustness
- Anything that comes from a note or a file (titles, labels, attachment names, link addresses) is escaped before it is shown, so a malicious note can't run code.
- If stored notes can't be read, they're **copied to a backup** before anything can overwrite them and you're told.
- Unreadable note files in a folder are reported once by name and are **never deleted**.
- A failed save in browser mode shows a message.

---

## Limits and things to know

- **Desktop Chrome** is the target. Folder mode doesn't work in Safari, Firefox or phone browsers.
- **Browser find (Ctrl+F)** only finds notes currently drawn on the screen. Use the search bar, which searches all notes.
- **Cloud-sync "online-only" files** (placeholders that download on demand) can be slow or unreadable. Mark your notes folder as "available offline".
- **Pictures and video** appear in the app only once the folder is connected; the saved copy holds text only.
- **Old phone voice memos** from Keep (`.3gp`, `.amr`) import but may not play in Chrome. **HEIC photos** may not display outside Safari.
- **Label delete has no undo**, and Trash has no automatic expiry.
- Colour choices are stored as a position in the palette, so the palette order must not be changed without updating existing notes.
