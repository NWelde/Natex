# Handoff: Natex live preview

For the next agent picking up Natex. Read this first, then `arc/preview-ux.md` (the agreed UX spec) and `arc/problems.md` (why we're building it).

## Where things stand

**Milestone 1 (preview + insert) is done and working on the real target site** (forum.minerva.edu, Quill 2).

- Branch: `design-prototype` (not merged to `main`, not pushed since `f94da41`).
- Commits: `b274faf` panel → `7341ea5` Quill 2 fallback → `4a9f801`, `cf5c63c` small style tweaks.
- Uncommitted on purpose: `arc/preview-ux.md` and `experiments/` were written in another session. Ask the user before committing them.

What works:

- `Ctrl+M` or the 𝑓ₓ toolbar button opens the panel under the caret. Natex hides Quill's own formula button.
- Live preview on every keystroke. Errors appear only after 600 ms idle.
- Error display: wavy underline in the source, a clickable error list, and the last good render kept but faded.
- `Ctrl+Enter` / **Insert** puts mixed text + `$inline$` + `$$display$$` into Quill. Display math gets its own centered line. The caret lands after the insert.
- Inserting with errors asks once ("insert anyway?").
- `Esc` and clicking outside close the panel. The source text stays until the next insert or until you switch to another editor.

## Architecture (keep the layering)

```
src/core/      pure logic, no DOM/chrome.* → unit-tested (node:test)
src/content/   isolated-world content script: panel UI in a Shadow DOM
src/page/      MAIN-world bridge: the only code that touches the host's Quill
```

| File | Job |
|---|---|
| `src/core/segments.js` | `parse()` splits source into text/math segments (`\$` = literal $, unclosed delimiters). `trimAfterDisplay` / `followsDisplay` are shared by preview and insert so they always match. |
| `src/core/render.js` | `renderAll(segs, katex, lastGood)` renders with KaTeX, maps error positions back to source offsets, and handles stale last-good HTML. |
| `src/core/insert-plan.js` | `toDeltaOps()` builds Quill Delta ops (bridge path). `toClipboard()` builds the same content as HTML (paste path). |
| `src/core/protocol.js` | Event names plus the `data-natex-id` attribute both worlds use to identify an editor. |
| `src/page/quill-bridge.js` | Answers `getCaret` / `insert` / `focus` over `CustomEvent`s carrying JSON strings. Finds Quill through `container.__quill` or `window.Quill.find`. |
| `src/content/bridge.js` | Promise wrapper for bridge calls, with a timeout. |
| `src/content/editor.js` | **Strategy switch.** "bridge" mode when the Quill instance is reachable (exact caret, one undo step). Otherwise "dom" mode: DOM selection for placement, insert by dispatching a synthetic `paste` with HTML containing `<span class="ql-formula" data-value>`. |
| `src/content/panel/*` | `panel.js` (lifecycle, keys, insert), `source.js` (highlight mirror), `preview.js`, `styles.css` (tokens match the Paper "v2 — Cobalt" design). |
| `src/content/katex-assets.js` | KaTeX `@font-face` goes into the **document** (fonts don't load from a shadow root), using `chrome.runtime.getURL`. The rest of the KaTeX CSS goes into the shadow root. |
| `src/content/index.js` | Finds `.ql-toolbar` / `.ql-container`, tags editors, adds the button, handles `Ctrl+M`. |

Wiring:

- `background.js` registers `dist/page.js` (world `MAIN`) and `dist/content.js` for allowed origins. Registration runs through a queue (`queueSync`) to avoid the "Duplicate script ID" race.
- `popup.js` "Enable" injects the same two files right away.
- `manifest.json` exposes `dist/katex/fonts/*` as web-accessible resources.

## Build, test, try

```bash
npm install
npm test            # 25 unit tests (core)
npm run build       # → dist/ (gitignored); npm run watch for dev
```

- **Harness pages** (no extension install needed): serve the repo root with `python3 -m http.server 5174`, then open:
  - `tests/e2e/quill.html` (Quill 1.3, bridge path);
  - `tests/e2e/quill2.html` (Quill 2 with the global deleted, which forces the DOM/paste fallback).
- **The user's Chrome loads the extension from `C:\Users\natha\Desktop\natex`** (`/mnt/c/Users/natha/Desktop/natex`). That's a plain copy, not a git repo. After changes:
  1. `npm run build`;
  2. copy `dist/` (plus any changed `manifest.json` / `background.js` / `popup.js`) there;
  3. tell the user to reload Natex in `chrome://extensions` **and hard-refresh the tab**. Stale scripts left in an un-refreshed tab caused a confusing "can't reach this editor" report once.
- Automated browser checks: `playwright-core` is installed in `/tmp/claude-1000/mj` (may be gone). Branded `/usr/bin/google-chrome` works for page tests but **can't `--load-extension`**. Use `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` for extension tests.

## Gotchas learned the hard way

- Minerva bundles **Quill 2 without a global**. Instances live in a private WeakMap, so the bridge can't reach them. The paste fallback is what runs there. Don't remove it.
- In dom mode Natex can't call `history.cutoff()`. An insert made within about 1 s of typing merges with that typing in Quill's undo history.
- The Minerva editor is in a **quirks-mode iframe** (KaTeX logs a warning). The panel renders inside that frame, so a small frame could clip it. This hasn't been seen yet; if it happens, move the panel to the top frame.
- `demo/index.html` (public demo, runs without the extension) still loads the old `quillOverride.js`. That's why the file hasn't been deleted. Moving the demo over needs a committed demo build, since `dist/` is gitignored.
- Repo rule (`~/AGENTS.md`): **no Claude/Codex co-author trailers in commits.** Explanatory `.md` files go in the repo (e.g. `arc/`), not a scratchpad.
- The user dislikes "vibe-coded" UI: keep it plain and purposeful, no decorative badges or toasts that say what's already visible. They like the iPhone-style segmented controls and toggles.

## Next milestones (from `arc/preview-ux.md`)

1. **Drafts (spec §9).** Save per site + editor in `chrome.storage.local` on every keystroke. Show a "Draft restored · Discard" bar on reopen. Survives reloads. Inserting clears the draft.
2. **Edit an inserted formula (spec §7).** Clicking a `.ql-formula` in the host reopens the panel with its LaTeX (`\displaystyle` → `$$…$$`), the button becomes **Update**, and it replaces the formula in place. Needs a replace path in both bridge mode and dom mode; for dom mode, try selecting the formula node and then pasting.
3. **Shortcuts with tab stops.** Autosnippets like `ff` → `\frac{}{}` (standalone word, math-only), with `Tab` moving through the stops. Working reference code, including nested stops: `prototype/prototype.js` (`parseBody`, `insertSnippet`). Shortcut list source: the user's `~/.config/nvim/snippets/tex.lua`.
4. **Toolbar + symbols palette.** Fraction, root and Ω palette in the panel header, on the left; Write/Preview style controls go on the right (user preference).
5. **Shortcuts pages + popup redesign.** Designs are in Paper (file "Natex", page "v2 — Cobalt": popup, overview, edit). The current `popup.html` was already restyled in `fe6a11d`.
6. Later: a configurable hotkey (popup "Change" link), replacing `quillOverride.js` in the demo, and the open questions in the spec (600 ms delay, warn vs block on errors).

## Design references

- Paper file **Natex**, page **v2 — Cobalt**: charcoal dark theme, cobalt `#4F70F7`, headings in Latin Modern / KaTeX_Main, Inter for UI, JetBrains Mono for code.
- `prototype/` is the clickable end-to-end UX prototype (forum + popup + editor); serve it and open `index.html`.
