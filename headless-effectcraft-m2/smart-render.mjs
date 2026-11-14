#!/usr/bin/env node
/**
 * Headless smart render for EffectCraft projects.
 *
 * Usage:
 *   node smart-render.mjs <project.ecproj> [--comps comp1,comp2] [--start 0] [--end 3] [--resolution full] [--quality best] [--format h264]
 *
 * What it does:
 *   1. Reads the list of compositions from the project file, or from --comps.
 *   2. For each composition:
 *        a. Opens it in the headless EffectCraft session.
 *        b. Selects transform keyframes (Position/Scale/Rotation/Opacity) on all layers.
 *        c. Smooths the selected tangents with selectedTangentsSmoothed().
 *        d. Renders it to a stable output path derived from the scene/variant pattern.
 *   3. Skips any output file that already exists.
 *
 * Known limitations / controls:
 *   - selectedTangentsSmoothed() only affects the currently selected keyframes, so this
 *     script explicitly selects transform properties first.
 *   - In headless mode the render uses whatever render settings are currently stored on the
 *     project/comp item; if you need custom bitrate/resolution presets, pass them through
 *     CLI render flags or set them before running this script.
 *   - Output naming uses splitCompoundName() which expects names like T02_captionA; other
 *     names fall back to a sanitized composition name.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs() {
  const raw = process.argv.slice(2);
  const projectIdx = raw.findIndex((a) => !a.startsWith('--'));
  if (projectIdx < 0) {
    console.error('Usage: node smart-render.mjs <project.ecproj> [options]');
    process.exit(1);
  }

  const project = raw[projectIdx];
  const rest = raw.slice(projectIdx + 1);

  const opts = {
    project,
    comps: [],
    start: 0,
    end: 3,
    resolution: 'full',
    quality: 'best',
    format: 'h264',
  };

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--comps' && rest[i + 1]) {
      opts.comps = rest[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--start' && rest[i + 1]) {
      opts.start = Number(rest[++i]);
    } else if (a === '--end' && rest[i + 1]) {
      opts.end = Number(rest[++i]);
    } else if (a === '--resolution' && rest[i + 1]) {
      opts.resolution = rest[++i];
    } else if (a === '--quality' && rest[i + 1]) {
      opts.quality = rest[++i];
    } else if (a === '--format' && rest[i + 1]) {
      opts.format = rest[++i];
    }
  }

  return opts;
}

const ARGS = parseArgs();

const PROJECT_PATH = join(__dirname, ARGS.project);

if (!existsSync(PROJECT_PATH)) {
  console.error(`Project file not found: ${PROJECT_PATH}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------
const CLI_PATH = join(__dirname, '..', '.artcraft', 'artcraft.mjs');

function runCLI(...args) {
  const cmd = [CLI_PATH, ...args];
  console.log(`[CLI] node ${cmd.join(' ')}`);
  const result = spawnSync('node', cmd, {
    stdio: 'inherit',
    encoding: 'utf-8',
    windowsHide: true,
  });
  return result.status === 0;
}

// ---------------------------------------------------------------------------
// Composition naming helpers
// ---------------------------------------------------------------------------
function splitCompoundName(name) {
  const match = name.match(/^(\d{2})_(.+)$/);
  if (!match) return { scene: null, variant: name };

  const scene = match[1];
  const rest = match[2];

  const variantMatch = rest.match(/^(.+?)(?:_(captionA|captionB|layerStack|lowerThird|motionOverMedia))?$/);
  if (!variantMatch) return { scene, variant: rest };

  const variantRaw = variantMatch[2] || variantMatch[1] || rest;
  const variant = variantRaw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  return { scene, variant };
}

function defaultOutPath(compName) {
  const { scene, variant } = splitCompoundName(compName);
  const base = scene
    ? `T${scene}_${variant.replace(/\s+/g, '')}`
    : compName.replace(/\s+/g, '');
  const outDir = join(__dirname, 'renders');
  mkdirSync(outDir, { recursive: true });
  return join(outDir, `${base}.mp4`);
}

// ---------------------------------------------------------------------------
// Property selection + tangent smoothing
// ---------------------------------------------------------------------------
async function selectTransformProperties() {
  const props = [
    'Transform.Position',
    'Transform.Scale',
    'Transform.Rotation',
    'Transform.Opacity',
  ];

  for (const prop of props) {
    if (!runCLI('cli', 'effectcraft', 'selectProperty', prop)) {
      console.warn(`[warn] selectProperty ${prop} returned non-zero`);
    }
  }
}

async function smoothSelectedTangents() {
  if (!runCLI('cli', 'effectcraft', 'selectedTangentsSmoothed')) {
    console.warn('[warn] selectedTangentsSmoothed returned non-zero');
  }
}

// ---------------------------------------------------------------------------
// Render one comp
// ---------------------------------------------------------------------------
async function renderComposition(compName, outPath) {
  const args = [
    'cli',
    'effectcraft',
    'render',
    '--project',
    PROJECT_PATH,
    '--comp',
    compName,
    '--output',
    outPath,
    '--format',
    ARGS.format,
    '--start',
    String(ARGS.start),
    '--end',
    String(ARGS.end),
    '--resolution',
    ARGS.resolution,
    '--quality',
    ARGS.quality,
  ];

  if (existsSync(outPath)) {
    console.log(`[SKIP] ${outPath} already exists`);
    return;
  }

  const ok = runCLI(...args);
  if (!ok) {
    console.error(`[WARN] Render failed for ${compName}`);
  } else {
    console.log(`[DONE] ${compName} -> ${outPath}`);
  }
}

// ---------------------------------------------------------------------------
// Composition list from project file
// ---------------------------------------------------------------------------
function listCompositionsFromProject(projectPath) {
  try {
    const raw = readFileSync(projectPath, 'utf-8');
    const project = JSON.parse(raw);
    const comps = project.compositions ?? [];
    return comps.map((c) => c.name).filter(Boolean);
  } catch (err) {
    console.warn(`[WARN] Could not parse comp list: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n=== Headless Smart Render ===\n');
  console.log(`Project: ${PROJECT_PATH}`);
  console.log(`Comps: ${ARGS.comps.length ? ARGS.comps.join(', ') : '(from project file)'}`);
  console.log(`Range: ${ARGS.start}s - ${ARGS.end}s  resolution=${ARGS.resolution} quality=${ARGS.quality} format=${ARGS.format}\n`);

  const comps = ARGS.comps.length
    ? ARGS.comps
    : listCompositionsFromProject(PROJECT_PATH);

  if (comps.length === 0) {
    console.warn('[WARN] No compositions found. Nothing to render.');
    return;
  }

  for (const compName of comps) {
    console.log(`\n--- ${compName} ---`);
    const { scene, variant } = splitCompoundName(compName);
    console.log(`    scene: ${scene ?? '—'}  variant: ${variant}`);

    const openOk = runCLI('cli', 'effectcraft', 'comp.open', compName, '--project', PROJECT_PATH);
    if (!openOk) {
      console.error(`[ERROR] Could not open composition ${compName}`);
      continue;
    }

    await selectTransformProperties();
    await smoothSelectedTangents();

    const outPath = defaultOutPath(compName);
    await renderComposition(compName, outPath);
  }

  console.log('\n=== Done ===\n');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
