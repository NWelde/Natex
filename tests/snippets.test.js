import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SNIPPETS, parseBody, findTrigger, shiftStops, toSnippets, triggerError, upsertSnippet } from '../src/core/snippets.js';

const at = (src) => findTrigger(src, src.length, DEFAULT_SNIPPETS)?.trig ?? null;

test('body: numbered stops in order, $0 last, defaults preselected', () => {
  assert.deepEqual(parseBody('\\frac{$1}{$2}$0'), { text: '\\frac{}{}', stops: [{ start: 6, end: 6 }, { start: 8, end: 8 }, { start: 9, end: 9 }] });
  const { text, stops } = parseBody('\\sum_{${1:n=1}}^{${2:\\infty}} $0');
  assert.equal(text, '\\sum_{n=1}^{\\infty} ');
  assert.equal(text.slice(stops[0].start, stops[0].end), 'n=1');
  assert.equal(text.slice(stops[1].start, stops[1].end), '\\infty');
  assert.equal(stops.at(-1).start, text.length);
});

test('body: no $0 means the caret ends at the end; other $ are literal', () => {
  assert.deepEqual(parseBody('^{2}'), { text: '^{2}', stops: [{ start: 4, end: 4 }] });
  const mk = parseBody('$$1$$0');
  assert.equal(mk.text, '$$');
  assert.deepEqual(mk.stops, [{ start: 1, end: 1 }, { start: 2, end: 2 }]);
  assert.equal(parseBody('$$$1$$$0').text, '$$$$');
  assert.equal(parseBody('$10 and $2').stops.length, 3);
});

test('math triggers fire only inside math', () => {
  assert.equal(at('$ff'), 'ff');
  assert.equal(at('area $x + ff'), 'ff');
  assert.equal(at('stuff ff'), null);
  assert.equal(at('$x$ ff'), null);
  assert.equal(at('$$sum'), 'sum');
});

test('typing a command name never triggers', () => {
  assert.equal(at('$\\sq'), null);
  assert.equal(at('$\\sum'), null);
  assert.equal(at('$\\lim'), null);
  assert.equal(at('$x\\,sq'), 'sq');
});

test('text triggers fire at a word start outside math', () => {
  assert.equal(at('mk'), 'mk');
  assert.equal(at('so mk'), 'mk');
  assert.equal(at('bookmk'), null);
  assert.equal(at('$mk'), null);
  assert.equal(at('see dm'), 'dm');
});

test('longest trigger wins', () => {
  const list = [{ trig: 'in', body: '\\in', ctx: 'math' }, { trig: 'nin', body: '\\notin', ctx: 'math' }];
  assert.equal(findTrigger('$x nin', 6, list).trig, 'nin');
});

test('stops move with edits before them and collapse when deleted', () => {
  const stops = [{ start: 6, end: 6 }, { start: 8, end: 9 }];
  assert.deepEqual(shiftStops(stops, 6, 0, 3), [{ start: 9, end: 9 }, { start: 11, end: 12 }]);
  assert.deepEqual(shiftStops(stops, 2, 1, 0), [{ start: 5, end: 5 }, { start: 7, end: 8 }]);
  assert.deepEqual(shiftStops(stops, 10, 0, 1), stops);
  assert.deepEqual(shiftStops([{ start: 5, end: 8 }], 4, 6, 1), [{ start: 5, end: 5 }]);
});

test('stored shortcuts are normalized', () => {
  assert.equal(toSnippets(undefined), DEFAULT_SNIPPETS);
  assert.deepEqual(toSnippets([]), []);
  assert.deepEqual(toSnippets([
    { trig: ' ab ', body: 'x', ctx: 'weird' },
    { trig: 'ab', body: 'dup' },
    { trig: 'a b', body: 'x' },
    { trig: 'c', body: '' },
    null,
  ]), [{ trig: 'ab', body: 'x', ctx: 'math' }]);
});

test('trigger validation explains the problem', () => {
  assert.equal(triggerError('ff'), null);
  assert.match(triggerError(''), /Type a trigger/);
  assert.match(triggerError('a b'), /spaces/);
  assert.match(triggerError('\\a'), /\$ or/);
  assert.match(triggerError('x'.repeat(13)), /12/);
});

test('upsert adds at the end, replaces in place, and renames', () => {
  const list = [{ trig: 'a', body: '1', ctx: 'math' }, { trig: 'b', body: '2', ctx: 'math' }];
  assert.deepEqual(upsertSnippet(list, { trig: 'c', body: '3', ctx: 'math' }).map((s) => s.trig), ['a', 'b', 'c']);
  assert.deepEqual(upsertSnippet(list, { trig: 'a', body: '9', ctx: 'text' })[0], { trig: 'a', body: '9', ctx: 'text' });
  assert.deepEqual(upsertSnippet(list, { trig: 'z', body: '1', ctx: 'math' }, 'a').map((s) => s.trig), ['z', 'b']);
});

test('shortcuts fire inside \\(…\\) too', () => {
  assert.equal(at('\\(ff'), 'ff');
  assert.equal(at('\\[x + sq'), 'sq');
  assert.equal(at('\\(x\\) ff'), null);
});
