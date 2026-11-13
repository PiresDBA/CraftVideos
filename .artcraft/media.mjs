#!/usr/bin/env node
/**
 * Media acquisition + transcoding helper for the ArtCraft pipeline.
 *
 * Covers the part the ArtCraft CLIs do NOT do: fetching from YouTube (metadata,
 * subtitles, audio, video) and moving between container/codec when a downstream
 * app needs something specific. Everything else is delegated to FilmCraft /
 * EffectCraft, which carry their own encoders (NVENC / AMF / QSV / VideoToolbox).
 *
 * Dependency model: resolved, never assumed. ffmpeg / ffprobe / yt-dlp are
 * installed on this machine but are NOT on PATH, so this script probes PATH,
 * then the known install roots, then a bounded scan. It reports exactly which
 * binary it chose so a bad pick is visible.
 *
 * Usage:
 *   node media.mjs check
 *   node media.mjs info <url>
 *   node media.mjs subs <url> <outdir> [--lang en,pt]
 *   node media.mjs dl <url> <outdir> [--audio] [--max-res 1080] [--playlist N]
 *   node media.mjs probe <file>
 *   node media.mjs frames <video> <outdir> [--fps 1] [--scale 1280]
 *   node media.mjs normalize <in> <out> [--fps 30] [--size 1920x1080] [--crf 18]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL = process.env.LOCALAPPDATA || '';
const APPDATA = process.env.APPDATA || '';

function which(cmd) {
  const r = spawnSync('where', [cmd], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? (r.stdout || '').split(/\r?\n/)[0]?.trim() || null : null;
}

// ------------------------------------------------------------------ discovery

// Exact known locations first (cheapest and most predictable).
const KNOWN = {
  'yt-dlp': [
    LOCAL + '\\Programs\\Python\\Python312\\Scripts\\yt-dlp.exe',
    APPDATA + '\\Python\\Python312\\Scripts\\yt-dlp.exe',
  ],
  ffmpeg: [
    LOCAL + '\\hermes\\tools\\ffmpeg-9.0.1-win32-x64\\bin\\ffmpeg.exe',
  ],
  ffprobe: [
    LOCAL + '\\hermes\\tools\\ffmpeg-9.0.1-win32-x64\\bin\\ffprobe.exe',
  ],
};

// Directories worth scanning when the exact path is unknown.
const SCAN_ROOTS = [
  LOCAL + '\\Microsoft\\WinGet\\Packages',
  LOCAL + '\\hermes\\tools',
  'D:\\ONEDRIVE-BKP\\Desktop',
  'C:\\Program Files',
];

function findInTree(root, filename, maxDepth) {
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = dir + '\\' + e.name;
      if (e.isDirectory()) {
        if (depth < maxDepth) queue.push({ dir: full, depth: depth + 1 });
      } else if (e.name.toLowerCase() === filename) {
        return full;
      }
    }
  }
  return null;
}

function discoverTools() {
  const found = {};
  for (const name of Object.keys(KNOWN)) {
    const exe = name + '.exe';
    const onPath = which(name);
    if (onPath) {
      found[name] = onPath;
      continue;
    }
    let hit = null;
    for (const c of KNOWN[name]) {
      if (fs.existsSync(c)) {
        hit = c;
        break;
      }
    }
    if (hit) {
      found[name] = hit;
      continue;
    }
    for (const root of SCAN_ROOTS) {
      if (!fs.existsSync(root)) continue;
      hit = findInTree(root, exe.toLowerCase(), 6);
      if (hit) break;
    }
    found[name] = hit;
  }
  // ffprobe should sit beside the ffmpeg we picked.
  if (!found.ffprobe && found.ffmpeg) {
    const sib = found.ffmpeg.replace(/ffmpeg\.exe$/i, 'ffprobe.exe');
    if (fs.existsSync(sib)) found.ffprobe = sib;
  }
  return found;
}

const TOOLS = discoverTools();

// ------------------------------------------------------------------ helpers

function requireTool(name) {
  if (TOOLS[name]) return TOOLS[name];
  const install = {
    'yt-dlp': 'py -m pip install -U yt-dlp',
    ffmpeg: 'winget install Gyan.FFmpeg',
    ffprobe: 'ships with ffmpeg',
  }[name];
  process.stderr.write(
    `media: required tool "${name}" was not found (PATH or known locations).\n` +
      `  install with: ${install}\n` +
      '  ArtCraft apps do not need this; only this script does.\n'
  );
  process.exit(2);
}

function run(tool, args, opts = {}) {
  const r = spawnSync(tool, args, {
    stdio: opts.capture ? 'pipe' : 'inherit',
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 128,
  });
  if (r.error) {
    process.stderr.write(`media: failed to run ${tool}: ${r.error.message}\n`);
    process.exit(1);
  }
  return r;
}

const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');

const [, , cmd, ...rest] = process.argv;

function flag(name, fallback = null) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
}

// ------------------------------------------------------------------ commands

switch (cmd) {
  case 'check': {
    const versions = {};
    for (const [k, v] of Object.entries(TOOLS)) {
      if (!v) {
        versions[k] = null;
        continue;
      }
      const r = spawnSync(v, [k === 'yt-dlp' ? '--version' : '-version'], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
      versions[k] = ((r.stdout || '').split(/\r?\n/)[0] || '').trim();
    }
    out({
      tools: TOOLS,
      versions,
      ready: Object.values(TOOLS).every(Boolean),
      missing: Object.entries(TOOLS).filter(([, v]) => !v).map(([k]) => k),
      note: 'FilmCraft/EffectCraft export video natively. ffmpeg is needed only here and by AniCraft MP4/WebM.',
    });
    break;
  }

  case 'info': {
    const url = rest[0];
    if (!url) {
      process.stderr.write('usage: media.mjs info <url>\n');
      process.exit(1);
    }
    requireTool('yt-dlp');
    const r = run(TOOLS['yt-dlp'], ['--dump-single-json', '--no-warnings', url], { capture: true });
    if (r.status !== 0) {
      process.stderr.write(r.stderr || 'yt-dlp failed\n');
      process.exit(1);
    }
    const j = JSON.parse(r.stdout);
    out({
      id: j.id,
      title: j.title,
      channel: j.channel || j.uploader,
      channel_id: j.channel_id || j.uploader_id,
      channel_url: j.channel_url,
      duration: j.duration,
      upload_date: j.upload_date,
      views: j.view_count,
      likes: j.like_count,
      subscribers: j.channel_follower_count,
      tags: j.tags,
      categories: j.categories,
      webpage_url: j.webpage_url,
      formats: (j.formats || []).length,
    });
    break;
  }

  case 'subs': {
    const [url, dir] = rest;
    if (!url || !dir) {
      process.stderr.write('usage: media.mjs subs <url> <outdir> [--lang en,pt]\n');
      process.exit(1);
    }
    requireTool('yt-dlp');
    fs.mkdirSync(dir, { recursive: true });
    const langs = flag('lang', 'en,pt');
    const r = run(TOOLS['yt-dlp'], [
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs',
      langs,
      '--sub-format',
      'vtt/srt/best',
      '--convert-subs',
      'srt',
      '-o',
      path.join(dir, '%(id)s.%(ext)s'),
      url,
    ]);
    process.exit(r.status ?? 0);
  }

  case 'dl': {
    const [url, dir] = rest;
    if (!url || !dir) {
      process.stderr.write('usage: media.mjs dl <url> <outdir> [--audio] [--max-res 1080] [--playlist N]\n');
      process.exit(1);
    }
    requireTool('yt-dlp');
    fs.mkdirSync(dir, { recursive: true });
    const audio = rest.includes('--audio');
    const maxRes = flag('max-res', '1080');
    const playlist = flag('playlist', null);

    const args = ['-o', path.join(dir, '%(uploader)s - %(title)s [%(id)s].%(ext)s')];
    if (audio) {
      args.push('-f', 'bestaudio/best', '--extract-audio', '--audio-quality', '0');
    } else {
      args.push('-f', `bestvideo[height<=${maxRes}]+bestaudio/best[height<=${maxRes}]/best`);
    }
    args.push('--merge-output-format', 'mp4');
    if (playlist) args.push('--playlist-end', String(playlist));
    args.push('--no-warnings', url);

    if (audio) {
      // yt-dlp needs ffmpeg for extraction; point it at ours if it cannot find one
      if (!which('ffmpeg') && TOOLS.ffmpeg) {
        args.unshift('--ffmpeg-location', path.dirname(TOOLS.ffmpeg));
      }
    }
    const r = run(TOOLS['yt-dlp'], args);
    process.exit(r.status ?? 0);
  }

  case 'probe': {
    const file = rest[0];
    if (!file) {
      process.stderr.write('usage: media.mjs probe <file>\n');
      process.exit(1);
    }
    requireTool('ffprobe');
    const r = run(TOOLS.ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file], { capture: true });
    if (r.status !== 0) {
      process.stderr.write(r.stderr || 'ffprobe failed\n');
      process.exit(1);
    }
    out(JSON.parse(r.stdout));
    break;
  }

  case 'frames': {
    const [video, dir] = rest;
    if (!video || !dir) {
      process.stderr.write('usage: media.mjs frames <video> <outdir> [--fps 1] [--scale 1280]\n');
      process.exit(1);
    }
    requireTool('ffmpeg');
    fs.mkdirSync(dir, { recursive: true });
    const r = run(TOOLS.ffmpeg, [
      '-y',
      '-i',
      video,
      '-vf',
      `fps=${flag('fps', '1')},scale=${flag('scale', '1280')}:-2`,
      '-q:v',
      '2',
      path.join(dir, 'f_%05d.jpg'),
    ]);
    process.exit(r.status ?? 0);
  }

  case 'normalize': {
    const [inp, outp] = rest;
    if (!inp || !outp) {
      process.stderr.write('usage: media.mjs normalize <in> <out> [--fps 30] [--size 1920x1080] [--crf 18]\n');
      process.exit(1);
    }
    requireTool('ffmpeg');
    const r = run(TOOLS.ffmpeg, [
      '-y',
      '-i',
      inp,
      '-vf',
      `fps=${flag('fps', '30')},scale=${flag('size', '1920x1080')}`,
      '-c:v',
      'libx264',
      '-crf',
      flag('crf', '18'),
      '-preset',
      'medium',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outp,
    ]);
    process.exit(r.status ?? 0);
  }

  default:
    process.stderr.write(
      'media — acquisition + transcode for the ArtCraft pipeline\n\n' +
        '  check | info <url> | subs <url> <dir> | dl <url> <dir> | probe <file> | frames <video> <dir> | normalize <in> <out>\n\n' +
        'resolved tools: ' + JSON.stringify(TOOLS, null, 2) + '\n'
    );
    process.exit(cmd ? 1 : 0);
}