#!/usr/bin/env node
/**
 * Local companion for the channel dashboard.
 *
 * Responsibilities:
 *   GET  /            -> serve the dashboard
 *   POST /clone       -> enqueue OR execute a clone request with full parameters
 *   GET  /queue       -> list pending/processed requests
 *   GET  /health      -> liveness
 *   GET  /config      -> return default clone.config.json
 *   GET  /settings    -> return persisted settings
 *   POST /settings    -> save settings (persists to file + broadcasts to clients)
 *   POST /queue/process -> process all pending items
 *   POST /refresh     -> rebuild dashboard
 *
 * Binds to 127.0.0.1 only. There is no authentication, so it must never be
 * exposed beyond localhost.
 *
 * The queue is a JSON Lines file at work/research/queue.jsonl.
 * Settings are persisted at work/research/settings.json.
 *
 * Usage:
 *   node yt-daemon.mjs [--port 8799] [--open] [--auto-execute]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const FLAG = (name) => process.argv.includes('--' + name);

const PORT = Number(arg('port', '8799'));
const ROOT = 'D:\\CRAFT';
const DASH = path.join(ROOT, 'work', 'research', 'dashboard', 'index.html');
const QUEUE = path.join(ROOT, 'work', 'research', 'queue.jsonl');
const SETTINGS_FILE = path.join(ROOT, 'work', 'research', 'settings.json');
const OUTDIR = path.join(ROOT, 'work', 'clones');
const AUTO_EXECUTE = FLAG('auto-execute');

fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
fs.mkdirSync(OUTDIR, { recursive: true });
fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });

function readQueue() {
  if (!fs.existsSync(QUEUE)) return [];
  return fs
    .readFileSync(QUEUE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeQueue(items) {
  fs.writeFileSync(QUEUE, items.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

function appendQueue(entry) {
  fs.appendFileSync(QUEUE, JSON.stringify(entry) + '\n', 'utf8');
}

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeSettings(cfg) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function json(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(body);
}

async function executeClone(entry) {
  const { id, params } = entry;
  const slug = params.slug || 'clone_' + id.slice(5);
  const outDir = path.join(OUTDIR, slug);

  return new Promise((resolve) => {
    const args = [
      path.join(ROOT, '.artcraft', 'yt-clone-build.mjs'),
      '--slug', slug,
      '--out', outDir,
    ];

    // Map params to CLI flags
    if (params.script) args.push('--script', params.script);
    if (params.voice) args.push('--voice', params.voice);
    if (params.video) {
      if (params.video.width) args.push('--set', 'video.width=' + params.video.width);
      if (params.video.height) args.push('--set', 'video.height=' + params.video.height);
      if (params.video.fps) args.push('--set', 'video.fps=' + params.video.fps);
      if (params.video.crf) args.push('--set', 'video.crf=' + params.video.crf);
    }
    if (params.cards) {
      if (params.cards.headlineSize) args.push('--set', 'cards.headline.size=' + params.cards.headlineSize);
      if (params.cards.fontFamily) args.push('--set', 'cards.fontFamily=' + params.cards.fontFamily);
      if (params.cards.palette) {
        if (params.cards.palette.bg) args.push('--set', 'cards.palette.bg=' + params.cards.palette.bg);
        if (params.cards.palette.ink) args.push('--set', 'cards.palette.ink=' + params.cards.palette.ink);
        if (params.cards.palette.accent) args.push('--set', 'cards.palette.accent=' + params.cards.palette.accent);
      }
    }
    if (params.motion && params.motion.kenBurns) {
      if (params.motion.kenBurns.enabled !== undefined) args.push('--set', 'motion.kenBurns.enabled=' + params.motion.kenBurns.enabled);
      if (params.motion.kenBurns.from) args.push('--set', 'motion.kenBurns.from=' + params.motion.kenBurns.from);
      if (params.motion.kenBurns.to) args.push('--set', 'motion.kenBurns.to=' + params.motion.kenBurns.to);
    }
    if (params.transition) {
      if (params.transition.type) args.push('--transition', params.transition.type);
      if (params.transition.seconds) args.push('--set', 'transition.seconds=' + params.transition.seconds);
    }
    if (params.music) {
      if (params.music.path) args.push('--music', params.music.path);
      if (params.music.gain) args.push('--set', 'music.gain=' + params.music.gain);
    }
    if (params.loudness && params.loudness.enabled !== undefined) {
      args.push('--set', 'loudness.enabled=' + params.loudness.enabled);
      if (params.loudness.targetLufs) args.push('--set', 'loudness.targetLufs=' + params.loudness.targetLufs);
    }
    if (params.thumbnail) {
      if (params.thumbnail.kicker) args.push('--set', 'thumbnail.kicker=' + params.thumbnail.kicker);
      if (params.thumbnail.words) args.push('--set', 'thumbnail.words=' + JSON.stringify(params.thumbnail.words));
    }
    // Avatar params
    if (params.avatar) {
      if (params.avatar.enabled !== undefined) args.push('--set', 'avatar.enabled=' + params.avatar.enabled);
      if (params.avatar.type) args.push('--set', 'avatar.type=' + params.avatar.type);
      if (params.avatar.lipSync !== undefined) args.push('--set', 'avatar.lipSync=' + params.avatar.lipSync);
      if (params.avatar.backgroundRemoval !== undefined) args.push('--set', 'avatar.backgroundRemoval=' + params.avatar.backgroundRemoval);
      // Provider-specific
      ['heygen', 'synthesia', 'did', 'local', 'generated'].forEach(provider => {
        if (params.avatar[provider]) {
          Object.entries(params.avatar[provider]).forEach(([k, v]) => {
            args.push('--set', 'avatar.' + provider + '.' + k + '=' + JSON.stringify(v));
          });
        }
      });
    }
    // Language params
    if (params.languages) {
      if (params.languages.default) args.push('--set', 'languages.default=' + params.languages.default);
      if (params.languages.supported) args.push('--set', 'languages.supported=' + JSON.stringify(params.languages.supported));
      if (params.languages.perLanguage) {
        Object.entries(params.languages.perLanguage).forEach(([lang, cfg]) => {
          Object.entries(cfg).forEach(([k, v]) => {
            args.push('--set', 'languages.perLanguage.' + lang + '.' + k + '=' + JSON.stringify(v));
          });
        });
      }
      if (params.languages.autoTranslate !== undefined) args.push('--set', 'languages.autoTranslate=' + params.languages.autoTranslate);
      if (params.languages.translateEngine) args.push('--set', 'languages.translateEngine=' + params.languages.translateEngine);
      if (params.languages.subtitleLanguages) args.push('--set', 'languages.subtitleLanguages=' + JSON.stringify(params.languages.subtitleLanguages));
    }
    // Voice clone params
    if (params.voice && params.voice.cloneMyVoice) {
      if (params.voice.cloneMyVoice.enabled !== undefined) args.push('--set', 'voice.cloneMyVoice.enabled=' + params.voice.cloneMyVoice.enabled);
      if (params.voice.cloneMyVoice.samplesDir) args.push('--set', 'voice.cloneMyVoice.samplesDir=' + params.voice.cloneMyVoice.samplesDir);
      if (params.voice.cloneMyVoice.minSamples) args.push('--set', 'voice.cloneMyVoice.minSamples=' + params.voice.cloneMyVoice.minSamples);
      if (params.voice.cloneMyVoice.maxDurationSec) args.push('--set', 'voice.cloneMyVoice.maxDurationSec=' + params.voice.cloneMyVoice.maxDurationSec);
    }

    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (e) => {
      resolve({ ok: false, error: String(e.message), stdout, stderr });
    });

    child.on('close', (code) => {
      const items = readQueue();
      const idx = items.findIndex((i) => i.id === id);
      if (idx >= 0) {
        items[idx].status = code === 0 ? 'done' : 'failed';
        items[idx].finishedAt = new Date().toISOString();
        items[idx].output = stdout.slice(-5000);
        if (code !== 0) items[idx].error = stderr.slice(-2000);
        writeQueue(items);
      }
      resolve({ ok: code === 0, code, stdout: stdout.slice(-3000), stderr: stderr.slice(-2000) });
    });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    if (!fs.existsSync(DASH)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dashboard not built. Run: node D:\\CRAFT\\.artcraft\\yt-dashboard.mjs');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(DASH));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      dashboard: fs.existsSync(DASH),
      queue: readQueue().length,
      pending: readQueue().filter((i) => i.status === 'pending').length,
      uptime: Math.round(process.uptime()),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/queue') {
    const items = readQueue();
    json(res, 200, { count: items.length, pending: items.filter((i) => i.status === 'pending').length, items });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/settings') {
    const cfg = readSettings();
    json(res, 200, { ok: true, settings: cfg });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/settings') {
    let body = '';
    req.on('data', (d) => {
      body += d.toString();
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch {
        json(res, 400, { ok: false, error: 'invalid JSON' });
        return;
      }
      writeSettings(payload);
      json(res, 200, { ok: true, message: 'settings saved' });
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/clone') {
    let body = '';
    req.on('data', (d) => {
      body += d.toString();
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch {
        json(res, 400, { ok: false, error: 'invalid JSON' });
        return;
      }
      if (!payload.url || !/youtube\.com|youtu\.be/.test(payload.url)) {
        json(res, 400, { ok: false, error: 'url must be a YouTube link' });
        return;
      }

      const id = 'clone_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const entry = {
        id,
        createdAt: new Date().toISOString(),
        status: 'pending',
        url: payload.url,
        videoId: payload.id || null,
        channel: payload.channel || null,
        prompt: payload.prompt || '',
        params: payload.params || {}, // full clone.config.json override tree
      };
      appendQueue(entry);

      // Optionally execute immediately
      if (AUTO_EXECUTE) {
        executeClone(entry).then(result => {
          json(res, 200, { ok: true, queued: id, executed: true, result });
        }).catch(err => {
          json(res, 500, { ok: false, error: String(err.message) });
        });
      } else {
        json(res, 200, { ok: true, queued: id, message: 'na fila. Use --auto-execute no daemon ou processe manualmente.' });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/queue/process') {
    const items = readQueue();
    const pending = items.filter((i) => i.status === 'pending');
    if (!pending.length) {
      json(res, 200, { ok: true, processed: 0, message: 'nada pendente' });
      return;
    }
    const processNext = (idx) => {
      if (idx >= pending.length) {
        json(res, 200, { ok: true, processed: pending.length, message: 'concluído' });
        return;
      }
      executeClone(pending[idx]).then(() => {
        processNext(idx + 1);
      }).catch(() => {
        processNext(idx + 1);
      });
    };
    processNext(0);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/refresh') {
    const child = spawn(process.execPath, [path.join(ROOT, '.artcraft', 'yt-dashboard.mjs')], {
      cwd: ROOT,
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => json(res, code === 0 ? 200 : 500, { ok: code === 0, output: out.slice(-2000) }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/config') {
    const cfgPath = path.join(ROOT, 'clone.config.json');
    if (fs.existsSync(cfgPath)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(cfgPath));
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'config not found' }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('artcraft radar: http://127.0.0.1:' + PORT);
  console.log('  dashboard : ' + DASH);
  console.log('  queue     : ' + QUEUE);
  console.log('  settings  : ' + SETTINGS_FILE);
  console.log('  auto-execute: ' + AUTO_EXECUTE);
  if (arg('open', null) !== null) {
    const url = 'http://127.0.0.1:' + PORT;
    const open = process.platform === 'win32' ? 'cmd' : 'open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(open, args, { detached: true, stdio: 'ignore' }).unref();
  }
});