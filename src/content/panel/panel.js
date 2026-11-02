// The Natex panel: write LaTeX with a live preview, then insert it into the
// host editor. One panel per frame, shown in a shadow root.

import katex from 'katex';
import { parse } from '../../core/segments.js';
import { renderAll } from '../../core/render.js';
import { ERROR_DELAY } from '../../core/constants.js';
import { captureTarget, insertSegments, refocus as refocusEditor } from '../editor.js';
import { katexShadowCss, injectKatexFonts } from '../katex-assets.js';
import { renderSource } from './source.js';
import { previewHtml, renderErrors } from './preview.js';
import panelCss from './styles.css';

const TEMPLATE = `
  <div class="panel" role="dialog" aria-label="Natex LaTeX editor">
    <div class="head">
      <div class="title">Natex</div>
      <button class="toggle" type="button" data-ref="toggle">Hide preview</button>
    </div>
    <div class="src">
      <pre class="hl" data-ref="mirror" aria-hidden="true"></pre>
      <textarea data-ref="source" spellcheck="false" aria-label="LaTeX source"
        placeholder="Write text and math:  area is $\\pi r^2$"></textarea>
    </div>
    <div class="pv-wrap">
      <div class="pv-label">Preview</div>
      <div class="pv" data-ref="preview"></div>
      <div class="errs" data-ref="errors"></div>
    </div>
    <div class="confirm" data-ref="confirm" hidden>
      <span data-ref="confirmMsg"></span>
      <button class="keep" type="button" data-ref="keep">Keep editing</button>
      <button class="anyway" type="button" data-ref="anyway">Insert anyway</button>
    </div>
    <div class="foot">
      <div class="hint"><kbd>Ctrl</kbd><kbd>↵</kbd> insert · <kbd>Esc</kbd> close</div>
      <button class="insert" type="button" data-ref="insert">Insert</button>
    </div>
  </div>
  <div class="toast" data-ref="toast" role="status"></div>`;

export class Panel {
  constructor() {
    this.host = document.createElement('natex-panel');
    this.host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
    const root = this.host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${katexShadowCss}\n${panelCss}</style>${TEMPLATE}`;
    this.root = root;
    this.el = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((n) => [n.dataset.ref, n]));
    this.el.panel = root.querySelector('.panel');

    this.target = null; // { editorId, range }
    this.lastGood = [];
    this.errors = [];
    this.shownErrors = [];
    this.confirming = false;
    this.errorTimer = 0;

    this.bindEvents();
  }

  get isOpen() { return this.el.panel.classList.contains('open'); }

  /** Opens the panel for a Quill editor, anchored under its caret. */
  async open(editorId) {
    if (this.isOpen && this.target?.editorId === editorId) return;
    let target;
    try {
      target = await captureTarget(editorId);
    } catch (err) {
      console.warn('[Natex]', err.message);
      this.toast("Natex can't reach this editor");
      return;
    }
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    injectKatexFonts();

    if (this.target?.editorId !== editorId) {
      this.el.source.value = '';
      this.lastGood = [];
    }
    this.target = target;
    this.place(target.rect);
    this.hideConfirm();
    this.refresh({ showErrorsNow: true });
    this.el.panel.classList.add('open');
    requestAnimationFrame(() => this.el.source.focus());
  }

  close({ refocus = true } = {}) {
    if (!this.isOpen) return;
    this.el.panel.classList.remove('open');
    clearTimeout(this.errorTimer);
    if (refocus && this.target) refocusEditor(this.target);
  }

  /** Positions the panel just below the caret, kept inside the viewport. */
  place(rect) {
    const panel = this.el.panel;
    const width = Math.min(560, window.innerWidth - 16);
    const left = Math.min(Math.max(8, Math.max(rect.editorLeft, rect.left - 12)), window.innerWidth - width - 8);
    panel.style.left = `${left + window.scrollX}px`;
    panel.style.top = `${rect.bottom + 10 + window.scrollY}px`;
  }

  /** Re-renders source highlight and preview. Errors appear only after typing pauses. */
  refresh({ showErrorsNow = false } = {}) {
    const segs = parse(this.el.source.value);
    const { parts, errors } = renderAll(segs, katex, this.lastGood);
    this.errors = errors;
    this.el.preview.innerHTML = previewHtml(parts);

    clearTimeout(this.errorTimer);
    this.showErrors(showErrorsNow ? errors : [], segs);
    if (!showErrorsNow) {
      this.errorTimer = setTimeout(() => this.showErrors(this.errors), ERROR_DELAY);
    }
  }

  showErrors(errors, segs = parse(this.el.source.value)) {
    this.shownErrors = errors;
    renderSource(this.el.mirror, this.el.source, segs, errors);
    renderErrors(this.el.errors, errors, (e) => {
      this.el.source.focus();
      this.el.source.setSelectionRange(e.at, e.at + e.length);
    });
  }

  /** Inserting with errors asks once; Ctrl+Enter or "Insert anyway" confirms. */
  async attemptInsert(force = false) {
    const segs = parse(this.el.source.value);
    const { errors } = renderAll(segs, katex, this.lastGood);
    if (errors.length && !force && !this.confirming) {
      this.showConfirm(errors.length);
      return;
    }
    try {
      await insertSegments(this.target, segs);
    } catch (err) {
      console.warn('[Natex]', err.message);
      this.toast("Couldn't insert into this editor");
      return;
    }
    this.el.source.value = '';
    this.lastGood = [];
    this.hideConfirm();
    this.close({ refocus: false }); // the editor already put the caret after the insert
    this.toast('Inserted — keep typing');
  }

  showConfirm(n) {
    this.confirming = true;
    this.el.confirmMsg.textContent = `${n} error${n > 1 ? 's' : ''} — insert anyway? Errors show up red in your answer.`;
    this.el.confirm.hidden = false;
    clearTimeout(this.errorTimer);
    this.showErrors(this.errors);
  }

  hideConfirm() {
    this.confirming = false;
    this.el.confirm.hidden = true;
  }

  toast(message) {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    const t = this.el.toast;
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  bindEvents() {
    const { source, toggle, insert, keep, anyway, panel } = this.el;

    source.addEventListener('input', () => {
      if (this.confirming) this.hideConfirm();
      this.refresh();
    });

    // Keys are handled on the panel so they work from any control inside it.
    panel.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); this.attemptInsert(this.confirming); }
      else if (mod && e.key.toLowerCase() === 'm') { e.preventDefault(); this.close(); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (this.confirming) { this.hideConfirm(); source.focus(); }
        else this.close();
      } else if (e.key === 'Tab' && e.target === source) {
        e.preventDefault(); // keep focus in the source (snippet tab stops come in a later milestone)
      }
      e.stopPropagation(); // don't let host-page shortcuts see keys typed into Natex
    });

    toggle.addEventListener('click', () => {
      const hidden = panel.classList.toggle('no-preview');
      toggle.textContent = hidden ? 'Show preview' : 'Hide preview';
      source.focus();
    });
    insert.addEventListener('click', () => this.attemptInsert(false));
    anyway.addEventListener('click', () => this.attemptInsert(true));
    keep.addEventListener('click', () => { this.hideConfirm(); source.focus(); });

    // Clicking outside closes the panel; the source text is kept for next time.
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      const path = e.composedPath();
      if (path.includes(this.host) || path.some((n) => n.classList?.contains?.('ql-natex'))) return;
      this.close({ refocus: false });
    }, true);

    window.addEventListener('resize', () => this.isOpen && this.close({ refocus: false }));
  }
}
