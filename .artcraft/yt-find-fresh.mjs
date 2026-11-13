#!/usr/bin/env node
/**
 * Encontra vídeos FRESCOS sobre um tema, ordenados por visualizações.
 *
 * Usa yt-dlp: pesquisa por relevancia + filtro de data, depois confirma a data real e as views
 * de cada candidato (a pesquisa plana não traz tudo).
 *
 *   node .artcraft\yt-find-fresh.mjs --query "inteligencia artificial" [--days 1]
 *                                    [--queries "a|b|c"] [--min-views 20000] [--top 5]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HOME = process.env.USERPROFILE || process.env.HOME || '';
const YTDLP = path.join(HOME, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const QUERIES = (arg('queries', arg('query', 'inteligencia artificial')) || '').split('|').filter(Boolean);
const DAYS = Number(arg('days', '1'));
const MIN_VIEWS = Number(arg('min-views', '20000'));
const TOP = Number(arg('top', '5'));
const OUT = arg('out', 'D:\\CRAFT\\work\\trend\\fresh.json');

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, ['--no-update', '--no-warnings', ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => child.kill(), timeoutMs || 90000);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String(e.message) }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }); });
  });
}

function parseLines(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try { out.push(JSON.parse(s)); } catch { /* partial */ }
  }
  return out;
}

const today = new Date();
const floor = new Date(today.getTime() - DAYS * 86400000);
const stamp = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

const seen = new Map();

for (const q of QUERIES) {
  console.error('pesquisa : ' + q + ' (por relevancia + filtro de data)');
  const r = await run(YTDLP, [
    '--flat-playlist', '--dump-json',
    '--playlist-end', '30',
    'ytsearch40:' + q,
  ], 120000);

  const rows = parseLines(r.stdout);
  console.error('           ' + rows.length + ' resultados');

  for (const v of rows) {
    if (!v.id || seen.has(v.id)) continue;
    seen.set(v.id, {
      id: v.id,
      title: v.title || '',
      channel: v.channel || v.uploader || '',
      channelId: v.channel_id || '',
      views: Number(v.view_count || 0),
      duration: Number(v.duration || 0),
      url: 'https://www.youtube.com/watch?v=' + v.id,
      query: q,
    });
  }
}

// confirmar data real dos candidatos mais vistos
const candidates = Array.from(seen.values())
  .filter((v) => v.duration > 0 && v.duration <= 900)
  .sort((a, b) => b.views - a.views)
  .slice(0, 14);

console.error('a confirmar data de ' + candidates.length + ' candidatos...');

const confirmed = [];
for (const c of candidates) {
  const r = await run(YTDLP, ['--skip-download', '--print', '%(upload_date)s\t%(view_count)s\t%(like_count)s\t%(channel)s', c.url], 45000);
  const line = r.stdout.trim().split(/\r?\n/).pop() || '';
  const [date, views, likes] = line.split('\t');
  if (!date || date.length !== 8) continue;
  if (date < stamp(floor)) continue;
  confirmed.push({
    ...c,
    uploadDate: date,
    views: Number(views || c.views),
    likes: Number(likes || 0),
    fresh: date === stamp(today),
  });
}

confirmed.sort((a, b) => b.views - a.views);
const pick = confirmed.slice(0, TOP);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  queries: QUERIES,
  days: DAYS,
  minViews: MIN_VIEWS,
  results: pick,
}, null, 2) + '\n', 'utf8');

console.log('');
console.log('  ' + 'DATA'.padEnd(9) + 'VIEWS'.padEnd(12) + 'DUR  CANAL');
console.log('  ' + '-'.repeat(78));
for (const v of pick) {
  const d = v.uploadDate.replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2');
  console.log('  ' + d.padEnd(9) + String(v.views).padEnd(12) + String(Math.round(v.duration / 60) + 'min').padEnd(5) + v.channel.slice(0, 28));
  console.log('      ' + v.title.slice(0, 74));
}
console.log('');
console.log('ficheiro : ' + OUT);
