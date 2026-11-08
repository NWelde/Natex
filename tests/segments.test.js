import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, inMath, unescapeDollar } from '../src/core/segments.js';

const kinds = (s) => parse(s).map((x) => (x.kind === 'text' ? `T:${x.value}` : `${x.display ? 'D' : 'M'}:${x.tex}${x.closed ? '' : '!'}`));

test('plain text', () => assert.deepEqual(kinds('hello'), ['T:hello']));
test('inline and display math', () => {
  assert.deepEqual(kinds('a $x^2$ b $$y$$ c'), ['T:a ', 'M:x^2', 'T: b ', 'D:y', 'T: c']);
});
test('escaped dollar is text', () => {
  assert.deepEqual(kinds('costs \\$5 and $x$'), ['T:costs \\$5 and ', 'M:x']);
  assert.equal(unescapeDollar('costs \\$5'), 'costs $5');
});
test('escaped dollar inside math does not close it', () => {
  assert.deepEqual(kinds('$a\\$b$'), ['M:a\\$b']);
});
test('unclosed delimiters', () => {
  assert.deepEqual(kinds('x $\\frac{1}{2}'), ['T:x ', 'M:\\frac{1}{2}!']);
  assert.deepEqual(kinds('$$y'), ['D:y!']);
});
test('display math right after text', () => assert.deepEqual(kinds('so$$x$$'), ['T:so', 'D:x']));
test('empty math', () => assert.deepEqual(kinds('$$$$'), ['D:']));
test('offsets point into the source', () => {
  const [, m] = parse('a $x+y$');
  assert.equal('a $x+y$'.slice(m.texStart, m.texEnd), 'x+y');
  assert.equal(m.start, 2);
  assert.equal(m.end, 7);
});
test('inMath', () => {
  const s = 'a $x$ b';
  assert.equal(inMath(s, 0), false);
  assert.equal(inMath(s, 3), true);
  assert.equal(inMath(s, 6), false);
});

test('LaTeX delimiters \\(…\\) and \\[…\\]', () => {
  assert.deepEqual(kinds('a \\(x^2\\) b \\[y\\] c'), ['T:a ', 'M:x^2', 'T: b ', 'D:y', 'T: c']);
  assert.deepEqual(kinds('mixed $a$ and \\(b\\)'), ['T:mixed ', 'M:a', 'T: and ', 'M:b']);
  assert.deepEqual(kinds('\\(f(x)\\)'), ['M:f(x)']);
  assert.deepEqual(kinds('\\[\\begin{matrix} a \\\\[2pt] b \\end{matrix}\\]'), ['D:\\begin{matrix} a \\\\[2pt] b \\end{matrix}']);
  assert.deepEqual(kinds('\\(x'), ['M:x!']);
  assert.deepEqual(kinds('line \\\\(not math)'), ['T:line \\\\(not math)']);
  assert.ok(inMath('\\(ab\\)', 3));
});
