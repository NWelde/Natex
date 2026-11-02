// How the panel talks to a host Quill editor. Two strategies:
//
//  - "bridge": the page-world bridge reached the Quill instance (Quill 1, or a
//    page exposing window.Quill). Exact caret, insert as one undo step.
//  - "dom": the instance isn't reachable (Quill 2 bundled without a global keeps
//    instances private). Use the DOM selection for placement and insert by
//    pasting HTML, which Quill's clipboard turns into text + formula embeds.

import { EDITOR_ID_ATTR } from '../core/protocol.js';
import { toClipboard, singleFormula, formulaHtml } from '../core/insert-plan.js';
import { call } from './bridge.js';

const containerOf = (editorId) => document.querySelector(`[${EDITOR_ID_ATTR}="${CSS.escape(editorId)}"]`);
const rootOf = (editorId) => containerOf(editorId)?.querySelector('.ql-editor') ?? null;

/**
 * Captures where to insert, before focus leaves the editor.
 * @returns {Promise<{ editorId: string, mode: 'bridge' | 'dom', range?: object, domRange?: Range,
 *   rect: { left: number, top: number, bottom: number, editorLeft: number } }>}  (viewport coordinates)
 */
export async function captureTarget(editorId) {
  try {
    const { range, rect } = await call('getCaret', { editorId }, 600);
    return { editorId, mode: 'bridge', range, rect };
  } catch (err) {
    console.debug('[Natex] using DOM fallback:', err.message);
  }

  const root = rootOf(editorId);
  if (!root) throw new Error('Editor not found');
  const sel = window.getSelection();
  let domRange = sel.rangeCount && root.contains(sel.getRangeAt(0).startContainer) ? sel.getRangeAt(0).cloneRange() : null;
  if (!domRange) {
    // No caret in the editor: insert at the end.
    domRange = document.createRange();
    domRange.selectNodeContents(root);
    domRange.collapse(false);
  }
  const editorRect = root.getBoundingClientRect();
  const caret = domRange.getClientRects()[0] || domRange.getBoundingClientRect();
  const hasCaret = caret && (caret.width || caret.height);
  return {
    editorId,
    mode: 'dom',
    domRange,
    rect: hasCaret
      ? { left: caret.left, top: caret.top, bottom: caret.bottom, editorLeft: editorRect.left }
      : { left: editorRect.left, top: editorRect.top, bottom: editorRect.top + 24, editorLeft: editorRect.left },
  };
}

/** The formula embed an event happened on, if it's in an editable Quill editor. */
export function editableFormula(path) {
  const node = path.find((n) => n.classList?.contains('ql-formula'));
  return node?.closest('.ql-editor')?.isContentEditable ? node : null;
}

/**
 * Captures a formula embed for editing; same shape as captureTarget, with
 * `replace: true` and a range covering just the formula.
 */
export async function captureFormula(editorId, node) {
  const root = rootOf(editorId);
  if (!root || !root.contains(node)) throw new Error('Formula not found');
  const box = node.getBoundingClientRect();
  const rect = { left: box.left, top: box.top, bottom: box.bottom, editorLeft: root.getBoundingClientRect().left };
  try {
    const range = await formulaRange(editorId, node);
    return { editorId, mode: 'bridge', range, rect, replace: true, node };
  } catch (err) {
    console.debug('[Natex] using DOM fallback:', err.message);
  }
  const domRange = document.createRange();
  domRange.selectNode(node);
  return { editorId, mode: 'dom', domRange, rect, replace: true, node };
}

async function formulaRange(editorId, node) {
  const n = [...rootOf(editorId).querySelectorAll('.ql-formula')].indexOf(node);
  return (await call('getFormula', { editorId, n }, 600)).range;
}

/** Inserts parsed segments at the captured position (or over the captured formula); the caret ends up after them. */
export async function insertSegments(target, segments) {
  if (target.replace && !target.node.isConnected) throw new Error('The formula is no longer in the editor');
  if (target.mode === 'bridge') {
    if (target.replace) target.range = await formulaRange(target.editorId, target.node); // it may have moved
    await call('insert', { editorId: target.editorId, range: target.range, segments, replace: !!target.replace });
    return;
  }
  const root = rootOf(target.editorId);
  if (!root) throw new Error('Editor not found');
  if (target.replace) target.domRange.selectNode(target.node); // re-select it right before pasting over it
  restoreSelection(root, target.domRange);
  const single = target.replace ? singleFormula(segments) : null;
  const { html, text } = single ? { html: formulaHtml(single), text: single } : toClipboard(segments);
  const data = new DataTransfer();
  data.setData('text/html', html);
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  root.dispatchEvent(event);
  if (!event.defaultPrevented) throw new Error("The editor didn't accept the paste");
}

/** Puts focus (and the caret) back in the editor; after the formula when one was being edited, never selecting it. */
export function refocus(target) {
  if (target.mode === 'bridge') {
    const index = target.range.index + (target.replace ? target.range.length : 0);
    call('focus', { editorId: target.editorId, index }).catch(() => {});
    return;
  }
  const root = rootOf(target.editorId);
  if (!root) return;
  let range = target.domRange;
  if (target.replace) {
    range = document.createRange();
    if (target.node.isConnected) { range.selectNode(target.node); range.collapse(false); }
  }
  restoreSelection(root, range);
}

function restoreSelection(root, range) {
  root.focus({ preventScroll: true });
  if (!range || !root.contains(range.startContainer)) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
