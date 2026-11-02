# ForTex

If you're regularly typing equations in an external platform and ending up with clunky plain text, this extension is for you!

ForTex adds a flexible LaTeX formula button to Quill-based text editors. It was first developed for Minerva University's classroom platform and now can be adapted to work with any Quill editor so you can easily typeset equations and mathematical expressions.

![Demo GIF](assets/fortex-demo-video.gif)

[Live demo](https://marilevay.github.io/fortex/demo/)

## Key features
* Add a LaTeX formula button to supported Quill-based text editors
* Type LaTeX code (similar to Overleaf) and insert rendered formulas directly into the editor
* Use standard LaTeX syntax for equations, symbols, and expressions
* Designed to work smoothly with pre-class work and breakout-style editors on Minerva’s classroom platform, but can be adapted to other Quill environments.

## How to install 

* Download this repo as a .zip file (or clone it)
* In the folder, run `npm install && npm run build` (needs Node 18+). This creates `dist/`, which the extension loads.
* Access `chrome://extensions` and enable Developer Mode and click on "Load Unpacked:
* Select the unzipped folder. 
* Now, just make sure to pin the extension so it's always available at your extension bar

## Developing

* `npm test`: unit tests for the parsing, rendering and insert logic (`src/core/`).
* `npm run watch`: rebuilds `dist/` on every change; reload the extension in `chrome://extensions` afterwards.
* `tests/e2e/quill.html`: a plain Quill page that loads the built scripts without installing the extension. Serve the repo root (`python3 -m http.server 5174`) and open `http://127.0.0.1:5174/tests/e2e/quill.html`.

Code layout:

* `src/core/`: pure logic (parse `$…$`, render with KaTeX, build Quill inserts). No DOM, unit-tested.
* `src/content/`: the panel UI, injected into pages in a Shadow DOM.
* `src/page/`: a small bridge that runs in the page itself so it can reach the site's Quill editor.

## We have version 2.0! What's new?
* Architecture has been updated so ForTex can be more easily adapted to **any** Quill-based text editor.

## Privacy and data:
* ForTex runs only on pages that match the configured URLs (Quill-based editors).
* It does not send any content to external servers, so LaTeX is processed directly in the page where you are editing.
* No analytics or tracking are included in this extension.

**Disclaimer**: ForTex is an independent project and is not affiliated with or endorsed by Minerva University, Quill, or any learning platform providers.

This project is licensed under the MIT License. See the LICENSE file for details.