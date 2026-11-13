#!/usr/bin/env node
/**
 * Fusão de canais — pega em 2 ou 3 canais que bombam e produz um TERCEIRO nosso.
 *
 * Não copia nenhum deles: mede o que os dois têm em comum, mistura os ângulos e pede
 * um guião original que só existe porque os dois foram cruzados.
 *
 *   node .artcraft\yt-merge.mjs --channels "UCxxx,UCyyy" [--channels "UCzzz"]
 *                               [--scenes 5] [--lang pt-BR]
 *                               [--out work\clones\merged]
 *
 * Saída:
 *   <out>\merged.recipe.json   — formato combinado (duração, ritmo, nichos, paleta)
 *   <out>\script.json          — guião pronto para yt-clone-build.mjs --script
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createClassifier } from './yt-classify.mjs';

const CC = 'D:\\CRAFT';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

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

const CHANNELS = argAll('channels').flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
const SCENES = Number(arg('scenes', '5'));
const LANG = arg('lang', 'pt-BR');
const OUT_DIR = arg('out', path.join(CC, 'work', 'clones', 'merged-' + Date.now()));

if (CHANNELS.length < 2) {
  console.error('precisas de pelo menos 2 canais:\n  node .artcraft\\yt-merge.mjs --channels "UC1,UC2"');
  process.exit(2);
}

const TAXONOMY = path.join(CC, 'taxonomy.json');
const classifier = createClassifier(TAXONOMY);

// ---------------------------------------------------------------- dados dos canais
const SAMPLE_PATHS = [
  path.join(CC, 'work', 'research', 'run1', 'channels.json'),
  path.join(CC, 'work', 'research', 'run-dark', 'channels.json'),
  path.join(CC, 'work', 'research', 'run-shorts3', 'channels.json'),
];

const scanPath = path.join(CC, 'work', 'research', 'channel-scan.json');
const scan = fs.existsSync(scanPath) ? (JSON.parse(fs.readFileSync(scanPath, 'utf8')).channels || {}) : {};

// videos por canal: sem eles o classificador nao tem sinal e tudo cai em "Outro"
const VIDEOS_BY_CHANNEL = new Map();
for (const pth of SAMPLE_PATHS) {
  if (!fs.existsSync(pth)) continue;
  const data = JSON.parse(fs.readFileSync(pth, 'utf8'));
  for (const v of data.videos || []) {
    const k = v.channel_id || v.channel;
    if (!k) continue;
    if (!VIDEOS_BY_CHANNEL.has(k)) VIDEOS_BY_CHANNEL.set(k, []);
    VIDEOS_BY_CHANNEL.get(k).push(v);
  }
}

function loadChannel(id) {
  for (const p of SAMPLE_PATHS) {
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const c of data.channels || []) {
      if ((c.channel_id || c.channel) === id) return c;
    }
  }
  return null;
}

const picked = [];
for (const id of CHANNELS) {
  const c = loadChannel(id) || { channel_id: id, channel: id };
  const vids = VIDEOS_BY_CHANNEL.get(id) || [];
  const v = classifier.verdictOf(c, vids, scan[id] || null);
  picked.push({
    id,
    name: c.channel || id,
    subs: c.subs || null,
    avgViews: c.avgViews || 0,
    avgDuration: c.avgDuration || 0,
    cadence: c.rssVideosInWindow || 0,
    shortsShare: c.shortsShare || 0,
    niche: v.label,
    nicheId: v.niche,
    ai: v.ai,
    aiVerdict: v.aiVerdict,
    description: (scan[id] && scan[id].description) || '',
    shorts: (scan[id] && scan[id].shorts) || 0,
  });
}

// ---------------------------------------------------------------- receita combinada
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const durations = picked.map((p) => p.avgDuration).filter((d) => d > 0);
const cadences = picked.map((p) => p.cadence).filter((d) => d > 0);
const shortsShares = picked.map((p) => p.shortsShare);

const targetDuration = Math.max(35, Math.min(60, Math.round(avg(durations) || 45)));
const vertical = true;
const isShorty = avg(shortsShares) >= 0.5;
const cutStyle = targetDuration <= 35 ? 'cortes rapidos com gancho de 2s' : 'plano de apresentador com cortes de apoio';
const sceneSeconds = Math.max(4, Math.round(targetDuration / SCENES));

const niches = [...new Set(picked.map((p) => p.niche))];
const aiShare = picked.filter((p) => p.ai).length;

const recipe = {
  generatedAt: new Date().toISOString(),
  kind: 'merged',
  sources: picked.map((p) => ({ id: p.id, name: p.name, niche: p.niche, subs: p.subs, ai: p.ai })),
  merged: {
    duration: targetDuration,
    scenes: SCENES,
    sceneSeconds,
    shape: vertical ? 'vertical (9:16)' : 'horizontal (16:9)',
    cutStyle,
    format: isShorty ? 'shorts dominante' : 'longo curto',
    niches,
    aiShare,
    cadencePerWeek: Math.round(avg(cadences) || 0),
  },
  notes: [
    'A fonte e a estrutura, nunca o texto: nenhum trecho e copiado dos canais originais.',
    'Duracao e ritmo sao a media medida dos canais de origem.',
    'O cruzamento de nichos e o que torna este canal original: ' + niches.join(' × '),
  ],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'merged.recipe.json'), JSON.stringify(recipe, null, 2) + '\n', 'utf8');

// ---------------------------------------------------------------- guião cruzado
const [nA, nB] = [niches[0], niches[1] || niches[0]];
const topic =
  `Tema: um video original que junta o universo de ${nA} com o de ${nB}. ` +
  `Publico: quem gosta de ${nA} e tambem de ${nB}. ` +
  `Escolhe TU um assunto concreto dentro desse cruzamento e escreve sobre o ASSUNTO. ` +
  `Duracao alvo ${targetDuration}s em ${SCENES} cenas. ` +
  `PROIBIDO: mencionar nomes de canais, falar de "fusao", "cruzamento", "formato" ou do processo de criar o video. ` +
  `PROIBIDO inventar estatisticas, estudos ou casos reais. Se precisares de um exemplo, descreve-o como cenario.`;

console.log('canais   : ' + picked.map((p) => p.name + ' [' + p.niche + ']').join(' + '));
console.log('receita  : ' + targetDuration + 's · ' + SCENES + ' cenas · ' + cutStyle);
console.log('nicho    : ' + niches.join(' × '));
console.log('');

const scriptOut = path.join(OUT_DIR, 'script.json');
const child = spawn(process.execPath, [
  path.join(HERE, 'yt-script.mjs'),
  '--topic', topic,
  '--scenes', String(SCENES),
  '--lang', LANG,
  '--out', scriptOut,
], { stdio: 'inherit' });

child.on('close', (code) => {
  if (code !== 0) {
    console.error('o gerador de guiao falhou (codigo ' + code + ')');
    process.exit(code || 1);
  }
  console.log('');
  console.log('receita  : ' + path.join(OUT_DIR, 'merged.recipe.json'));
  console.log('guiao    : ' + scriptOut);
  console.log('');
  console.log('proximo  :');
  console.log('  node .artcraft\\yt-clone-build.mjs --slug merged --script "' + scriptOut + '"');
});
