/**
 * Geometria do frame — pura, sem I/O, testavel.
 *
 * O frame e cortado em duas bandas: a de cima leva o cartao / motion graphics /
 * texto, a de baixo leva o apresentador. Todos os motores (Remotion, EffectCraft,
 * FigCraft, montagem de cena, legendas) perguntam aqui a mesma geometria, para
 * as bandas baterem certo entre si.
 */

/** Metricas globais do frame: o corte existe, onde e, e quao alto e cada banda. */
export function layoutMetrics(cfg) {
  const W = Number(cfg.video.width);
  const H = Number(cfg.video.height);
  const L = cfg.layout || {};
  const composeMode = cfg.avatar && cfg.avatar.compose ? cfg.avatar.compose.mode : null;
  const split = (L.mode || (composeMode === 'split' ? 'split' : 'full')) === 'split';
  const topRatio = Math.min(0.8, Math.max(0.3, Number(L.topRatio || 0.55)));
  const cardH = split ? Math.round(H * topRatio) : H;
  return { split, W, H, cardH, botH: H - cardH, topRatio };
}

/**
 * Layout por plano.
 *
 * Medido em yccXYW5liLE (33 planos): 16 sao split (grafico em cima, apresentador
 * em baixo), 9 sao whiteboard de frame inteiro, 7 so tem grafico, 1 poe o
 * apresentador em cima. A linha de divisao tambem nao e constante: mediana 57% do
 * frame, de 17% a 79%. Um split global so clona um video, por isso cada cena
 * pode trazer o seu.
 *
 *   scene.layout      'split' | 'full'   (sobrescreve layout.mode)
 *   scene.splitRatio  0.2 .. 0.9         (onde fica a costura)
 *   scene.textSide    'auto' | 'top' | 'bottom' | 'mid'
 */
export function sceneLayout(cfg, scene) {
  const base = layoutMetrics(cfg);
  const L = cfg.layout || {};
  const perShot = L.perShot !== false;
  const s = perShot && scene ? scene : {};
  const mode = s.layout || L.mode || (cfg.avatar && cfg.avatar.compose && cfg.avatar.compose.mode === 'split' ? 'split' : 'full');
  const split = mode === 'split';
  const ratio = Math.min(0.9, Math.max(0.2, Number(s.splitRatio || L.topRatio || 0.55)));
  const cardH = split ? Math.round(base.H * ratio) : base.H;
  return {
    split,
    W: base.W,
    H: base.H,
    cardH,
    botH: base.H - cardH,
    topRatio: ratio,
    textSide: s.textSide || L.textSide || 'auto',
  };
}

/** Base da frase grande, como fracao da altura do frame, para cada colocacao. */
export function textAnchorY(cfg, SL) {
  const side = SL.textSide;
  if (side === 'top') return Math.min(0.34, SL.split ? SL.topRatio * 0.55 : 0.3);
  if (side === 'mid') return 0.56;
  if (side === 'bottom') return 0.9;
  // auto: a referencia poe a frase na parte vazia do plano — a banda que o
  // apresentador nao ocupa. Nos 33 planos medidos a base da frase fica entre
  // 70% e 85% da altura, ou seja, sobre o peito do apresentador.
  return SL.split ? Math.min(0.9, SL.topRatio + 0.22) : 0.86;
}
