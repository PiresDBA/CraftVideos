#!/usr/bin/env node
/**
 * Targeted YouTube collection to reach per-category volume goals.
 *
 * Goal (default): top 20 videos per category + at least 10 shorts per category.
 * Uses yt-dlp searches, enriches candidates, and merges into
 * work/research/dashboard/data.json then regenerates the dashboard.
 *
 * Usage:
 *   node .artcraft/yt-collect-targets.mjs
 *   node .artcraft/yt-collect-targets.mjs --categories sports,sciencetechnology,music
 *   node .artcraft/yt-collect-targets.mjs --top 20 --shorts 10 --per-query 15
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\CRAFT';
const YTDLP = (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python312\\Scripts\\yt-dlp.exe';
const RESEARCH = path.join(ROOT, 'work', 'research');
const DASH_DIR = path.join(RESEARCH, 'dashboard');
const DATA_FILE = path.join(DASH_DIR, 'data.json');
const RUN_DIR = path.join(RESEARCH, 'run-targets-' + new Date().toISOString().slice(0,10));

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const TOP = Number(arg('top', '20'));
const SHORTS_TARGET = Number(arg('shorts', '10'));
const PER_QUERY = Number(arg('per-query', '15'));
const EXTRACT = Number(arg('extract', '40'));
const ONLY = arg('categories', '') ? arg('categories', '').split(',').map(s=>s.trim()).filter(Boolean) : null;

const CATEGORY_QUERIES = {
  sports: {
    label: 'Esportes',
    queries: ['futebol highlights', 'nba melhores momentos', 'esportes brasil', 'soccer highlights', 'f1 highlights'],
    shorts: ['futebol shorts', 'gol shorts', 'nba shorts', 'esportes shorts']
  },
  sciencetechnology: {
    label: 'Ciência e Tecnologia',
    queries: ['tecnologia', 'inteligência artificial', 'ciência explicada', 'gadgets review', 'programação tutorial'],
    shorts: ['tecnologia shorts', 'inteligência artificial shorts', 'ciência shorts', 'gadgets shorts']
  },
  gaming: {
    label: 'Games',
    queries: ['gameplay', 'minecraft gameplay', 'fortnite gameplay', 'roblox gameplay', 'gaming highlights'],
    shorts: ['gaming shorts', 'minecraft shorts', 'fortnite shorts', 'roblox shorts']
  },
  music: {
    label: 'Música',
    queries: ['music video', 'música ao vivo', 'official music', 'lofi music', 'top songs'],
    shorts: ['music shorts', 'música shorts', 'song shorts', 'cover shorts']
  },
  entertainment: {
    label: 'Entretenimento',
    queries: ['entretenimento', 'viral videos', 'react videos', 'desafios', 'talk show'],
    shorts: ['entretenimento shorts', 'viral shorts', 'funny shorts', 'desafio shorts']
  },
  peopleblogs: {
    label: 'Pessoas e Blogs',
    queries: ['vlog', 'daily vlog', 'rotina', 'podcast cortes', 'histórias reais'],
    shorts: ['vlog shorts', 'rotina shorts', 'podcast shorts', 'historia shorts']
  },
  education: {
    label: 'Educação',
    queries: ['aula', 'tutorial educativo', 'curso rápido', 'história explicada', 'matemática explicada'],
    shorts: ['aula shorts', 'educação shorts', 'aprenda shorts', 'curiosidade educativa shorts']
  },
  newspolitics: {
    label: 'Notícias e Política',
    queries: ['notícias hoje', 'breaking news', 'política brasil', 'jornal', 'atualidades'],
    shorts: ['notícias shorts', 'news shorts', 'política shorts', 'atualidades shorts']
  },
  filmanimation: {
    label: 'Filmes e Animação',
    queries: ['trailer oficial', 'animação', 'resumo de filme', 'anime highlights', 'movie scenes'],
    shorts: ['filme shorts', 'animação shorts', 'anime shorts', 'trailer shorts']
  },
  comedy: {
    label: 'Comédia',
    queries: ['comédia', 'humor', 'stand up comedy', 'memes engraçados', 'piadas'],
    shorts: ['comédia shorts', 'humor shorts', 'funny shorts', 'meme shorts']
  },
  howtostyle: {
    label: 'Como fazer e Estilo',
    queries: ['tutorial como fazer', 'diy', 'receita fácil', 'life hacks', 'how to'],
    shorts: ['diy shorts', 'receita shorts', 'life hack shorts', 'how to shorts']
  },
  autosvehicles: {
    label: 'Automóveis',
    queries: ['carros', 'car review', 'supercars', 'motos', 'automotive'],
    shorts: ['carros shorts', 'supercar shorts', 'moto shorts', 'drift shorts']
  }
};

function run(args, timeout = 120000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(YTDLP)) return resolve({ code: -1, stdout: '', stderr: 'yt-dlp not found' });
    const child = spawn(YTDLP, ['--no-update', '--no-warnings'].concat(args), { windowsHide: true });
    let stdout = '', stderr = '';
    const t = setTimeout(() => { try { child.kill(); } catch {} }, timeout);
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', e => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String(e.message) }); });
    child.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }); });
  });
}

function parseJsonLines(text) {
  const rows = [];
  for (const line of String(text||'').split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try { rows.push(JSON.parse(s)); } catch {}
  }
  return rows;
}

function daysSince(dateStr) {
  if (!dateStr || String(dateStr).length !== 8) return null;
  const y=dateStr.slice(0,4), m=dateStr.slice(4,6), d=dateStr.slice(6,8);
  const t = Date.parse(`${y}-${m}-${d}T12:00:00Z`);
  if (isNaN(t)) return null;
  return Math.floor((Date.now()-t)/86400000);
}

function normCategory(key) {
  return { key, label: (CATEGORY_QUERIES[key] && CATEGORY_QUERIES[key].label) || key };
}

function isShortVideo(duration, title) {
  const d = Number(duration || 0);
  if (d > 0) return d <= 180;
  return /#shorts?\b/i.test(String(title || ''));
}

function toItem(v, catKey) {
  const id = v.id;
  if (!id) return null;
  const title = v.title || 'Sem título';
  const duration = Number(v.duration || 0);
  const isShort = isShortVideo(duration, title);
  const cat = normCategory(catKey);
  const views = Number(v.view_count ?? v.views ?? 0);
  const upload = v.upload_date || null;
  return {
    id,
    title,
    channel: v.channel || v.uploader || '',
    channel_id: v.channel_id || v.uploader_id || '',
    channel_url: v.channel_url || v.uploader_url || '',
    views,
    viewsLabel: views.toLocaleString('pt-BR'),
    likes: v.like_count ?? null,
    comments: v.comment_count ?? null,
    subs: v.channel_follower_count ?? null,
    upload_date: upload,
    daysAgo: upload ? daysSince(upload) : null,
    duration,
    isShort,
    contentType: isShort ? 'shorts' : 'long',
    category: cat.label,
    categoryKey: cat.key,
    audience: /(criança|infantil|kids|children|baby|nursery)/i.test(title) ? 'kids' : (/(aula|curso|tutorial|educa|learn|aprenda|como fazer)/i.test(title) ? 'educational' : 'general'),
    tags: Array.isArray(v.tags) ? v.tags.slice(0,8) : [],
    url: v.webpage_url || `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  };
}

function mergeDataset(existing, newItems) {
  const byId = new Map();
  for (const v of (existing.videos || [])) if (v && v.id) byId.set(v.id, v);
  for (const v of newItems) {
    if (!v || !v.id) continue;
    const prev = byId.get(v.id);
    if (!prev || (v.views||0) >= (prev.views||0)) byId.set(v.id, { ...(prev||{}), ...v });
  }
  const all = Array.from(byId.values()).sort((a,b)=>(b.views||0)-(a.views||0));
  // rebuild categories summary
  const catMap = new Map();
  for (const v of all) {
    const k = v.categoryKey || 'semcategoria';
    if (!catMap.has(k)) catMap.set(k, { key:k, label:v.category||k, videos:[], shorts:[], longs:[] });
    const b = catMap.get(k);
    b.videos.push(v);
    if (v.isShort) b.shorts.push(v); else b.longs.push(v);
  }
  const categories = {};
  for (const [k,b] of catMap.entries()) {
    b.videos.sort((a,b2)=> (b2.views||0)-(a.views||0));
    b.shorts.sort((a,b2)=> (b2.views||0)-(a.views||0));
    b.longs.sort((a,b2)=> (b2.views||0)-(a.views||0));
    const top = b.videos.slice(0, TOP);
    const topShorts = b.shorts.slice(0, SHORTS_TARGET);
    const ids = new Set(); const selected=[];
    for (const v of [...top,...topShorts]) { if(!ids.has(v.id)){ids.add(v.id); selected.push(v);} }
    selected.sort((a,b2)=>(b2.views||0)-(a.views||0));
    categories[k] = {
      key:k, label:b.label,
      total:b.videos.length, totalShorts:b.shorts.length, totalLongs:b.longs.length,
      top: top.map(v=>v.id), topShorts: topShorts.map(v=>v.id), selected: selected.map(v=>v.id)
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    sources: Array.from(new Set([...(existing.sources||[]), 'run-targets'])),
    totals: { videos: all.length, shorts: all.filter(v=>v.isShort).length, longs: all.filter(v=>!v.isShort).length, categories: Object.keys(categories).length },
    targets: { topPerCategory: TOP, shortsPerCategory: SHORTS_TARGET },
    categories,
    videos: all,
  };
}

async function collectForCategory(catKey, def) {
  const found = new Map();
  const queries = [...(def.queries||[]), ...(def.shorts||[])];
  console.log(`\n[${catKey}] ${def.label} - ${queries.length} queries`);
  for (const q of queries) {
    console.error(`  search: ${q}`);
    const r = await run(['--flat-playlist','--dump-json','--playlist-end', String(PER_QUERY), `ytsearch${PER_QUERY}:${q}`], 120000);
    const rows = parseJsonLines(r.stdout);
    for (const row of rows) {
      if (!row.id || found.has(row.id)) continue;
      found.set(row.id, { id: row.id, title: row.title||'', view_count: row.view_count||0, duration: row.duration||0, channel: row.channel||row.uploader||'' });
    }
  }
  // pick candidates prioritizing views and shorts need
  const candidates = Array.from(found.values()).sort((a,b)=>(b.view_count||0)-(a.view_count||0)).slice(0, EXTRACT);
  console.error(`  enrich: ${candidates.length} candidates`);
  const enriched = [];
  for (let i=0;i<candidates.length;i++) {
    const c = candidates[i];
    const r = await run(['--dump-single-json','--skip-download', `https://www.youtube.com/watch?v=${c.id}`], 90000);
    if (i % 10 === 0) console.error(`    ${i}/${candidates.length}`);
    if (r.code !== 0) continue;
    let j; try { j = JSON.parse(r.stdout); } catch { continue; }
    const item = toItem(j, catKey);
    // force category key for this targeted bucket (helps "top por categoria" request)
    if (item) { item.categoryKey = catKey; item.category = def.label; enriched.push(item); }
  }
  console.log(`  collected: ${enriched.length} (shorts: ${enriched.filter(v=>v.isShort).length})`);
  return enriched;
}

async function main() {
  if (!fs.existsSync(YTDLP)) {
    console.error('yt-dlp não encontrado em: ' + YTDLP);
    process.exit(2);
  }
  fs.mkdirSync(DASH_DIR, { recursive: true });
  fs.mkdirSync(RUN_DIR, { recursive: true });

  let existing = { videos: [], sources: [], categories: {}, totals: {}, targets: {} };
  if (fs.existsSync(DATA_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch {}
  }

  const keys = (ONLY && ONLY.length ? ONLY : Object.keys(CATEGORY_QUERIES)).filter(k => CATEGORY_QUERIES[k]);
  console.log('Targets:', keys.join(', '));
  console.log('Goal:', TOP, 'top +', SHORTS_TARGET, 'shorts por categoria');

  let allNew = [];
  for (const k of keys) {
    try {
      const items = await collectForCategory(k, CATEGORY_QUERIES[k]);
      allNew = allNew.concat(items);
    } catch (e) {
      console.error(`  erro em ${k}:`, e && e.message);
    }
  }

  const merged = mergeDataset(existing, allNew);
  fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2), 'utf8');
  fs.writeFileSync(path.join(RUN_DIR, 'collected.json'), JSON.stringify({ generatedAt: new Date().toISOString(), keys, count: allNew.length, items: allNew }, null, 2), 'utf8');

  // regenerate dashboard
  const gen = spawn(process.execPath, [path.join(ROOT,'.artcraft','yt-dashboard.mjs')], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  await new Promise(res => gen.on('close', res));

  console.log('\nResumo por categoria:');
  for (const k of keys) {
    const c = merged.categories[k];
    if (!c) continue;
    console.log(` - ${c.label}: total ${c.total}, shorts ${c.totalShorts} (alvo shorts ${SHORTS_TARGET})`);
  }
  console.log('Dashboard:', path.join(DASH_DIR,'index.html'));
}

main().catch(e => { console.error(e); process.exit(1); });
