#!/usr/bin/env node
/**
 * Build a richer dashboard dataset by merging existing research runs.
 * Produces: work/research/dashboard/data.json
 *
 * Goal: top videos per category (up to 20) and top shorts per category (up to 10)
 * using all available collected videos, ranked by views.
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'D:\\CRAFT';
const RESEARCH = path.join(ROOT, 'work', 'research');
const OUT_DIR = path.join(RESEARCH, 'dashboard');
const OUT_FILE = path.join(OUT_DIR, 'data.json');

const TOP_PER_CATEGORY = Number(process.argv.includes('--top') ? process.argv[process.argv.indexOf('--top') + 1] : 20);
const SHORTS_PER_CATEGORY = Number(process.argv.includes('--shorts') ? process.argv[process.argv.indexOf('--shorts') + 1] : 10);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function listRunFiles() {
  const files = [];
  const dirs = fs.existsSync(RESEARCH) ? fs.readdirSync(RESEARCH, { withFileTypes: true }) : [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    if (!/^run/.test(d.name) && d.name !== 'test') continue;
    const p = path.join(RESEARCH, d.name, 'channels.json');
    if (fs.existsSync(p)) files.push(p);
  }
  // Prefer newer runs later? we'll merge all and dedupe by video id keeping highest views.
  return files.sort();
}

function normCategory(raw) {
  const c = String(raw || '').trim();
  if (!c) return { key: 'semcategoria', label: 'Sem categoria' };
  const key = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  // Friendly labels/aliases mapping for common YouTube categories
  const labels = {
    sports: 'Esportes',
    sciencetechnology: 'Ciência e Tecnologia',
    scienceandtechnology: 'Ciência e Tecnologia',
    peopleblogs: 'Pessoas e Blogs',
    entertainment: 'Entretenimento',
    gaming: 'Games',
    education: 'Educação',
    music: 'Música',
    filmanimation: 'Filmes e Animação',
    newspolitics: 'Notícias e Política',
    newsandpolitics: 'Notícias e Política',
    comedy: 'Comédia',
    howtostyle: 'Como fazer e Estilo',
    howtoandstyle: 'Como fazer e Estilo',
    autosvehicles: 'Automóveis',
    autosandvehicles: 'Automóveis',
    petsanimals: 'Animais',
    petsandanimals: 'Animais',
    travelandevents: 'Viagens e Eventos',
    nonprofitsactivism: 'ONGs e Ativismo',
  };
  return { key: key || 'semcategoria', label: labels[key] || c };
}

function inferAudience(text) {
  const t = String(text || '').toLowerCase();
  if (/(crian[cç]a|infantil|kids|children|baby|nursery|desenho animado)/.test(t)) return 'kids';
  if (/(aula|aulas|curso|tutorial|educa[cç][aã]o|educational|learn|aprenda|how to|como fazer|explicado)/.test(t)) return 'educational';
  return 'general';
}

function isShortVideo(duration, title) {
  const d = Number(duration || 0);
  // Real YouTube Shorts are short-form vertical videos (<= 3 min; classically <= 60s).
  // Do NOT trust #shorts tag alone when duration proves it's a long video.
  if (d > 0) return d <= 180;
  return /#shorts?\b/i.test(String(title || ''));
}

function toVideoItem(v, fallbackChannel) {
  if (!v || !v.id) return null;
  const title = v.title || 'Sem título';
  const channel = v.channel || fallbackChannel || 'Canal';
  const duration = Number(v.duration || 0);
  const isShort = isShortVideo(duration, title);
  const rawCat = (v.categories && v.categories[0]) || 'Sem categoria';
  const cat = normCategory(rawCat);
  const views = Number(v.views || 0);
  return {
    id: v.id,
    title,
    channel,
    channel_id: v.channel_id || '',
    channel_url: v.channel_url || '',
    views,
    viewsLabel: views.toLocaleString('pt-BR'),
    likes: v.likes ?? null,
    comments: v.comments ?? null,
    subs: v.subs ?? null,
    upload_date: v.upload_date || null,
    daysAgo: v.daysAgo ?? null,
    duration,
    isShort,
    contentType: isShort ? 'shorts' : 'long',
    category: cat.label,
    categoryKey: cat.key,
    audience: inferAudience(title + ' ' + channel),
    tags: Array.isArray(v.tags) ? v.tags.slice(0, 8) : [],
    url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
  };
}

function addVideo(map, item) {
  if (!item) return;
  const prev = map.get(item.id);
  if (!prev || (item.views || 0) > (prev.views || 0)) {
    // keep richer fields if present
    map.set(item.id, prev ? { ...prev, ...item, views: Math.max(prev.views || 0, item.views || 0), viewsLabel: (Math.max(prev.views || 0, item.views || 0)).toLocaleString('pt-BR') } : item);
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = listRunFiles();
  const byId = new Map();
  const sources = [];

  for (const file of files) {
    const data = readJson(file);
    if (!data) continue;
    sources.push(path.relative(ROOT, file));
    // Prefer videos array (has per-video items). Fallback to channel topVideo.
    if (Array.isArray(data.videos)) {
      for (const v of data.videos) addVideo(byId, toVideoItem(v));
    }
    if (Array.isArray(data.channels)) {
      for (const c of data.channels) {
        if (c.topVideo) addVideo(byId, toVideoItem(c.topVideo, c.channel));
        // Some runs may embed extra videos in different shapes; keep defensive.
        if (Array.isArray(c.videos)) {
          for (const v of c.videos) addVideo(byId, toVideoItem(v, c.channel));
        }
      }
    }
  }

  const all = Array.from(byId.values()).sort((a, b) => b.views - a.views);

  // Group by category
  const catMap = new Map();
  for (const v of all) {
    if (!catMap.has(v.categoryKey)) {
      catMap.set(v.categoryKey, { key: v.categoryKey, label: v.category, videos: [], shorts: [], longs: [] });
    }
    const bucket = catMap.get(v.categoryKey);
    bucket.videos.push(v);
    if (v.isShort) bucket.shorts.push(v); else bucket.longs.push(v);
  }

  const categories = {};
  for (const [key, bucket] of catMap.entries()) {
    bucket.videos.sort((a, b) => b.views - a.views);
    bucket.shorts.sort((a, b) => b.views - a.views);
    bucket.longs.sort((a, b) => b.views - a.views);
    const top = bucket.videos.slice(0, TOP_PER_CATEGORY);
    const topShorts = bucket.shorts.slice(0, SHORTS_PER_CATEGORY);
    const topLongs = bucket.longs.slice(0, TOP_PER_CATEGORY);
    // ensure we include enough shorts: union for convenience
    const ids = new Set();
    const selected = [];
    for (const v of [...top, ...topShorts]) { if (!ids.has(v.id)) { ids.add(v.id); selected.push(v); } }
    selected.sort((a, b) => b.views - a.views);
    categories[key] = {
      key,
      label: bucket.label,
      total: bucket.videos.length,
      totalShorts: bucket.shorts.length,
      totalLongs: bucket.longs.length,
      top: top.map(v => v.id),
      topShorts: topShorts.map(v => v.id),
      topLongs: topLongs.map(v => v.id),
      selected: selected.map(v => v.id),
    };
  }

  const result = {
    generatedAt: new Date().toISOString(),
    sources,
    totals: {
      videos: all.length,
      shorts: all.filter(v => v.isShort).length,
      longs: all.filter(v => !v.isShort).length,
      categories: Object.keys(categories).length,
    },
    targets: { topPerCategory: TOP_PER_CATEGORY, shortsPerCategory: SHORTS_PER_CATEGORY },
    categories,
    videos: all,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');

  // Summary
  console.log('Dataset built:', OUT_FILE);
  console.log('Sources:', sources.length);
  console.log('Videos:', all.length, '(shorts:', result.totals.shorts + ', longs:', result.totals.longs + ')');
  console.log('Categories:', Object.keys(categories).length);
  const summary = Object.values(categories)
    .map(c => ({ label: c.label, key: c.key, total: c.total, shorts: c.totalShorts, selected: c.selected.length }))
    .sort((a,b) => b.total - a.total);
  for (const c of summary) {
    console.log(` - ${c.label} [${c.key}]: total ${c.total}, shorts ${c.shorts}, selected ${c.selected}`);
  }
}

main();
