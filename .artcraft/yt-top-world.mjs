#!/usr/bin/env node
/**
 * World top channels: subscribers (authoritative) + recent reach (sampled).
 *
 * Two separate, honest rankings:
 *   1. bySubscribers — Wikipedia's list. The only current public ranking by subs.
 *      YouTube does not publish one, and CTR is private analytics, so this is the
 *      best available proxy for "size".
 *   2. byRecentViews — the yt-channels.mjs sample (last N days). Real channel ids,
 *      real view counts, real publish cadence from RSS.
 *   3. byCloneability — computed ONLY on channels present in the sample, because
 *      that is the only place where subscribers, views and cadence are all known.
 *
 * No fuzzy name matching: it silently mismatched and produced garbage. If a channel
 * is not in the sample, it is not scored.
 *
 * Usage:
 *   node yt-top-world.mjs [--sample ...] [--out ...]
 */

import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const SAMPLE = arg('sample', 'D:\\CRAFT\\work\\research\\run1\\channels.json');
const OUT = arg('out', 'D:\\CRAFT\\work\\research\\world');
const WIKI = 'https://en.wikipedia.org/wiki/List_of_most-subscribed_YouTube_channels';

function stripTags(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\[\d+\]|\[[a-z]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWiki() {
  const res = await fetch(WIKI, { headers: { 'user-agent': 'artcraft-research/1.0' } });
  if (!res.ok) throw new Error('wikipedia HTTP ' + res.status);
  const html = await res.text();
  const tableMatch = /<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/.exec(html);
  if (!tableMatch) throw new Error('table not found');
  const table = tableMatch[0];

  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  let index = 0;
  while ((m = trRe.exec(table)) !== null) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = tdRe.exec(m[1])) !== null) cells.push(c[1]);
    if (cells.length < 4) continue;
    const name = stripTags(cells[0]);
    const link = /href="([^"]+)"/.exec(cells[1]);
    const subs = parseFloat(stripTags(cells[2]).replace(/[^\d.]/g, ''));
    if (!name || !link || isNaN(subs)) continue;
    index += 1;
    rows.push({
      rank: index,
      name: name,
      url: link[1].charAt(0) === 'h' ? link[1] : 'https://www.youtube.com' + link[1],
      subsMillions: subs,
      language: stripTags(cells[3] || ''),
      category: stripTags(cells[4] || ''),
    });
  }
  return rows;
}

function cloneability(c) {
  const subsM = c.subs ? c.subs / 1e6 : 0;
  const sizePenalty = Math.max(0, Math.min(1, (subsM - 0.3) / 5));
  let score = 40 * (1 - sizePenalty);
  score += Math.min(30, (c.rssVideosInWindow || 0) * 2);
  if (subsM > 0 && c.totalViewsSeen > 0) {
    score += Math.min(30, (c.totalViewsSeen / (subsM * 1e6)) * 20);
  }
  return Math.round(score);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  process.stderr.write('fetching wikipedia ranking...\n');
  const wiki = await fetchWiki();
  process.stderr.write('  ' + wiki.length + ' channels parsed\n');

  let sample = { channels: [], videos: [] };
  if (fs.existsSync(SAMPLE)) {
    sample = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
    process.stderr.write('  sample: ' + sample.channels.length + ' channels, ' + sample.videos.length + ' videos\n');
  } else {
    process.stderr.write('  no sample at ' + SAMPLE + '\n');
  }

  const sampled = (sample.channels || []).map((c) => Object.assign({}, c, { cloneability: cloneability(c) }));
  const byRecent = sampled.slice().sort((a, b) => b.totalViewsSeen - a.totalViewsSeen);
  const byClone = sampled.slice().sort((a, b) => b.cloneability - a.cloneability);

  const report = {
    generatedAt: new Date().toISOString(),
    sources: {
      subscribers: 'Wikipedia: List of most-subscribed YouTube channels (Nov 2026)',
      recentReach: SAMPLE,
      ctrAvailable: false,
      ctrNote: 'CTR is private YouTube Studio analytics and is not obtainable. Views are the proxy for reach.',
    },
    caveats: [
      'Subscriber counts are Wikipedia-reported, not live.',
      'The recent-view sample covers only the queries and extraction cap used, so it under-represents channels that were not surfaced. Absence means "not sampled", not "zero".',
      'cloneability is a heuristic computed only on sampled channels: penalises giants, rewards publishing volume and views-per-subscriber.',
    ],
    bySubscribers: wiki.slice(0, 50),
    byRecentViews: byRecent.slice(0, 40),
    byCloneability: byClone.slice(0, 40),
  };

  fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(report, null, 2), 'utf8');

  const L = [];
  L.push('# Top mundial — canais para clonar');
  L.push('');
  L.push('Gerado: ' + report.generatedAt);
  L.push('');
  L.push('> **CTR (cliques) não é dado público.** É analytics privado do YouTube Studio.');
  L.push('> Duas listas independentes: tamanho (inscritos) e alcance recente (views amostrados).');
  L.push('');
  L.push('## 1. Mais subscritos do mundo (Top 30)');
  L.push('');
  L.push('| # | Canal | Subs (M) | Idioma | Categoria |');
  L.push('|---|---|---|---|---|');
  for (const c of wiki.slice(0, 30)) {
    L.push('| ' + c.rank + ' | [' + c.name + '](' + c.url + ') | ' + c.subsMillions + ' | ' + c.language + ' | ' + c.category + ' |');
  }

  L.push('');
  L.push('## 2. Mais visualizações nos últimos 7 dias (amostra)');
  L.push('');
  L.push('| # | Canal | Vídeos/7d | Views vistas | Média | Subs |');
  L.push('|---|---|---|---|---|---|');
  byRecent.slice(0, 30).forEach((c, i) => {
    L.push('| ' + (i + 1) + ' | [' + c.channel + '](' + c.channel_url + ') | ' +
      (c.rssVideosInWindow === undefined ? '—' : c.rssVideosInWindow) + ' | ' +
      c.totalViewsSeen.toLocaleString('pt-PT') + ' | ' + c.avgViews.toLocaleString('pt-PT') + ' | ' +
      (c.subs ? c.subs.toLocaleString('pt-PT') : '—') + ' |');
  });

  L.push('');
  L.push('## 3. Mais fáceis de clonar');
  L.push('');
  L.push('Só canais presentes na amostra: penaliza gigantes, recompensa volume e views por subscritor.');
  L.push('');
  L.push('| # | Canal | Subs | Vídeos/7d | Views | Score |');
  L.push('|---|---|---|---|---|---|');
  byClone.slice(0, 30).forEach((c, i) => {
    L.push('| ' + (i + 1) + ' | [' + c.channel + '](' + c.channel_url + ') | ' +
      (c.subs ? c.subs.toLocaleString('pt-PT') : '—') + ' | ' +
      (c.rssVideosInWindow === undefined ? '—' : c.rssVideosInWindow) + ' | ' +
      c.totalViewsSeen.toLocaleString('pt-PT') + ' | ' + c.cloneability + ' |');
  });

  fs.writeFileSync(path.join(OUT, 'world.md'), L.join('\n'), 'utf8');
  console.log(L.join('\n'));
  console.log('\nFicheiros: ' + path.join(OUT, 'world.json') + ' , ' + path.join(OUT, 'world.md'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});