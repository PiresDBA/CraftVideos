// =============================================================================
// TESTES DE FUMO DA LINHA DE COMANDO DO CONTRATO DE DIRECAO
// =============================================================================
//
// MANUAL DE USO
// -------------
// O que este ficheiro prova:
//   O .artcraft\yt-direcao.mjs e um programa de linha de comando: o que o
//   utilizador ve quando o corre. Estes testes lancam-no como processo filho
//   e verificam o codigo de saida, o que escreve e — o mais importante —
//   que NAO escreve quando ha erros.
//
// Casos apanhados aqui:
//   1. Um plano sem "scenes" tem de dar erro claro (nao um plano vazio
//      silencioso, que depois produziria um video sem beats).
//   2. Um plano inexistente tem de falhar, nao criar um ficheiro novo.
//   3. Um contrato invalido (emocao que nao existe) tem de IMPEDIR a
//      escrita: um plano com "bravo" na emocao nao se anima.
//   4. O plano de entrada nunca pode ser alterado (e um artefacto do EDL,
//      que pode ser re-gerado a qualquer momento).
//   5. A direccao editorial tem de chegar ao plano final.
//
// Como correr:
//   node --test ".artcraft/clone/lib/*.test.mjs"
//
// Dependencias: apenas Node.js. Nada de rede, GPU ou ffmpeg.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';

// A pasta deste ficheiro e .artcraft/clone/lib — o CLI esta dois niveis acima.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..', '..', 'yt-direcao.mjs');

const created = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-direcao-'));
  created.push(dir);
  return dir;
};
after(() => {
  for (const dir of created) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ja foi */ }
  }
});

/** Plano de teste com 4 beats (2 da Frida, 2 da Luna). */
function planoDeTeste() {
  const avatares = ['frida', 'frida', 'luna', 'luna'];
  return {
    version: 1,
    kicker: 'DARK',
    scenes: avatares.map((a, i) => ({
      id: 'p' + String(i + 1).padStart(2, '0'),
      parent: 's01',
      seconds: 2,
      avatar: a,
      kicker: 'DARK',
      headline: 'TITULO ' + (i + 1),
      body: 'corpo',
      text: 'TITULO ' + (i + 1),
      narration: 'fala ' + (i + 1),
      framing: 'wide',
    })),
  };
}

/** Corre o CLI e devolve { code, out }. */
function correr(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true,
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('fumo: enriquece um plano e escreve o resultado', () => {
  const dir = tmp();
  const planFile = path.join(dir, 'plan.json');
  const outFile = path.join(dir, 'plan-direcao.json');
  fs.writeFileSync(planFile, JSON.stringify(planoDeTeste(), null, 2));

  const r = correr(['--plan', planFile, '--out', outFile]);
  assert.equal(r.code, 0, 'saida inesperada:\n' + r.out);
  assert.ok(fs.existsSync(outFile), 'o plano enriquecido nao foi escrito');

  const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(out.scenes.length, 4);
  assert.equal(out.scenes[0].active_speaker, 'frida');
  assert.equal(out.scenes[2].active_speaker, 'luna');
  assert.ok(out.scenes[0].frida_state, 'falta o estado da Frida');
  assert.ok(out.scenes[0].top_band_visual, 'falta a banda superior');
});

test('fumo: o plano de entrada nunca e alterado', () => {
  const dir = tmp();
  const planFile = path.join(dir, 'plan.json');
  const outFile = path.join(dir, 'plan-direcao.json');
  fs.writeFileSync(planFile, JSON.stringify(planoDeTeste(), null, 2));
  const antes = fs.readFileSync(planFile, 'utf8');

  const r = correr(['--plan', planFile, '--out', outFile]);
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.readFileSync(planFile, 'utf8'), antes, 'o plano de entrada foi alterado');
});

test('fumo: um plano sem scenes da erro claro', () => {
  const dir = tmp();
  const planFile = path.join(dir, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ version: 1 }, null, 2));

  const r = correr(['--plan', planFile, '--out', path.join(dir, 'out.json')]);
  assert.equal(r.code, 2, 'saida inesperada:\n' + r.out);
  assert.match(r.out, /scenes/);
  assert.ok(!fs.existsSync(path.join(dir, 'out.json')), 'escreveu apesar do erro');
});

test('fumo: um plano inexistente da erro (nao cria ficheiro nenhum)', () => {
  const dir = tmp();
  const r = correr(['--plan', path.join(dir, 'nao-existe.json'), '--out', path.join(dir, 'out.json')]);
  assert.equal(r.code, 2, 'saida inesperada:\n' + r.out);
  assert.match(r.out, /nao encontrado/);
  assert.ok(!fs.existsSync(path.join(dir, 'out.json')));
});

test('fumo: --validate nao escreve nada', () => {
  const dir = tmp();
  const planFile = path.join(dir, 'plan.json');
  const outFile = path.join(dir, 'out.json');
  fs.writeFileSync(planFile, JSON.stringify(planoDeTeste(), null, 2));

  const r = correr(['--plan', planFile, '--out', outFile, '--validate']);
  assert.equal(r.code, 0, r.out);
  assert.ok(!fs.existsSync(outFile), '--validate nao pode escrever');
});

test('fumo: a direccao editorial chega ao plano final', () => {
  const dir = tmp();
  const planFile = path.join(dir, 'plan.json');
  const dirFile = path.join(dir, 'editorial.json');
  const outFile = path.join(dir, 'out.json');
  fs.writeFileSync(planFile, JSON.stringify(planoDeTeste(), null, 2));
  fs.writeFileSync(dirFile, JSON.stringify({
    p01: {
      frida_state: { emotion: 'excited' },
      luna_state: { eye_target: 'frida' },
    },
  }, null, 2));

  const r = correr(['--plan', planFile, '--direcao', dirFile, '--out', outFile]);
  assert.equal(r.code, 0, r.out);
  const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(out.scenes[0].frida_state.emotion, 'excited');
  assert.equal(out.scenes[0].luna_state.eye_target, 'frida');
  // o que a editorial nao escreveu mantem o inferido
  assert.equal(out.scenes[0].frida_state.eye_target, 'camera');
});

test('fumo: um contrato invalido impede a escrita', () => {
  const dir = tmp();
  const planFile = path.join(dir, 'plan.json');
  const dirFile = path.join(dir, 'editorial.json');
  const outFile = path.join(dir, 'out.json');
  fs.writeFileSync(planFile, JSON.stringify(planoDeTeste(), null, 2));
  // "bravo" nao existe no catalogo de emocoes
  fs.writeFileSync(dirFile, JSON.stringify({ p01: { frida_state: { emotion: 'bravo' } } }, null, 2));

  const r = correr(['--plan', planFile, '--direcao', dirFile, '--out', outFile]);
  assert.equal(r.code, 1, 'saida inesperada:\n' + r.out);
  assert.match(r.out, /emotion/);
  assert.ok(!fs.existsSync(outFile), 'escreveu um plano invalido');
});

test('fumo: sem --plan da erro de uso', () => {
  const r = correr(['--out', 'x.json']);
  assert.equal(r.code, 2, 'saida inesperada:\n' + r.out);
  assert.match(r.out, /--plan/);
});
