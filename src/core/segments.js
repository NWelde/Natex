// Splits Natex source ("text $inline$ text $$display$$", or with \(…\) and
// \[…\]) into segments. `\$` is a literal dollar sign. Pure: no DOM, safe to
// unit-test in Node.

/**
 * @typedef {{ kind: 'text', start: number, end: number, value: string }} TextSegment
 * @typedef {{ kind: 'math', start: number, end: number, texStart: number, texEnd: number,
 *             tex: string, display: boolean, closed: boolean, open: string, close: string }} MathSegment
 * @typedef {TextSegment | MathSegment} Segment
 */

/** Math delimiters: TeX's `$…$` / `$$…$$` and LaTeX's `\(…\)` / `\[…\]`. */
const DELIMITERS = [
  { open: '$$', close: '$$', display: true },
  { open: '$', close: '$', display: false },
  { open: '\\[', close: '\\]', display: true },
  { open: '\\(', close: '\\)', display: false },
];

/** The delimiter opening math at `i`, if any. */
const opener = (source, i) => DELIMITERS.find((d) => source.startsWith(d.open, i)) ?? null;

/** @param {string} source @returns {Segment[]} */
export function parse(source) {
  const segs = [];
  let i = 0;
  let textStart = 0;
  const pushText = (end) => {
    if (end > textStart) segs.push({ kind: 'text', start: textStart, end, value: source.slice(textStart, end) });
  };

  while (i < source.length) {
    const open = opener(source, i);
    if (!open) { i += source[i] === '\\' ? 2 : 1; continue; }

    const { display, close: closer } = open;
    const width = open.open.length;
    pushText(i);
    const texStart = i + width;
    let close = -1;
    for (let j = texStart; j < source.length; j++) {
      if (source.startsWith(closer, j)) { close = j; break; }
      if (source[j] === '\\') j++; // `\$`, `\\` etc. never close
    }

    if (close < 0) {
      segs.push({ kind: 'math', start: i, end: source.length, texStart, texEnd: source.length,
        tex: source.slice(texStart), display, closed: false, open: open.open, close: closer });
      i = textStart = source.length;
      break;
    }
    segs.push({ kind: 'math', start: i, end: close + closer.length, texStart, texEnd: close,
      tex: source.slice(texStart, close), display, closed: true, open: open.open, close: closer });
    i = textStart = close + closer.length;
  }
  pushText(source.length);
  return segs;
}

/** Text with `\$` turned back into `$`. */
export const unescapeDollar = (s) => s.replace(/\\\$/g, '$');

/** Is offset `pos` inside the TeX of a math segment? */
export function inMath(source, pos) {
  return parse(source).some((s) => s.kind === 'math' && pos >= s.texStart && pos <= s.texEnd);
}

/**
 * Text after display math starts on a new line, so the spaces / line break
 * that separated them in the source are dropped. Used by both the preview and
 * the insert so they always match.
 */
export const trimAfterDisplay = (text) => text.replace(/^[ \t]*\n?[ \t]*/, '');

/** Whether the segment before index `i` is non-empty display math. */
export const followsDisplay = (segs, i) => i > 0 && segs[i - 1].kind === 'math' && segs[i - 1].display && !!segs[i - 1].tex.trim();
