# Contributing

Thanks for your interest in improving Natex. Pull requests are welcome.

## Ground rules

- **Open a PR — never push to `main`.** Work on a branch and open a pull request
  against `main`, even for small fixes, so every change gets a review.
- **The full test suite must pass, and the extension must build.** Run both from
  the repo root before opening a PR:

  ```bash
  npm install
  npm test        # unit tests for src/core (node:test)
  npm run build   # bundles dist/, which the extension loads
  ```

  Tests live under `tests/`. If you change the panel or how Natex talks to the
  host editor, also try it on the harness pages in `tests/e2e/` (see the
  README) or with `NATEX_DEMO_TARGET=harness npm run demo -- reel`.

- **Describe user-visible changes.** Every change that alters what users see or
  how Natex behaves says so in the PR description: what changed, and how you
  checked it. Pure refactors and test-only changes can be noted briefly.

- **Stage by explicit path.** When committing, `git add` only the files you
  changed — never `git add -A` / `git add .`, which sweeps in unrelated or
  generated files.

- **Don't commit local run data.** `dist/` (build output), `demo-video/out/`
  (recorded videos and frames) and `demo-video/target.local.json` (a signed,
  personal forum link) are gitignored and never committed. Demo assets that the
  README uses are copied into `assets/` on purpose.

## Pull requests from forks

External contributions are welcome and follow the standard fork flow:

- **Fork, branch, and open a PR against `main`.**
- **Run the checks yourself.** There is no CI on this repo yet, so `npm test`
  and `npm run build` are the gate: say in the PR that both pass.
- **Keep PRs focused.** One change per PR is easier to review and to revert.

## Support

Issues are welcome and handled on a **best-effort basis — there is no SLA**. For
a security vulnerability, don't open a public issue: contact the maintainers
privately instead (see [PRIVACY.md](PRIVACY.md) for how Natex handles data).

---

Adapted from the contributing rules of
[StarSling's skills repo](https://github.com/starslingdev/skills/blob/main/CONTRIBUTING.md)
(MIT License).
