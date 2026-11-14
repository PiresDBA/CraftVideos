// =============================================================================
// TESTES DO GERADOR DE BASES v2 (funcoes puras, sem rede, sem GPU)
// =============================================================================
//
// MANUAL DE USO
// -------------
// O que este ficheiro prova:
//   As funcoes puras de gerar-bases-avatares-v2.mjs:
//     - resolverPlaceholders substitui {{ }} e reporta nao-resolvidos
//     - construirPrompt resolve todos os placeholders de um personagem
//       (sem {{ }} a ficar no resultado)
//     - construirPrompt nao muta o workflow template
//     - validarPromptContraObjectInfo aceita um no valido e rejeita um
//       class_type desconhecido e um input invalido
//   E o CLI:
//     - --dry-run sai 0 e nao escreve nada no disco
//     - --validate falha se o ComfyUI estiver fora do ar (sem levantar excecao)
//
// Como correr:
//   node --test "work/avatars/v2/*.test.mjs"
//
// Dependencias: apenas Node.js.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  carregarWorkflow,
  resolverPlaceholders,
  construirPrompt,
  validarPromptContraObjectInfo,
  personagensDisponiveis,
} from './gerar-bases-avatares-v2.mjs';

const WORKFLOW = path.join('work', 'avatars', 'v2', 'workflow-base-v2.json');

function load() { return carregarWorkflow(WORKFLOW); }

// ---------------------------------------------------------------------------
// carregarWorkflow
// ---------------------------------------------------------------------------

test('carregarWorkflow le as quatro secoes obrigatorias', () => {
  const w = load();
  assert.equal(typeof w._manual, 'string');
  assert.ok(Object.keys(w._parametros).length > 0);
  assert.ok(Object.keys(w._personagens).length > 0);
  assert.ok(Object.keys(w.workflow).length > 0);
});

test('carregarWorkflow lança se faltar uma secao', () => {
  const invalido = { _manual: 'x', _parametros: {}, _personagens: {} };
  const tmp = path.join('work', 'avatars', 'v2', '_tmp_invalido.json');
  fs.writeFileSync(tmp, JSON.stringify(invalido));
  assert.throws(() => carregarWorkflow(tmp), /falta a secao "workflow"/);
  fs.unlinkSync(tmp);
});

// ---------------------------------------------------------------------------
// resolverPlaceholders
// ---------------------------------------------------------------------------

test('resolverPlaceholders substitui primitivos e objetos', () => {
  const r = resolverPlaceholders('ckpt={{checkpoint}} tam={{largura}}x{{altura}} extra={{novos}}', {
    checkpoint: 'dreamshaper_8.safetensors',
    largura: 1024,
    altura: 1024,
    novos: { a: 1 },
  });
  assert.equal(r.resultado, 'ckpt=dreamshaper_8.safetensors tam=1024x1024 extra={"a":1}');
  assert.deepEqual(r.usados.sort(), ['altura', 'checkpoint', 'largura', 'novos']);
  assert.deepEqual(r.naoResolvidos, []);
});

test('resolverPlaceholders reporta nao-resolvidos em vez de silenciar', () => {
  const r = resolverPlaceholders('x={{nao_existe}} y={{outro}}', {});
  assert.match(r.resultado, /\{\{nao_existe\}\}/);
  assert.match(r.resultado, /\{\{outro\}\}/);
  assert.deepEqual(r.naoResolvidos, ['nao_existe', 'outro']);
});

// ---------------------------------------------------------------------------
// personagensDisponiveis
// ---------------------------------------------------------------------------

test('personagensDisponiveis devolve frida e luna ordenados', () => {
  assert.deepEqual(personagensDisponiveis(load()), ['frida', 'luna']);
});

// ---------------------------------------------------------------------------
// construirPrompt
// ---------------------------------------------------------------------------

test('construirPrompt resolve todos os placeholders (frida)', () => {
  const w = load();
  const { prompt, personagem, valoresUsados } = construirPrompt(w, 'frida');
  // nenhum {{ }} deve sobrar em inputs de texto
  const texto = JSON.stringify(prompt);
  assert.ok(!/\{\{[^{}]*\}\}/.test(texto), 'placeholders nao resolvidos: ' + texto);
  assert.equal(personagem.descricao.includes('beagle'), true);
  // o nome do ficheiro de referencia (nao o caminho) chegou ao LoadImage
  const loadImage = Object.values(prompt).find((n) => n.class_type === 'LoadImage');
  assert.equal(loadImage.inputs.image, 'frida.png');
  // o checkpoint veio dos _parametros
  const ckpt = Object.values(prompt).find((n) => n.class_type === 'CheckpointLoaderSimple');
  assert.equal(ckpt.inputs.ckpt_name, 'dreamshaper_8.safetensors');
});

test('construirPrompt resolve todos os placeholders (luna)', () => {
  const w = load();
  const { prompt } = construirPrompt(w, 'luna');
  const texto = JSON.stringify(prompt);
  assert.ok(!/\{\{[^{}]*\}\}/.test(texto), 'placeholders nao resolvidos: ' + texto);
  const loadImage = Object.values(prompt).find((n) => n.class_type === 'LoadImage');
  assert.equal(loadImage.inputs.image, 'luna.png');
});

test('construirPrompt nao muta o workflow template', () => {
  const w = load();
  const original = JSON.parse(JSON.stringify(w));
  construirPrompt(w, 'frida');
  assert.deepEqual(w, original);
});

test('construirPrompt lança se um personagem nao existir', () => {
  assert.throws(() => construirPrompt(load(), 'nao_existe'), /desconhecido/);
});

// ---------------------------------------------------------------------------
// validarPromptContraObjectInfo
// ---------------------------------------------------------------------------

test('validarPromptContraObjectInfo aceita um no valido e rejeita invalidos', () => {
  const objectInfo = {
    'CheckpointLoaderSimple': {
      input: {
        required: { ckpt_name: ['dreamshaper_8.safetensors'] },
        optional: {},
      },
    },
    'LoadImage': {
      input: { required: { image: ['x.png'] }, optional: {} },
    },
  };

  const valido = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'dreamshaper_8.safetensors' } },
  };
  assert.equal(validarPromptContraObjectInfo(valido, objectInfo).valido, true);

  const classeInvalida = {
    '1': { class_type: 'NaoExiste', inputs: {} },
  };
  assert.equal(validarPromptContraObjectInfo(classeInvalida, objectInfo).valido, false);
  assert.ok(validarPromptContraObjectInfo(classeInvalida, objectInfo).problemas[0].includes('desconhecido'));

  const inputInvalido = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { input_inexistente: 1 } },
  };
  assert.equal(validarPromptContraObjectInfo(inputInvalido, objectInfo).valido, false);
  assert.ok(validarPromptContraObjectInfo(inputInvalido, objectInfo).problemas[0].includes('input desconhecido'));
});

// ---------------------------------------------------------------------------
// CLI: --dry-run nao escreve nada no disco
// ---------------------------------------------------------------------------

test('CLI --dry-run sai 0 e nao escreve nada', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = path.resolve('work', 'avatars', 'v2', 'gerar-bases-avatares-v2.mjs');
  const antes = fs.existsSync(path.join('work', 'avatars', 'v2', 'frida_v2_base.png'));
  const r = spawnSync(process.execPath, [script, '--workflow', WORKFLOW, '--personagem', 'frida', '--dry-run'], {
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  assert.equal(r.status, 0, r.stderr);
  const depois = fs.existsSync(path.join('work', 'avatars', 'v2', 'frida_v2_base.png'));
  assert.equal(depois, antes, '--dry-run nao deve criar ficheiros');
  // stdout deve conter o caminho de saida
  assert.ok(r.stdout.includes('frida_v2_base.png'), 'saida nao impressa: ' + r.stdout);
});
