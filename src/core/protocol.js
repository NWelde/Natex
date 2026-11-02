// Message protocol between the content script (isolated world) and the page
// bridge (MAIN world). Payloads are JSON strings: objects don't cross worlds
// reliably in CustomEvent.detail.

export const REQUEST_EVENT = 'natex:request';
export const RESPONSE_EVENT = 'natex:response';

/** Attribute the content script puts on each Quill container so both worlds agree on ids. */
export const EDITOR_ID_ATTR = 'data-natex-id';
