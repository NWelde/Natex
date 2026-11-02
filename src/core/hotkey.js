// The hotkey that opens (and closes) the Natex panel. Users can change it in
// settings; it's stored in chrome.storage.sync under HOTKEY_KEY. Pure, so the
// content script, settings page and popup all share one definition.

/** @typedef {{ code: string, key: string, ctrl: boolean, alt: boolean, shift: boolean, meta: boolean }} Hotkey */

export const HOTKEY_KEY = 'hotkey';

/** @type {Hotkey} */
export const DEFAULT_HOTKEY = { code: 'KeyM', key: 'M', ctrl: true, alt: false, shift: false, meta: false };

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

// Keys Natex itself uses inside the panel.
const PANEL_KEYS = new Set(['Enter', 'NumpadEnter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Space']);

// Ctrl/⌘ + these belong to the browser (pages can't catch them) or to text
// editing and Quill formatting, which users would lose.
const TAKEN = {
  KeyT: 'opening tabs', KeyN: 'new windows', KeyW: 'closing tabs', KeyR: 'reload', KeyL: 'the address bar',
  KeyA: 'select all', KeyC: 'copy', KeyV: 'paste', KeyX: 'cut', KeyZ: 'undo', KeyY: 'redo',
  KeyB: 'bold', KeyI: 'italic', KeyU: 'underline', KeyF: 'find', KeyP: 'print', KeyS: 'save',
};
const TAKEN_SHIFT = {
  KeyT: 'reopening tabs', KeyN: 'incognito windows', KeyW: 'closing windows', KeyQ: 'quitting Chrome',
  KeyB: 'the bookmarks bar', KeyI: 'developer tools', KeyJ: 'developer tools', KeyC: 'developer tools',
};

/** Normalizes stored data, falling back to the default. @returns {Hotkey} */
export function toHotkey(value) {
  if (!value || typeof value.code !== 'string' || !value.code) return DEFAULT_HOTKEY;
  return {
    code: value.code,
    key: String(value.key || value.code),
    ctrl: !!value.ctrl, alt: !!value.alt, shift: !!value.shift, meta: !!value.meta,
  };
}

/**
 * Whether a keydown is the hotkey. Matches on `code` (the physical key) so it
 * works whatever character the layout or Alt/Option produces.
 */
export function matches(e, hk) {
  return e.code === hk.code && e.ctrlKey === hk.ctrl && e.altKey === hk.alt && e.shiftKey === hk.shift && e.metaKey === hk.meta;
}

export const sameHotkey = (a, b) => ['code', 'ctrl', 'alt', 'shift', 'meta'].every((k) => a[k] === b[k]);

/** Key names for display, e.g. ['Ctrl', 'Shift', 'M']. */
export function hotkeyLabels(hk, mac = false) {
  const keys = [];
  if (hk.ctrl) keys.push(mac ? '⌃' : 'Ctrl');
  if (hk.alt) keys.push(mac ? '⌥' : 'Alt');
  if (hk.shift) keys.push(mac ? '⇧' : 'Shift');
  if (hk.meta) keys.push(mac ? '⌘' : 'Win');
  keys.push(keyName(hk));
  return keys;
}

/** "Ctrl+M", for tooltips. */
export const hotkeyText = (hk, mac = false) => hotkeyLabels(hk, mac).join(mac ? '' : '+');

function keyName({ code, key }) {
  const m = /^(?:Key|Digit|Numpad)(.+)$/.exec(code);
  if (m) return m[1];
  if (/^F\d+$/.test(code)) return code;
  const named = { Period: '.', Comma: ',', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[',
    BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return named[code] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/**
 * Reads a hotkey from a keydown while the user is recording one.
 * @returns {{ hotkey: Hotkey } | { error: string } | null}  null: only a modifier so far, keep listening
 */
export function hotkeyFromEvent(e) {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const hk = { code: e.code, key: e.key.length === 1 ? e.key.toUpperCase() : e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  if (!e.code) return { error: "That key can't be used." };
  if (!hk.ctrl && !hk.alt && !hk.meta) return { error: 'Hold Ctrl, Alt or ⌘ together with a key.' };
  if (PANEL_KEYS.has(e.code)) return { error: `${keyName(hk)} is used inside the Natex editor.` };
  const taken = (hk.ctrl || hk.meta) && !hk.alt && (hk.shift ? TAKEN_SHIFT : TAKEN)[e.code];
  if (taken) return { error: `${hotkeyText(hk)} is used for ${taken}. Try another key.` };
  return { hotkey: hk };
}
