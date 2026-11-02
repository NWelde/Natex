// Turns segments into Quill Delta ops. Pure, so the insert layout is unit-tested
// without Quill; the page-world bridge only applies the result.

import { formulaValue } from './render.js';
import { unescapeDollar, trimAfterDisplay, followsDisplay } from './segments.js';

/**
 * @param {import('./segments.js').Segment[]} segs
 * @param {{ prevChar?: string }} [ctx]  character just before the insert point ('\n' at line start)
 * @returns {{ ops: object[], length: number }}  ops to insert, and how many Quill characters they add
 */
export function toDeltaOps(segs, { prevChar = '\n' } = {}) {
  const ops = [];
  let length = 0;
  let prev = prevChar;

  segs.forEach((seg, i) => {
    if (seg.kind === 'text') {
      let text = unescapeDollar(seg.value);
      if (followsDisplay(segs, i)) text = trimAfterDisplay(text);
      if (!text) return;
      ops.push({ insert: text });
      length += text.length;
      prev = text.slice(-1);
      return;
    }
    if (!seg.tex.trim()) return;

    if (!seg.display) {
      ops.push({ insert: { formula: formulaValue(seg) } });
      length += 1;
      prev = 'x';
      return;
    }
    // Display math gets its own centered line, matching the preview.
    if (prev !== '\n') { ops.push({ insert: '\n' }); length += 1; }
    ops.push({ insert: { formula: formulaValue(seg) } });
    ops.push({ insert: '\n', attributes: { align: 'center' } });
    length += 2;
    prev = '\n';
  });
  return { ops, length };
}

const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The same content as toDeltaOps, as HTML that Quill's clipboard understands
 * (`.ql-formula[data-value]` becomes a formula embed). Used when the host's
 * Quill instance isn't reachable, e.g. Quill 2 bundled without a global: we
 * paste this instead of calling updateContents.
 * @param {import('./segments.js').Segment[]} segs
 * @returns {{ html: string, text: string }}
 */
export function toClipboard(segs) {
  const blocks = []; // { html, center }
  let line = '';
  let text = '';
  const endLine = (center = false) => { blocks.push({ html: line, center }); line = ''; };

  segs.forEach((seg, i) => {
    if (seg.kind === 'text') {
      let value = unescapeDollar(seg.value);
      if (followsDisplay(segs, i)) value = trimAfterDisplay(value);
      text += value;
      value.split('\n').forEach((part, k) => {
        if (k > 0) endLine();
        line += escHtml(part);
      });
      return;
    }
    if (!seg.tex.trim()) return;
    const formula = `<span class="ql-formula" data-value="${escHtml(formulaValue(seg))}"></span>`;
    text += seg.display ? `\n${seg.tex.trim()}\n` : seg.tex.trim();
    if (!seg.display) { line += formula; return; }
    if (line) endLine();
    line = formula;
    endLine(true);
  });
  if (line || !blocks.length) endLine();

  // A single plain line pastes inline (no paragraph break at the caret).
  if (blocks.length === 1 && !blocks[0].center) return { html: blocks[0].html, text };
  const html = blocks.map((b) => `<p${b.center ? ' class="ql-align-center"' : ''}>${b.html || '<br>'}</p>`).join('');
  return { html, text };
}
