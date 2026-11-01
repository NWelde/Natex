const $ = (sel) => document.querySelector(sel);
const domainInput = $('#domain');
const listEl = $('#list');
const statusEl = $('#status');

// Default shortcuts (display only for now — mirrors prototype/prototype.js).
const SNIPPETS = [
  ['ff', '\\frac{a}{b}', 'math'],
  ['sq', '\\sqrt{x}', 'math'],
  ['sum', '\\sum_{n=1}^{\\infty}', 'math'],
  ['lim', '\\lim_{n \\to \\infty}', 'math'],
  ['pd', '\\frac{\\partial f}{\\partial x}', 'math'],
  ['td', '^{x}', 'math'],
  ['sr', '^{2}', 'math'],
  ['mk', '$ … $', 'text'],
];

function setStatus(msg, isErr = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('err', isErr);
}

function normalizeToOriginPattern(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\s+/g, '')
    .replace(/\/.*/, '');
  if (!cleaned) throw new Error('Enter a domain like canvas.instructure.com');
  return `https://${cleaned}/*`;
}

const prettyHost = (pattern) => pattern.replace(/^https?:\/\//, '').replace(/\/\*$/, '');

async function getAllowedOrigins() {
  const { allowedOrigins = [] } = await chrome.storage.sync.get({ allowedOrigins: [] });
  return Array.isArray(allowedOrigins) ? allowedOrigins : [];
}

async function setAllowedOrigins(allowedOrigins) {
  await chrome.storage.sync.set({ allowedOrigins });
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function render() {
  const allowed = await getAllowedOrigins();
  listEl.replaceChildren();
  if (allowed.length === 0) {
    listEl.appendChild(el('div', 'empty', 'No sites yet. Add one above, or click the η icon on a page and choose “Enable Natex here”.'));
    return;
  }
  for (const pattern of allowed) {
    const row = el('div', 'row');
    const name = el('div', 'grow', prettyHost(pattern));
    const remove = el('button', 'btn-ghost', 'Remove');
    remove.addEventListener('click', async () => {
      await setAllowedOrigins((await getAllowedOrigins()).filter((x) => x !== pattern));
      try { await chrome.permissions.remove({ origins: [pattern] }); } catch (_) {}
      setStatus(`Removed ${prettyHost(pattern)}`);
      render();
    });
    row.append(el('span', 'site-dot'), name, remove);
    listEl.appendChild(row);
  }
}

function renderSnippets() {
  const wrap = $('#snippets');
  for (const [trig, body, ctx] of SNIPPETS) {
    const row = el('div', 'row');
    const mid = el('div', 'grow');
    mid.appendChild(el('div', 'body', body));
    row.append(el('span', 'trig', trig), mid, el('span', 'ctx', ctx === 'math' ? 'in math' : 'in text'));
    wrap.appendChild(row);
  }
}

async function addSite() {
  let pattern;
  try {
    pattern = normalizeToOriginPattern(domainInput.value);
  } catch (e) {
    return setStatus(e.message, true);
  }
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) return setStatus('Chrome permission was not granted.', true);
  const allowed = await getAllowedOrigins();
  if (!allowed.includes(pattern)) await setAllowedOrigins([...allowed, pattern]);
  domainInput.value = '';
  setStatus(`Natex is on for ${prettyHost(pattern)}`);
  render();
}

$('#add').addEventListener('click', addSite);
domainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSite(); });

render();
renderSnippets();
