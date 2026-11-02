// Drafts: the panel's source text, saved per page + text box so it survives
// closing the panel and reloading the page. Stored in chrome.storage.local
// (localStorage on the dev harness pages, which run without the extension).

import { EDITOR_ID_ATTR } from '../core/protocol.js';
import { alive } from './lifecycle.js';

const PREFIX = 'natex:draft:';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // older drafts are dropped when read

const area = globalThis.chrome?.storage?.local ?? {
  async get(key) {
    const raw = localStorage.getItem(key);
    return raw == null ? {} : { [key]: JSON.parse(raw) };
  },
  async set(items) { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, JSON.stringify(v)); },
  async remove(key) { localStorage.removeItem(key); },
};

/** The page the user sees. The editor may sit in an (about:blank) iframe, so prefer the top page's URL. */
function pageUrl() {
  try {
    return top.location.origin + top.location.pathname + top.location.search;
  } catch {
    return location.origin + location.pathname + location.search;
  }
}

/** Which iframe of its parent this frame is ('' in the top frame). */
function framePath() {
  if (window === top) return '';
  try { return `/f${[...Array(parent.frames.length).keys()].findIndex((i) => parent.frames[i] === window)}`; } catch { return '/f?'; }
}

/** Storage key for an editor: page URL, frame, and the editor's position among the page's Quill editors. */
export function draftKey(editorId) {
  const editors = [...document.querySelectorAll('.ql-container')];
  const index = editors.findIndex((c) => c.getAttribute(EDITOR_ID_ATTR) === editorId);
  return `${PREFIX}${pageUrl()}${framePath()}#${index}`;
}

/** @returns {Promise<string>} the saved draft, or '' */
export async function loadDraft(key) {
  if (!alive()) return '';
  try {
    const draft = (await area.get(key))[key];
    if (!draft) return '';
    if (Date.now() - draft.savedAt > MAX_AGE) { clearDraft(key); return ''; }
    return draft.text || '';
  } catch (err) {
    console.warn('[Natex] could not read draft:', err.message);
    return '';
  }
}

export function saveDraft(key, text) {
  if (!alive()) return;
  // chrome.storage throws synchronously when the extension context is gone, and rejects on other failures.
  try {
    const op = text.trim() ? area.set({ [key]: { text, savedAt: Date.now() } }) : area.remove(key);
    op.catch?.((err) => console.warn('[Natex] could not save draft:', err.message));
  } catch (_) { /* extension reloaded; alive() shuts this instance down next time */ }
}

export function clearDraft(key) {
  if (!alive()) return;
  try { area.remove(key).catch?.(() => {}); } catch (_) {}
}
