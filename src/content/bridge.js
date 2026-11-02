// Isolated-world side of the page bridge (see src/page/quill-bridge.js).

import { REQUEST_EVENT, RESPONSE_EVENT } from '../core/protocol.js';
import { signal } from './lifecycle.js';

const pending = new Map();
let nextId = 1;

document.addEventListener(RESPONSE_EVENT, (event) => {
  let msg;
  try { msg = JSON.parse(event.detail); } catch { return; }
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  clearTimeout(p.timer);
  msg.ok ? p.resolve(msg.value) : p.reject(new Error(msg.error));
}, { signal });

/** Calls a page-bridge method. Rejects if the bridge doesn't answer in time. */
export function call(method, args = {}, timeoutMs = 2000) {
  const id = `${Date.now().toString(36)}-${nextId++}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Natex page bridge did not answer "${method}"`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    document.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: JSON.stringify({ id, method, args }) }));
  });
}
