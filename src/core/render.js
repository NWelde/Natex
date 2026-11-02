// Renders parsed segments with KaTeX and collects errors with source positions.
// KaTeX is passed in so this stays pure and testable in Node.

import { DISPLAY_PREFIX } from './constants.js';
import { unescapeDollar, trimAfterDisplay, followsDisplay } from './segments.js';

/** The exact value handed to the host's formula blot (and therefore to KaTeX). */
export const formulaValue = (seg) => (seg.display ? DISPLAY_PREFIX : '') + seg.tex.trim();

/** The inverse: Natex source for a formula already in the host editor (`$…$`, or `$$…$$` for display). */
export function formulaSource(value) {
  const tex = String(value ?? '').trim();
  return tex.startsWith(DISPLAY_PREFIX.trim())
    ? `$$${tex.slice(DISPLAY_PREFIX.trim().length).trim()}$$`
    : `$${tex}$`;
}

/**
 * @typedef {{ message: string, at: number, length: number }} RenderError
 * @typedef {{ kind: 'text', text: string }
 *         | { kind: 'math', display: boolean, html: string | null, stale: boolean, raw: string }} RenderPart
 */

/**
 * @param {import('./segments.js').Segment[]} segs
 * @param {{ renderToString: Function }} katex
 * @param {string[]} lastGood  last successful HTML per math segment (by order); mutated
 * @returns {{ parts: RenderPart[], errors: RenderError[] }}
 */
export function renderAll(segs, katex, lastGood) {
  const parts = [];
  const errors = [];
  let mathIndex = 0;

  segs.forEach((seg, i) => {
    if (seg.kind === 'text') {
      const text = unescapeDollar(seg.value);
      parts.push({ kind: 'text', text: followsDisplay(segs, i) ? trimAfterDisplay(text) : text });
      return;
    }
    const k = mathIndex++;

    if (seg.tex.trim()) {
      try {
        const html = katex.renderToString(formulaValue(seg), { throwOnError: true });
        lastGood[k] = html;
        parts.push({ kind: 'math', display: seg.display, html, stale: false, raw: seg.tex });
      } catch (e) {
        errors.push(locateError(seg, e));
        // Keep showing the last good render (faded) so the preview doesn't jump around.
        parts.push({ kind: 'math', display: seg.display, html: lastGood[k] ?? null, stale: lastGood[k] != null, raw: seg.tex });
      }
    }
    if (!seg.closed) {
      errors.push({ message: `Missing closing ${seg.display ? '$$' : '$'}`, at: seg.start, length: seg.display ? 2 : 1 });
    }
  });
  return { parts, errors };
}

/** Maps a KaTeX ParseError position (in formulaValue) back to a source offset. */
function locateError(seg, e) {
  const message = (e.rawMessage || e.message || String(e)).replace(/^KaTeX parse error: /, '');
  if (typeof e.position !== 'number') return { message, at: seg.texStart, length: Math.max(1, seg.tex.length) };

  const leading = seg.tex.length - seg.tex.trimStart().length;
  const shift = (seg.display ? DISPLAY_PREFIX.length : 0) - leading;
  let at = seg.texStart + e.position - shift;
  let length = e.length || 1;
  // Errors at end of input point just past the TeX; pin them to its last character.
  if (at >= seg.texEnd) { at = Math.max(seg.texStart, seg.texEnd - 1); length = 1; }
  return { message, at, length };
}
