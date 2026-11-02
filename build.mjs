// Bundles the extension's injected scripts into dist/ and copies KaTeX fonts.
//   node build.mjs          one-off build
//   node build.mjs --watch  rebuild on change
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/katex/fonts', { recursive: true });
// woff2 is supported by every Chrome that runs MV3; skip the older formats.
for (const f of readdirSync('node_modules/katex/dist/fonts')) {
  if (f.endsWith('.woff2')) cpSync(`node_modules/katex/dist/fonts/${f}`, `dist/katex/fonts/${f}`);
}

const options = {
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
