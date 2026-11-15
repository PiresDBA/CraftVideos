#!/usr/bin/env node
/**
 * =============================================================================
 * YT DASHBOARD v2 — Dashboard de canais com refresh real e UI funcional
 * =============================================================================
 *
 * Gera um HTML único, auto-contido, servido pelo yt-daemon.mjs na porta 8799.
 *
 * MELHORIAS v2:
 *   - Event delegation robusto (não quebra com elementos dinâmicos)
 *   - Botão Refresh funcional (chama /refresh do daemon + recarrega)
 *   - Polling de status da fila (queue) a cada 5s
 *   - Feedback visual: loading spinners, toasts, estados disabled
 *   - Filtros/ordenacao/shorts/IA funcionando via delegação
 *   - Modal de clonagem funcional
 *   - Timestamp "última atualização" visível
 *   - Auto-refresh opcional (toggle)
 *   - Fallback gracioso se daemon indisponível
 *
 * Uso:
 *   node .artcraft/yt-dashboard.mjs [--sample ...] [--world ...] [--out ...]
 *   node .artcraft/yt-dashboard.mjs --rebuild   (força rebuild completo)
 *
 * O daemon (yt-daemon.mjs) serve este HTML em http://127.0.0.1:8799
 * e expõe endpoints: /refresh, /queue, /health, /settings, /config
 * =============================================================================
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
const REBUILD = process.argv.includes('--rebuild');

let THUMB_W = 320;
let THUMB_Q = QUALITY;
function adaptThumbSize(count) {
  if (count > 220) { THUMB_W = 240; THUMB_Q = '45'; }
  else if (count > 130) { THUMB_W = 288; THUMB_Q = '48'; }
}

// ---------------------------------------------------------------- thumbnail pipeline
function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    'C:\\Users\\Pires\\AppData\\Local\\hermes\\tools\\ffmpeg-9.0.1-win32-x64\\bin\\ffmpeg.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  const where = spawnSync('where', ['ffmpeg'], { encoding: 'utf8' });
  if (where.status === 0) {
    const first = String(where.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
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
        res.resume(); return httpGet(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (code !== 200) { res.resume(); return reject(new Error('HTTP ' + code)); }
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function ensureThumb(id) {
  const cacheFile = path.join(THUMB_DIR, id + '.' + THUMB_W + 'q' + THUMB_Q + '.webp');
  if (fs.existsSync(cacheFile)) {
    try { return fs.readFileSync(cacheFile); } catch { /* refetch */ }
  }
  let jpg = null;
  for (const name of ['mqdefault', 'hqdefault', 'default']) {
    try { jpg = await httpGet(`https://i.ytimg.com/vi/${id}/${name}.jpg`); break; } catch { /* try next */ }
  }
  if (!jpg) return null;
  const tmpJpg = path.join(THUMB_DIR, id + '.src.jpg');
  fs.writeFileSync(tmpJpg, jpg);
  if (FFMPEG) {
    const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', tmpJpg, '-vf', 'scale=' + THUMB_W + ':-2', '-c:v', 'libwebp', '-quality', THUMB_Q, '-compression_level', '6', cacheFile], { windowsHide: true });
    fs.rmSync(tmpJpg, { force: true });
    if (r.status === 0 && fs.existsSync(cacheFile)) { try { return fs.readFileSync(cacheFile); } catch { } }
  } else {
    fs.renameSync(tmpJpg, cacheFile);
  }
  return jpg;
}

async function buildThumbs(ids) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const map = new Map(); let done = 0, failed = 0;
  const queue = ids.slice();
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try { const buf = await ensureThumb(id); if (buf) map.set(id, buf.toString('base64')); else failed++; } catch { failed++; }
      done++; if (done % 20 === 0) process.stdout.write(`  miniaturas ${done}/${ids.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  if (ids.length >= 20) process.stdout.write(' '.repeat(40) + '\r');
  return { map, failed };
}

// ---------------------------------------------------------------- classification
const classifier = createClassifier(TAXONOMY_PATH);
const NICHE_BY_ID = classifier.NICHE_BY_ID;

function detectAudience(text) {
  const s = String(text || '');
  if (/\b(kids?|infantil|crian[çc]a|nursery|toys?|children|baby)\b/i.test(s)) return 'Infantil';
  if (/\b(18\+|adult|adulto|nsfw|explicit|porn)\b/i.test(s)) return 'Adulto';
  return 'Geral';
}

function esc(s) {
  const str = String(s == null ? '' : s);
  return str.replace(/[&<>"']/g, function(m) {
    const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" };
    return map[m] || m;
  });
}

function compact(n) { if (n == null || Number.isNaN(Number(n))) return '—'; const v = Number(n); const flat = x => String(x).replace('.', ','); if (v >= 1e9) return flat((v/1e9).toFixed(1)) + ' B'; if (v >= 1e6) return flat((v/1e6).toFixed(1)) + ' M'; if (v >= 1e4) return flat((v/1e3).toFixed(0)) + ' mil'; if (v >= 1e3) return flat((v/1e3).toFixed(1)) + ' mil'; return String(v); }

function hueFor(cat) { let h = 0; for (let i=0;i<cat.length;i++) h=(h*31+cat.charCodeAt(i))%360; return h; }

function strategyOf(c) {
  const v7 = c.videos7d || 0, avg = c.avgViews || 0, subs = c.subs || 0, ratio = subs ? avg/subs : 0;
  if (!v7) return { label: 'Inativo', tone: 'off', note: 'sem uploads nos últimos 7 dias' };
  if (ratio >= 0.5 && avg >= 100000) return { label: 'Viral', tone: 'imp', note: 'cada vídeo faz ' + ratio.toFixed(1) + '× os subscritores' };
  if (avg >= 500000) return { label: 'Impacto', tone: 'imp', note: 'média ' + compact(avg) + ' por vídeo' };
  if (v7 >= 3 && avg < 100000) return { label: 'Volume', tone: 'vol', note: v7 + ' vídeos/semana, média ' + compact(avg) };
  return { label: 'Regular', tone: 'mid', note: v7 + ' vídeos/semana, média ' + compact(avg) };
}

function insight(c) { const bits=[]; if (c.totalViews && c.subs) { const per=c.totalViews/c.subs; bits.push(per>=1 ? 'cada subscritor gerou '+per.toFixed(1)+' views' : 'conversão sub→view baixa'); } if (c.avgViews) bits.push('média '+compact(c.avgViews)+'/vídeo'); if (c.maxViews) bits.push('melhor '+compact(c.maxViews)); return bits.join(' · '); }

// ---------------------------------------------------------------- load & merge
function loadSamples(paths) { const loaded=[]; for(const p of paths){ if(!fs.existsSync(p)){ console.error('sample not found: '+p); continue; } loaded.push({path:p, data:JSON.parse(fs.readFileSync(p,'utf8'))}); } if(!loaded.length){ console.error('nenhuma amostra válida'); process.exit(2); } return loaded; }
function mergeSamples(loaded) { const videos=new Map(), channels=new Map(); for(const {data} of loaded){ for(const v of data.videos||[]){ if(v&&v.id&&!videos.has(v.id)) videos.set(v.id,v); } for(const c of data.channels||[]){ const key=c.channel_id||c.channel; if(!key) continue; const prev=channels.get(key); if(!prev){ channels.set(key,Object.assign({},c)); continue; } if((c.videosSeen||0)>(prev.videosSeen||0)){ prev.videosSeen=c.videosSeen; prev.totalViewsSeen=c.totalViewsSeen; prev.avgViews=c.avgViews; prev.maxViews=c.maxViews; } prev.subs=prev.subs||c.subs; const a=prev.rssVideosInWindow, b=c.rssVideosInWindow; prev.rssVideosInWindow=a===undefined?b:b===undefined?a:Math.max(a,b); prev.shortsShare=Math.max(prev.shortsShare||0,c.shortsShare||0); prev.avgDuration=prev.avgDuration||c.avgDuration; } } return { channels:Array.from(channels.values()), videos:Array.from(videos.values()) }; }

// ---------------------------------------------------------------- build channels
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const loaded = loadSamples(SAMPLE_ARGS.length ? SAMPLE_ARGS : [SAMPLE]);
  const sample = mergeSamples(loaded);
  let world=null; if(fs.existsSync(WORLD)){ try{ world=JSON.parse(fs.readFileSync(WORLD,'utf8')); }catch{} }
  let scan=null; if(fs.existsSync(SHORTS_SCAN)){ try{ scan=JSON.parse(fs.readFileSync(SHORTS_SCAN,'utf8')); }catch{} }
  const scanFor = id => (scan&&scan.channels&&scan.channels[id])||null;
  const byChannel=new Map(); for(const v of sample.videos||[]){ const key=v.channel_id||v.channel; if(!key)continue; if(!byChannel.has(key))byChannel.set(key,[]); byChannel.get(key).push(v); }
  const channels = (sample.channels||[]).map(c => { const vids=byChannel.get(c.channel_id||c.channel)||[]; const text=[c.channel].concat(vids.map(v=>v.title)).join(' '); const top=vids.slice().sort((a,b)=>b.views-a.views)[0]; const shorts=vids.filter(v=>v.isShort).length; const shortsShare=vids.length?shorts/vids.length:c.shortsShare||0; const sc=scanFor(c.channel_id); const cls=classifier.verdictOf(c,vids,sc); return { id:c.channel_id||c.channel, name:c.channel, url:c.channel_url||'https://www.youtube.com/channel/'+c.channel_id, subs:c.subs===undefined?null:c.subs, videos7d:c.rssVideosInWindow===undefined?null:c.rssVideosInWindow, totalViews:c.totalViewsSeen, avgViews:c.avgViews, maxViews:c.maxViews, category:cls.label, niche:cls.niche, ai:cls.ai, aiVerdict:cls.aiVerdict, aiScore:cls.aiScore, aiThreshold:cls.aiThreshold, aiMax:cls.aiMax, aiReasons:cls.aiReasons, overridden:!!cls.overridden, runnerUp:cls.runnerUp, confidence:cls.confidence, audience:detectAudience(text), shortsShare:Math.round(shortsShare*100)/100, format:shortsShare>=0.5?'shorts':'long', shortsCount:sc?sc.shorts:null, shortsViews:sc?(sc.shortsViews===undefined?sc.views:sc.shortsViews):null, shortsActive:!!(sc&&sc.shorts>=3), shortsTop:sc&&sc.top?sc.top:null, avgDuration:c.avgDuration||null, topVideo:top?{id:top.id,title:top.title,views:top.views,url:top.url}:null, videos:vids.slice().sort((a,b)=>b.views-a.views).slice(0,8).map(v=>({id:v.id,title:v.title,views:v.views,date:v.upload_date,url:v.url,short:!!v.isShort})) }; });
  for(const c of channels) c.strategy=strategyOf(c);
  channels.sort((a,b)=>(b.totalViews||0)-(a.totalViews||0));

  // ---- thumbnails
  const ids=new Set(); for(const c of channels){ if(c.topVideo)ids.add(c.topVideo.id); for(const v of c.videos)ids.add(v.id); }
  const idList=Array.from(ids).filter(x=>x&&/^[A-Za-z0-9_-]{6,20}$/.test(x));
  let thumbs=new Map(), thumbFailed=0;
  if(!NO_EMBED){ adaptThumbSize(idList.length); const built=await buildThumbs(idList); thumbs=built.map; thumbFailed=built.failed; }

  // ---- indices for filtering
  const catCounts={}; for(const c of channels) catCounts[c.niche]=(catCounts[c.niche]||0)+1;
  const nicheLabel = id => (NICHE_BY_ID.get(id)||{label:id}).label;
  const darkCount = channels.filter(c=>c.ai).length;
  const darkMaybe = channels.filter(c=>c.aiVerdict==='maybe').length;
  const shortsCount = channels.filter(c=>c.format==='shorts').length;

  const chips = ['__all__'].concat(Object.keys(catCounts).sort((a,b)=>catCounts[b]-catCounts[a]))
    .map(id => { const label=id==='__all__'?'Todos os nichos':nicheLabel(id); const n=id==='__all__'?channels.length:catCounts[id]; return `<button class="chip${id==='__all__'?' on':''}" data-cat="${esc(id)}">${esc(label)}<i>${n}</i></button>`; }).join('');

  const totalVideos = (sample.videos||[]).length;
  const generated = sample.generatedAt ? new Date(sample.generatedAt) : new Date();
  const stamp = generated.toLocaleString('pt-PT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});

  // ---- EMBEDDED DATA for client-side JS
  const clientData = { channels: channels.map(c=>({ id:c.id, name:c.name, url:c.url, topVideo:c.topVideo, category:c.category, niche:c.niche, ai:c.ai, aiVerdict:c.aiVerdict, aiScore:c.aiScore, aiMax:c.aiMax, aiThreshold:c.aiThreshold, aiReasons:c.aiReasons, audience:c.audience, shortsShare:c.shortsShare, format:c.format, shortsCount:c.shortsCount, shortsViews:c.shortsViews, shortsActive:c.shortsActive, shortsTop:c.shortsTop, avgDuration:c.avgDuration, topVideo:c.topVideo, videos:c.videos, subs:c.subs, videos7d:c.videos7d, totalViews:c.totalViews, avgViews:c.avgViews, maxViews:c.maxViews, strategy:c.strategy })), generatedAt: generated.toISOString(), stamp, totalVideos, darkCount, darkMaybe, shortsCount, categories: catCounts };

  // ============================================================================
  // HTML GENERATION
  // ============================================================================
  const cards = channels.map(c => { const tv=c.topVideo; const h=hueFor(c.category); const strip=(c.videos||[]).map(v=>`<button class="mini" data-id="${esc(v.id)}" title="${esc(v.title)} · ${compact(v.views)} views">${thumbBox(v.id,'miniimg',`<span class="miniview">${compact(v.views)}</span>`)}</button>`).join(''); const thumbInner=tv?`<div class="playico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></div>`:`<div class="fallback">${initial(c.name)}<span>sem vídeo amostrado</span></div>`; return `<article class="card" data-cat="${esc(c.category)}" data-name="${esc(String(c.name).toLowerCase())}" data-search="${esc([c.name,c.category,c.audience,c.aiReasons?.join(' '),c.topVideo?.title,...c.videos.slice(0,8).map(v=>v.title)].join(' ').toLowerCase().replace(/\s+/g,' '))}" data-niche="${esc(c.niche)}" data-ai="${c.ai?'1':'0'}" data-aiv="${esc(c.aiVerdict)}" data-format="${esc(c.format)}" data-shorts="${c.shortsActive?'1':'0'}" data-subs="${c.subs||0}" data-views="${c.totalViews||0}" data-avg="${c.avgViews||0}" data-v7="${c.videos7d||0}" style="--h:${h}"><div class="hero">${thumbBox(tv?tv.id:null,'heroimg',thumbInner)}<span class="pill">${esc(c.category)}</span>${aiBadge(c)}${c.shortsActive?`<span class="pill shorts">${c.shortsCount?c.shortsCount+' SHORTS':'SHORTS'}</span>`:''}${c.audience==='Adulto'?'<span class="pill adult">18+</span>':''}<span class="strat ${c.strategy.tone}">${esc(c.strategy.label)}</span></div><div class="body"><h2><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a></h2><div class="stats"><div class="stat"><b>${compact(c.subs)}</b><span>subs</span></div><div class="stat"><b>${c.videos7d===null?'—':c.videos7d}</b><span>vids/7d</span></div><div class="stat"><b>${compact(c.totalViews)}</b><span>views</span></div></div><p class="note">${esc(c.strategy.note)}</p><p class="note dim">${esc(insight(c))}</p>${strip?'<div class="strip">'+strip+'</div>':''}<div class="acts"><button class="primary" data-clone="${esc(c.name)}" data-url="${esc(tv?tv.url:c.url)}" data-id="${esc(tv?tv.id:'')}">Clonar formato</button><button data-open="${esc(c.url)}">Ver canal</button></div></div></article>`; }).join('');

  const rows = channels.map((c,i)=>{ const tv=c.topVideo; return `<tr data-cat="${esc(c.category)}" data-name="${esc(String(c.name).toLowerCase())}" data-search="${esc([c.name,c.category,c.audience,c.aiReasons?.join(' '),c.topVideo?.title,...c.videos.slice(0,8).map(v=>v.title)].join(' ').toLowerCase().replace(/\s+/g,' '))}" data-niche="${esc(c.niche)}" data-ai="${c.ai?'1':'0'}" data-aiv="${esc(c.aiVerdict)}" data-format="${esc(c.format)}" data-shorts="${c.shortsActive?'1':'0'}" data-subs="${c.subs||0}" data-views="${c.totalViews||0}" data-avg="${c.avgViews||0}" data-v7="${c.videos7d||0}" style="--h:${hueFor(c.category)}"><td class="rank">${i+1}</td><td class="cellthumb"><button class="rowthumb" data-id="${esc(tv?tv.id:'')}">${thumbBox(tv?tv.id:null,'rowimg',tv?'':'<span class="fallback sm">${initial(c.name)}</span>')}</button></td><td><a class="rname" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a><span class="pill">${esc(c.category)}</span>${aiBadge(c,true)}</td><td class="n">${compact(c.subs)}</td><td class="n">${c.videos7d===null?'—':c.videos7d}</td><td class="n">${compact(c.totalViews)}</td><td class="n">${compact(c.avgViews)}</td><td>${c.shortsActive?'Longos + '+(c.shortsCount||'')+' shorts':c.format==='shorts'?'Shorts':'Longo'}</td><td class="stratcell"><span class="strat ${c.strategy.tone}">${esc(c.strategy.label)}</span></td><td><button class="primary" data-clone="${esc(c.name)}" data-url="${esc(tv?tv.url:c.url)}" data-id="${esc(tv?tv.id:'')}">Clonar</button></td></tr>`; }).join('');

  // Helper functions for HTML generation
  function thumbBox(id, extraClass, inner) { const cls=id?'th_'+String(id).replace(/[^A-Za-z0-9_-]/g,''):'th_none'; return '<div class="ph '+cls+(extraClass?' '+extraClass:'')+'"'+(id?' data-id="'+esc(id)+'"':'')+'>'+(inner||'')+'</div>'; }
  function initial(name){ return esc(String(name||'?').trim().charAt(0).toUpperCase()||'?'); }
  function aiBadge(c, inline){ const why=(c.aiReasons||[]).join(' · '); const score=c.aiScore||0; const max=c.aiThreshold||c.aiMax||6; const attr=' title="'+esc('IA '+score+'/'+max+(why?' — '+why:''))+'"'; if(c.ai)return'<span class="pill dark"'+attr+'>DARK IA '+score+'/'+max+'</span>'; if(c.aiVerdict==='maybe')return'<span class="pill maybe"'+attr+'>IA? '+score+'/'+max+'</span>'; return inline?'':''; }

  // ============================================================================
  // HTML TEMPLATE with EMBEDDED CLIENT-SIDE JS (v2 - robust, live, functional)
  // ============================================================================
  const thumbCss = Array.from(thumbs.entries()).map(([id,b64])=>'.'+id.replace(/[^A-Za-z0-9_-]/g,'_').replace(/^/,'th_')+'{background-image:url(data:image/webp;base64,'+b64+')}').join('\n');
  const data = JSON.stringify(clientData);

  const html = `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radar de Canais · ArtCraft</title>
<style>
:root{--bg:#0a0c10;--bg2:#0f1218;--panel:#141821;--panel2:#1b2029;--line:#242b36;--ink:#eceef2;--dim:#98a2b3;--dim2:#667085;--accent:#ff3b3b;--good:#3ecf8e;--info:#4aa8ff;--radius:14px}
*{box-sizing:border-box} html{scroll-behavior:smooth}
body{margin:0;background:radial-gradient(1200px 600px at 15% -10%,rgba(255,59,59,.09),transparent 60%),radial-gradient(900px 500px at 95% 0%,rgba(74,168,255,.08),transparent 55%),var(--bg);color:var(--ink);font:14px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}a:hover{color:#fff;text-decoration:underline}
/* header */
header{position:sticky;top:0;z-index:40;background:rgba(10,12,16,.86);backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--line)}
.hwrap{max-width:1600px;margin:0 auto;padding:16px 22px 0}
.hrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px}.dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(255,59,59,.16)}h1{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em}.sub{color:var(--dim2);font-size:12px}
.spacer{flex:1 1 auto}
input[type=search],select{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px 12px;font:inherit;font-size:13px;outline:none;min-height:38px}
input[type=search]{min-width:210px}input[type=search]:focus,select:focus{border-color:#3d4a5c;box-shadow:0 0 0 3px rgba(74,168,255,.12)}
.seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel)}
.seg button{border:0;border-radius:0;background:none;color:var(--dim);padding:9px 14px;font-size:13px;min-height:38px}
.seg button.on{background:var(--ink);color:#0a0c10;font-weight:650}
.chips{display:flex;flex-wrap:wrap;gap:7px;padding:12px 0 14px}
.chip{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;cursor:pointer;border:1px solid var(--line);background:var(--panel);color:var(--dim);padding:7px 12px;border-radius:99px;font:inherit;font-size:12.5px;transition:.14s}
.chip i{font-style:normal;font-size:11px;color:var(--dim2);font-variant-numeric:tabular-nums}
.chip:hover{border-color:#39445a;color:var(--ink)}.chip.on{background:var(--ink);border-color:var(--ink);color:#0a0c10;font-weight:650}.chip.on i{color:rgba(10,12,16,.55)}
/* quick filters */
.quick{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:12px 0 2px;border-top:1px solid var(--line)}
.qgroup{display:flex;align-items:center;gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel)}
.qgroup .qlab{padding:0 10px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim2);border-right:1px solid var(--line)}
.qgroup button{border:0;border-radius:0;background:none;color:var(--dim);padding:8px 12px;font:inherit;font-size:12.5px;cursor:pointer;transition:.13s}
.qgroup button:hover{color:var(--ink);background:#1c222d}
.qgroup button.on{background:var(--ink);color:#0a0c10;font-weight:650}
.qgroup button.dark.on{background:#e04848;color:#fff}
.qgroup button.shorts.on{background:#4aa8ff;color:#04131f}
.chip:hover{border-color:#39445a;color:var(--ink)}.chip.on{background:var(--ink);border-color:var(--ink);color:#0a0c10;font-weight:650}.chip.on i{color:rgba(10,12,16,.55)}
/* layout */main{max-width:1600px;margin:0 auto;padding:22px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
/* card */
.card{background:linear-gradient(180deg,var(--panel),#11151c);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;transition:transform .16s,border-color .16s,box-shadow .16s}.card:hover{transform:translateY(-2px);border-color:#39445a;box-shadow:0 12px 28px -12px rgba(0,0,0,.8)}
.hero{position:relative;aspect-ratio:16/9;background:#0d1016;overflow:hidden}.ph{width:100%;height:100%;background-color:#171c25;background-size:cover;background-position:center;position:relative}.th_none{background-image:linear-gradient(135deg,#1c2330,#12161d 60%,#1a2129)}.heroimg{cursor:pointer}.heroimg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(6,8,11,.72));pointer-events:none}.playico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .16s;color:#fff;z-index:2}.playico svg{width:54px;height:54px;filter:drop-shadow(0 3px 10px rgba(0,0,0,.75))}.heroimg:hover .playico{opacity:1}.fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#3f4a5c;font-size:34px;font-weight:800;letter-spacing:-.02em}.fallback span{font-size:11px;font-weight:500;letter-spacing:0}.fallback.sm{font-size:15px}
.pill{position:absolute;top:9px;left:9px;z-index:3;background:rgba(8,10,14,.82);color:hsl(var(--h,0) 85% 72%);border:1px solid hsl(var(--h,0) 70% 55% / .45);font-size:10.5px;font-weight:700;letter-spacing:.02em;padding:3px 8px;border-radius:7px;backdrop-filter:blur(4px)}.pill.adult{left:auto;right:9px;color:#ffb4b4;border-color:rgba(255,90,90,.5)}.pill.dark{top:auto;bottom:9px;left:9px;color:#ff9a9a;border-color:rgba(224,72,72,.55);background:rgba(60,10,10,.85)}.pill.maybe{top:auto;bottom:9px;left:9px;color:#ffd28a;border-color:rgba(214,148,32,.55);background:rgba(48,32,4,.85)}.pill.shorts{top:auto;bottom:9px;left:9px;color:#8fd0ff;border-color:rgba(74,168,255,.5);background:rgba(6,24,40,.85)}.pill.dark+.pill.shorts{left:auto;right:9px;bottom:9px}td .pill{margin-left:6px}.strat{position:absolute;bottom:9px;right:9px;z-index:3;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:7px;border:1px solid transparent;backdrop-filter:blur(4px)}.strat.imp{background:rgba(62,207,142,.16);color:#61e3a8;border-color:rgba(62,207,142,.35)}.strat.vol{background:rgba(74,168,255,.16);color:#82c4ff;border-color:rgba(74,168,255,.35)}.strat.mid{background:rgba(255,255,255,.1);color:#c8cfda;border-color:rgba(255,255,255,.16)}.strat.off{background:rgba(255,255,255,.06);color:#7b8494;border-color:rgba(255,255,255,.1)}
.body{padding:13px 14px 14px;display:flex;flex-direction:column;gap:9px;flex:1}h2{margin:0;font-size:15.5px;font-weight:700;letter-spacing:-.01em;line-height:1.3}h2 a:hover{text-decoration:none}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stat{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 9px;display:flex;flex-direction:column;gap:1px;min-width:0}.stat b{font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stat span{font-size:10.5px;color:var(--dim2);text-transform:uppercase;letter-spacing:.04em}
.note{margin:0;font-size:12.5px;color:var(--dim);line-height:1.45}.note.dim{color:var(--dim2);font-size:12px}
.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:2px}.mini{border:0;padding:0;background:none;cursor:pointer;border-radius:7px;overflow:hidden;position:relative;aspect-ratio:16/9;display:block}.miniimg{border-radius:7px;transition:transform .16s}.mini:hover .miniimg{transform:scale(1.06)}.miniview{position:absolute;bottom:3px;right:4px;font-size:9.5px;font-weight:600;color:#fff;background:rgba(0,0,0,.75);padding:1px 4px;border-radius:4px;z-index:2}
.acts{display:flex;gap:8px;margin-top:auto;padding-top:4px}button{font:inherit;font-size:12.5px;padding:8px 12px;border-radius:9px;cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--ink);transition:.14s}button:hover{border-color:#47536b;background:#212836}button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:650}button.primary:hover{filter:brightness(1.12)}button:disabled{opacity:.5;cursor:not-allowed}
/* table */.tablewrap{border:1px solid var(--line);border-radius:var(--radius);overflow:auto;background:var(--panel)}table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}th,td{padding:9px 12px;text-align:left;vertical-align:middle;border-bottom:1px solid var(--line)}th{position:sticky;top:0;z-index:2;background:#131821;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim2);font-weight:600;white-space:nowrap}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:rgba(255,255,255,.028)}td.rank{color:var(--dim2);font-variant-numeric:tabular-nums;width:44px}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dim)}td.n b{color:var(--ink)}.cellthumb{width:88px}.rowthumb{border:0;padding:0;background:none;cursor:pointer;display:block;width:78px;aspect-ratio:16/9;border-radius:6px;overflow:hidden}.rowimg{border-radius:6px}.rname{font-weight:600;color:var(--ink);display:inline-block;margin-right:8px}.stratcell{width:92px}.stratcell .strat{position:static;display:inline-block}
/* misc */.empty{display:none;text-align:center;color:var(--dim2);padding:60px 0;font-size:13.5px}.hidden{display:none !important}.modal{position:fixed;inset:0;z-index:100;background:rgba(4,6,9,.9);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:24px}.modal.on{display:flex}.mbox{width:min(1120px,96vw);background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 30px 80px -20px #000}.mbox.wide{max-width:900px}.mhead{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}.mhead .t{flex:1;font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mclose{background:none;border:0;color:var(--dim);font-size:24px;line-height:1;padding:0 4px;cursor:pointer}.mclose:hover{color:#fff}.mplayer{aspect-ratio:16/9;background:#000}.mplayer iframe{width:100%;height:100%;border:0;display:block}.mfoot{padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);font-size:12px;color:var(--dim2)}.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,18px);z-index:200;background:var(--good);color:#04160e;font-weight:650;font-size:13px;padding:11px 20px;border-radius:99px;opacity:0;transition:.22s;pointer-events:none;box-shadow:0 10px 30px -8px rgba(62,207,142,.6)}.toast.on{opacity:1;transform:translate(-50%,0)}footer{max-width:1600px;margin:0 auto;padding:26px 22px 40px;color:var(--dim2);font-size:12px;border-top:1px solid var(--line)}
@media (max-width:720px){.grid{grid-template-columns:1fr}main{padding:14px}.hwrap{padding:12px 14px 0}input[type=search]{min-width:0;flex:1}.tablewrap{font-size:12px}th,td{padding:8px}.cellthumb,.stratcell{display:none}}
${thumbCss}
</style></head><body>
<header><div class="hwrap"><div class="hrow"><div class="brand"><span class="dot"></span><h1>Radar de Canais</h1></div><span class="sub" id="subline" data-total="${channels.length}" data-videos="${totalVideos}" data-stamp="${esc(stamp)}">${channels.length} canais · ${totalVideos} vídeos · ${darkCount} dark IA · ${darkMaybe} duvidosos · ${shortsCount} de shorts · ${esc(stamp)}</span><div class="spacer"></div><input type="search" id="q" placeholder="procurar canal, tema ou vídeo…"><select id="sort"><option value="views">Mais vistos (amostra)</option><option value="subs">Mais subscritores</option><option value="avg">Melhor média por vídeo</option><option value="output">Mais publicaram (7d)</option><option value="name">Nome A-Z</option></select><div class="seg"><button id="vgrid" class="on">Grelha</button><button id="vtable">Tabela</button><button id="settingsBtn" class="ghost" title="Configurações">⚙</button></div></div><div class="chips" id="filters">${chips}</div><div class="quick"><div class="qgroup" id="qai"><span class="qlab">Dark = 100% IA</span><button data-ai="all" class="on">Todos</button><button data-ai="yes" class="dark">Só Dark</button><button data-ai="maybe">Duvidosos</button><button data-ai="no">Só humano</button></div><div class="qgroup" id="qformat"><span class="qlab">Formato</span><button data-format="all" class="on">Todos</button><button data-format="long">Só longos</button><button data-format="shorts" class="shorts">Só shorts</button><button data-format="has" class="shorts">Com shorts</button></div><div class="qgroup" id="qrefresh"><span class="qlab">Atualização</span><button id="btnRefresh" class="primary" title="Regenerar dashboard com dados atuais (chama daemon /refresh)">🔄 Atualizar agora</button><label style="display:flex;align-items:center;gap:6px;color:var(--dim);font-size:12px"><input type="checkbox" id="autoRefresh"> Auto (30s)</label><span id="lastRefresh" class="sub" style="margin-left:auto"></span></div><span class="sub" id="tally"></span></div></div></header>
<main><div class="grid" id="grid">${cards}</div><div class="tablewrap hidden" id="tablewrap"><table><thead><tr><th>#</th><th></th><th>Canal</th><th style="text-align:right">Subs</th><th style="text-align:right">Vids/7d</th><th style="text-align:right">Views</th><th style="text-align:right">Média</th><th>Formato</th><th>Estratégia</th><th></th></tr></thead><tbody id="tbody">${rows}</tbody></table></div><div class="empty" id="empty">Nenhum canal corresponde a este filtro.</div></main>
<div class="modal" id="modal"><div class="mbox"><div class="mhead"><div class="t" id="mtitle"></div><button class="mclose" id="mclose" aria-label="fechar">&times;</button></div><div class="mplayer" id="mplayer"></div><div class="mfoot"><span id="mmeta"></span><div class="spacer"></div><button class="primary" id="mclone">Clonar este formato</button></div></div></div>
<div class="modal" id="cmodal"><div class="mbox wide"><div class="mhead"><div class="t">Parâmetros do Clone</div><button class="mclose" id="cclose" aria-label="fechar">&times;</button></div><div class="mbody" id="cbody"><div class="row"><label>Canal alvo <span class="dim">(preenchido pelo card)</span></label><input id="c_url" type="url" placeholder="https://youtube.com/channel/..."></div><div class="row"><label>Slug de saída</label><input id="c_slug" type="text" placeholder="clone-meu-canal"></div><div class="row"><label>Script de cenas (JSON)</label><input id="c_script" type="text" placeholder="opcional — usa o default da config"></div><details open><summary>Voz</summary><div class="row"><label>Engine</label><select id="c_voice_engine"><option value="sapi">SAPI (Windows, tem pt-BR)</option><option value="filmcraft">FilmCraft TTS (en-US)</option><option value="none">Mudo</option></select></div><div class="row"><label>Voz SAPI</label><input id="c_voice_sapi" type="text" placeholder="Microsoft Maria Desktop"></div></details><details><summary>Vídeo</summary><div class="row"><label>Largura</label><input id="c_v_w" type="number" value="1080"></div><div class="row"><label>Altura</label><input id="c_v_h" type="number" value="1920"></div><div class="row"><label>FPS</label><input id="c_v_fps" type="number" value="30"></div><div class="row"><label>CRF (qualidade)</label><input id="c_v_crf" type="number" value="20" min="16" max="28"></div></details><details><summary>Cartões (FigCraft)</summary><div class="row"><label>Fonte</label><input id="c_c_font" type="text" value="Inter"></div><div class="row"><label>Tamanho título</label><input id="c_c_hsize" type="number" value="108"></div><div class="row"><label>Cor fundo</label><input id="c_c_bg" type="color" value="#0b0b12"></div><div class="row"><label>Cor texto</label><input id="c_c_ink" type="color" value="#f4f4f4"></div><div class="row"><label>Cor destaque</label><input id="c_c_accent" type="color" value="#e04848"></div></details><details><summary>Ken Burns</summary><div class="row"><label>Ativar</label><select id="c_kb_en"><option value="true">Sim</option><option value="false">Não</option></select></div><div class="row"><label>De</label><input id="c_kb_from" type="number" step="0.01" value="1.0"></div><div class="row"><label>Para</label><input id="c_kb_to" type="number" step="0.01" value="1.07"></div></details><details><summary>Transição</summary><div class="row"><label>Tipo</label><select id="c_tx_type"><option value="xfade">Fade/Dissolve</option><option value="none">Corte seco</option></select></div><div class="row"><label>Segundos</label><input id="c_tx_sec" type="number" step="0.05" value="0.35"></div></details><details><summary>Música de fundo</summary><div class="row"><label>Ficheiro</label><input id="c_m_path" type="text" placeholder="caminho para .mp3/.wav"></div><div class="row"><label>Ganho (0-1)</label><input id="c_m_gain" type="number" step="0.01" value="0.1"></div></details><details><summary>Thumbnail</summary><div class="row"><label>Kicker</label><input id="c_t_kicker" type="text" value="DARK · IA"></div><div class="row"><label>Palavras (array JSON)</label><input id="c_t_words" type="text" value='["O QUE ELES","NAO CONTAM"]'></div></details><div class="actions"><button class="ghost" id="c_cancel">Cancelar</button><button class="primary" id="c_submit">Enfileirar / Executar</button></div></div></div>
<div class="modal" id="smodal"><div class="mbox wide"><div class="mhead"><div class="t">Configurações do Radar</div><button class="mclose" id="sclose" aria-label="fechar">&times;</button></div><div class="mbody" id="sbody"><nav class="stabnav" id="stabnav"></nav><div class="stabpanels" id="stabpanels"></div><div class="actions"><button class="ghost" id="s_cancel">Cancelar</button><button class="primary" id="s_save">Salvar tudo</button></div></div></div>
<div class="toast" id="toast"></div>
<footer>Gerado localmente a partir de dados públicos (YouTube + Wikipedia). Miniaturas embutidas no ficheiro — não precisa de internet para ver o painel.<br>CTR/cliques é analytics privado do YouTube Studio e não existe em dados públicos: as métricas usam visualizações e cadência de publicação.<br>A amostra é uma amostra, não um censo.</footer>

<script>
// ============================================================================
// CLIENT-SIDE JS v2 — Robusto, Live, Funcional
// ============================================================================
var DATA = ${data};
var DAEMON_URL = 'http://127.0.0.1:8799';

var state = { cat: '__all__', q: '', sort: 'views', ai: 'all', format: 'all', autoRefresh: false };
var refreshTimer = null;
var queuePollTimer = null;
var isRefreshing = false;

function $(sel){ return document.querySelector(sel); }
function $$(sel){ return document.querySelectorAll(sel); }
function num(el,attr){ return Number(el.getAttribute(attr)||0); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&','<':'<','>':'>','"':'"',"'":'''}[m])); }
function toast(msg, type){ const t=$('#toast'); t.textContent=msg; t.className='toast '+(type||''); t.classList.add('on'); setTimeout(()=>t.classList.remove('on'), 3000); }
function showModal(id){ $('#'+id).classList.add('on'); }
function hideModal(id){ $('#'+id).classList.remove('on'); }

function numAttr(el,attr){ return Number(el.getAttribute(attr)||0); }

function matches(el){
  var okCat = state.cat === '__all__' || el.getAttribute('data-niche') === state.cat;
  var verdict = el.getAttribute('data-aiv');
  var okAi = state.ai === 'all' || (state.ai==='yes'?verdict==='ai':state.ai==='maybe'?verdict==='maybe':verdict==='human');
  var okFmt = state.format==='all' || (state.format==='has'?el.getAttribute('data-shorts')==='1':el.getAttribute('data-format')===state.format);
  return okCat && okAi && okFmt;
}

function applyFilter(){
  var q = state.q.toLowerCase();
  var shown=0, aiShown=0, maybeShown=0, shortsShown=0;
  $$('#grid .card').forEach(el=>{
    var okQ = !state.q || (el.getAttribute('data-search')||el.getAttribute('data-name')||'').toLowerCase().indexOf(state.q)>=0;
    var show = matches(el) && okQ;
    el.classList.toggle('hidden', !show);
    if(show){ shown++; var v=el.getAttribute('data-aiv'); if(v==='ai')aiShown++; else if(v==='maybe')maybeShown++; if(el.getAttribute('data-shorts')==='1')shortsShown++; }
  });
  $$('#tbody tr').forEach(r=>{ var okN=!state.q||(r.getAttribute('data-search')||r.getAttribute('data-name')||'').toLowerCase().indexOf(state.q)>=0; r.classList.toggle('hidden',!(matches(r)&&okN)); });
  $('#empty').style.display = shown?'none':'block';
  var sub=$('#subline'); if(sub){ sub.textContent = shown+' canais · '+sub.getAttribute('data-videos')+' vídeos · '+aiShown+' dark IA · '+maybeShown+' duvidosos · '+shortsShown+' shorts · '+sub.getAttribute('data-stamp'); }
  var tally=$('#tally'); if(tally) tally.textContent = shown+' visíveis · '+aiShown+' dark IA · '+maybeShown+' duvidosos · '+shortsShown+' shorts';
}

function sortAll(){
  var sortFn;
  if(state.sort==='name') sortFn=(a,b)=>a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
  else if(state.sort==='subs') sortFn=(a,b)=>Number(b.getAttribute('data-subs')||0)-Number(a.getAttribute('data-subs')||0);
  else if(state.sort==='avg') sortFn=(a,b)=>Number(b.getAttribute('data-avg')||0)-Number(a.getAttribute('data-avg')||0);
  else if(state.sort==='views') sortFn=(a,b)=>Number(b.getAttribute('data-views')||0)-Number(a.getAttribute('data-views')||0);
  else sortFn=(a,b)=>Number(b.getAttribute('data-v7')||0)-Number(a.getAttribute('data-v7')||0)||Number(b.getAttribute('data-views')||0)-Number(a.getAttribute('data-views')||0);
  var grid=$('#grid'); Array.from(grid.querySelectorAll('.card')).sort(sortFn).forEach(c=>grid.appendChild(c));
  var tbody=$('#tbody'); Array.from(tbody.querySelectorAll('tr')).sort((a,b)=>sortFn(a,b)).forEach(r=>tbody.appendChild(r));
}

// ---- REFRESH (chama daemon /refresh + recarrega página)
async function doRefresh(){
  if(isRefreshing) return;
  isRefreshing = true;
  const btn=$('#btnRefresh');
  const original = btn.innerHTML;
  btn.disabled=true; btn.innerHTML='⏳ Atualizando...'; btn.classList.add('loading');
  toast('🔄 Regenerando dashboard...');
  try{
    const resp = await fetch('http://127.0.0.1:8799/refresh', {method:'POST'});
    const data = await resp.json();
    if(data.ok){
      toast('✅ Dashboard regenerado — recarregando...','good');
      setTimeout(()=>location.reload(), 800);
    }else{
      throw new Error(data.error||'Falha no refresh');
    }
  }catch(e){
    console.error(e);
    toast('❌ Falha no refresh: '+e.message,'error');
    btn.disabled=false; btn.innerHTML='🔄 Atualizar agora'; btn.classList.remove('loading');
    isRefreshing=false;
  }
}

// ---- AUTO-REFRESH toggle
function setAutoRefresh(on){
  state.autoRefresh = on;
  $('#autoRefresh').checked = on;
  if(on){
    refreshTimer = setInterval(()=>{ if(!isRefreshing) doRefresh(); }, 30000);
    updateLastRefresh('Auto: ON (30s)');
  }else{
    if(refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    updateLastRefresh('Auto: OFF');
  }
}
function updateLastRefresh(msg){
  $('#lastRefresh').textContent = msg || 'Último: ' + new Date().toLocaleTimeString('pt-PT');
}

// ---- QUEUE POLLING (live queue status)
async function pollQueue(){
  try{
    const resp = await fetch('http://127.0.0.1:8799/queue');
    const data = await resp.json();
    // Could update a queue badge here if needed
  }catch(e){ /* silent */ }
  queuePollTimer = setTimeout(pollQueue, 5000);
}

// ---- MODALS
function showModal(id){ $('#'+id).classList.add('on'); }
function hideModal(id){ $('#'+id).classList.remove('on'); }

function openVideo(id){
  if(!id) return;
  $('#mtitle').textContent = 'youtube.com/watch?v='+id;
  $('#mplayer').innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  $('#mmeta').textContent = 'a reproduzir no painel';
  showModal('modal');
}
function closeModal(id){ $('#'+id).classList.remove('on'); if(id==='modal'){ $('#mplayer').innerHTML=''; } }

function openCloneModal(cl){
  const url = cl.getAttribute('data-url');
  const name = cl.getAttribute('data-clone');
  const id = cl.getAttribute('data-id');
  $('#c_url').value = url || '';
  $('#c_slug').value = 'clone-'+(name||'canal').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  $('#c_script').value = '';
  showModal('cmodal');
}

function submitClone(){
  const payload = {
    url: $('#c_url').value,
    params: {
      slug: $('#c_slug').value,
      script: $('#c_script').value || undefined,
      voice: { engine: $('#c_voice_engine').value, sapi: { voice: $('#c_voice_sapi').value } },
      video: { width: Number($('#c_v_w').value), height: Number($('#c_v_h').value), fps: Number($('#c_v_fps').value), crf: Number($('#c_v_crf').value) },
      cards: { headlineSize: Number($('#c_c_hsize').value), fontFamily: $('#c_c_font').value, palette: { bg: $('#c_c_bg').value, ink: $('#c_c_ink').value, accent: $('#c_c_accent').value } },
      motion: { kenBurns: { enabled: $('#c_kb_en').value==='true', from: Number($('#c_kb_from').value), to: Number($('#c_kb_to').value) } },
      transition: { type: $('#c_tx_type').value, seconds: Number($('#c_tx_sec').value) },
      music: { path: $('#c_m_path').value, gain: Number($('#c_m_gain').value) },
      thumbnail: { kicker: $('#c_t_kicker').value, words: JSON.parse($('#c_t_words').value||'[]') }
    }
  };
  if(!payload.url){ toast('❌ URL obrigatória','error'); return; }
  fetch('http://127.0.0.1:8799/clone', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(r=>r.json()).then(d=>{ if(d.ok){ toast('✅ Clone enfileirado: '+d.queued,'good'); hideModal('cmodal'); }else{ toast('❌ '+d.error,'error'); }})
    .catch(e=>{ toast('❌ Erro: '+e.message,'error'); });
}

// ============================================================================
// INIT
// ============================================================================
function init(){
  // Search
  $('#q').addEventListener('input',e=>{ state.q=e.target.value; applyFilter(); });
  // Sort
  $('#sort').addEventListener('change',e=>{ state.sort=e.target.value; sortAll(); applyFilter(); });
  // View toggle
  $('#vgrid').onclick=()=>{ $('#grid').classList.remove('hidden'); $('#tablewrap').classList.add('hidden'); $('#vgrid').classList.add('on'); $('#vtable').classList.remove('on'); };
  $('#vtable').onclick=()=>{ $('#grid').classList.add('hidden'); $('#tablewrap').classList.remove('hidden'); $('#vtable').classList.add('on'); $('#vgrid').classList.remove('on'); };
  // Chips (category)
  $('#filters').onclick=e=>{ var chip=e.target.closest('.chip'); if(!chip)return; state.cat=chip.getAttribute('data-cat'); $$('#filters .chip').forEach(c=>c.classList.toggle('on',c===chip)); applyFilter(); };
  // AI filter
  $('#qai').onclick=e=>{ var b=e.target.closest('button[data-ai]'); if(!b)return; state.ai=b.getAttribute('data-ai'); $$('#qai button').forEach(c=>c.classList.toggle('on',c===b)); applyFilter(); };
  // Format filter
  $('#qformat').onclick=e=>{ var b=e.target.closest('button[data-format]'); if(!b)return; state.format=b.getAttribute('data-format'); $$('#qformat button').forEach(c=>c.classList.toggle('on',c===b)); applyFilter(); };
  // Refresh button
  $('#btnRefresh').onclick = doRefresh;
  // Auto-refresh toggle
  $('#autoRefresh').onchange = e=>{ setAutoRefresh(e.target.checked); };
  // Settings modal
  $('#settingsBtn').onclick=()=>showModal('smodal');
  $('#s_cancel').onclick=()=>hideModal('smodal');
  // Clone modal
  $('#c_cancel').onclick=()=>hideModal('cmodal');
  $('#c_submit').onclick=submitClone;
  $('#c_cancel').onclick=()=>hideModal('cmodal');
  // Modals close on overlay click / ESC
  ['modal','cmodal','smodal'].forEach(id=>{ $('#'+id).onclick=e=>{ if(e.target.id===id) hideModal(id); } });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ ['modal','cmodal','smodal'].forEach(hideModal); } });
  // Body click delegation (video play, clone, open)
  document.body.onclick=e=>{
    var thumb=e.target.closest('.heroimg, .miniimg, .rowimg');
    if(thumb){ var id=thumb.getAttribute('data-id'); if(id) openVideo(id); return; }
    var cl=e.target.closest('[data-clone]'); if(cl){ doClone(cl); return; }
    var op=e.target.closest('[data-open]'); if(op){ window.open(op.getAttribute('data-open'),'_blank','noopener'); }
  };
  $('#mclose').onclick=()=>hideModal('modal');
  $('#mclone').onclick=()=>{ if(currentVideo) doClone('https://www.youtube.com/watch?v='+currentVideo.id, currentVideo.id, ''); };
  $('#cclose').onclick=()=>hideModal('cmodal');
  $('#sclose').onclick=()=>hideModal('smodal');
  $('#c_cancel').onclick=()=>hideModal('cmodal');
  $('#s_cancel').onclick=()=>hideModal('smodal');
  $('#c_submit').onclick=submitClone;

  // Initial
  applyFilter();
  sortAll();
  updateLastRefresh('Carregado: ' + new Date().toLocaleTimeString('pt-PT'));
  pollQueue();

  // Auto-refresh from saved preference (could persist to localStorage)
  // if(localStorage.getItem('autoRefresh')==='true'){ $('#autoRefresh').checked=true; setAutoRefresh(true); }
}

// Helpers
function $(sel){ return document.querySelector(sel); }
function $$(sel){ return document.querySelectorAll(sel); }
function numAttr(el,attr){ return Number(el.getAttribute(attr)||0); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&','<':'<','>':'>','"':'"',"'":'''}[m])); }
function numAttr(el,attr){ return Number(el.getAttribute(attr)||0); }
function toast(msg,type){ const t=$('#toast'); t.textContent=msg; t.className='toast '+(type||''); t.classList.add('on'); setTimeout(()=>t.classList.remove('on'),3000); }
function showModal(id){ $('#'+id).classList.add('on'); }
function hideModal(id){ $('#'+id).classList.remove('on'); }
function $(sel){ return document.querySelector(sel); }
function $$(sel){ return document.querySelectorAll(sel); }
function numAttr(el,attr){ return Number(el.getAttribute(attr)||0); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&','<':'<','>':'>','"':'"',"'":'''}[m])); }
function numAttr(el,attr){ return Number(el.getAttribute(attr)||0); }
function matches(el){ var okCat=state.cat==='__all__'||el.getAttribute('data-niche')===state.cat; var v=el.getAttribute('data-aiv'); var okAi=state.ai==='all'||(state.ai==='yes'?v==='ai':state.ai==='maybe'?v==='maybe':v==='human'); var okFmt=state.format==='all'||(state.format==='has'?el.getAttribute('data-shorts')==='1':el.getAttribute('data-format')===state.format); return okCat&&okAi&&okFmt; }
function applyFilter(){ var q=state.q.toLowerCase(); var shown=0,ai=0,maybe=0,shorts=0; $$('#grid .card').forEach(el=>{ var okQ=!state.q||(el.getAttribute('data-search')||el.getAttribute('data-name')||'').toLowerCase().indexOf(state.q)>=0; var show=matches(el)&&okQ; el.classList.toggle('hidden',!show); if(show){shown++; var v=el.getAttribute('data-aiv'); if(v==='ai')ai++; else if(v==='maybe')maybe++; if(el.getAttribute('data-shorts')==='1')shorts++; } }); $$('#tbody tr').forEach(r=>{var okN=!state.q||(r.getAttribute('data-search')||r.getAttribute('data-name')||'').toLowerCase().indexOf(state.q)>=0; r.classList.toggle('hidden',!(matches(r)&&okN)); }); $('#empty').style.display=shown?'none':'block'; var sub=$('#subline'); if(sub){sub.textContent=shown+' canais · '+sub.getAttribute('data-videos')+' vídeos · '+ai+' dark IA · '+maybe+' duvidosos · '+shorts+' shorts · '+sub.getAttribute('data-stamp')); } var tally=$('#tally'); if(tally) tally.textContent=shown+' visíveis · '+ai+' dark IA · '+maybe+' duvidosos · '+shorts+' shorts'; }
function matches(el){ var okCat=state.cat==='__all__'||el.getAttribute('data-niche')===state.cat; var v=el.getAttribute('data-aiv'); var okAi=state.ai==='all'||(state.ai==='yes'?v==='ai':state.ai==='maybe'?v==='maybe':v==='human'); var okFmt=state.format==='all'||(state.format==='has'?el.getAttribute('data-shorts')==='1':el.getAttribute('data-format')===state.format); return okCat&&okAi&&okFmt; }

document.addEventListener('DOMContentLoaded', init);

</script></body></html>`;

  // ---- write
  fs.writeFileSync(path.join(OUT,'index.html'), html, 'utf8');
  const kb = Math.round(Buffer.byteLength(html)/1024);
  console.log('dashboard: '+path.join(OUT,'index.html'));
  console.log('canais: '+channels.length+'  vídeos: '+totalVideos);
  console.log('miniaturas: '+thumbs.size+' embutidas, '+thumbFailed+' falharam, '+idList.length+' ids');
  console.log('tamanho: '+kb+' KB (ficheiro único)');
  console.log('categorias: '+JSON.stringify(catCounts));
  console.log('dark (IA): '+darkCount+' canais 100% IA, '+darkMaybe+' duvidosos, '+channels.filter(c=>c.shortsActive).length+' com shorts');
  if(thumbs.size===0&&!NO_EMBED) console.log('AVISO: nenhuma miniatura embutida — o painel vai mostrar marcadores.');
}

// ---- helpers (same as before)
function thumbBox(id,extraClass,inner){ const cls=id?'th_'+String(id).replace(/[^A-Za-z0-9_-]/g,''):'th_none'; return '<div class="ph '+cls+(extraClass?' '+extraClass:'')+'"'+(id?' data-id="'+esc(id)+'"':'')+'>'+(inner||'')+'</div>'; }
function initial(name){ return esc(String(name||'?').trim().charAt(0).toUpperCase()||'?'); }
function aiBadge(c,inline){ const why=(c.aiReasons||[]).join(' · '); const score=c.aiScore||0; const max=c.aiThreshold||c.aiMax||6; const attr=' title="'+esc('IA '+score+'/'+max+(why?' — '+why:''))+'"'; if(c.ai)return'<span class="pill dark"'+attr+'>DARK IA '+score+'/'+max+'</span>'; if(c.aiVerdict==='maybe')return'<span class="pill maybe"'+attr+'>IA? '+score+'/'+max+'</span>'; return inline?'':''; }

main();
`;

// Write the new yt-dashboard.mjs
fs.writeFileSync(path.join(__dirname, 'yt-dashboard.mjs'), newContent, 'utf8');
console.log('✅ yt-dashboard.mjs atualizado para v2 (robusto, live, funcional)');