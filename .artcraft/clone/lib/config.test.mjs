import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { applyOverride, withDefaults, validateConfig, loadConfig, redactConfig, rawConfig } from './config.mjs';

test('applyOverride atribui em profundidade', () => {
  const o = {};
  applyOverride(o, 'cards.headline.size', '96');
  assert.equal(o.cards.headline.size, 96);
});

test('applyOverride le JSON quando o valor e JSON', () => {
  const o = {};
  applyOverride(o, 'languages.supported', '["pt-BR"]');
  assert.deepEqual(o.languages.supported, ['pt-BR']);
});

test('applyOverride deixa string simples como string', () => {
  const o = {};
  applyOverride(o, 'cards.topEngine', 'remotion');
  assert.equal(o.cards.topEngine, 'remotion');
});

test('withDefaults preenche sem sobrescrever o que o utilizador pôs', () => {
  const out = withDefaults({ video: { width: 720 }, cards: { palette: { bg: '#123456' } } });
  assert.equal(out.video.width, 720);
  assert.equal(out.video.height, 1920);
  assert.equal(out.cards.palette.bg, '#123456');
  assert.equal(out.cards.palette.ink, '#111111');
  assert.equal(out.cards.remotion.maxWords, 5);
});

const cfgBase = () => withDefaults({
  video: { width: 1080, height: 1920, fps: 30 },
  cards: { palette: { bg: '#F0E6D8', ink: '#111111', accent: '#FF8A3D' }, headline: { size: 108, maxCharsPerLine: 16 }, kicker: { size: 34, maxCharsPerLine: 40 }, body: { size: 44, maxCharsPerLine: 30 }, topEngine: 'remotion' },
  languages: { default: 'pt-BR', supported: ['pt-BR'] },
  voice: { engine: 'voicecraft' },
  paths: { workDir: path.join(os.tmpdir(), 'clone-work') },
  avatar: { enabled: false },
  script: { kicker: 'IA', scenes: [{ id: 's01', text: 'AGENTES', narration: 'Os agentes executam tarefas.' }] },
});

test('validateConfig aceita uma config completa', () => {
  const r = validateConfig(cfgBase());
  assert.deepEqual(r.errors, [], 'erros inesperados: ' + r.errors.join('; '));
  assert.equal(r.ok, true);
});

test('validateConfig apanha script em falta quando nao ha --script', () => {
  const cfg = cfgBase();
  delete cfg.script;
  const r = validateConfig(cfg);
  assert.ok(r.errors.some((e) => e.includes('script')));
  assert.equal(r.ok, false);
});

test('validateConfig aceita script externo (hasExternalScript)', () => {
  const cfg = cfgBase();
  delete cfg.script;
  const r = validateConfig(cfg, cfg, { hasExternalScript: true });
  assert.ok(!r.errors.some((e) => e.includes('script')), 'script externo devia bastar');
});

test('validateConfig apanha o conflito caption + motion (CONTRATO §3.4)', () => {
  const cfg = cfgBase();
  cfg.cards.textStyle = { mode: 'caption' };
  cfg.cards.motion = { enabled: true };
  cfg.cards.topEngine = 'effectcraft';
  const r = validateConfig(cfg);
  assert.ok(r.errors.some((e) => e.includes('Conflito estrutural')), 'devia falhar: ' + r.errors.join('; '));
});

test('validateConfig nao acusa o conflito caption + motion no path Remotion', () => {
  // com topEngine=remotion o buildMotionCards() nem corre: nao ha composicao
  // para ficar vazia, a frase grande e queimada na camada ASS.
  const cfg = cfgBase();
  cfg.cards.textStyle = { mode: 'caption' };
  cfg.cards.motion = { enabled: true };
  cfg.cards.topEngine = 'remotion';
  const r = validateConfig(cfg);
  assert.ok(!r.errors.some((e) => e.includes('Conflito estrutural')));
});

test('validateConfig apanha engine de cards inexistente', () => {
  const cfg = cfgBase();
  cfg.cards.topEngine = 'blender';
  const r = validateConfig(cfg);
  assert.ok(r.errors.some((e) => e.includes('topEngine')));
});

test('validateConfig apanha paleta em falta', () => {
  const cfg = cfgBase();
  delete cfg.cards.palette.accent;
  const r = validateConfig(cfg);
  assert.ok(r.errors.some((e) => e.includes('palette.accent')));
});

test('validateConfig avisa quando o idioma default nao esta na lista', () => {
  const cfg = cfgBase();
  cfg.languages.supported = ['en-US'];
  const r = validateConfig(cfg);
  assert.ok(r.warnings.some((w) => w.includes('languages.default')));
});

test('validateConfig apanha avatar.default inexistente', () => {
  const cfg = cfgBase();
  cfg.avatar = { enabled: true, default: 'frida', avatars: { luna: {} } };
  const r = validateConfig(cfg);
  assert.ok(r.errors.some((e) => e.includes('avatar.default')));
});

test('validateConfig avisa o que falta na config crua (presenca)', () => {
  const raw = { video: { width: 1080 }, cards: { palette: { bg: '#123', ink: '#111', accent: '#f80' } }, languages: { default: 'pt-BR', supported: ['pt-BR'] }, voice: { engine: 'voicecraft' }, paths: { workDir: os.tmpdir() }, script: { scenes: [{ id: 's01' }] } };
  const merged = withDefaults(raw);
  const r = validateConfig(merged, raw);
  assert.ok(r.warnings.some((w) => w.includes('video.height')), 'video.height em falta devia ser avisado');
  assert.ok(!r.errors.some((e) => e.includes('cards.palette.accent')));
});

test('validateConfig apanha belowText.mode invalido', () => {
  const cfg = cfgBase();
  cfg.cards.belowText = { mode: 'qualquer', maxWords: 3 };
  const r = validateConfig(cfg);
  assert.ok(r.errors.some((e) => e.includes('belowText.mode')));
});

test('loadConfig le o ficheiro e aplica overrides', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-cfg-'));
  const file = path.join(dir, 'clone.config.json');
  fs.writeFileSync(file, JSON.stringify({ video: { width: 1080 }, cards: { topEngine: 'figcraft' } }));
  const cfg = loadConfig({ configPath: file, overrides: ['cards.topEngine=remotion', 'video.width=720'] });
  assert.equal(cfg.cards.topEngine, 'remotion');
  assert.equal(cfg.video.width, 720);
});

test('loadConfig da erro claro quando o ficheiro nao existe', () => {
  assert.throws(() => loadConfig({ configPath: 'nao-existe.json' }), /config nao encontrada/);
});

// ---- redactConfig (segredos fora do manifest.json)

test('redactConfig remove chaves de API', () => {
  const out = redactConfig({
    voice: { voicecraft: { apiKey: 'sk-secreto', baseUrl: 'http://127.0.0.1:8090' } },
    pipeline: { broll: { pexels: { apiKey: 'abc123' } } },
  });
  assert.equal(out.voice.voicecraft.apiKey, '***redacted***');
  assert.equal(out.pipeline.broll.pexels.apiKey, '***redacted***');
});

test('redactConfig nao toca no resto da config', () => {
  const out = redactConfig({ video: { width: 1080 }, cards: { topEngine: 'remotion' } });
  assert.equal(out.video.width, 1080);
  assert.equal(out.cards.topEngine, 'remotion');
});

test('redactConfig deixa string vazia como esta', () => {
  const out = redactConfig({ voice: { apiKey: '' } });
  assert.equal(out.voice.apiKey, '');
});

test('redactConfig cobre tokens e segredos', () => {
  const out = redactConfig({ a: { accessToken: 'x', clientSecret: 'y', password: 'z', refresh_token: 'w' } });
  assert.equal(out.a.accessToken, '***redacted***');
  assert.equal(out.a.clientSecret, '***redacted***');
  assert.equal(out.a.password, '***redacted***');
  assert.equal(out.a.refresh_token, '***redacted***');
});

test('redactConfig apanha falApiKey e api_key', () => {
  const out = redactConfig({ a: { falApiKey: 'x', api_key: 'y', 'API-KEY': 'z' } });
  assert.equal(out.a.falApiKey, '***redacted***');
  assert.equal(out.a.api_key, '***redacted***');
  assert.equal(out.a['API-KEY'], '***redacted***');
});

test('redactConfig nao altera o objecto original', () => {
  const cfg = { voice: { apiKey: 'sk-secreto' } };
  redactConfig(cfg);
  assert.equal(cfg.voice.apiKey, 'sk-secreto');
});

// ---- rawConfig: a config como o utilizador a escreveu

const created = [];
after(() => {
  for (const dir of created) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ja foi */ }
  }
});

test('rawConfig devolve a config crua (sem defaults)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-cfg-'));
  created.push(dir);
  const file = path.join(dir, 'clone.config.json');
  fs.writeFileSync(file, JSON.stringify({ video: { width: 720 } }));
  const cfg = loadConfig({ configPath: file });
  const raw = rawConfig(cfg);
  assert.equal(raw.video.width, 720);
  assert.equal(raw.video.height, undefined, 'a config crua nao tem os defaults');
  assert.equal(cfg.video.height, 1920, 'a config mesclada tem os defaults');
});

test('rawConfig nao aparece no JSON do manifesto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-cfg-'));
  created.push(dir);
  const file = path.join(dir, 'clone.config.json');
  fs.writeFileSync(file, JSON.stringify({ video: { width: 720 } }));
  const cfg = loadConfig({ configPath: file });
  assert.ok(!JSON.stringify(cfg).includes('rawConfig'));
});

test('loadConfig le uma config com BOM', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-cfg-'));
  created.push(dir);
  const file = path.join(dir, 'clone.config.json');
  fs.writeFileSync(file, '\uFEFF' + JSON.stringify({ video: { width: 720 } }), 'utf8');
  const cfg = loadConfig({ configPath: file });
  assert.equal(cfg.video.width, 720);
});
