// Turns a recording (out/<flow>/timeline.json + frames) into finished videos
// with ffmpeg: constant-frame-rate footage with the setup parts sped up, title
// and end cards, caption overlays, and both a 16:9 and a 4:5 phone cut. The
// reel also gets a poster frame and a short README GIF.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from './config.mjs';
import { renderAssets } from './cards.mjs';

const FPS = 30;
const FAST = 10; // speed-up for { fast } parts
const TITLE_SECONDS = 2.4;
const END_SECONDS = { reel: 3.4, clip: 2.4 };
const FADE = 0.18;

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

/** Frame durations on the output clock, plus a map from recording time to output time. */
function retime(tl) {
  const frames = tl.frames.filter((f, i, all) => i === all.length - 1 || all[i + 1].t > tl.start);
  const factorAt = (t) => (tl.fast.some(([a, b]) => t >= a && t < (b ?? Infinity)) ? 1 / FAST : 1);
  const points = []; // [recT, outT]
  let out = 0;
  const durations = frames.map((f, i) => {
    const from = Math.max(f.t, tl.start);
    const to = i + 1 < frames.length ? frames[i + 1].t : tl.end;
    points.push([from, out]);
    const d = Math.max(0, to - from) * factorAt(from);
    out += d;
    return d;
  });
  points.push([tl.end, out]);
  const map = (t) => {
    if (t <= points[0][0]) return 0;
    for (let i = 1; i < points.length; i++) {
      const [t1, o1] = points[i];
      if (t <= t1) {
        const [t0, o0] = points[i - 1];
        return o0 + (t - t0) * factorAt(t0);
      }
    }
    return out;
  };
  return { frames, durations, total: out, map };
}

const ZOOM_SECONDS = 0.7; // camera move duration
const MAX_ZOOM = 2.4;

/**
 * The camera: a window over the footage that eases between zoom targets.
 * Returns an ffmpeg scale+crop chain for an output of f.width×f.height.
 * At rest the window is the full frame height (the phone cut is a 4:5 slice of
 * it, centred on where the panel was); on { zoom } it frames the target box.
 */
function camera(tl, map, f) {
  const { width: W, height: H } = tl.size;
  const aspect = f.width / f.height;
  const restW = Math.min(W, H * aspect); // window size at zoom 1, in footage px
  const xs = tl.focus.map((b) => b.x + b.width / 2).sort((a, b) => a - b);
  const restX = aspect >= W / H ? W / 2 : (xs.length ? xs[Math.floor(xs.length / 2)] : W / 2);
  const rest = { t: 0, z: 1, x: restX, y: H / 2 };

  const keys = [rest];
  for (const { t, box: target } of tl.zooms ?? []) {
    if (!target) { keys.push({ ...rest, t: map(t) }); continue; }
    // Room below the target: the panel grows as its preview fills in.
    const box = { ...target, height: target.height * 1.2 };
    // Leave a free band for the caption (bottom on 16:9, top on the phone cut).
    const band = 0.2;
    const z = Math.min(MAX_ZOOM, Math.max(1, Math.min(restW / (box.width * 1.2), (H * (1 - band)) / (box.height * 1.3))));
    const shift = (f.captionTop != null ? -1 : 1) * (band / 2) * (H / z);
    keys.push({ t: map(t), z, x: box.x + box.width / 2, y: box.y + box.height / 2 + shift });
  }

  // value(t) = v0 + Σ Δv · smoothstep((t - t_i) / ZOOM_SECONDS)
  const expr = (k) => keys.reduce((e, key, i) => {
    if (i === 0) return `${key[k]}`;
    const d = key[k] - keys[i - 1][k];
    if (Math.abs(d) < 1e-4) return e;
    const u = `clip((t-${key.t.toFixed(3)})/${ZOOM_SECONDS},0,1)`;
    return `${e}+${d.toFixed(4)}*${u}*${u}*(3-2*${u})`;
  }, '');

  const s = `(${f.height}*(${expr('z')})/${H})`; // footage → output scale
  // crop keeps the iw/ih of its first frame, so the zoomed size is recomputed from t here too.
  // Round up and never below the output size, or crop reads past the frame (green edge lines).
  const sw = `max(${f.width},ceil(${W}*${s}/2)*2)`, sh = `max(${f.height},ceil(${H}*${s}/2)*2)`;
  return [
    `scale=w='${sw}':h='${sh}':eval=frame:flags=lanczos`,
    `crop=${f.width}:${f.height}:x='clip((${expr('x')})*${s}-${f.width / 2},0,${sw}-${f.width})':y='clip((${expr('y')})*${s}-${f.height / 2},0,${sh}-${f.height})'`,
  ].join(',');
}

const GIF_LIMIT = 8 * 1024 * 1024; // GitHub shows README images up to 10 MB

/** A looping GIF of part of a video, stepping quality down until it fits GIF_LIMIT. */
export function makeGif(video, start, duration, file) {
  for (const [width, fps] of [[880, 12], [800, 10], [720, 9], [640, 8]]) {
    ffmpeg(['-ss', start.toFixed(2), '-t', duration.toFixed(2), '-i', video, '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop', '0', file]);
    if (statSync(file).size < GIF_LIMIT) break;
  }
  return file;
}

export async function edit(flowName) {
  const dir = join(OUT, flowName);
  const tl = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
  const { frames, durations, total, map } = retime(tl);

  // 1. Footage at a constant frame rate.
  const list = frames.map((f, i) => `file 'frames/${f.file}'\nduration ${durations[i].toFixed(4)}`).join('\n')
    + `\nfile 'frames/${frames.at(-1).file}'\n`;
  writeFileSync(join(dir, 'frames.txt'), list);
  const footage = join(dir, 'footage.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'), '-vf', `fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', footage]);

  // 2. Captions on the output clock (each lasts until the next one).
  const lead = tl.title ? TITLE_SECONDS : 0;
  const caps = [];
  tl.captions.forEach((c, i) => {
    if (!c.text) return;
    const start = map(c.t);
    const next = tl.captions[i + 1];
    const end = next ? map(next.t) : total;
    if (end - start < 0.3) return;
    const prev = caps.at(-1);
    if (prev && prev.text === c.text && Math.abs(prev.end - (lead + start)) < 0.05) { prev.end = lead + end; return; }
    caps.push({ text: c.text, start: lead + start, end: lead + end });
  });

  // 3. One video per format.
  const endSeconds = tl.title ? END_SECONDS.reel : END_SECONDS.clip;
  const length = lead + total + endSeconds;
  const outputs = {};
  for (const fmt of ['wide', 'phone']) {
    const { cards, captions, format: f } = await renderAssets(dir, fmt, caps.map((c) => c.text));
    const inputs = [];
    const graph = [];
    let n = 0;
    const input = (args) => { inputs.push(...args); return n++; };

    const parts = [];
    if (tl.title) {
      const i = input(['-loop', '1', '-framerate', String(FPS), '-t', String(TITLE_SECONDS), '-i', cards.title]);
      graph.push(`[${i}:v]format=yuv420p,setsar=1,fade=out:st=${TITLE_SECONDS - 0.25}:d=0.25[title]`);
      parts.push('[title]');
    }
    const fi = input(['-i', footage]);
    const fit = camera(tl, map, f);
    graph.push(`[${fi}:v]${fit},setsar=1${tl.title ? ',fade=in:st=0:d=0.25' : ''}[footage]`);
    parts.push('[footage]');
    const ei = input(['-loop', '1', '-framerate', String(FPS), '-t', String(endSeconds), '-i', cards.end]);
    graph.push(`[${ei}:v]format=yuv420p,setsar=1,fade=in:st=0:d=0.3[end]`);
    parts.push('[end]');
    graph.push(`${parts.join('')}concat=n=${parts.length}:v=1:a=0[v0]`);

    let last = 'v0';
    caps.forEach((c, k) => {
      const ci = input(['-loop', '1', '-framerate', String(FPS), '-t', String(length), '-i', captions[k]]);
      const fadeOut = Math.max(c.start, c.end - FADE);
      graph.push(`[${ci}:v]format=rgba,fade=in:st=${c.start.toFixed(3)}:d=${FADE}:alpha=1,fade=out:st=${fadeOut.toFixed(3)}:d=${FADE}:alpha=1[c${k}]`);
      graph.push(`[${last}][c${k}]overlay=x=(W-w)/2:y=${f.captionTop ?? `H-h-${f.captionBottom}`}:enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})':eof_action=pass[v${k + 1}]`);
      last = `v${k + 1}`;
    });

    const file = join(OUT, `natex-${flowName}${fmt === 'phone' ? '-phone' : ''}.mp4`);
    const quality = fmt === 'phone' ? ['-crf', '23', '-maxrate', '1400k', '-bufsize', '2800k'] : ['-crf', '18'];
    ffmpeg([...inputs, '-filter_complex', graph.join(';'), '-map', `[${last}]`, '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'slow', ...quality, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
    outputs[fmt] = file;
  }

  // 4. Poster and README GIF (reel only).
  if (tl.marks.poster) {
    const at = lead + map(tl.marks.poster) + 0.3;
    outputs.poster = join(OUT, `natex-${flowName}-poster.png`);
    ffmpeg(['-ss', at.toFixed(2), '-i', outputs.wide, '-frames:v', '1', outputs.poster]);
  }
  // README GIF: the marked stretch, or all of the footage (no cards).
  const [a, b] = tl.marks['gif-start'] && tl.marks['gif-end']
    ? [lead + map(tl.marks['gif-start']), lead + map(tl.marks['gif-end'])]
    : [lead, lead + total];
  outputs.gif = makeGif(outputs.wide, a, b - a, join(OUT, `natex-${flowName}.gif`));

  for (const [k, file] of Object.entries(outputs)) {
    const size = (statSync(file).size / 1024 / 1024).toFixed(1);
    const dur = file.endsWith('.png') ? '' : ` ${seconds(file).toFixed(1)}s`;
    console.log(`  ${k.padEnd(6)} ${file}${dur} ${size} MB`);
  }
  return outputs;
}
