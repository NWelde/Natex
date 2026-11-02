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
  if (!granted.length) return granted;
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
  return granted;
}

// Registered scripts only run on pages loaded from now on. After an install or
// update (including a reload in chrome://extensions), tabs that are already
// open still hold the old content script, which can no longer talk to the
// extension. Inject the new one there; it replaces the old one (see
// src/content/lifecycle.js).
async function injectIntoOpenTabs(patterns) {
  if (!patterns?.length) return;
  const tabs = await chrome.tabs.query({ url: patterns });
  await Promise.all(tabs.map(async (tab) => {
    if (tab.discarded) return;
    const target = { tabId: tab.id, allFrames: true };
    try {
      await chrome.scripting.executeScript({ target, files: ['dist/page.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target, files: ['dist/content.js'] });
    } catch (_) {
      // Tab closed, still loading, or an error page: it gets the scripts on its next load.
    }
  }));
}

// Several of these events fire together (e.g. enabling a site changes both
// permissions and storage). Run syncs one at a time, or two overlapping runs
// both unregister and then both register: "Duplicate script ID".
let syncing = Promise.resolve();
function queueSync() {
  syncing = syncing.then(syncContentScripts).catch((err) => console.warn('[Natex] script sync failed', err));
  return syncing;
}

chrome.runtime.onInstalled.addListener(() => queueSync().then(injectIntoOpenTabs));
chrome.runtime.onStartup.addListener(queueSync);
chrome.permissions.onAdded.addListener(queueSync);
chrome.permissions.onRemoved.addListener(queueSync);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.allowedOrigins) queueSync();
});

//NOTE: If i were to build a mental model of what this backagroun.js does it is the one running to get t
//
//- It first checks what websites the extension is allowed to interact with 
//- Returning a list of site types url types its allowed to run on 
//- Then injects the te
