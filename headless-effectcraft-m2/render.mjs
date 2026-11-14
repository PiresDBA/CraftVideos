#!/usr/bin/env node
/**
 * Headless render pipeline for EffectCraft projects.
 *
 * Usage examples:
 *   node render.mjs path/to/project.ecproj
 *   node render.mjs path/to/project.ecproj --comps T02_captionA,T02_captionB
 *   node render.mjs path/to/project.ecproj --start 0 --end 3 --resolution full --quality best
 *
 * What this script does:
 *   1. Loads the project path from the command line.
 *   2. Determines the list of compositions to render (via --comps or the project file).
 *   3. For each composition:
 *        a. Opens the composition in the EffectCraft CLI session.
 *        b. Selects transform properties (Position, Scale, Rotation, Opacity).
 *        c. Smooths the selected tangents with selectedTangentsSmoothed().
 *        d. Renders the composition to a stable output file.
 *   4. Skips output files that already exist.
 *
 * Notes / limitations:
 *   - Headless selection only affects the properties that are explicitly selected. This script
 *     selects transform properties before smoothing, so the smoothing is applied to those.
 *   - If selectedTangentsSmoothed() or any selection step fails, we log a warning and keep
 *     going. The render may still succeed with the project's existing keyframe interpolation.
 *   - Output naming derives a scene code and variant label from the composition name via
 *     splitCompoundName(). When that pattern is not matched, the composition name is sanitized.
 *   - The render command uses the CLI's current render settings for the project/comp. Flags such
 *     as --resolution, --quality, --format and the time range are passed explicitly.
 */

import { fileURLToPath } from 'url';
import { dirname, join, extname, basename } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants and paths
// ---------------------------------------------------------------------------
const ARTCRAFT_CLI = join(__dirname, '..', '.artcraft', 'artcraft.mjs');
const RENDERS_DIR = join(__dirname, 'renders');

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------
function cli(...args) {
  const cmd = ['node', ARTCRAFT_CLI, ...args];
  console.log('[cli] ' + cmd.join(' '));
  const result = spawnSync('node', cmd, {
    stdio: 'inherit',
    windowsHide: true,
    encoding: 'utf8',
  });
  return result.status === 0;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs() {
  const argv = process.argv.slice(2);
  const projectIdx = argv.findIndex((a) => !a.startsWith('--'));
  if (projectIdx < 0) {
    throw new Error('Usage: node render.mjs <project.ecproj> [--comps names] [--start s] [--end s] [--resolution full|half|...] [--quality best|draft|1-100] [--format h264|hevc|av1|...]');
  }

  const project = argv[projectIdx];
  const rest = argv.slice(projectIdx + 1);

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
    const next = rest[i + 1];

    if (a === '--comps' && next) {
      opts.comps = next.split(',').map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (a === '--start' && next) {
      opts.start = Number(next);
      i++;
    } else if (a === '--end' && next) {
      opts.end = Number(next);
      i++;
    } else if (a === '--resolution' && next) {
      opts.resolution = next;
      i++;
    } else if (a === '--quality' && next) {
      opts.quality = next;
      i++;
    } else if (a === '--format' && next) {
      opts.format = next;
      i++;
    }
  }

  if (!opts.comps.length) {
    // Derive from project file if possible
    try {
      const raw = readFileSync(project, 'utf8');
      const data = JSON.parse(raw);
      const comps = data.compositions ?? [];
      opts.comps = comps.map((c) => c.name).filter(Boolean);
    } catch (err) {
      throw new Error(`Could not read composition list from project file: ${err.message}`);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Composition naming helpers
// ---------------------------------------------------------------------------
function splitCompoundName(name) {
  const m = name.match(/^(\d{2})_(.+)$/);
  if (!m) return { scene: null, variant: name };

  const scene = m[1];
  const rest = m[2];

  const v = rest.match(/^(.+?)(?:_(captionA|captionB|layerStack|lowerThird|motionOverMedia))?$/);
  const variantRaw = v?.[2] || v?.[1] || rest;
  const variant = variantRaw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  return { scene, variant };
}

function defaultOutPathForComp(compName) {
  const { scene, variant } = splitCompoundName(compName);
  const base =
    scene !== null
      ? `T${scene}_${variant.replace(/\s+/g, '')}`
      : compName.replace(/\s+/g, '');
  return join(RENDERS_DIR, `${base}.mp4`);
}

// ---------------------------------------------------------------------------
// Selection + smoothing helpers
// ---------------------------------------------------------------------------
async function selectTransformProps() {
  const props = ['Transform.Position', 'Transform.Scale', 'Transform.Rotation', 'Transform.Opacity'];
  for (const prop of props) {
    if (!cli('cli', 'effectcraft', 'selectProperty', prop)) {
      console.warn(`[warn] selectProperty ${prop} returned non-zero`);
    }
  }
}

async function smoothTangents() {
  if (!cli('cli', 'effectcraft', 'selectedTangentsSmoothed')) {
    console.warn('[warn] selectedTangentsSmoothed returned non-zero');
  }
}

// ---------------------------------------------------------------------------
// Render one composition
// ---------------------------------------------------------------------------
async function renderComp({
  compName,
  outPath,
  start,
  end,
  resolution,
  quality,
  format,
}) {
  if (existsSync(outPath)) {
    console.log(`[skip] ${outPath} already exists`);
    return;
  }

  const ok = cli(
    'cli',
    'effectcraft',
    'render',
    '--project',
    PROJECT_PATH,
    '--comp',
    compName,
    '--output',
    outPath,
    '--start',
    String(start),
    '--end',
    String(end),
    '--resolution',
    resolution,
    '--quality',
    quality,
    '--format',
    format
  );

  if (!ok) {
    console.error(`[error] render failed for ${compName}`);
  } else {
    console.log(`[ok] ${compName} -> ${outPath}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let PROJECT_PATH;

async function main() {
  console.log('\n=== Headless Render Pipeline ===\n');

  const opts = parseArgs();
  PROJECT_PATH = join(__dirname, opts.project);

  if (!existsSync(PROJECT_PATH)) {
    throw new Error(`Project file not found: ${PROJECT_PATH}`);
  }

  console.log('Project:', PROJECT_PATH);
  console.log('Compositions:', opts.comps.join(', '));
  console.log('Render range:', opts.start, 'to', opts.end, 'seconds');
  console.log('Resolution:', opts.resolution, 'Quality:', opts.quality, 'Format:', opts.format);

  mkdirSync(RENDERS_DIR, { recursive: true });

  for (const compName of opts.comps) {
    console.log('\n--- ' + compName + ' ---');
    const { scene, variant } = splitCompoundName(compName);
    console.log('scene:', scene ?? '—', 'variant:', variant);

    const outPath = defaultOutPathForComp(compName);

    // Open the composition
    if (!cli('cli', 'effectcraft', 'comp.open', compName, '--project', PROJECT_PATH)) {
      console.error(`[error] failed to open composition ${compName}`);
      continue;
    }

    // Select transform properties and smooth tangents
    await selectTransformProps();
    await smoothTangents();

    // Render
    await renderComp({
      compName,
      outPath,
      start: opts.start,
      end: opts.end,
      resolution: opts.resolution,
      quality: opts.quality,
      format: opts.format,
    });
  }

  console.log('\n=== Done ===\n');
}

main().catch((err) => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
