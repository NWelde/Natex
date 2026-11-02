// npm run demo [-- flow ...] [--edit-only] [--headed]
//   Records and edits every flow in flows.mjs (or just the ones named).
//   NATEX_DEMO_TARGET=harness records on the local Quill test page instead of Minerva.

import { FLOWS } from './flows.mjs';
import { loadTarget } from './config.mjs';
import { record } from './record.mjs';
import { edit } from './edit.mjs';

const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith('--'));
const flows = names.length ? names : Object.keys(FLOWS);
const unknown = flows.filter((f) => !FLOWS[f]);
if (unknown.length) {
  console.error(`Unknown flow(s): ${unknown.join(', ')}. Available: ${Object.keys(FLOWS).join(', ')}`);
  process.exit(1);
}

const target = loadTarget();
for (const name of flows) {
  console.log(`\n▶ ${name}`);
  if (!args.includes('--edit-only')) {
    await record(name, FLOWS[name], target, { headless: !args.includes('--headed') });
  }
  await edit(name);
}
