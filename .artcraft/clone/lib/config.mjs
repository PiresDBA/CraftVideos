/**
 * Configuracao do pipeline — carregar, sobrepor e validar.
 *
 * Regra do projecto: **nada fica preso no codigo**. O clone.config.json e a
 * fonte da verdade; `--set chave=valor` sobrepoe por linha de comando; e a
 * validacao diz o que esta em falta **antes** de gastar dois minutos a
 * sintetizar voz e renderizar cartoes.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Valores minimos para o pipeline nunca ler `undefined` no meio do build. */
export const DEFAULTS = {
  video: { width: 1080, height: 1920, fps: 30, codec: 'libx264', crf: 20, preset: 'medium', pixFmt: 'yuv420p', audioCodec: 'aac', audioBitrate: '192k', sampleRate: 48000 },
  scene: { minSeconds: 4, maxSeconds: 18, padSeconds: 0.45 },
  languages: { default: 'pt-BR', supported: ['pt-BR'], autoTranslate: false, translateEngine: 'google', subtitleLanguages: [] },
  voice: { engine: 'sapi' },
  cards: {
    engine: 'figcraft',
    topEngine: 'figcraft',
    fontFamily: 'Inter',
    weight: 'Bold',
    padding: 90,
    palette: { bg: '#F0E6D8', ink: '#111111', accent: '#FF8A3D', muted: '#555555' },
    layout: { kickerY: 0.3, headlineY: 0.365, bodyY: 0.6 },
    kicker: { size: 34, tracking: 6, maxCharsPerLine: 40 },
    headline: { size: 108, lineHeight: '106%', maxCharsPerLine: 16 },
    body: { size: 44, lineHeight: '136%', maxCharsPerLine: 30 },
    thumbnail: { width: 1280, height: 720, kickerSize: 30, headlineSize: 80, maxCharsPerLine: 20 },
    // O default e 'layers' (kicker/headline/body), que era o comportamento
    // effective antes da refactor: 'caption' (frase grande queimada na
    // camada ASS) so se activa quando a config o pede explicitamente.
    textStyle: { uppercase: true, mode: 'layers' },
    subtitle: { bold: true, uppercase: true, outlineColor: '#000000', outlineWidth: 4, fontSizeRatio: 0.026, maxCharsPerChunk: 62 },
    motion: { enabled: false, cli: '', entranceSeconds: 3 },
    remotion: { maxWords: 5, fontSize: 96, stagger: 7, accentEvery: 3 },
    belowText: { mode: 'keywords', maxWords: 3 },
  },
  layout: { mode: 'full', topRatio: 0.55, captionGap: 0.032, fillWhenNoPresenter: true, perShot: true, textSide: 'auto' },
  transition: { type: 'none', name: 'fade', seconds: 0.35 },
  music: { path: '', gain: 0.1, loop: true },
  loudness: { enabled: true, targetLufs: -14, truePeak: -1.5, range: 11 },
  pipeline: { broll: { enabled: false, source: 'pexels', minClipsPerScene: 2, maxDurationSec: 10 } },
  paths: { workDir: '' },
};

/** `--set cards.headline.size=96` -> atribuicao profunda. O valor e JSON quando parseia. */
export function applyOverride(obj, dotted, raw) {
  const keys = String(dotted).split('.').filter(Boolean);
  if (!keys.length) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  let value = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* string simples */
  }
  cur[keys[keys.length - 1]] = value;
}

/** Preenche buracos com os defaults (sem mexer no que o utilizador definiu). */
export function withDefaults(cfg) {
  const out = { ...cfg };
  for (const [section, value] of Object.entries(DEFAULTS)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[section] = { ...value, ...(cfg[section] || {}) };
      // dois niveis, para as sub-secoes (cards.palette, cards.headline, ...)
      for (const [key, sub] of Object.entries(value)) {
        if (sub && typeof sub === 'object' && !Array.isArray(sub) && out[section][key] && typeof out[section][key] === 'object') {
          out[section][key] = { ...sub, ...out[section][key] };
        }
      }
    } else if (out[section] === undefined) {
      out[section] = value;
    }
  }
  return out;
}

/**
 * Carrega a config e aplica os overrides.
 *
 * @param {object} opts
 *   configPath  caminho do clone.config.json
 *   overrides   [["cards.headline.size", "96"], ...]
 *   voice/music/transition  overrides das flags --voice/--music/--transition
 */
export function loadConfig(opts = {}) {
  const configPath = opts.configPath;
  if (!configPath || !fs.existsSync(configPath)) {
    throw new Error('config nao encontrada: ' + configPath);
  }
  let cfg;
  try {
    // BOM: o Notepad do Windows e o PowerShell 5.1 gravam UTF-8 com BOM. Sem
    // tirar a BOM, o JSON.parse falha com "Unexpected token" numa config
    // perfeitamente valida.
    const text = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
    cfg = JSON.parse(text);
  } catch (e) {
    throw new Error('config invalida (' + configPath + '): ' + e.message);
  }

  for (const pair of opts.overrides || []) {
    const eq = String(pair).indexOf('=');
    if (eq < 0) continue;
    applyOverride(cfg, pair.slice(0, eq), pair.slice(eq + 1));
  }
  if (opts.voice) cfg.voice = { ...cfg.voice, engine: opts.voice };
  if (opts.music) cfg.music = { ...cfg.music, path: opts.music };
  if (opts.transition) cfg.transition = { ...cfg.transition, type: opts.transition };

  const merged = withDefaults(cfg);
  // A config crua (pos-overrides) fica presa ao objecto mesclado, sem ser
  // enumeravel: o `validateConfig` precisa dela para dizer "isto nao foi
  // escrito" (em vez de "o default cobre"), e o manifest.json nao a deve
  // repetir. Nao-enumeravel = o JSON.stringify nao a toca.
  Object.defineProperty(merged, RAW_CONFIG, { value: cfg, enumerable: false });
  return merged;
}

/** Chave interna (Symbol) onde fica a config crua. */
const RAW_CONFIG = Symbol('rawConfig');

/**
 * A config tal como o utilizador a escreveu (com os overrides ja aplicados).
 *
 * Se a config nao veio do `loadConfig`, devolve ela propria — assim o
 * `validateConfig` nunca rebenta por falta da crua.
 */
export function rawConfig(cfg) {
  return (cfg && cfg[RAW_CONFIG]) || cfg;
}

/**
 * Redige segredos de uma config, para poder ser embutida num artefacto.
 *
 * O `manifest.json` guarda a config inteira (e' util para reproduzir o build),
 * mas a config pode ter chaves de API preenchidas. Qualquer artefacto que
 * saia da maquina nao deve levar segredos dentro.
 *
 * A deteccao e feita sobre o nome da chave "achatado" (sem `_`, `-` ou maiusculas
 * minusculas): assim `apiKey`, `api_key`, `API-KEY`, `accessToken` e
 * `clientSecret` sao todos apanhados pela mesma regra.
 *
 * @param {object} cfg
 * @param {string[]} [extraKeys]  chaves adicionais a considerar secretas
 */
export function redactConfig(cfg, extraKeys = []) {
  const SECRET_WORDS = [
    'apikey', 'token', 'secret', 'password', 'passwd', 'authorization',
    'bearer', 'credential', 'privatekey', 'accesskey', 'falapikey',
  ];
  const extra = new Set(extraKeys.map((k) => flatKey(k)));
  const isSecretKey = (k) => {
    const flat = flatKey(k);
    if (!flat) return false;
    if (extra.has(flat)) return true;
    if (flat === 'key' || flat === 'auth') return true;
    return SECRET_WORDS.some((w) => flat.includes(w));
  };
  const walk = (value, keyName) => {
    if (Array.isArray(value)) return value.map((v) => walk(v, keyName));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const isSecret = isSecretKey(k);
        out[k] = isSecret && (typeof v === 'string' || typeof v === 'number')
          ? (v === '' ? '' : '***redacted***')
          : walk(v, k);
      }
      return out;
    }
    return value;
  };
  return walk(cfg, '');
}

/** "api_key" / "API-KEY" / "apiKey" -> "apikey". */
function flatKey(k) {
  return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const CARD_ENGINES = ['remotion', 'effectcraft', 'figcraft', 'visuals'];
const VOICE_ENGINES = ['sapi', 'filmcraft', 'edge', 'voicecraft', 'elevenlabs', 'xtts', 'kokoro', 'custom', 'none'];

/**
 * Valida a configuração mesclada (valores/faixas) e a configuração crua (presença).
 *
 * @param {object} cfg - Configuração após withDefaults()
 * @param {object} [raw] - JSON original lido do disco (opcional; assume cfg se omitido)
 * @param {object} [opts] - Opções extras do motor (ex: { hasExternalScript: boolean })
 */
export function validateConfig(cfg, raw = cfg, opts = {}) {
  const errors = [];
  const warnings = [];
  const src = raw && typeof raw === 'object' ? raw : cfg;

  // Helper seguro para navegar caminhos pontilhados (ex: 'cards.palette.accent')
  const hasPath = (obj, dotted) => {
    if (!obj || typeof obj !== 'object') return false;
    const parts = dotted.split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object' || !(part in cur)) return false;
      cur = cur[part];
    }
    return cur !== undefined && cur !== null;
  };

  // ---------------------------------------------------------
  // 1. CHECAGENS DE PRESENÇA (sobre `raw` — o que o usuário escreveu)
  // ---------------------------------------------------------
  if (!hasPath(src, 'video.width')) {
    warnings.push('video.width em falta — assume 1080');
  }
  if (!hasPath(src, 'video.height')) {
    warnings.push('video.height em falta — assume 1920');
  }
  if (!hasPath(src, 'cards.palette.accent')) {
    errors.push('cards.palette.accent em falta na configuração');
  }
  if (!hasPath(src, 'voice.engine') && !hasPath(src, 'voice.voicecraft')) {
    warnings.push('voice.engine em falta — assume fallback padrão');
  }

  // Script: obrigatório apenas se não houver arquivo externo via --script
  const hasInlineScript = hasPath(src, 'script') && Array.isArray(src.script?.scenes) && src.script.scenes.length > 0;
  if (!hasInlineScript && !opts.hasExternalScript) {
    errors.push('script em falta (defina em clone.config.json ou passe --script <ficheiro.json>)');
  }

  // ---------------------------------------------------------
  // 2. CHECAGENS DE VALORES E FAIXAS (sobre `cfg` — já com defaults)
  // ---------------------------------------------------------
  if (cfg.video) {
    if (typeof cfg.video.width !== 'number' || cfg.video.width < 360) {
      errors.push(`video.width inválido (${cfg.video.width})`);
    }
    if (typeof cfg.video.height !== 'number' || cfg.video.height < 640) {
      errors.push(`video.height inválido (${cfg.video.height})`);
    }
  }

  // Regra crítica do CONTRATO_FABRICA.md §3.4 e §11:
  // textStyle.mode === 'caption' + motion.enabled === true gera composições vazias.
  // Só é um erro quando o path EffectCraft está mesmo em uso — com
  // cards.topEngine === "remotion" o buildMotionCards() nem corre, e a frase
  // grande continua a ser queimada na camada ASS (sem composições vazias).
  const effectcraftPath = String(cfg.cards?.topEngine || '').toLowerCase() !== 'remotion';
  if (effectcraftPath && cfg.cards?.textStyle?.mode === 'caption' && cfg.cards?.motion?.enabled === true) {
    errors.push(
      'Conflito estrutural: cards.textStyle.mode="caption" com cards.motion.enabled=true gera composições sem texto. Use mode="layers" ou desative o motion.'
    );
  }

  // ---------------------------------------------------------
  // 3. CHECAGENS DO MOTOR (valores jaKnown no cfg mesclado)
  // ---------------------------------------------------------
  const C = cfg.cards || {};
  for (const key of ['kicker', 'headline', 'body']) {
    if (!C[key] || !Number.isFinite(Number(C[key].size))) {
      errors.push('cards.' + key + '.size tem de ser um numero');
    }
  }
  const engine = String(C.topEngine || '').toLowerCase();
  if (engine && !CARD_ENGINES.includes(engine)) {
    errors.push('cards.topEngine "' + engine + '" nao existe (opcoes: ' + CARD_ENGINES.join(', ') + ')');
  }
  const below = C.belowText || {};
  if (below.mode && !['keywords', 'full', 'off'].includes(String(below.mode))) {
    errors.push('cards.belowText.mode "' + below.mode + '" nao existe (opcoes: keywords, full, off)');
  }
  const ts = C.textStyle || {};
  if (ts.captionWords && !['keywords', 'full'].includes(String(ts.captionWords))) {
    errors.push('cards.textStyle.captionWords "' + ts.captionWords + '" nao existe (opcoes: keywords, full)');
  }

  const L = cfg.languages || {};
  if (!L.default) errors.push('languages.default em falta');
  if (!Array.isArray(L.supported) || !L.supported.length) {
    errors.push('languages.supported tem de ser uma lista com pelo menos um idioma');
  }
  if (Array.isArray(L.supported) && L.default && !L.supported.includes(L.default)) {
    warnings.push('languages.default ("' + L.default + '") nao esta em languages.supported');
  }

  const voiceEngine = String(cfg.voice?.engine || '').toLowerCase();
  if (voiceEngine && !VOICE_ENGINES.includes(voiceEngine)) {
    errors.push('voice.engine "' + voiceEngine + '" nao existe (opcoes: ' + VOICE_ENGINES.join(', ') + ')');
  }

  // Caminhos: --validate não escreve nada — só verifica se o destino é usável.
  const workDir = cfg.paths?.workDir;
  if (!workDir) {
    errors.push('paths.workDir em falta — onde sao gravados os builds');
  } else {
    try {
      if (!fs.existsSync(workDir)) {
        const parent = path.dirname(workDir);
        if (!fs.existsSync(parent)) {
          errors.push('paths.workDir nao pode ser criado (o pai nao existe: ' + parent + ')');
        }
      } else if (!fs.statSync(workDir).isDirectory()) {
        errors.push('paths.workDir existe mas nao e uma pasta: ' + workDir);
      }
    } catch (e) {
      errors.push('paths.workDir nao pode ser verificado (' + workDir + '): ' + e.message);
    }
  }
  if (cfg.avatar?.enabled) {
    const avatars = cfg.avatar.avatars || {};
    const names = Object.keys(avatars);
    if (!names.length) errors.push('avatar.enabled=true mas avatar.avatars esta vazio');
    if (cfg.avatar.default && names.length && !avatars[cfg.avatar.default]) {
      errors.push('avatar.default "' + cfg.avatar.default + '" nao existe em avatar.avatars');
    }
  }
  if (cfg.music?.path && !fs.existsSync(cfg.music.path)) {
    warnings.push('music.path nao existe: ' + cfg.music.path);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
