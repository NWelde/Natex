// Settings page. Bundled to dist/options.js (see build.mjs).

import { HOTKEY_KEY, DEFAULT_HOTKEY, toHotkey, hotkeyLabels, hotkeyFromEvent, sameHotkey } from './src/core/hotkey.js';
import { SNIPPETS_KEY, DEFAULT_SNIPPETS, toSnippets, triggerError, upsertSnippet, bodyPreview } from './src/core/snippets.js';

const $ = (sel) => document.querySelector(sel);
const domainInput = $('#domain');
const listEl = $('#list');
const statusEl = $('#status');

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

/* Hotkey */

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const hotkeyEls = { row: $('#hotkeyRow'), keys: $('#hotkeyKeys'), note: $('#hotkeyNote'), change: $('#hotkeyChange'), reset: $('#hotkeyReset') };
const HOTKEY_NOTE = hotkeyEls.note.textContent;
let hotkey = DEFAULT_HOTKEY;
let recording = false;

function showKeys(labels) {
  hotkeyEls.keys.replaceChildren(...labels.map((k) => el('kbd', null, k)));
}

function renderHotkey() {
  showKeys(hotkeyLabels(hotkey, mac));
  hotkeyEls.reset.hidden = sameHotkey(hotkey, DEFAULT_HOTKEY);
}

function setNote(text = HOTKEY_NOTE, isErr = false) {
  hotkeyEls.note.textContent = text;
  hotkeyEls.note.classList.toggle('err', isErr);
}

function startRecording() {
  recording = true;
  hotkeyEls.row.classList.add('recording');
  hotkeyEls.change.textContent = 'Cancel';
  hotkeyEls.keys.replaceChildren(el('span', 'listening', 'Press the new keys…'));
  setNote('Hold Ctrl, Alt or ⌘ and press a key. Esc cancels.');
}

function stopRecording() {
  recording = false;
  hotkeyEls.row.classList.remove('recording');
  hotkeyEls.change.textContent = 'Change';
  renderHotkey();
}

async function saveHotkey(next) {
  await chrome.storage.sync.set({ [HOTKEY_KEY]: next });
  hotkey = next;
  stopRecording();
  setNote(`Saved. Open tabs pick it up right away.`);
}

window.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    stopRecording();
    setNote();
    return;
  }
  const result = hotkeyFromEvent(e);
  if (!result) {
    // Only modifiers so far: show them as they're held.
    showKeys(hotkeyLabels({ code: '', key: '…', ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }, mac));
    return;
  }
  if (result.error) { setNote(result.error, true); return; }
  saveHotkey(result.hotkey);
}, true);

hotkeyEls.change.addEventListener('click', () => {
  if (recording) { stopRecording(); setNote(); } else startRecording();
});
hotkeyEls.reset.addEventListener('click', () => saveHotkey(DEFAULT_HOTKEY));
// Losing focus mid-recording (e.g. switching windows) cancels it.
window.addEventListener('blur', () => { if (recording) { stopRecording(); setNote(); } });

chrome.storage.sync.get(HOTKEY_KEY).then((items) => { hotkey = toHotkey(items[HOTKEY_KEY]); renderHotkey(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[HOTKEY_KEY] && !recording) { hotkey = toHotkey(changes[HOTKEY_KEY].newValue); renderHotkey(); }
});

render();

/* Shortcuts */

const snip = {
  trig: $('#snipTrig'), body: $('#snipBody'), ctx: $('#snipCtx'), save: $('#snipSave'), cancel: $('#snipCancel'),
  list: $('#snipList'), status: $('#snipStatus'), count: $('#snipCount'), reset: $('#snipReset'),
};
let snippets = DEFAULT_SNIPPETS;
let editingTrig = null; // trigger of the row being edited, or null when adding
let flashTrig = null; // row to animate after the next render

function snipStatus(msg = '', isErr = false) {
  snip.status.textContent = msg;
  snip.status.classList.toggle('err', isErr);
}

async function saveSnippets(next, msg) {
  try {
    await chrome.storage.sync.set({ [SNIPPETS_KEY]: next });
  } catch (err) {
    return snipStatus(/QUOTA/i.test(err.message) ? 'Too many shortcuts to sync. Remove a few and try again.' : `Couldn't save: ${err.message}`, true);
  }
  snippets = next;
  renderSnippets();
  if (msg) snipStatus(msg);
}

function renderSnippets() {
  snip.count.textContent = String(snippets.length);
  snip.list.replaceChildren();
  if (!snippets.length) {
    snip.list.appendChild(el('div', 'empty', 'No shortcuts. Add one above, or restore the defaults.'));
  }
  for (const s of snippets) {
    const row = el('div', 'row');
    row.classList.toggle('editing', s.trig === editingTrig);
    row.classList.toggle('flash', s.trig === flashTrig);
    const mid = el('div', 'grow');
    const body = el('div', 'body', s.body);
    body.title = bodyPreview(s.body);
    mid.appendChild(body);
    const edit = el('button', 'btn-ghost', 'Edit');
    edit.addEventListener('click', () => startEdit(s));
    const remove = el('button', 'btn-ghost', 'Remove');
    remove.addEventListener('click', () => {
      if (editingTrig === s.trig) stopEdit();
      saveSnippets(snippets.filter((x) => x.trig !== s.trig), `Removed ${s.trig}`);
    });
    row.append(el('span', 'trig', s.trig), mid, el('span', 'ctx', s.ctx === 'math' ? 'in math' : 'in text'), edit, remove);
    snip.list.appendChild(row);
  }
  flashTrig = null;
}

function startEdit(s) {
  editingTrig = s.trig;
  snip.trig.value = s.trig;
  snip.body.value = s.body;
  snip.ctx.value = s.ctx;
  snip.save.textContent = 'Save';
  snip.cancel.hidden = false;
  snipStatus(`Editing ${s.trig}`);
  renderSnippets();
  snip.body.focus();
  snip.body.select();
}

function stopEdit() {
  editingTrig = null;
  snip.trig.value = snip.body.value = '';
  snip.ctx.value = 'math';
  snip.save.textContent = 'Add';
  snip.cancel.hidden = true;
  renderSnippets();
}

async function submitSnippet() {
  const trig = snip.trig.value.trim();
  const body = snip.body.value;
  const err = triggerError(trig);
  if (err) { snipStatus(err, true); snip.trig.focus(); return; }
  if (!body.trim()) { snipStatus('Type what the trigger expands to.', true); snip.body.focus(); return; }
  const clash = snippets.find((s) => s.trig === trig);
  const replacing = editingTrig ?? trig;
  const verb = editingTrig || clash ? 'Updated' : 'Added';
  const next = upsertSnippet(snippets, { trig, body, ctx: snip.ctx.value === 'text' ? 'text' : 'math' }, replacing);
  flashTrig = trig;
  editingTrig = null;
  await saveSnippets(next, `${verb} ${trig}. Open tabs pick it up right away.`);
  stopEdit();
  snip.trig.focus();
}

snip.save.addEventListener('click', submitSnippet);
snip.cancel.addEventListener('click', () => { stopEdit(); snipStatus(); });
for (const input of [snip.trig, snip.body, snip.ctx]) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitSnippet(); }
    else if (e.key === 'Escape' && editingTrig) { stopEdit(); snipStatus(); }
  });
}
// Typing a trigger that already exists says so, so nobody overwrites one by accident.
snip.trig.addEventListener('input', () => {
  const t = snip.trig.value.trim();
  const existing = !editingTrig && snippets.find((s) => s.trig === t);
  snip.save.textContent = editingTrig || existing ? 'Save' : 'Add';
  snipStatus(existing ? `${t} already exists — saving replaces it.` : '');
});
snip.reset.addEventListener('click', (e) => {
  e.preventDefault();
  stopEdit();
  const custom = snippets.filter((s) => !DEFAULT_SNIPPETS.some((d) => d.trig === s.trig));
  // Restoring keeps the user's own shortcuts and brings back any missing or changed defaults.
  saveSnippets([...DEFAULT_SNIPPETS, ...custom], 'Default shortcuts restored. Your own are kept.');
});

chrome.storage.sync.get(SNIPPETS_KEY).then((items) => { snippets = toSnippets(items[SNIPPETS_KEY]); renderSnippets(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[SNIPPETS_KEY]) { snippets = toSnippets(changes[SNIPPETS_KEY].newValue); renderSnippets(); }
});

// The popup's "Shortcuts" button opens settings at #shortcuts.
if (location.hash === '#shortcuts') {
  $('#shortcuts').scrollIntoView({ block: 'start' });
  snip.trig.focus();
}
