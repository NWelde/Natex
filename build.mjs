// Bundles the extension's injected scripts into dist/ and copies KaTeX fonts.
//   node build.mjs          one-off build
//   node build.mjs --watch  rebuild on change
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/katex/fonts', { recursive: true });
// woff2 is supported by every Chrome that runs MV3; skip the older formats.
for (const f of readdirSync('node_modules/katex/dist/fonts')) {
  if (f.endsWith('.woff2')) cpSync(`node_modules/katex/dist/fonts/${f}`, `dist/katex/fonts/${f}`);
}

// KaTeX warns on load in quirks-mode documents (the target forum's editor
// frames are quirks mode) and disables katex.render() there. Natex only uses
// renderToString, which works, so drop the warning instead of logging it on
// every page.
const quietKatex = {
  name: 'quiet-katex',
  setup(build) {
    build.onLoad({ filter: /[\\/]katex[\\/]dist[\\/]katex\.m?js$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const warning = /typeof console !== "undefined" && console\.warn\("Warning: KaTeX doesn't work in quirks mode[^;]*;/;
      if (!warning.test(src)) throw new Error('quiet-katex: quirks-mode warning not found; check the KaTeX version');
      return { contents: src.replace(warning, ''), loader: 'js' };
    });
  },
};

const options = {
  plugins: [quietKatex],
  entryPoints: {
    content: 'src/content/index.js', // isolated world: panel UI
    page: 'src/page/quill-bridge.js', // MAIN world: talks to the host's Quill
    options: 'options.js', // settings page
    popup: 'popup.js', // toolbar popup
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  loader: { '.css': 'text' },
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
