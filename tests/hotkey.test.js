import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOTKEY, matches, hotkeyFromEvent, hotkeyLabels, toHotkey } from '../src/core/hotkey.js';

const ev = (code, key, mods = {}) => ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('default is Ctrl+M and matches by physical key', () => {
  assert.ok(matches(ev('KeyM', 'm', { ctrlKey: true }), DEFAULT_HOTKEY));
  assert.ok(!matches(ev('KeyM', 'm', { ctrlKey: true, shiftKey: true }), DEFAULT_HOTKEY));
  assert.ok(!matches(ev('KeyM', 'm'), DEFAULT_HOTKEY));
  assert.deepEqual(hotkeyLabels(DEFAULT_HOTKEY), ['Ctrl', 'M']);
});

test('recording: Alt+Option produces odd characters but the key name comes from code', () => {
  const { hotkey } = hotkeyFromEvent(ev('KeyL', 'ł', { altKey: true }));
  assert.ok(matches(ev('KeyL', '¬', { altKey: true }), hotkey));
  assert.deepEqual(hotkeyLabels(hotkey), ['Alt', 'L']);
  assert.deepEqual(hotkeyLabels(hotkey, true), ['⌥', 'L']);
});

test('recording: modifiers alone keep listening; bad combos explain why', () => {
  assert.equal(hotkeyFromEvent(ev('ControlLeft', 'Control', { ctrlKey: true })), null);
  assert.match(hotkeyFromEvent(ev('KeyK', 'k')).error, /Hold Ctrl/);
  assert.match(hotkeyFromEvent(ev('KeyK', 'K', { shiftKey: true })).error, /Hold Ctrl/);
  assert.match(hotkeyFromEvent(ev('KeyC', 'c', { ctrlKey: true })).error, /copy/);
  assert.match(hotkeyFromEvent(ev('KeyC', 'C', { ctrlKey: true, shiftKey: true })).error, /developer tools/);
  assert.match(hotkeyFromEvent(ev('Enter', 'Enter', { ctrlKey: true })).error, /inside the Natex editor/);
  assert.deepEqual(hotkeyFromEvent(ev('KeyE', 'E', { ctrlKey: true, shiftKey: true })).hotkey,
    { code: 'KeyE', key: 'E', ctrl: true, alt: false, shift: true, meta: false });
});

test('stored values are normalized', () => {
  assert.equal(toHotkey(undefined), DEFAULT_HOTKEY);
  assert.equal(toHotkey({ key: 'x' }), DEFAULT_HOTKEY);
  assert.deepEqual(toHotkey({ code: 'Period', ctrl: 1 }), { code: 'Period', key: 'Period', ctrl: true, alt: false, shift: false, meta: false });
  assert.deepEqual(hotkeyLabels(toHotkey({ code: 'Period', ctrl: true })), ['Ctrl', '.']);
});
