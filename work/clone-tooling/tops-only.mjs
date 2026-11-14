#!/usr/bin/env node
/**
 * Slim tops-only generator for the clone pipeline.
 *
 * Reads script.scenes.json (or a reference video + slug if you want a fresh seed),
 * writes scene-aware tops under work/clones/<slug>/tops/ as:
 *   - top-<scene>.jsonl   (EffectCraft run-stream, no comments, valid JSON Lines)
 *   - top-<scene>.ecproj  (valid EffectCraft project skeleton for fallback/debug)
 *
 * Variants per scene:
 *   captionA, captionB, layerStack, lowerThird, motionOverMedia
 *
 * motionOverMedia is a real motion-graphics comp: scene-tinted backing solid + kicker +
 * headline with stroke + body. If a backing media file exists in work/clones/<slug>/media/<scene>.*
 * it is imported instead of the solid.
 *
 * This script is intentionally small and focused: scene -> palette/type scale -> tops ->
 * project files. It does not touch narration, avatar or montagem.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SCRIPT_PATH = process.argv[2] || 'D:/CRAFT/work/clones/ref-ycc/script.scenes.json';
const SLUG = process.argv[3] || 'ref-ycc';
const SCRIPT_DIR = path.dirname(path.resolve(SCRIPT_PATH));
const WORK_ROOT = path.resolve('work/clones', SLUG);
const TOPS_DIR = path.join(WORK_ROOT, 'tops');
const MEDIA_DIR = path.join(WORK_ROOT, 'media');

fs.mkdirSync(TOPS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Scene loader
// ---------------------------------------------------------------------------
function loadScript() {
  if (!fs.existsSync(SCRIPT_PATH)) {
    console.error('script.scenes.json not found at', SCRIPT_PATH);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  } catch (err) {
    console.error('failed to parse', SCRIPT_PATH, err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Scene-aware styling
// ---------------------------------------------------------------------------
function sceneScheme(scene) {
  const id = scene.id;
  const num = parseInt(id.replace(/\D/g, '0') || '1', 10) || 1;
  const shift = num % 3;

  const schemes = [
    { bg: '#F0E6D8', text: '#FFFFFF', accent: '#FF8A3D', lt: '#111111' },
    { bg: '#14161A', text: '#F2EFE7', accent: '#FF9A3D', lt: '#F2EFE7' },
    { bg: '#E9E2D4', text: '#14161A', accent: '#C4451F', lt: '#14161A' },
  ];

  const base = schemes[shift];
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
  };
}

// ---------------------------------------------------------------------------
// EffectCraft command builders
// ---------------------------------------------------------------------------
function cmd(obj) {
  return JSON.stringify(obj);
}

function compNew(name, w, h, dur, bg) {
  return { command: 'comp.new', params: { name, width: w, height: h, frameRate: 30, duration: dur, background: bg } };
}

function textNew(opts) {
  const p = {
    name: opts.name,
    text: opts.text,
    font: 'Inter',
    style: 'Bold',
    size: opts.size,
    fill: opts.fill,
    box: opts.box,
    justify: opts.justify || 'left',
  };
  if (opts.applyStroke) {
    p.applyStroke = true;
    p.stroke = opts.stroke;
    p.strokeWidth = opts.strokeWidth;
  }
  return { command: 'layer.newText', params: p };
}

function textPreset(layer, preset) {
  return { command: 'layer.applyTextPreset', params: { layer, preset } };
}

function solidNew(name, w, h, color) {
  return { command: 'layer.newSolid', params: { name, color, width: w, height: h } };
}

function arrangeLayer(name, to) {
  return { command: 'layer.arrange', params: { layer: name, to } };
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

function backingLinesForScene(sceneId, compW, compH, scheme) {
  const src = backingSourceForScene(sceneId);
  if (!src) {
    return { lines: [solidNew(`backing-${sceneId}`, compW, compH, scheme.bg)], layerName: `backing-${sceneId}` };
  }
  const ext = path.extname(src).toLowerCase();
  const importCmd = {
    command: 'mediaBrowser.import',
    params: { paths: [src], sequence: !['.png', '.jpg', '.jpeg'].includes(ext), addToComp: true, time: 0, index: 0 },
  };
  return { lines: [importCmd], layerName: `backing-${sceneId}` };
}

// ---------------------------------------------------------------------------
// Top variants
// ---------------------------------------------------------------------------
const DURATION = 3;

function buildCaptionA(scene, scheme) {
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
  return lines;
}

function buildCaptionB(scene, scheme) {
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
  return lines;
}

function buildLayerStack(scene, scheme) {
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
  return lines;
}

function buildLowerThird(scene, scheme) {
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
  return lines;
}

function buildMotionOverMedia(scene, scheme) {
  const lines = [];
  const name = `Ts${scene.id.slice(1)}_motionOverMedia`;
  const w = 1080;
  const h = 1080;
  lines.push(compNew(name, w, h, DURATION, scheme.bg));

  const backing = backingLinesForScene(scene.id, w, h, scheme);
  lines.push(...backing.lines);
  lines.push(solidNew(`scrim-${scene.id}`, w, h, scheme.bg));

  lines.push(
    textNew({
      name: 'kick',
      text: scene.kicker,
      size: scheme.kickerSize,
      fill: scheme.accent,
      box: [90, 90, w - 180, 80],
      justify: 'left',
    }),
  );
  lines.push(textPreset('kick', 'fadeUpCharacters'));

  lines.push(
    textNew({
      name: 'headline',
      text: scene.headline,
      size: scheme.headlineSize,
      fill: scheme.text,
      stroke: scheme.accent,
      strokeWidth: 7,
      applyStroke: true,
      box: [90, 180, w - 180, 520],
      justify: 'center',
    }),
  );
  lines.push(textPreset('headline', choosePresetForScene(scene)));

  lines.push(
    textNew({
      name: 'body',
      text: scene.body.toUpperCase(),
      size: scheme.bodySize - 6,
      fill: scheme.text,
      box: [90, 540, w - 180, 280],
      justify: 'center',
    }),
  );
  lines.push(textPreset('body', 'fadeUpCharacters'));

  if (backing.layerName) lines.push(arrangeLayer(backing.layerName, 'back'));
  lines.push(arrangeLayer(`scrim-${scene.id}`, 'back'));
  lines.push(arrangeLayer('kick', 'front'));
  lines.push(arrangeLayer('headline', 'front'));
  lines.push(arrangeLayer('body', 'front'));

  return lines;
}

function choosePresetForScene(scene) {
  const map = { s01: 'scramble', s02: 'trackingIn', s03: 'fadeUpCharacters' };
  return map[scene.id] || 'scramble';
}

// ---------------------------------------------------------------------------
// Project skeleton
// ---------------------------------------------------------------------------
function ecprojFromLines(lines) {
  return {
    savedBy: '0.24.1',
    activeComp: 1,
    openComps: [1],
    schema: 2,
    settings: {
      bit_depth: 'Bpc8',
      linearize: false,
      working_space: null,
      blend_linear: false,
      time_display: 'Timecode',
      frame_start: 0,
      renderer: 'gpu',
      audio_sample_rate: 48000,
      audio_channels: 2,
      audio_format: 16,
    },
    compositions: [],
    commands: lines.map((l) => JSON.stringify(l)),
    items: {},
    folders: {},
    footage: {},
    comps: {},
    next_id: 2,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('\n=== Slim tops-only generator ===\n');
  console.log('script:', SCRIPT_PATH);
  console.log('slug:', SLUG);
  console.log('tops dir:', TOPS_DIR);

  const script = loadScript();
  const scenes = script.scenes || [];
  if (!scenes.length) {
    console.error('no scenes found');
    process.exit(1);
  }

  scenes.forEach((scene) => {
    const scheme = sceneScheme(scene);
    const lines = [
      ...buildCaptionA(scene, scheme),
      ...buildCaptionB(scene, scheme),
      ...buildLayerStack(scene, scheme),
      ...buildLowerThird(scene, scheme),
      ...buildMotionOverMedia(scene, scheme),
    ];

    const jsonlPath = path.join(TOPS_DIR, `top-${scene.id}.jsonl`);
    const ecprojPath = path.join(TOPS_DIR, `top-${scene.id}.ecproj`);

    fs.writeFileSync(jsonlPath, lines.map(JSON.stringify).join('\n') + '\n');
    fs.writeFileSync(ecprojPath, JSON.stringify(ecprojFromLines(lines), null, 2) + '\n');

    console.log(`  wrote top-${scene.id}.jsonl + top-${scene.id}.ecproj`);
  });

  console.log('\ndone');
}

main();
