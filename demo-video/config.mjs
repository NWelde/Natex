// Shared settings for the demo-video pipeline (see demo-video/README.md).

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..');
export const OUT = join(HERE, 'out');

/** Playwright's bundled Chromium: unlike branded Chrome it can load an unpacked extension. */
export const CHROME = process.env.NATEX_DEMO_CHROME
  ?? join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome');

/** Persistent profile that keeps the Minerva login between runs. Outside the repo on purpose. */
export const PROFILE = process.env.NATEX_DEMO_PROFILE ?? join(homedir(), '.natex-demo-profile');

/** Recording viewport (CSS px) and scale: 1280×720 at 1.5× gives 1920×1080 frames with readable UI. */
export const VIEWPORT = { width: 1280, height: 720 };
export const SCALE = 1.5;

/**
 * Where to record. `harness` is the local Quill 2 test page (no login, used to
 * develop the pipeline). The real target lives in demo-video/target.local.json
 * (gitignored, since thread URLs are private):
 *   { "url": "https://forum.minerva.edu/...", "editorIndex": 0, "privacyCss": "..." }
 */
export function loadTarget(name = process.env.NATEX_DEMO_TARGET ?? 'minerva') {
  if (name === 'harness') {
    return { name, url: 'http://localhost:5175/tests/e2e/quill2.html', editorIndex: 0, privacyCss: '', serveRepo: true };
  }
  const file = join(HERE, 'target.local.json');
  if (!existsSync(file)) {
    throw new Error(`No ${file}. Run \`npm run demo:login\`, then save the thread URL there (see demo-video/README.md).`);
  }
  return { name, editorIndex: 0, privacyCss: '', ...JSON.parse(readFileSync(file, 'utf8')) };
}
