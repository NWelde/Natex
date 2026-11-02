async function getAllowedOrigins() { // Allowed origins mean the sites the extension has acess too 
  const { allowedOrigins = [] } = await chrome.storage.sync.get({ allowedOrigins: [] });
  return Array.isArray(allowedOrigins) ? allowedOrigins : [];
}

async function shouldRunOnUrl(urlString) { // This is a list of all the urls its allowed to run in 
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false };

  const originPattern = `${url.origin}/*`;
  const allowed = await getAllowedOrigins();
  if (!allowed.includes(originPattern)) return { ok: false, originPattern };

  const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
  if (!hasPermission) return { ok: false, originPattern };

  return { ok: true, originPattern };
}

// Register Natex's scripts with Chrome for every allowed origin. Unlike a
// one-off executeScript, registered scripts also run in iframes and in frames
// that load later (e.g. a forum workbook opened after the page loaded).
// Two scripts: the panel UI (isolated world) and a small bridge in the page's
// MAIN world that can reach the host's Quill (see src/page/quill-bridge.js).

async function syncContentScripts() {
  const allowed = await getAllowedOrigins();
  const granted = [];
  for (const pattern of allowed) {
    if (await chrome.permissions.contains({ origins: [pattern] })) granted.push(pattern);
  }
  // Clear every dynamic script, not a list of ids: unregistering an id that
  // isn't registered (e.g. after upgrading from the old single script) fails
  // the whole call.
  try { await chrome.scripting.unregisterContentScripts(); } catch (_) {}
  if (!granted.length) return;
  const common = {
    matches: granted,
    allFrames: true,
    matchOriginAsFallback: true, // about:blank / srcdoc editor frames
    runAt: 'document_idle',
    persistAcrossSessions: true,
  };
  await chrome.scripting.registerContentScripts([
    { ...common, id: 'natex-page', js: ['dist/page.js'], world: 'MAIN' },
    { ...common, id: 'natex', js: ['dist/content.js'] },
  ]);
}

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.permissions.onAdded.addListener(syncContentScripts);
chrome.permissions.onRemoved.addListener(syncContentScripts);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.allowedOrigins) syncContentScripts();
});

//NOTE: If i were to build a mental model of what this backagroun.js does it is the one running to get t
//
//- It first checks what websites the extension is allowed to interact with 
//- Returning a list of site types url types its allowed to run on 
//- Then injects the te
