// The Natex panel: write LaTeX with a live preview, then insert it into the
// host editor. One panel per frame, shown in a shadow root.

import katex from 'katex';
import { parse } from '../../core/segments.js';
import { renderAll } from '../../core/render.js';
import { ERROR_DELAY } from '../../core/constants.js';
import { formulaSource } from '../../core/render.js';
import { captureTarget, captureFormula, editableFormula, insertSegments, refocus as refocusEditor } from '../editor.js';
import { draftKey, loadDraft, saveDraft, clearDraft } from '../drafts.js';
import { isHotkey } from '../hotkey.js';
import { alive, signal } from '../lifecycle.js';
import { katexShadowCss, injectKatexFonts } from '../katex-assets.js';
import { renderSource } from './source.js';
import { previewHtml, renderErrors } from './preview.js';
import panelCss from './styles.css';

const TEMPLATE = `
  <div class="panel" role="dialog" aria-label="Natex LaTeX editor">
    <div class="head">
      <div class="title" data-ref="title">Natex</div>
      <button class="toggle" type="button" data-ref="toggle">Hide preview</button>
    </div>
    <div class="draft" data-ref="draftBar" hidden>
      <span>Draft restored</span>
      <button type="button" data-ref="discard">Discard</button>
    </div>
    <div class="src">
      <pre class="hl" data-ref="mirror" aria-hidden="true"></pre>
      <textarea data-ref="source" spellcheck="false" aria-label="LaTeX source"
        placeholder="Write text and math:  area is $\\pi r^2$"></textarea>
    </div>
    <div class="pv-wrap">
      <div class="pv" data-ref="preview"></div>
      <div class="errs" data-ref="errors"></div>
    </div>
    <div class="confirm" data-ref="confirm" hidden>
      <span data-ref="confirmMsg"></span>
      <button class="keep" type="button" data-ref="keep">Keep editing</button>
      <button class="anyway" type="button" data-ref="anyway">Insert anyway</button>
    </div>
    <div class="foot">
      <div class="hint"><kbd>Ctrl</kbd><kbd>↵</kbd> <span data-ref="hintVerb">insert</span> · <kbd>Esc</kbd> close</div>
      <button class="insert" type="button" data-ref="insert">Insert</button>
    </div>
  </div>
  <div class="mark" data-ref="mark" hidden></div>
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

    this.target = null; // from captureTarget / captureFormula; target.replace when editing a formula
    this.draftKey = null; // set while writing new content; editing a formula never touches drafts
    this.lastGood = [];
    this.errors = [];
    this.shownErrors = [];
    this.confirming = false;
    this.errorTimer = 0;

    this.bindEvents();
  }

  get isOpen() { return this.el.panel.classList.contains('open'); }

  get isEditing() { return !!this.target?.replace; }

  /** Opens the panel for a Quill editor, anchored under its caret, with that editor's draft. */
  async open(editorId) {
    if (this.isOpen && !this.isEditing && this.target?.editorId === editorId) return;
    let target;
    try {
      target = await captureTarget(editorId);
    } catch (err) {
      console.warn('[Natex]', err.message);
      this.toast("Natex can't reach this editor");
      return;
    }
    const key = draftKey(editorId);
    const draft = await loadDraft(key);
    this.close({ refocus: false, quiet: true });
    this.draftKey = key;
    this.show(target, draft);
    this.el.draftBar.hidden = !draft;
    this.place();
  }

  /** Opens the panel on a formula in the host editor; Update replaces it in place. */
  async editFormula(editorId, node) {
    if (this.isOpen && this.target?.node === node) return;
    let target;
    try {
      target = await captureFormula(editorId, node);
    } catch (err) {
      console.warn('[Natex]', err.message);
      this.toast("Natex can't edit this formula");
      return;
    }
    this.close({ refocus: false });
    this.draftKey = null;
    this.show(target, formulaSource(node.getAttribute('data-value')));
  }

  show(target, text) {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    injectKatexFonts();
    this.target = target;
    const editing = this.isEditing;
    this.el.title.textContent = editing ? 'Editing formula' : 'Natex';
    this.el.insert.textContent = editing ? 'Update' : 'Insert';
    this.el.hintVerb.textContent = editing ? 'update' : 'insert';
    this.el.draftBar.hidden = true;
    this.el.source.value = text;
    this.lastGood = [];
    this.place(target.rect);
    this.markFormula();
    this.hideConfirm();
    this.refresh({ showErrorsNow: true });
    this.el.panel.classList.add('open');
    requestAnimationFrame(() => {
      this.el.source.focus();
      this.el.source.setSelectionRange(text.length, text.length);
    });
  }

  /** Removes the panel for good (this content-script instance is shutting down). */
  destroy() {
    clearTimeout(this.errorTimer);
    clearTimeout(this.toastTimer);
    this.host.remove();
  }

  close({ refocus = true, quiet = false } = {}) {
    if (!this.isOpen) return;
    this.el.panel.classList.remove('open');
    this.el.mark.hidden = true;
    clearTimeout(this.errorTimer);
    if (!quiet && this.draftKey && this.el.source.value.trim()) this.toast('Draft saved — reopen to continue');
    if (refocus && this.target) refocusEditor(this.target);
  }

  /** Outlines the formula being edited (an overlay, so the host's DOM isn't touched). */
  markFormula() {
    const { mark } = this.el;
    const node = this.target.node;
    mark.hidden = !node;
    if (!node) return;
    const r = node.getBoundingClientRect();
    Object.assign(mark.style, {
      left: `${r.left + window.scrollX - 3}px`, top: `${r.top + window.scrollY - 2}px`,
      width: `${r.width + 6}px`, height: `${r.height + 4}px`,
    });
  }

  /**
   * Positions the panel below the caret (or formula), or above it when there's
   * no room below, always inside the visible area. The host editor may live in
   * a small iframe, so the panel can also shrink: the preview scrolls first.
   * Called on open and again whenever the content changes height.
   */
  place(rect = this.anchor) {
    // Keep the anchor in page coordinates so later re-placing survives scrolling.
    if (rect !== this.anchor) {
      this.anchor = { left: rect.left + scrollX, top: rect.top + scrollY, bottom: rect.bottom + scrollY, editorLeft: rect.editorLeft + scrollX };
      this.side = null;
    }
    const a = this.anchor;
    const panel = this.el.panel;
    // The visible area without scrollbars (quirks-mode frames report it on <body>).
    const vp = document.compatMode === 'BackCompat' ? document.body : document.documentElement;
    const vw = vp.clientWidth || innerWidth;
    const vh = vp.clientHeight || innerHeight;
    const gap = 10;
    const margin = 8;

    const width = Math.min(560, vw - 2 * margin);
    panel.style.width = `${width}px`;
    const left = Math.min(Math.max(margin, Math.max(a.editorLeft - scrollX, a.left - scrollX - 12)), vw - width - margin);
    panel.style.left = `${left + scrollX}px`;

    panel.style.maxHeight = '';
    const natural = panel.offsetHeight;
    const below = vh - (a.bottom - scrollY) - gap - margin;
    const above = (a.top - scrollY) - gap - margin;
    // Pick a side once per opening, so the panel doesn't jump while typing.
    this.side ??= natural <= below || below >= above ? 'below' : 'above';
    const room = Math.max(160, this.side === 'below' ? below : above);
    const height = Math.min(natural, room);
    panel.style.maxHeight = natural > room ? `${room}px` : '';
    panel.style.top = this.side === 'below'
      ? `${a.bottom + gap}px`
      : `${a.top - gap - height}px`;
  }

  /** Re-renders source highlight and preview. Errors appear only after typing pauses. */
  refresh({ showErrorsNow = false } = {}) {
    const segs = parse(this.el.source.value);
    const { parts, errors } = renderAll(segs, katex, this.lastGood);
    this.errors = errors;
    this.el.preview.innerHTML = previewHtml(parts);
    if (this.anchor) this.place();

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
    if (this.anchor) this.place();
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
      this.toast(this.isEditing ? "Couldn't update this formula" : "Couldn't insert into this editor");
      return;
    }
    if (this.draftKey) clearDraft(this.draftKey);
    this.el.source.value = '';
    this.lastGood = [];
    this.hideConfirm();
    this.close({ refocus: false }); // the editor already put the caret after the insert
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
    if (this.anchor) this.place();
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
    const { source, toggle, insert, keep, anyway, panel, discard, draftBar } = this.el;

    source.addEventListener('input', () => {
      if (this.confirming) this.hideConfirm();
      draftBar.hidden = true;
      if (this.draftKey && alive()) saveDraft(this.draftKey, source.value);
      this.refresh();
    });

    discard.addEventListener('click', () => {
      clearDraft(this.draftKey);
      source.value = '';
      this.lastGood = [];
      draftBar.hidden = true;
      this.refresh({ showErrorsNow: true });
      source.focus();
    });

    // Keys are handled on the panel so they work from any control inside it.
    panel.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); this.attemptInsert(this.confirming); }
      else if (isHotkey(e)) { e.preventDefault(); this.close(); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (this.confirming) { this.hideConfirm(); source.focus(); }
        else this.close();
      } else if (e.key === 'Tab' && e.target === source) {
        e.preventDefault(); // keep focus in the source
      }
      e.stopPropagation(); // don't let host-page shortcuts see keys typed into Natex
    });

    toggle.addEventListener('click', () => {
      const hidden = panel.classList.toggle('no-preview');
      toggle.textContent = hidden ? 'Show preview' : 'Hide preview';
      this.place();
      source.focus();
    });
    insert.addEventListener('click', () => this.attemptInsert(false));
    anyway.addEventListener('click', () => this.attemptInsert(true));
    keep.addEventListener('click', () => { this.hideConfirm(); source.focus(); });

    // Clicking outside closes the panel; the draft is kept for next time.
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      const path = e.composedPath();
      // The Natex button and host formulas are handled by their own click handlers (src/content/index.js).
      if (path.includes(this.host) || path.some((n) => n.classList?.contains?.('ql-natex')) || editableFormula(path)) return;
      this.close({ refocus: false });
    }, { capture: true, signal });

    window.addEventListener('resize', () => this.isOpen && this.close({ refocus: false }), { signal });
  }
}
