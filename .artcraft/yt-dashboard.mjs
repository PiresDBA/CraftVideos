#!/usr/bin/env node
/**
 * Build a self-contained, clickable HTML dashboard from the research output.
 *
 * Two hard-won design rules live in this file:
 *
 *  1. Cards are rendered SERVER-SIDE into real HTML. JavaScript only adds
 *     filtering, the player modal and the clone button. A version that built the
 *     grid in client JS died on one syntax error and produced a black page.
 *
 *  2. Thumbnails are EMBEDDED as base64 (webp, 320px). External i.ytimg.com URLs
 *     load fine in a normal browser but are blocked inside sandboxed preview
 *     panes, which shows up as a grid of broken-image icons. Embedded bytes have
 *     no network dependency at all: they work over http://, file:// and offline.
 *
 * Input : work/research/run1/channels.json     (yt-channels.mjs)
 *         work/research/world/world.json       (yt-top-world.mjs, optional)
 * Output: work/research/dashboard/index.html   (single file, self-contained)
 *         work/research/dashboard/thumbs/      (cache, reused across runs)
 *
 * Usage:
 *   node yt-dashboard.mjs [--sample ...] [--world ...] [--out ...] [--quality 50]
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { createClassifier } from './yt-classify.mjs';

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

const SAMPLE_ARGS = argAll('sample');
const SAMPLE = SAMPLE_ARGS[0] || 'D:\\CRAFT\\work\\research\\run1\\channels.json';
const WORLD = arg('world', 'D:\\CRAFT\\work\\research\\world\\world.json');
const OUT = arg('out', 'D:\\CRAFT\\work\\research\\dashboard');
const TAXONOMY_PATH = arg('taxonomy', 'D:\\CRAFT\\taxonomy.json');
const SHORTS_SCAN = arg('shorts-scan', arg('channel-scan', 'D:\\CRAFT\\work\\research\\channel-scan.json'));
const QUALITY = String(arg('quality', '50'));
const NO_EMBED = process.argv.includes('--no-embed');

// Adaptive so a much larger sample does not produce a 10 MB HTML file.
let THUMB_W = 320;
let THUMB_Q = QUALITY;
function adaptThumbSize(count) {
  if (count > 220) {
    THUMB_W = 240;
    THUMB_Q = '45';
  } else if (count > 130) {
    THUMB_W = 288;
    THUMB_Q = '48';
  }
}

// ---------------------------------------------------------------- thumbnail pipeline

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    'C:\\Users\\Pires\\AppData\\Local\\hermes\\tools\\ffmpeg-9.0.1-win32-x64\\bin\\ffmpeg.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  const where = spawnSync('where', ['ffmpeg'], { encoding: 'utf8' });
  if (where.status === 0) {
    const first = String(where.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first) return first;
  }
  return null;
}

const FFMPEG = findFfmpeg();
const THUMB_DIR = path.join(OUT, 'thumbs');

function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'));
    const req = https.get(url, { headers: { 'user-agent': 'Mozilla/5.0 (ArtCraft radar)' }, timeout: 15000 }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        return httpGet(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (code !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + code));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Download mqdefault -> webp. Cached on disk, so daily runs only fetch new ids. */
async function ensureThumb(id) {
  const cacheFile = path.join(THUMB_DIR, id + '.' + THUMB_W + 'q' + THUMB_Q + '.webp');
  if (fs.existsSync(cacheFile)) {
    try {
      return fs.readFileSync(cacheFile);
    } catch {
      /* refetch */
    }
  }

  let jpg = null;
  for (const name of ['mqdefault', 'hqdefault', 'default']) {
    try {
      jpg = await httpGet(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
      break;
    } catch {
      /* try next size */
    }
  }
  if (!jpg) return null;

  const tmpJpg = path.join(THUMB_DIR, id + '.src.jpg');
  fs.writeFileSync(tmpJpg, jpg);

  if (FFMPEG) {
    const r = spawnSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-i', tmpJpg, '-vf', 'scale=' + THUMB_W + ':-2', '-c:v', 'libwebp', '-quality', THUMB_Q, '-compression_level', '6', cacheFile],
      { windowsHide: true }
    );
    fs.rmSync(tmpJpg, { force: true });
    if (r.status === 0 && fs.existsSync(cacheFile)) {
      try {
        return fs.readFileSync(cacheFile);
      } catch {
        /* fall through */
      }
    }
  } else {
    fs.renameSync(tmpJpg, cacheFile);
  }
  return jpg;
}

async function buildThumbs(ids) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const map = new Map();
  const queue = ids.slice();
  let done = 0;
  let failed = 0;

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const buf = await ensureThumb(id);
        if (buf) map.set(id, buf.toString('base64'));
        else failed++;
      } catch {
        failed++;
      }
      done++;
      if (done % 20 === 0) process.stdout.write(`  miniaturas ${done}/${ids.length}\r`);
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker));
  if (ids.length >= 20) process.stdout.write(' '.repeat(40) + '\r');
  return { map, failed };
}

// ---------------------------------------------------------------- classification

/**
 * Classification is DATA, not code.
 *
 * Two independent layers, both driven by taxonomy.json:
 *   1. niches  — what the channel talks about (content type filter)
 *   2. ai      — whether the channel is produced by AI: avatar presenter, synthesised
 *                voice, automated editing, automated publishing. Niche-agnostic by design;
 *                there are Dark channels about tech, food, news and horror alike.
 *
 * Nothing here decides what "Dark" means: that lives in `TAXONOMY.ai` (weights, cadence
 * bands, keyword lists, threshold). Edit the file and re-run the build.
 */
const classifier = createClassifier(TAXONOMY_PATH);
const NICHE_BY_ID = classifier.NICHE_BY_ID;

function detectAudience(text) {
  const s = String(text || '');
  if (/\b(kids?|infantil|crian[çc]a|nursery|toys?|children|baby)\b/i.test(s)) return 'Infantil';
  if (/\b(18\+|adult|adulto|nsfw|explicit|porn)\b/i.test(s)) return 'Adulto';
  return 'Geral';
}

// ---------------------------------------------------------------- formatting

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/** 21 600 000 -> "21,6 M". Shorter and far easier to scan than raw digits. */
function compact(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const flat = (x) => String(x).replace('.', ',');
  if (v >= 1e9) return flat((v / 1e9).toFixed(1)) + ' B';
  if (v >= 1e6) return flat((v / 1e6).toFixed(1)) + ' M';
  if (v >= 1e4) return flat((v / 1e3).toFixed(0)) + ' mil';
  if (v >= 1e3) return flat((v / 1e3).toFixed(1)) + ' mil';
  return String(v);
}

function hueFor(cat) {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) % 360;
  return h;
}

/** 0 = no sample, 1 = weak, 2 = ok, 3 = strong — drives the "why" badge. */
function strategyOf(c) {
  const v7 = c.videos7d || 0;
  const avg = c.avgViews || 0;
  const subs = c.subs || 0;
  const ratio = subs ? avg / subs : 0;

  if (!v7) return { label: 'Inativo', tone: 'off', note: 'sem uploads nos últimos 7 dias' };
  if (ratio >= 0.5 && avg >= 100000) {
    return { label: 'Viral', tone: 'imp', note: 'cada vídeo faz ' + ratio.toFixed(1) + '× os subscritores' };
  }
  if (avg >= 500000) return { label: 'Impacto', tone: 'imp', note: 'média ' + compact(avg) + ' por vídeo' };
  if (v7 >= 3 && avg < 100000) {
    return { label: 'Volume', tone: 'vol', note: v7 + ' vídeos/semana, média ' + compact(avg) };
  }
  return { label: 'Regular', tone: 'mid', note: v7 + ' vídeos/semana, média ' + compact(avg) };
}

function insight(c) {
  const bits = [];
  if (c.totalViews && c.subs) {
    const per = c.totalViews / c.subs;
    bits.push(per >= 1 ? 'cada subscritor gerou ' + per.toFixed(1) + ' views' : 'conversão sub→view baixa');
  }
  if (c.avgViews) bits.push('média ' + compact(c.avgViews) + '/vídeo');
  if (c.maxViews) bits.push('melhor ' + compact(c.maxViews));
  return bits.join(' · ');
}

// ---------------------------------------------------------------- build

function loadSamples(paths) {
  const loaded = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      console.error('sample not found: ' + p);
      continue;
    }
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    loaded.push({ path: p, data: parsed });
  }
  if (!loaded.length) {
    console.error('nenhuma amostra válida');
    process.exit(2);
  }
  return loaded;
}

/** Merge several collection runs into one channel list, keyed by channel id. */
function mergeSamples(loaded) {
  const videos = new Map();
  const channels = new Map();

  for (const { data } of loaded) {
    for (const v of data.videos || []) {
      if (v && v.id && !videos.has(v.id)) videos.set(v.id, v);
    }
    for (const c of data.channels || []) {
      const key = c.channel_id || c.channel;
      if (!key) continue;
      const prev = channels.get(key);
      if (!prev) {
        channels.set(key, Object.assign({}, c));
        continue;
      }
      if ((c.videosSeen || 0) > (prev.videosSeen || 0)) {
        prev.videosSeen = c.videosSeen;
        prev.totalViewsSeen = c.totalViewsSeen;
        prev.avgViews = c.avgViews;
        prev.maxViews = c.maxViews;
      }
      prev.subs = prev.subs || c.subs;
      const a = prev.rssVideosInWindow;
      const b = c.rssVideosInWindow;
      prev.rssVideosInWindow = a === undefined ? b : b === undefined ? a : Math.max(a, b);
      prev.shortsShare = Math.max(prev.shortsShare || 0, c.shortsShare || 0);
      prev.avgDuration = prev.avgDuration || c.avgDuration;
    }
  }

  return { channels: Array.from(channels.values()), videos: Array.from(videos.values()) };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const loaded = loadSamples(SAMPLE_ARGS.length ? SAMPLE_ARGS : [SAMPLE]);
  const sample = mergeSamples(loaded);

  let world = null;
  if (fs.existsSync(WORLD)) {
    try {
      world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
    } catch {
      /* optional */
    }
  }

  // Channel scan: YouTube search hides Shorts, and no video field says "this channel is
  // made by AI". The channel page gives both — the /shorts tab and the description where
  // AI/avatar/automation is disclosed. Without it every channel looks long-form and human.
  let scan = null;
  if (fs.existsSync(SHORTS_SCAN)) {
    try {
      scan = JSON.parse(fs.readFileSync(SHORTS_SCAN, 'utf8'));
    } catch {
      scan = null;
    }
  }
  const scanFor = (id) => (scan && scan.channels && scan.channels[id]) || null;

  const byChannel = new Map();
  for (const v of sample.videos || []) {
    const key = v.channel_id || v.channel;
    if (!key) continue;
    if (!byChannel.has(key)) byChannel.set(key, []);
    byChannel.get(key).push(v);
  }

  const channels = (sample.channels || []).map((c) => {
    const vids = byChannel.get(c.channel_id || c.channel) || [];
    const text = [c.channel].concat(vids.map((v) => v.title)).join(' ');
    const top = vids.slice().sort((a, b) => b.views - a.views)[0];
    const shorts = vids.filter((v) => v.isShort).length;
    const shortsShare = vids.length ? shorts / vids.length : c.shortsShare || 0;
    const sc = scanFor(c.channel_id);
    const cls = classifier.verdictOf(c, vids, sc);
    return {
      id: c.channel_id || c.channel,
      name: c.channel,
      url: c.channel_url || 'https://www.youtube.com/channel/' + c.channel_id,
      subs: c.subs === undefined ? null : c.subs,
      videos7d: c.rssVideosInWindow === undefined ? null : c.rssVideosInWindow,
      totalViews: c.totalViewsSeen,
      avgViews: c.avgViews,
      maxViews: c.maxViews,
      category: cls.label,
      niche: cls.niche,
      ai: cls.ai,
      aiVerdict: cls.aiVerdict,
      aiScore: cls.aiScore,
      aiMax: cls.aiMax,
      aiThreshold: cls.aiThreshold,
      aiReasons: cls.aiReasons,
      overridden: !!cls.overridden,
      runnerUp: cls.runnerUp,
      confidence: cls.confidence,
      audience: detectAudience(text),
      shortsShare: Math.round(shortsShare * 100) / 100,
      format: shortsShare >= 0.5 ? 'shorts' : 'long',
      // measured on the channel's /shorts tab, not guessed from search results
      shortsCount: sc ? sc.shorts : null,
      shortsViews: sc ? (sc.shortsViews === undefined ? sc.views : sc.shortsViews) : null,
      shortsActive: !!(sc && sc.shorts >= 3),
      shortsTop: sc && sc.top ? sc.top : null,
      avgDuration: c.avgDuration || null,
      topVideo: top ? { id: top.id, title: top.title, views: top.views, url: top.url } : null,
      videos: vids
        .slice()
        .sort((a, b) => b.views - a.views)
        .slice(0, 8)
        .map((v) => ({ id: v.id, title: v.title, views: v.views, date: v.upload_date, url: v.url, short: !!v.isShort })),
    };
  });

  for (const c of channels) c.strategy = strategyOf(c);
  // default order: most viewed first, as requested
  channels.sort((a, b) => (b.totalViews || 0) - (a.totalViews || 0));

  // ---- thumbnails: every id referenced anywhere in the page
  const ids = new Set();
  for (const c of channels) {
    if (c.topVideo) ids.add(c.topVideo.id);
    for (const v of c.videos) ids.add(v.id);
  }
  const idList = Array.from(ids).filter((x) => x && /^[A-Za-z0-9_-]{6,20}$/.test(x));

  let thumbs = new Map();
  let thumbFailed = 0;
  if (!NO_EMBED) {
    adaptThumbSize(idList.length);
    const built = await buildThumbs(idList);
    thumbs = built.map;
    thumbFailed = built.failed;
  }

  const html = renderPage(channels, sample, world, thumbs);
  const file = path.join(OUT, 'index.html');
  fs.writeFileSync(file, html, 'utf8');

  const cats = {};
  for (const c of channels) cats[c.category] = (cats[c.category] || 0) + 1;
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log('dashboard     : ' + file);
  console.log('canais        : ' + channels.length + '   vídeos: ' + (sample.videos || []).length);
  console.log('miniaturas    : ' + thumbs.size + ' embutidas, ' + thumbFailed + ' falharam, ' + idList.length + ' ids');
  console.log('tamanho       : ' + kb + ' KB (ficheiro único)');
  console.log('categorias    : ' + JSON.stringify(cats));
  console.log('dark (IA)     : ' + channels.filter((c) => c.ai).length + ' canais 100% IA, ' + channels.filter((c) => c.aiVerdict === 'maybe').length + ' duvidosos, ' + channels.filter((c) => c.shortsActive).length + ' com shorts');
  if (thumbs.size === 0 && !NO_EMBED) console.log('AVISO: nenhuma miniatura embutida — o painel vai mostrar marcadores.');
}

// ---------------------------------------------------------------- render

function thClass(id) {
  return 'th_' + String(id).replace(/[^A-Za-z0-9_-]/g, '');
}

function thumbBox(id, extraClass, inner) {
  const cls = id ? thClass(id) : 'th_none';
  return '<div class="ph ' + cls + (extraClass ? ' ' + extraClass : '') + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + '>' + (inner || '') + '</div>';
}

function initial(name) {
  return esc(String(name || '?').trim().charAt(0).toUpperCase() || '?');
}

function searchBlob(c) {
  const parts = [c.name, c.category, c.audience];
  if (c.aiReasons && c.aiReasons.length) parts.push(c.aiReasons.join(' '));
  if (c.topVideo) parts.push(c.topVideo.title);
  for (const v of c.videos.slice(0, 8)) parts.push(v.title);
  return esc(parts.join(' ').toLowerCase().replace(/\s+/g, ' '));
}

/**
 * Dark verdict badge. The score is shown, never hidden: "maybe" is a real answer and the
 * operator needs to see how close the channel came and why, so the reasons ride along in
 * the tooltip instead of being thrown away.
 */
function aiBadge(c, inline) {
  const why = (c.aiReasons || []).join(' · ');
  const score = c.aiScore || 0;
  const max = c.aiThreshold || c.aiMax || 6;
  const attr = ' title="' + esc('IA ' + score + '/' + max + (why ? ' — ' + why : '')) + '"';
  if (c.ai) return '<span class="pill dark"' + attr + '>DARK IA ' + score + '/' + max + '</span>';
  if (c.aiVerdict === 'maybe') return '<span class="pill maybe"' + attr + '>IA? ' + score + '/' + max + '</span>';
  return inline ? '' : '';
}

function renderCard(c) {
  const tv = c.topVideo;
  const h = hueFor(c.category);

  const strip = (c.videos || [])
    .map(
      (v) =>
        '<button class="mini" data-id="' + esc(v.id) + '" title="' + esc(v.title) + ' · ' + compact(v.views) + ' views">' +
        thumbBox(v.id, 'miniimg', '<span class="miniview">' + compact(v.views) + '</span>') +
        '</button>'
    )
    .join('');

  const thumbInner = tv
    ? '<div class="playico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></div>'
    : '<div class="fallback">' + initial(c.name) + '<span>sem vídeo amostrado</span></div>';

  return (
    '<article class="card" data-cat="' + esc(c.category) + '" data-name="' + esc(String(c.name).toLowerCase()) + '"' +
    ' data-search="' + searchBlob(c) + '"' +
    ' data-niche="' + esc(c.niche) + '" data-ai="' + (c.ai ? '1' : '0') + '" data-aiv="' + esc(c.aiVerdict) + '" data-format="' + esc(c.format) + '"' +
    ' data-shorts="' + (c.shortsActive ? '1' : '0') + '"' +
    ' data-subs="' + (c.subs || 0) + '" data-views="' + (c.totalViews || 0) + '"' +
    ' data-avg="' + (c.avgViews || 0) + '" data-v7="' + (c.videos7d || 0) + '" style="--h:' + h + '">' +

    '<div class="hero">' + thumbBox(tv ? tv.id : null, 'heroimg', thumbInner) +
    '<span class="pill">' + esc(c.category) + '</span>' +
    aiBadge(c) +
    (c.shortsActive ? '<span class="pill shorts">' + (c.shortsCount ? c.shortsCount + ' SHORTS' : 'SHORTS') + '</span>' : '') +
    (c.audience === 'Adulto' ? '<span class="pill adult">18+</span>' : '') +
    '<span class="strat ' + c.strategy.tone + '">' + esc(c.strategy.label) + '</span>' +
    '</div>' +

    '<div class="body">' +
    '<h2><a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.name) + '</a></h2>' +

    '<div class="stats">' +
    '<div class="stat"><b>' + compact(c.subs) + '</b><span>subs</span></div>' +
    '<div class="stat"><b>' + (c.videos7d === null ? '—' : c.videos7d) + '</b><span>vids/7d</span></div>' +
    '<div class="stat"><b>' + compact(c.totalViews) + '</b><span>views</span></div>' +
    '</div>' +

    '<p class="note">' + esc(c.strategy.note) + '</p>' +
    '<p class="note dim">' + esc(insight(c)) + '</p>' +

    (strip ? '<div class="strip">' + strip + '</div>' : '') +

    '<div class="acts">' +
    '<button class="primary" data-clone="' + esc(c.name) + '" data-url="' + esc(tv ? tv.url : c.url) + '" data-id="' + esc(tv ? tv.id : '') + '">Clonar formato</button>' +
    '<button data-open="' + esc(c.url) + '">Ver canal</button>' +
    '</div>' +
    '</div></article>'
  );
}

function renderRow(c, i) {
  const tv = c.topVideo;
  return (
    '<tr data-cat="' + esc(c.category) + '" data-name="' + esc(String(c.name).toLowerCase()) + '"' +
    ' data-search="' + searchBlob(c) + '"' +
    ' data-niche="' + esc(c.niche) + '" data-ai="' + (c.ai ? '1' : '0') + '" data-aiv="' + esc(c.aiVerdict) + '" data-format="' + esc(c.format) + '"' +
    ' data-shorts="' + (c.shortsActive ? '1' : '0') + '"' +
    ' data-subs="' + (c.subs || 0) + '" data-views="' + (c.totalViews || 0) + '"' +
    ' data-avg="' + (c.avgViews || 0) + '" data-v7="' + (c.videos7d || 0) + '" style="--h:' + hueFor(c.category) + '">' +
    '<td class="rank">' + (i + 1) + '</td>' +
    '<td class="cellthumb"><button class="rowthumb" data-id="' + esc(tv ? tv.id : '') + '">' +
    thumbBox(tv ? tv.id : null, 'rowimg', tv ? '' : '<span class="fallback sm">' + initial(c.name) + '</span>') +
    '</button></td>' +
    '<td><a class="rname" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.name) + '</a>' +
    '<span class="pill">' + esc(c.category) + '</span>' +
    aiBadge(c, true) + '</td>' +
    '<td class="n">' + compact(c.subs) + '</td>' +
    '<td class="n">' + (c.videos7d === null ? '—' : c.videos7d) + '</td>' +
    '<td class="n">' + compact(c.totalViews) + '</td>' +
    '<td class="n">' + compact(c.avgViews) + '</td>' +
    '<td>' + (c.shortsActive ? 'Longos + ' + (c.shortsCount || '') + ' shorts' : c.format === 'shorts' ? 'Shorts' : 'Longo') + '</td>' +
    '<td class="stratcell"><span class="strat ' + c.strategy.tone + '">' + esc(c.strategy.label) + '</span></td>' +
    '<td><button class="primary" data-clone="' + esc(c.name) + '" data-url="' + esc(tv ? tv.url : c.url) + '" data-id="' + esc(tv ? tv.id : '') + '">Clonar</button></td>' +
    '</tr>'
  );
}

function renderPage(channels, sample, world, thumbs) {
  const cards = channels.map(renderCard).join('\n');
  const rows = channels.map(renderRow).join('\n');

  // one CSS rule per unique thumbnail => each image appears exactly once in the file
  const thumbCss = Array.from(thumbs.entries())
    .map(([id, b64]) => '.' + thClass(id) + '{background-image:url(data:image/webp;base64,' + b64 + ')}')
    .join('\n');

  const catCounts = {};
  for (const c of channels) catCounts[c.niche] = (catCounts[c.niche] || 0) + 1;
  const nicheLabel = (id) => (NICHE_BY_ID.get(id) || { label: id }).label;
  const darkCount = channels.filter((c) => c.ai).length;
  const darkMaybe = channels.filter((c) => c.aiVerdict === 'maybe').length;
  const shortsCount = channels.filter((c) => c.format === 'shorts').length;

  const chips = ['__all__']
    .concat(Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a]))
    .map((id) => {
      const label = id === '__all__' ? 'Todos os nichos' : nicheLabel(id);
      const n = id === '__all__' ? channels.length : catCounts[id];
      return '<button class="chip' + (id === '__all__' ? ' on' : '') + '" data-cat="' + esc(id) + '">' + esc(label) + '<i>' + n + '</i></button>';
    })
    .join('');

  const totalVideos = (sample.videos || []).length;
  const generated = sample.generatedAt ? new Date(sample.generatedAt) : new Date();
  const stamp = generated.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const data = JSON.stringify({
    channels: channels.map((c) => ({ id: c.id, name: c.name, url: c.url, topVideo: c.topVideo })),
  });

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar de Canais · ArtCraft</title>
<style>
:root{
  --bg:#0a0c10; --bg2:#0f1218; --panel:#141821; --panel2:#1b2029; --line:#242b36;
  --ink:#eceef2; --dim:#98a2b3; --dim2:#667085;
  --accent:#ff3b3b; --good:#3ecf8e; --info:#4aa8ff;
  --radius:14px;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:
  radial-gradient(1200px 600px at 15% -10%,rgba(255,59,59,.09),transparent 60%),
  radial-gradient(900px 500px at 95% 0%,rgba(74,168,255,.08),transparent 55%),
  var(--bg);
  color:var(--ink);font:14px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{color:#fff;text-decoration:underline}

/* ---------- header ---------- */
header{position:sticky;top:0;z-index:40;background:rgba(10,12,16,.86);
  backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--line)}
.hwrap{max-width:1600px;margin:0 auto;padding:16px 22px 0}
.hrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(255,59,59,.16)}
h1{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em}
.sub{color:var(--dim2);font-size:12px}
.spacer{flex:1 1 auto}
input[type=search],select{background:var(--panel);color:var(--ink);border:1px solid var(--line);
  border-radius:10px;padding:9px 12px;font:inherit;font-size:13px;outline:none;min-height:38px}
input[type=search]{min-width:210px}
input[type=search]:focus,select:focus{border-color:#3d4a5c;box-shadow:0 0 0 3px rgba(74,168,255,.12)}
.seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel)}
.seg button{border:0;border-radius:0;background:none;color:var(--dim);padding:9px 14px;font-size:13px;min-height:38px}
.seg button.on{background:var(--ink);color:#0a0c10;font-weight:650}

.chips{display:flex;flex-wrap:wrap;gap:7px;padding:12px 0 14px}
.chip{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;cursor:pointer;
  border:1px solid var(--line);background:var(--panel);color:var(--dim);
  padding:7px 12px;border-radius:99px;font:inherit;font-size:12.5px;transition:.14s}
.chip i{font-style:normal;font-size:11px;color:var(--dim2);font-variant-numeric:tabular-nums}

/* ---------- quick filters ---------- */
.quick{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:12px 0 2px;
  border-top:1px solid var(--line)}
.qgroup{display:flex;align-items:center;gap:0;border:1px solid var(--line);border-radius:10px;
  overflow:hidden;background:var(--panel)}
.qgroup .qlab{padding:0 10px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--dim2);border-right:1px solid var(--line)}
.qgroup button{border:0;border-radius:0;background:none;color:var(--dim);padding:8px 12px;
  font:inherit;font-size:12.5px;cursor:pointer;transition:.13s}
.qgroup button:hover{color:var(--ink);background:#1c222d}
.qgroup button.on{background:var(--ink);color:#0a0c10;font-weight:650}
.qgroup button.dark.on{background:#e04848;color:#fff}
.qgroup button.shorts.on{background:#4aa8ff;color:#04131f}
.chip:hover{border-color:#39445a;color:var(--ink)}
.chip.on{background:var(--ink);border-color:var(--ink);color:#0a0c10;font-weight:650}
.chip.on i{color:rgba(10,12,16,.55)}

/* ---------- layout ---------- */
main{max-width:1600px;margin:0 auto;padding:22px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}

/* ---------- card ---------- */
.card{background:linear-gradient(180deg,var(--panel),#11151c);border:1px solid var(--line);
  border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;
  transition:transform .16s,border-color .16s,box-shadow .16s}
.card:hover{transform:translateY(-2px);border-color:#39445a;box-shadow:0 12px 28px -12px rgba(0,0,0,.8)}

.hero{position:relative;aspect-ratio:16/9;background:#0d1016;overflow:hidden}
.ph{width:100%;height:100%;background-color:#171c25;background-size:cover;background-position:center;position:relative}
.th_none{background-image:linear-gradient(135deg,#1c2330,#12161d 60%,#1a2129)}
.heroimg{cursor:pointer}
.heroimg::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,transparent 45%,rgba(6,8,11,.72));pointer-events:none}
.playico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity .16s;color:#fff;z-index:2}
.playico svg{width:54px;height:54px;filter:drop-shadow(0 3px 10px rgba(0,0,0,.75))}
.heroimg:hover .playico{opacity:1}
.fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:6px;color:#3f4a5c;font-size:34px;font-weight:800;letter-spacing:-.02em}
.fallback span{font-size:11px;font-weight:500;letter-spacing:0}
.fallback.sm{font-size:15px}

.pill{position:absolute;top:9px;left:9px;z-index:3;background:rgba(8,10,14,.82);
  color:hsl(var(--h,0) 85% 72%);border:1px solid hsl(var(--h,0) 70% 55% / .45);
  font-size:10.5px;font-weight:700;letter-spacing:.02em;padding:3px 8px;border-radius:7px;
  backdrop-filter:blur(4px)}
.pill.adult{left:auto;right:9px;color:#ffb4b4;border-color:rgba(255,90,90,.5)}
.pill.dark{top:auto;bottom:9px;left:9px;color:#ff9a9a;border-color:rgba(224,72,72,.55);
  background:rgba(60,10,10,.85)}
.pill.maybe{top:auto;bottom:9px;left:9px;color:#ffd28a;border-color:rgba(214,148,32,.55);
  background:rgba(48,32,4,.85)}
.pill.shorts{top:auto;bottom:9px;left:9px;color:#8fd0ff;border-color:rgba(74,168,255,.5);
  background:rgba(6,24,40,.85)}
.pill.dark + .pill.shorts{left:auto;right:9px;bottom:9px}
td .pill{margin-left:6px}
.strat{position:absolute;bottom:9px;right:9px;z-index:3;font-size:10.5px;font-weight:700;
  padding:3px 8px;border-radius:7px;border:1px solid transparent;backdrop-filter:blur(4px)}
.strat.imp{background:rgba(62,207,142,.16);color:#61e3a8;border-color:rgba(62,207,142,.35)}
.strat.vol{background:rgba(74,168,255,.16);color:#82c4ff;border-color:rgba(74,168,255,.35)}
.strat.mid{background:rgba(255,255,255,.1);color:#c8cfda;border-color:rgba(255,255,255,.16)}
.strat.off{background:rgba(255,255,255,.06);color:#7b8494;border-color:rgba(255,255,255,.1)}

.body{padding:13px 14px 14px;display:flex;flex-direction:column;gap:9px;flex:1}
h2{margin:0;font-size:15.5px;font-weight:700;letter-spacing:-.01em;line-height:1.3}
h2 a:hover{text-decoration:none}

.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.stat{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 9px;
  display:flex;flex-direction:column;gap:1px;min-width:0}
.stat b{font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.stat span{font-size:10.5px;color:var(--dim2);text-transform:uppercase;letter-spacing:.04em}

.note{margin:0;font-size:12.5px;color:var(--dim);line-height:1.45}
.note.dim{color:var(--dim2);font-size:12px}

.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:2px}
.mini{border:0;padding:0;background:none;cursor:pointer;border-radius:7px;overflow:hidden;
  position:relative;aspect-ratio:16/9;display:block}
.miniimg{border-radius:7px;transition:transform .16s}
.mini:hover .miniimg{transform:scale(1.06)}
.miniview{position:absolute;bottom:3px;right:4px;font-size:9.5px;font-weight:600;color:#fff;
  background:rgba(0,0,0,.75);padding:1px 4px;border-radius:4px;z-index:2}

.acts{display:flex;gap:8px;margin-top:auto;padding-top:4px}
button{font:inherit;font-size:12.5px;padding:8px 12px;border-radius:9px;cursor:pointer;
  border:1px solid var(--line);background:var(--panel2);color:var(--ink);transition:.14s}
button:hover{border-color:#47536b;background:#212836}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:650}
button.primary:hover{filter:brightness(1.12)}

/* ---------- table ---------- */
.tablewrap{border:1px solid var(--line);border-radius:var(--radius);overflow:auto;background:var(--panel)}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
th,td{padding:9px 12px;text-align:left;vertical-align:middle;border-bottom:1px solid var(--line)}
th{position:sticky;top:0;z-index:2;background:#131821;font-size:10.5px;text-transform:uppercase;
  letter-spacing:.06em;color:var(--dim2);font-weight:700;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:rgba(255,255,255,.028)}
td.rank{color:var(--dim2);font-variant-numeric:tabular-nums;width:44px}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dim)}
td.n b{color:var(--ink)}
.cellthumb{width:88px}
.rowthumb{border:0;padding:0;background:none;cursor:pointer;display:block;width:78px;aspect-ratio:16/9;
  border-radius:6px;overflow:hidden}
.rowimg{border-radius:6px}
.rname{font-weight:600;color:var(--ink);display:inline-block;margin-right:8px}
.stratcell{width:92px}
.stratcell .strat{position:static;display:inline-block}

/* ---------- misc ---------- */
.empty{display:none;text-align:center;color:var(--dim2);padding:60px 0;font-size:13.5px}
.hidden{display:none !important}
.modal{position:fixed;inset:0;z-index:100;background:rgba(4,6,9,.9);backdrop-filter:blur(6px);
.mbox.wide{max-width:900px}
.stabnav{display:flex;gap:4px;padding:8px 0;border-bottom:1px solid var(--line);overflow-x:auto}
.stabnav button{background:transparent;border:1px solid var(--line);color:var(--dim);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap}
.stabnav button.on{background:var(--panel);border-color:var(--accent);color:var(--accent)}
.stabpanel{padding:12px 0}
.stabpanel details{margin:8px 0}
.stabpanel summary{cursor:pointer;color:var(--ink);font-weight:600;padding:4px 0}
.mbody .row{display:grid;grid-template-columns:180px 1fr;gap:10px;margin:8px 0;align-items:center;font-size:13px}
.mbody label{color:var(--dim2);white-space:nowrap}
.mbody input,.mbody select,.mbody textarea{background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:6px 10px;border-radius:6px;font:inherit;width:100%}
.mbody input[type=color]{height:32px;padding:2px}
.mbody .dim{font-size:11px;color:var(--dim2);cursor:help;margin-left:6px}
.mbody .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
.lang-list details{margin:6px 0;padding:8px;background:var(--panel);border:1px solid var(--line);border-radius:6px}
.mbody{padding:16px 20px;max-height:70vh;overflow:auto}
.mbody .row{display:grid;grid-template-columns:140px 1fr;gap:10px;margin:10px 0;align-items:center;font-size:13px}
.mbody label{color:var(--dim2);white-space:nowrap}
.mbody input,.mbody select{background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:6px 10px;border-radius:6px;font:inherit}
.mbody input[type=color]{height:32px;padding:2px}
.mbody details{margin:8px 0}
.mbody summary{cursor:pointer;color:var(--ink);font-weight:600}
.mbody .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--panel2);border:1px solid var(--line);color:var(--ink);padding:10px 16px;border-radius:8px;z-index:200;opacity:0;pointer-events:none;transition:opacity .2s}
.toast.on{opacity:1}
  display:none;align-items:center;justify-content:center;padding:24px}
.modal.on{display:flex}
.mbox{width:min(1120px,96vw);background:var(--panel);border:1px solid var(--line);border-radius:16px;
  overflow:hidden;box-shadow:0 30px 80px -20px #000}
.mhead{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
.mhead .t{flex:1;font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mclose{background:none;border:0;color:var(--dim);font-size:24px;line-height:1;padding:0 4px;cursor:pointer}
.mclose:hover{color:#fff}
.mplayer{aspect-ratio:16/9;background:#000}
.mplayer iframe{width:100%;height:100%;border:0;display:block}
.mfoot{padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;
  border-top:1px solid var(--line);font-size:12px;color:var(--dim2)}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,18px);z-index:200;
  background:var(--good);color:#04160e;font-weight:650;font-size:13px;padding:11px 20px;border-radius:99px;
  opacity:0;transition:.22s;pointer-events:none;box-shadow:0 10px 30px -8px rgba(62,207,142,.6)}
.toast.on{opacity:1;transform:translate(-50%,0)}
footer{max-width:1600px;margin:0 auto;padding:26px 22px 40px;color:var(--dim2);font-size:12px;
  border-top:1px solid var(--line)}

@media (max-width:720px){
  .grid{grid-template-columns:1fr}
  main{padding:14px}
  .hwrap{padding:12px 14px 0}
  input[type=search]{min-width:0;flex:1}
  .tablewrap{font-size:12px}
  th,td{padding:8px}
  .cellthumb,.stratcell{display:none}
}
${thumbCss}
</style>
</head>
<body>
<header>
  <div class="hwrap">
    <div class="hrow">
      <div class="brand"><span class="dot"></span><h1>Radar de Canais</h1></div>
      <span class="sub" id="subline" data-total="${channels.length}" data-videos="${totalVideos}" data-stamp="${esc(stamp)}">${channels.length} canais · ${totalVideos} vídeos · ${darkCount} dark IA · ${darkMaybe} duvidosos · ${shortsCount} de shorts · ${esc(stamp)}</span>
      <div class="spacer"></div>
      <input type="search" id="q" placeholder="procurar canal, tema ou vídeo…">
      <select id="sort">
        <option value="views">Mais vistos (amostra)</option>
        <option value="subs">Mais subscritores</option>
        <option value="avg">Melhor média por vídeo</option>
        <option value="output">Mais publicaram (7d)</option>
        <option value="name">Nome A-Z</option>
      </select>
      <div class="seg">
        <button id="vgrid" class="on">Grelha</button>
        <button id="vtable">Tabela</button>
        <button id="settingsBtn" class="ghost" title="Configurações">⚙</button>
      </div>
    </div>
    <div class="chips" id="filters">${chips}</div>
    <div class="quick">
      <div class="qgroup" id="qai">
        <span class="qlab">Dark = 100% IA</span>
        <button data-ai="all" class="on">Todos</button>
        <button data-ai="yes" class="dark">Só Dark</button>
        <button data-ai="maybe">Duvidosos</button>
        <button data-ai="no">Só humano</button>
      </div>
      <div class="qgroup" id="qformat">
        <span class="qlab">Formato</span>
        <button data-format="all" class="on">Todos</button>
        <button data-format="long">Só longos</button>
        <button data-format="shorts" class="shorts">Só shorts</button>
        <button data-format="has" class="shorts">Com shorts</button>
      </div>
      <span class="sub" id="tally"></span>
    </div>
  </div>
</header>

<main>
  <div class="grid" id="grid">
${cards}
  </div>

  <div class="tablewrap hidden" id="tablewrap">
    <table>
      <thead><tr>
        <th>#</th><th></th><th>Canal</th>
        <th style="text-align:right">Subs</th>
        <th style="text-align:right">Vids/7d</th>
        <th style="text-align:right">Views</th>
        <th style="text-align:right">Média</th>
        <th>Formato</th>
        <th>Estratégia</th><th></th>
      </tr></thead>
      <tbody id="tbody">
${rows}
      </tbody>
    </table>
  </div>

  <div class="empty" id="empty">Nenhum canal corresponde a este filtro.</div>
</main>

<div class="modal" id="modal">
  <div class="mbox">
    <div class="mhead">
      <div class="t" id="mtitle"></div>
      <button class="mclose" id="mclose" aria-label="fechar">&times;</button>
    </div>
    <div class="mplayer" id="mplayer"></div>
    <div class="mfoot">
      <span id="mmeta"></span>
      <div class="spacer"></div>
      <button class="primary" id="mclone">Clonar este formato</button>
    </div>
  </div>
</div>

<div class="modal" id="cmodal">
  <div class="mbox wide">
    <div class="mhead">
      <div class="t">Parâmetros do Clone</div>
      <button class="mclose" id="cclose" aria-label="fechar">&times;</button>
    </div>
    <div class="mbody" id="cbody">
      <div class="row"><label>Canal alvo <span class="dim">(preenchido pelo card)</span></label><input id="c_url" type="url" placeholder="https://youtube.com/channel/..."></div>
      <div class="row"><label>Slug de saída</label><input id="c_slug" type="text" placeholder="clone-meu-canal"></div>
      <div class="row"><label>Script de cenas (JSON)</label><input id="c_script" type="text" placeholder="opcional — usa o default da config"></div>
      <details open><summary>Voz</summary>
        <div class="row"><label>Engine</label><select id="c_voice_engine"><option value="sapi">SAPI (Windows, tem pt-BR)</option><option value="filmcraft">FilmCraft TTS (en-US)</option><option value="none">Mudo</option></select></div>
        <div class="row"><label>Voz SAPI</label><input id="c_voice_sapi" type="text" placeholder="Microsoft Maria Desktop"></div>
      </details>
      <details><summary>Vídeo</summary>
        <div class="row"><label>Largura</label><input id="c_v_w" type="number" value="1080"></div>
        <div class="row"><label>Altura</label><input id="c_v_h" type="number" value="1920"></div>
        <div class="row"><label>FPS</label><input id="c_v_fps" type="number" value="30"></div>
        <div class="row"><label>CRF (qualidade)</label><input id="c_v_crf" type="number" value="20" min="16" max="28"></div>
      </details>
      <details><summary>Cartões (FigCraft)</summary>
        <div class="row"><label>Fonte</label><input id="c_c_font" type="text" value="Inter"></div>
        <div class="row"><label>Tamanho título</label><input id="c_c_hsize" type="number" value="108"></div>
        <div class="row"><label>Cor fundo</label><input id="c_c_bg" type="color" value="#0b0b12"></div>
        <div class="row"><label>Cor texto</label><input id="c_c_ink" type="color" value="#f4f4f4"></div>
        <div class="row"><label>Cor destaque</label><input id="c_c_accent" type="color" value="#e04848"></div>
      </details>
      <details><summary>Ken Burns</summary>
        <div class="row"><label>Ativar</label><select id="c_kb_en"><option value="true">Sim</option><option value="false">Não</option></select></div>
        <div class="row"><label>De</label><input id="c_kb_from" type="number" step="0.01" value="1.0"></div>
        <div class="row"><label>Para</label><input id="c_kb_to" type="number" step="0.01" value="1.07"></div>
      </details>
      <details><summary>Transição</summary>
        <div class="row"><label>Tipo</label><select id="c_tx_type"><option value="xfade">Fade/Dissolve</option><option value="none">Corte seco</option></select></div>
        <div class="row"><label>Segundos</label><input id="c_tx_sec" type="number" step="0.05" value="0.35"></div>
      </details>
      <details><summary>Música de fundo</summary>
        <div class="row"><label>Ficheiro</label><input id="c_m_path" type="text" placeholder="caminho para .mp3/.wav"></div>
        <div class="row"><label>Ganho (0-1)</label><input id="c_m_gain" type="number" step="0.01" value="0.1"></div>
      </details>
      <details><summary>Thumbnail</summary>
        <div class="row"><label>Kicker</label><input id="c_t_kicker" type="text" value="DARK · IA"></div>
        <div class="row"><label>Palavras (array JSON)</label><input id="c_t_words" type="text" value='["O QUE ELES","NAO CONTAM"]'></div>
      </details>
      <div class="actions">
        <button class="ghost" id="c_cancel">Cancelar</button>
        <button class="primary" id="c_submit">Enfileirar / Executar</button>
      </div>
    </div>
  
<div class="modal" id="smodal">
  <div class="mbox wide">
    <div class="mhead">
      <div class="t">Configurações do Radar</div>
      <button class="mclose" id="sclose" aria-label="fechar">&times;</button>
    </div>
    <div class="mbody" id="sbody">
      <nav class="stabnav" id="stabnav"></nav>
      <div class="stabpanels" id="stabpanels"></div>
      <div class="actions">
        <button class="ghost" id="s_cancel">Cancelar</button>
        <button class="primary" id="s_save">Salvar tudo</button>
      </div>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<footer>
  Gerado localmente a partir de dados públicos (YouTube + Wikipedia). Miniaturas embutidas no ficheiro — não precisa de internet para ver o painel.
  <br>CTR/cliques é analytics privado do YouTube Studio e não existe em dados públicos: as métricas usam visualizações e cadência de publicação.
  A amostra é uma amostra, não um censo.
</footer>

<script>
var DATA = ${data};

var state = { cat: '__all__', q: '', sort: 'views', ai: 'all', format: 'all' };

function num(el, attr){ return Number(el.getAttribute(attr) || 0); }

function matches(el){
  var okCat = state.cat === '__all__' || el.getAttribute('data-niche') === state.cat;
  var verdict = el.getAttribute('data-aiv');
  var okAi = state.ai === 'all'
    || (state.ai === 'yes' ? verdict === 'ai'
      : state.ai === 'maybe' ? verdict === 'maybe'
      : verdict === 'human');
  var okFmt = state.format === 'all'
    || (state.format === 'has' ? el.getAttribute('data-shorts') === '1' : el.getAttribute('data-format') === state.format);
  return okCat && okAi && okFmt;
}

function applyFilter(){
  var q = state.q.toLowerCase();
  var shown = 0;
  var aiShown = 0;
  var maybeShown = 0;
  var shortsShown = 0;
  var cards = document.querySelectorAll('#grid .card');
  for (var i = 0; i < cards.length; i++){
    var el = cards[i];
    var okQ = !q || (el.getAttribute('data-search') || el.getAttribute('data-name')).indexOf(q) >= 0;
    var show = matches(el) && okQ;
    el.classList.toggle('hidden', !show);
    if (show){
      shown++;
      var v = el.getAttribute('data-aiv');
      if (v === 'ai') aiShown++;
      else if (v === 'maybe') maybeShown++;
      if (el.getAttribute('data-shorts') === '1') shortsShown++;
    }
  }
  var rows = document.querySelectorAll('#tbody tr');
  for (var j = 0; j < rows.length; j++){
    var r = rows[j];
    var okN = !q || (r.getAttribute('data-search') || r.getAttribute('data-name')).indexOf(q) >= 0;
    r.classList.toggle('hidden', !(matches(r) && okN));
  }
  document.getElementById('empty').style.display = shown ? 'none' : 'block';
  var sub = document.getElementById('subline');
  if (sub) {
    sub.textContent = shown + ' canais · ' + sub.getAttribute('data-videos') + ' vídeos · ' + aiShown + ' dark IA · ' + maybeShown + ' duvidosos · ' + shortsShown + ' shorts · ' + sub.getAttribute('data-stamp');
  }
  var tally = document.getElementById('tally');
  if (tally) tally.textContent = shown + ' visíveis · ' + aiShown + ' dark IA · ' + maybeShown + ' duvidosos · ' + shortsShown + ' shorts';
}

function sortAll(){
  var grid = document.getElementById('grid');
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
  cards.sort(function(a, b){
    if (state.sort === 'name') return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
    if (state.sort === 'subs') return num(b,'data-subs') - num(a,'data-subs');
    if (state.sort === 'avg') return num(b,'data-avg') - num(a,'data-avg');
    if (state.sort === 'views') return num(b,'data-views') - num(a,'data-views');
    return num(b,'data-v7') - num(a,'data-v7') || num(b,'data-views') - num(a,'data-views');
  });
  for (var i = 0; i < cards.length; i++) grid.appendChild(cards[i]);

  var tbody = document.getElementById('tbody');
  var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
  rows.sort(function(a, b){
    if (state.sort === 'name') return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
    if (state.sort === 'subs') return num(b,'data-subs') - num(a,'data-subs');
    if (state.sort === 'avg') return num(b,'data-avg') - num(a,'data-avg');
    if (state.sort === 'views') return num(b,'data-views') - num(a,'data-views');
    return num(b,'data-v7') - num(a,'data-v7') || num(b,'data-views') - num(a,'data-views');
  });
  for (var k = 0; k < rows.length; k++) tbody.appendChild(rows[k]);
}

document.getElementById('filters').addEventListener('click', function(e){
  var chip = e.target.closest('.chip');
  if (!chip) return;
  state.cat = chip.getAttribute('data-cat');
  var all = document.querySelectorAll('.chip');
  for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === chip);
  applyFilter();
});

document.getElementById('q').addEventListener('input', function(e){
  state.q = e.target.value;
  applyFilter();
});

document.getElementById('qai').addEventListener('click', function(e){
  var b = e.target.closest('button[data-ai]');
  if (!b) return;
  state.ai = b.getAttribute('data-ai');
  var all = this.querySelectorAll('button');
  for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === b);
  applyFilter();
});

document.getElementById('qformat').addEventListener('click', function(e){
  var b = e.target.closest('button[data-format]');
  if (!b) return;
  state.format = b.getAttribute('data-format');
  var all = this.querySelectorAll('button');
  for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === b);
  applyFilter();
});

document.getElementById('sort').addEventListener('change', function(e){
  state.sort = e.target.value;
  sortAll();
  applyFilter();
});

function setView(v){
  var grid = document.getElementById('grid');
  var table = document.getElementById('tablewrap');
  grid.classList.toggle('hidden', v === 'table');
  table.classList.toggle('hidden', v !== 'table');
  document.getElementById('vgrid').classList.toggle('on', v === 'grid');
  document.getElementById('vtable').classList.toggle('on', v === 'table');
}
document.getElementById('vgrid').addEventListener('click', function(){ setView('grid'); });
document.getElementById('vtable').addEventListener('click', function(){ setView('table'); });

var modal = document.getElementById('modal');
var current = null;

function openVideo(id){
  if (!id) return;
  current = { id: id };
  document.getElementById('mtitle').textContent = 'youtube.com/watch?v=' + id;
  document.getElementById('mplayer').innerHTML =
    '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0" ' +
    'allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  document.getElementById('mmeta').textContent = 'a reproduzir no painel';
  modal.classList.add('on');
}
function closeModal(){
  modal.classList.remove('on');
  document.getElementById('mplayer').innerHTML = '';
  current = null;
}
document.getElementById('mclose').onclick = closeModal;
modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });

document.body.addEventListener('click', function(e){
  var thumb = e.target.closest('.heroimg, .miniimg, .rowimg');
  if (thumb){
    var id = thumb.getAttribute('data-id');
    if (id) { openVideo(id); return; }
  }
  var cl = e.target.closest('[data-clone]');
  if (cl){ doClone(cl.getAttribute('data-url'), cl.getAttribute('data-id'), cl.getAttribute('data-clone')); return; }
  var op = e.target.closest('[data-open]');
  if (op){ window.open(op.getAttribute('data-open'), '_blank', 'noopener'); }
});

document.getElementById('mclone').onclick = function(){
  if (current) doClone('https://www.youtube.com/watch?v=' + current.id, current.id, '');
};

function clonePrompt(url, name){
  var who = name ? ' do canal ' + name : '';
  return 'Clona o formato deste vídeo' + who + ': ' + url +
    ' — analisa o formato (género, duração, cadência, título, thumbnail),' +
    ' produz um vídeo equivalente com o mesmo formato mas conteúdo e identidade originais,' +
    ' e entrega o MP4 e a thumbnail.';
}

var currentClone = { url: '', id: '', name: '' };

async function loadCloneConfig() {
  try {
    const r = await fetch('http://127.0.0.1:8799/config');
    if (r.ok) return await r.json();
  } catch (e) {}
  return null;
}

function openCloneModal(url, id, name) {
  currentClone = { url, id, name };
  document.getElementById('c_url').value = url;
  document.getElementById('c_slug').value = 'clone-' + (name || 'canal').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  document.getElementById('cmodal').classList.add('on');

  // Load defaults from daemon config
  loadCloneConfig().then(cfg => {
    if (!cfg) return;
    document.getElementById('c_voice_sapi').value = cfg.voice?.sapi?.voice || 'Microsoft Maria Desktop';
    document.getElementById('c_v_w').value = cfg.video?.width || 1080;
    document.getElementById('c_v_h').value = cfg.video?.height || 1920;
    document.getElementById('c_v_fps').value = cfg.video?.fps || 30;
    document.getElementById('c_v_crf').value = cfg.video?.crf || 20;
    document.getElementById('c_c_font').value = cfg.cards?.fontFamily || 'Inter';
    document.getElementById('c_c_hsize').value = cfg.cards?.headline?.size || 108;
    document.getElementById('c_c_bg').value = cfg.cards?.palette?.bg || '#0b0b12';
    document.getElementById('c_c_ink').value = cfg.cards?.palette?.ink || '#f4f4f4';
    document.getElementById('c_c_accent').value = cfg.cards?.palette?.accent || '#e04848';
    document.getElementById('c_kb_en').value = cfg.motion?.kenBurns?.enabled ? 'true' : 'false';
    document.getElementById('c_kb_from').value = cfg.motion?.kenBurns?.from || 1.0;
    document.getElementById('c_kb_to').value = cfg.motion?.kenBurns?.to || 1.07;
    document.getElementById('c_tx_type').value = cfg.transition?.type || 'xfade';
    document.getElementById('c_tx_sec').value = cfg.transition?.seconds || 0.35;
    document.getElementById('c_m_gain').value = cfg.music?.gain || 0.1;
    document.getElementById('c_t_kicker').value = cfg.thumbnail?.kicker || 'DARK · IA';
    document.getElementById('c_t_words').value = JSON.stringify(cfg.thumbnail?.words || ['O QUE ELES', 'NAO CONTAM']);
  });
}

function closeCloneModal() {
  document.getElementById('cmodal').classList.remove('on');
}

function gatherCloneParams() {
  const params = {};
  const voice = { engine: document.getElementById('c_voice_engine').value };
  if (voice.engine === 'sapi') voice.sapi = { voice: document.getElementById('c_voice_sapi').value };
  params.voice = voice;
  params.video = {
    width: Number(document.getElementById('c_v_w').value),
    height: Number(document.getElementById('c_v_h').value),
    fps: Number(document.getElementById('c_v_fps').value),
    crf: Number(document.getElementById('c_v_crf').value),
  };
  params.cards = {
    fontFamily: document.getElementById('c_c_font').value,
    headline: { size: Number(document.getElementById('c_c_hsize').value) },
    palette: {
      bg: document.getElementById('c_c_bg').value,
      ink: document.getElementById('c_c_ink').value,
      accent: document.getElementById('c_c_accent').value,
    },
  };
  params.motion = { kenBurns: { enabled: document.getElementById('c_kb_en').value === 'true', from: Number(document.getElementById('c_kb_from').value), to: Number(document.getElementById('c_kb_to').value) } };
  params.transition = { type: document.getElementById('c_tx_type').value, seconds: Number(document.getElementById('c_tx_sec').value) };
  const mpath = document.getElementById('c_m_path').value.trim();
  if (mpath) params.music = { path: mpath, gain: Number(document.getElementById('c_m_gain').value) };
  params.loudness = { enabled: true, targetLufs: -14 };
  params.thumbnail = {
    kicker: document.getElementById('c_t_kicker').value,
    words: (() => { try { return JSON.parse(document.getElementById('c_t_words').value); } catch { return ['O QUE ELES', 'NAO CONTAM']; } })(),
  };
  const script = document.getElementById('c_script').value.trim();
  if (script) params.script = script;
  return params;
}

function doClone(url, id, name) {
  openCloneModal(url, id, name);
}

document.getElementById('c_cancel').onclick = closeCloneModal;

// ==================== SETTINGS PANEL ====================
var settingsTabs = [
  { id: 'general', label: 'Geral', icon: '🏠' },
  { id: 'schedule', label: 'Agendamento', icon: '⏰' },
  { id: 'avatar', label: 'Avatar', icon: '👤' },
  { id: 'voice', label: 'Voz / TTS', icon: '🎙' },
  { id: 'languages', label: 'Idiomas', icon: '🌐' },
  { id: 'pipeline', label: 'Pipeline', icon: '⚙️' },
  { id: 'advanced', label: 'Avançado', icon: '🔧' }
];

var defaultSettings = {
  general: {
    autoClone: false,
    daemonPort: 8799,
    workDir: 'D:\\CRAFT\\work\\clones',
    maxConcurrentClones: 1,
    notifyOnComplete: true
  },
  schedule: {
    enabled: true,
    cron: '0 9 * * *',  // 09:00 daily
    timezone: 'America/Sao_Paulo',
    runOnStart: false,
    presets: ['geral', 'dark', 'shorts'],
    maxChannelsPerRun: 500
  },
  avatar: {
    enabled: false,
    type: 'heygen',  // heygen | synthesia | did | local | generated
    heygen: { avatarId: '', apiKey: '' },
    synthesia: { avatarId: '', apiKey: '' },
    did: { presenterId: '', apiKey: '' },
    local: { path: '', format: 'mp4' },  // path to avatar video file
    generated: {  // Craft Anything / external generator
      prompt: 'Professional presenter, neutral background, 4K',
      negativePrompt: 'blurry, distorted, watermark',
      model: 'stable-video-diffusion',
      resolution: '1080x1920',
      duration: 30,
      fps: 30
    },
    lipSync: true,
    backgroundRemoval: true
  },
  voice: {
    engine: 'sapi',  // sapi | filmcraft | elevenlabs | xtts | kokoro | custom
    sapi: { voice: 'Microsoft Maria Desktop', rate: 0, volume: 100 },
    filmcraft: { voice: 'basic-female', pitch: 'default', pace: 1.0 },
    elevenlabs: { voiceId: '', apiKey: '', model: 'eleven_multilingual_v2', stability: 0.5, similarity: 0.75 },
    xtts: { speakerWav: '', language: 'pt', modelPath: '' },
    kokoro: { voice: 'pt-br-female-1', modelPath: '' },
    custom: { command: '', args: [] },  // external TTS CLI
    cloneMyVoice: {
      enabled: false,
      samplesDir: 'D:\\CRAFT\\work\\voice-samples',
      minSamples: 5,
      maxDurationSec: 30
    }
  },
  languages: {
    default: 'pt-BR',
    supported: ['pt-BR', 'en-US', 'es-ES'],
    perLanguage: {
      'pt-BR': { engine: 'sapi', voice: 'Microsoft Maria Desktop', ttsModel: 'xtts', clonedVoice: true },
      'en-US': { engine: 'filmcraft', voice: 'kokoro-heart', ttsModel: 'kokoro', clonedVoice: false },
      'es-ES': { engine: 'xtts', voice: '', ttsModel: 'xtts', clonedVoice: true }
    },
    autoTranslate: true,
    translateEngine: 'deepl',  // deepl | google | libre | none
    subtitleLanguages: ['pt-BR', 'en-US', 'es-ES']
  },
  pipeline: {
    video: { width: 1080, height: 1920, fps: 30, codec: 'libx264', crf: 20, preset: 'medium', pixFmt: 'yuv420p' },
    cards: { fontFamily: 'Inter', headlineSize: 108, palette: { bg: '#0b0b12', ink: '#f4f4f4', accent: '#e04848', muted: '#9aa3b5' } },
    motion: { kenBurns: { enabled: true, from: 1.0, to: 1.07 } },
    transition: { type: 'xfade', name: 'fade', seconds: 0.35 },
    music: { path: '', gain: 0.1, loop: true },
    loudness: { enabled: true, targetLufs: -14, truePeak: -1.5, range: 11 },
    thumbnail: { kicker: 'DARK · IA', words: ['O QUE ELES', 'NAO CONTAM'] },
    broll: { enabled: true, source: 'pexels', apiKey: '', minClipsPerScene: 2, maxDurationSec: 10 }
  },
  advanced: {
    ffmpegPath: '',
    ffprobePath: '',
    figcraftPath: '',
    logLevel: 'info',
    keepBuildArtifacts: false,
    uploadToYoutube: false,
    youtube: { clientId: '', clientSecret: '', refreshToken: '', playlistId: '' },
    metadata: { defaultTags: ['dark', 'ia', 'automatizado'], defaultCategory: '24', privacyStatus: 'private' }
  }
};

function loadSettings() {
  try {
    const stored = localStorage.getItem('radarSettings');
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return JSON.parse(JSON.stringify(defaultSettings));
}

function saveSettings(cfg) {
  localStorage.setItem('radarSettings', JSON.stringify(cfg));
  // Also send to daemon for persistence
  fetch('http://127.0.0.1:8799/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cfg)
  }).catch(() => {});
}

function renderSettingsTabs(cfg) {
  const nav = document.getElementById('stabnav');
  const panels = document.getElementById('stabpanels');
  nav.innerHTML = settingsTabs.map(t => '<button data-tab="' + t.id + '" class="' + (t.id === 'general' ? 'on' : '') + '">' + t.icon + ' ' + t.label + '</button>').join('');
  panels.innerHTML = settingsTabs.map(t => '<div class="stabpanel" id="panel-' + t.id + '" style="display:' + (t.id === 'general' ? 'block' : 'none') + '">' + renderPanel(t.id, cfg[t.id]) + '</div>').join('');

  nav.querySelectorAll('button').forEach(btn => {
    btn.onclick = function() {
      nav.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      this.classList.add('on');
      panels.querySelectorAll('.stabpanel').forEach(p => p.style.display = 'none');
      document.getElementById('panel-' + this.dataset.tab).style.display = 'block';
    };
  });
}

function renderPanel(id, cfg) {
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, m => ({'&':'&','<':'<','>':'>','"':'"',"'":"'"}[m]));
  const row = (label, html, help) => '<div class="row"><label>' + label + (help ? '<span class="dim" title="' + esc(help) + '">ⓘ</span>' : '') + '</label>' + html + '</div>';

  if (id === 'general') {
    return row('Auto-clone ao clicar', '<select id="s_autoClone"><option value="false" ' + (!cfg.autoClone ? 'selected' : '') + '>Não</option><option value="true" ' + (cfg.autoClone ? 'selected' : '') + '>Sim</option></select>', 'Executa o clone imediatamente ao clicar em Clonar') +
           row('Porta do daemon', '<input id="s_daemonPort" type="number" value="' + esc(cfg.daemonPort) + '" min="1024" max="65535">', 'Porta onde o daemon escuta (padrão 8799)') +
           row('Diretório de trabalho', '<input id="s_workDir" type="text" value="' + esc(cfg.workDir) + '" style="width:100%">', 'Onde os clones são salvos') +
           row('Clones simultâneos', '<input id="s_maxConcurrent" type="number" value="' + esc(cfg.maxConcurrentClones) + '" min="1" max="4">', 'Quantos clones rodar em paralelo') +
           row('Notificar ao terminar', '<select id="s_notify"><option value="true" ' + (cfg.notifyOnComplete ? 'selected' : '') + '>Sim</option><option value="false" ' + (!cfg.notifyOnComplete ? 'selected' : '') + '>Não</option></select>', 'Mostra toast quando o clone termina');
  }

  if (id === 'schedule') {
    return row('Agendamento ativo', '<select id="s_schedEnabled"><option value="true" ' + (cfg.enabled ? 'selected' : '') + '>Sim</option><option value="false" ' + (!cfg.enabled ? 'selected' : '') + '>Não</option></select>', 'Liga/desliga o radar diário') +
           row('Expressão cron', '<input id="s_cron" type="text" value="' + esc(cfg.cron) + '" placeholder="0 9 * * *">', 'Formato cron: min hora dia mês dia-semana (09:00 = "0 9 * * *")') +
           row('Fuso horário', '<input id="s_tz" type="text" value="' + esc(cfg.timezone) + '">', 'IANA timezone, ex: America/Sao_Paulo') +
           row('Rodar ao iniciar', '<select id="s_runOnStart"><option value="false" ' + (!cfg.runOnStart ? 'selected' : '') + '>Não</option><option value="true" ' + (cfg.runOnStart ? 'selected' : '') + '>Sim</option></select>', 'Executa uma coleta ao iniciar o daemon') +
           row('Presets de coleta', '<input id="s_presets" type="text" value="' + esc((cfg.presets || []).join(',')) + '">', 'Quais presets rodar: geral,dark,shorts,all') +
           row('Máx canais por execução', '<input id="s_maxChannels" type="number" value="' + esc(cfg.maxChannelsPerRun) + '" min="50" max="2000">', 'Limite de canais processados por corrida');
  }

  if (id === 'avatar') {
    const types = ['heygen','synthesia','did','local','generated'];
    const typeHtml = '<select id="s_avatarType" onchange="renderAvatarSub(this.value)">' + types.map(t => '<option value="' + t + '" ' + (cfg.type === t ? 'selected' : '') + '>' + t + '</option>').join('') + '</select>';
    let sub = '';
    if (cfg.type === 'heygen') sub = row('Avatar ID', '<input id="s_heygen_id" type="text" value="' + esc(cfg.heygen.avatarId) + '">') + row('API Key', '<input id="s_heygen_key" type="password" value="' + esc(cfg.heygen.apiKey) + '">');
    else if (cfg.type === 'synthesia') sub = row('Avatar ID', '<input id="s_synthesia_id" type="text" value="' + esc(cfg.synthesia.avatarId) + '">') + row('API Key', '<input id="s_synthesia_key" type="password" value="' + esc(cfg.synthesia.apiKey) + '">');
    else if (cfg.type === 'did') sub = row('Presenter ID', '<input id="s_did_id" type="text" value="' + esc(cfg.did.presenterId) + '">') + row('API Key', '<input id="s_did_key" type="password" value="' + esc(cfg.did.apiKey) + '">');
    else if (cfg.type === 'local') sub = row('Caminho do vídeo', '<input id="s_local_path" type="text" value="' + esc(cfg.local.path) + '" style="width:100%">', 'Arquivo .mp4/.webm do avatar (fundo verde recomendado)') + row('Formato', '<input id="s_local_fmt" type="text" value="' + esc(cfg.local.format) + '">');
    else if (cfg.type === 'generated') sub = row('Prompt', '<textarea id="s_gen_prompt" rows="2">' + esc(cfg.generated.prompt) + '</textarea>') + row('Negative prompt', '<textarea id="s_gen_neg" rows="2">' + esc(cfg.generated.negativePrompt) + '</textarea>') + row('Modelo', '<input id="s_gen_model" type="text" value="' + esc(cfg.generated.model) + '">') + row('Resolução', '<input id="s_gen_res" type="text" value="' + esc(cfg.generated.resolution) + '">') + row('Duração (s)', '<input id="s_gen_dur" type="number" value="' + esc(cfg.generated.duration) + '">') + row('FPS', '<input id="s_gen_fps" type="number" value="' + esc(cfg.generated.fps) + '">');

    return row('Avatar ativado', '<select id="s_avatarEnabled"><option value="false" ' + (!cfg.enabled ? 'selected' : '') + '>Não</option><option value="true" ' + (cfg.enabled ? 'selected' : '') + '>Sim</option></select>', 'Usa avatar em vez de cartões tipográficos') +
           row('Provedor', typeHtml, 'HeyGen, Synthesia, D-ID, arquivo local ou gerado por IA') +
           '<div id="avatar-sub">' + sub + '</div>' +
           row('Lip-sync automático', '<select id="s_lipSync"><option value="true" ' + (cfg.lipSync ? 'selected' : '') + '>Sim</option><option value="false" ' + (!cfg.lipSync ? 'selected' : '') + '>Não</option></select>', 'Sincroniza boca do avatar com áudio') +
           row('Remover fundo', '<select id="s_bgRemove"><option value="true" ' + (cfg.backgroundRemoval ? 'selected' : '') + '>Sim</option><option value="false" ' + (!cfg.backgroundRemoval ? 'selected' : '') + '>Não</option></select>', 'Remove fundo do avatar (chroma key ou IA)');
  }

  if (id === 'voice') {
    const engines = ['sapi','filmcraft','elevenlabs','xtts','kokoro','custom'];
    const engHtml = '<select id="s_voiceEngine" onchange="renderVoiceSub(this.value)">' + engines.map(e => '<option value="' + e + '" ' + (cfg.engine === e ? 'selected' : '') + '>' + e + '</option>').join('') + '</select>';
    let sub = '';
    if (cfg.engine === 'sapi') sub = row('Voz', '<input id="s_sapi_voice" type="text" value="' + esc(cfg.sapi.voice) + '">', 'Nome exato da voz SAPI instalada') + row('Velocidade', '<input id="s_sapi_rate" type="number" value="' + esc(cfg.sapi.rate) + '" min="-10" max="10">') + row('Volume', '<input id="s_sapi_vol" type="number" value="' + esc(cfg.sapi.volume) + '" min="0" max="100">');
    else if (cfg.engine === 'filmcraft') sub = row('Voz', '<input id="s_fc_voice" type="text" value="' + esc(cfg.filmcraft.voice) + '">', 'basic-female, basic-male, kokoro-heart, kokoro-bella, etc.') + row('Pitch', '<select id="s_fc_pitch"><option value="extraLow" ' + (cfg.filmcraft.pitch==='extraLow'?'selected':'') + '>Extra baixo</option><option value="low" ' + (cfg.filmcraft.pitch==='low'?'selected':'') + '>Baixo</option><option value="default" ' + (cfg.filmcraft.pitch==='default'?'selected':'') + '>Normal</option><option value="high" ' + (cfg.filmcraft.pitch==='high'?'selected':'') + '>Alto</option><option value="extraHigh" ' + (cfg.filmcraft.pitch==='extraHigh'?'selected':'') + '>Extra alto</option></select>') + row('Velocidade', '<input id="s_fc_pace" type="number" step="0.1" value="' + esc(cfg.filmcraft.pace) + '" min="0.5" max="2">');
    else if (cfg.engine === 'elevenlabs') sub = row('Voice ID', '<input id="s_11l_id" type="text" value="' + esc(cfg.elevenlabs.voiceId) + '">') + row('API Key', '<input id="s_11l_key" type="password" value="' + esc(cfg.elevenlabs.apiKey) + '">') + row('Modelo', '<input id="s_11l_model" type="text" value="' + esc(cfg.elevenlabs.model) + '">') + row('Stability', '<input id="s_11l_stab" type="number" step="0.01" value="' + esc(cfg.elevenlabs.stability) + '" min="0" max="1">') + row('Similarity', '<input id="s_11l_sim" type="number" step="0.01" value="' + esc(cfg.elevenlabs.similarity) + '" min="0" max="1">');
    else if (cfg.engine === 'xtts') sub = row('Speaker WAV', '<input id="s_xtts_wav" type="text" value="' + esc(cfg.xtts.speakerWav) + '" style="width:100%">', 'Amostra de voz para clonagem') + row('Idioma', '<input id="s_xtts_lang" type="text" value="' + esc(cfg.xtts.language) + '">') + row('Model path', '<input id="s_xtts_model" type="text" value="' + esc(cfg.xtts.modelPath) + '" style="width:100%">');
    else if (cfg.engine === 'kokoro') sub = row('Voz', '<input id="s_kokoro_voice" type="text" value="' + esc(cfg.kokoro.voice) + '">', 'ex: pt-br-female-1, en-us-male-1') + row('Model path', '<input id="s_kokoro_model" type="text" value="' + esc(cfg.kokoro.modelPath) + '" style="width:100%">', 'Caminho do modelo Kokoro (335 MB)');
    else if (cfg.engine === 'custom') sub = row('Comando', '<input id="s_custom_cmd" type="text" value="' + esc(cfg.custom.command) + '" style="width:100%">', 'CLI externo de TTS') + row('Args (JSON)', '<textarea id="s_custom_args" rows="2">' + esc(JSON.stringify(cfg.custom.args)) + '</textarea>');

    const cloneHtml = row('Clonar minha voz', '<select id="s_cloneEnabled"><option value="false" ' + (!cfg.cloneMyVoice.enabled ? 'selected' : '') + '>Não</option><option value="true" ' + (cfg.cloneMyVoice.enabled ? 'selected' : '') + '>Sim</option></select>', 'Treina voz a partir de amostras') +
                     row('Pasta de amostras', '<input id="s_clone_dir" type="text" value="' + esc(cfg.cloneMyVoice.samplesDir) + '" style="width:100%">', 'Arquivos .wav/.mp3 da sua voz (mín 5, máx 30s cada)') +
                     row('Mín amostras', '<input id="s_clone_min" type="number" value="' + esc(cfg.cloneMyVoice.minSamples) + '" min="3" max="20">') +
                     row('Máx duração (s)', '<input id="s_clone_max" type="number" value="' + esc(cfg.cloneMyVoice.maxDurationSec) + '" min="10" max="300">');

    return row('Engine de voz', engHtml, 'SAPI (Windows, tem pt-BR), FilmCraft (en-US), ElevenLabs, XTTS, Kokoro, CLI custom') +
           '<div id="voice-sub">' + sub + '</div>' +
           '<details open><summary>Clonagem de voz própria</summary>' + cloneHtml + '</details>';
  }

  if (id === 'languages') {
    const langs = cfg.supported || ['pt-BR','en-US','es-ES'];
    let langRows = '';
    for (const lang of langs) {
      const pl = cfg.perLanguage[lang] || { engine: 'sapi', voice: '', ttsModel: '', clonedVoice: false };
      langRows += '<details' + (lang === cfg.default ? ' open' : '') + '><summary>' + lang + (lang === cfg.default ? ' (padrão)' : '') + '</summary>' +
        row('Engine', '<select class="lang-engine" data-lang="' + lang + '"><option value="sapi" ' + (pl.engine==='sapi'?'selected':'') + '>SAPI</option><option value="filmcraft" ' + (pl.engine==='filmcraft'?'selected':'') + '>FilmCraft</option><option value="elevenlabs" ' + (pl.engine==='elevenlabs'?'selected':'') + '>ElevenLabs</option><option value="xtts" ' + (pl.engine==='xtts'?'selected':'') + '>XTTS</option><option value="kokoro" ' + (pl.engine==='kokoro'?'selected':'') + '>Kokoro</option></select>') +
        row('Voz', '<input class="lang-voice" data-lang="' + lang + '" type="text" value="' + esc(pl.voice) + '">') +
        row('Modelo TTS', '<input class="lang-model" data-lang="' + lang + '" type="text" value="' + esc(pl.ttsModel) + '">') +
        row('Voz clonada', '<select class="lang-cloned" data-lang="' + lang + '"><option value="false" ' + (!pl.clonedVoice?'selected':'') + '>Não</option><option value="true" ' + (pl.clonedVoice?'selected':'') + '>Sim</option></select>') +
        '</details>';
    }
    return row('Idioma padrão', '<select id="s_langDefault">' + langs.map(l => '<option value="' + l + '" ' + (cfg.default===l?'selected':'') + '>' + l + '</option>').join('') + '</select>') +
           row('Idiomas suportados (CSV)', '<input id="s_langSupported" type="text" value="' + esc(langs.join(',')) + '">', 'Adicione/remova códigos BCP-47') +
           '<div class="lang-list">' + langRows + '</div>' +
           row('Traduzir automaticamente', '<select id="s_autoTranslate"><option value="true" ' + (cfg.autoTranslate?'selected':'') + '>Sim</option><option value="false" ' + (!cfg.autoTranslate?'selected':'') + '>Não</option></select>') +
           row('Engine de tradução', '<select id="s_translateEngine"><option value="deepl" ' + (cfg.translateEngine==='deepl'?'selected':'') + '>DeepL</option><option value="google" ' + (cfg.translateEngine==='google'?'selected':'') + '>Google</option><option value="libre" ' + (cfg.translateEngine==='libre'?'selected':'') + '>LibreTranslate</option><option value="none" ' + (cfg.translateEngine==='none'?'selected':'') + '>Nenhuma</option></select>') +
           row('Legendas (CSV)', '<input id="s_subLangs" type="text" value="' + esc((cfg.subtitleLanguages||[]).join(',')) + '">', 'Idiomas para gerar .srt');
  }

  if (id === 'pipeline') {
    return row('Largura', '<input id="s_v_w" type="number" value="' + esc(cfg.video.width) + '">') +
           row('Altura', '<input id="s_v_h" type="number" value="' + esc(cfg.video.height) + '">') +
           row('FPS', '<input id="s_v_fps" type="number" value="' + esc(cfg.video.fps) + '">') +
           row('Codec', '<input id="s_v_codec" type="text" value="' + esc(cfg.video.codec) + '">') +
           row('CRF', '<input id="s_v_crf" type="number" value="' + esc(cfg.video.crf) + '" min="16" max="28">') +
           row('Preset', '<input id="s_v_preset" type="text" value="' + esc(cfg.video.preset) + '">') +
           row('Fonte', '<input id="s_c_font" type="text" value="' + esc(cfg.cards.fontFamily) + '">') +
           row('Tamanho título', '<input id="s_c_hsize" type="number" value="' + esc(cfg.cards.headlineSize) + '">') +
           row('Cor fundo', '<input id="s_c_bg" type="color" value="' + esc(cfg.cards.palette.bg) + '">') +
           row('Cor texto', '<input id="s_c_ink" type="color" value="' + esc(cfg.cards.palette.ink) + '">') +
           row('Cor destaque', '<input id="s_c_accent" type="color" value="' + esc(cfg.cards.palette.accent) + '">') +
           row('Ken Burns', '<select id="s_kb_en"><option value="true" ' + (cfg.motion.kenBurns.enabled?'selected':'') + '>Sim</option><option value="false" ' + (!cfg.motion.kenBurns.enabled?'selected':'') + '>Não</option></select>') +
           row('Zoom de', '<input id="s_kb_from" type="number" step="0.01" value="' + esc(cfg.motion.kenBurns.from) + '">') +
           row('Zoom para', '<input id="s_kb_to" type="number" step="0.01" value="' + esc(cfg.motion.kenBurns.to) + '">') +
           row('Transição', '<select id="s_tx_type"><option value="xfade" ' + (cfg.transition.type==='xfade'?'selected':'') + '>Fade</option><option value="none" ' + (cfg.transition.type==='none'?'selected':'') + '>Corte</option></select>') +
           row('Duração transição', '<input id="s_tx_sec" type="number" step="0.05" value="' + esc(cfg.transition.seconds) + '">') +
           row('Música', '<input id="s_m_path" type="text" value="' + esc(cfg.music.path) + '" style="width:100%">') +
           row('Ganho música', '<input id="s_m_gain" type="number" step="0.01" value="' + esc(cfg.music.gain) + '" min="0" max="1">') +
           row('Loudness', '<select id="s_loud_en"><option value="true" ' + (cfg.loudness.enabled?'selected':'') + '>Sim</option><option value="false" ' + (!cfg.loudness.enabled?'selected':'') + '>Não</option></select>') +
           row('Target LUFS', '<input id="s_loud_lufs" type="number" step="0.5" value="' + esc(cfg.loudness.targetLufs) + '">') +
           row('Kicker thumb', '<input id="s_t_kicker" type="text" value="' + esc(cfg.thumbnail.kicker) + '">') +
           row('Palavras thumb (JSON)', '<input id="s_t_words" type="text" value='' + esc(JSON.stringify(cfg.thumbnail.words)) + '' style="width:100%">') +
           row('B-roll automático', '<select id="s_broll_en"><option value="true" ' + (cfg.broll.enabled?'selected':'') + '>Sim</option><option value="false" ' + (!cfg.broll.enabled?'selected':'') + '>Não</option></select>') +
           row('Fonte B-roll', '<select id="s_broll_src"><option value="pexels" ' + (cfg.broll.source==='pexels'?'selected':'') + '>Pexels</option><option value="pixabay" ' + (cfg.broll.source==='pixabay'?'selected':'') + '>Pixabay</option><option value="local" ' + (cfg.broll.source==='local'?'selected':'') + '>Pasta local</option></select>') +
           row('API Key B-roll', '<input id="s_broll_key" type="password" value="' + esc(cfg.broll.apiKey) + '">');
  }

  if (id === 'advanced') {
    return row('ffmpeg path', '<input id="s_ffmpeg" type="text" value="' + esc(cfg.ffmpegPath) + '" style="width:100%">', 'Deixe vazio para auto-detectar') +
           row('ffprobe path', '<input id="s_ffprobe" type="text" value="' + esc(cfg.ffprobePath) + '" style="width:100%">') +
           row('FigCraft path', '<input id="s_figcraft" type="text" value="' + esc(cfg.figcraftPath) + '" style="width:100%">') +
           row('Log level', '<select id="s_log"><option value="debug" ' + (cfg.logLevel==='debug'?'selected':'') + '>Debug</option><option value="info" ' + (cfg.logLevel==='info'?'selected':'') + '>Info</option><option value="warn" ' + (cfg.logLevel==='warn'?'selected':'') + '>Warn</option><option value="error" ' + (cfg.logLevel==='error'?'selected':'') + '>Error</option></select>') +
           row('Manter artefatos', '<select id="s_keep"><option value="false" ' + (!cfg.keepBuildArtifacts?'selected':'') + '>Não</option><option value="true" ' + (cfg.keepBuildArtifacts?'selected':'') + '>Sim</option></select>') +
           row('Upload YouTube', '<select id="s_yt_up"><option value="false" ' + (!cfg.uploadToYoutube?'selected':'') + '>Não</option><option value="true" ' + (cfg.uploadToYoutube?'selected':'') + '>Sim</option></select>') +
           row('Client ID', '<input id="s_yt_cid" type="text" value="' + esc(cfg.youtube.clientId) + '">') +
           row('Client Secret', '<input id="s_yt_csec" type="password" value="' + esc(cfg.youtube.clientSecret) + '">') +
           row('Refresh Token', '<input id="s_yt_rtok" type="password" value="' + esc(cfg.youtube.refreshToken) + '">') +
           row('Playlist ID', '<input id="s_yt_pl" type="text" value="' + esc(cfg.youtube.playlistId) + '">') +
           row('Tags padrão (CSV)', '<input id="s_tags" type="text" value="' + esc((cfg.metadata.defaultTags||[]).join(',')) + '">') +
           row('Categoria YT', '<input id="s_cat" type="text" value="' + esc(cfg.metadata.defaultCategory) + '">') +
           row('Privacidade', '<select id="s_priv"><option value="private" ' + (cfg.metadata.privacyStatus==='private'?'selected':'') + '>Privado</option><option value="unlisted" ' + (cfg.metadata.privacyStatus==='unlisted'?'selected':'') + '>Não listado</option><option value="public" ' + (cfg.metadata.privacyStatus==='public'?'selected':'') + '>Público</option></select>');
  }

  return '';
}

function gatherSettings() {
  const cfg = loadSettings();
  // General
  cfg.general.autoClone = document.getElementById('s_autoClone').value === 'true';
  cfg.general.daemonPort = Number(document.getElementById('s_daemonPort').value);
  cfg.general.workDir = document.getElementById('s_workDir').value;
  cfg.general.maxConcurrentClones = Number(document.getElementById('s_maxConcurrent').value);
  cfg.general.notifyOnComplete = document.getElementById('s_notify').value === 'true';
  // Schedule
  cfg.schedule.enabled = document.getElementById('s_schedEnabled').value === 'true';
  cfg.schedule.cron = document.getElementById('s_cron').value;
  cfg.schedule.timezone = document.getElementById('s_tz').value;
  cfg.schedule.runOnStart = document.getElementById('s_runOnStart').value === 'true';
  cfg.schedule.presets = document.getElementById('s_presets').value.split(',').map(s=>s.trim()).filter(Boolean);
  cfg.schedule.maxChannelsPerRun = Number(document.getElementById('s_maxChannels').value);
  // Avatar
  cfg.avatar.enabled = document.getElementById('s_avatarEnabled').value === 'true';
  cfg.avatar.type = document.getElementById('s_avatarType').value;
  if (cfg.avatar.type === 'heygen') { cfg.avatar.heygen.avatarId = document.getElementById('s_heygen_id').value; cfg.avatar.heygen.apiKey = document.getElementById('s_heygen_key').value; }
  else if (cfg.avatar.type === 'synthesia') { cfg.avatar.synthesia.avatarId = document.getElementById('s_synthesia_id').value; cfg.avatar.synthesia.apiKey = document.getElementById('s_synthesia_key').value; }
  else if (cfg.avatar.type === 'did') { cfg.avatar.did.presenterId = document.getElementById('s_did_id').value; cfg.avatar.did.apiKey = document.getElementById('s_did_key').value; }
  else if (cfg.avatar.type === 'local') { cfg.avatar.local.path = document.getElementById('s_local_path').value; cfg.avatar.local.format = document.getElementById('s_local_fmt').value; }
  else if (cfg.avatar.type === 'generated') { cfg.avatar.generated.prompt = document.getElementById('s_gen_prompt').value; cfg.avatar.generated.negativePrompt = document.getElementById('s_gen_neg').value; cfg.avatar.generated.model = document.getElementById('s_gen_model').value; cfg.avatar.generated.resolution = document.getElementById('s_gen_res').value; cfg.avatar.generated.duration = Number(document.getElementById('s_gen_dur').value); cfg.avatar.generated.fps = Number(document.getElementById('s_gen_fps').value); }
  cfg.avatar.lipSync = document.getElementById('s_lipSync').value === 'true';
  cfg.avatar.backgroundRemoval = document.getElementById('s_bgRemove').value === 'true';
  // Voice
  cfg.voice.engine = document.getElementById('s_voiceEngine').value;
  if (cfg.voice.engine === 'sapi') { cfg.voice.sapi.voice = document.getElementById('s_sapi_voice').value; cfg.voice.sapi.rate = Number(document.getElementById('s_sapi_rate').value); cfg.voice.sapi.volume = Number(document.getElementById('s_sapi_vol').value); }
  else if (cfg.voice.engine === 'filmcraft') { cfg.voice.filmcraft.voice = document.getElementById('s_fc_voice').value; cfg.voice.filmcraft.pitch = document.getElementById('s_fc_pitch').value; cfg.voice.filmcraft.pace = Number(document.getElementById('s_fc_pace').value); }
  else if (cfg.voice.engine === 'elevenlabs') { cfg.voice.elevenlabs.voiceId = document.getElementById('s_11l_id').value; cfg.voice.elevenlabs.apiKey = document.getElementById('s_11l_key').value; cfg.voice.elevenlabs.model = document.getElementById('s_11l_model').value; cfg.voice.elevenlabs.stability = Number(document.getElementById('s_11l_stab').value); cfg.voice.elevenlabs.similarity = Number(document.getElementById('s_11l_sim').value); }
  else if (cfg.voice.engine === 'xtts') { cfg.voice.xtts.speakerWav = document.getElementById('s_xtts_wav').value; cfg.voice.xtts.language = document.getElementById('s_xtts_lang').value; cfg.voice.xtts.modelPath = document.getElementById('s_xtts_model').value; }
  else if (cfg.voice.engine === 'kokoro') { cfg.voice.kokoro.voice = document.getElementById('s_kokoro_voice').value; cfg.voice.kokoro.modelPath = document.getElementById('s_kokoro_model').value; }
  else if (cfg.voice.engine === 'custom') { cfg.voice.custom.command = document.getElementById('s_custom_cmd').value; try { cfg.voice.custom.args = JSON.parse(document.getElementById('s_custom_args').value); } catch {} }
  cfg.voice.cloneMyVoice.enabled = document.getElementById('s_cloneEnabled').value === 'true';
  cfg.voice.cloneMyVoice.samplesDir = document.getElementById('s_clone_dir').value;
  cfg.voice.cloneMyVoice.minSamples = Number(document.getElementById('s_clone_min').value);
  cfg.voice.cloneMyVoice.maxDurationSec = Number(document.getElementById('s_clone_max').value);
  // Languages
  cfg.languages.default = document.getElementById('s_langDefault').value;
  cfg.languages.supported = document.getElementById('s_langSupported').value.split(',').map(s=>s.trim()).filter(Boolean);
  cfg.languages.autoTranslate = document.getElementById('s_autoTranslate').value === 'true';
  cfg.languages.translateEngine = document.getElementById('s_translateEngine').value;
  cfg.languages.subtitleLanguages = document.getElementById('s_subLangs').value.split(',').map(s=>s.trim()).filter(Boolean);
  document.querySelectorAll('.lang-engine').forEach(el => { const l = el.dataset.lang; cfg.languages.perLanguage[l].engine = el.value; });
  document.querySelectorAll('.lang-voice').forEach(el => { const l = el.dataset.lang; cfg.languages.perLanguage[l].voice = el.value; });
  document.querySelectorAll('.lang-model').forEach(el => { const l = el.dataset.lang; cfg.languages.perLanguage[l].ttsModel = el.value; });
  document.querySelectorAll('.lang-cloned').forEach(el => { const l = el.dataset.lang; cfg.languages.perLanguage[l].clonedVoice = el.value === 'true'; });
  // Pipeline
  cfg.pipeline.video.width = Number(document.getElementById('s_v_w').value);
  cfg.pipeline.video.height = Number(document.getElementById('s_v_h').value);
  cfg.pipeline.video.fps = Number(document.getElementById('s_v_fps').value);
  cfg.pipeline.video.codec = document.getElementById('s_v_codec').value;
  cfg.pipeline.video.crf = Number(document.getElementById('s_v_crf').value);
  cfg.pipeline.video.preset = document.getElementById('s_v_preset').value;
  cfg.pipeline.cards.fontFamily = document.getElementById('s_c_font').value;
  cfg.pipeline.cards.headlineSize = Number(document.getElementById('s_c_hsize').value);
  cfg.pipeline.cards.palette.bg = document.getElementById('s_c_bg').value;
  cfg.pipeline.cards.palette.ink = document.getElementById('s_c_ink').value;
  cfg.pipeline.cards.palette.accent = document.getElementById('s_c_accent').value;
  cfg.pipeline.motion.kenBurns.enabled = document.getElementById('s_kb_en').value === 'true';
  cfg.pipeline.motion.kenBurns.from = Number(document.getElementById('s_kb_from').value);
  cfg.pipeline.motion.kenBurns.to = Number(document.getElementById('s_kb_to').value);
  cfg.pipeline.transition.type = document.getElementById('s_tx_type').value;
  cfg.pipeline.transition.seconds = Number(document.getElementById('s_tx_sec').value);
  cfg.pipeline.music.path = document.getElementById('s_m_path').value;
  cfg.pipeline.music.gain = Number(document.getElementById('s_m_gain').value);
  cfg.pipeline.loudness.enabled = document.getElementById('s_loud_en').value === 'true';
  cfg.pipeline.loudness.targetLufs = Number(document.getElementById('s_loud_lufs').value);
  cfg.pipeline.thumbnail.kicker = document.getElementById('s_t_kicker').value;
  try { cfg.pipeline.thumbnail.words = JSON.parse(document.getElementById('s_t_words').value); } catch {}
  cfg.pipeline.broll.enabled = document.getElementById('s_broll_en').value === 'true';
  cfg.pipeline.broll.source = document.getElementById('s_broll_src').value;
  cfg.pipeline.broll.apiKey = document.getElementById('s_broll_key').value;
  // Advanced
  cfg.advanced.ffmpegPath = document.getElementById('s_ffmpeg').value;
  cfg.advanced.ffprobePath = document.getElementById('s_ffprobe').value;
  cfg.advanced.figcraftPath = document.getElementById('s_figcraft').value;
  cfg.advanced.logLevel = document.getElementById('s_log').value;
  cfg.advanced.keepBuildArtifacts = document.getElementById('s_keep').value === 'true';
  cfg.advanced.uploadToYoutube = document.getElementById('s_yt_up').value === 'true';
  cfg.advanced.youtube.clientId = document.getElementById('s_yt_cid').value;
  cfg.advanced.youtube.clientSecret = document.getElementById('s_yt_csec').value;
  cfg.advanced.youtube.refreshToken = document.getElementById('s_yt_rtok').value;
  cfg.advanced.youtube.playlistId = document.getElementById('s_yt_pl').value;
  try { cfg.advanced.metadata.defaultTags = document.getElementById('s_tags').value.split(',').map(s=>s.trim()).filter(Boolean); } catch {}
  cfg.advanced.metadata.defaultCategory = document.getElementById('s_cat').value;
  cfg.advanced.metadata.privacyStatus = document.getElementById('s_priv').value;

  return cfg;
}

function renderAvatarSub(type) {
  const cfg = loadSettings();
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, m => ({'&':'&','<':'<','>':'>','"':'"',"'":"'"}[m]));
  const row = (label, html, help) => '<div class="row"><label>' + label + (help ? '<span class="dim" title="' + esc(help) + '">ⓘ</span>' : '') + '</label>' + html + '</div>';
  let sub = '';
  if (type === 'heygen') sub = row('Avatar ID', '<input id="s_heygen_id" type="text" value="' + esc(cfg.avatar.heygen.avatarId) + '">') + row('API Key', '<input id="s_heygen_key" type="password" value="' + esc(cfg.avatar.heygen.apiKey) + '">');
  else if (type === 'synthesia') sub = row('Avatar ID', '<input id="s_synthesia_id" type="text" value="' + esc(cfg.avatar.synthesia.avatarId) + '">') + row('API Key', '<input id="s_synthesia_key" type="password" value="' + esc(cfg.avatar.synthesia.apiKey) + '">');
  else if (type === 'did') sub = row('Presenter ID', '<input id="s_did_id" type="text" value="' + esc(cfg.avatar.did.presenterId) + '">') + row('API Key', '<input id="s_did_key" type="password" value="' + esc(cfg.avatar.did.apiKey) + '">');
  else if (type === 'local') sub = row('Caminho do vídeo', '<input id="s_local_path" type="text" value="' + esc(cfg.avatar.local.path) + '" style="width:100%">', 'Arquivo .mp4/.webm do avatar (fundo verde recomendado)') + row('Formato', '<input id="s_local_fmt" type="text" value="' + esc(cfg.avatar.local.format) + '">');
  else if (type === 'generated') sub = row('Prompt', '<textarea id="s_gen_prompt" rows="2">' + esc(cfg.avatar.generated.prompt) + '</textarea>') + row('Negative prompt', '<textarea id="s_gen_neg" rows="2">' + esc(cfg.avatar.generated.negativePrompt) + '</textarea>') + row('Modelo', '<input id="s_gen_model" type="text" value="' + esc(cfg.avatar.generated.model) + '">') + row('Resolução', '<input id="s_gen_res" type="text" value="' + esc(cfg.avatar.generated.resolution) + '">') + row('Duração (s)', '<input id="s_gen_dur" type="number" value="' + esc(cfg.avatar.generated.duration) + '">') + row('FPS', '<input id="s_gen_fps" type="number" value="' + esc(cfg.avatar.generated.fps) + '">');
  document.getElementById('avatar-sub').innerHTML = sub;
}

function renderVoiceSub(engine) {
  const cfg = loadSettings();
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, m => ({'&':'&','<':'<','>':'>','"':'"',"'":"'"}[m]));
  const row = (label, html, help) => '<div class="row"><label>' + label + (help ? '<span class="dim" title="' + esc(help) + '">ⓘ</span>' : '') + '</label>' + html + '</div>';
  let sub = '';
  if (engine === 'sapi') sub = row('Voz', '<input id="s_sapi_voice" type="text" value="' + esc(cfg.voice.sapi.voice) + '">', 'Nome exato da voz SAPI instalada') + row('Velocidade', '<input id="s_sapi_rate" type="number" value="' + esc(cfg.voice.sapi.rate) + '" min="-10" max="10">') + row('Volume', '<input id="s_sapi_vol" type="number" value="' + esc(cfg.voice.sapi.volume) + '" min="0" max="100">');
  else if (engine === 'filmcraft') sub = row('Voz', '<input id="s_fc_voice" type="text" value="' + esc(cfg.voice.filmcraft.voice) + '">', 'basic-female, basic-male, kokoro-heart, kokoro-bella, etc.') + row('Pitch', '<select id="s_fc_pitch"><option value="extraLow" ' + (cfg.voice.filmcraft.pitch==='extraLow'?'selected':'') + '>Extra baixo</option><option value="low" ' + (cfg.voice.filmcraft.pitch==='low'?'selected':'') + '>Baixo</option><option value="default" ' + (cfg.voice.filmcraft.pitch==='default'?'selected':'') + '>Normal</option><option value="high" ' + (cfg.voice.filmcraft.pitch==='high'?'selected':'') + '>Alto</option><option value="extraHigh" ' + (cfg.voice.filmcraft.pitch==='extraHigh'?'selected':'') + '>Extra alto</option></select>') + row('Velocidade', '<input id="s_fc_pace" type="number" step="0.1" value="' + esc(cfg.voice.filmcraft.pace) + '" min="0.5" max="2">');
  else if (engine === 'elevenlabs') sub = row('Voice ID', '<input id="s_11l_id" type="text" value="' + esc(cfg.voice.elevenlabs.voiceId) + '">') + row('API Key', '<input id="s_11l_key" type="password" value="' + esc(cfg.voice.elevenlabs.apiKey) + '">') + row('Modelo', '<input id="s_11l_model" type="text" value="' + esc(cfg.voice.elevenlabs.model) + '">') + row('Stability', '<input id="s_11l_stab" type="number" step="0.01" value="' + esc(cfg.voice.elevenlabs.stability) + '" min="0" max="1">') + row('Similarity', '<input id="s_11l_sim" type="number" step="0.01" value="' + esc(cfg.voice.elevenlabs.similarity) + '" min="0" max="1">');
  else if (engine === 'xtts') sub = row('Speaker WAV', '<input id="s_xtts_wav" type="text" value="' + esc(cfg.voice.xtts.speakerWav) + '" style="width:100%">', 'Amostra de voz para clonagem') + row('Idioma', '<input id="s_xtts_lang" type="text" value="' + esc(cfg.voice.xtts.language) + '">') + row('Model path', '<input id="s_xtts_model" type="text" value="' + esc(cfg.voice.xtts.modelPath) + '" style="width:100%">');
  else if (engine === 'kokoro') sub = row('Voz', '<input id="s_kokoro_voice" type="text" value="' + esc(cfg.voice.kokoro.voice) + '">', 'ex: pt-br-female-1, en-us-male-1') + row('Model path', '<input id="s_kokoro_model" type="text" value="' + esc(cfg.voice.kokoro.modelPath) + '" style="width:100%">', 'Caminho do modelo Kokoro (335 MB)');
  else if (engine === 'custom') sub = row('Comando', '<input id="s_custom_cmd" type="text" value="' + esc(cfg.voice.custom.command) + '" style="width:100%">', 'CLI externo de TTS') + row('Args (JSON)', '<textarea id="s_custom_args" rows="2">' + esc(JSON.stringify(cfg.voice.custom.args)) + '</textarea>');
  document.getElementById('voice-sub').innerHTML = sub;
}

document.getElementById('settingsBtn').onclick = function() {
  const cfg = loadSettings();
  renderSettingsTabs(cfg);
  document.getElementById('smodal').classList.add('on');
};

document.getElementById('sclose').onclick = function() { document.getElementById('smodal').classList.remove('on'); };
document.getElementById('s_cancel').onclick = function() { document.getElementById('smodal').classList.remove('on'); };
document.getElementById('s_save').onclick = function() {
  const cfg = gatherSettings();
  saveSettings(cfg);
  toast('Configurações salvas — reinicie o daemon para aplicar agendamento');
  document.getElementById('smodal').classList.remove('on');
};

// Apply settings to clone modal when opened
var originalOpenClone = openCloneModal;
openCloneModal = function(url, id, name) {
  originalOpenClone(url, id, name);
  const cfg = loadSettings();
  // Apply voice settings
  document.getElementById('c_voice_engine').value = cfg.voice.engine;
  if (cfg.voice.engine === 'sapi') document.getElementById('c_voice_sapi').value = cfg.voice.sapi.voice;
  // Apply video settings
  document.getElementById('c_v_w').value = cfg.pipeline.video.width;
  document.getElementById('c_v_h').value = cfg.pipeline.video.height;
  document.getElementById('c_v_fps').value = cfg.pipeline.video.fps;
  document.getElementById('c_v_crf').value = cfg.pipeline.video.crf;
  // Apply card settings
  document.getElementById('c_c_font').value = cfg.pipeline.cards.fontFamily;
  document.getElementById('c_c_hsize').value = cfg.pipeline.cards.headlineSize;
  document.getElementById('c_c_bg').value = cfg.pipeline.cards.palette.bg;
  document.getElementById('c_c_ink').value = cfg.pipeline.cards.palette.ink;
  document.getElementById('c_c_accent').value = cfg.pipeline.cards.palette.accent;
  // Apply motion
  document.getElementById('c_kb_en').value = cfg.pipeline.motion.kenBurns.enabled ? 'true' : 'false';
  document.getElementById('c_kb_from').value = cfg.pipeline.motion.kenBurns.from;
  document.getElementById('c_kb_to').value = cfg.pipeline.motion.kenBurns.to;
  // Apply transition
  document.getElementById('c_tx_type').value = cfg.pipeline.transition.type;
  document.getElementById('c_tx_sec').value = cfg.pipeline.transition.seconds;
  // Apply music
  document.getElementById('c_m_gain').value = cfg.pipeline.music.gain;
  // Apply thumbnail
  document.getElementById('c_t_kicker').value = cfg.pipeline.thumbnail.kicker;
  document.getElementById('c_t_words').value = JSON.stringify(cfg.pipeline.thumbnail.words);
};

document.getElementById('c_submit').onclick = async function() {
  const params = gatherCloneParams();
  const slug = document.getElementById('c_slug').value.trim() || 'clone-' + Date.now();
  params.slug = slug;
  closeCloneModal();
  toast('Enviando para o daemon...');
  try {
    const r = await fetch('http://127.0.0.1:8799/clone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: currentClone.url, id: currentClone.id, channel: currentClone.name, params })
    });
    const j = await r.json();
    toast(j.ok ? (j.executed ? 'Clone executado: ' + (j.result?.stdout?.slice(-200) || 'ok') : 'Na fila — ' + j.queued) : 'Erro: ' + j.error);
  } catch (e) {
    toast('Falha de rede — daemon a correr em http://127.0.0.1:8799?');
  }
};

// Also wire the video modal clone button
document.getElementById('mclone').onclick = function() {
  if (current) doClone('https://www.youtube.com/watch?v=' + current.id, current.id, '');
};

var toastT;
function toast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(function(){ t.classList.remove('on'); }, 2800);
}

applyFilter();
</script>
</body>
</html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
