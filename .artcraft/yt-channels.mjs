#!/usr/bin/env node
/**
 * YouTube channel discovery for the clone pipeline.
 *
 * What it can measure, and what it cannot:
 *   CAN    - recent videos, view counts, channels, subscriber counts, exact publish dates
 *   CANNOT - click-through rate (CTR). That is private YouTube Studio analytics and is not
 *            exposed anywhere public. "Most clicks" is approximated by views.
 *
 * Method:
 *   Phase A (flat, fast) - YouTube search sorted by upload date across many queries.
 *   Phase B (full, slow) - per-video extraction: confirm upload_date, pull channel subs.
 *   Phase C (RSS)        - each channel's RSS feed gives exact publish timestamps, so
 *                          "videos published in the last N days" is counted for real
 *                          instead of inferred from a search sample.
 *
 * Usage:
 *   node yt-channels.mjs --days 7 --per-query 25 --extract 120 --out work/research/run1
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const YTDLP = (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python312\\Scripts\\yt-dlp.exe';
const SORT_LATEST = 'EgIIAw%253D%253D'; // search sort = upload date

const DEFAULT_QUERIES = [
  ' curiosidades',
  ' culinária',
  ' vlog',
  ' game play',
  ' tutorial',
  ' notícias',
  ' humor',
  ' fitness',
  ' tecnologia',
  ' finanças',
  ' infantil',
  ' animação',
  ' motivacional',
  ' true crime',
  ' reacted',
  ' podcast',
  ' beleza',
  ' carros',
  ' futebol',
  ' diy',
];

/**
 * Dark = faceless narration niches: dark psychology, real horror stories, mystery,
 * disturbing facts, true crime narration. These are the channels people actually
 * clone — no face, no crew, no location.
 */
const DARK_QUERIES = [
  ' dark psychology',
  ' dark facts',
  ' psicologia sombria',
  ' histórias de terror narradas',
  ' creepypasta',
  ' true crime narração',
  ' mistérios sem solução',
  ' fatos assustadores',
  ' curiosidades bizarras',
  ' disturbing facts',
  ' unsolved mysteries',
  ' reddit stories',
  ' histórias reais assustadoras',
  ' dark history',
  ' medo e mistério',
  ' canal dark',
  ' narrativa de terror',
  ' macabro',
  ' segredos obscuros',
  ' nightmare fuel',
];

/** Shorts = vertical short-form. Different format, different retention game. */
const SHORTS_QUERIES = [
  ' curiosidades #shorts',
  ' dark #shorts',
  ' fatos #shorts',
  ' história #shorts',
  ' motivação #shorts',
  ' psychology shorts',
  ' facts shorts',
  ' scary shorts',
  ' mystery shorts',
  ' viral shorts',
  ' shorts brasil',
  ' shorts portugal',
  ' dinheiro #shorts',
  ' ciência #shorts',
  ' anime #shorts',
  ' gaming #shorts',
];

const PRESETS = { default: DEFAULT_QUERIES, dark: DARK_QUERIES, shorts: SHORTS_QUERIES };

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const DAYS = Number(arg('days', '7'));
const PER_QUERY = Number(arg('per-query', '25'));
const EXTRACT = Number(arg('extract', '120'));
const RSS_LIMIT = Number(arg('rss', '60'));
const OUT = arg('out', 'D:\\CRAFT\\work\\research\\run1');

// --preset dark | shorts | default | all   (comma separated)
// --queries "a|b|c"                         (explicit override)
const PRESET_ARG = arg('preset', null);
const QUERY_ARG = arg('queries', null);
let QUERIES = DEFAULT_QUERIES;
if (QUERY_ARG) {
  QUERIES = QUERY_ARG.split('|').map((s) => s.trim()).filter(Boolean);
} else if (PRESET_ARG) {
  const picked = [];
  for (const name of PRESET_ARG.split(',').map((s) => s.trim())) {
    if (name === 'all') {
      for (const k of Object.keys(PRESETS)) picked.push.apply(picked, PRESETS[k]);
    } else if (PRESETS[name]) {
      picked.push.apply(picked, PRESETS[name]);
    }
  }
  if (picked.length) QUERIES = Array.from(new Set(picked));
}
const PRESET_LABEL = PRESET_ARG || (QUERY_ARG ? 'custom' : 'default');

/** YouTube Shorts: <= 65s, or the title says so. */
function isShortsDuration(seconds) {
  return typeof seconds === 'number' && seconds > 0 && seconds <= 65;
}
function looksLikeShorts(title) {
  return /#short|#shorts\b/i.test(String(title || ''));
}

function run(args, timeout) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, ['--no-update', '--no-warnings'].concat(args), { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => child.kill(), timeout || 120000);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, stdout: stdout, stderr: String(e.message) }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code: code, stdout: stdout, stderr: stderr }); });
  });
}

function parseJsonLines(text) {
  const rows = [];
  const parts = text.split(/\r?\n/);
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i].trim();
    if (s.charAt(0) !== '{') continue;
    try { rows.push(JSON.parse(s)); } catch (e) { /* partial */ }
  }
  return rows;
}

function pool(items, size, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = [];
  const n = Math.min(size, items.length);
  for (let r = 0; r < n; r++) {
    runners.push((async () => {
      while (idx < items.length) {
        const my = idx;
        idx += 1;
        results[my] = await worker(items[my], my);
      }
    })());
  }
  return Promise.all(runners).then(() => results);
}

function daysSince(dateStr) {
  const y = dateStr.slice(0, 4), m = dateStr.slice(4, 6), d = dateStr.slice(6, 8);
  const then = Date.parse(y + '-' + m + '-' + d + 'T12:00:00Z');
  if (isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(YTDLP)) {
    console.error('yt-dlp not found: ' + YTDLP);
    process.exit(2);
  }

  // ---------- Phase A
  process.stderr.write('Phase A: ' + QUERIES.length + ' queries x ' + PER_QUERY + ' (upload-date sort, preset=' + PRESET_LABEL + ')\n');
  const flat = new Map();
  let doneA = 0;
  await pool(QUERIES, 4, async (q) => {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q.trim()) + '&sp=' + SORT_LATEST;
    const r = await run(['--flat-playlist', '--dump-json', '--playlist-end', String(PER_QUERY), url]);
    const rows = parseJsonLines(r.stdout);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.id || flat.has(row.id)) continue;
      flat.set(row.id, {
        id: row.id,
        title: row.title || '',
        channel: row.channel || row.uploader || '',
        channel_id: row.channel_id || row.uploader_id || '',
        channel_url: row.channel_url || row.uploader_url || '',
        views: row.view_count || 0,
        duration: row.duration || 0,
      });
    }
    doneA += 1;
    process.stderr.write('  ' + doneA + '/' + QUERIES.length + '\r');
  });
  process.stderr.write('\nPhase A: ' + flat.size + ' unique recent videos\n');

  // ---------- Phase B
  const candidates = Array.from(flat.values())
    .sort((a, b) => b.views - a.views)
    .slice(0, EXTRACT);
  process.stderr.write('Phase B: extracting ' + candidates.length + ' for upload_date + subs\n');

  let doneB = 0;
  const enriched = await pool(candidates, 4, async (v) => {
    const r = await run(['--dump-single-json', '--skip-download', 'https://www.youtube.com/watch?v=' + v.id], 90000);
    doneB += 1;
    if (doneB % 20 === 0) process.stderr.write('  ' + doneB + '/' + candidates.length + '\r');
    if (r.code !== 0) return Object.assign({}, v, { error: true });
    let j;
    try { j = JSON.parse(r.stdout); } catch (e) { return Object.assign({}, v, { error: true }); }
    return {
      id: v.id,
      title: j.title || v.title,
      channel: j.channel || j.uploader || v.channel,
      channel_id: j.channel_id || v.channel_id,
      channel_url: j.channel_url || v.channel_url,
      views: j.view_count === undefined || j.view_count === null ? v.views : j.view_count,
      likes: j.like_count === undefined ? null : j.like_count,
      comments: j.comment_count === undefined ? null : j.comment_count,
      subs: j.channel_follower_count === undefined ? null : j.channel_follower_count,
      upload_date: j.upload_date || null,
      daysAgo: j.upload_date ? daysSince(j.upload_date) : null,
      duration: j.duration === undefined ? v.duration : j.duration,
      isShort: isShortsDuration(j.duration === undefined ? v.duration : j.duration) || looksLikeShorts(j.title || v.title),
      categories: j.categories || [],
      tags: (j.tags || []).slice(0, 8),
      url: j.webpage_url || ('https://www.youtube.com/watch?v=' + v.id),
    };
  });

  const recent = enriched.filter((v) => !v.error && v.daysAgo !== null && v.daysAgo <= DAYS);
  process.stderr.write('\nPhase B: ' + recent.length + ' videos from the last ' + DAYS + ' days\n');

  // ---------- aggregate by channel
  const byChannel = new Map();
  const recentSorted = recent.slice().sort((a, b) => b.views - a.views);
  for (let i = 0; i < recentSorted.length; i++) {
    const v = recentSorted[i];
    const key = v.channel_id || v.channel;
    if (!key) continue;
    if (!byChannel.has(key)) {
      byChannel.set(key, {
        channel: v.channel,
        channel_id: v.channel_id,
        channel_url: v.channel_url,
        subs: v.subs === undefined ? null : v.subs,
        videos: [],
        totalViews: 0,
        categories: {},
      });
    }
    const c = byChannel.get(key);
    c.videos.push(v);
    c.totalViews += v.views || 0;
    const cats = v.categories || [];
    for (let k = 0; k < cats.length; k++) c.categories[cats[k]] = true;
    if (c.subs === null || c.subs === undefined) c.subs = v.subs === undefined ? null : v.subs;
  }

  const channels = Array.from(byChannel.values()).map((c) => {
    const views = c.videos.map((v) => v.views).sort((a, b) => b - a);
    const shorts = c.videos.filter((v) => v.isShort).length;
    const durations = c.videos.map((v) => v.duration).filter((d) => typeof d === 'number' && d > 0);
    return {
      channel: c.channel,
      channel_id: c.channel_id,
      channel_url: c.channel_url || ('https://www.youtube.com/channel/' + c.channel_id),
      subs: c.subs,
      videosSeen: c.videos.length,
      totalViewsSeen: c.totalViews,
      avgViews: views.length ? Math.round(c.totalViews / views.length) : 0,
      maxViews: views.length ? views[0] : 0,
      medianViews: views.length ? views[Math.floor(views.length / 2)] : 0,
      categories: Object.keys(c.categories),
      shortsSeen: shorts,
      shortsShare: c.videos.length ? Math.round((shorts / c.videos.length) * 100) / 100 : 0,
      avgDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      topVideo: c.videos[0],
    };
  });

  // ---------- Phase C: RSS for real publish counts
  const rssTargets = channels.slice(0, RSS_LIMIT);
  process.stderr.write('Phase C: RSS for ' + rssTargets.length + ' channels\n');
  let doneC = 0;
  for (let i = 0; i < rssTargets.length; i++) {
    const c = rssTargets[i];
    doneC += 1;
    if (doneC % 10 === 0) process.stderr.write('  ' + doneC + '/' + rssTargets.length + '\r');
    if (!c.channel_id) { c.rssError = 'no channel id'; continue; }
    try {
      const res = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + c.channel_id);
      if (!res.ok) { c.rssError = 'HTTP ' + res.status; continue; }
      const xml = await res.text();
      const entries = xml.split('<entry>').slice(1);
      let inWindow = 0;
      let total = 0;
      const titles = [];
      for (let e = 0; e < entries.length; e++) {
        const pub = /<published>([^<]+)<\/published>/.exec(entries[e]);
        if (!pub) continue;
        total += 1;
        const age = (Date.now() - Date.parse(pub[1])) / 86400000;
        if (age <= DAYS) {
          inWindow += 1;
          const t = /<title>([^<]*)<\/title>/.exec(entries[e]);
          if (t) titles.push({ title: t[1], daysAgo: Math.round(age * 10) / 10 });
        }
      }
      c.rssOk = true;
      c.rssEntries = total;
      c.rssVideosInWindow = inWindow;
      c.rssRecentTitles = titles;
    } catch (e) {
      c.rssError = String(e && e.message);
    }
  }
  process.stderr.write('\nPhase C done\n');

  // Rank: how many they published in the window, then reach.
  channels.sort((a, b) => {
    const av = a.rssVideosInWindow || 0;
    const bv = b.rssVideosInWindow || 0;
    if (bv !== av) return bv - av;
    return b.totalViewsSeen - a.totalViewsSeen;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    method: {
      days: DAYS,
      queries: QUERIES.length,
      preset: PRESET_LABEL,
      perQuery: PER_QUERY,
      extracted: candidates.length,
      qualifyingVideos: recent.length,
      channels: channels.length,
      ctrAvailable: false,
      ctrNote: 'Click-through rate is private YouTube Studio analytics and is not obtainable. Ranking uses publish count, then views.',
    },
    channels: channels,
    videos: recentSorted,
  };

  fs.writeFileSync(path.join(OUT, 'channels.json'), JSON.stringify(report, null, 2), 'utf8');

  const L = [];
  L.push('# Canais que mais publicaram e mais cresceram nos últimos ' + DAYS + ' dias');
  L.push('');
  L.push('Gerado: ' + report.generatedAt);
  L.push('');
  L.push('> **CTR (cliques) não está disponível.** É analytics privado do YouTube Studio.');
  L.push('> Ranking: nº de vídeos publicados no período (via RSS, datas reais), depois visualizações.');
  L.push('');
  L.push('| # | Canal | Vídeos (' + DAYS + 'd) | Views vistas | Média | Subs |');
  L.push('|---|---|---|---|---|---|');
  channels.slice(0, 40).forEach((c, i) => {
    const subs = c.subs ? c.subs.toLocaleString('pt-PT') : '—';
    L.push('| ' + (i + 1) + ' | [' + c.channel + '](' + c.channel_url + ') | ' +
      (c.rssVideosInWindow === undefined ? '—' : c.rssVideosInWindow) + ' | ' +
      c.totalViewsSeen.toLocaleString('pt-PT') + ' | ' +
      c.avgViews.toLocaleString('pt-PT') + ' | ' + subs + ' |');
  });
  L.push('');
  L.push('## Top vídeos do período');
  L.push('');
  L.push('| Views | Canal | Título | Data |');
  L.push('|---|---|---|---|');
  const top = recentSorted.slice(0, 25);
  for (let i = 0; i < top.length; i++) {
    const v = top[i];
    L.push('| ' + v.views.toLocaleString('pt-PT') + ' | ' + v.channel + ' | ' +
      String(v.title).slice(0, 70) + ' | ' + v.upload_date + ' |');
  }
  fs.writeFileSync(path.join(OUT, 'channels.md'), L.join('\n'), 'utf8');

  console.log(L.join('\n'));
  console.log('\nFicheiros: ' + path.join(OUT, 'channels.json') + ' , ' + path.join(OUT, 'channels.md'));
}

main().catch((e) => { console.error(e); process.exit(1); });