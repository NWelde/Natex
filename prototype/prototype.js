// Natex clickable prototype: a host forum with a Quill editor, the extension
// popup, and the Natex LaTeX editor. Everything is faked client-side; nothing
// here is the real extension code.

const $ = (sel) => document.querySelector(sel);

// Mirrors a slice of ~/.config/nvim/snippets/tex.lua. `$1`, `$2` are tab
// stops, `$0` is where the cursor ends up after the last Tab.
const SNIPPETS = [
  { trig: 'ff', body: '\\frac{$1}{$2}$0', ctx: 'math' },
  { trig: 'sq', body: '\\sqrt{$1}$0', ctx: 'math' },
  { trig: 'sum', body: '\\sum_{${1:n=1}}^{${2:\\infty}} $0', ctx: 'math' },
  { trig: 'lim', body: '\\lim_{${1:n} \\to ${2:\\infty}} $0', ctx: 'math' },
  { trig: 'pd', body: '\\frac{\\partial $1}{\\partial $2}$0', ctx: 'math' },
  { trig: 'td', body: '^{$1}$0', ctx: 'math' },
  { trig: 'sr', body: '^{2}', ctx: 'math' },
  { trig: 'mk', body: '$$1$$0', ctx: 'text' },
];

const SYMBOLS = [
  ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['δ', '\\delta'], ['ε', '\\epsilon'], ['θ', '\\theta'],
  ['λ', '\\lambda'], ['μ', '\\mu'], ['π', '\\pi'], ['σ', '\\sigma'], ['φ', '\\phi'], ['ω', '\\omega'],
  ['∞', '\\infty'], ['∂', '\\partial'], ['∇', '\\nabla'], ['±', '\\pm'], ['×', '\\times'], ['·', '\\cdot'],
  ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['≈', '\\approx'], ['→', '\\to'], ['∈', '\\in'],
];

const state = { enabled: false, done: new Set(), stops: [], beforeSel: 0, prevLen: 0, savedRange: null };

/* ───────── Walkthrough ───────── */
function mark(step) {
  state.done.add(step);
  let currentSet = false;
  document.querySelectorAll('#guideList li').forEach((li) => {
    const d = state.done.has(li.dataset.step);
    li.classList.toggle('done', d);
    li.classList.toggle('current', !d && !currentSet);
    if (!d) currentSet = true;
  });
}
mark('__init');
$('#resetBtn').onclick = () => location.reload();
$('#guideHide').onclick = () => $('#guide').classList.toggle('min');

/* ───────── Toast ───────── */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-toast]');
  if (el) { e.preventDefault(); toast(el.dataset.toast); }
});

/* ───────── Popup ───────── */
const popup = $('#popup');
$('#shortcutCount').textContent = SNIPPETS.length;

function setPopup(open) {
  popup.classList.toggle('open', open);
  $('#natexPin').classList.toggle('active', open);
  popup.setAttribute('aria-hidden', String(!open));
}
$('#natexPin').onclick = (e) => {
  e.stopPropagation();
  setPopup(!popup.classList.contains('open'));
  mark('pin');
};
document.addEventListener('mousedown', (e) => {
  if (popup.classList.contains('open') && !popup.contains(e.target) && !e.target.closest('#natexPin')) setPopup(false);
});

function setEnabled(on) {
  state.enabled = on;
  popup.classList.toggle('enabled', on);
  $('#siteSwitch').classList.toggle('on', on);
  $('#pinDot').classList.toggle('on', on);
  $('#natexSlot').classList.toggle('on', on);
  if (!on) closeEditor();
}
$('#enableBtn').onclick = () => {
  setEnabled(true);
  mark('enable');
  toast('Natex is on for canvas.instructure.com');
};
$('#siteSwitch').onclick = () => {
  const on = !state.enabled;
  setEnabled(on);
  // Turning off from the switch drops back to the "Enable" state.
  toast(on ? 'Natex is on for this site' : 'Natex is off for this site');
};

/* ───────── Quill (host editor) ───────── */
const quill = new Quill('#quill', {
  theme: 'snow',
  placeholder: 'Write your reply…',
  modules: {
    formula: true,
    toolbar: { container: '#toolbar', handlers: { natex: () => openEditor() } },
  },
});

/* ───────── Natex editor ───────── */
const nx = $('#nx');
const src = $('#src');
const hl = $('#hl');
const pv = $('#pvPane');

function openEditor() {
  if (!state.enabled) return;
  state.savedRange = quill.getSelection(true) || { index: quill.getLength() - 1, length: 0 };
  positionEditor();
  nx.classList.add('open');
  nx.setAttribute('aria-hidden', 'false');
  setTab('write');
  setTimeout(() => src.focus(), 30);
  mark('open');
}
function closeEditor(refocus) {
  if (!nx.classList.contains('open')) return;
  nx.classList.remove('open');
  nx.setAttribute('aria-hidden', 'true');
  $('#symbols').classList.remove('open');
  $('#symBtn').classList.remove('on');
  if (refocus) quill.setSelection(state.savedRange.index, 0);
}
function positionEditor() {
  const b = quill.getBounds(state.savedRange.index);
  const editorRect = quill.root.getBoundingClientRect();
  const wrapRect = $('#quillWrap').getBoundingClientRect();
  const width = 560;
  const left = Math.min(editorRect.left + b.left - 12, wrapRect.right - width);
  nx.style.left = `${Math.max(wrapRect.left, left) + window.scrollX}px`;
  nx.style.top = `${editorRect.top + b.bottom + 10 + window.scrollY}px`;
}
window.addEventListener('resize', () => nx.classList.contains('open') && positionEditor());

/* Write / Preview segmented control */
function setTab(tab) {
  const btns = [...document.querySelectorAll('#seg button')];
  btns.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const active = btns.find((b) => b.dataset.tab === tab);
  const thumb = $('.seg-thumb');
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft - 2}px)`;
  nx.classList.toggle('preview', tab === 'preview');
  $('#snipFlash').classList.remove('show');
  if (tab === 'preview') { renderPreview(); mark('preview'); }
  else src.focus();
}
document.querySelectorAll('#seg button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

/* Is position `i` inside $…$ / $$…$$ ? */
function inMath(text, i) {
  let open = false;
  for (let k = 0; k < i; k++) {
    if (text[k] === '\\') { k++; continue; }
    if (text[k] === '$') { if (text[k + 1] === '$') k++; open = !open; }
  }
  return open;
}

/* Syntax-highlight overlay */
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function renderHighlight() {
  const t = src.value;
  let out = '';
  let open = false;
  let run = '';
  for (let k = 0; k < t.length; k++) {
    const c = t[k];
    if (c === '$' && t[k - 1] !== '\\') {
      const dbl = t[k + 1] === '$';
      const tok = dbl ? '$$' : '$';
      if (!open) { out += esc(run); run = ''; out += `<span class="m">${tok}`; open = true; }
      else { out += esc(run) + `${tok}</span>`; run = ''; open = false; }
      if (dbl) k++;
      continue;
    }
    run += c;
  }
  out += esc(run) + (open ? '</span>' : '');
  hl.innerHTML = out + '\n';
  src.style.height = `${hl.offsetHeight}px`;
}

/* Snippets with tab stops */
function parseBody(body) {
  // Supports $1, $0 and ${1:default}.
  let text = '';
  const stops = {};
  const re = /\$\{(\d):([^}]*)\}|\$(\d)/g;
  let last = 0;
  let m;
  while ((m = re.exec(body))) {
    text += body.slice(last, m.index);
    const n = m[1] ?? m[3];
    const def = m[2] ?? '';
    stops[n] = { start: text.length, end: text.length + def.length };
    text += def;
    last = re.lastIndex;
  }
  text += body.slice(last);
  const order = Object.keys(stops).filter((n) => n !== '0').sort();
  if (stops['0']) order.push('0');
  else stops['0'] = { start: text.length, end: text.length }, order.push('0');
  return { text, stops: order.map((n) => stops[n]) };
}

function insertSnippet(body, from, to) {
  const { text, stops } = parseBody(body);
  src.setRangeText(text, from, to, 'end');
  // Shift any outer snippet's pending stops past the inserted text.
  const delta = text.length - (to - from);
  const outer = state.stops.map((s) => (s.start >= from ? { start: s.start + delta, end: s.end + delta } : s));
  const abs = stops.map((s) => ({ start: from + s.start, end: from + s.end }));
  // A nested snippet's final stop is redundant when an outer snippet is still active.
  if (outer.length) abs.pop();
  const first = abs.shift() || { start: from + text.length, end: from + text.length };
  src.setSelectionRange(first.start, first.end);
  state.stops = abs.concat(outer);
  state.prevLen = src.value.length;
  renderHighlight();
}

function flash(label) {
  const f = $('#snipFlash');
  const r = $('#srcPane').getBoundingClientRect();
  f.textContent = label;
  f.style.left = `${r.right - 12 + window.scrollX}px`;
  f.style.top = `${r.top + 10 + window.scrollY}px`;
  f.style.translate = '-100% 0';
  f.classList.add('show');
  clearTimeout(flash.t);
  flash.t = setTimeout(() => f.classList.remove('show'), 900);
}

src.addEventListener('beforeinput', () => { state.beforeSel = src.selectionStart; state.prevLen = src.value.length; });
src.addEventListener('input', (e) => {
  // Keep pending tab stops pointing at the right place as the user types.
  const delta = src.value.length - state.prevLen;
  if (delta) state.stops.forEach((s) => { if (s.start >= state.beforeSel) { s.start += delta; s.end += delta; } });
  state.prevLen = src.value.length;

  if (e.inputType === 'insertText') {
    const pos = src.selectionStart;
    const before = src.value.slice(0, pos);
    const hit = [...SNIPPETS].sort((a, b) => b.trig.length - a.trig.length).find((s) => {
      if (!before.endsWith(s.trig)) return false;
      const m = inMath(src.value, pos - s.trig.length);
      return s.ctx === 'math' ? m : !m;
    });
    if (hit) {
      insertSnippet(hit.body, pos - hit.trig.length, pos);
      flash(`${hit.trig} → ${parseBody(hit.body).text.trim()}`);
      if (hit.trig === 'ff') mark('snippet');
      return;
    }
  }
  renderHighlight();
});

src.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const next = state.stops.shift();
    if (next) src.setSelectionRange(next.start, next.end);
  }
});

/* Toolbar buttons insert the same snippets (wrapped in $…$ when needed) */
document.querySelectorAll('#nxTools [data-ins]').forEach((b) => {
  b.onclick = () => {
    const s = src.selectionStart, e = src.selectionEnd;
    const body = inMath(src.value, s) ? b.dataset.ins : `$${b.dataset.ins}$`;
    src.focus();
    insertSnippet(`${body}$0`, s, e);
  };
});

/* Symbols palette */
const symWrap = $('#symbols');
SYMBOLS.forEach(([glyph, cmd]) => {
  const b = document.createElement('button');
  b.textContent = glyph;
  b.title = cmd;
  b.onclick = () => {
    const s = src.selectionStart;
    const ins = inMath(src.value, s) ? `${cmd} ` : `$${cmd}$`;
    src.focus();
    src.setRangeText(ins, s, src.selectionEnd, 'end');
    state.prevLen = src.value.length;
    renderHighlight();
  };
  symWrap.appendChild(b);
});
$('#symBtn').onclick = () => {
  const open = !symWrap.classList.contains('open');
  symWrap.classList.toggle('open', open);
  $('#symBtn').classList.toggle('on', open);
};

/* Preview */
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
function renderPreview() {
  const t = src.value;
  let html = '';
  let last = 0;
  for (const m of t.matchAll(MATH_RE)) {
    html += esc(t.slice(last, m.index));
    const tex = m[1] ?? m[2];
    try {
      html += katex.renderToString(tex, { displayMode: m[1] != null, throwOnError: true });
    } catch (err) {
      html += `<span class="err">${esc(err.message.replace('KaTeX parse error: ', ''))}</span>`;
    }
    last = m.index + m[0].length;
  }
  html += esc(t.slice(last));
  pv.innerHTML = html.trim() ? html : '';
}

/* Insert into Quill */
function insertIntoQuill() {
  const t = src.value;
  if (!t.trim()) { closeEditor(true); return; }
  let i = state.savedRange.index;
  let last = 0;
  for (const m of t.matchAll(MATH_RE)) {
    const plain = t.slice(last, m.index);
    if (plain) { quill.insertText(i, plain, 'user'); i += plain.length; }
    const display = m[1] != null;
    if (display) { quill.insertText(i, '\n', 'user'); i += 1; }
    quill.insertEmbed(i, 'formula', (m[1] ?? m[2]).trim(), 'user'); i += 1;
    if (display) { quill.insertText(i, '\n', 'user'); i += 1; }
    last = m.index + m[0].length;
  }
  const tail = t.slice(last);
  if (tail) { quill.insertText(i, tail, 'user'); i += tail.length; }
  state.savedRange = { index: i, length: 0 };
  src.value = '';
  state.stops = [];
  renderHighlight();
  closeEditor(true);
  mark('insert');
  toast('Inserted into your reply');
}
$('#insertBtn').onclick = insertIntoQuill;

/* Global keys: Ctrl+M opens, Esc closes, Ctrl+Enter inserts */
document.addEventListener('keydown', (e) => {
  const open = nx.classList.contains('open');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
    if (open) { e.preventDefault(); closeEditor(true); }
    else if (state.enabled && quill.hasFocus()) { e.preventDefault(); openEditor(); }
    return;
  }
  if (!open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeEditor(true); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); insertIntoQuill(); }
});

/* Clicking outside closes the editor but keeps the draft */
document.addEventListener('mousedown', (e) => {
  if (nx.classList.contains('open') && !nx.contains(e.target) && !e.target.closest('#fxBtn')) closeEditor(false);
});

renderHighlight();
