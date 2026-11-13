#!/usr/bin/env node
/**
 * Daily radar run.
 *
 * Chains, in order:
 *   1. collect the general sample      (yg-channels, default preset)
 *   2. collect the dark/shorts sample  (preset dark,shorts)
 *   3. scan every channel's /shorts tab (yt-shorts-scan) — search hides Shorts
 *   4. rank the world list             (yt-top-world)
 *   5. build the dashboard             (yt-dashboard, merged samples + scan)
 *   6. write the clone feasibility doc (yt-clone-analysis)
 *
 * Safe to run at any time; each step is independent and logs its own failure.
 *
 * Usage:
 *   node yt-daily.mjs [--days 7] [--per-query 25] [--extract 160]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const ROOT = 'D:\\CRAFT';
const DAYS = arg('days', '7');
const PER_QUERY = arg('per-query', '25');
const EXTRACT = arg('extract', '160');
const DAY = new Date().toISOString().slice(0, 10);
const RESEARCH = path.join(ROOT, 'work', 'research');
const RUN_MAIN = path.join(RESEARCH, 'run-' + DAY);
const RUN_DARK = path.join(RESEARCH, 'run-' + DAY + '-dark');
const SCAN = path.join(RESEARCH, 'shorts-scan.json');
const DASH = path.join(RESEARCH, 'dashboard');
const REPORT = path.join(RESEARCH, 'clone-feasibility.md');

function step(label, file, args) {
  return new Promise((resolve) => {
    process.stdout.write('[' + label + '] ... ');
    const child = spawn(process.execPath, [file].concat(args), { cwd: ROOT, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', (e) => {
      process.stdout.write('ERRO: ' + e.message + '\n');
      resolve(false);
    });
    child.on('close', (code) => {
      process.stdout.write(code === 0 ? 'ok\n' : 'falhou (exit ' + code + ')\n');
      if (code !== 0) process.stdout.write(out.split(/\r?\n/).slice(-10).join('\n') + '\n');
      resolve(code === 0);
    });
  });
}

const CHANNELS = path.join(ROOT, '.artcraft', 'yt-channels.mjs');

// 1 + 2 — two collection passes: general and dark/shorts. Both are needed; the
// general pass finds volume, the dark pass finds the niche we actually want to clone.
const okMain = await step('1/6 recolha geral', CHANNELS, [
  '--days', DAYS,
  '--per-query', PER_QUERY,
  '--extract', EXTRACT,
  '--out', RUN_MAIN,
]);

const okDark = await step('2/6 recolha dark', CHANNELS, [
  '--preset', 'dark,shorts',
  '--days', DAYS,
  '--per-query', PER_QUERY,
  '--extract', EXTRACT,
  '--out', RUN_DARK,
]);

const samples = [okMain ? RUN_MAIN : null, okDark ? RUN_DARK : null]
  .filter(Boolean)
  .map((d) => path.join(d, 'channels.json'))
  .filter((p) => fs.existsSync(p));

if (!samples.length) {
  console.error('nenhuma amostra recolhida — a abortar');
  process.exit(1);
}

// 3 — the shorts tab scan. Cheap (flat playlists) and the only honest source of
// "does this channel publish Shorts".
const scanArgs = [];
for (const s of samples) scanArgs.push('--sample', s);
await step('3/6 scan de shorts', path.join(ROOT, '.artcraft', 'yt-shorts-scan.mjs'), scanArgs.concat([
  '--out', SCAN,
]));

// 4 — world ranking (best effort: it is a nice extra, not a blocker)
await step('4/6 ranking mundial', path.join(ROOT, '.artcraft', 'yt-top-world.mjs'), [
  '--sample', samples[0],
  '--out', path.join(RESEARCH, 'world'),
]);

// 5 — dashboard over every sample plus the shorts scan
const dashArgs = [];
for (const s of samples) dashArgs.push('--sample', s);
dashArgs.push('--shorts-scan', SCAN);
const okDash = await step('5/6 painel', path.join(ROOT, '.artcraft', 'yt-dashboard.mjs'), dashArgs);

// 6 — clone feasibility, same inputs, so the doc and the panel never disagree
const repArgs = [];
for (const s of samples) repArgs.push('--sample', s);
repArgs.push('--shorts-scan', SCAN, '--out', REPORT);
await step('6/6 análise de clonagem', path.join(ROOT, '.artcraft', 'yt-clone-analysis.mjs'), repArgs);

// keep only the last 14 daily runs (main + dark pairs count as one day)
try {
  const runs = fs
    .readdirSync(RESEARCH, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('run-'))
    .map((d) => d.name)
    .sort();
  const days = Array.from(new Set(runs.map((r) => r.slice(0, 14)))).sort();
  for (const old of days.slice(0, Math.max(0, days.length - 14))) {
    for (const r of runs.filter((x) => x.startsWith(old))) {
      fs.rmSync(path.join(RESEARCH, r), { recursive: true, force: true });
    }
  }
} catch {
  /* cleanup is best effort */
}

if (!okDash) process.exit(1);

console.log('\npronto. abre o painel:');
console.log('  ' + path.join(DASH, 'index.html'));
console.log('relatório de clonagem:');
console.log('  ' + REPORT);
