#!/usr/bin/env node
/**
 * Local companion for the channel dashboard.
 *
 * Responsibilities:
 *   GET  /                  -> serve the dashboard
 *   GET  /health            -> liveness
 *   GET  /config            -> return default clone.config.json
 *   GET  /settings          -> return persisted settings
 *   POST /settings          -> save settings
 *   GET  /queue             -> list pending/processed requests
 *   POST /queue/process     -> process all pending items (async jobs)
 *   POST /refresh           -> rebuild dashboard
 *   POST /collect-targets   -> start background collection job
 *   GET  /collect-targets/status -> collect job status/log
 *   POST /clone             -> enqueue clone; if async=true starts immediately and returns job id
 *   POST /clone/start       -> start clone job immediately and return job id
 *   GET  /clone/status      -> job status + live telemetry (?id=...)
 *   GET  /clone/active      -> active/last clone job
 *   GET  /clone/log         -> full/tailed log text (?id=...)
 *   GET  /clones/*          -> serve generated artifacts under work/clones (preview)
 *
 * Binds to 127.0.0.1 only. No authentication.
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

// -------------------- collect job --------------------
let collectJob = { running: false, startedAt: null, finishedAt: null, ok: null, message: 'Pronto para coletar.', output: '' };

function runNodeScript(scriptRel, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, scriptRel), ...args], {
      cwd: ROOT,
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); collectJob.output = out.slice(-4000); });
    child.stderr.on('data', (d) => { out += d.toString(); collectJob.output = out.slice(-4000); });
    child.on('error', (e) => resolve({ ok: false, code: -1, output: String(e.message) }));
    child.on('close', (code) => resolve({ ok: code === 0, code, output: out.slice(-4000) }));
  });
}

async function startCollectTargets(options = {}) {
  if (collectJob.running) return { started: false, reason: 'already_running', job: collectJob };
  collectJob = { running: true, startedAt: null, finishedAt: null, ok: null, message: 'Coletando vídeos por categoria (isso pode levar alguns minutos)...', output: '' };
  collectJob.startedAt = new Date().toISOString();
  const args = [];
  if (options.categories) args.push('--categories', options.categories);
  if (options.top) args.push('--top', String(options.top));
  if (options.shorts) args.push('--shorts', String(options.shorts));
  if (options.perQuery) args.push('--per-query', String(options.perQuery));
  if (options.extract) args.push('--extract', String(options.extract));
  (async () => {
    const res = await runNodeScript('.artcraft/yt-collect-targets.mjs', args);
    collectJob.running = false;
    collectJob.finishedAt = new Date().toISOString();
    collectJob.ok = res.ok;
    collectJob.message = res.ok ? 'Coleta concluída! Atualizando lista...' : 'Coleta terminou com erros (veja detalhes).';
    collectJob.output = res.output || collectJob.output;
  })().catch(e => {
    collectJob.running = false;
    collectJob.finishedAt = new Date().toISOString();
    collectJob.ok = false;
    collectJob.message = 'Erro na coleta.';
    collectJob.output = String(e && e.message || e);
  });
  return { started: true, job: collectJob };
}

// -------------------- queue/settings helpers --------------------
function readQueue() {
  if (!fs.existsSync(QUEUE)) return [];
  return fs
    .readFileSync(QUEUE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
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
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return null; }
}

function writeSettings(cfg) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function json(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  res.end(body);
}

// -------------------- clone telemetry --------------------
const cloneJobs = new Map(); // id -> job
let activeCloneJobId = null;

function nowIso() { return new Date().toISOString(); }
function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function inferStepFromLine(line) {
  const l = String(line || '').toLowerCase();
  if (!l.trim()) return null;
  if (l.includes('script') && l.includes('nao encontr')) return 'Erro: script/cenas não encontrado';
  if (l.includes('figcraft')) return 'Gerando cartões visuais (FigCraft)';
  if (l.includes('voicecraft')) return 'Gerando narração (VoiceCraft/TTS)';
  if (l.includes('edge') && l.includes('fallback')) return 'Fallback de voz (Edge TTS)';
  if (l.includes('sapi') || l.includes('tts')) return 'Gerando narração (TTS)';
  if (l.includes('avatar')) return 'Processando avatar';
  if (l.includes('liveportrait')) return 'Animando avatar (LivePortrait)';
  if (l.includes('runpod')) return 'Processando avatar em nuvem (RunPod)';
  if (l.includes('b-roll') || l.includes('broll') || l.includes('pexels') || l.includes('pixabay')) return 'Buscando/aplicando B-roll';
  if (l.includes('ken burns')) return 'Aplicando movimento (Ken Burns)';
  if (l.includes('ffmpeg') || l.includes('render') || l.includes('concat') || l.includes('mux')) return 'Renderizando/montando vídeo (ffmpeg)';
  if (l.includes('thumbnail') || l.includes('capa')) return 'Gerando thumbnail/capa';
  if (l.includes('subtitle') || l.includes('legenda')) return 'Gerando legendas';
  if (l.includes('loudness') || l.includes('normalize') || l.includes('r128')) return 'Normalizando áudio';
  if (l.includes('upload') || l.includes('youtube')) return 'Enviando/publicando';
  if (l.includes('erro') || l.includes('error') || l.includes('falhou') || l.includes('failed')) return 'Atenção/erro detectado (veja o log)';
  return null;
}

function estimateEtaMs(job) {
  // Heuristic ETA based on elapsed and observed phase keywords
  const elapsed = Date.now() - (job.startedAtMs || Date.now());
  const text = (job.logTail || '').toLowerCase();
  let totalGuess = 8 * 60 * 1000; // 8 min default
  if (text.includes('avatar') || text.includes('liveportrait') || text.includes('runpod')) totalGuess = 20 * 60 * 1000;
  if (text.includes('ffmpeg') || text.includes('render')) totalGuess = Math.max(totalGuess, 12 * 60 * 1000);
  if (text.includes('upload')) totalGuess = Math.max(totalGuess, elapsed + 2 * 60 * 1000);
  if (job.status === 'done' || job.status === 'failed') return 0;
  return Math.max(30 * 1000, totalGuess - elapsed);
}

function scanArtifacts(outDir) {
  const result = { dir: outDir, exists: fs.existsSync(outDir), files: [], previews: [] };
  if (!result.exists) return result;
  try {
    const walk = (dir, baseRel = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const abs = path.join(dir, e.name);
        const rel = path.posix.join(baseRel.replace(/\\/g, '/'), e.name);
        if (e.isDirectory()) {
          // limit depth/size
          if (rel.split('/').length <= 3) walk(abs, rel);
          continue;
        }
        const st = fs.statSync(abs);
        result.files.push({ name: e.name, rel, size: st.size, mtime: st.mtime.toISOString() });
      }
    };
    walk(outDir, '');
    result.files.sort((a,b)=> (b.mtime||'').localeCompare(a.mtime||''));
    // pick preview candidates
    const mp4s = result.files.filter(f => /\.mp4$/i.test(f.name)).slice(0, 5);
    const imgs = result.files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name)).slice(0, 8);
    const wavs = result.files.filter(f => /\.(wav|mp3|m4a)$/i.test(f.name)).slice(0, 5);
    result.previews = { videos: mp4s, images: imgs, audios: wavs };
  } catch (e) {
    result.error = String(e && e.message || e);
  }
  return result;
}

function cloneJobPublic(job, opts = {}) {
  if (!job) return null;
  const elapsedMs = job.finishedAtMs ? (job.finishedAtMs - job.startedAtMs) : (job.startedAtMs ? (Date.now() - job.startedAtMs) : 0);
  const etaMs = estimateEtaMs(job);
  const artifacts = scanArtifacts(job.outDir);
  const base = {
    id: job.id,
    slug: job.slug,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    elapsedMs,
    elapsedText: fmtMs(elapsedMs),
    etaMs,
    etaText: job.status === 'running' ? ('~' + fmtMs(etaMs) + ' (estimado)') : (job.status === 'done' ? 'Concluído' : job.status === 'failed' ? 'Falhou' : '-'),
    currentStep: job.currentStep || 'Preparando...',
    steps: job.steps || [],
    logTail: (job.logTail || '').slice(-6000),
    logLines: (job.logLines || []).slice(-120),
    outputDir: job.outDir,
    artifacts,
    exitCode: job.exitCode,
    error: job.error || null,
    paramsSummary: job.paramsSummary || null,
    url: job.url || null,
    name: job.name || null,
  };
  if (opts.fullLog) base.fullLog = job.fullLog || job.logTail || '';
  return base;
}

function buildCloneArgs(entry) {
  const params = entry.params || {};
  const slug = params.slug || ('clone_' + String(entry.id || Date.now()).slice(-8));
  const outDir = params.outDir || path.join(OUTDIR, slug);
  const args = [path.join(ROOT, '.artcraft', 'yt-clone-build.mjs'), '--slug', slug, '--out', outDir];

  if (params.script) args.push('--script', params.script);
  if (params.voiceEngine) args.push('--voice', params.voiceEngine);
  else if (typeof params.voice === 'string') args.push('--voice', params.voice);
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
  if (params.avatar) {
    if (params.avatar.enabled !== undefined) args.push('--set', 'avatar.enabled=' + params.avatar.enabled);
    if (params.avatar.type) args.push('--set', 'avatar.type=' + params.avatar.type);
    if (params.avatar.lipSync !== undefined) args.push('--set', 'avatar.lipSync=' + params.avatar.lipSync);
    if (params.avatar.backgroundRemoval !== undefined) args.push('--set', 'avatar.backgroundRemoval=' + params.avatar.backgroundRemoval);
    ['heygen', 'synthesia', 'did', 'local', 'generated'].forEach(provider => {
      if (params.avatar[provider]) {
        Object.entries(params.avatar[provider]).forEach(([k, v]) => {
          args.push('--set', 'avatar.' + provider + '.' + k + '=' + JSON.stringify(v));
        });
      }
    });
  }
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
  if (params.voice && params.voice.cloneMyVoice) {
    if (params.voice.cloneMyVoice.enabled !== undefined) args.push('--set', 'voice.cloneMyVoice.enabled=' + params.voice.cloneMyVoice.enabled);
    if (params.voice.cloneMyVoice.samplesDir) args.push('--set', 'voice.cloneMyVoice.samplesDir=' + params.voice.cloneMyVoice.samplesDir);
    if (params.voice.cloneMyVoice.minSamples) args.push('--set', 'voice.cloneMyVoice.minSamples=' + params.voice.cloneMyVoice.minSamples);
    if (params.voice.cloneMyVoice.maxDurationSec) args.push('--set', 'voice.cloneMyVoice.maxDurationSec=' + params.voice.cloneMyVoice.maxDurationSec);
  }

  return { args, slug, outDir };
}

function updateQueueEntry(id, patch) {
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...patch };
    writeQueue(items);
  }
}

function startCloneJob(entry, opts = {}) {
  const id = entry.id || ('clone_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const { args, slug, outDir } = buildCloneArgs({ ...entry, id });
  const job = {
    id,
    slug,
    name: entry.name || entry.prompt || slug,
    url: entry.url || null,
    videoId: entry.videoId || null,
    paramsSummary: { slug, outDir, script: (entry.params||{}).script || null, referenceId: (entry.params||{}).referenceId || null },
    status: 'running',
    createdAt: entry.createdAt || nowIso(),
    startedAt: nowIso(),
    startedAtMs: Date.now(),
    finishedAt: null,
    finishedAtMs: null,
    currentStep: 'Iniciando pipeline de clonagem...',
    steps: [{ at: nowIso(), msg: 'Iniciando pipeline de clonagem...' }],
    logTail: '',
    fullLog: '',
    logLines: [],
    outDir,
    exitCode: null,
    error: null,
  };
  cloneJobs.set(id, job);
  activeCloneJobId = id;
  updateQueueEntry(id, { status: 'running', startedAt: job.startedAt, outDir });

  const pushLog = (chunk, stream) => {
    const text = String(chunk || '').replace(/\r\n/g, '\n');
    job.fullLog = (job.fullLog + text).slice(-200000);
    job.logTail = (job.logTail + text).slice(-12000);
    const lines = text.split('\n').map(s => s.trimEnd()).filter(s => s.length > 0);
    for (const line of lines) {
      job.logLines.push((stream === 'stderr' ? '[erro] ' : '') + line);
      if (job.logLines.length > 400) job.logLines = job.logLines.slice(-400);
      const step = inferStepFromLine(line);
      // Only record a step transition. The log often alternates between two
      // related lines ("Processando avatar" / "Animando avatar"), which used to
      // spam the timeline with duplicates, so we ignore a step that already
      // appeared in the recent entries.
      if (step && step !== job.currentStep) {
        const recent = job.steps.slice(-3).map(s => s.msg);
        if (!recent.includes(step)) {
          job.currentStep = step;
          job.steps.push({ at: nowIso(), msg: step });
          if (job.steps.length > 60) job.steps = job.steps.slice(-60);
        }
      }
    }
  };

  pushLog(`Comando: node ${args.map(a => /\s/.test(a) ? '"' + a + '"' : a).join(' ')}\n`, 'stdout');
  fs.mkdirSync(outDir, { recursive: true });

  const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
  job.pid = child.pid;

  child.stdout.on('data', (d) => pushLog(d, 'stdout'));
  child.stderr.on('data', (d) => pushLog(d, 'stderr'));
  child.on('error', (e) => {
    job.status = 'failed';
    job.finishedAt = nowIso();
    job.finishedAtMs = Date.now();
    job.error = String(e && e.message || e);
    job.currentStep = 'Falha ao iniciar processo';
    job.steps.push({ at: nowIso(), msg: job.currentStep });
    updateQueueEntry(id, { status: 'failed', finishedAt: job.finishedAt, error: job.error, output: job.logTail.slice(-5000) });
  });
  child.on('close', (code) => {
    job.exitCode = code;
    job.status = code === 0 ? 'done' : 'failed';
    job.finishedAt = nowIso();
    job.finishedAtMs = Date.now();
    if (code !== 0 && !job.error) job.error = `Processo finalizou com código ${code}. Veja o log.`;
    job.currentStep = code === 0 ? 'Concluído com sucesso' : 'Falhou (veja detalhes no log)';
    job.steps.push({ at: nowIso(), msg: job.currentStep });
    updateQueueEntry(id, {
      status: job.status,
      finishedAt: job.finishedAt,
      output: job.logTail.slice(-5000),
      error: job.error || null,
      outDir: job.outDir,
      exitCode: code,
    });
  });

  return job;
}

// -------------------- static / artifacts serving --------------------
function serveFileSafe(res, absPath) {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const ext = path.extname(absPath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
    '.log': 'text/plain; charset=utf-8',
    '.srt': 'text/plain; charset=utf-8',
    '.vtt': 'text/vtt; charset=utf-8',
  };
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(absPath).pipe(res);
}

// -------------------- server --------------------
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

  // Serve generated clone artifacts for preview: /clones/<slug>/<file>
  if (req.method === 'GET' && (url.pathname === '/clones' || url.pathname.startsWith('/clones/'))) {
    const rel = decodeURIComponent(url.pathname.replace(/^\/clones\/?/, ''));
    const base = path.resolve(OUTDIR);
    const abs = path.resolve(path.join(OUTDIR, rel));
    if (!abs.startsWith(base)) { res.writeHead(403); res.end('forbidden'); return; }
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      // simple listing json
      const files = fs.readdirSync(abs).map(name => {
        const p = path.join(abs, name); const st = fs.statSync(p);
        return { name, isDir: st.isDirectory(), size: st.size };
      });
      json(res, 200, { ok: true, dir: rel, files });
      return;
    }
    serveFileSafe(res, abs);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    if (!fs.existsSync(DASH)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dashboard not built. Run: node D:\\CRAFT\\.artcraft\\yt-dashboard.mjs');
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      // Hard anti-cache. A stale dashboard in the browser keeps the OLD inline
      // script, so every button (filters, clone, collect) silently dies.
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'pragma': 'no-cache',
      'expires': '0',
      'x-dashboard-version': String(Date.now()),
    });
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
      activeCloneJobId,
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
    req.on('data', (d) => { body += d.toString(); if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body || '{}'); } catch { json(res, 400, { ok: false, error: 'invalid JSON' }); return; }
      writeSettings(payload);
      json(res, 200, { ok: true, message: 'settings saved' });
    });
    return;
  }

  // ---- clone endpoints ----
  const handleCloneStart = (payload, resObj) => {
    if (!payload || !payload.url || !/youtube\.com|youtu\.be/.test(payload.url)) {
      json(resObj, 400, { ok: false, error: 'url must be a YouTube link' });
      return;
    }
    const id = payload.jobId || ('clone_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const entry = {
      id,
      createdAt: nowIso(),
      status: 'queued',
      url: payload.url,
      videoId: payload.id || payload.videoId || null,
      channel: payload.channel || null,
      prompt: payload.prompt || payload.name || '',
      name: payload.name || payload.prompt || null,
      params: payload.params || {},
    };
    // ensure slug in params
    if (!entry.params.slug) entry.params.slug = (entry.name || 'clone').toString().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g,'').slice(0,40) || ('clone_' + id.slice(-6));
    appendQueue(entry);
    const job = startCloneJob(entry);
    json(resObj, 200, { ok: true, started: true, jobId: id, slug: job.slug, statusUrl: '/clone/status?id=' + id, job: cloneJobPublic(job) });
  };

  if (req.method === 'POST' && (url.pathname === '/clone/start')) {
    let body = '';
    req.on('data', (d) => { body += d.toString(); if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let payload; try { payload = JSON.parse(body || '{}'); } catch { json(res, 400, { ok: false, error: 'invalid JSON' }); return; }
      handleCloneStart(payload, res);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/clone/status') {
    const id = url.searchParams.get('id') || activeCloneJobId;
    const job = id ? cloneJobs.get(id) : null;
    if (!job) return json(res, 404, { ok: false, error: 'job not found', id });
    return json(res, 200, { ok: true, job: cloneJobPublic(job) });
  }

  if (req.method === 'GET' && url.pathname === '/clone/active') {
    const job = activeCloneJobId ? cloneJobs.get(activeCloneJobId) : null;
    return json(res, 200, { ok: true, activeCloneJobId, job: cloneJobPublic(job) });
  }

  if (req.method === 'GET' && url.pathname === '/clone/jobs') {
    const jobs = Array.from(cloneJobs.values()).sort((a,b)=> (b.startedAtMs||0)-(a.startedAtMs||0)).map(j => cloneJobPublic(j));
    return json(res, 200, { ok: true, jobs });
  }

  if (req.method === 'GET' && url.pathname === '/clone/log') {
    const id = url.searchParams.get('id') || activeCloneJobId;
    const job = id ? cloneJobs.get(id) : null;
    if (!job) return json(res, 404, { ok: false, error: 'job not found' });
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(job.fullLog || job.logTail || '');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/clone') {
    let body = '';
    req.on('data', (d) => { body += d.toString(); if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body || '{}'); } catch { json(res, 400, { ok: false, error: 'invalid JSON' }); return; }
      if (!payload.url || !/youtube\.com|youtu\.be/.test(payload.url)) {
        json(res, 400, { ok: false, error: 'url must be a YouTube link' });
        return;
      }
      const id = payload.jobId || ('clone_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      const entry = {
        id,
        createdAt: nowIso(),
        status: 'pending',
        url: payload.url,
        videoId: payload.id || payload.videoId || null,
        channel: payload.channel || null,
        prompt: payload.prompt || payload.name || '',
        name: payload.name || payload.prompt || null,
        params: payload.params || {},
      };
      if (!entry.params.slug) entry.params.slug = (entry.name || 'clone').toString().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g,'').slice(0,40) || ('clone_' + id.slice(-6));
      appendQueue(entry);

      const wantAsync = payload.async === true || payload.execute === true || AUTO_EXECUTE;
      if (wantAsync) {
        const job = startCloneJob(entry);
        json(res, 200, { ok: true, queued: id, started: true, jobId: id, slug: job.slug, statusUrl: '/clone/status?id=' + id, job: cloneJobPublic(job) });
      } else {
        json(res, 200, { ok: true, queued: id, started: false, message: 'na fila. Clique em iniciar/processar para acompanhar a telemetria.' });
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
    // Start all pending as jobs (sequential start would be better, but start first and report)
    const started = [];
    for (const p of pending.slice(0, 1)) { // process one at a time to avoid overload
      const job = startCloneJob(p);
      started.push({ id: p.id, jobId: job.id });
    }
    json(res, 200, { ok: true, started, message: 'processamento iniciado (1 por vez). Acompanhe a telemetria.' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/refresh') {
    const child = spawn(process.execPath, [path.join(ROOT, '.artcraft', 'yt-dashboard.mjs')], { cwd: ROOT, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => json(res, code === 0 ? 200 : 500, { ok: code === 0, output: out.slice(-2000) }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/collect-targets') {
    let body = '';
    req.on('data', (d) => { body += d.toString(); if (body.length > 200000) req.destroy(); });
    req.on('end', async () => {
      let payload = {};
      try { payload = body ? JSON.parse(body) : {}; } catch { return json(res, 400, { ok: false, error: 'invalid JSON' }); }
      const result = await startCollectTargets(payload || {});
      json(res, 200, { ok: true, ...result });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/collect-targets/status') {
    json(res, 200, { ok: true, job: collectJob });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/config') {
    const cfgPath = path.join(ROOT, 'clone.config.json');
    if (fs.existsSync(cfgPath)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(cfgPath));
    } else {
      json(res, 404, { ok: false, error: 'config not found' });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('artcraft radar: http://127.0.0.1:' + PORT);
  console.log('  dashboard : ' + DASH);
  console.log('  queue     : ' + QUEUE);
  console.log('  settings  : ' + SETTINGS_FILE);
  console.log('  outdir    : ' + OUTDIR);
  console.log('  auto-execute: ' + AUTO_EXECUTE);
  if (arg('open', null) !== null) {
    const url = 'http://127.0.0.1:' + PORT;
    const open = process.platform === 'win32' ? 'cmd' : 'open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(open, args, { detached: true, stdio: 'ignore' }).unref();
  }
});