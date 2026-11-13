#!/usr/bin/env node
/**
 * Shorts scan.
 *
 * YouTube search does not index Shorts: searching "facts shorts" sorted by upload
 * date returns 20-40 minute long videos whose titles happen to contain the word.
 * The only reliable source is each channel's own /shorts tab.
 *
 * This script reads one or more channels.json samples and, for every channel, asks
 * yt-dlp for that tab (flat, cheap), storing how many shorts the channel has and how
 * many views they carry. The dashboard uses this to decide whether a channel really
 * publishes Shorts.
 *
 * Usage:
 *   node yt-shorts-scan.mjs --sample "a.json" [--sample "b.json"] [--out "scan.json"]
 *                            [--limit 12] [--channels 400]
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
function argAll(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--' + name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}

const SAMPLES = argAll('sample');
const OUT = arg('out', 'D:\\CRAFT\\work\\research\\shorts-scan.json');
const LIMIT = Number(arg('limit', '12'));
const MAX_CHANNELS = Number(arg('channels', '400'));

function run(args, timeout) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, ['--no-update', '--no-warnings'].concat(args), { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => child.kill(), timeout || 60000);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String(e.message) }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }); });
  });
}

async function pool(items, size, worker) {
  let idx = 0;
  const runners = [];
  for (let r = 0; r < Math.min(size, items.length); r++) {
    runners.push((async () => {
      while (idx < items.length) {
        const my = idx++;
        await worker(items[my], my);
      }
    })());
  }
  await Promise.all(runners);
}

function parseJsonLines(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (s.charAt(0) !== '{') continue;
    try { rows.push(JSON.parse(s)); } catch { /* partial line */ }
  }
  return rows;
}

async function main() {
  if (!SAMPLES.length) {
    console.error('usa --sample <channels.json> [--sample ...]');
    process.exit(2);
  }
  if (!fs.existsSync(YTDLP)) {
    console.error('yt-dlp nao encontrado: ' + YTDLP);
    process.exit(2);
  }

  const channels = new Map();
  for (const p of SAMPLES) {
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const c of data.channels || []) {
      const id = c.channel_id;
      if (!id || channels.has(id)) continue;
      channels.set(id, { id, channel: c.channel, subs: c.subs });
    }
  }

  const list = Array.from(channels.values()).slice(0, MAX_CHANNELS);
  console.error('shorts scan: ' + list.length + ' canais, ' + LIMIT + ' shorts por canal');

  const result = {};
  let done = 0;
  await pool(list, 6, async (c) => {
    const url = 'https://www.youtube.com/channel/' + c.id + '/shorts';
    const r = await run(['--flat-playlist', '--dump-json', '--playlist-end', String(LIMIT), url], 45000);
    const rows = parseJsonLines(r.stdout).filter((x) => x && x.id);
    done += 1;
    if (done % 25 === 0) process.stderr.write('  ' + done + '/' + list.length + '\r');

    if (!rows.length) {
      result[c.id] = { channel: c.channel, shorts: 0, views: 0, top: null, ok: r.code === 0 };
      return;
    }
    let views = 0;
    let top = null;
    for (const v of rows) {
      const n = v.view_count || 0;
      views += n;
      if (!top || n > top.views) top = { id: v.id, title: v.title || '', views: n, duration: v.duration || 0 };
    }
    result[c.id] = {
      channel: c.channel,
      shorts: rows.length,
      views: views,
      top: top,
      ok: true,
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), limit: LIMIT, channels: result }, null, 1),
    'utf8'
  );

  const withShorts = Object.values(result).filter((r) => r.shorts > 0);
  console.error('\nshorts scan: ' + withShorts.length + '/' + list.length + ' canais publicam shorts');
  console.log('scan: ' + OUT);
}

main();
