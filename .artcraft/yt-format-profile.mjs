#!/usr/bin/env node
/**
 * Format profile — o passo que faltava entre "este canal bomba" e "faz o nosso".
 *
 * Lê um vídeo de referência e devolve a ANATOMIA do formato, não o conteúdo:
 *   duração, aspecto, nº de planos, ritmo de corte, paleta dominante, presença de texto.
 *
 * Usa a skill video-understand do OpenMontage para os frames e o ffmpeg para os cortes.
 * Tudo offline, sem chaves.
 *
 * Uso:
 *   node yt-format-profile.mjs --video "D:\CRAFT\work\reference\jazzghost.mp4"
 *                              [--out work/reference/jazzghost.format.json]
 *                              [--threshold 0.15] [--frames 12]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CC = 'D:\\CRAFT';
const HOME = process.env.USERPROFILE || process.env.HOME || '';
const OPENMONTAGE = path.join(CC, 'OpenMontage');
const UNDERSTAND = path.join(OPENMONTAGE, '.agents', 'skills', 'video-understand', 'scripts', 'understand_video.py');
const PY = path.join(OPENMONTAGE, '.venv', 'Scripts', 'python.exe');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const VIDEO = arg('video', '');
const OUT = arg('out', '');
const THRESHOLD = Number(arg('threshold', '0.15'));
const MAX_FRAMES = Number(arg('frames', '12'));

function findBin(name) {
  const roots = [
    path.join(HOME, 'AppData', 'Local', 'hermes', 'tools'),
    path.join(HOME, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (!/ffmpeg/i.test(entry)) continue;
      const base = path.join(root, entry);
      for (const c of [
        path.join(base, 'bin', name + '.exe'),
        path.join(base, 'ffmpeg-9.0.1-win32-x64', 'bin', name + '.exe'),
      ]) if (fs.existsSync(c)) return c;
      try {
        for (const sub of fs.readdirSync(base)) {
          const p = path.join(base, sub, 'bin', name + '.exe');
          if (fs.existsSync(p)) return p;
        }
      } catch { /* not a dir */ }
    }
  }
  return '';
}

const FFMPEG = findBin('ffmpeg');
const FFPROBE = findBin('ffprobe');

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, cwd: (opts && opts.cwd) || CC, env: (opts && opts.env) || process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e.message) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function probe(file) {
  const r = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=width,height,r_frame_rate,codec_type', '-of', 'json', file]);
  try {
    const j = JSON.parse(r.stdout);
    const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
    const fpsRaw = String(v.r_frame_rate || '0/1').split('/');
    const fps = Number(fpsRaw[0]) / Number(fpsRaw[1] || 1);
    return {
      duration: Number(j.format?.duration || 0),
      width: Number(v.width || 0),
      height: Number(v.height || 0),
      fps: Number.isFinite(fps) ? Math.round(fps * 100) / 100 : 0,
    };
  } catch {
    return { duration: 0, width: 0, height: 0, fps: 0 };
  }
}

/** Conta mudanças de plano com showinfo e devolve os instantes dos cortes. */
async function detectCuts(file, threshold) {
  const r = await run(FFMPEG, [
    '-hide_banner', '-i', file,
    '-vf', `select='gt(scene,${threshold})',showinfo`,
    '-an', '-f', 'null', '-',
  ]);
  const cuts = [];
  const re = /pts_time:([0-9.]+)/g;
  let m;
  while ((m = re.exec(r.stderr)) !== null) cuts.push(Number(m[1]));
  return cuts;
}

/** Paleta dominante a partir dos frames extraídos (PIL no venv do OpenMontage). */
async function palette(framesDir) {
  const files = fs.existsSync(framesDir)
    ? fs.readdirSync(framesDir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).slice(0, 20).map((f) => path.join(framesDir, f))
    : [];
  if (!files.length || !fs.existsSync(PY)) return [];

  const code = `
import json, sys
from PIL import Image
agg={}
for p in sys.argv[1:]:
    try:
        im = Image.open(p).convert("RGB").resize((80,80))
        for count,(r,g,b) in im.getcolors(80*80) or []:
            # agrupa em baldes de 16 para nao ter 400 cores distintas
            k = "#%02X%02X%02X" % ((r//16)*16+8, (g//16)*16+8, (b//16)*16+8)
            agg[k]=agg.get(k,0)+count
    except Exception:
        pass
res=sorted(agg.items(), key=lambda kv: -kv[1])[:6]
print(json.dumps([{"hex":h,"weight":c} for h,c in res]))
`;
  const r = await run(PY, ['-c', code, ...files]);
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop());
  } catch {
    return [];
  }
}

async function understand(file, framesDir) {
  if (!fs.existsSync(UNDERSTAND) || !fs.existsSync(PY)) return null;
  const out = path.join(path.dirname(file), path.basename(file, path.extname(file)) + '.understand.json');
  const env = Object.assign({}, process.env);
  env.PATH = path.dirname(FFMPEG) + ';' + (env.PATH || '');
  env.PYTHONIOENCODING = 'utf-8';
  const r = await run(PY, [UNDERSTAND, file, '--no-transcribe', '--max-frames', String(MAX_FRAMES), '-o', out], { env });
  if (fs.existsSync(out)) {
    try {
      return JSON.parse(fs.readFileSync(out, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  if (!VIDEO || !fs.existsSync(VIDEO)) {
    console.error('usa --video <ficheiro.mp4>');
    process.exit(2);
  }
  if (!FFMPEG || !FFPROBE) throw new Error('ffmpeg/ffprobe nao encontrados');

  const meta = await probe(VIDEO);
  const cuts = await detectCuts(VIDEO, THRESHOLD);
  const understood = await understand(VIDEO, path.dirname(VIDEO));
  const framesDir = path.join(path.dirname(VIDEO), path.basename(VIDEO, path.extname(VIDEO)) + '_frames');
  const colours = await palette(framesDir);

  const shots = cuts.length + 1;
  const cutRate = meta.duration > 0 ? (cuts.length / meta.duration) * 60 : 0;
  const avgShot = shots > 0 ? meta.duration / shots : 0;
  const aspect = meta.height > 0 ? meta.width / meta.height : 0;
  const vertical = aspect < 0.8;
  const square = aspect >= 0.8 && aspect < 1.2;

  const profile = {
    generatedAt: new Date().toISOString(),
    source: path.basename(VIDEO),
    duration: Math.round(meta.duration * 100) / 100,
    resolution: { width: meta.width, height: meta.height },
    fps: meta.fps,
    aspect: aspect.toFixed(3),
    shape: vertical ? 'vertical (9:16)' : square ? 'square (1:1)' : 'horizontal (16:9)',
    shots,
    cuts: cuts.map((c) => Math.round(c * 100) / 100),
    cutsPerMinute: Math.round(cutRate * 10) / 10,
    avgShotSeconds: Math.round(avgShot * 100) / 100,
    pacing: cutRate > 25 ? 'rapido' : cutRate > 10 ? 'medio' : 'lento (plano continuo)',
    palette: colours,
    framesAnalysed: understood ? understood.frame_count : 0,
    transcriptWords: understood && understood.text ? understood.text.trim().split(/\s+/).length : 0,
  };

  // receita de produção derivada do formato medido
  profile.recipe = {
    sceneSeconds: Math.max(1.5, Math.round(avgShot * 10) / 10),
    targetDuration: Math.round(meta.duration),
    resolution: { width: meta.width, height: meta.height },
    fps: meta.fps,
    cutStyle: cutRate > 25 ? 'cortes rapidos' : cutRate > 10 ? 'cortes medios' : 'plano unico (apresentador)',
    structure: cutRate > 25
      ? ['gancho 0-3s', 'blocos de 2-4s', 'remate', 'CTA']
      : ['gancho 0-5s', 'apresentador a falar', 'remate', 'CTA'],
  };

  const outFile = OUT || path.join(path.dirname(VIDEO), path.basename(VIDEO, path.extname(VIDEO)) + '.format.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(profile, null, 2) + '\n', 'utf8');

  console.log('formato  : ' + profile.shape + '  ' + profile.resolution.width + 'x' + profile.resolution.height + ' @' + profile.fps + 'fps');
  console.log('duracao  : ' + profile.duration + 's em ' + profile.shots + ' plano(s)');
  console.log('ritmo    : ' + profile.cutsPerMinute + ' cortes/min (' + profile.pacing + '), plano medio ' + profile.avgShotSeconds + 's');
  console.log('paleta   : ' + (profile.palette.slice(0, 3).map((p) => p.hex).join(' ') || 'n/d'));
  console.log('ficheiro : ' + outFile);
}

main().catch((e) => {
  console.error('ERRO: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
