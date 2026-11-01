// Natex popup: shows whether Natex is on for the current tab's site and lets
// the user turn it on/off. Shortcuts + hotkey changes aren't built yet.

const $ = (sel) => document.querySelector(sel);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getAllowedOrigins() {
  const { allowedOrigins = [] } = await chrome.storage.sync.get({ allowedOrigins: [] });
  return Array.isArray(allowedOrigins) ? allowedOrigins : [];
}

async function setAllowedOrigins(allowedOrigins) {
  await chrome.storage.sync.set({ allowedOrigins });
}

// Returns { host, pattern } for http(s) tabs, or null for chrome://, new tab, etc.
function siteOf(tab) {
  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { host: url.host, pattern: `${url.origin}/*` };
  } catch {
    return null;
  }
}

// Origins of iframes on the page (the editor often lives in one). Collected
// when the popup opens so the permission request can happen right on click.
let framePatterns = [];

async function findFramePatterns(tab) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => [...document.querySelectorAll('iframe')].map((f) => {
        try { return new URL(f.src, location.href).origin; } catch { return null; }
      }),
    });
    return [...new Set((res?.result || [])
      .filter((o) => o && /^https?:/.test(o))
      .map((o) => `${o}/*`))];
  } catch (_) {
    return [];
  }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function showState(state, host) {
  $('#siteOff').hidden = state !== 'off';
  $('#siteOn').hidden = state !== 'on';
  $('#siteNa').hidden = state !== 'na';
  if (host) $('#domainOff').textContent = $('#domainOn').textContent = host;
}

async function refresh() {
  const tab = await getActiveTab();
  const site = tab && siteOf(tab);
  if (!site) return showState('na');
  framePatterns = (await findFramePatterns(tab)).filter((p) => p !== site.pattern);
  const needed = [site.pattern, ...framePatterns];
  const allowed = await getAllowedOrigins();
  const granted = await chrome.permissions.contains({ origins: needed });
  showState(needed.every((p) => allowed.includes(p)) && granted ? 'on' : 'off', site.host);
}

async function enable() {
  const tab = await getActiveTab();
  const site = tab && siteOf(tab);
  if (!site) return;

  // Ask for the page and any embedded editor frames in one prompt.
  const needed = [site.pattern, ...framePatterns];
  const granted = await chrome.permissions.request({ origins: needed });
  if (!granted) return toast('Permission was not granted');

  const allowed = await getAllowedOrigins();
  await setAllowedOrigins([...new Set([...allowed, ...needed])]);

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['quillOverride.js'] });
  } catch (_) {
    // Restricted frames etc. — background.js will retry on next page load.
  }
  await refresh();
  toast(`Natex is on for ${site.host}`);
}

async function disable() {
  const tab = await getActiveTab();
  const site = tab && siteOf(tab);
  if (!site) return;
  const drop = [site.pattern, ...framePatterns];
  await setAllowedOrigins((await getAllowedOrigins()).filter((p) => !drop.includes(p)));
  try { await chrome.permissions.remove({ origins: drop }); } catch (_) {}
  await refresh();
  toast('Natex is off — reload the page to remove it');
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-toast]');
  if (el) { e.preventDefault(); toast(el.dataset.toast); }
});
$('#enableBtn').addEventListener('click', enable);
$('#siteSwitch').addEventListener('click', disable);
$('#openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

refresh();
