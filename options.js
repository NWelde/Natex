// Settings page. Bundled to dist/options.js (see build.mjs).

import { HOTKEY_KEY, DEFAULT_HOTKEY, toHotkey, hotkeyLabels, hotkeyFromEvent, sameHotkey } from './src/core/hotkey.js';

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
