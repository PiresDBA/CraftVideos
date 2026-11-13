#!/usr/bin/env node
/**
 * yt-edl.mjs — ritmo da referencia -> guiao de planos (A7 da AUDITORIA_CLONE).
 *
 * O pipeline actual desenha uma cena por bloco de narracao: 4 cenas de ~12 s = 4 cortes.
 * A referencia medida (yccXYW5liLE) tem 33 planos, mediana 1,8 s, 31,9 cortes/min. Nenhuma
 * quantidade de tipografia corrige um ritmo que nao existe.
 *
 * Este script fecha essa lacuna sem tocar no pipeline: le os planos medidos e escreve um
 * `plan.json` que o `yt-clone-build.mjs` ja sabe consumir, porque cada cena pode trazer
 * `seconds`, `layout`, `splitRatio` e `textSide` (capacidades A2/A4 ja existentes).
 *
 * Fonte de geometria: shots-merged.json (cortes + S3FD + classificacao por plano).
 * Nao uses anatomy.json para splitLine: o detetor de apresentador desse ficheiro devolve
 * y0~0 em 23 dos 33 planos, o que poe a costura no topo do frame. Mediana real: 0,572.
 *
 * Algoritmo:
 *   1. planos com menos de --min-shot segundos fundem-se no plano seguinte (0,1 s nao
 *      podes renderizar sem parecer um flash; o conteudo visual desse plano perde-se)
 *   2. cada plano vira uma cena: `seconds` = duracao medida, `layout` = tipo do plano,
 *      `splitRatio` = splitLine medido, `textSide` = lado do texto medido
 *   3. a narracao de cada cena-mae e' dividida pelos planos filhos, por palavras e em
 *      fronteiras de pontuacao, proporcional a duracao de cada plano
 *
 * Usage:
 *   node yt-edl.mjs [--ref work\reference\ref5] [--shots shots-merged.json]
 *                   [--script cenas.json] [--out plan.json]
 *                   [--min-shot 1.0] [--max-beats 40]
 *                   [--narration split|first|none] [--check]
 */

import fs from 'node:fs';
import path from 'node:path';

const CC = 'D:\\CRAFT';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const FLAG = (name) => process.argv.includes('--' + name);

const REF_DIR = arg('ref', path.join(CC, 'work', 'reference', 'ref5'));
const SHOTS_FILE = arg('shots', path.join(REF_DIR, 'shots-merged.json'));
const SCRIPT_FILE = arg('script', '');
const CONFIG_FILE = arg('config', path.join(CC, 'clone.config.json'));
const OUT = arg('out', path.join(REF_DIR, 'plan.json'));
const MIN_SHOT = Number(arg('min-shot', '1.0'));
const MAX_BEATS = Number(arg('max-beats', '40'));
const NARRATION = String(arg('narration', 'split')).toLowerCase();
const CHECK = FLAG('check');

// ---------------------------------------------------------------- load

function readJson(file, what) {
  if (!fs.existsSync(file)) throw new Error(what + ' nao encontrado: ' + file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Normalise both metro sources into one shot shape. */
function loadShots() {
  const data = readJson(SHOTS_FILE, 'planos medidos');
  const merged = Array.isArray(data.shots) ? data.shots : [];
  if (!merged.length) throw new Error('sem planos em ' + SHOTS_FILE);

  return merged.map((s, i) => {
    const layout = s.layout || (s.kind === 'talking-head' ? 'split' : 'full-graphic');
    // anatomy.json has no `layout`: derive it, and flag it as the weaker source.
    const derived = !s.layout;
    const hasFace = s.hasFace != null ? !!s.hasFace : !!s.presenter;
    return {
      index: Number(s.shot || s.index || i + 1),
      start: Number(s.start != null ? s.start : 0),
      seconds: Math.max(0.04, Number(s.seconds || 0)),
      layout,
      splitLine: s.splitLine != null ? Number(s.splitLine) : null,
      headlineSide: s.headlineSide || 'fundo',
      headlineY: s.headlineY != null ? Number(s.headlineY) : null,
      hasFace,
      derived,
    };
  });
}

function loadScript() {
  if (SCRIPT_FILE) {
    const data = readJson(SCRIPT_FILE, 'guiao');
    return { scenes: data.scenes || [], source: SCRIPT_FILE, kicker: data.kicker || '' };
  }
  const cfg = readJson(CONFIG_FILE, 'config');
  return { scenes: cfg.script?.scenes || [], source: CONFIG_FILE, kicker: cfg.script?.kicker || '' };
}

// ---------------------------------------------------------------- beats

/**
 * Fold shots shorter than `minShot` into the next one.
 *
 * The reference has 4 shots of 0,1-0,2 s. At 30 fps that is 3-6 frames: physically
 * renderable, visually a flash, and it would force a FigCraft card, a TTS call and an
 * ffmpeg run for 6 frames. Folding them forward keeps the total duration honest and
 * moves the cut to where the eye can see it.
 */
function foldShots(shots, minShot) {
  const beats = [];
  let carry = 0;
  for (const s of shots) {
    const seconds = s.seconds + carry;
    carry = 0;
    if (seconds < minShot) {
      carry = seconds;
      continue;
    }
    beats.push(Object.assign({}, s, { seconds }));
  }
  if (carry > 0) {
    if (beats.length) beats[beats.length - 1].seconds += carry;
    else beats.push(Object.assign({}, shots[shots.length - 1], { seconds: carry }));
  }
  return beats;
}

/** Too many beats is as bad as too few: merge the shortest adjacent pair until it fits. */
function capBeats(beats, maxBeats) {
  const out = beats.slice();
  while (out.length > maxBeats && out.length > 2) {
    let at = 0;
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i].seconds + out[i + 1].seconds < out[at].seconds + out[at + 1].seconds) at = i;
    }
    out[at] = Object.assign({}, out[at], { seconds: out[at].seconds + out[at + 1].seconds, mergedWith: (out[at].mergedWith || 0) + 1 });
    out.splice(at + 1, 1);
  }
  return out;
}

// ---------------------------------------------------------------- narration split

/**
 * Split one narration into k chunks at word boundaries, proportional to `weights`.
 * Prefers to break after punctuation so a chunk does not end mid-clause.
 */
function splitNarration(text, weights) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const k = weights.length;
  if (!k) return [];
  if (!words.length) return new Array(k).fill('');
  if (words.length < k) {
    // fewer words than shots: the first shot speaks, the rest stay silent (the video
    // still cuts on the reference rhythm, which is the point of the EDL).
    return weights.map((_, i) => (i === 0 ? words.join(' ') : ''));
  }

  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const bounds = [0];
  let acc = 0;
  for (let i = 0; i < k - 1; i++) {
    acc += weights[i];
    let cut = Math.round(words.length * (acc / total));
    // snap to punctuation within +-2 words, never behind the previous cut
    cut = Math.max(bounds[bounds.length - 1] + 1, Math.min(words.length - (k - 1 - i), cut));
    let best = cut;
    for (let d = 1; d <= 2; d++) {
      if (cut + d < words.length && /[,;:!?]$/.test(words[cut + d - 1])) { best = cut + d; break; }
      if (cut - d > bounds[bounds.length - 1] && /[,;:!?]$/.test(words[cut - d - 1])) { best = cut - d; break; }
    }
    bounds.push(best);
  }
  bounds.push(words.length);
  const chunks = [];
  for (let i = 0; i < k; i++) chunks.push(words.slice(bounds[i], bounds[i + 1]).join(' '));
  return chunks;
}

/** Give every beat a parent scene, proportional to how much each scene has to say. */
function assignParents(beats, scenes) {
  const S = scenes.length;
  const B = beats.length;
  const weights = scenes.map((s) => Math.max(1, String(s.narration || s.text || '').split(/\s+/).filter(Boolean).length));
  const total = weights.reduce((a, b) => a + b, 0);
  const out = [];
  let acc = 0;
  for (let i = 0; i < B; i++) {
    // which scene owns this beat's start position on the timeline
    const pos = (i + 0.5) / B;
    let cum = 0;
    let owner = S - 1;
    for (let j = 0; j < S; j++) {
      cum += weights[j] / total;
      if (pos <= cum + 1e-9) { owner = j; break; }
    }
    acc++;
    out.push(owner);
  }
  // guarantee each scene owns at least one beat when there are enough beats
  if (B >= S) {
    for (let j = 0; j < S; j++) if (!out.includes(j)) out[j % B] = j;
  }
  return out;
}

const SIDE = { fundo: 'bottom', meio: 'mid', topo: 'top' };

/**
 * Enquadramentos por plano.
 *
 * Um corte so existe se a imagem mudar. Medido no primeiro EDL: 26 clipes na timeline,
 * 7 planos detetados — os planos do mesmo cartao eram a mesma imagem. Cada enquadramento
 * aqui usa uma geometria diferente (largo, aproximacao, faixa do titulo, faixa do corpo,
 * pan) para que o corte seja visivel sem inventar assets novos.
 */
const FRAMINGS = [
  // Ordem alternada de proposito: largo -> faixa do titulo -> aproximacao -> faixa do corpo
  // -> pan -> pan. Dois enquadramentos vizinhos nunca partilham o mesmo tipo de imagem,
  // para que o detector de cortes (e o olho) veja mudanca em cada plano.
  { name: 'wide', motion: { kenBurns: { from: 1.0, to: 1.06 } } },
  { name: 'headline', motion: { crop: { y0: 0.03, h: 0.52 }, kenBurns: { from: 1.02, to: 1.14 }, pan: 'up' } },
  { name: 'pull-out', motion: { kenBurns: { from: 1.32, to: 1.02 } } },
  { name: 'body', motion: { crop: { y0: 0.46, h: 0.48 }, kenBurns: { from: 1.14, to: 1.0 }, pan: 'down' } },
  { name: 'drift-left', motion: { kenBurns: { from: 1.14, to: 1.14 }, pan: 'left' } },
  { name: 'drift-right', motion: { crop: { y0: 0.0, h: 0.86 }, kenBurns: { from: 1.06, to: 1.18 }, pan: 'right' } },
];

function framingFor(indexInParent, previousName) {
  let f = FRAMINGS[indexInParent % FRAMINGS.length];
  if (previousName && f.name === previousName) f = FRAMINGS[(indexInParent + 1) % FRAMINGS.length];
  return f;
}

function beatGeometry(beat, warnings) {
  if (beat.layout === 'split') {
    const ratio = beat.splitLine != null ? beat.splitLine : 0.55;
    return { layout: 'split', splitRatio: Math.min(0.9, Math.max(0.2, Number(ratio.toFixed(3)))) };
  }
  if (beat.layout === 'presenter-top') {
    // The pipeline always composites the presenter in the BOTTOM band. A reference shot
    // with the presenter on top cannot be cloned geometrically; keep the frame full so
    // the graphic is not sliced by a seam we would paint in the wrong place.
    warnings.presenterTop++;
    return { layout: 'full' };
  }
  return { layout: 'full' };
}

// ---------------------------------------------------------------- main

function main() {
  const shots = loadShots();
  const script = loadScript();
  if (!script.scenes.length) throw new Error('guiao sem cenas: ' + script.source);

  const warnings = { presenterTop: 0, beatsWithoutNarration: 0, scenesWithoutBeat: 0 };
  const mins = shots.reduce((a, s) => Math.min(a, s.seconds), Infinity);
  const folded = foldShots(shots, MIN_SHOT);
  const beats = capBeats(folded, MAX_BEATS);

  const parents = assignParents(beats, script.scenes);
  const perParent = new Map();
  beats.forEach((b, i) => {
    const p = parents[i];
    if (!perParent.has(p)) perParent.set(p, []);
    perParent.get(p).push(i);
  });
  for (let j = 0; j < script.scenes.length; j++) if (!perParent.has(j)) warnings.scenesWithoutBeat++;

  const narration = script.scenes.map((s, j) => {
    const idx = perParent.get(j) || [];
    if (NARRATION === 'none' || !idx.length) return new Array(idx.length).fill('');
    const chunks = splitNarration(s.narration || s.text || '', idx.map((i) => beats[i].seconds));
    if (NARRATION === 'first') return chunks.map((c, k) => (k === 0 ? c : ''));
    return chunks;
  });

  const scenes = [];
  beats.forEach((b, i) => {
    const p = parents[i];
    const parent = script.scenes[p] || {};
    const geo = beatGeometry(b, warnings);
    const chunk = narration[p] ? narration[p][perParent.get(p).indexOf(i)] : '';
    if (!String(chunk || '').trim()) warnings.beatsWithoutNarration++;
    const phrase = parent.text || parent.caption || (Array.isArray(parent.headline) ? parent.headline.join(' ') : parent.headline) || '';
    const k = perParent.get(p).indexOf(i);
    const fr = framingFor(k, scenes.length ? scenes[scenes.length - 1].framing : null);
    scenes.push({
      id: 'p' + String(i + 1).padStart(2, '0'),
      parent: parent.id || 's' + String(p + 1).padStart(2, '0'),
      sourceShot: b.index,
      seconds: Number(b.seconds.toFixed(3)),
      layout: geo.layout,
      ...(geo.splitRatio ? { splitRatio: geo.splitRatio } : {}),
      textSide: SIDE[b.headlineSide] || 'auto',
      avatar: parent.avatar || parent.presenter || undefined,
      kicker: parent.kicker,
      headline: parent.headline,
      body: parent.body,
      text: phrase,
      narration: chunk,
      framing: fr.name,
      motion: fr.motion,
    });
  });

  const secs = scenes.map((s) => s.seconds);
  const sorted = secs.slice().sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const totalSec = secs.reduce((a, b) => a + b, 0);
  const layouts = {};
  for (const s of scenes) layouts[s.layout] = (layouts[s.layout] || 0) + 1;
  const framings = {};
  for (const s of scenes) framings[s.framing] = (framings[s.framing] || 0) + 1;

  const plan = {
    version: 1,
    generatedAt: new Date().toISOString(),
    grade: 'A7 — ritmo de corte da referencia',
    source: { shots: SHOTS_FILE, script: script.source, shotsDerived: shots.some((s) => s.derived) },
    reference: {
      shots: shots.length,
      seconds: Number(shots.reduce((a, s) => a + s.seconds, 0).toFixed(2)),
      cutsPerMinute: Number(((shots.length - 1) / (shots.reduce((a, s) => a + s.seconds, 0) / 60)).toFixed(1)),
      medianShot: 1.8,
    },
    plan: { minShot: MIN_SHOT, maxBeats: MAX_BEATS, narration: NARRATION, folds: shots.length - beats.length, warnings },
    summary: {
      beats: scenes.length,
      cutsPerMinute: Number(((scenes.length - 1) / (totalSec / 60)).toFixed(1)),
      medianSeconds: Number(median.toFixed(2)),
      shortest: Number(Math.min(...secs).toFixed(2)),
      longest: Number(Math.max(...secs).toFixed(2)),
      totalSeconds: Number(totalSec.toFixed(2)),
      layouts,
      framings,
    },
    kicker: script.kicker,
    scenes,
  };

  console.log('planos medidos : ' + shots.length + '  (mediana ' + plan.reference.medianShot + ' s, ' + plan.reference.cutsPerMinute + ' cortes/min)');
  console.log('planos < ' + MIN_SHOT + ' s  : ' + (shots.length - beats.length) + ' fundidos, menor era ' + (mins === Infinity ? 0 : mins.toFixed(2)) + ' s');
  console.log('cenas no plano : ' + scenes.length + '  (' + plan.summary.cutsPerMinute + ' cortes/min, mediana ' + plan.summary.medianSeconds + ' s, ' + plan.summary.totalSeconds + ' s)');
  console.log('layouts        : ' + JSON.stringify(layouts));
  console.log('enquadramentos : ' + JSON.stringify(framings));
  console.log('narracao       : ' + NARRATION + '  (' + warnings.beatsWithoutNarration + ' planos mudos, ' + warnings.scenesWithoutBeat + ' cenas sem plano)');
  if (warnings.presenterTop) console.log('aviso          : ' + warnings.presenterTop + ' plano presenter-top nao tem geometria suportada -> full');
  if (plan.source.shotsDerived) console.log('aviso          : fonte sem campo `layout`; tipos derivados do kind (usa shots-merged.json para precisao)');

  if (CHECK) {
    console.log('\n--check: nada foi escrito.');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(plan, null, 2), 'utf8');
  console.log('\nescrito        : ' + OUT);
  console.log('construir      : node D:\\CRAFT\\.artcraft\\yt-clone-build.mjs --script "' + OUT + '" --transition none');
}

main();
