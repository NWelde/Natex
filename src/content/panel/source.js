// The LaTeX source box: a transparent textarea over a highlighted mirror that
// colors math and underlines errors.

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * Renders the mirror for `text`.
 * @param {HTMLElement} mirror
 * @param {HTMLTextAreaElement} textarea
 * @param {import('../../core/segments.js').Segment[]} segs
 * @param {{ at: number, length: number }[]} errors  errors to underline (only the revealed ones)
 */
export function renderSource(mirror, textarea, segs, errors) {
  const text = textarea.value;
  const inError = (i) => errors.some((e) => i >= e.at && i < e.at + e.length);
  let out = '';
  for (const seg of segs) {
    if (seg.kind === 'math') out += '<span class="m">';
    let chunk = '';
    let underlined = false;
    for (let i = seg.start; i < seg.end; i++) {
      const e = inError(i);
      if (e !== underlined) {
        out += esc(chunk) + (e ? '<span class="e">' : '</span>');
        chunk = '';
        underlined = e;
      }
      chunk += text[i];
    }
    out += esc(chunk) + (underlined ? '</span>' : '');
    if (seg.kind === 'math') out += '</span>';
  }
  // Trailing newline keeps the mirror as tall as the textarea when it ends in "\n".
  mirror.innerHTML = `${out}\n`;
  textarea.style.height = `${mirror.offsetHeight}px`;
}
