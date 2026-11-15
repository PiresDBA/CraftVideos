#!/usr/bin/env node
/**
 * ArtCraft YT Dashboard - regression audit.
 *
 * Runs the checks that actually caught the last two production bugs:
 *   1. the inline browser script must parse (a stray "\n" in the generator's
 *      template literal silently killed EVERY function on the page)
 *   2. every function/element the UI depends on must exist
 *   3. the daemon must expose the endpoints the UI calls
 *   4. the dataset must classify Shorts by duration (<= 180s)
 *
 * Usage:
 *   node .artcraft/yt-audit.mjs [--port 8799]
 * Exit code 0 = all green, 1 = at least one failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = 'D:\\CRAFT';
const DASH = path.join(ROOT, 'work', 'research', 'dashboard', 'index.html');
const DATA = path.join(ROOT, 'work', 'research', 'dashboard', 'data.json');
const PORT = Number((process.argv.find(a => a.startsWith('--port=')) || '--port=8799').split('=')[1]);

let failures = 0;
let checks = 0;

function ok(label, extra = '') {
  checks++;
  console.log('  \u2713 ' + label + (extra ? '  \u2014 ' + extra : ''));
}
function fail(label, extra = '') {
  checks++;
  failures++;
  console.log('  \u2717 ' + label + (extra ? '  \u2014 ' + extra : ''));
}
function section(t) {
  console.log('\n' + t);
}

function get(urlPath) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: urlPath, method: 'GET' },
      (res) => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
      }
    );
    req.on('error', e => resolve({ status: 0, body: '', headers: {}, error: e.message }));
    req.end();
  });
}

console.log('=== ArtCraft YT Dashboard - auditoria ===');

// ---------------------------------------------------------------- 1. HTML
section('1. Arquivo gerado');
if (!fs.existsSync(DASH)) {
  fail('index.html existe', 'rode: node .artcraft/yt-dashboard.mjs');
} else {
  const size = fs.statSync(DASH).size;
  ok('index.html existe', size + ' bytes');

  const html = fs.readFileSync(DASH, 'utf8');

  // --- inline script must parse -------------------------------------------
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!scripts.length) {
    fail('existe script inline', 'nenhum <script> encontrado');
  } else {
    let broken = null;
    scripts.forEach((js, i) => {
      if (broken) return;
      try { new Function(js); } catch (e) { broken = { i, msg: e.message }; }
    });
    if (broken) {
      fail('script inline compila (parse JS)', 'script[' + broken.i + ']: ' + broken.msg);
    } else {
      ok('script inline compila (parse JS)', scripts.length + ' tag(s)');
    }
  }

  // --- required functions --------------------------------------------------
  const required = [
    'function setFilter', 'function applyFilters', 'function openVideoModal',
    'function cloneFromCard', 'function cloneThisVideo', 'function createClone',
    'function startCloneJobReal', 'function pollCloneStatus', 'function renderCloneTelemetry',
    'function startCollectTargets', 'function showToast', 'function extractYouTubeId',
  ];
  const missingFn = required.filter(fn => !html.includes(fn));
  if (missingFn.length) fail('funcoes obrigatorias presentes', 'faltando: ' + missingFn.join(', '));
  else ok('funcoes obrigatorias presentes', required.length + ' funcoes');

  // --- required elements ---------------------------------------------------
  const requiredIds = [
    'telemetryPanel', 'tmDot', 'tmTitle', 'tmStatus', 'tmJobId', 'tmClock',
    'tmBar', 'tmPct', 'tmElapsed', 'tmEta', 'tmSteps', 'tmCurrent',
    'tmProject', 'tmOutput', 'tmStepCount', 'tmTimeline', 'tmLog', 'tmArtifacts',
    'collectBtn', 'collectStatus',
    'videoModal', 'modalVideoIframe', 'cloneName', 'sourceVideo', 'referenceVideo',
  ];
  const missingIds = requiredIds.filter(id => !html.includes('id="' + id + '"'));
  if (missingIds.length) fail('elementos do DOM presentes', 'faltando: ' + missingIds.join(', '));
  else ok('elementos do DOM presentes', requiredIds.length + ' ids');

  // --- filter buttons wired ------------------------------------------------
  const ctypeBtns = (html.match(/data-filter-type="ctype"/g) || []).length;
  const catBtns = (html.match(/data-filter-type="cat"/g) || []).length;
  const audBtns = (html.match(/data-filter-type="aud"/g) || []).length;
  const onclickFilter = (html.match(/onclick="setFilter\(/g) || []).length;
  if (ctypeBtns >= 3 && catBtns >= 2 && audBtns >= 3 && onclickFilter >= 8) {
    ok('botoes de filtro com onclick', 'ctype=' + ctypeBtns + ' cat=' + catBtns + ' aud=' + audBtns);
  } else {
    fail('botoes de filtro com onclick',
      'ctype=' + ctypeBtns + ' cat=' + catBtns + ' aud=' + audBtns + ' onclick=' + onclickFilter);
  }

  // --- cards carry the filter attributes ----------------------------------
  const cards = (html.match(/class="channel-card"/g) || []).length;
  const withCtype = (html.match(/data-ctype="/g) || []).length;
  const withCat = (html.match(/data-cat="/g) || []).length;
  const withAud = (html.match(/data-aud="/g) || []).length;
  const cloneBtns = (html.match(/cloneFromCard\(/g) || []).length;
  if (cards > 0 && withCtype === cards && withCat === cards && withAud === cards) {
    ok('cards com data-ctype/cat/aud', cards + ' cards');
  } else {
    fail('cards com data-ctype/cat/aud', 'cards=' + cards + ' ctype=' + withCtype + ' cat=' + withCat + ' aud=' + withAud);
  }
  if (cloneBtns >= cards) ok('botao Clonar em cada card', cloneBtns + ' botoes');
  else fail('botao Clonar em cada card', cloneBtns + ' para ' + cards + ' cards');

  // --- no raw newline inside a quoted JS string ---------------------------
  const js = scripts[0] || '';
  const jsLines = js.split('\n');
  let brokenStr = null;
  for (let i = 0; i < jsLines.length; i++) {
    const l = jsLines[i];
    if (/\breplace\(/.test(l)) continue;              // regex literals confuse the heuristic
    const singles = (l.match(/'/g) || []).length;
    if (singles % 2 === 1) { brokenStr = { line: i + 1, text: l.trim().slice(0, 90) }; break; }
  }
  if (brokenStr) fail('nenhuma string quebrada no JS inline', 'linha ' + brokenStr.line + ': ' + brokenStr.text);
  else ok('nenhuma string quebrada no JS inline');
}

// ---------------------------------------------------------------- 2. dataset
section('2. Base de dados');
if (!fs.existsSync(DATA)) {
  fail('data.json existe', 'rode: node .artcraft/yt-build-dataset.mjs');
} else {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const videos = data.videos || [];
  ok('data.json carrega', videos.length + ' videos');

  const shorts = videos.filter(v => v.isShort === true);
  const badShorts = shorts.filter(v => Number(v.duration || 0) > 180);
  if (badShorts.length === 0) ok('Shorts classificados por duracao (<=180s)', shorts.length + ' shorts');
  else fail('Shorts classificados por duracao (<=180s)', badShorts.length + ' shorts com duracao > 180s');

  const longMarkedShort = videos.filter(v => v.isShort === true && Number(v.duration || 0) > 180);
  if (!longMarkedShort.length) ok('nenhum video longo marcado como short');
  else fail('nenhum video longo marcado como short', longMarkedShort.length + ' casos');
}

// ---------------------------------------------------------------- 3. daemon
section('3. Servidor local (porta ' + PORT + ')');
const health = await get('/health');
if (health.status === 200) {
  ok('GET /health', health.body.replace(/\s+/g, ' ').slice(0, 90));
} else {
  fail('GET /health', health.error || ('HTTP ' + health.status) + ' - o servidor esta rodando?');
}

const cloneActive = await get('/clone/active');
if (cloneActive.status === 200) ok('GET /clone/active');
else fail('GET /clone/active', 'HTTP ' + cloneActive.status);

const cloneStatus = await get('/clone/status?id=probe');
if (cloneStatus.status === 404 || cloneStatus.status === 200) ok('GET /clone/status', 'rota existe');
else fail('GET /clone/status', 'HTTP ' + cloneStatus.status);

const collectStatus = await get('/collect-targets/status');
if (collectStatus.status === 200) ok('GET /collect-targets/status');
else fail('GET /collect-targets/status', 'HTTP ' + collectStatus.status);

// --- anti-cache headers (a stale page kills every button) --------------------
const page = await get('/');
if (page.status === 200) {
  const cc = (page.headers['cache-control'] || '').toLowerCase();
  const hasNoStore = cc.includes('no-store') || cc.includes('no-cache');
  if (hasNoStore) ok('headers anti-cache no HTML', page.headers['cache-control']);
  else fail('headers anti-cache no HTML', 'cache-control=' + (page.headers['cache-control'] || '(ausente)') + ' - o browser pode servir pagina velha');

  const servedScripts = [...page.body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let servedBroken = null;
  servedScripts.forEach((js, i) => {
    if (servedBroken) return;
    try { new Function(js); } catch (e) { servedBroken = 'script[' + i + ']: ' + e.message; }
  });
  if (servedBroken) fail('script servido pelo servidor compila', servedBroken);
  else ok('script servido pelo servidor compila', servedScripts.length + ' tag(s)');
} else {
  fail('HTML servido pelo daemon', 'HTTP ' + page.status);
}

// ---------------------------------------------------------------- resultado
console.log('\n=== RESULTADO ===');
console.log('  verificacoes: ' + checks + ' | falhas: ' + failures);
if (failures === 0) {
  console.log('  TUDO OK - sistema pronto para uso.');
  process.exit(0);
} else {
  console.log('  FALHAS ENCONTRADAS - corra antes de usar.');
  process.exit(1);
}
