// Runs in the page's MAIN world so it can reach the host's Quill instances,
// which content scripts can't see. Kept deliberately small: it only answers
// requests from src/content/bridge.js.

import { REQUEST_EVENT, RESPONSE_EVENT, EDITOR_ID_ATTR } from '../core/protocol.js';
import { toDeltaOps, singleFormula } from '../core/insert-plan.js';

function quillFor(editorId) {
  const container = document.querySelector(`[${EDITOR_ID_ATTR}="${CSS.escape(editorId)}"]`);
  if (!container) throw new Error(`No editor ${editorId}`);
  const q = container.__quill || window.Quill?.find?.(container);
  if (!q) throw new Error('Quill instance not reachable on this page');
  return q;
}

const handlers = {
  ping: () => 'pong',

  /** Caret position and its on-screen box, captured before focus leaves the editor. */
  getCaret({ editorId }) {
    const q = quillFor(editorId);
    const range = q.getSelection() || { index: Math.max(0, q.getLength() - 1), length: 0 };
    const b = q.getBounds(range.index, range.length);
    const r = q.container.getBoundingClientRect();
    return { range, rect: { left: r.left + b.left, top: r.top + b.top, bottom: r.top + b.bottom, editorLeft: r.left, editorRight: r.right } };
  },

  /** Range of the n-th formula embed in the editor (the content script counts them in the DOM). */
  getFormula({ editorId, n }) {
    const q = quillFor(editorId);
    const node = q.root.querySelectorAll('.ql-formula')[n];
    const blot = node && (q.scroll.find?.(node) ?? window.Quill?.find?.(node) ?? node.__blot?.blot);
    if (!blot) throw new Error('Formula not found');
    return { range: { index: q.getIndex(blot), length: 1 } };
  },

  /**
   * Inserts parsed segments as one undo step and puts the caret right after them.
   * With `replace`, the range is a formula being updated: a single formula swaps
   * the embed in place, so a display formula keeps its line.
   */
  insert({ editorId, range, segments, replace = false }) {
    const q = quillFor(editorId);
    const prevChar = range.index > 0 ? q.getText(range.index - 1, 1) : '\n';
    const single = replace ? singleFormula(segments) : null;
    const { ops, length } = single ? { ops: [{ insert: { formula: single } }], length: 1 } : toDeltaOps(segments, { prevChar });
    const delta = [];
    if (range.index) delta.push({ retain: range.index });
    if (range.length) delta.push({ delete: range.length });
    q.history?.cutoff();
    q.updateContents({ ops: delta.concat(ops) }, 'user');
    q.history?.cutoff();
    q.focus();
    q.setSelection(range.index + length, 0, 'user');
    return { length };
  },

  focus({ editorId, index }) {
    const q = quillFor(editorId);
    q.focus();
    if (typeof index === 'number') q.setSelection(index, 0, 'user');
    return true;
  },
};

if (!window.__NATEX_PAGE_BRIDGE__) {
  window.__NATEX_PAGE_BRIDGE__ = true;
  document.addEventListener(REQUEST_EVENT, (event) => {
    let msg;
    try { msg = JSON.parse(event.detail); } catch { return; }
    let reply;
    try {
      const handler = handlers[msg.method];
      if (!handler) throw new Error(`Unknown method ${msg.method}`);
      reply = { id: msg.id, ok: true, value: handler(msg.args || {}) };
    } catch (err) {
      reply = { id: msg.id, ok: false, error: String(err?.message || err) };
    }
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: JSON.stringify(reply) }));
  });
}
