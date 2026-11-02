import { test } from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { parse } from '../src/core/segments.js';
import { renderAll, formulaValue } from '../src/core/render.js';

const run = (src, lastGood = []) => renderAll(parse(src), katex, lastGood);

test('renders text and math', () => {
  const { parts, errors } = run('area $\\pi r^2$');
  assert.equal(errors.length, 0);
  assert.deepEqual(parts.map((p) => p.kind), ['text', 'math']);
  assert.match(parts[1].html, /katex/);
});

test('display math uses \\displaystyle', () => {
  const [seg] = parse('$$ \\sum x $$');
  assert.equal(formulaValue(seg), '\\displaystyle \\sum x');
});

test('error position maps back to the source', () => {
  const src = 'x $\\frac{1}{2$';
  const { errors } = run(src);
  assert.equal(errors.length, 1);
  const e = errors[0];
  assert.ok(e.at >= 3 && e.at < src.length - 1, `error at ${e.at}`);
});

test('unknown command is located', () => {
  const src = '$a + \\badcmd$';
  const { errors } = run(src);
  assert.equal(src.slice(errors[0].at, errors[0].at + errors[0].length), '\\badcmd');
});

test('display-math error position accounts for the prefix', () => {
  const src = '$$ \\badcmd $$';
  const { errors } = run(src);
  assert.equal(src.slice(errors[0].at, errors[0].at + errors[0].length), '\\badcmd');
});

test('unclosed $ is an error but still previews', () => {
  const { parts, errors } = run('$x^2');
  assert.match(parts[0].html, /katex/);
  assert.deepEqual(errors.map((e) => e.message), ['Missing closing $']);
});

test('broken formula keeps the last good render, marked stale', () => {
  const lastGood = [];
  run('$\\frac{1}{2}$', lastGood);
  const { parts, errors } = run('$\\frac{1}{2$', lastGood);
  assert.equal(errors.length, 1);
  assert.equal(parts[0].stale, true);
  assert.equal(parts[0].html, lastGood[0]);
});

test('broken formula with no history has no html', () => {
  const { parts } = run('$\\frac{$');
  assert.equal(parts[0].html, null);
  assert.equal(parts[0].stale, false);
});

test('preview drops the separator after display math, like the insert does', () => {
  const { parts } = run('$$y$$ done');
  assert.equal(parts[1].text, 'done');
});
