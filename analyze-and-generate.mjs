#!/usr/bin/env node
/**
 * Reference-driven smart tops generator.
 *
 * Reads a reference video, analyzes it enough to get duration/fps/resolution and a
 * rough palette/tonality, then produces:
 *   - work/clones/<slug>/script.scenes.json
 *   - work/clones/<slug>/tops/top-<scene>.jsonl
 *   - work/clones/<slug>/tops/top-<scene>.ecproj
 *
 * Scene-aware variants per scene:
 *   captionA, captionB, layerStack, lowerThird, motionOverMedia
 *
 * motionOverMedia is a real EffectCraft composition with a backing visual (imported media
 * when available, otherwise a scene-tinted solid) and scene-specific colors/type scale.
 *
 * This script is self-contained: Node built-ins plus ffprobe/ffmpeg and the EffectCraft CLI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Common tool paths
// ---------------------------------------------------------------------------
const COMMON_TOOLS = [
  'C:/Program Files/Hermes/tools/ffmpeg-9.0.1-win32-x64/bin/ffprobe.exe',
  'C:/Program Files/Hermes/tools/ffmpeg-9.0.1-win32-x64/bin/ffmpeg.exe',
  'C:/Program Files/Python312/ffprobe.exe',
  'C:/Program Files/Python312/ffmpeg.exe',
];

function firstExisting(...candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const FFPROBE = firstExisting(...COMMON_TOOLS.map((p) => p.replace(/\\/g, '/')));
const FFMPEG = FFPROBE ? FFPROBE.replace('ffprobe.exe', 'ffmpeg.exe') : null;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const REFERENCE_VIDEO = process.argv[2];
const SLUG = process.argv[3] || 'ref-clone';

if (!REFERENCE_VIDEO) {
  console.error('Usage: node analyze-and-generate.mjs <reference.mp4> [slug]');
  process.exit(1);
}

const WORK_ROOT = path.resolve('work/clones', SLUG);
const SCRIPT_PATH = path.join(WORK_ROOT, 'script.scenes.json');
const TOPS_DIR = path.join(WORK_ROOT, 'tops');
const MEDIA_DIR = path.join(WORK_ROOT, 'media');
const SAMPLES_DIR = path.join(WORK_ROOT, '_ref_samples');
const CLONE_CONFIG_PATH = path.resolve('clone.config.json');

fs.mkdirSync(WORK_ROOT, { recursive: true });
fs.mkdirSync(TOPS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(SAMPLES_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Metadata from ffprobe
// ---------------------------------------------------------------------------
function probeVideo(filePath) {
  if (!FFPROBE) return null;
  const result = spawnSync(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,duration,nb_frames,codec_name',
    '-of', 'json',
    filePath,
  ]);
  if (result.status !== 0 || !result.stdout) return null;
  try {
    const json = JSON.parse(result.stdout);
    const stream = json.streams && json.streams[0];
    if (!stream) return null;
    const [num, den] = (stream.r_frame_rate || '30/1').split('/').map(Number);
    const fps = den && den !== 0 ? num / den : 30;
    return {
      width: stream.width,
      height: stream.height,
      fps,
      duration: stream.duration ? Number(stream.duration) : null,
      codec: stream.codec_name,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Frame extraction
// ---------------------------------------------------------------------------
const SAMPLE_TIMES = [0.2, 1.0, 2.0, 3.0, 4.0];

function extractFrames(filePath, outDir, times, width = 320) {
  const failures = [];
  if (!FFMPEG) {
    failures.push('ffmpeg not found; skipping frame extraction');
    return { frames: [], failures };
  }
  const frames = [];
  times.forEach((t, i) => {
    const outFile = path.join(outDir, `sample-${String(i).padStart(2, '0')}.png`);
    const result = spawnSync(FFMPEG, [
      '-y',
      '-ss', String(t),
      '-i', filePath,
      '-frames:v', '1',
      '-vf', `scale=${width}:-2`,
      '-v', 'error',
      outFile,
    ]);
    if (result.status === 0 && fs.existsSync(outFile)) {
      frames.push(outFile);
    } else {
      failures.push(`frame at ${t}s failed`);
    }
  });
  return { frames, failures };
}

// ---------------------------------------------------------------------------
// Simple palette/tonality from PNG frames
// ---------------------------------------------------------------------------
function inferPaletteFromFrames(frames) {
  if (!frames.length) return { label: 'neutral', avg: [128, 128, 128], failures: ['no frames'] };
  const failures = [];
  const validFrames = [];
  for (const f of frames) {
    try {
      const buf = fs.readFileSync(f);
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        failures.push(`${path.basename(f)} is not a PNG`);
        continue;
      }
      validFrames.push(f);
    } catch {
      failures.push(`failed to read ${path.basename(f)}`);
    }
  }

  return computeAverageColorFallback(validFrames, failures);
}

function computeAverageColorFallback(frames, failures) {
  if (!FFMPEG) {
    return { label: 'neutral', avg: [128, 128, 128], failures: failures.concat('ffmpeg not found for average color') };
  }
  const colors = [];
  for (const f of frames) {
    const result = spawnSync(FFMPEG, [
      '-v', 'error',
      '-i', f,
      '-vf', 'scale=1:1,crop=1:1',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ]);
    if (result.status === 0 && result.stdout && result.stdout.length >= 3) {
      const r = result.stdout.charCodeAt(0);
      const g = result.stdout.charCodeAt(1);
      const b = result.stdout.charCodeAt(2);
      colors.push([r, g, b]);
    } else {
      failures.push(`average-color failed for ${path.basename(f)}`);
    }
  }
  if (!colors.length) {
    return { label: 'neutral', avg: [128, 128, 128], failures };
  }
  const avg = [0, 0, 0];
  colors.forEach((c) => { avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2]; });
  avg[0] = Math.round(avg[0] / colors.length);
  avg[1] = Math.round(avg[1] / colors.length);
  avg[2] = Math.round(avg[2] / colors.length);

  const label = classifyTone(avg);
  return { label, avg, failures };
}

function classifyTone([r, g, b]) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const warm = r - b;
  if (lum < 70) return 'dark';
  if (warm > 25) return 'warm';
  if (warm < -25) return 'cool';
  return 'neutral';
}

function formatHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---------------------------------------------------------------------------
// Clone config
// ---------------------------------------------------------------------------
function loadCloneConfig() {
  try {
    return JSON.parse(fs.readFileSync(CLONE_CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

const CLONE_CONFIG = loadCloneConfig();

// ---------------------------------------------------------------------------
// Scene generation
// ---------------------------------------------------------------------------
function seedScript(metadata) {
  return {
    kicker: 'DARK · IA',
    scenes: [
      {
        id: 's01',
        avatar: 'frida',
        narrator: null,
        visual: null,
        layout: null,
        kicker: 'DARK · IA',
        headline: 'COPIAR O FORMATO NÃO É COPIAR O CONTEÚDO',
        body: 'O mesmo esqueleto, outro assunto.',
        narration: 'Copiar o formato não é copiar o conteúdo.',
      },
      {
        id: 's02',
        avatar: 'frida',
        narrator: null,
        visual: null,
        layout: null,
        kicker: 'ESTRUTURA',
        headline: 'GANCHO → NARRAÇÃO → IMAGEM',
        body: 'Motion, legendas e thumbnail no mesmo molde.',
        narration: 'O esqueleto é sempre o mesmo: gancho, narração, imagem.',
      },
      {
        id: 's03',
        avatar: 'frida',
        narrator: null,
        visual: null,
        layout: null,
        kicker: 'REMATE',
        headline: 'O CANAL FICA IGUAL, O TEMA MUDA',
        body: 'Pipeline repetível, tema novo.',
        narration: 'O canal fica igual. O tema muda.',
      },
    ],
    source: 'analyze',
    _ref: REFERENCE_VIDEO,
  };
}

// ---------------------------------------------------------------------------
// Scene-aware styling
// ---------------------------------------------------------------------------
const BASE_PALETTE = {
  cream: '#F0E6D8',
  ink: '#111111',
  orange: '#FF8A3D',
  white: '#FFFFFF',
};

function sceneScheme(scene, meta, paletteInfo) {
  const id = scene.id;
  const num = parseInt(id.replace(/\D/g, '0') || '1', 10) || 1;
  const tone = paletteInfo && paletteInfo.label ? paletteInfo.label : 'neutral';

  // Base variation per scene
  const shift = num % 3;
  const schemes = [
    { bg: '#F0E6D8', text: '#FFFFFF', accent: '#FF8A3D', lt: '#111111', warm: 0 },
    { bg: '#14161A', text: '#F2EFE7', accent: '#FF9A3D', lt: '#F2EFE7', warm: 1 },
    { bg: '#E9E2D4', text: '#14161A', accent: '#C4451F', lt: '#14161A', warm: 2 },
  ];

  let base = schemes[shift];

  // Adjust per detected tone
  if (tone === 'dark') {
    base = schemes[1];
  } else if (tone === 'cool') {
    base = { bg: '#E7ECF2', text: '#0E1A26', accent: '#2A6FD6', lt: '#0E1A26', warm: 0 };
  } else if (tone === 'warm') {
    base = { bg: '#F4E7D6', text: '#2A1408', accent: '#D8611A', lt: '#2A1408', warm: 0 };
  }

  // Type scale per scene
  const headlineSize = [104, 112, 100][shift] || 108;
  const kickerSize = [32, 36, 30][shift] || 34;
  const bodySize = [42, 46, 38][shift] || 44;

  return {
    bg: base.bg,
    text: base.text,
    accent: base.accent,
    lt: base.lt,
    headlineSize,
    kickerSize,
    bodySize,
    tone,
    sceneId: id,
  };
}

// ---------------------------------------------------------------------------
// EffectCraft command builders
// ---------------------------------------------------------------------------
function cmd(obj) {
  return JSON.stringify(obj);
}

function compNew(name, w, h, dur, bg) {
  return cmd({
    command: 'comp.new',
    params: { name, width: w, height: h, frameRate: 30, duration: dur, background: bg },
  });
}

function textNew(opts) {
  const p = {
    name: opts.name,
    text: opts.text,
    font: opts.font || 'Inter',
    style: opts.style || 'Bold',
    size: opts.size,
    fill: opts.fill,
    box: opts.box,
    justify: opts.justify || 'left',
  };
  if (opts.applyStroke !== undefined) {
    p.applyStroke = opts.applyStroke;
    p.stroke = opts.stroke;
    p.strokeWidth = opts.strokeWidth;
  }
  return cmd({ command: 'layer.newText', params: p });
}

function textPreset(layer, preset) {
  return cmd({ command: 'layer.applyTextPreset', params: { layer, preset } });
}

function solidNew(name, w, h, color) {
  return cmd({ command: 'layer.newSolid', params: { name, color, width: w, height: h } });
}

function arrangeLayer(name, to) {
  return cmd({ command: 'layer.arrange', params: { layer: name, to } });
}

// ---------------------------------------------------------------------------
// Backing media
// ---------------------------------------------------------------------------
function backingSourceForScene(sceneId) {
  const candidates = [
    path.join(MEDIA_DIR, `${sceneId}.mp4`),
    path.join(MEDIA_DIR, `${sceneId}.mov`),
    path.join(MEDIA_DIR, `${sceneId}.png`),
    path.join(MEDIA_DIR, `${sceneId}.jpg`),
    path.join(MEDIA_DIR, `${sceneId}.jpeg`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function backingCommandForScene(sceneId, compW, compH, scheme) {
  const src = backingSourceForScene(sceneId);
  if (!src) {
    return { lines: [solidNew(`backing-${sceneId}`, compW, compH, scheme.bg)], mediaPath: null };
  }
  const ext = path.extname(src).toLowerCase();
  let importCmd;
  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    importCmd = {
      command: 'mediaBrowser.import',
      params: { paths: [src], addToComp: true, time: 0, index: 0 },
    };
  } else {
    importCmd = {
      command: 'mediaBrowser.import',
      params: { paths: [src], sequence: false, addToComp: true, time: 0, index: 0 },
    };
  }
  const layerName = `backing-${sceneId}`;
  return { lines: [importCmd], mediaPath: src, layerName };
}

// ---------------------------------------------------------------------------
// Top variants per scene
// ---------------------------------------------------------------------------
const DURATION = 3;

function buildCaptionA(scene, scheme, meta) {
  const lines = [];
  const name = `Ts${scene.id.slice(1)}_captionA`;
  lines.push(compNew(name, 1080, 1920, DURATION, scheme.bg));
  lines.push(
    textNew({
      name: 'headline',
      text: scene.headline,
      size: scheme.headlineSize,
      fill: scheme.text,
      stroke: scheme.accent,
      strokeWidth: 8,
      applyStroke: true,
      box: [90, 810, 900, 400],
      justify: 'center',
    }),
  );
  lines.push(textPreset('headline', 'scramble'));
  return lines.join('\n');
}

function buildCaptionB(scene, scheme, meta) {
  const lines = [];
  const name = `Ts${scene.id.slice(1)}_captionB`;
  lines.push(compNew(name, 1080, 1920, DURATION, scheme.bg));
  lines.push(
    textNew({
      name: 'headline',
      text: scene.headline,
      size: scheme.headlineSize + 5,
      fill: scheme.text,
      stroke: scheme.accent,
      strokeWidth: 8,
      applyStroke: true,
      box: [90, 810, 900, 400],
      justify: 'center',
    }),
  );
  lines.push(textPreset('headline', 'trackingIn'));
  return lines.join('\n');
}

function buildLayerStack(scene, scheme, meta) {
  const lines = [];
  const name = `Ts${scene.id.slice(1)}_layerStack`;
  lines.push(compNew(name, 1080, 1056, DURATION, scheme.bg));
  lines.push(
    textNew({
      name: 'kick',
      text: scene.kicker,
      size: scheme.kickerSize,
      fill: scheme.accent,
      box: [90, 53, 900, 70],
      justify: 'left',
    }),
  );
  lines.push(textPreset('kick', 'fadeUpCharacters'));
  lines.push(
    textNew({
      name: 'head',
      text: scene.headline,
      size: scheme.headlineSize,
      fill: scheme.text,
      box: [90, 106, 900, 430],
      justify: 'left',
    }),
  );
  lines.push(textPreset('head', 'scramble'));
  lines.push(
    textNew({
      name: 'body',
      text: scene.body.toUpperCase(),
      size: scheme.bodySize,
      fill: scheme.text,
      box: [90, 317, 900, 280],
      justify: 'left',
    }),
  );
  lines.push(textPreset('body', 'fadeUpCharacters'));
  return lines.join('\n');
}

function buildLowerThird(scene, scheme, meta) {
  const lines = [];
  const name = `Ts${scene.id.slice(1)}_lowerThird`;
  lines.push(compNew(name, 1080, 620, DURATION, scheme.bg));
  lines.push(
    textNew({
      name: 'headline',
      text: scene.headline,
      size: scheme.headlineSize - 28,
      fill: scheme.lt,
      box: [90, 500, 900, 160],
      justify: 'left',
    }),
  );
  lines.push(textPreset('headline', 'fadeUpCharacters'));
  lines.push(
    textNew({
      name: 'kick',
      text: scene.kicker,
      size: scheme.kickerSize - 8,
      fill: scheme.accent,
      box: [90, 460, 900, 36],
      justify: 'left',
    }),
  );
  lines.push(textPreset('kick', 'fadeUpCharacters'));
  return lines.join('\n');
}

function buildMotionOverMedia(scene, scheme, meta, width = 1080, height = 1080) {
  const lines = [];
  const name = `Ts${scene.id.slice(1)}_motionOverMedia`;
  lines.push(compNew(name, width, height, DURATION, scheme.bg));

  // Backing visual
  const backing = backingCommandForScene(scene.id, width, height, scheme);
  lines.push(...backing.lines);

  // Scrim for readability over backing
  lines.push(solidNew(`scrim-${scene.id}`, width, height, scheme.bg));

  // Kicker
  lines.push(
    textNew({
      name: 'kick',
      text: scene.kicker,
      size: scheme.kickerSize,
      fill: scheme.accent,
      box: [90, 90, width - 180, 80],
      justify: 'left',
    }),
  );
  lines.push(textPreset('kick', 'fadeUpCharacters'));

  // Headline
  lines.push(
    textNew({
      name: 'headline',
      text: scene.headline,
      size: scheme.headlineSize,
      fill: scheme.text,
      stroke: scheme.accent,
      strokeWidth: 7,
      applyStroke: true,
      box: [90, 180, width - 180, 520],
      justify: 'center',
    }),
  );
  lines.push(textPreset('headline', choosePresetForScene(scene)));

  // Body
  lines.push(
    textNew({
      name: 'body',
      text: scene.body.toUpperCase(),
      size: scheme.bodySize - 6,
      fill: scheme.text,
      box: [90, 540, width - 180, 280],
      justify: 'center',
    }),
  );
  lines.push(textPreset('body', 'fadeUpCharacters'));

  // Arrange backing behind text
  if (backing.layerName) {
    lines.push(arrangeLayer(backing.layerName, 'back'));
  }
  lines.push(arrangeLayer(`scrim-${scene.id}`, 'back'));
  lines.push(arrangeLayer('kick', 'front'));
  lines.push(arrangeLayer('headline', 'front'));
  lines.push(arrangeLayer('body', 'front'));

  return lines.join('\n');
}

function choosePresetForScene(scene) {
  const map = {
    s01: 'scramble',
    s02: 'trackingIn',
    s03: 'fadeUpCharacters',
  };
  return map[scene.id] || 'scramble';
}

// ---------------------------------------------------------------------------
// Render project file (ecproj) from jsonl
// ---------------------------------------------------------------------------
function ecprojFromJsonl(jsonlPath) {
  const raw = fs.readFileSync(jsonlPath, 'utf8');
  const commandLines = raw.split('\n').filter(Boolean);
  return {
    schema: 1,
    version: 'effectcraft/project/v1',
    name: path.basename(jsonlPath, '.jsonl'),
    settings: { frameRate: 30, duration: 3, width: 1080, height: 1080 },
    compositions: [],
    commands: commandLines,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('\n=== Reference-driven smart tops generator ===\n');
  console.log('Reference:', REFERENCE_VIDEO);
  console.log('Slug:', SLUG);
  console.log('Work root:', WORK_ROOT);

  const metadata = probeVideo(REFERENCE_VIDEO);
  console.log('\n[probe]');
  if (metadata) {
    console.log(
      `  width=${metadata.width} height=${metadata.height} fps=${metadata.fps} duration=${metadata.duration ?? 'n/a'} codec=${metadata.codec}`,
    );
  } else {
    console.log('  ffprobe unavailable or failed; continuing with defaults');
  }

  const { frames, failures: frameFailures } = extractFrames(REFERENCE_VIDEO, SAMPLES_DIR, SAMPLE_TIMES);
  console.log('\n[frames]');
  console.log(`  extracted=${frames.length} sampleDir=${SAMPLES_DIR}`);
  if (frameFailures.length) frameFailures.forEach((f) => console.log(`  - ${f}`));

  const paletteInfo = inferPaletteFromFrames(frames);
  console.log('\n[palette]');
  console.log(`  label=${paletteInfo.label} avg=${formatHex(paletteInfo.avg)}`);
  if (paletteInfo.failures.length) paletteInfo.failures.forEach((f) => console.log(`  - ${f}`));

  // Script
  let script = null;
  if (fs.existsSync(SCRIPT_PATH)) {
    try {
      script = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
      console.log('\n[script] loaded existing', SCRIPT_PATH);
    } catch {
      script = null;
    }
  }

  if (!script) {
    script = seedScript(metadata);
    fs.mkdirSync(path.dirname(SCRIPT_PATH), { recursive: true });
    fs.writeFileSync(SCRIPT_PATH, JSON.stringify(script, null, 2) + '\n');
    console.log('\n[script] wrote', SCRIPT_PATH);
  }

  const scenes = script.scenes || [];
  if (!scenes.length) {
    console.error('[error] no scenes in script.scenes.json');
    process.exit(1);
  }

  // Per_scene tops
  console.log('\n[tops]');
  scenes.forEach((scene) => {
    const scheme = sceneScheme(scene, metadata, paletteInfo);

    const jsonlPath = path.join(TOPS_DIR, `top-${scene.id}.jsonl`);
    const lines = [
      `// tops for ${scene.id}`,
      `// scene palette: bg=${scheme.bg} text=${scheme.text} accent=${scheme.accent} tone=${scheme.tone}`,
    ];

    lines.push(buildCaptionA(scene, scheme, metadata));
    lines.push(buildCaptionB(scene, scheme, metadata));
    lines.push(buildLayerStack(scene, scheme, metadata));
    lines.push(buildLowerThird(scene, scheme, metadata));
    lines.push(buildMotionOverMedia(scene, scheme, metadata));

    fs.writeFileSync(jsonlPath, lines.join('\n') + '\n');
    const projPath = path.join(TOPS_DIR, `top-${scene.id}.ecproj`);
    fs.writeFileSync(projPath, JSON.stringify(ecprojFromJsonl(jsonlPath), null, 2) + '\n');
    console.log(
      `  wrote ${path.relative(WORK_ROOT, jsonlPath)} and ${path.relative(WORK_ROOT, projPath)}`,
    );
  });

  console.log('\n[done]');
  console.log('script:', SCRIPT_PATH);
  console.log('tops dir:', TOPS_DIR);
  if (frameFailures.length || paletteInfo.failures.length) {
    console.log('skipped/failed steps:');
    frameFailures.forEach((f) => console.log('  -', f));
    paletteInfo.failures.forEach((f) => console.log('  -', f));
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
