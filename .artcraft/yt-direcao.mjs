#!/usr/bin/env node
// =============================================================================
// ENRIQUECER E VALIDAR O PLANO COM O CONTRATO DE DIRECAO
// =============================================================================
//
// MANUAL DE USO
// -------------
// Proposito:
//   Enriquece um plano editorial (os beats p01..p28 do EDL) com o CONTRATO
//   DE DIRECAO: quem fala em cada beat, com que emocao, para onde olham, com
//   que enquadramento e que banda superior. O resultado e um plano novo,
//   com o contrato escrito dentro de cada beat.
//
//   O plano de entrada NUNCA e alterado: o EDL (.artcraft\yt-edl.mjs) pode
//   ser re-executado a qualquer momento e este comando volta a aplicar o
//   contrato sobre o resultado.
//
// Parametros CLI:
//   --plan <ficheiro>     plano de entrada (JSON com "scenes": [...]) [obrig.]
//   --out <ficheiro>      onde escrever o plano enriquecido. Sem este
//                         parametro nada e escrito (modo --validate).
//   --direcao <ficheiro>  direccao editorial escrita a mao, por id de beat
//                         (JSON: { "p01": { "frida_state": { ... } } }).
//                         Sobrepoe-se ao que foi inferido.
//   --config <ficheiro>   configuracao central (clone.config.json). Serve
//                         para herdar o motor da banda superior. [opcional]
//   --validate            so diagnostica: nao escreve nada.
//   --set <a=b>           sobrepoe um valor do contrato (ver em baixo).
//   --ajuda               mostra esta ajuda.
//
// Sobreposicoes (--set), todas opcionais:
//   --set falantes=frida,luna      quem sao as apresentadoras, por ordem
//                                   [apresentadora, comentarista]
//   --set motorBanda=effectcraft   motor da banda superior
//   --set presetBanda=E2_caption_top  preset da banda superior
//
// Entradas:
//   O plano de entrada tem de ter "scenes" (ou "beats") como array. Cada
//   cena e um beat do EDL:
//     { id, parent, seconds, avatar, kicker, headline, body, text, narration,
//       framing, motion }
//
// Saidas:
//   --out <ficheiro>  o plano enriquecido (JSON, 2 espaços). Cada beat ganha
//                      active_speaker, frida_state, luna_state e
//                      top_band_visual.
//   stdout            o resumo: quantos beats, quem fala, quantos invalidos,
//                      e a tabela de direccao de cada beat.
//
// Codigo de saida:
//   0  tudo valido
//   1  ha beats invalidos no contrato (o ficheiro NAO e escrito)
//   2  erro de uso (plano em falta, JSON invalido, etc.)
//
// Dependencias: apenas Node.js (zero rede, zero GPU, zero ffmpeg).
//
// Exemplos:
//   node .artcraft\yt-direcao.mjs --plan work\clones\edl-ref5\plan.json \
//        --out work\clones\edl-ref5\plan-direcao.json
//   node .artcraft\yt-direcao.mjs --plan work\clones\edl-ref5\plan-direcao.json --validate
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicarDirecaoAoPlano, aplicarDirecaoEditorial, resumoDirecao, validarDirecao, enquadramentoDoBeat, enquadramentosDoPlano } from './clone/lib/direcao.mjs';

// ---------------------------------------------------------------------------
// Leitura dos argumentos da linha de comando.
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);

/** Le o valor de um parametro: --nome valor ou --nome=valor. */
function arg(nome, def = '') {
  const i = argv.indexOf('--' + nome);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const found = argv.find((a) => a.startsWith('--' + nome + '='));
  if (found) return found.slice(nome.length + 3);
  return def;
}

/** Todas as occurencias de --set (a=b, repetivel). */
function argTodos(nome) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--' + nome && argv[i + 1]) out.push(argv[i + 1]);
    else if (argv[i].startsWith('--' + nome + '=')) out.push(argv[i].slice(nome.length + 3));
  }
  return out;
}

const temFlag = (nome) => argv.includes('--' + nome);
const AJUDA = temFlag('ajuda') || temFlag('help');

const PLAN = arg('plan');
const OUT = arg('out');
const DIRECAO = arg('direcao');
const CONFIG = arg('config', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'clone.config.json'));
const VALIDAR = temFlag('validate');

/** Valores por omissao do contrato, sobreponiveis por --set. */
const opcoes = {
  falantes: undefined,
  motorBanda: undefined,
  presetBanda: undefined,
};

// As sobreposicoes --set sao lidas primeiro: o que o operador escreve na
// linha de comando tem de ganhar ao que vier do config central.
for (const s of argTodos('set')) {
  const eq = s.indexOf('=');
  if (eq < 0) continue;
  const chave = s.slice(0, eq).trim();
  const valor = s.slice(eq + 1).trim();
  if (chave === 'falantes') opcoes.falantes = valor.split(',').map((x) => x.trim()).filter(Boolean);
  else if (chave === 'motorBanda') opcoes.motorBanda = valor;
  else if (chave === 'presetBanda') opcoes.presetBanda = valor;
}

if (AJUDA) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

if (!PLAN) {
  console.error('falta --plan <ficheiro.json>');
  console.error('exemplo: node .artcraft\\yt-direcao.mjs --plan work\\clones\\edl-ref5\\plan.json --out work\\clones\\edl-ref5\\plan-direcao.json');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 1) Ler o plano de entrada.
// ---------------------------------------------------------------------------
if (!fs.existsSync(PLAN)) {
  console.error('plano nao encontrado: ' + PLAN);
  process.exit(2);
}

let plano;
try {
  plano = JSON.parse(fs.readFileSync(PLAN, 'utf8').replace(/^\uFEFF/, ''));
} catch (e) {
  console.error('plano invalido (JSON): ' + e.message);
  process.exit(2);
}

// O plano pode usar "scenes" (EDL e script) ou "beats".
const scenes = Array.isArray(plano.scenes) ? plano.scenes
  : Array.isArray(plano.beats) ? plano.beats : null;
if (!scenes) {
  console.error('o plano nao tem "scenes" nem "beats": ' + PLAN);
  process.exit(2);
}
const planoNormalizado = Array.isArray(plano.scenes) ? plano : Object.assign({}, plano, { scenes });

// ---------------------------------------------------------------------------
// 2) Herdar o motor da banda superior do config central (se existir).
//    O config e opcional: sem ele, o contrato usa o motor oficial
//    (effectcraft) e o preset E2_caption_top.
// ---------------------------------------------------------------------------
if (opcoes.motorBanda === undefined && fs.existsSync(CONFIG)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8').replace(/^\uFEFF/, ''));
    const motor = cfg.cards && cfg.cards.topEngine ? String(cfg.cards.topEngine).toLowerCase() : '';
    if (motor === 'effectcraft' || motor === 'remotion' || motor === 'figcraft') opcoes.motorBanda = motor;
  } catch {
    console.log('aviso: config ilegivel, a usar o motor oficial (effectcraft)');
  }
}

// ---------------------------------------------------------------------------
// 3) Enriquecer o plano com o contrato.
// ---------------------------------------------------------------------------
let enriquecido = aplicarDirecaoAoPlano(planoNormalizado, opcoes);

// ---- 3b) Sobrepor a direccao editorial escrita a mao (o que o operador
//          editou: emocoes, olhares, trocas de falante).
let ignorados = [];
if (DIRECAO) {
  if (!fs.existsSync(DIRECAO)) {
    console.error('ficheiro de direccao nao encontrado: ' + DIRECAO);
    process.exit(2);
  }
  let editorial;
  try {
    editorial = JSON.parse(fs.readFileSync(DIRECAO, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    console.error('ficheiro de direccao invalido (JSON): ' + e.message);
    process.exit(2);
  }
  const aplicado = aplicarDirecaoEditorial(enriquecido, editorial);
  enriquecido = aplicado.plano;
  ignorados = aplicado.ignorados;
}

enriquecido.direcao = {
  versao: 1,
  geradoPor: 'yt-direcao.mjs',
  geradoEm: new Date().toISOString(),
  fonte: path.basename(PLAN),
  editorial: DIRECAO ? path.basename(DIRECAO) : null,
  falantes: opcoes.falantes || ['frida', 'luna'],
  motorBanda: opcoes.motorBanda || 'effectcraft',
};

// ---------------------------------------------------------------------------
// 4) Validar beat a beat e fixar o enquadramento de cada beat.
// ---------------------------------------------------------------------------
const invalidos = [];
const avisos = [];

// A regra da alternancia dinamica: entrada e saida de cada bloco de
// falante em plano duplo, miolo em close-up da falante activa.
const enquadramentos = enquadramentosDoPlano(enriquecido);

for (let i = 0; i < enriquecido.scenes.length; i++) {
  const beat = enriquecido.scenes[i];
  const r = validarDirecao(beat);
  for (const e of r.erros) invalidos.push((beat.id || 'beat' + (i + 1)) + ': ' + e);
  for (const a of r.avisos) avisos.push((beat.id || 'beat' + (i + 1)) + ': ' + a);
  // O enquadramento do beat tambem fica registado no proprio beat: e o
  // que a F4 vai ler para decidir entre plano duplo e close-up.
  // A direccao editorial pode forcar o plano; so quando nao foi forcado
  // e que se aplica a regra automatica.
  if (!beat.camera_framing) beat.camera_framing = enquadramentos[i] || enquadramentoDoBeat(beat, i);
}

// ---------------------------------------------------------------------------
// 5) Relatorio.
// ---------------------------------------------------------------------------
const resumo = resumoDirecao(enriquecido);
console.log('plano      : ' + PLAN);
console.log('beats      : ' + resumo.total);
console.log('falantes   : Frida ' + resumo.frida + ' | Luna ' + resumo.luna);
console.log('motor banda: ' + enriquecido.direcao.motorBanda);
console.log('');

for (let i = 0; i < enriquecido.scenes.length; i++) {
  const b = enriquecido.scenes[i];
  const estado = b.active_speaker === 'frida' ? b.frida_state : b.luna_state;
  console.log(
    (b.id || 'beat' + (i + 1)).padEnd(6) +
    ' fala: ' + String(b.active_speaker).padEnd(6) +
    ' emocao: ' + String(estado.emotion).padEnd(11) +
    ' olhar: ' + String(estado.eye_target).padEnd(8) +
    ' cabeca: ' + String(estado.head_action).padEnd(16) +
    ' plano: ' + b.camera_framing
  );
}

if (avisos.length) {
  console.log('');
  console.log('avisos (' + avisos.length + '):');
  for (const a of avisos.slice(0, 12)) console.log('  ! ' + a);
  if (avisos.length > 12) console.log('  ... e mais ' + (avisos.length - 12));
}

if (ignorados.length) {
  console.log('');
  console.log('entradas editoriais SEM beat correspondente (' + ignorados.length + '):');
  for (const id of ignorados) console.log('  ? ' + id);
}

if (invalidos.length) {
  console.log('');
  console.log('ERROS (' + invalidos.length + ') — o plano nao foi escrito:');
  for (const e of invalidos.slice(0, 20)) console.log('  x ' + e);
  if (invalidos.length > 20) console.log('  ... e mais ' + (invalidos.length - 20));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 6) Escrever o resultado (se houver --out e nao for so --validate).
// ---------------------------------------------------------------------------
if (OUT && !VALIDAR) {
  const destino = path.resolve(OUT);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(enriquecido, null, 2) + '\n', 'utf8');
  console.log('');
  console.log('escrito    : ' + destino);
} else if (VALIDAR) {
  console.log('');
  console.log('modo --validate: nada foi escrito.');
} else {
  console.log('');
  console.log('sem --out: nada foi escrito (use --out <ficheiro> ou --validate).');
}
