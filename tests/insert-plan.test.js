import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/segments.js';
import { toDeltaOps } from '../src/core/insert-plan.js';

test('mixed text and inline math', () => {
  const { ops, length } = toDeltaOps(parse('so $x$ is \\$5'));
  assert.deepEqual(ops, [{ insert: 'so ' }, { insert: { formula: 'x' } }, { insert: ' is $5' }]);
  assert.equal(length, 3 + 1 + 6);
});

test('display math gets its own centered line', () => {
  const { ops, length } = toDeltaOps(parse('see $$y$$ next'), { prevChar: 'a' });
  assert.deepEqual(ops, [
    { insert: 'see ' },
    { insert: '\n' },
    { insert: { formula: '\\displaystyle y' } },
    { insert: '\n', attributes: { align: 'center' } },
    { insert: 'next' },
  ]);
  assert.equal(length, 4 + 1 + 2 + 4);
});

test('no extra newline at line start, and none doubled after display', () => {
  const { ops } = toDeltaOps(parse('$$y$$\nafter'), { prevChar: '\n' });
  assert.deepEqual(ops, [
    { insert: { formula: '\\displaystyle y' } },
    { insert: '\n', attributes: { align: 'center' } },
    { insert: 'after' },
  ]);
});

test('empty math is skipped', () => {
  assert.deepEqual(toDeltaOps(parse('a $ $ b')).ops, [{ insert: 'a ' }, { insert: ' b' }]);
});
