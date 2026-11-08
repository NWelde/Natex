// Shortcuts: type a trigger (e.g. `ff` inside $…$) and it expands to a body
// with tab stops. Stored in chrome.storage.sync under SNIPPETS_KEY. Pure, so
// the panel, settings page and popup share one definition and it's testable.
//
// Body syntax: `$1`, `$2`… are tab stops in order, `${1:default}` is a stop
// with preselected text, `$0` is where the caret ends up (end of body if
// omitted). Any other `$` is literal.

import { inMath } from './segments.js';

/** @typedef {{ trig: string, body: string, ctx: 'math' | 'text' }} Snippet */
/** @typedef {{ start: number, end: number }} Stop */

export const SNIPPETS_KEY = 'snippets';
export const MAX_TRIGGER = 12;
export const MAX_SNIPPETS = 200;

/** @type {Snippet[]} */
export const DEFAULT_SNIPPETS = [
  { trig: 'ff', body: '\\frac{$1}{$2}$0', ctx: 'math' },
  { trig: 'sq', body: '\\sqrt{$1}$0', ctx: 'math' },
  { trig: 'sum', body: '\\sum_{${1:n=1}}^{${2:\\infty}} $0', ctx: 'math' },
  { trig: 'lim', body: '\\lim_{${1:n} \\to ${2:\\infty}} $0', ctx: 'math' },
  { trig: 'pd', body: '\\frac{\\partial $1}{\\partial $2}$0', ctx: 'math' },
  { trig: 'td', body: '^{$1}$0', ctx: 'math' },
  { trig: 'sr', body: '^{2}', ctx: 'math' },
  { trig: 'mk', body: '$$1$$0', ctx: 'text' },
  { trig: 'dm', body: '$$$1$$$0', ctx: 'text' },
];

/**
 * Checks a trigger typed in settings.
 * @returns {string | null} an error message, or null when it's fine
 */
export function triggerError(trig) {
  if (!trig) return 'Type a trigger, like ff.';
  if (/\s/.test(trig)) return "Triggers can't contain spaces.";
  if (trig.includes('$') || trig.includes('\\')) return "Triggers can't contain $ or \\.";
  if (trig.length > MAX_TRIGGER) return `Keep triggers to ${MAX_TRIGGER} characters or fewer.`;
  return null;
}

/** Normalizes stored data; anything unusable falls back to the defaults. @returns {Snippet[]} */
export function toSnippets(value) {
  if (!Array.isArray(value)) return DEFAULT_SNIPPETS;
  const seen = new Set();
  const out = [];
  for (const s of value) {
    const trig = String(s?.trig ?? '').trim();
    const body = String(s?.body ?? '');
    if (triggerError(trig) || !body || seen.has(trig)) continue;
    seen.add(trig);
    out.push({ trig, body, ctx: s.ctx === 'text' ? 'text' : 'math' });
    if (out.length >= MAX_SNIPPETS) break;
  }
  return out;
}

/** Adds or replaces (by trigger) a snippet, keeping list order. */
export function upsertSnippet(list, snip, replacing = snip.trig) {
  const i = list.findIndex((s) => s.trig === replacing);
  const rest = list.filter((s) => s.trig !== replacing && s.trig !== snip.trig);
  if (i < 0) return [...rest, snip];
  rest.splice(Math.min(i, rest.length), 0, snip);
  return rest;
}

/**
 * Expands a body into plain text plus tab stops (relative to the text start).
 * The last stop is always the final caret position.
 * @returns {{ text: string, stops: Stop[] }}
 */
export function parseBody(body) {
  let text = '';
  const stops = {};
  const re = /\$\{(\d+):([^}]*)\}|\$(\d+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(body))) {
    text += body.slice(last, m.index);
    const n = m[1] ?? m[3];
    const def = m[2] ?? '';
    stops[n] ??= { start: text.length, end: text.length + def.length };
    text += def;
    last = re.lastIndex;
  }
  text += body.slice(last);
  const order = Object.keys(stops).filter((n) => n !== '0').sort((a, b) => a - b);
  const final = stops['0'] ?? { start: text.length, end: text.length };
  return { text, stops: [...order.map((n) => stops[n]), final] };
}

/** Plain-text preview of a body, e.g. `\frac{}{}`. */
export const bodyPreview = (body) => parseBody(body).text;

/**
 * The snippet whose trigger was just typed, ending at caret `pos`. Longer
 * triggers win. Doesn't fire while a command name is being typed (`\sum`
 * never triggers `sum`).
 * @param {string} source
 * @param {number} pos
 * @param {Snippet[]} snippets
 * @returns {Snippet | null}
 */
export function findTrigger(source, pos, snippets) {
  const before = source.slice(0, pos);
  const sorted = [...snippets].sort((a, b) => b.trig.length - a.trig.length);
  for (const s of sorted) {
    if (!before.endsWith(s.trig)) continue;
    const start = pos - s.trig.length;
    if (/\\[A-Za-z]*$/.test(before.slice(0, start)) && /^[A-Za-z]/.test(s.trig)) continue;
    // A word trigger in text only fires at the start of a word ("mk", not "bookmk").
    if (s.ctx === 'text' && /[A-Za-z0-9]$/.test(before.slice(0, start)) && /^[A-Za-z0-9]/.test(s.trig)) continue;
    if (inMath(source, start) !== (s.ctx === 'math')) continue;
    return s;
  }
  return null;
}

/**
 * Moves pending stops after an edit that replaced [from, from + removed) with
 * `inserted` characters. Stops inside the edited range collapse to its end.
 * @param {Stop[]} stops
 */
export function shiftStops(stops, from, removed, inserted) {
  const delta = inserted - removed;
  const to = from + removed;
  const move = (p) => (p >= to ? p + delta : p > from ? from + inserted : p);
  return stops.map((s) => ({ start: move(s.start), end: move(s.end) }));
}
