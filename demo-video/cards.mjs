// Renders the title/end cards and caption pills as PNGs, styled like the Natex
// panel ("v2 — Cobalt"). Captions are overlaid by edit.mjs, so the 16:9 and
// phone cuts can size them differently.

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHROME, REPO } from './config.mjs';

/** Shown on the end card: how to get Natex. */
export const INSTALL_LINE = process.env.NATEX_DEMO_INSTALL ?? 'github.com/NWelde/Natex';

const font = (file) => `data:font/woff2;base64,${readFileSync(join(REPO, 'node_modules', file)).toString('base64')}`;
const FONTS = `
  @font-face { font-family: Inter; font-weight: 500; src: url(${font('@fontsource/inter/files/inter-latin-500-normal.woff2')}); }
  @font-face { font-family: Inter; font-weight: 600; src: url(${font('@fontsource/inter/files/inter-latin-600-normal.woff2')}); }
  @font-face { font-family: KaTeX_Main; src: url(${font('katex/dist/fonts/KaTeX_Main-Regular.woff2')}); }`;
const LOGO = `data:image/png;base64,${readFileSync(join(REPO, 'icons/icon128.png')).toString('base64')}`;

export const FORMATS = {
  // captionBottom clears Natex's own toast, which sits at the bottom of the page.
  wide: { width: 1920, height: 1080, caption: 38, captionBottom: 150, title: 96, sub: 40 },
  // The phone crop has empty space above the editor; captions at the bottom would cover the panel.
  phone: { width: 1080, height: 1350, caption: 46, captionTop: 90, title: 88, sub: 40 },
};

const page = (f, body) => `<!doctype html><style>${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { width: ${f.width}px; height: ${f.height}px; background: #1C1D20; color: #ECEDEF; font-family: Inter, sans-serif;
         display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${f.sub}px; text-align: center; }
  .brand { display: flex; align-items: center; gap: ${f.title * 0.3}px; }
  .brand img { width: ${f.title * 1.1}px; height: ${f.title * 1.1}px; border-radius: ${f.title * 0.24}px; box-shadow: 0 0 0 2px #3A3D43; }
  .brand span { font: ${f.title}px KaTeX_Main, serif; }
  .sub { font-weight: 500; font-size: ${f.sub}px; color: #9A9FA8; max-width: 86%; line-height: 1.35; }
  .link { font-weight: 600; font-size: ${f.sub * 1.05}px; color: #fff; background: #4F70F7; padding: ${f.sub * 0.45}px ${f.sub * 0.9}px; border-radius: ${f.sub * 0.35}px; }
</style><body>${body}</body>`;

export const CARDS = {
  title: () => `<div class="brand"><img src="${LOGO}"><span>Natex</span></div>
    <div class="sub">Write math in your forum posts, with a live preview</div>`,
  end: () => `<div class="brand"><img src="${LOGO}"><span>Natex</span></div>
    <div class="sub">Free Chrome extension for Quill editors like the Minerva forum</div>
    <div class="link">${INSTALL_LINE}</div>`,
};

const captionPage = (f, text) => `<!doctype html><style>${FONTS}
  * { margin: 0; } html, body { background: transparent; }
  body { width: ${f.width}px; display: flex; justify-content: center; padding: 8px; }
  .pill { max-width: ${f.width * (f.width > f.height ? 0.78 : 0.9)}px; font: 500 ${f.caption}px/1.3 Inter, sans-serif; color: #fff; text-align: center;
          background: rgba(17,18,20,.9); padding: ${f.caption * 0.42}px ${f.caption * 0.8}px; border-radius: ${f.caption * 0.4}px;
          box-shadow: 0 0 0 1.5px rgba(255,255,255,.08), 0 8px 24px rgba(0,0,0,.3); }
</style><body><div class="pill">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div></body>`;

/** Renders PNGs: { cards: { title, end }, captions: [file...] } for a format. */
export async function renderAssets(dir, formatName, captionTexts) {
  const f = FORMATS[formatName];
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const p = await browser.newPage({ viewport: { width: f.width, height: f.height } });
    const cards = {};
    for (const [name, html] of Object.entries(CARDS)) {
      await p.setContent(page(f, html()));
      await p.evaluate(() => document.fonts.ready);
      cards[name] = join(dir, `${formatName}-card-${name}.png`);
      await p.screenshot({ path: cards[name] });
    }
    const captions = [];
    for (const [i, text] of captionTexts.entries()) {
      await p.setContent(captionPage(f, text));
      await p.evaluate(() => document.fonts.ready);
      const file = join(dir, `${formatName}-caption-${i}.png`);
      // The padded body, so the pill's rounded corners and shadow aren't clipped.
      const box = await p.locator('.pill').boundingBox();
      await p.screenshot({ path: file, omitBackground: true, clip: { x: box.x - 8, y: box.y - 4, width: box.width + 16, height: box.height + 16 } });
      captions.push(file);
    }
    return { cards, captions, format: f };
  } finally {
    await browser.close();
  }
}
