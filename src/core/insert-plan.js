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
