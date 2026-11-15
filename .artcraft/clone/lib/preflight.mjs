/**
 * PREFLIGHT — valida tudo ANTES do pipeline gastar 20+ minutos.
 *
 * Porque existe: um clone morreu no passo 5/6, depois de 22 minutos de
 * LivePortrait e TTS, com `ERRO: lipSyncByLang is not defined`. Outro clone
 * "funcionou" mas os avatares sairam ruins porque o motor usava o driver
 * generico (d13.pkl) e a base v1, em vez dos driving templates por avatar
 * (work/avatars/driving_templates/*.mp4) gerados sobre as bases v2.
 *
 * Nenhum dos dois erros era visivel antes de comecar. Este modulo e o hook
 * que os apanha em segundos.
 */

import fs from 'node:fs';
import path from 'node:path';

export const ROOT = 'D:\\CRAFT';
export const PASTA_DRIVERS = path.join(ROOT, 'work', 'avatars', 'driving_templates');
export const BASES_V2 = path.join(ROOT, 'work', 'avatars', 'v2');

// Base (imagem) com que cada driving template foi gerado. Derivado do
// mapeamento de work/avatars/v3/gerar-driving-templates-f3.py.
// Se a imagem do avatar nao for a mesma, a identidade do personagem no video
// nao bate certo com a do template -> o avatar sai "estranho".
export const BASE_DO_TEMPLATE = {
  'frida_anchor_neutral_breathing.mp4': 'frida_v2_base.png',
  'frida_anchor_emphatic_nod.mp4': 'frida_v2_base.png',
  'frida_listening_to_luna.mp4': 'frida_v2_base.png',
  'luna_cohost_listening_react.mp4': 'luna_v2_base.png',
  'luna_cohost_curious_headtilt.mp4': 'luna_v2_base.png',
  'luna_cohost_skeptical_ironic.mp4': 'luna_v2_base.png',
};

// Drivers genericos do LivePortrait: funcionam, mas nao sao o modelo de
// avatar do projeto (que e o conjunto em driving_templates).
export const DRIVERS_GENERICOS = /(^|[\\/])(d\d+\.(pkl|mp4))$/i;

export function resolvePath(p) {
  if (!p) return '';
  if (path.isAbsolute(p)) return p;
  return path.join(ROOT, p);
}

/** Templates referenciados pelos beats de um script. */
export function templatesDoScript(scenes) {
  const out = new Map(); // templatePath -> { avatar, beats: [] }
  for (const sc of scenes || []) {
    const who = sc.avatar || sc.presenter || sc.active_speaker;
    for (const key of Object.keys(sc || {})) {
      if (!key.endsWith('_state')) continue;
      const st = sc[key];
      const tpl = st && st.driving_template;
      if (!tpl) continue;
      const abs = resolvePath(tpl);
      if (!out.has(abs)) out.set(abs, { avatar: who, beats: [], raw: tpl });
      out.get(abs).beats.push(key);
    }
  }
  return out;
}

/**
 * @returns {{ok:boolean, errors:string[], warnings:string[], notes:string[], checked:number}}
 */
export function runPreflight(cfg, script, opts = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  let checked = 0;

  const scenes = (script && script.scenes) || [];

  // ---- 1. avatares referenciados -------------------------------------------------
  const registry = (cfg && cfg.avatar && cfg.avatar.avatars) || {};
  const speakers = new Set();
  for (const sc of scenes) {
    const who = sc.avatar || sc.presenter || sc.active_speaker;
    if (who) speakers.add(who);
  }
  if (!speakers.size && cfg && cfg.avatar && cfg.avatar.default) speakers.add(cfg.avatar.default);

  for (const who of speakers) {
    checked++;
    const a = registry[who];
    if (!a) {
      errors.push('avatar "' + who + '" nao existe em cfg.avatar.avatars');
      continue;
    }
    const src = resolvePath(a.sourceImage);
    if (!src || !fs.existsSync(src)) {
      errors.push('avatar "' + who + '": sourceImage em falta -> ' + a.sourceImage);
      continue;
    }
    notes.push('avatar ' + who + ': base ' + path.basename(src));

    // A base tem de ser a mesma com que os templates deste avatar foram gerados.
    const templatesDeste = [...templatesDoScript(scenes).keys()].filter(t =>
      path.basename(t).startsWith(who + '_') || path.basename(t).startsWith(who + '-')
    );
    for (const tpl of templatesDeste) {
      const baseEsperada = BASE_DO_TEMPLATE[path.basename(tpl)];
      if (!baseEsperada) continue;
      if (path.basename(src) !== baseEsperada) {
        errors.push(
          'avatar "' + who + '": o driving template "' + path.basename(tpl) + '" foi gerado sobre "' +
          baseEsperada + '", mas a config aponta para "' + path.basename(src) + '" — ' +
          'a identidade do personagem no video nao vai bater certo com a do template'
        );
      }
    }
  }

  // ---- 2. driving templates referenciados -----------------------------------------
  const tpls = templatesDoScript(scenes);
  for (const [abs, info] of tpls) {
    checked++;
    if (!fs.existsSync(abs)) {
      errors.push('driving_template em falta: ' + info.raw + ' (avatar ' + info.avatar + ', beats ' + info.beats.join(', ') + ')');
      continue;
    }
    notes.push('template: ' + path.basename(abs) + ' (' + info.avatar + ', ' + info.beats.length + ' beat(s))');
  }

  // ---- 3. drivers genericos no lugar do modelo do projeto --------------------------
  for (const who of speakers) {
    const a = registry[who];
    if (!a) continue;
    const dv = a.drivingVideo || '';
    if (dv && DRIVERS_GENERICOS.test(resolvePath(dv))) {
      const temTemplate = [...tpls.keys()].some(t => path.basename(t).startsWith(who));
      if (!temTemplate) {
        warnings.push(
          'avatar "' + who + '" usa o driver generico ' + path.basename(dv) +
          ' — o modelo do projeto sao os templates em work/avatars/driving_templates/'
        );
      }
    }
  }

  // ---- 4. binarios externos ---------------------------------------------------------
  const ff = (cfg && cfg.paths && cfg.paths.ffmpeg) || '';
  if (ff && !fs.existsSync(resolvePath(ff))) errors.push('ffmpeg nao encontrado: ' + ff);
  const py = (cfg && cfg.avatar && cfg.avatar.liveportrait && cfg.avatar.liveportrait.pythonPath) || '';
  if (py && !fs.existsSync(resolvePath(py))) errors.push('python do LivePortrait nao encontrado: ' + py);

  // ---- 5. pasta de templates ---------------------------------------------------------
  if (!fs.existsSync(PASTA_DRIVERS)) {
    warnings.push('pasta de driving templates nao existe: ' + PASTA_DRIVERS);
  }

  return { ok: errors.length === 0, errors, warnings, notes, checked };
}

export function formatPreflight(r) {
  const lines = [];
  lines.push('PREFLIGHT: ' + (r.ok ? 'OK' : 'FALHOU') + ' (' + r.checked + ' verificacaooes)');
  r.notes.forEach(n => lines.push('  ok   ' + n));
  r.warnings.forEach(w => lines.push('  aviso ' + w));
  r.errors.forEach(e => lines.push('  ERRO ' + e));
  return lines.join('\n');
}
