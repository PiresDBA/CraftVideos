/**
 * Gera MASTER_STUDIO.html a partir de studio.catalog.json.
 * Visual e clicável: o catálogo é a verdade, o HTML é só a vista.
 *
 * Uso: node .artcraft\studio-panel.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const CC = 'D:\\CRAFT';
const cat = JSON.parse(fs.readFileSync(path.join(CC, 'studio.catalog.json'), 'utf8'));
const OUT = path.join(CC, 'MASTER_STUDIO.html');

const ICON = {
  video: '🎬', voz: '🎙️', audio: '🎚️', motion: '✨', '3d': '🧊', avatar: '🐶',
  geracao: '🎨', captura: '🖥️', design: '🎛️', infra: '⚙️', outro: '📦',
};
const LABEL = {
  motion: 'MOTION & ANIMAÇÃO', geracao: 'GERAÇÃO DE IMAGEM/VÍDEO', '3d': '3D',
  voz: 'VOZ', avatar: 'AVATARES', video: 'VÍDEO', design: 'DESIGN',
  audio: 'ÁUDIO & MÚSICA', captura: 'CAPTURA DE ECRÃ', infra: 'INFRA', outro: 'OUTROS',
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const byCat = {};
for (const s of cat.skills) (byCat[s.category] = byCat[s.category] || []).push(s);

const cats = Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length);

const skillCard = (s) => `<div class="card" data-search="${esc((s.id + ' ' + s.description + ' ' + s.category).toLowerCase())}">
  <div class="ctop"><span class="dot ${s.enabled ? 'on' : 'off'}"></span><b>${esc(s.name || s.id)}</b></div>
  <p>${esc((s.description || 'sem descrição').slice(0, 120))}</p>
</div>`;

const catBlock = (c) => `<section class="cat">
  <h3><span class="ico">${ICON[c] || '•'}</span>${LABEL[c] || c.toUpperCase()}<span class="n">${byCat[c].length}</span></h3>
  <div class="grid">${byCat[c].map(skillCard).join('')}</div>
</section>`;

const appCard = (a) => `<div class="app">
  <div class="aname">${esc(a.name)}</div>
  <div class="adesc">${esc(a.description)}</div>
  <div class="abadge">${a.enabled ? '● instalado' : '○ ausente'} · ${esc(a.category)}</div>
</div>`;

const pipeRows = cat.pipelines.map((p) => `<tr><td><b>${esc(p.id)}</b></td><td>${esc((p.description || '').slice(0, 110))}</td><td class="tag">${esc(p.category)}</td></tr>`).join('');

const compChips = cat.compositions.map((c) => `<span class="chip">${esc(c.id)}</span>`).join('');

const voiceRows = cat.voice.providers.map((v) => {
  const ok = v.state.includes('pronto');
  return `<tr><td><b>${esc(v.id)}</b></td><td><span class="dot ${ok ? 'on' : 'off'}"></span>${esc(v.state)}</td><td>${v.key ? 'precisa chave' : 'sem chave'}</td></tr>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Master Studio</title>
<style>
:root{--bg:#08090d;--card:#12141c;--line:#242a38;--ink:#f2f4f8;--dim:#8b94a8;--green:#3ecf8e;--amber:#f5b73d;--red:#e04848;--blue:#4aa8ff}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(900px 500px at 8% -8%,rgba(224,72,72,.13),transparent 60%),radial-gradient(800px 500px at 96% 4%,rgba(74,168,255,.1),transparent 55%),var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,"Segoe UI",Inter,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:34px 20px 70px}
h1{font-size:clamp(30px,5vw,52px);margin:0;letter-spacing:-.03em;font-weight:800;text-align:center}
h1 span{color:var(--red)}
.sub{text-align:center;color:var(--dim);margin:10px 0 26px}
.totals{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:10px}
.pill{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 18px;font-size:13px;color:var(--dim)}
.pill b{color:var(--ink);font-size:18px;margin-right:6px}
input#q{display:block;margin:24px auto;width:min(560px,100%);background:var(--card);border:1px solid var(--line);color:var(--ink);padding:12px 18px;border-radius:12px;font:inherit}
h2{font-size:22px;margin:44px 0 14px;letter-spacing:-.02em}
.cat{margin-bottom:26px}
.cat h3{font-size:15px;letter-spacing:.06em;margin:0 0 10px;color:var(--ink);display:flex;align-items:center;gap:10px}
.cat h3 .ico{font-size:20px}
.cat h3 .n{margin-left:auto;color:var(--dim);font-weight:600;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:9px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 13px}
.card .ctop{display:flex;align-items:center;gap:8px;font-size:13.5px}
.card p{margin:6px 0 0;color:var(--dim);font-size:12.5px;line-height:1.42}
.dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px;display:inline-block;margin-right:6px}
.dot.on{background:var(--green);box-shadow:0 0 9px var(--green)}
.dot.off{background:#4a5266}
.apps{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:11px}
.app{background:linear-gradient(160deg,#171a24,#12141c);border:1px solid var(--line);border-radius:14px;padding:15px}
.aname{font-weight:800;font-size:16px}
.adesc{color:var(--dim);font-size:12.5px;margin:6px 0 10px;min-height:34px}
.abadge{font-size:11px;color:var(--green);background:rgba(62,207,142,.1);border:1px solid rgba(62,207,142,.3);display:inline-block;padding:3px 9px;border-radius:999px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--dim);font-weight:600;font-size:12px;letter-spacing:.05em}
.tag{color:var(--dim);font-size:12px;white-space:nowrap}
.chip{display:inline-block;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 11px;margin:0 6px 6px 0;font-size:12.5px}
.hide{display:none}
footer{margin-top:52px;text-align:center;color:var(--dim);font-size:12.5px;border-top:1px solid var(--line);padding-top:20px}
</style></head><body><div class="wrap">
<h1>MASTER <span>STUDIO</span></h1>
<p class="sub">Tudo o que temos, num só sítio · ${cat.totals.skills} skills · ${cat.totals.apps} apps · ${cat.totals.pipelines} pipelines · ${cat.totals.compositions} composições</p>
<div class="totals">
  <div class="pill"><b>${cat.totals.apps}</b>apps locais</div>
  <div class="pill"><b>${cat.totals.skills}</b>skills</div>
  <div class="pill"><b>${cat.totals.pipelines}</b>pipelines</div>
  <div class="pill"><b>${cat.totals.compositions}</b>composições</div>
  <div class="pill"><b>${cat.totals.modules}</b>módulos nossos</div>
</div>
<input id="q" type="search" placeholder="procurar competência, ex: video, tts, avatar, motion…">

<h2>As máquinas locais</h2>
<div class="apps">${cat.apps.map(appCard).join('')}</div>

<h2>Skills por área</h2>
${cats.map(catBlock).join('')}

<h2>Pipelines do OpenMontage</h2>
<table><thead><tr><th>Pipeline</th><th>O que faz</th><th>Categoria</th></tr></thead><tbody>${pipeRows}</tbody></table>

<h2>Composições Remotion</h2>
<div>${compChips}</div>

<h2>Voz (VoiceCraft)</h2>
<table><thead><tr><th>Provedor</th><th>Estado</th><th>Chave</th></tr></thead><tbody>${voiceRows}</tbody></table>

<footer>Gerado de <b>studio.catalog.json</b> · ${new Date(cat.generatedAt).toLocaleString('pt-PT')}<br>
Actualizar: <b>node .artcraft\\studio-catalog.mjs</b> e depois <b>node .artcraft\\studio-panel.mjs</b></footer>
</div>
<script>
var q = document.getElementById('q');
q.addEventListener('input', function(){
  var v = this.value.toLowerCase().trim();
  document.querySelectorAll('.card').forEach(function(c){
    var hay = c.getAttribute('data-search') || '';
    c.classList.toggle('hide', v && hay.indexOf(v) < 0);
  });
  document.querySelectorAll('.cat').forEach(function(section){
    var visiveis = section.querySelectorAll('.card:not(.hide)').length;
    section.classList.toggle('hide', v && visiveis === 0);
  });
});
</script></body></html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('painel: ' + OUT + '  ' + Math.round(Buffer.byteLength(html) / 1024) + ' KB');
console.log('  skills: ' + cat.skills.length + ' · apps: ' + cat.apps.length + ' · pipelines: ' + cat.pipelines.length);
