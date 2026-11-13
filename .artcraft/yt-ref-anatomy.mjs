#!/usr/bin/env node
/**
 * Reference anatomy - the analysis layer the clone pipeline was missing.
 *
 * yt-format-profile.mjs answers "how fast does it cut and what are its colours".
 * That is not enough to clone a video: it never says WHERE the presenter is, WHERE the
 * text sits, WHICH shots are a talking head and which are a whiteboard, or what colour
 * the headline uses. This script measures exactly that, per shot, without a single
 * Python dependency:
 *
 *   1. cut list          -> ffmpeg scene detection (same threshold convention as the profiler)
 *   2. geometry pass     -> ffmpeg decodes to raw rgb24 at 48x84 and we do the maths in Node
 *   3. per-shot verdict  -> whiteboard / talking head / screen recording, presenter bbox,
 *                           headline band (top vs bottom), accent colour, motion energy
 *   4. contact sheet     -> one still per shot, so an agent can look at it
 *
 * No sharp/jimp/pngjs needed: everything is read from the raw pixel stream.
 *
 * Usage:
 *   node yt-ref-anatomy.mjs --video ref.mp4 [--out anatomy.json] [--frames dir]
 *                           [--fps 8] [--scene 0.3] [--grid 48x84]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || findFfmpeg();

function findFfmpeg() {
  const base = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(base, 'hermes', 'tools', 'ffmpeg-9.0.1-win32-x64', 'bin', 'ffmpeg.exe'),
    path.join(base, 'hermes', 'tools', 'ffmpeg-9.0.1-win32-x64', 'bin', 'ffmpeg'),
    'ffmpeg',
  ];
  for (const c of candidates) if (c === 'ffmpeg' || fs.existsSync(c)) return c;
  return 'ffmpeg';
}

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes('--' + name);
}

const VIDEO = arg('video');
if (!VIDEO || !fs.existsSync(VIDEO)) {
  console.error('uso: node yt-ref-anatomy.mjs --video <ficheiro> [--out anatomy.json] [--frames dir]');
  process.exit(1);
}
const OUT = arg('out', path.join(path.dirname(VIDEO), 'anatomy.json'));
const FRAMES = arg('frames', '');
const FPS = Number(arg('fps', '8'));
const SCENE = Number(arg('scene', '0.15'));
const [GW, GH] = arg('grid', '48x84').split('x').map(Number);

// ---------------------------------------------------------------- helpers

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => resolve({ code, out, err }));
    p.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
  });
}

/** Decode the whole file to a tiny rgb24 stream and buffer it. */
function decodeRaw(file, fps, w, h) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error', '-i', file,
      '-vf', 'fps=' + fps + ',scale=' + w + ':' + h + ':flags=area',
      '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
    ];
    const p = spawn(FFMPEG, args, { windowsHide: true });
    const chunks = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg raw decode falhou: ' + err.slice(-400)));
      resolve(Buffer.concat(chunks));
    });
    p.on('error', reject);
  });
}

async function probe(file) {
  const r = await run(FFMPEG.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1'), [
    '-v', 'error', '-show_entries', 'format=duration',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate',
    '-of', 'json', file,
  ]);
  try {
    const j = JSON.parse(r.out);
    const v = (j.streams || []).find((s) => s.width) || {};
    const a = (j.streams || []).find((s) => s.codec_name && !s.width) || {};
    const [num, den] = String(v.r_frame_rate || '30/1').split('/').map(Number);
    return {
      duration: Number(j.format?.duration || 0),
      width: v.width || 0,
      height: v.height || 0,
      fps: den ? num / den : 30,
      videoCodec: v.codec_name || '',
      audioCodec: a.codec_name || '',
    };
  } catch {
    return { duration: 0, width: 0, height: 0, fps: 30, videoCodec: '', audioCodec: '' };
  }
}

async function detectCuts(file, threshold) {
  const r = await run(FFMPEG, [
    '-v', 'info', '-i', file,
    '-vf', 'select=\'gt(scene,' + threshold + ')\',showinfo',
    '-an', '-f', 'null', '-',
  ]);
  const cuts = [];
  const re = /pts_time:([0-9.]+)/g;
  let m;
  while ((m = re.exec(r.err)) !== null) cuts.push(Number(Number(m[1]).toFixed(2)));
  return cuts;
}

// ---------------------------------------------------------------- pixel maths

const px = (buf, i) => ({ r: buf[i], g: buf[i + 1], b: buf[i + 2] });
const luma = (p) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
const sat = (p) => Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b);

/** Whiteboard paper: bright and desaturated. */
const isPaper = (p) => luma(p) > 190 && sat(p) < 45;
/** Dark UI / screen recording. */
const isDark = (p) => luma(p) < 55;
/** Human skin: warm, mid-luma, and reasonably saturated. Excludes teal UI and pure glow. */
function isSkin(p) {
  const l = luma(p);
  if (l < 40 || l > 232) return false;
  if (p.r <= p.g || p.g < p.b) return false;      // warm ordering, kills teal/violet UI
  const mx = Math.max(p.r, p.g, p.b);
  const mn = Math.min(p.r, p.g, p.b);
  if (mx - mn < 12) return false;                  // grey/white is not skin
  if (p.r - p.g < 10) return false;                // needs a real red bias
  if (p.g - p.b < 5) return false;                 // orange glow has g close to b in the shadows
  return true;
}
/** The accent the reference uses for keywords: saturated orange. */
const isOrange = (p) => p.r > 170 && p.g > 45 && p.g < 165 && p.b < 90 && p.r - p.b > 110;

function analyseFrame(buf, off, w, h) {
  const rows = new Array(h).fill(0).map(() => ({ luma: 0, paper: 0, dark: 0, skin: 0, orange: 0 }));
  const cols = new Array(w).fill(0);
  let paperAll = 0;
  let darkAll = 0;
  let skinAll = 0;
  let orangeAll = 0;
  let orangeY = 0;
  const total = w * h;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    const flags = new Array(w).fill(false);
    for (let x = 0; x < w; x++) {
      const i = off + (y * w + x) * 3;
      const p = px(buf, i);
      row.luma += luma(p);
      if (isPaper(p)) { row.paper++; paperAll++; }
      if (isDark(p)) { row.dark++; darkAll++; }
      if (isSkin(p)) flags[x] = true;
      if (isOrange(p)) { row.orange++; orangeAll++; orangeY += y; }
    }
    row.luma /= w;
    // Keep only contiguous skin runs. A face or a hand is a wide blob; the warm glow of a
    // background is a field of isolated pixels, which is what made the first pass report a
    // presenter in all 33 shots.
    const minRun = Math.max(2, Math.round(w / 16));
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && flags[x]) { run++; continue; }
      if (run >= minRun) {
        for (let k = x - run; k < x; k++) { row.skin++; cols[k]++; skinAll++; }
      }
      run = 0;
    }
  }
  return {
    rows,
    cols,
    paper: paperAll / total,
    dark: darkAll / total,
    skin: skinAll / total,
    orange: orangeAll / total,
    orangeY: orangeAll ? orangeY / orangeAll / h : null,
  };
}

/**
 * Bounding box of the presenter inside one shot.
 *
 * The skin mask is averaged over the shot's frames, then thresholded at a fraction of its
 * own peak so a single warm-lit frame cannot fake a body. Rows and columns are both
 * measured, which is what gives a real x-extent instead of "somewhere in the bottom".
 */
function presenterBox(rowProfile, colProfile) {
  const peakRow = Math.max(...rowProfile);
  const peakCol = Math.max(...colProfile);
  if (peakRow <= 0) return null;
  const rowT = peakRow * 0.22;
  const colT = peakCol * 0.22;
  let y0 = -1;
  let y1 = -1;
  let x0 = -1;
  let x1 = -1;
  for (let y = 0; y < rowProfile.length; y++) {
    if (rowProfile[y] >= rowT) { if (y0 < 0) y0 = y; y1 = y; }
  }
  for (let x = 0; x < colProfile.length; x++) {
    if (colProfile[x] >= colT) { if (x0 < 0) x0 = x; x1 = x; }
  }
  if (y0 < 0 || x0 < 0) return null;
  const H = rowProfile.length;
  const W = colProfile.length;
  return {
    x0: Number((x0 / W).toFixed(3)),
    x1: Number(((x1 + 1) / W).toFixed(3)),
    y0: Number((y0 / H).toFixed(3)),
    y1: Number(((y1 + 1) / H).toFixed(3)),
    widthRatio: Number(((x1 + 1 - x0) / W).toFixed(3)),
    heightRatio: Number(((y1 + 1 - y0) / H).toFixed(3)),
    centreX: Number((((x0 + x1 + 1) / 2) / W).toFixed(3)),
    centreY: Number((((y0 + y1 + 1) / 2) / H).toFixed(3)),
  };
}

function bandStats(frame, y0, y1) {
  const rows = frame.rows.slice(y0, y1);
  const n = rows.length || 1;
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0) / (n * GW);
  return {
    luma: rows.reduce((a, r) => a + r.luma, 0) / n,
    paper: sum('paper'),
    dark: sum('dark'),
    skin: sum('skin'),
    orange: sum('orange'),
  };
}

/** Horizontal centroid + extent of skin pixels in a band, normalised 0..1. */
function skinBox(frame, y0, y1) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let minX = GW;
  let maxX = 0;
  let minY = GH;
  let maxY = 0;
  for (let y = y0; y < y1; y++) {
    const row = frame.rows[y];
    if (row.skin < GW * 0.35) continue; // a presenter gives a wide skin run; a hand does not
    for (let x = 0; x < GW; x++) {
      // approximate: only count rows with enough skin, weight by row density
    }
    n++;
    sx += 0.5; // row centroid in x is unknown from aggregates; keep the row extent
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!n) return null;
  return {
    x: null,
    y0: minY / GH,
    y1: maxY / GH,
    widthRatio: null,
    note: 'linha-dominante (agregado por linhas, sem colunas)',
  };
}

// ---------------------------------------------------------------- per-shot verdict

function classifyShot(shot) {
  const { top, mid, bot } = shot.bands;
  const bodyDark = bot.dark + mid.dark;
  const mostlyPaper = mid.paper > 0.45 || top.paper > 0.45;
  const presenter = shot.skinBottom > 0.06 && bot.skin > 0.05;
  const screen = bodyDark > 0.5 && !mostlyPaper;

  let kind = 'misto';
  if (mostlyPaper && !presenter) kind = 'whiteboard';
  else if (mostlyPaper && presenter) kind = 'whiteboard+mao';
  else if (presenter && !mostlyPaper) kind = 'talking-head';
  else if (screen) kind = 'screen-recording';

  return kind;
}

// ---------------------------------------------------------------- main

async function main() {
  const meta = await probe(VIDEO);
  console.log('video    : ' + path.basename(VIDEO) + '  ' + meta.width + 'x' + meta.height + ' @' + meta.fps.toFixed(2) + 'fps  ' + meta.duration.toFixed(2) + 's');
  console.log('codec    : ' + meta.videoCodec + ' + ' + (meta.audioCodec || 'sem audio'));

  const cuts = await detectCuts(VIDEO, SCENE);
  const bounds = [0, ...cuts, meta.duration];
  const shots = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    shots.push({ index: i + 1, start: bounds[i], end: bounds[i + 1] });
  }
  console.log('planos   : ' + shots.length + ' (' + (cuts.length / (meta.duration / 60)).toFixed(1) + ' cortes/min)');

  const raw = await decodeRaw(VIDEO, FPS, GW, GH);
  const frameBytes = GW * GH * 3;
  const frameCount = Math.floor(raw.length / frameBytes);
  console.log('analise  : ' + frameCount + ' frames a ' + FPS + 'fps (' + GW + 'x' + GH + ')');

  // global per-row profile: tells us where the stadium line / text band lives
  const rowLuma = new Array(GH).fill(0);
  const rowPaper = new Array(GH).fill(0);
  const rowSkin = new Array(GH).fill(0);
  const rowOrange = new Array(GH).fill(0);
  const frames = [];
  let prev = null;
  let motionTotal = 0;

  for (let f = 0; f < frameCount; f++) {
    const off = f * frameBytes;
    const fr = analyseFrame(raw, off, GW, GH);
    fr.t = f / FPS;
    fr.motion = 0;
    if (prev) {
      let d = 0;
      for (let y = 0; y < GH; y += 2) {
        for (let x = 0; x < GW; x += 2) {
          const i = off + (y * GW + x) * 3;
          const j = (f - 1) * frameBytes + (y * GW + x) * 3;
          d += Math.abs(raw[i] - raw[j]) + Math.abs(raw[i + 1] - raw[j + 1]) + Math.abs(raw[i + 2] - raw[j + 2]);
        }
      }
      fr.motion = d / (Math.ceil(GH / 2) * Math.ceil(GW / 2) * 3 * 255);
      motionTotal += fr.motion;
    }
    prev = fr;
    frames.push(fr);
    for (let y = 0; y < GH; y++) {
      rowLuma[y] += fr.rows[y].luma;
      rowPaper[y] += fr.rows[y].paper;
      rowSkin[y] += fr.rows[y].skin;
      rowOrange[y] += fr.rows[y].orange;
    }
  }
  const norm = (arr) => arr.map((v) => Number((v / Math.max(1, frameCount)).toFixed(4)));

  // aggregate each shot from the frames that fall inside it
  for (const shot of shots) {
    const inShot = frames.filter((f) => f.t >= shot.start && f.t < shot.end);
    const acc = (k) => (inShot.length ? inShot.reduce((a, f) => a + f[k], 0) / inShot.length : 0);
    const yTop = 0;
    const yMid = Math.round(GH * 0.10);
    const yBot = Math.round(GH * 0.55);
    shot.seconds = Number((shot.end - shot.start).toFixed(2));
    shot.frames = inShot.length;
    shot.paper = Number(acc('paper').toFixed(3));
    shot.dark = Number(acc('dark').toFixed(3));
    shot.skin = Number(acc('skin').toFixed(3));
    shot.orange = Number(acc('orange').toFixed(3));
    shot.motion = Number(acc('motion').toFixed(4));
    shot.bands = {
      top: inShot.length ? roundBand(inShot.reduce((a, f) => addBand(a, bandStats(f, yTop, yMid)), zeroBand())) : zeroBand(),
      mid: inShot.length ? roundBand(inShot.reduce((a, f) => addBand(a, bandStats(f, yMid, yBot)), zeroBand())) : zeroBand(),
      bot: inShot.length ? roundBand(inShot.reduce((a, f) => addBand(a, bandStats(f, yBot, GH)), zeroBand())) : zeroBand(),
    };
    if (inShot.length) {
      for (const k of Object.keys(shot.bands)) {
        for (const m of Object.keys(shot.bands[k])) shot.bands[k][m] = Number((shot.bands[k][m] / inShot.length).toFixed(3));
      }
    }
    shot.skinBottom = Number(shot.bands.bot.skin.toFixed(3));

    // presenter geometry for THIS shot
    const rowProf = new Array(GH).fill(0);
    const colProf = new Array(GW).fill(0);
    for (const f of inShot) {
      for (let y = 0; y < GH; y++) rowProf[y] += f.rows[y].skin;
      for (let x = 0; x < GW; x++) colProf[x] += f.cols[x];
    }
    const inv = inShot.length ? 1 / inShot.length : 0;
    shot.presenter = presenterBox(rowProf.map((v) => v * inv), colProf.map((v) => v * inv));
    // the split line the reference uses for this shot: top of the presenter mass
    shot.splitLine = shot.presenter && shot.presenter.heightRatio > 0.12 ? shot.presenter.y0 : null;

    shot.kind = classifyShot(shot);
    const withOrange = inShot.filter((f) => f.orangeY != null);
    const orangeY = withOrange.length ? withOrange.reduce((a, f) => a + f.orangeY, 0) / withOrange.length : 0.5;
    shot.headlineY = Number(orangeY.toFixed(3));
    shot.headlineSide = orangeY < 0.35 ? 'topo' : orangeY > 0.65 ? 'fundo' : 'meio';
  }

  // global summary
  const kinds = {};
  for (const s of shots) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  const meanSkinRows = norm(rowSkin);
  const peakSkinRow = meanSkinRows.indexOf(Math.max(...meanSkinRows)) / GH;
  // The split line only means something on shots that actually have a body in frame.
  const withPresenter = shots.filter((s) => s.presenter && s.presenter.heightRatio > 0.12);
  const splitLines = withPresenter.map((s) => s.splitLine).filter((v) => v != null).sort((a, b) => a - b);
  const medianSplit = splitLines.length ? splitLines[Math.floor(splitLines.length / 2)] : null;
  const presenterWidths = withPresenter.map((s) => s.presenter.widthRatio).sort((a, b) => a - b);
  const medianWidth = presenterWidths.length ? presenterWidths[Math.floor(presenterWidths.length / 2)] : null;

  const report = {
    video: path.basename(VIDEO),
    measuredAt: new Date().toISOString(),
    meta,
    cuts,
    shots,
    summary: {
      shots: shots.length,
      cutsPerMinute: Number(((cuts.length / (meta.duration / 60)) || 0).toFixed(1)),
      avgShotSeconds: Number((meta.duration / shots.length).toFixed(2)),
      shortestShot: Number(Math.min(...shots.map((s) => s.seconds)).toFixed(2)),
      longestShot: Number(Math.max(...shots.map((s) => s.seconds)).toFixed(2)),
      kindMix: kinds,
      motionEnergy: Number((motionTotal / Math.max(1, frameCount)).toFixed(4)),
      presenterBandStart: Number(peakSkinRow.toFixed(3)),
      splitLineMedian: medianSplit,
      presenterWidthMedian: medianWidth,
      shotsWithPresenter: withPresenter.length,
      rowLuma: norm(rowLuma),
      rowPaper: norm(rowPaper),
      rowSkin: meanSkinRows,
      rowOrange: norm(rowOrange),
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('tipos    : ' + Object.entries(kinds).map(([k, v]) => k + ' x' + v).join(', '));
  console.log('apresent.: ' + withPresenter.length + '/' + shots.length + ' planos com corpo; linha de divisao mediana ' + (medianSplit != null ? (medianSplit * 100).toFixed(0) + '% da altura' : 'n/d') + ', largura mediana ' + (medianWidth != null ? (medianWidth * 100).toFixed(0) + '%' : 'n/d'));
  console.log('energia  : movimento medio ' + report.summary.motionEnergy + ' (0-1)');
  console.log('relatorio: ' + OUT);

  // contact sheet: one still per shot so a human/agent can look at the real frames
  if (FRAMES) {
    fs.mkdirSync(FRAMES, { recursive: true });
    const list = [];
    for (const s of shots) {
      const mid = (s.start + (s.end - s.start) * 0.5).toFixed(2);
      const file = path.join(FRAMES, 'shot' + String(s.index).padStart(2, '0') + '.jpg');
      const r = await run(FFMPEG, ['-y', '-v', 'error', '-ss', String(mid), '-i', VIDEO, '-vframes', '1', '-vf', 'scale=270:-2', '-q:v', '4', file]);
      if (r.code === 0 && fs.existsSync(file)) list.push({ shot: s.index, file, at: Number(mid) });
    }
    fs.writeFileSync(path.join(FRAMES, 'shots.json'), JSON.stringify(list, null, 2) + '\n', 'utf8');
    console.log('frames   : ' + list.length + ' stills em ' + FRAMES);
  }
}

function zeroBand() {
  return { luma: 0, paper: 0, dark: 0, skin: 0, orange: 0 };
}
function addBand(a, b) {
  return {
    luma: a.luma + b.luma, paper: a.paper + b.paper, dark: a.dark + b.dark,
    skin: a.skin + b.skin, orange: a.orange + b.orange,
  };
}
function roundBand(b) {
  return { luma: b.luma, paper: b.paper, dark: b.dark, skin: b.skin, orange: b.orange };
}

main().catch((e) => {
  console.error('erro: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
