# Natex

If you're regularly typing equations in an external platform and ending up with clunky plain text, this extension is for you!

Natex lets you write LaTeX in Quill-based text editors with a live preview. Type your math, see it render as you go, and insert it straight into the editor. It was built with Minerva University's classroom and forum editors in mind, but works with any Quill editor.

![Natex demo: writing math with a live preview and inserting it into a Minerva reply box](assets/natex-demo.gif)

[Watch the full demo (MP4)](assets/demo/natex-demo.mp4) · [30-second version](assets/demo/natex-reel.mp4)

## Key features
* Open the Natex panel from the **fx** button in the editor toolbar or with a hotkey (`Ctrl+M` by default)
* Live KaTeX preview as you type, so you see mistakes before you insert
* Mix text and math (`$…$`) and insert it all at once with `Ctrl+Enter` (one undo step)
* Click a formula already in the editor to open it in the panel and edit it
* Drafts are saved automatically, so you don't lose your work if the page reloads
* Change the hotkey in the extension settings

## See it in action

**Live preview, and mistakes caught before you insert**

![Typing LaTeX in the Natex panel: the preview updates live and a typo is underlined with the reason](assets/demo/natex-preview.gif)

**Text, inline math and display math in one go**

![Inserting a sentence with the quadratic formula into the editor with Ctrl+Enter](assets/demo/natex-insert.gif)

**Click a formula to fix it**

![Clicking an inserted formula opens it in Natex; Update replaces it in place](assets/demo/natex-edit-formula.gif)

**Drafts survive closing the panel and reloading the page**

![Closing Natex, reloading the page, and getting the draft back](assets/demo/natex-drafts.gif)

## How to install

* Download this repo as a .zip file (or clone it)
* In the folder, run `npm install && npm run build` (needs Node 18+). This creates `dist/`, which the extension loads.
* Access `chrome://extensions`, enable Developer Mode and click on "Load Unpacked"
* Select the unzipped folder.
* Now, just make sure to pin the extension so it's always available at your extension bar

## Developing

* `npm test`: unit tests for the parsing, rendering and insert logic (`src/core/`).
* `npm run watch`: rebuilds `dist/` on every change; reload the extension in `chrome://extensions` afterwards.
* `tests/e2e/quill.html`: a plain Quill page that loads the built scripts without installing the extension. Serve the repo root (`python3 -m http.server 5174`) and open `http://127.0.0.1:5174/tests/e2e/quill.html`.
* `npm run demo`: re-records the demo videos above in a real browser. See [demo-video/README.md](demo-video/README.md).

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

Code layout:

* `src/core/`: pure logic (parse `$…$`, render with KaTeX, build Quill inserts). No DOM, unit-tested.
* `src/content/`: the panel UI, injected into pages in a Shadow DOM.
* `src/page/`: a small bridge that runs in the page itself so it can reach the site's Quill editor.

## Privacy and data:
* Natex runs only on sites you allow (Quill-based editors).
* It does not send any content to external servers, so LaTeX is processed directly in the page where you are editing.
* Drafts and settings are stored locally in your browser.
* No analytics or tracking are included in this extension.

Full details are in the [privacy policy](PRIVACY.md).

## Credits
Natex is built on top of [ForTex](https://github.com/marilevay/fortex), created by [Marina Levay](https://github.com/marilevay). Thank you for the original extension and the idea behind it!

**Disclaimer**: Natex is an independent project and is not affiliated with or endorsed by Minerva University, Quill, or any learning platform providers.

This project is licensed under the MIT License. See the LICENSE file for details.
