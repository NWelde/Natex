// Plays a flow (flows.mjs) in a real browser with the built extension loaded
// and captures it as timed JPEG frames via the CDP screencast, which is much
// sharper than Playwright's recordVideo. Writes out/<flow>/timeline.json for
// edit.mjs: frames, caption times, sped-up parts, marks and the area to crop
// for the phone cut.
//
// Safety on real sites: it refuses to start if the reply box isn't empty,
// never clicks anything but the reply box, formulas and Natex's own controls,
// and clears the reply box and the Natex draft when done.

import { chromium } from 'playwright-core';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { CHROME, OUT, PROFILE, REPO, SCALE, VIEWPORT, HERE } from './config.mjs';

const OVERLAY = readFileSync(join(HERE, 'overlay.js'), 'utf8');
const EXT_FILES = ['manifest.json', 'background.js', 'popup.html', 'options.html', 'styles', 'icons', 'dist'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

/** A clean copy of the built extension (the repo root has node_modules, which Chrome won't load). */
export function stageExtension() {
  const dir = join(OUT, 'extension');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of EXT_FILES) cpSync(join(REPO, f), join(dir, f), { recursive: true });
  return dir;
}

export function openBrowser({ headless = true } = {}) {
  const ext = stageExtension();
  return chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    bypassCSP: true, // lets the cursor overlay run on sites with strict CSPs
    // Without this the screencast delivers CSS-pixel frames (1280×720), ignoring deviceScaleFactor.
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--force-device-scale-factor=${SCALE}`],
  });
}

/** Serves the repo for the local harness target. */
function serveRepo(port = 5175) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
      res.end(readFileSync(join(REPO, path)));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** Captures the visible page as timed frames; can move between pages mid-flow. */
class Camera {
  constructor(dir) {
    this.dir = dir;
    this.frames = [];
    this.cdp = null;
  }

  async attach(page) {
    await this.detach();
    this.cdp = await page.context().newCDPSession(page);
    this.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      const file = `f${String(this.frames.length).padStart(5, '0')}.jpg`;
      writeFileSync(join(this.dir, file), Buffer.from(data, 'base64'));
      this.frames.push({ file, t: metadata.timestamp });
      this.cdp?.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 95, everyNthFrame: 1,
      maxWidth: VIEWPORT.width * SCALE, maxHeight: VIEWPORT.height * SCALE,
    });
  }

  async detach() {
    if (!this.cdp) return;
    const cdp = this.cdp;
    this.cdp = null;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await cdp.detach().catch(() => {});
  }
}

/** Finds the n-th editable Quill editor, in whichever frame it lives (Minerva uses an iframe). */
async function findEditor(page, index) {
  const found = [];
  for (const frame of page.frames()) {
    const n = await frame.locator('.ql-editor[contenteditable="true"]').count().catch(() => 0);
    for (let i = 0; i < n; i++) found.push({ frame, editor: frame.locator('.ql-editor[contenteditable="true"]').nth(i) });
  }
  if (!found[index]) throw new Error(`No editable Quill editor #${index} on ${page.url()}`);
  return found[index];
}

const editorText = (editor) => editor.evaluate((el) => el.innerText.replace(/\s+/g, ''));

export async function record(flowName, flow, target, { headless = true } = {}) {
  const dir = join(OUT, flowName);
  const framesDir = join(dir, 'frames');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const server = target.serveRepo ? await serveRepo() : null;
  const context = await openBrowser({ headless });
  const timeline = { flow: flowName, title: !!flow.title, scale: SCALE, size: { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE },
    captions: [], fast: [], marks: {}, focus: [], zooms: [] };
  const camera = new Camera(framesDir);
  let page = context.pages()[0] ?? await context.newPage();
  const forum = page;
  let settingsPage = null;
  let hotkeyChanged = false;
  let ed;
  let cursor = { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.8 };

  const injectOverlay = async (p) => {
    await p.evaluate(OVERLAY);
    await p.evaluate(({ x, y }) => window.__natexDemo.show(x, y), cursor);
  };

  const privacy = async () => {
    if (!target.privacyCss) return;
    for (const f of page.frames()) await f.addStyleTag({ content: target.privacyCss }).catch(() => {});
  };

  /** Site-specific prep from target.local.json: clicks (e.g. a tab), then hides everything but the reply box. */
  const prepare = async () => {
    for (const { click } of target.setup ?? []) {
      await page.getByText(click, { exact: true }).first().click();
      await page.waitForTimeout(2500);
    }
    ed = await findEditor(page, target.editorIndex);
    if (target.isolate) {
      await ed.editor.evaluate((editor, { block, keep, hide, padTop }) => {
        const hideEl = (el) => el.style.setProperty('display', 'none', 'important');
        const root = editor.closest(block) ?? editor.closest('.ql-container').parentElement;
        for (let n = root; n && n !== document.body; n = n.parentElement) {
          for (const sib of n.parentElement.children) if (sib !== n && !sib.matches(keep)) hideEl(sib);
        }
        root.querySelectorAll(hide).forEach(hideEl);
        root.style.setProperty('margin-top', `${padTop}px`, 'important');
      }, { block: target.isolate.block ?? '', keep: target.isolate.keep ?? '-', hide: target.isolate.hide ?? '-', padTop: target.isolate.padTop ?? 0 });
      await ed.editor.evaluate((el) => el.closest('.ql-container').scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(400);
    }
  };

  const loadForum = async () => {
    await page.goto(target.url, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await prepare();
    await privacy();
    await injectOverlay(page);
  };

  /** Glides the visible cursor to a point (CSS px of the top page) and clicks there. */
  const glideClick = async (p, x, y) => {
    const dist = Math.hypot(x - cursor.x, y - cursor.y);
    const ms = Math.round(Math.min(850, Math.max(320, 260 + dist * 0.55)));
    await Promise.all([
      p.evaluate(([px, py, d]) => window.__natexDemo.move(px, py, d), [x, y, ms]),
      p.mouse.move(x, y, { steps: 14 }),
    ]);
    cursor = { x, y };
    await p.waitForTimeout(110);
    await p.evaluate(() => window.__natexDemo.ripple());
    await p.mouse.click(x, y);
  };

  const center = (b) => [b.x + b.width / 2, b.y + b.height / 2];

  /** Remembers where the action is, for the phone crop (in frame pixels). */
  const noteFocus = async () => {
    if (page !== forum) return;
    const panel = ed.frame.locator('natex-panel .panel.open');
    const box = (await panel.count()) ? await panel.boundingBox() : await ed.editor.boundingBox();
    if (box) timeline.focus.push({ x: box.x * SCALE, y: box.y * SCALE, width: box.width * SCALE, height: box.height * SCALE });
  };

  // Slow enough to read along: each character visibly lands.
  const typeHuman = async (text) => {
    for (const ch of text) {
      if (ch === '\n') await page.keyboard.press('Enter');
      else await page.keyboard.type(ch);
      const base = ch === '\n' ? 260 : /[ ,.:]/.test(ch) ? 150 : 90;
      await wait(base + Math.random() * 45);
    }
  };

  const union = (boxes) => {
    const bs = boxes.filter(Boolean);
    if (!bs.length) return null;
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return { x, y, width: Math.max(...bs.map((b) => b.x + b.width)) - x, height: Math.max(...bs.map((b) => b.y + b.height)) - y };
  };

  /** Where the camera should look, in CSS px of the top page. */
  const zoomBox = async (what) => {
    const panel = (sel) => ed.frame.locator(`natex-panel ${sel}`).boundingBox();
    if (what === 'panel') return panel('.panel.open');
    if (what === 'draft') return union([await panel('.draft'), await panel('.src')]);
    if (what === 'hotkey') return page.locator('#hotkeyRow').boundingBox();
    if (what === 'content') {
      // The written text and formulas, not the full-width paragraphs around them. Viewport px of the editor's frame.
      const box = await ed.editor.evaluate((root) => {
        const rects = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim() || n.parentElement.closest('.ql-formula')) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          rects.push(...r.getClientRects());
        }
        root.querySelectorAll('.ql-formula').forEach((f) => rects.push(f.getBoundingClientRect()));
        const rs = rects.filter((r) => r.width && r.height);
        if (!rs.length) return null;
        const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
        return { x, y, width: Math.max(...rs.map((r) => r.right)) - x, height: Math.max(...rs.map((r) => r.bottom)) - y };
      });
      if (!box || ed.frame === page.mainFrame()) return box;
      const offset = await (await ed.frame.frameElement()).boundingBox();
      return { ...box, x: box.x + offset.x, y: box.y + offset.y };
    }
    throw new Error(`Unknown zoom target ${what}`);
  };

  const steps = {
    caption: async ({ caption }) => { timeline.captions.push({ t: now(), text: caption }); },
    pause: async ({ pause }) => wait(pause),
    mark: async ({ mark }) => { timeline.marks[mark] = now(); },
    zoom: async ({ zoom }) => {
      const box = zoom ? await zoomBox(zoom) : null;
      if (zoom && !box) throw new Error(`Zoom target ${zoom} isn't on screen`);
      timeline.zooms.push({ t: now(), box: box && { x: box.x * SCALE, y: box.y * SCALE, width: box.width * SCALE, height: box.height * SCALE } });
    },
    fast: async ({ fast }) => {
      if (fast) timeline.fast.push([now(), null]);
      else timeline.fast[timeline.fast.length - 1][1] = now();
    },
    clickEditor: async () => {
      const b = await ed.editor.boundingBox();
      await glideClick(page, b.x + b.width - 40, b.y + b.height - 14); // empty space at the end: caret goes to the end
    },
    hotkey: async ({ hotkey }) => { await page.keyboard.press(hotkey); },
    type: async ({ type, fastType }) => {
      if (fastType) await page.keyboard.insertText(type);
      else await typeHuman(type);
    },
    keys: async ({ keys: [key, n] }) => {
      for (let i = 0; i < n; i++) { await page.keyboard.press(key); await wait(75); }
    },
    clickFormula: async ({ clickFormula }) => {
      const box = await ed.frame.locator('.ql-editor .ql-formula').nth(clickFormula).boundingBox();
      if (!box) throw new Error(`No formula #${clickFormula} in the reply`);
      await glideClick(page, ...center(box));
      // Move off the formula so the cursor doesn't hide the change.
      const [x, y] = [cursor.x + 70, cursor.y + 46];
      await page.evaluate(([px, py]) => window.__natexDemo.move(px, py, 380), [x, y]);
      cursor = { x, y };
    },
    clickPanel: async ({ clickPanel }) => {
      const box = await ed.frame.locator(`natex-panel [data-ref="${clickPanel}"]`).boundingBox();
      await glideClick(page, ...center(box));
    },
    reload: async () => {
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await prepare();
      await privacy();
      await injectOverlay(page);
    },
    // { settings: 'open' } shows the settings page; { settings: 'change', combo } records a new hotkey there.
    settings: async ({ combo }) => {
      if (page !== settingsPage) {
        if (!settingsPage) {
          let [sw] = context.serviceWorkers();
          sw ??= await context.waitForEvent('serviceworker');
          settingsPage = await context.newPage();
          await settingsPage.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
        }
        page = settingsPage;
        await page.bringToFront();
        await injectOverlay(page);
        await camera.attach(page);
        await wait(700);
      }
      if (!combo) return;
      await glideClick(page, ...center(await page.locator('#hotkeyChange').boundingBox()));
      await wait(900);
      await page.keyboard.press(combo);
      hotkeyChanged = true;
    },
    forum: async () => {
      page = forum;
      await page.bringToFront();
      await camera.attach(page);
      await injectOverlay(page);
      await wait(300);
    },
  };

  try {
    await loadForum();
    if (await editorText(ed.editor)) {
      throw new Error('The reply box already has text. Natex demo only records into an empty reply box, so nothing of yours gets touched.');
    }
    await camera.attach(page);
    await wait(400);
    timeline.start = now();
    for (const step of flow.steps) {
      const [kind] = Object.keys(step);
      if (!steps[kind]) throw new Error(`Unknown step ${kind}`);
      await steps[kind](step);
      await noteFocus().catch(() => {});
    }
    await wait(300);
    timeline.end = now();
  } finally {
    await camera.detach();
    timeline.frames = camera.frames;
    writeFileSync(join(dir, 'timeline.json'), JSON.stringify(timeline, null, 1));
    await cleanup().catch((err) => console.warn('[demo] cleanup:', err.message));
    await context.close();
    server?.close();
  }

  /** Leaves things as they were: hotkey reset, reply box empty, no Natex draft. */
  async function cleanup() {
    if (hotkeyChanged && settingsPage) {
      await settingsPage.bringToFront();
      const reset = settingsPage.locator('#hotkeyReset');
      if (await reset.isVisible()) await reset.click();
      await wait(300);
    }
    page = forum;
    await page.bringToFront();
    await page.keyboard.press('Escape');
    ed = await findEditor(page, target.editorIndex);
    // Focus without clicking: a click could land on a formula and open it in Natex.
    for (let i = 0; i < 3 && await editorText(ed.editor); i++) {
      await ed.editor.evaluate((el) => el.focus());
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await wait(200);
    }
    await ed.editor.evaluate((el) => el.focus());
    await page.keyboard.press('Control+m');
    await wait(600);
    const discard = ed.frame.locator('natex-panel [data-ref="discard"]');
    if (await discard.isVisible()) await discard.click();
    await page.keyboard.press('Escape');
    await wait(200);
    if (await editorText(ed.editor)) console.warn('[demo] the reply box is not empty after cleanup. Please clear it by hand.');
  }

  return timeline;
}
