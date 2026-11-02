// Lifetime of this content-script instance.
//
// Reloading or updating the extension leaves the old content script running in
// open tabs, but every chrome.* call it makes then throws "Extension context
// invalidated". So an instance shuts itself down (listeners, buttons, panel)
// when its extension context is gone, or when a newer instance is injected
// into the same page (background.js re-injects into open tabs after an update).

const TAKEOVER_EVENT = 'natex:takeover';

const controller = new AbortController();
const cleanups = [];

/** Pass as `{ signal }` to addEventListener / observers so teardown removes them. */
export const signal = controller.signal;

// Only extension pages have chrome.runtime.id; the dev harness pages don't.
const inExtension = !!globalThis.chrome?.runtime?.id;

/** Whether this instance may still run (and call chrome.* APIs). Shuts down if not. */
export function alive() {
  if (signal.aborted) return false;
  if (inExtension && !globalThis.chrome?.runtime?.id) {
    teardown();
    return false;
  }
  return true;
}

/** Runs `fn` when this instance shuts down. */
export function onTeardown(fn) { cleanups.push(fn); }

function teardown() {
  if (signal.aborted) return;
  controller.abort();
  for (const fn of cleanups.splice(0)) {
    try { fn(); } catch (_) { /* best effort */ }
  }
}

/** Shuts down any older instance in this frame, then listens for newer ones. */
export function takeOver() {
  document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT));
  document.addEventListener(TAKEOVER_EVENT, teardown, { signal });
}
