// The user's panel hotkey, kept in sync with settings while the page is open.

import { HOTKEY_KEY, DEFAULT_HOTKEY, toHotkey, matches, hotkeyText } from '../core/hotkey.js';

const sync = globalThis.chrome?.storage?.sync; // missing on the dev harness pages
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
let current = DEFAULT_HOTKEY;
const listeners = new Set();

/** Whether a keydown is the user's hotkey. */
export const isHotkey = (e) => matches(e, current);

/** "Ctrl+M", for tooltips. */
export const currentHotkeyText = () => hotkeyText(current, mac);

/** Calls `fn` whenever the hotkey changes (including the first load from storage). */
export function onHotkeyChange(fn) { listeners.add(fn); }

function set(value) {
  current = toHotkey(value);
  listeners.forEach((fn) => fn());
}

if (sync) {
  sync.get(HOTKEY_KEY).then((items) => set(items[HOTKEY_KEY])).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[HOTKEY_KEY]) set(changes[HOTKEY_KEY].newValue);
  });
}
