// How the panel talks to a host Quill editor. Two strategies:
//
//  - "bridge": the page-world bridge reached the Quill instance (Quill 1, or a
//    page exposing window.Quill). Exact caret, insert as one undo step.
//  - "dom": the instance isn't reachable (Quill 2 bundled without a global keeps
//    instances private). Use the DOM selection for placement and insert by
//    pasting HTML, which Quill's clipboard turns into text + formula embeds.

import { EDITOR_ID_ATTR } from '../core/protocol.js';
import { toClipboard } from '../core/insert-plan.js';
import { call } from './bridge.js';

const containerOf = (editorId) => document.querySelector(`[${EDITOR_ID_ATTR}="${CSS.escape(editorId)}"]`);
const rootOf = (editorId) => containerOf(editorId)?.querySelector('.ql-editor') ?? null;

/**
 * Captures where to insert, before focus leaves the editor.
 * @returns {Promise<{ editorId: string, mode: 'bridge' | 'dom', range?: object, domRange?: Range,
 *   rect: { left: number, bottom: number, editorLeft: number } }>}
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
    rect: { left: hasCaret ? caret.left : editorRect.left, bottom: hasCaret ? caret.bottom : editorRect.top + 24, editorLeft: editorRect.left },
  };
}

/** Inserts parsed segments at the captured position; the caret ends up after them. */
export async function insertSegments(target, segments) {
  if (target.mode === 'bridge') {
    await call('insert', { editorId: target.editorId, range: target.range, segments });
    return;
  }
  const root = rootOf(target.editorId);
  if (!root) throw new Error('Editor not found');
  restoreSelection(root, target.domRange);
  const { html, text } = toClipboard(segments);
  const data = new DataTransfer();
  data.setData('text/html', html);
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  root.dispatchEvent(event);
  if (!event.defaultPrevented) throw new Error("The editor didn't accept the paste");
}

/** Puts focus (and the caret) back in the editor. */
export function refocus(target) {
  if (target.mode === 'bridge') {
    call('focus', { editorId: target.editorId, index: target.range.index }).catch(() => {});
    return;
  }
  const root = rootOf(target.editorId);
  if (root) restoreSelection(root, target.domRange);
}

function restoreSelection(root, range) {
  root.focus({ preventScroll: true });
  if (!range || !root.contains(range.startContainer)) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
