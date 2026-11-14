import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutMetrics, sceneLayout, textAnchorY } from './layout.mjs';

const baseCfg = {
  video: { width: 1080, height: 1920, fps: 30 },
  layout: { mode: 'split', topRatio: 0.55, perShot: true, textSide: 'auto' },
  avatar: { compose: { mode: 'split' } },
};

test('layoutMetrics: split corta o frame em duas bandas', () => {
  const m = layoutMetrics(baseCfg);
  assert.equal(m.split, true);
  assert.equal(m.W, 1080);
  assert.equal(m.H, 1920);
  assert.equal(m.cardH, Math.round(1920 * 0.55));
  assert.equal(m.botH, 1920 - m.cardH);
});

test('layoutMetrics: full usa o frame inteiro', () => {
  const m = layoutMetrics({ ...baseCfg, layout: { mode: 'full', topRatio: 0.55 } });
  assert.equal(m.split, false);
  assert.equal(m.cardH, 1920);
});

test('layoutMetrics: topRatio fora de range e limitado', () => {
  assert.equal(layoutMetrics({ ...baseCfg, layout: { mode: 'split', topRatio: 0.1 } }).topRatio, 0.3);
  assert.equal(layoutMetrics({ ...baseCfg, layout: { mode: 'split', topRatio: 0.99 } }).topRatio, 0.8);
});

test('sceneLayout: a cena sobrepoe o layout global', () => {
  const sl = sceneLayout(baseCfg, { layout: 'split', splitRatio: 0.3 });
  assert.equal(sl.split, true);
  assert.equal(sl.cardH, Math.round(1920 * 0.3));
});

test('sceneLayout: com perShot=false a cena nao mexe', () => {
  const cfg = { ...baseCfg, layout: { ...baseCfg.layout, perShot: false } };
  const sl = sceneLayout(cfg, { layout: 'split', splitRatio: 0.3 });
  assert.equal(sl.cardH, Math.round(1920 * 0.55));
});

test('textAnchorY: auto coloca a frase na banda livre', () => {
  const sl = sceneLayout(baseCfg, {});
  const y = textAnchorY(baseCfg, sl);
  assert.ok(y > 0.5 && y <= 0.9, 'anchor fora do esperado: ' + y);
});

test('textAnchorY: top/mid/bottom sao fixos', () => {
  const sl = { ...sceneLayout(baseCfg, {}), textSide: 'top' };
  assert.ok(textAnchorY(baseCfg, sl) <= 0.34);
  assert.equal(textAnchorY(baseCfg, { ...sl, textSide: 'mid' }), 0.56);
  assert.equal(textAnchorY(baseCfg, { ...sl, textSide: 'bottom' }), 0.9);
});
