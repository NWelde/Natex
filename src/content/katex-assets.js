// KaTeX CSS for the panel. Fonts declared inside a shadow root don't load, so
// the @font-face rules go into the document (with extension URLs) and the rest
// of the stylesheet goes into the shadow root.

import katexCss from 'katex/dist/katex.min.css';

const FONT_FACE = /@font-face\{[^}]*\}/g;
let fontsInjected = false;

/** Stylesheet text for the shadow root (KaTeX minus @font-face). */
export const katexShadowCss = katexCss.replace(FONT_FACE, '');

/** Adds KaTeX's @font-face rules to the page once, pointing at bundled fonts. */
export function injectKatexFonts() {
  if (fontsInjected || !globalThis.chrome?.runtime?.getURL) return;
  fontsInjected = true;
  const base = chrome.runtime.getURL('dist/katex/');
  const faces = (katexCss.match(FONT_FACE) || [])
    .map((rule) => rule.replace(/url\(fonts\//g, `url(${base}fonts/`))
    .join('\n');
  const style = document.createElement('style');
  style.dataset.natex = 'katex-fonts';
  style.textContent = faces;
  (document.head || document.documentElement).appendChild(style);
}
