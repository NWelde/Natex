// The user's shortcuts, kept in sync with settings while the page is open.

import { SNIPPETS_KEY, DEFAULT_SNIPPETS, toSnippets } from '../core/snippets.js';

const sync = globalThis.chrome?.storage?.sync; // missing on the dev harness pages
let current = DEFAULT_SNIPPETS;

/** The shortcuts in effect right now. */
export const currentSnippets = () => current;

if (sync) {
  sync.get(SNIPPETS_KEY).then((items) => { current = toSnippets(items[SNIPPETS_KEY]); }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[SNIPPETS_KEY]) current = toSnippets(changes[SNIPPETS_KEY].newValue);
  });
}
