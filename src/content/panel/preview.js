// Turns render parts into preview HTML and the error list.

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** @param {import('../../core/render.js').RenderPart[]} parts */
export function previewHtml(parts) {
  const html = parts.map((p) => {
    if (p.kind === 'text') return esc(p.text);
    const cls = [p.display ? 'disp' : '', p.stale ? 'stale' : ''].filter(Boolean).join(' ');
    const inner = p.html ?? `<span class="raw">${esc(p.raw)}</span>`;
    return `<span class="${cls}">${inner}</span>`;
  }).join('');
  return html.trim() ? html : '';
}

/**
 * Fills the error list; clicking an error selects it in the source.
 * @param {HTMLElement} list
 * @param {{ message: string, at: number, length: number }[]} errors
 * @param {(e: { at: number, length: number }) => void} onPick
 */
export function renderErrors(list, errors, onPick) {
  list.replaceChildren(...errors.map((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = 'Jump to the error';
    const label = document.createElement('b');
    label.textContent = 'Error';
    const msg = document.createElement('span');
    msg.textContent = e.message;
    b.append(label, msg);
    b.addEventListener('click', () => onPick(e));
    return b;
  }));
}
