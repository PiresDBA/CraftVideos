#!/usr/bin/env node
/**
 * Explainer effect kit — reconstrói a linguagem visual do short de referência
 * (yccXYW5liLE) como composições EffectCraft reutilizáveis.
 *
 * Efeitos cobertos (medidos nos 33 planos do vídeo):
 *   E1 whiteboard      papel + line-art a traço + caneta + legenda "A VIDEO EDITOR"
 *   E2 caption_top     frase grande em caixa alta, contorno preto grosso, palavra-herói laranja
 *   E3 caption_bottom  a mesma legenda no fundo do quadro (plano full do apresentador)
 *   E4 neon_grid       grelha 3x2 de cartões com contorno néon + rótulos mono
 *   E5 ui_panel        painel de UI com moldura luminosa + barra de prompt
 *   E6 split_band      banda superior (1080x1094) para o corte split com apresentadora
 *   E7 panel_stack     três painéis sobrepostos (o "vários vídeos/animações acima")
 *   E8 full_graphic    gráfico a ocupar o quadro inteiro (a "tela que fica maior")
 *
 * Uso:
 *   node work/clone-tooling/explainer-effects.mjs            # build + QA frames + MP4
 *   node work/clone-tooling/explainer-effects.mjs --frames   # só frames PNG
 *   node work/clone-tooling/explainer-effects.mjs --dry      # só escreve o jsonl
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'D:/CRAFT';
const ART = path.join(ROOT, '.artcraft', 'artcraft.mjs');
const OUT = path.join(ROOT, 'work', 'explainer-study');
const BUILD = path.join(OUT, 'build');
const FRAMES = path.join(OUT, 'frames');
const CLIPS = path.join(OUT, 'clips');

const W = 1080;
const H = 1920;
const FPS = 30;

const PAL = {
  paper: '#F6F3EA',
  ink: '#111111',
  night: '#0B0F14',
  panel: '#12161C',
  white: '#FFFFFF',
  orange: '#FF6A00',
  ochre: '#F09030',
  cyan: '#34E1E1',
  violet: '#8B6CF0',
  lime: '#6BE86B',
  amber: '#FFB020',
  magenta: '#FF5FA2',
  mono: 'Consolas',
  sans: 'Inter',
};

const argv = new Set(process.argv.slice(2));
const DRY = argv.has('--dry');
const FRAMES_ONLY = argv.has('--frames');

// ---------------------------------------------------------------- helpers

const steps = [];
const comps = [];

function cmd(command, params) {
  steps.push({ command, params: params || {} });
}

function comp(name, width, height, duration, background) {
  cmd('comp.new', { name, width, height, frameRate: FPS, duration, background });
  comps.push({ name, width, height, duration });
  return name;
}

function solid(name, color, width, height) {
  cmd('layer.newSolid', { name, color, width, height });
}

function rect(name, x, y, w, h, fill, stroke, strokeWidth) {
  const c = (v) => (v && v !== 'none' ? v : false);
  cmd('layer.newShape', {
    kind: 'rounded', name, size: [w, h], position: [x + w / 2, y + h / 2],
    fill: c(fill), stroke: c(stroke), strokeWidth: strokeWidth || 0,
  });
}

/** Asterisco de 8 pontas (o "spark" da referência), feito de quatro barras rodadas. */
function sparkBurst(name, cx, cy, radius, color) {
  const len = radius * 2;
  const thick = Math.max(10, Math.round(radius * 0.30));
  for (let i = 0; i < 4; i++) {
    cmd('layer.newShape', {
      kind: 'rounded', name: `${name}-${i}`,
      size: [len, thick], position: [cx, cy], fill: color, stroke: false,
    });
    cmd('layer.setTransform', { layers: [`${name}-${i}`], prop: 'rotation', value: i * 45 });
  }
}

/** Contorno néon: três traços sobrepostos, do mais largo/translúcido ao mais fino/opaco. */
function neonRect(name, x, y, w, h, color, core = 3) {
  const halo = [16, 10, 5];
  halo.forEach((sw, i) => {
        rect(`${name}-g${i}`, x, y, w, h, false, color, sw);
    cmd('layer.setTransform', { layers: [`${name}-g${i}`], prop: 'opacity', value: 22 + i * 12 });
  });
  rect(`${name}-core`, x, y, w, h, false, color, core);
}

function strokePath(name, vertices, stroke, strokeWidth, closed = false) {
  cmd('shape.newPath', {
    name, vertices, closed, fill: false, stroke, strokeWidth,
  });
}

/**
 * Estimativa de avanço para centrar texto com justify "left".
 * Não precisa de ser exata: a mesma origem serve para a linha branca e para
 * a palavra-herói laranja, por isso alinham sempre uma com a outra.
 */
const NARROW = new Set(['I', 'J', 'L', 'T', 'F', 'E', 'P', 'S', 'C', '1', '.', ',', '-', '·', "'", ' ']);
const WIDE = new Set(['M', 'W', 'O', 'Q', 'G', 'N', 'H', 'U', 'D']);

function advance(text, size) {
  let total = 0;
  for (const ch of String(text)) {
    const up = ch.toUpperCase();
    let k = 0.626;
    if (NARROW.has(up)) k = 0.47;
    else if (WIDE.has(up)) k = 0.80;
    if (ch === ' ') k = 0.34;
    total += k * size;
  }
  return total;
}

/**
 * Linha de legenda com possível palavra-herói.
 *
 * O destaque é sempre a PRIMEIRA palavra da linha: desenha-se a linha toda a
 * branco e cobre-se o primeiro conjunto de glifos com a mesma layer em laranja,
 * na mesma caixa e com o mesmo justify. Sem depender de métricas de fonte.
 */
function captionLine(text, accentWord, rawSize, y, opts = {}) {
  const margin = opts.margin || 62;
  const tracking = opts.tracking || 0;
  const measure = (s) => (advance(text, s) + tracking * Math.max(0, text.length - 1)) * 1.12;
  // encolhe até caber no quadro: a legenda nunca sangra pelas bordas
  let size = rawSize;
  while (size > 24 && measure(size) > W - margin * 2) size = Math.round(size * 0.96);

  const stroke = opts.stroke || '#000000';
  const strokeWidth = opts.strokeWidth || Math.max(8, Math.round(size * 0.095));
  const fill = opts.fill || PAL.white;
  const est = measure(size);
  const x = Math.round(Math.max(margin / 2, (W - est) / 2));
  // caixa folgada à direita: o texto nunca quebra, e o começo continua em `x`
  const box = [x, Math.round(y), Math.round(Math.max(est * 1.7, W - x - 10)), Math.round(size * 1.55)];
  const base = {
    font: opts.font || PAL.sans, style: opts.weight || 'ExtraBold', size, box,
    justify: 'left', tracking,
    applyFill: true, fill, applyStroke: true, stroke, strokeWidth,
    strokeOverFill: false, lineJoin: 'round',
  };
  const tag = opts.tag || 'cap';

  cmd('layer.newText', { name: `${tag}-base`, text, ...base });
  if (opts.preset !== false) {
    cmd('layer.applyTextPreset', { layer: `${tag}-base`, preset: opts.preset || 'fadeUpCharacters' });
  }
  if (accentWord && text.toUpperCase().startsWith(accentWord.toUpperCase())) {
    cmd('layer.newText', {
      name: `${tag}-hi`, text: accentWord, ...base, fill: opts.accent || PAL.orange,
    });
    if (opts.preset !== false) {
      cmd('layer.applyTextPreset', { layer: `${tag}-hi`, preset: opts.preset || 'fadeUpCharacters' });
    }
  }
}

/** Bloco de legenda multilinha centrado verticalmente a partir de `y`. */
function captionBlock(lines, size, y, opts = {}) {
  const lh = Math.round(size * (opts.lineHeight || 1.06));
  lines.forEach((line, i) => {
    const text = typeof line === 'string' ? line : line.text;
    const accent = typeof line === 'string' ? null : line.accent;
    captionLine(text, accent, size, y + i * lh, { ...opts, tag: `${opts.tag || 'cap'}${i + 1}` });
  });
  return y + lines.length * lh;
}

function monoLabel(name, text, x, y, size, color, opts = {}) {
  cmd('layer.newText', {
    name, text, font: PAL.mono, style: 'Regular', size, fill: color,
    box: [x, y, opts.w || 900, Math.round(size * 1.5)], justify: opts.justify || 'left',
  });
}


// ---------------------------------------------------------------- E1 · whiteboard

function buildWhiteboard() {
  const name = comp('E1_whiteboard', W, H, 4.2, PAL.paper);
  solid('paper', PAL.paper, W, H);

  // corpo do carro (line-art)
  strokePath('car-body', [
    [170, 1130], [205, 1040], [330, 1002], [500, 992], [640, 1004],
    [745, 1050], [805, 1112], [818, 1170], [808, 1215], [742, 1242],
    [600, 1252], [420, 1252], [252, 1240], [186, 1208], [170, 1130],
  ], PAL.ink, 11);

  // janela / tejadilho
  strokePath('car-window', [
    [362, 1058], [436, 1032], [566, 1034], [622, 1064], [610, 1108], [372, 1108], [362, 1058],
  ], PAL.ink, 9);

  // rodas (aro + cubo)
  rect('wheel-l', 240, 1160, 120, 120, false, PAL.ink, 10);
  rect('wheel-r', 646, 1160, 120, 120, false, PAL.ink, 10);
  rect('hub-l', 288, 1208, 24, 24, PAL.ink, false, 0);
  rect('hub-r', 694, 1208, 24, 24, PAL.ink, false, 0);

  // fumo do tubo de escape
  strokePath('puff', [
    [724, 986], [758, 944], [812, 928], [852, 954], [858, 1004], [822, 1034], [768, 1026], [734, 1004],
  ], PAL.ink, 8);

  // caneta inclinada, encostada à frente do carro
  rect('pen', 668, 1010, 150, 26, '#1B1B1B', false, 0);
  cmd('layer.setTransform', { layers: ['pen'], prop: 'rotation', value: -42 });

  // legenda do plano
  captionBlock([{ text: 'A VIDEO EDITOR', accent: 'A' }], 104, 1490, {
    strokeWidth: 10, preset: 'fadeUpCharacters', tag: 'wb',
  });

  return { name, width: W, height: H, duration: 4.2 };
}

// ---------------------------------------------------------------- E2/E3 · legendas

function buildCaptions() {
  const a = comp('E2_caption_top', W, H, 3.2, PAL.night);
  solid('bg', PAL.night, W, H);
  captionBlock([{ text: 'HOME-MADE' }], 118, 140, {
    strokeWidth: 11, preset: 'scramble', tag: 'ct',
  });
  captionBlock([{ text: 'WHITEBOARD EXPLAINER', accent: 'WHITEBOARD' }], 78, 310, {
    strokeWidth: 9, preset: 'trackingIn', tag: 'cb',
  });

  const b = comp('E3_caption_bottom', W, H, 3.2, PAL.panel);
  solid('bg', PAL.panel, W, H);
  captionBlock([{ text: 'FLOW', accent: 'FLOW' }, { text: 'STUDIO ARE' }], 122, 1290, {
    strokeWidth: 12, preset: 'fadeUpCharacters', tag: 'fb',
  });

  const c = comp('E8_full_graphic', W, H, 3.6, PAL.night);
  solid('bg', PAL.night, W, H);
  // "a tela fica maior": painel a sangrar pelas bordas
  rect('big-panel', 40, 380, W - 80, 1120, '#141A21', '#2A343F', 3);
  neonRect('big-frame', 40, 380, W - 80, 1120, PAL.orange, 4);
  monoLabel('big-label', 'storyboard.md', 80, 420, 34, PAL.cyan);
  for (let i = 0; i < 5; i++) {
    rect(`row-${i}`, 96, 520 + i * 120, 520 + (i % 3) * 90, 34, '#26313C', 'none', 0);
  }
  captionBlock([{ text: 'DOES' }, { text: 'THE STORYBOARDING', accent: 'THE' }], 100, 1560, {
    strokeWidth: 10, preset: 'fadeUpCharacters', tag: 'fg',
  });

  return [
    { name: a, width: W, height: H, duration: 3.2 },
    { name: b, width: W, height: H, duration: 3.2 },
    { name: c, width: W, height: H, duration: 3.6 },
  ];
}

// ---------------------------------------------------------------- E4 · grelha neon

function buildNeonGrid() {
  const name = comp('E4_neon_grid', W, 1250, 4.0, PAL.night);
  solid('bg', PAL.night, W, 1250);

  // estrela / asterisco laranja
  sparkBurst('spark', 150, 340, 68, PAL.orange);

  captionBlock([{ text: 'HOME-MADE' }], 104, 50, {
    strokeWidth: 10, preset: 'scramble', tag: 'ngH',
  });
  monoLabel('subtitle', 'whiteboard-explainer', 90, 425, 48, '#DCE6F2');

  const cells = [
    ['SKILL.md', PAL.magenta],
    ['tools', PAL.amber],
    ['engine', PAL.cyan],
    ['scripts', PAL.violet],
    ['assets', PAL.lime],
    ['templates', PAL.orange],
  ];
  const cw = 300, ch = 176, gap = 20;
  const x0 = Math.round((W - (cw * 3 + gap * 2)) / 2);
  const y0 = 530;

  cells.forEach(([label, colour], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = x0 + col * (cw + gap);
    const y = y0 + row * (ch + gap);
    rect(`cell-${i}`, x, y, cw, ch, '#0B0F14', 'none', 0);
    neonRect(`neon-${i}`, x, y, cw, ch, colour, 3);
    cmd('layer.newText', {
      name: `lab-${i}`, text: label, font: PAL.mono, style: 'Regular', size: 34,
      fill: '#EAF2FF', box: [x, y + ch / 2 - 22, cw, 60], justify: 'center',
    });
    cmd('layer.applyTextPreset', { layer: `lab-${i}`, preset: 'fadeUpCharacters' });
  });

  return { name, width: W, height: 1250, duration: 4.0 };
}

// ---------------------------------------------------------------- E5 · painel de UI

function buildUiPanel() {
  const name = comp('E5_ui_panel', W, 1250, 4.0, PAL.panel);
  solid('bg', PAL.panel, W, 1250);

  rect('outer', 60, 60, W - 120, 690, '#0D1117', 'none', 0);
  neonRect('outer-frame', 60, 60, W - 120, 690, PAL.orange, 4);

  // barra de título
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
    rect(`dot-${i}`, 96 + i * 34, 96, 18, 18, c, 'none', 0);
  });
  monoLabel('doc', 'storyboard.app', 230, 90, 30, '#8FA3B8');

  // linhas de conteúdo
  for (let i = 0; i < 6; i++) {
    rect(`line-${i}`, 110, 190 + i * 84, 560 + (i % 4) * 110, 26, '#1D2733', 'none', 0);
  }
  monoLabel('ghost', "What's up next, Guney?", 380, 470, 30, '#6C7F94');

  // barra de prompt
  rect('prompt', 60, 790, W - 120, 120, '#0D1117', 'none', 0);
  neonRect('prompt-frame', 60, 790, W - 120, 120, PAL.orange, 3);
  monoLabel('prompt-text', 'Do what a storyboardin', 100, 826, 36, '#EAF2FF');
  rect('caret', 690, 830, 3, 44, PAL.orange, 'none', 0);

  captionBlock([{ text: 'DOES' }, { text: 'THE STORYBOARDING', accent: 'THE' }], 96, 960, {
    strokeWidth: 9, preset: 'fadeUpCharacters', tag: 'ui',
  });

  return { name, width: W, height: 1250, duration: 4.0 };
}

// ---------------------------------------------------------------- E6 · banda split

function buildSplitBand() {
  const name = comp('E6_split_band', W, 1094, 4.4, PAL.night);
  solid('bg', PAL.night, W, 1094);

  sparkBurst('sb-spark', 150, 300, 62, PAL.orange);
  captionBlock([{ text: 'HOME-MADE' }], 96, 20, {
    strokeWidth: 9, preset: 'scramble', tag: 'sbH',
  });
  monoLabel('sb-sub', 'whiteboard-explainer', 90, 378, 44, '#DCE6F2');

  const cells = [
    ['SKILL.md', PAL.magenta], ['tools', PAL.amber], ['engine', PAL.cyan],
    ['scripts', PAL.violet], ['assets', PAL.lime], ['templates', PAL.orange],
  ];
  const cw = 290, ch = 150, gap = 16;
  const x0 = Math.round((W - (cw * 3 + gap * 2)) / 2);
  const y0 = 470;
  cells.forEach(([label, colour], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = x0 + col * (cw + gap);
    const y = y0 + row * (ch + gap);
    rect(`s-cell-${i}`, x, y, cw, ch, '#0B0F14', 'none', 0);
    neonRect(`s-neon-${i}`, x, y, cw, ch, colour, 3);
    cmd('layer.newText', {
      name: `s-lab-${i}`, text: label, font: PAL.mono, style: 'Regular', size: 30,
      fill: '#EAF2FF', box: [x, y + ch / 2 - 20, cw, 56], justify: 'center',
    });
    cmd('layer.applyTextPreset', { layer: `s-lab-${i}`, preset: 'fadeUpCharacters' });
  });

  captionBlock([{ text: 'WITH CLAUDE CODE', accent: 'WITH' }], 88, 892, {
    strokeWidth: 9, preset: 'fadeUpCharacters', tag: 'sbC',
  });

  return { name, width: W, height: 1094, duration: 4.4 };
}

// ---------------------------------------------------------------- E9 · zona do apresentador

/**
 * Metade inferior do corte split (826 px = 1920 − 1094).
 * É o marcador de lugar onde entra o vídeo do apresentador; o compositing
 * final sobrepõe esta faixa ao footage real (ou usa-a como guia de enquadramento).
 */
function buildPresenterZone() {
  const name = comp('E9_presenter_zone', W, 826, 4.4, '#10151A');
  solid('bg', '#10151A', W, 826);
  rect('frame', 24, 24, W - 48, 826 - 48, false, '#2A343F', 3);
  // marcas de canto
  const tick = (n, x, y, w, h) => rect(n, x, y, w, h, PAL.orange, false, 0);
  tick('tl-x', 24, 24, 70, 4); tick('tl-y', 24, 24, 4, 70);
  tick('tr-x', W - 94, 24, 70, 4); tick('tr-y', W - 28, 24, 4, 70);
  monoLabel('who', 'apresentador', 70, 330, 42, PAL.orange);
  monoLabel('how', 'LivePortrait + Wav2Lip · face ~28% da altura', 70, 402, 26, '#8FA3B8', { w: W - 140 });

  return { name, width: W, height: 826, duration: 4.4 };
}

// ---------------------------------------------------------------- E7 · stack de painéis

function buildPanelStack() {
  const name = comp('E7_panel_stack', W, 1250, 4.6, PAL.night);
  solid('bg', PAL.night, W, 1250);

  const panels = [
    { x: 40, y: 150, w: 620, h: 380, c: PAL.cyan, label: 'scene_01.webm' },
    { x: 300, y: 300, w: 700, h: 430, c: PAL.violet, label: 'scene_02.mp4' },
    { x: 120, y: 520, w: 840, h: 520, c: PAL.orange, label: 'storyboard.app' },
  ];
  panels.forEach((p, i) => {
    rect(`p${i}`, p.x, p.y, p.w, p.h, '#0D1117', 'none', 0);
    neonRect(`pf${i}`, p.x, p.y, p.w, p.h, p.c, 3);
    monoLabel(`pl${i}`, p.label, p.x + 26, p.y + 20, 26, '#9FB2C6', { w: p.w - 60 });
    for (let r = 0; r < 3; r++) {
      rect(`pr${i}_${r}`, p.x + 26, p.y + 76 + r * 46, Math.round((p.w - 90) * (0.5 + 0.2 * ((r + i) % 3))), 16, '#1D2733', 'none', 0);
    }
  });

  captionBlock([{ text: 'SEVERAL' }, { text: 'SCREENS AT ONCE', accent: 'SCREENS' }], 88, 1075, {
    strokeWidth: 9, preset: 'fadeUpCharacters', tag: 'ps',
  });

  return { name, width: W, height: 1250, duration: 4.6 };
}

// ---------------------------------------------------------------- pipeline

function runCli(args) {
  return spawnSync(process.execPath, [ART, 'cli', 'effectcraft', ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
}

function main() {
  [OUT, BUILD, FRAMES, CLIPS].forEach((d) => fs.mkdirSync(d, { recursive: true }));

  const built = [
    buildWhiteboard(),
    ...buildCaptions(),
    buildNeonGrid(),
    buildUiPanel(),
    buildSplitBand(),
    buildPresenterZone(),
    buildPanelStack(),
  ];

  const jsonl = path.join(BUILD, 'explainer-effects.jsonl');
  fs.writeFileSync(jsonl, steps.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');

  const plan = path.join(OUT, 'effect-plan.json');
  fs.writeFileSync(plan, JSON.stringify({
    generatedAt: new Date().toISOString(),
    reference: 'youtube shorts yccXYW5liLE',
    measured: {
      shots: 33,
      avgShotSeconds: 1.83,
      layouts: { split: 16, 'full-whiteboard': 9, 'full-graphic': 7, 'presenter-top': 1 },
      splitLineMedian: 0.572,
    },
    palette: { paper: PAL.paper, night: PAL.night, orange: PAL.orange, white: PAL.white },
    comps: built,
    commands: steps.length,
  }, null, 2), 'utf8');

  console.log(`jsonl: ${jsonl} (${steps.length} comandos, ${built.length} composições)`);
  if (DRY) return;

  const proj = path.join(BUILD, 'explainer-effects.ecproj');
  const build = runCli(['run', '--commands', jsonl, '--save-as', proj]);
  if (build.status !== 0) {
    console.error('FALHA no build:\n' + (build.stderr || '').slice(-2000));
    process.exit(1);
  }
  console.log('projeto: ' + proj);

  for (const c of built) {
    const png = path.join(FRAMES, `${c.name}.png`);
    const r = runCli([
      'render-frame', '--project', proj, '--comp', c.name,
      '--time', String(c.duration * 0.9), '--out', png,
    ]);
    console.log(`${r.status === 0 ? 'png ok ' : 'png FAIL'} ${c.name}`);
  }
  if (FRAMES_ONLY) return;

  for (const c of built) {
    const mp4 = path.join(CLIPS, `${c.name}.mp4`);
    const r = runCli([
      'render', '--project', proj, '--comp', c.name, '--out', mp4,
      '--format', 'h264', '--fps', String(FPS),
      '--start', '0', '--end', String(c.duration), '--quality', 'best', '--resolution', 'full',
    ]);
    const ok = r.status === 0 && fs.existsSync(mp4) && fs.statSync(mp4).size > 20000;
    console.log(`${ok ? 'mp4 ok ' : 'mp4 FAIL'} ${c.name} ${ok ? (fs.statSync(mp4).size / 1024 | 0) + ' KB' : (r.stderr || '').slice(-300)}`);
  }
}

main();
