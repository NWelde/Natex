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

import { toClipboard } from '../src/core/insert-plan.js';

test('clipboard: inline content pastes without paragraphs', () => {
  const { html } = toClipboard(parse('so $x<1$ is \\$5'));
  assert.equal(html, 'so <span class="ql-formula" data-value="x&lt;1"></span> is $5');
});

test('clipboard: display math gets a centered paragraph', () => {
  const { html } = toClipboard(parse('see $$y$$ next'));
  assert.equal(html,
    '<p>see </p><p class="ql-align-center"><span class="ql-formula" data-value="\\displaystyle y"></span></p><p>next</p>');
});

test('clipboard: newlines in text become paragraphs', () => {
  assert.equal(toClipboard(parse('a\nb')).html, '<p>a</p><p>b</p>');
});

import { singleFormula } from '../src/core/insert-plan.js';
import { formulaSource } from '../src/core/render.js';

test('singleFormula: one formula, whitespace around it allowed', () => {
  assert.equal(singleFormula(parse(' $x^2$\n')), 'x^2');
  assert.equal(singleFormula(parse('$$y$$')), '\\displaystyle y');
});

test('singleFormula: anything else is not a single formula', () => {
  assert.equal(singleFormula(parse('a $x$')), null);
  assert.equal(singleFormula(parse('$x$ $y$')), null);
  assert.equal(singleFormula(parse('$x')), null);
  assert.equal(singleFormula(parse('$ $')), null);
  assert.equal(singleFormula(parse('')), null);
});

test('formulaSource round-trips formula values', () => {
  assert.equal(formulaSource('x^2'), '$x^2$');
  assert.equal(formulaSource('\\displaystyle \\frac{a}{b}'), '$$\\frac{a}{b}$$');
  for (const src of ['$\\pi r^2$', '$$\\sum_i i$$']) {
    assert.equal(formulaSource(singleFormula(parse(src))), src);
  }
});
