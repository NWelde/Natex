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

// Register quillOverride.js with Chrome for every allowed origin. Unlike a
// one-off executeScript, registered scripts also run in iframes and in frames
// that load later (e.g. a forum workbook opened after the page loaded).
const SCRIPT_ID = 'natex';

async function syncContentScripts() {
  const allowed = await getAllowedOrigins();
  const granted = [];
  for (const pattern of allowed) {
    if (await chrome.permissions.contains({ origins: [pattern] })) granted.push(pattern);
  }
  try { await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }); } catch (_) {}
  if (!granted.length) return;
  await chrome.scripting.registerContentScripts([{
    id: SCRIPT_ID,
    matches: granted,
    js: ['quillOverride.js'],
    allFrames: true,
    matchOriginAsFallback: true, // about:blank / srcdoc editor frames
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }]);
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
