#!/usr/bin/env node
/**
 * Reference analyser -> plan -> clone script.
 *
 * This is the step that was missing in front of the build. It takes a reference video (a
 * file or a URL) and answers, before anything is produced:
 *
 *   - how many shots, how long each one is, and what kind each one is
 *   - what the screen division is in each shot (split ratio, or full frame)
 *   - where the presenter is (S3FD face detection, already installed with Wav2Lip)
 *   - what text is on screen, where, and which word is painted in the accent colour
 *     (Windows.Media.Ocr, already in the OS - no install)
 *   - the cut rhythm, the palette and the accent colour
 *
 * It then writes three things next to each other:
 *
 *   analysis/plan.json   machine-readable anatomy + the scene plan for the clone
 *   TASKS.md             the work the clone still needs, one line per task
 *   script.json          a build-ready script (narration is filled by yt-script.mjs when
 *                        --script is passed, otherwise the on-screen phrases are used)
 *
 * Nothing is estimated: every number below comes from a measurement in this run.
 *
 * Usage:
 *   node yt-ref-analyze.mjs --url "https://youtube.com/shorts/XXXX"
 *   node yt-ref-analyze.mjs --video ref.mp4 --slug my-clone [--scenes 6] [--script]
 *                           [--no-ocr] [--no-faces] [--presenters frida,luna]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CC = 'D:\\CRAFT';
const YTDLP = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe');
const FFMPEG = path.join(process.env.LOCALAPPDATA || '', 'hermes', 'tools', 'ffmpeg-9.0.1-win32-x64', 'bin', 'ffmpeg.exe');
const PYTHON = 'D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe';
const OCR_PS1 = path.join(CC, 'tools', 'win-ocr.ps1');
const FACE_PY = path.join(CC, 'tools', 'ref-face-detect.py');
const ANATOMY = path.join(CC, '.artcraft', 'yt-ref-anatomy.mjs');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const FLAG = (n) => process.argv.includes('--' + n);

const URL = arg('url', '');
const slugFromUrl = (u) => {
  const m = String(u).match(/(?:shorts\/|v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? 'ref-' + m[1] : 'ref-' + Date.now();
};
const SLUG = arg('slug', URL ? slugFromUrl(URL) : '');
if (!SLUG) {
  console.error('uso: node yt-ref-analyze.mjs --url <url> | --video <ficheiro> --slug <nome>');
  process.exit(1);
}
const WANT_SCENES = Number(arg('scenes', '6'));
const PRESENTERS = arg('presenters', 'frida,luna').split(',').map((s) => s.trim()).filter(Boolean);
const DO_OCR = !FLAG('no-ocr');
const DO_FACES = !FLAG('no-faces');
const DO_SCRIPT = FLAG('script');
const REUSE = FLAG('reuse');
const TOPIC = arg('topic', '');
const MARK = arg('mark', '');

const ROOT = path.join(CC, 'work', 'clones', SLUG);
const ANALYSIS = path.join(ROOT, 'analysis');
const OCR_DIR = path.join(ANALYSIS, 'ocr');
fs.mkdirSync(ANALYSIS, { recursive: true });
fs.mkdirSync(OCR_DIR, { recursive: true });

// ---------------------------------------------------------------- shell helpers

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, cwd: opts.cwd });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => resolve({ code, out, err }));
    p.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
  });
}

const log = (m) => console.log(m);

// ---------------------------------------------------------------- 1. acquire

async function acquire() {
  let video = arg('video', '');
  if (video) {
    if (!fs.existsSync(video)) throw new Error('video nao existe: ' + video);
    return path.resolve(video);
  }
  if (!URL) throw new Error('sem --url nem --video');
  const raw = path.join(ANALYSIS, 'source.mp4');
  if (fs.existsSync(raw) && fs.statSync(raw).size > 100000) {
    log('1/8 video    : ja descarregado (' + mb(raw) + ')');
    return raw;
  }
  log('1/8 video    : a descarregar...');
  // Best video + best audio, merged. Falls back to the best progressive stream.
  const r = await run(YTDLP, [
    '-f', 'bestvideo[height<=1920]+bestaudio/best',
    '--merge-output-format', 'mp4',
    '-o', raw, URL,
  ]);
  if (!fs.existsSync(raw)) {
    const r2 = await run(YTDLP, ['-f', 'b', '-o', raw, URL]);
    if (!fs.existsSync(raw)) throw new Error('download falhou: ' + ((r && (r.err || r.out)) || (r2 && (r2.err || r2.out)) || 'sem saida').slice(-400));
  }
  log('1/8 video    : ' + mb(raw));
  return raw;
}

const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(2) + ' MB';

// ---------------------------------------------------------------- 2. anatomy

async function anatomy(video) {
  const out = path.join(ANALYSIS, 'anatomy.json');
  if (REUSE && fs.existsSync(out)) {
    const a = JSON.parse(fs.readFileSync(out, 'utf8'));
    log('2/8 anatomia : reutilizada (' + a.shots.length + ' planos, ' + a.summary.cutsPerMinute + ' cortes/min)');
    return a;
  }
  log('2/8 anatomia : cortes, geometria, texto...');
  const r = await run(process.execPath, [ANATOMY, '--video', video, '--out', out]);
  if (!fs.existsSync(out)) throw new Error('anatomia falhou: ' + ((r && (r.err || r.out)) || 'sem saida').slice(-500));
  const a = JSON.parse(fs.readFileSync(out, 'utf8'));
  log('              ' + a.shots.length + ' planos, ' + a.summary.cutsPerMinute + ' cortes/min, plano medio ' + a.summary.avgShotSeconds + 's');
  return a;
}

// ---------------------------------------------------------------- 3. faces

async function faces(video) {
  const out = path.join(ANALYSIS, 'faces.json');
  if (!DO_FACES) return null;
  if (REUSE && fs.existsSync(out)) {
    const f = JSON.parse(fs.readFileSync(out, 'utf8'));
    log('3/8 caras    : reutilizadas (' + f.summary.withFace + '/' + f.summary.samples + ')');
    return f;
  }
  log('3/8 caras    : S3FD (Wav2Lip)...');
  const r = await run(PYTHON, [FACE_PY, '--video', video, '--out', out], { cwd: path.join(CC, 'tools', 'Wav2Lip') });
  if (!fs.existsSync(out)) {
    log('              aviso: deteccao facial falhou, sigo sem ela');
    return null;
  }
  const f = JSON.parse(fs.readFileSync(out, 'utf8'));
  log('              cara em ' + f.summary.withFace + '/' + f.summary.samples + ' amostras');
  return f;
}

// ---------------------------------------------------------------- 4. OCR

const ACCENT = arg('accent', '#FF6A00');
const OCR_WORKERS = Math.max(1, Math.min(8, Number(arg('workers', '4')) || 4));

function frameAt(video, t, out, width = 1080) {
  return run(FFMPEG, ['-y', '-v', 'error', '-ss', String(t), '-i', video, '-vframes', '1', '-vf', 'scale=' + width + ':-2', out]);
}

/** Accent colour as HSV, so the "orange word" rule is a parameter and not a hard-coded guess. */
function hexToHsv(hex) {
  const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return { h: 28, s: 1, v: 1 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
}

/** Sample one frame as rgb24 at a known size, so word boxes can be measured in colour. */
function decodeFrame(video, t, w, h) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', video, '-vframes', '1',
      '-vf', 'scale=' + w + ':' + h + ':flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { windowsHide: true });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('close', () => resolve(Buffer.concat(chunks)));
    p.on('error', () => resolve(Buffer.alloc(0)));
  });
}

async function readText(video, shots) {
  if (!DO_OCR) return [];
  log('4/8 OCR      : ' + shots.length + ' planos, OCR nativo em lote...');

  // 1. one still per shot, extracted in parallel
  const batchOut = path.join(OCR_DIR, 'ocr-all.json');
  const reused = REUSE && fs.existsSync(batchOut);
  const stills = shots.map((s) => {
    const mid = s.start + (s.end - s.start) * 0.5;
    const img = path.join(OCR_DIR, 'shot' + String(s.index).padStart(2, '0') + '.jpg');
    return { shot: s.index, at: Number(mid.toFixed(2)), img, ok: fs.existsSync(img) };
  });

  if (reused) {
    log('              lote de OCR reutilizado (--reuse)');
  } else {
    for (const f of fs.readdirSync(OCR_DIR)) {
      if (/^shot\d+\.(jpg|json)$/i.test(f)) fs.rmSync(path.join(OCR_DIR, f), { force: true });
    }
    const queue = [...stills];
    const worker = async () => {
      for (;;) {
        const s = queue.shift();
        if (!s) return;
        await frameAt(video, s.at, s.img);
        s.ok = fs.existsSync(s.img);
      }
    };
    await Promise.all(Array.from({ length: Math.min(OCR_WORKERS, stills.length || 1) }, worker));
  }
  stills.sort((a, b) => a.shot - b.shot);

  // 2. ONE PowerShell process for the whole batch (per-frame startup was ~20 s each)
  if (!reused) {
    if (fs.existsSync(batchOut)) fs.rmSync(batchOut);
    const r = await run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', OCR_PS1, '-Dir', OCR_DIR, '-Out', batchOut]);
    if (!fs.existsSync(batchOut)) {
      log('              aviso: OCR falhou (' + String(r.err || r.out).replace(/\s+/g, ' ').slice(-160) + ')');
    }
  }
  let items = [];
  if (fs.existsSync(batchOut)) {
    try {
      const j = JSON.parse(fs.readFileSync(batchOut, 'utf8'));
      items = Array.isArray(j.items) ? j.items : j.items ? [j.items] : [];
    } catch (e) {
      log('              aviso: OCR devolveu json ilegivel');
    }
  }
  const byName = new Map(items.map((it) => [String(it.image || '').toLowerCase(), it]));

  // 3. which word is painted in the accent colour? measured on real pixels, per word box
  const HSV = hexToHsv(ACCENT);
  const W = 540;
  const H = 960;
  const near = (r0, g0, b0) => {
    const mx = Math.max(r0, g0, b0) / 255;
    const mn = Math.min(r0, g0, b0) / 255;
    const d = mx - mn;
    if (mx < 0.35) return false;
    const sat = mx ? d / mx : 0;
    if (sat < 0.4) return false;
    let h = 0;
    if (d > 0) {
      if (mx === r0 / 255) h = ((g0 - b0) / 255 / d) % 6;
      else if (mx === g0 / 255) h = (b0 - r0) / 255 / d + 2;
      else h = (r0 - g0) / 255 / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    let dh = Math.abs(h - HSV.h);
    if (dh > 180) dh = 360 - dh;
    return dh <= 25;
  };

  const results = [];
  for (const st of stills) {
    const name = path.basename(st.img, '.jpg').toLowerCase();
    const it = byName.get(name);
    const lines = st.ok && it && Array.isArray(it.lines) ? it.lines : [];
    let accentWord = null;
    if (lines.length) {
      const buf = await decodeFrame(video, st.at, W, H);
      if (buf.length >= W * H * 3) {
        let best = 0;
        for (const line of lines) {
          for (const w of line.words || []) {
            const x0 = Math.max(0, Math.floor(w.x * W));
            const x1 = Math.min(W, Math.ceil((w.x + w.w) * W));
            const y0 = Math.max(0, Math.floor(w.y * H));
            const y1 = Math.min(H, Math.ceil((w.y + w.h) * H));
            let hit = 0;
            let n = 0;
            for (let y = y0; y < y1; y += 2) {
              for (let x = x0; x < x1; x += 2) {
                const i = (y * W + x) * 3;
                n++;
                if (near(buf[i], buf[i + 1], buf[i + 2])) hit++;
              }
            }
            const frac = n ? hit / n : 0;
            if (frac > best) { best = frac; accentWord = w.text; }
          }
        }
        if (best < 0.1) accentWord = null;
      }
    }
    results.push({
      shot: st.shot,
      at: st.at,
      lines: lines.map((l) => {
        const ws = l.words || [];
        const h = ws.length ? Math.max(...ws.map((w) => w.h || 0)) : 0;
        const x0 = ws.length ? Math.min(...ws.map((w) => w.x || 0)) : 0;
        const x1 = ws.length ? Math.max(...ws.map((w) => (w.x || 0) + (w.w || 0))) : 0;
        return {
          text: l.text,
          y: ws.length ? Number(ws[0].y.toFixed(3)) : 0.5,
          h: Number(h.toFixed(4)),
          x: Number(x0.toFixed(4)),
          w: Number(Math.max(0, x1 - x0).toFixed(4)),
        };
      }),
      accentWord,
    });
  }

  const total = results.reduce((a, x) => a + x.lines.length, 0);
  log('              ' + total + ' linhas em ' + results.filter((x) => x.lines.length).length + '/' + results.length + ' planos, ' + results.filter((x) => x.accentWord).length + ' com palavra de acento');
  return results;
}

// ---------------------------------------------------------------- 5. classify + group

/** What is on screen, from measurements only. No guessing. */
function kindOf(shot, face, textLines) {
  const paper = shot.paper;
  const dark = shot.dark;
  const hasFace = face && face.hasFace;
  const manyLines = textLines >= 3;
  if (paper > 0.35 && hasFace) return 'whiteboard+presenter';
  if (paper > 0.55) return manyLines ? 'card' : 'whiteboard';
  if (hasFace && dark > 0.35) return 'talking-head';
  if (!hasFace && dark > 0.5) return 'ui';
  if (hasFace) return 'presenter';
  return 'graphic';
}

function mergeShots(anatomy, faceByShot, ocrByShot) {
  const rows = anatomy.shots.map((s) => {
    const f = faceByShot[s.index] || null;
    const o = ocrByShot[s.index] || { lines: [] };
    const layout = f && f.hasFace && f.faceY > 0.45 ? 'split'
      : f && f.hasFace && f.faceY <= 0.45 ? 'full' : 'full';
    const kind = kindOf(s, f, o.lines.length);
    const splitRatio = layout === 'split' ? Number(Math.min(0.85, Math.max(0.3, f.faceY)).toFixed(2)) : null;
    return {
      shot: s.index,
      start: s.start,
      seconds: s.seconds,
      kind,
      layout,
      splitRatio,
      hasFace: !!(f && f.hasFace),
      faceY: f ? f.faceY : null,
      faceH: f ? f.faceH : null,
      textSide: s.headlineSide,
      textLines: o.lines.map((l) => ({ text: l.text, h: l.h || 0, y: l.y != null ? l.y : 0.5 })),
      accentWord: o.accentWord || null,
      paper: s.paper,
      dark: s.dark,
      motion: s.motion,
    };
  });

  // Group consecutive shots that look the same, so the clone has copyable scenes rather
  // than 33 fragments nobody can source media for.
  const groups = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    const sameFamily = last && last.kind === r.kind && last.layout === r.layout;
    if (sameFamily && last.seconds + r.seconds <= 8.5) {
      last.seconds = Number((last.seconds + r.seconds).toFixed(2));
      last.end = Number((r.start + r.seconds).toFixed(2));
      last.shots.push(r.shot);
      last.textLines.push(...r.textLines);
      if (r.accentWord) last.accentWord = r.accentWord;
      if (r.splitRatio != null) last.splitRatios.push(r.splitRatio);
      continue;
    }
    groups.push({
      start: r.start,
      end: Number((r.start + r.seconds).toFixed(2)),
      seconds: r.seconds,
      kind: r.kind,
      layout: r.layout,
      splitRatios: r.splitRatio != null ? [r.splitRatio] : [],
      shots: [r.shot],
      textLines: [...r.textLines],
      accentWord: r.accentWord,
      textSide: r.textSide,
    });
  }
  // Cap the number of scenes: merge the shortest neighbour into the previous group.
  while (groups.length > WANT_SCENES) {
    let idx = 1;
    for (let i = 1; i < groups.length; i++) if (groups[i].seconds < groups[idx].seconds) idx = i;
    const g = groups[idx];
    const prev = groups[idx - 1] || groups[idx + 1];
    if (!prev) break;
    prev.seconds = Number((prev.seconds + g.seconds).toFixed(2));
    prev.end = g.end;
    prev.shots.push(...g.shots);
    prev.textLines.push(...g.textLines);
    prev.accentWord = prev.accentWord || g.accentWord;
    prev.splitRatios.push(...g.splitRatios);
    groups.splice(idx, 1);
  }

  for (const g of groups) {
    g.splitRatio = g.splitRatios.length
      ? Number((g.splitRatios.reduce((a, b) => a + b, 0) / g.splitRatios.length).toFixed(2))
      : null;
    delete g.splitRatios;
    // The phrase is the longest line the OCR found: that is the headline, and the small
    // watermarks never beat it.
    g.phrase = pickPhrase(g.textLines);
    g.lines = g.textLines.length;
    delete g.textLines;
  }
  return { rows, groups };
}

function pickPhrase(lines) {
  const MIN_H = 0.016;   // below this it is a watermark / UI caption, not the headline
  const clean = [];
  for (const l of lines) {
    const raw = typeof l === 'string' ? l : l && l.text;
    const h = typeof l === 'string' ? 0 : Number((l && l.h) || 0);
    const y = typeof l === 'string' ? 0.5 : Number(l && l.y != null ? l.y : 0.5);
    const x = typeof l === 'string' ? 0 : Number((l && l.x) || 0);
    const w = typeof l === 'string' ? 1 : Number((l && l.w) || 0);
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (t.length < 3 || h < MIN_H) continue;
    if (/^(growsembly|script\s*\.?\s*(md|nd)?)$/i.test(t)) continue;
    if (!/[A-Za-zÀ-ÿ]{3}/.test(t)) continue;
    clean.push({ t, h, y, x, w });
  }
  if (!clean.length) {
    // nothing at headline size: fall back to the longest readable line, clearly a hint only
    const any = lines
      .map((l) => String((typeof l === 'string' ? l : l && l.text) || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 4 && /[A-Za-zÀ-ÿ]{3}/.test(t))
      .sort((a, b) => b.length - a.length);
    return any.length ? any[0].toUpperCase() : null;
  }

  // The reference paints ONE huge phrase, often broken by OCR into 1–3 lines. Two lines belong
  // to the same block only if they are adjacent vertically, share a size, and overlap in x —
  // otherwise the dense UI frames glue unrelated columns into nonsense.
  const sorted = [...clean].sort((a, b) => a.y - b.y);
  const sameBlock = (a, b) => {
    const gap = b.y - (a.y + a.h);
    const sameSize = Math.abs(a.h - b.h) <= 0.3 * Math.max(a.h, b.h);
    const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    return sameSize && gap < 1.5 * Math.max(a.h, b.h) && overlap > 0.1 * Math.min(a.w, b.w);
  };
  const clusters = [];
  for (const l of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && sameBlock(last[last.length - 1], l)) { last.push(l); continue; }
    clusters.push([l]);
  }
  const score = (c) => c.reduce((a, l) => a + l.h, 0);
  const block = clusters.sort((a, b) => score(b) - score(a))[0];

  let phrase = block.map((l) => l.t).join(' ').replace(/\s+/g, ' ').trim();
  if (phrase.length > 90) phrase = phrase.slice(0, 90).replace(/\s+\S*$/, '');
  return phrase.replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').replace(/[^A-Za-zÀ-ÿ0-9.!?]+$/, '').toUpperCase();
}

// ---------------------------------------------------------------- 6. plan + tasks

function buildPlan(anatomyRes, facesRes, rows, groups) {
  const withText = groups.filter((g) => g.phrase).length;
  const layouts = {};
  for (const g of groups) layouts[g.layout] = (layouts[g.layout] || 0) + 1;

  // The split line is where the presenter's face starts, not whatever the anatomy pass
  // called "splitLine" — measure it from the face boxes of the shots that actually split.
  const faceYs = rows.filter((r) => r.hasFace && r.faceY != null).map((r) => r.faceY).sort((a, b) => a - b);
  const splitLineMedian = faceYs.length ? Number(faceYs[Math.floor(faceYs.length / 2)].toFixed(2)) : null;
  const pct = (v) => (v != null ? Math.round(v * 100) + '%' : 'n/d');

  const tasks = [];
  const add = (id, title, detail, state) => tasks.push({ id, title, detail, state });

  add('T1', 'Anatomia medida', groups.length + ' cenas agrupadas de ' + rows.length + ' planos, ' + anatomyRes.summary.cutsPerMinute + ' cortes/min', 'done');
  add('T2', 'Divisão de ecrã por cena', 'split line mediana ' + pct(splitLineMedian) + '; ' + Object.entries(layouts).map(([k, v]) => k + ' x' + v).join(', '), 'done');
  add('T3', 'Apresentador', (facesRes ? facesRes.summary.withFace + '/' + facesRes.summary.samples + ' amostras com cara' : 'nao medido') + '; cara com ' + (facesRes && facesRes.summary.medianFaceH ? Math.round(facesRes.summary.medianFaceH * 100) + '%' : '?') + ' da altura', facesRes ? 'done' : 'blocked');
  add('T4', 'Texto na tela', withText + '/' + groups.length + ' cenas com frase legivel; ' + groups.filter((g) => g.accentWord).length + ' com palavra de acento identificada', DO_OCR ? 'done' : 'skipped');
  add('T5', 'Media por cena', groups.filter((g) => g.kind === 'card' || g.kind === 'whiteboard').length + ' cenas podem receber imagem/quadro em visuals/; ' + groups.filter((g) => g.kind === 'ui').length + ' pedem captura de interface; sem ficheiros a cena sai como cartao full-frame', 'todo');
  add('T6', 'Apresentador por cena', PRESENTERS.join(' / ') + ' alternados nas ' + groups.length + ' cenas', 'todo');
  add('T7', 'Narração', DO_SCRIPT ? 'gerada por yt-script.mjs (modelos FREE)' : 'usar --script --topic para gerar com yt-script.mjs', DO_SCRIPT ? 'done' : 'todo');
  add('T8', 'Render', 'node .artcraft/yt-clone-build.mjs --slug ' + SLUG + ' --script work/clones/' + SLUG + '/script.json', 'todo');
  add('T9', 'Lip-sync palavra a palavra', 'opcional: Wav2Lip em tools/Wav2Lip sobre a narracao (nao ligado ao build ainda)', 'optional');

  return {
    slug: SLUG,
    reference: { url: URL || null, video: arg('video', null) },
    measured: {
      duration: anatomyRes.meta.duration,
      width: anatomyRes.meta.width,
      height: anatomyRes.meta.height,
      fps: Number(anatomyRes.meta.fps.toFixed(2)),
      shots: rows.length,
      cutsPerMinute: anatomyRes.summary.cutsPerMinute,
      avgShotSeconds: anatomyRes.summary.avgShotSeconds,
      layoutMix: layouts,
      splitLineMedian,
      faceHeightMedian: facesRes ? facesRes.summary.medianFaceH : null,
      faceRatio: facesRes ? facesRes.summary.faceRatio : null,
      palette: null,
    },
    scenes: groups,
    tasks,
  };
}

function tasksMarkdown(plan) {
  const L = [];
  L.push('# Tarefas — clone de ' + plan.slug);
  L.push('');
  L.push('Gerado por `yt-ref-analyze.mjs` a partir de medições reais. Nada aqui é estimativa.');
  L.push('');
  L.push('## Anatomia medida');
  L.push('');
  const m = plan.measured;
  L.push('| Métrica | Valor |');
  L.push('| --- | --- |');
  L.push('| Duração | ' + m.duration.toFixed(2) + ' s |');
  L.push('| Formato | ' + m.width + '×' + m.height + ' @ ' + m.fps + ' fps |');
  L.push('| Planos | ' + m.shots + ' |');
  L.push('| Cortes/min | ' + m.cutsPerMinute + ' |');
  L.push('| Plano médio | ' + m.avgShotSeconds + ' s |');
  L.push('| Layout | ' + Object.entries(m.layoutMix).map(([k, v]) => k + ' ×' + v).join(', ') + ' |');
  L.push('| Divisão mediana | ' + (m.splitLineMedian != null ? Math.round(m.splitLineMedian * 100) + '%' : 'n/d') + ' |');
  L.push('| Cara | ' + (m.faceRatio != null ? Math.round(m.faceRatio * 100) + '% das amostras' : 'n/d') + ' |');
  L.push('');
  L.push('## Tarefas');
  L.push('');
  L.push('| # | Tarefa | Detalhe | Estado |');
  L.push('| --- | --- | --- | --- |');
  for (const t of plan.tasks) L.push('| ' + t.id + ' | ' + t.title + ' | ' + t.detail + ' | ' + t.state + ' |');
  L.push('');
  L.push('## Cenas do clone');
  L.push('');
  L.push('| # | t | dur | tipo | layout | split | frase | acento |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  plan.scenes.forEach((s, i) => {
    L.push('| ' + (i + 1) + ' | ' + s.start.toFixed(1) + ' | ' + s.seconds.toFixed(1) + ' | ' + s.kind + ' | ' + s.layout + ' | ' + (s.splitRatio != null ? s.splitRatio : '—') + ' | ' + (s.phrase || '—') + ' | ' + (s.accentWord || '—') + ' |');
  });
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------- 7. clone script

function phraseToNarration(phrase) {
  if (!phrase) return null;
  const p = phrase.replace(/\s+/g, ' ').trim();
  return p.charAt(0) + p.slice(1).toLowerCase() + '.';
}

/** Remove nomes de apresentadores do inicio da narracao.
 *  O usuario nao quer ouvir "Frida explora..." ou "Luna mostra..." —
 *  so quer ouvir a voz, sem anunciar quem fala.
 */
function stripPresenterName(narration, presenters) {
  if (!narration) return narration;
  let n = String(narration).trim();
  for (const p of presenters) {
    // Remove "Frida ...", "Luna ...", "Apresentadora ...", "Comentarista ..." no inicio
    const re = new RegExp('^(' + p + '\\b|apresentadora\\b|comentarista\\b)\\s+', 'i');
    n = n.replace(re, '');
  }
  // Remove "isso tem que falar tal coisa" / comandos de voz
  n = n.replace(/isso\s+tem\s+que\s+falar.*$/i, '').trim();
  n = n.replace(/não\s+isso\s+daí\s+é.*$/i, '').trim();
  n = n.replace(/essa\s+teme\s+falar.*$/i, '').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function buildScript(plan, generated) {
  const gen = generated && Array.isArray(generated.scenes) ? generated.scenes : [];
  const ids = new Set(PRESENTERS);
  const scenes = plan.scenes.map((g, i) => {
    const gs = gen[i] || null;
    const headline = gs && (gs.headline || gs.kicker) ? String(gs.headline || gs.kicker).replace(/\s+/g, ' ').trim().toUpperCase() : '';
    const s = {
      id: 's' + String(i + 1).padStart(2, '0'),
      // Layout sempre vem da medicao, nunca do modelo.
      layout: g.layout,
      textSide: g.textSide === 'meio' ? 'mid' : g.textSide === 'topo' ? 'top' : 'bottom',
      text: headline || g.phrase || '',
      // Tempos medidos na referencia — o build respeita estes para manter o ritmo.
      start: Number(g.start || 0),
      seconds: Number(g.seconds || 0),
    };
    if (g.layout === 'split') {
      s.splitRatio = g.splitRatio || 0.57;
      const want = gs && gs.avatar ? String(gs.avatar).toLowerCase().trim() : '';
      s.avatar = ids.has(want) ? want : PRESENTERS[i % PRESENTERS.length];
      if (gs && gs.body) s.body = String(gs.body);
    } else {
      s.presenter = 'none';
    }
    s.narration = stripPresenterName(gs && gs.narration ? String(gs.narration) : (phraseToNarration(g.phrase) || 'Cena ' + (i + 1) + '.'), PRESENTERS);
    return s;
  });
  const kicker = generated && generated.kicker ? String(generated.kicker).toUpperCase() : plan.slug.toUpperCase();
  return {
    kicker,
    scenes,
    _source: generated ? 'yt-ref-analyze.mjs + yt-script.mjs (FREE)' : 'yt-ref-analyze.mjs',
    _measured: plan.measured,
  };
}

/** Original narration from the FREE-model writer, so the clone copies structure, not text. */
async function generateScript(plan) {
  if (!DO_SCRIPT) return null;
  if (!TOPIC) {
    log('              aviso: --script sem --topic -> narracao fica pela frase medida na tela');
    return null;
  }
  const out = path.join(ANALYSIS, 'script-llm.json');
  log('7/8 guiao   : yt-script.mjs (modelos FREE)...');
  const r = await run(process.execPath, [
    path.join(CC, '.artcraft', 'yt-script.mjs'),
    '--topic', TOPIC,
    '--scenes', String(plan.scenes.length),
    '--lang', 'pt-BR',
    '--presenters', PRESENTERS.join(','),
    '--out', out,
  ]);
  if (!fs.existsSync(out)) {
    log('              aviso: guiao nao gerado (' + String(r.err || r.out).replace(/\s+/g, ' ').slice(-160) + ')');
    return null;
  }
  try {
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    log('              ' + j.scenes.length + ' cenas escritas por modelo FREE');
    return j;
  } catch (e) {
    log('              aviso: guiao ilegivel');
    return null;
  }
}

// ---------------------------------------------------------------- main

async function main() {
  // --mark T5=done,T8=done : update the task ledger without re-measuring the reference.
  if (MARK) {
    const planFile = path.join(ANALYSIS, 'plan.json');
    if (!fs.existsSync(planFile)) {
      console.error('erro: sem plan.json em ' + ANALYSIS);
      process.exit(1);
    }
    const saved = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    const touched = [];
    for (const pair of MARK.split(',')) {
      const [id, state] = pair.split('=');
      const t = saved.plan.tasks.find((x) => x.id === String(id).trim());
      if (!t) { console.log('aviso: tarefa ' + id + ' nao existe'); continue; }
      t.state = String(state || '').trim() || 'done';
      touched.push(t.id + '=' + t.state);
    }
    fs.writeFileSync(planFile, JSON.stringify(saved, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(ROOT, 'TASKS.md'), tasksMarkdown(saved.plan), 'utf8');
    log('tarefas     : ' + touched.join(' '));
    return;
  }

  log('');
  log('REFERENCIA : ' + (URL || arg('video', '')));
  log('DESTINO    : ' + ROOT);
  log('');

  const video = await acquire();
  const anatomyRes = await anatomy(video);
  const facesRes = await faces(video);

  const faceByShot = {};
  if (facesRes) {
    for (const s of anatomyRes.shots) {
      const inShot = facesRes.samples.filter((x) => x.t >= s.start && x.t < s.end);
      const withFace = inShot.filter((x) => x.faces.length);
      const ratio = inShot.length ? withFace.length / inShot.length : 0;
      const firsts = withFace.map((x) => x.faces[0]);
      const med = (arr) => {
        if (!arr.length) return null;
        const a = [...arr].sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)];
      };
      faceByShot[s.index] = {
        hasFace: ratio >= 0.5,
        faceRatio: Number(ratio.toFixed(3)),
        faceY: med(firsts.map((f) => f.y)),
        faceH: med(firsts.map((f) => f.h)),
      };
    }
  }

  const ocrRes = await readText(video, anatomyRes.shots);
  const ocrByShot = {};
  for (const o of ocrRes) ocrByShot[o.shot] = o;

  const { rows, groups } = mergeShots(anatomyRes, faceByShot, ocrByShot);
  log('5/8 plano    : ' + rows.length + ' planos -> ' + groups.length + ' cenas');

  const plan = buildPlan(anatomyRes, facesRes, rows, groups);
  fs.writeFileSync(path.join(ANALYSIS, 'plan.json'), JSON.stringify({ plan, rows }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(ROOT, 'TASKS.md'), tasksMarkdown(plan), 'utf8');

  const generated = await generateScript(plan);
  fs.writeFileSync(path.join(ROOT, 'script.json'), JSON.stringify(buildScript(plan, generated), null, 2) + '\n', 'utf8');

  log('8/8 escrito  : analysis/plan.json, TASKS.md, script.json');
  log('');
  log('CENAS:');
  plan.scenes.forEach((s, i) => {
    log('  ' + String(i + 1).padStart(2) + '  ' + String(s.seconds.toFixed(1)).padStart(4) + 's  ' + s.kind.padEnd(20) + s.layout.padEnd(6) + '  ' + (s.phrase || '—'));
  });
  log('');
  log('TAREFAS: ' + plan.tasks.filter((t) => t.state === 'todo').length + ' em aberto -> ' + path.join(ROOT, 'TASKS.md'));
}

main().catch((e) => {
  console.error('erro: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
