/**
 * Card scaffold — o desenho dos cartões do explainer, em EffectCraft headless.
 *
 * Extraído de `work/clone-tooling/explainer-effects.mjs` (§3.4 do contrato) para poder ser
 * chamado de dentro do `yt-clone-build.mjs`. Cada arquétipo devolve:
 *   - `commands`  : passos EffectCraft a empurrar logo depois do `comp.new`
 *   - `bg/ink/muted/accent` : cores que o texto da cena deve usar
 *   - `textLayout` : kickerY / headlineY / bodyY próprios (o gráfico ocupa a metade de cima,
 *                    o texto a de baixo — assim nunca se sobrepõem)
 *
 * Regras que vêm da referência e não devem ser revertidas:
 *   - o contorno do texto é desenhado POR BAIXO do preenchimento (`strokeOverFill: false`),
 *     senão um contorno de 10 px engole uma haste de 12 px e a letra fica um bloco preto;
 *   - néon = três traços sobrepostos, do largo e translúcido ao fino e opaco;
 *   - nenhuma cor pode ser a string 'none' — o CLI só aceita '#hex', [r,g,b] ou false.
 */

const P = {
  paper: '#F6F3EA',
  night: '#0B0F14',
  panel: '#12161C',
  white: '#FFFFFF',
  ink: '#111111',
  orange: '#FF6A00',
  cyan: '#34E1E1',
  violet: '#8B6CF0',
  lime: '#6BE86B',
  amber: '#FFB020',
  magenta: '#FF5FA2',
  mono: 'Consolas',
  sans: 'Inter',
};

const cmds = (list, command, params) => list.push({ command, params });

function solid(list, name, color, w, h) {
  cmds(list, 'layer.newSolid', { name, color, width: Math.round(w), height: Math.round(h) });
}

function rect(list, name, x, y, w, h, fill, stroke, strokeWidth) {
  const c = (v) => (v && v !== 'none' ? v : false);
  cmds(list, 'layer.newShape', {
    kind: 'rounded', name,
    size: [Math.round(w), Math.round(h)],
    position: [Math.round(x + w / 2), Math.round(y + h / 2)],
    fill: c(fill), stroke: c(stroke), strokeWidth: strokeWidth || 0,
  });
}

/** Três traços sobrepostos + núcleo: o brilho dos cartões da referência. */
function neonRect(list, name, x, y, w, h, color, core = 3) {
  [16, 10, 5].forEach((sw, i) => {
    rect(list, `${name}-g${i}`, x, y, w, h, false, color, sw);
    cmds(list, 'layer.setTransform', { layers: [`${name}-g${i}`], prop: 'opacity', value: 22 + i * 12 });
  });
  rect(list, `${name}-core`, x, y, w, h, false, color, core);
}

function strokePath(list, name, vertices, stroke, strokeWidth, closed = false) {
  cmds(list, 'shape.newPath', { name, vertices, closed, fill: false, stroke, strokeWidth });
}

function mono(list, name, text, x, y, size, color, box) {
  cmds(list, 'layer.newText', {
    name, text, font: P.mono, style: 'Regular', size: Math.round(size), fill: color,
    box: [Math.round(x), Math.round(y), Math.round(box ? box[0] : 900), Math.round(size * 1.6)],
    justify: (box && box[1]) || 'left',
  });
}

/** Asterisco de 8 pontas: quatro barras arredondadas rodadas a 45°. */
function spark(list, name, cx, cy, radius, color) {
  const len = radius * 2;
  const thick = Math.max(8, Math.round(radius * 0.3));
  for (let i = 0; i < 4; i++) {
    cmds(list, 'layer.newShape', {
      kind: 'rounded', name: `${name}-${i}`,
      size: [Math.round(len), thick], position: [Math.round(cx), Math.round(cy)],
      fill: color, stroke: false,
    });
    cmds(list, 'layer.setTransform', { layers: [`${name}-${i}`], prop: 'rotation', value: i * 45 });
  }
}

// ---------------------------------------------------------------- arquétipos

function whiteboard(list, W, H) {
  solid(list, 'paper', P.paper, W, H);

  // Só primitivas: `shape.newPath` desenhava o traço fora do sítio dentro de uma comp
  // animada, e um esboço errado é pior do que um esboço simples.
  const cx = W / 2;
  const bw = W * 0.54;
  const bh = H * 0.095;
  const by = H * 0.21;
  const sw = Math.max(6, Math.round(W * 0.0085));

  // cabina (por cima) e carroçaria
  rect(list, 'cabin', cx - bw * 0.26, by - bh * 0.72, bw * 0.56, bh * 0.80, false, P.ink, sw);
  // NB: nunca 'body'/'head'/'kick' aqui — são os nomes das camadas de TEXTO do
  // buildMotionCards, e um preset aplicado a uma forma rebenta com "not a text layer".
  rect(list, 'car-body', cx - bw / 2, by, bw, bh, false, P.ink, sw);

  // rodas
  const r = W * 0.105;
  rect(list, 'wheel-l', cx - bw * 0.31 - r / 2, by + bh - r * 0.42, r, r, false, P.ink, sw);
  rect(list, 'wheel-r', cx + bw * 0.31 - r / 2, by + bh - r * 0.42, r, r, false, P.ink, sw);
  rect(list, 'hub-l', cx - bw * 0.31 - r * 0.10, by + bh - r * 0.32, r * 0.20, r * 0.20, P.ink, false, 0);
  rect(list, 'hub-r', cx + bw * 0.31 - r * 0.10, by + bh - r * 0.32, r * 0.20, r * 0.20, P.ink, false, 0);

  // farol e caneta
  rect(list, 'lamp', cx + bw * 0.34, by + bh * 0.28, W * 0.05, H * 0.010, P.orange, false, 0);
  rect(list, 'pen', cx + bw * 0.30, by - bh * 1.15, W * 0.17, W * 0.017, '#1B1B1B', false, 0);
  cmds(list, 'layer.setTransform', { layers: ['pen'], prop: 'rotation', value: -38 });

  return {
    bg: P.paper, ink: P.ink, muted: '#4A4A4A', accent: P.orange,
    stroke: false,
    textLayout: { kickerY: 0.52, headlineY: 0.56, bodyY: 0.74 },
  };
}

function neonGrid(list, W, H) {
  solid(list, 'bg', P.night, W, H);
  spark(list, 'spark', W * 0.14, H * 0.085, W * 0.045, P.orange);
  mono(list, 'brand', 'whiteboard-explainer', W * 0.09, H * 0.135, W * 0.042, '#DCE6F2');

  const cells = [
    ['SKILL.md', P.magenta], ['tools', P.amber], ['engine', P.cyan],
    ['scripts', P.violet], ['assets', P.lime], ['templates', P.orange],
  ];
  const gap = W * 0.018;
  const cw = (W * 0.82 - gap * 2) / 3;
  const ch = H * 0.105;
  const x0 = W * 0.09;
  const y0 = H * 0.20;
  cells.forEach(([label, colour], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = x0 + col * (cw + gap);
    const y = y0 + row * (ch + gap * 1.4);
    rect(list, `cell-${i}`, x, y, cw, ch, P.night, false, 0);
    neonRect(list, `neon-${i}`, x, y, cw, ch, colour, 3);
    mono(list, `lab-${i}`, label, x, y + ch / 2 - W * 0.022, W * 0.032, '#EAF2FF', [cw, 'center']);
  });

  return {
    bg: P.night, ink: P.white, muted: '#9FB2C6', accent: P.orange,
    stroke: true,
    textLayout: { kickerY: 0.66, headlineY: 0.70, bodyY: 0.86 },
  };
}

function uiPanel(list, W, H) {
  solid(list, 'bg', P.panel, W, H);
  const x = W * 0.06;
  const y = H * 0.06;
  const w = W * 0.88;
  const h = H * 0.34;
  rect(list, 'outer', x, y, w, h, '#0D1117', false, 0);
  neonRect(list, 'outer-frame', x, y, w, h, P.orange, 4);

  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
    rect(list, `dot-${i}`, x + w * 0.04 + i * w * 0.038, y + h * 0.06, W * 0.016, W * 0.016, c, false, 0);
  });
  mono(list, 'doc', 'storyboard.app', x + w * 0.20, y + h * 0.045, W * 0.028, '#8FA3B8');

  for (let i = 0; i < 5; i++) {
    rect(list, `line-${i}`, x + w * 0.06, y + h * 0.24 + i * h * 0.14, w * (0.45 + 0.12 * (i % 3)), H * 0.016, '#1D2733', false, 0);
  }

  return {
    bg: P.panel, ink: P.white, muted: '#9FB2C6', accent: P.orange,
    stroke: true,
    textLayout: { kickerY: 0.50, headlineY: 0.55, bodyY: 0.86 },
  };
}

function panelStack(list, W, H) {
  solid(list, 'bg', P.night, W, H);
  const panels = [
    { u: 0.05, v: 0.04, w: 0.50, h: 0.16, c: P.cyan, label: 'scene_01.webm' },
    { u: 0.28, v: 0.15, w: 0.62, h: 0.18, c: P.violet, label: 'scene_02.mp4' },
    { u: 0.10, v: 0.26, w: 0.78, h: 0.20, c: P.orange, label: 'storyboard.app' },
  ];
  panels.forEach((p, i) => {
    const x = W * p.u;
    const y = H * p.v;
    const w = W * p.w;
    const h = H * p.h;
    rect(list, `p${i}`, x, y, w, h, '#0D1117', false, 0);
    neonRect(list, `pf${i}`, x, y, w, h, p.c, 3);
    mono(list, `pl${i}`, p.label, x + w * 0.04, y + h * 0.06, W * 0.024, '#9FB2C6');
    for (let r = 0; r < 2; r++) {
      rect(list, `pr${i}_${r}`, x + w * 0.04, y + h * 0.34 + r * h * 0.26, w * (0.5 + 0.15 * ((r + i) % 3)), H * 0.012, '#1D2733', false, 0);
    }
  });

  return {
    bg: P.night, ink: P.white, muted: '#9FB2C6', accent: P.orange,
    stroke: true,
    textLayout: { kickerY: 0.56, headlineY: 0.60, bodyY: 0.86 },
  };
}

function fullGraphic(list, W, H) {
  solid(list, 'bg', P.night, W, H);
  const x = W * 0.04;
  const y = H * 0.05;
  const w = W * 0.92;
  const h = H * 0.44;
  rect(list, 'big-panel', x, y, w, h, '#141A21', false, 0);
  neonRect(list, 'big-frame', x, y, w, h, P.orange, 4);
  mono(list, 'big-label', 'storyboard.md', x + w * 0.04, y + h * 0.05, W * 0.03, P.cyan);
  for (let i = 0; i < 4; i++) {
    rect(list, `row-${i}`, x + w * 0.05, y + h * 0.22 + i * h * 0.18, w * (0.45 + 0.1 * (i % 3)), H * 0.014, '#26313C', false, 0);
  }

  return {
    bg: P.night, ink: P.white, muted: '#9FB2C6', accent: P.orange,
    stroke: true,
    textLayout: { kickerY: 0.55, headlineY: 0.60, bodyY: 0.86 },
  };
}

const ARCHETYPES = { whiteboard, neon_grid: neonGrid, ui_panel: uiPanel, panel_stack: panelStack, full_graphic: fullGraphic };
export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

/**
 * @param {string} name    whiteboard | neon_grid | ui_panel | panel_stack | full_graphic
 * @param {number} W       largura da composição (px)
 * @param {number} H       altura da composição (px) — a banda, quando o layout é split
 * @returns {{commands:Array, bg:string, ink:string, muted:string, accent:string, stroke:boolean, textLayout:object}}
 */
export function scaffoldFor(name, W, H) {
  const paint = ARCHETYPES[name] || neonGrid;
  const commands = [];
  const meta = paint(commands, W, H);
  return { commands, ...meta };
}

/** Arquétipo da cena: `scene.scaffold` manda; senão roda pela lista, sem repetir em cenas seguidas. */
export function archetypeFor(scene, index, list) {
  const explicit = String((scene && (scene.scaffold || scene.kind)) || '').trim();
  if (explicit && ARCHETYPES[explicit]) return explicit;
  const set = Array.isArray(list) && list.length ? list : ARCHETYPE_NAMES;
  return set[index % set.length];
}
