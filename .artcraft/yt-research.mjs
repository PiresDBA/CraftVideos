#!/usr/bin/env node
/**
 * YouTube research probe.
 *
 * Purpose: find out which data sources are actually reachable with yt-dlp on this
 * machine, and what fields each one returns. Everything downstream (channel
 * ranking, cloning pipeline) depends on this being honest about its limits.
 *
 * Usage:
 *   node yt-research.mjs probe
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

const YTDLP = (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python312\\Scripts\\yt-dlp.exe';
const OUT = 'D:\\CRAFT\\work\\research';

function run(args, timeout = 180000) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(t);
      resolve({ code: -1, stdout, stderr: String(e.message) });
    });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code, stdout, stderr });
    });
  });
}

function parseJsonLines(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try {
      rows.push(JSON.parse(s));
    } catch {
      /* ignore partial */
    }
  }
  return rows;
}

const SOURCES = [
  { id: 'trending', args: ['--flat-playlist', '--dump-json', '--playlist-end', '15', 'https://www.youtube.com/feed/trending'] },
  { id: 'search_date', args: ['--flat-playlist', '--dump-json', '--playlist-end', '10', 'ytsearchdate10:video'] },
  { id: 'search_views', args: ['--flat-playlist', '--dump-json', '--playlist-end', '10', 'ytsearch10:video'] },
  { id: 'charts', args: ['--flat-playlist', '--dump-json', '--playlist-end', '10', 'https://www.youtube.com/feed/charts'] },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(YTDLP)) {
    console.error('yt-dlp not found at ' + YTDLP);
    process.exit(2);
  }

  const results = {};
  for (const src of SOURCES) {
    process.stderr.write(`probing ${src.id} ... `);
    const r = await run(src.args, 120000);
    const rows = parseJsonLines(r.stdout);
    results[src.id] = {
      exitCode: r.code,
      rows: rows.length,
      fields: rows[0] ? Object.keys(rows[0]).sort() : [],
      sample: rows[0]
        ? {
            id: rows[0].id,
            title: rows[0].title,
            channel: rows[0].channel || rows[0].uploader,
            channel_id: rows[0].channel_id || rows[0].uploader_id,
            views: rows[0].view_count,
            duration: rows[0].duration,
            upload_date: rows[0].upload_date || null,
            timestamp: rows[0].timestamp || null,
            url: rows[0].url,
          }
        : null,
      stderrTail: (r.stderr || '').trim().split(/\r?\n/).slice(-3).join(' | '),
    };
    process.stderr.write(`${results[src.id].rows} rows\n`);
  }

  fs.writeFileSync(OUT + '\\probe.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
}

main();