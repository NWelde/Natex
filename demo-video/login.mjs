// npm run demo:login
// Opens a visible browser with the demo profile and Natex loaded. Sign in to
// the forum, open the thread you want to record in, and click the Natex
// toolbar icon → "Enable Natex here". Close the window when done; the login
// stays in the profile for headless recording runs.

import { openBrowser } from './record.mjs';
import { PROFILE } from './config.mjs';

const url = process.argv[2] ?? 'https://forum.minerva.edu/';
console.log(`Profile: ${PROFILE}\nSign in, open the thread to record in, enable Natex from its toolbar icon, then close the window.`);
const context = await openBrowser({ headless: false });
const page = context.pages()[0] ?? await context.newPage();
await page.goto(url).catch(() => {});
await new Promise((resolve) => context.on('close', resolve));
console.log('Saved. Put the thread URL in demo-video/target.local.json (see demo-video/README.md).');
