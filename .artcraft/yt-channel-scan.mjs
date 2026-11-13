#!/usr/bin/env node
/**
 * Channel scan: the evidence a video list cannot give you.
 *
 * For every channel in the samples it fetches two cheap, flat pages:
 *   1. the channel page  -> description, tags, subscriber count
 *   2. the /shorts tab   -> how many Shorts it publishes and their views
 *
 * Why this exists: YouTube search does not index Shorts (searching "facts shorts"
 * returns 20-40 minute long videos), and nothing in a video's metadata says whether
 * the channel is produced by AI. The channel description often does ("AI-generated",
 * "faceless", "no face", "feito com IA"), which is the strongest single signal we have.
 *
 * Output: work/research/channel-scan.json
 *   { generatedAt, shortsLimit, channels: { "<channel_id>": {
 *       channel, handle, description, tags, subs, shorts, shortsViews, top, ok } } }
 *
 * Usage:
 *   node yt-channel-scan.mjs --sample "a.json" [--sample "b.json"] [--out "scan.json"]
 *                             [--shorts 12] [--channels 400] [--no-description]
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
const OUT = arg('out', 'D:\\CRAFT\\work\\research\\channel-scan.json');
const LIMIT = Number(arg('shorts', '12'));
const MAX_CHANNELS = Number(arg('channels', '500'));
const WITH_DESCRIPTION = !process.argv.includes('--no-description');

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
  console.error('channel scan: ' + list.length + ' canais (' + (WITH_DESCRIPTION ? 'descricao + ' : '') + 'shorts)');

  const result = {};
  let done = 0;
  await pool(list, 6, async (c) => {
    const entry = { channel: c.channel, handle: null, description: '', tags: [], subs: c.subs === undefined ? null : c.subs, shorts: 0, shortsViews: 0, top: null, ok: false };

    // ---- channel page: description is the AI/faceless tell
    if (WITH_DESCRIPTION) {
      const info = await run(
        ['--dump-single-json', '--flat-playlist', '--playlist-end', '1', 'https://www.youtube.com/channel/' + c.id],
        60000
      );
      if (info.code === 0) {
        try {
          const j = JSON.parse(info.stdout);
          entry.description = String(j.description || j.channel_description || '').slice(0, 4000);
          entry.tags = (j.tags || []).slice(0, 20);
          entry.handle = j.uploader_id || j.channel_id || null;
          if (j.channel_follower_count !== undefined && j.channel_follower_count !== null) {
            entry.subs = j.channel_follower_count;
          }
          entry.ok = true;
        } catch {
          /* keep defaults */
        }
      }
    }

    // ---- /shorts tab: the only honest measurement of Shorts activity
    const shorts = await run(
      ['--flat-playlist', '--dump-json', '--playlist-end', String(LIMIT), 'https://www.youtube.com/channel/' + c.id + '/shorts'],
      45000
    );
    const rows = parseJsonLines(shorts.stdout).filter((x) => x && x.id);
    if (rows.length) {
      let views = 0;
      let top = null;
      for (const v of rows) {
        const n = v.view_count || 0;
        views += n;
        if (!top || n > top.views) top = { id: v.id, title: v.title || '', views: n, duration: v.duration || 0 };
      }
      entry.shorts = rows.length;
      entry.shortsViews = views;
      entry.top = top;
      entry.ok = true;
    }

    result[c.id] = entry;
    done += 1;
    if (done % 25 === 0) process.stderr.write('  ' + done + '/' + list.length + '\r');
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), shortsLimit: LIMIT, channels: result }, null, 1),
    'utf8'
  );

  const withShorts = Object.values(result).filter((r) => r.shorts > 0).length;
  const withDesc = Object.values(result).filter((r) => (r.description || '').length > 40).length;
  console.error('\nchannel scan: ' + withShorts + '/' + list.length + ' publicam shorts, ' + withDesc + ' com descricao');
  console.log('scan: ' + OUT);
}

main();
