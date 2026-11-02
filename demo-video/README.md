# Demo videos

Records Natex being used in a real forum reply box and turns it into captioned
videos (text only, no voiceover). Everything is scripted, so the demos can be
re-recorded after any UI change with one command. If a flow breaks, the
recording fails, which makes this a smoke test on the real site too.

```
npm run build          # the demo loads dist/, so build first
npm run demo           # record + edit every flow
npm run demo -- reel   # just one (reel, preview, insert, edit-formula, drafts, hotkey)
npm run demo -- reel --edit-only   # re-edit the last recording (e.g. after changing captions)
```

Outputs land in `demo-video/out/` (gitignored):

| File | What |
|---|---|
| `natex-<flow>.mp4` | 16:9, 1920×1080, for the README / YouTube |
| `natex-<flow>-phone.mp4` | 4:5, 1080×1350, cropped onto the editor, for group chats |
| `natex-reel-poster.png` | a real frame from the reel, for the video thumbnail |
| `natex-reel.gif` | short loop for the README (under 5 MB) |

## First-time setup (real Minerva forum)

1. `npm run demo:login` opens a browser with its own profile
   (`~/.natex-demo-profile`) and Natex loaded. Sign in, open the thread
   you want to record in, click the Natex toolbar icon → **Enable Natex here**,
   then close the window. The login stays in that profile.
2. Save the thread in `demo-video/target.local.json` (gitignored):

   ```json
   {
     "url": "https://forum.minerva.edu/...",
     "editorIndex": 0,
     "privacyCss": ".author-name, .avatar, .post-body { filter: blur(8px) !important; }"
   }
   ```

   `privacyCss` is injected before recording so other students' names and
   posts are blurred. Check every export before sharing anyway.
3. `npm run demo`.

To try the pipeline without a login, record on the local Quill test page:
`NATEX_DEMO_TARGET=harness npm run demo -- reel` (the hotkey flow needs the
real extension and doesn't work there).

## Safety on the real forum

- It only records into an **empty** reply box and refuses to start otherwise.
- It never clicks Post/Reply: only the reply box, formulas, Natex's own
  controls and the settings page.
- Afterwards it empties the reply box, discards the Natex draft and resets
  the hotkey. Minerva may still have autosaved a draft, so record in a thread
  where that's harmless.

## Changing the videos

- **What happens and the captions:** `flows.mjs`. Captions should say why a
  step matters ("the preview follows as you type"), not which button is pressed.
- **Install line on the end card:** `NATEX_DEMO_INSTALL="..." npm run demo`
  or `INSTALL_LINE` in `cards.mjs`.
- **Look of cards and captions:** `cards.mjs` (same tokens as the panel).
- **Speed-up, card lengths, encoding:** constants at the top of `edit.mjs`.
