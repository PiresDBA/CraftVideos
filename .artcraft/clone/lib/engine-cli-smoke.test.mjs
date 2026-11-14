// =============================================================================
// TESTE DE FUMO DA LINHA DE COMANDO DO MOTOR
// =============================================================================
//
// MANUAL DE USO
// -------------
// O que este ficheiro testa:
//   O motor (.artcraft/yt-clone-build.mjs) e um programa de linha de comando,
//   nao uma biblioteca: os seus modos de diagnostico (--validate, --dry-run)
//   sao o que se corre ANTES de gastar minutos de render e quota de voz.
//
// Que bugs apanha (todos reais, de 2026-11-13):
//   1. Config sem seccao "script" + "--script cenas.json" rebentava com
//      "TypeError: Cannot read properties of undefined (reading 'kicker')"
//      em tres sítios do motor (os caminhos EffectCraft, Remotion e FigCraft).
//   2. Uma cena sem texto fazia o motor usar a variavel "phrase" antes da
//      declaracao (TDZ) -> ReferenceError que matava o build inteiro.
//   3. Um "--script" com caminho errado era ignorado em silencio: o motor
//      compunha o guiao da config e produzia um video com o conteudo errado.
//   4. "--slug ../../.." escrevia fora da pasta de builds.
//
// Como e que funciona:
//   Cada teste lanca o motor como processo filho (spawnSync) com uma config
//   temporaria e um script temporario, e olha para o codigo de saida e para
//   o texto que ele imprime. Nao toca em nenhum ficheiro do workspace: a
//   config e o script vivem numa pasta temporaria do sistema, removida no fim.
//
// Como correr:
//   node --test ".artcraft/clone/lib/*.test.mjs"
//
// Dependencias: apenas Node.js (nada de rede, nada de GPU, nada de ffmpeg).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';

// A pasta deste ficheiro e .artcraft/clone/lib — o motor esta dois niveis acima.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', '..', 'yt-clone-build.mjs');

// Pastas temporarias: limpam-se no fim (sem lixo no %TEMP%).
const created = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-smoke-'));
  created.push(dir);
  return dir;
};
after(() => {
  for (const dir of created) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ja foi */ }
  }
});

/**
 * Config minima valida. NAO tem seccao "script" de proposito: e o caso que
 * rebentava antes (o motor lia cfg.script.kicker sem verificar).
 */
function minimalConfig(workDir) {
  return {
    video: { width: 720, height: 1280, fps: 30 },
    cards: { palette: { bg: '#F0E6D8', ink: '#111111', accent: '#FF8A3D' } },
    languages: { default: 'pt-BR', supported: ['pt-BR'] },
    voice: { engine: 'sapi' },
    paths: { workDir },
  };
}

/** Script de duas cenas, uma delas sem texto (o caso do TDZ). */
function twoSceneScript() {
  return {
    kicker: 'DARK',
    scenes: [
      { id: 's01', text: 'AGENTES IA EXECUTAM', narration: 'Os agentes executam tarefas.' },
      { id: 's02', narration: 'Uma cena sem texto de topo.' },
    ],
  };
}

/** Corre o motor e devolve { code, out } sem nunca rebentar o teste. */
function runEngine(args, cwd) {
  const r = spawnSync(process.execPath, [ENGINE, ...args], {
    cwd: cwd || tmp(),
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true,
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('fumo: --validate passa com config minima + --script', () => {
  const dir = tmp();
  const cfgFile = path.join(dir, 'clone.config.json');
  const scriptFile = path.join(dir, 'cenas.json');
  fs.writeFileSync(cfgFile, JSON.stringify(minimalConfig(dir), null, 2));
  fs.writeFileSync(scriptFile, JSON.stringify(twoSceneScript(), null, 2));

  const r = runEngine(['--config', cfgFile, '--script', scriptFile, '--validate'], dir);
  assert.equal(r.code, 0, 'saida inesperada:\n' + r.out);
  assert.match(r.out, /config valida/);
});

test('fumo: --validate sem script da erro claro (nao rebenta)', () => {
  const dir = tmp();
  const cfgFile = path.join(dir, 'clone.config.json');
  fs.writeFileSync(cfgFile, JSON.stringify(minimalConfig(dir), null, 2));

  const r = runEngine(['--config', cfgFile, '--validate'], dir);
  assert.equal(r.code, 1, 'saida inesperada:\n' + r.out);
  assert.match(r.out, /script em falta/);
  assert.ok(!/TypeError|ReferenceError/.test(r.out), 'o motor rebentou:\n' + r.out);
});

test('fumo: --dry-run com config sem seccao script nao rebenta (bug do cfg.script.kicker)', () => {
  const dir = tmp();
  const cfgFile = path.join(dir, 'clone.config.json');
  const scriptFile = path.join(dir, 'cenas.json');
  fs.writeFileSync(cfgFile, JSON.stringify(minimalConfig(dir), null, 2));
  fs.writeFileSync(scriptFile, JSON.stringify(twoSceneScript(), null, 2));

  const r = runEngine(['--config', cfgFile, '--script', scriptFile, '--dry-run'], dir);
  assert.ok(!/TypeError|ReferenceError|Cannot read properties/.test(r.out), 'o motor rebentou:\n' + r.out);
  assert.match(r.out, /cenas\s+:\s+2/);
  assert.match(r.out, /--dry-run/);
});

test('fumo: --script inexistente falha com mensagem (nao e ignorado em silencio)', () => {
  const dir = tmp();
  const cfgFile = path.join(dir, 'clone.config.json');
  fs.writeFileSync(cfgFile, JSON.stringify(minimalConfig(dir), null, 2));

  const r = runEngine(['--config', cfgFile, '--script', path.join(dir, 'nao-existe.json'), '--dry-run'], dir);
  assert.equal(r.code, 2, 'saida inesperada:\n' + r.out);
  assert.match(r.out, /script nao encontrado/);
});

test('fumo: --slug com traversal nao escreve fora da pasta de builds', () => {
  const dir = tmp();
  const cfgFile = path.join(dir, 'clone.config.json');
  const scriptFile = path.join(dir, 'cenas.json');
  const workDir = path.join(dir, 'work');
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(cfgFile, JSON.stringify(minimalConfig(workDir), null, 2));
  fs.writeFileSync(scriptFile, JSON.stringify(twoSceneScript(), null, 2));

  const r = runEngine([
    '--config', cfgFile, '--script', scriptFile,
    '--slug', '../../escapou', '--dry-run',
  ], dir);
  assert.ok(!/TypeError|ReferenceError/.test(r.out), 'o motor rebentou:\n' + r.out);
  // o slug tem de ter sido saneado: nada pode ter escapado da pasta de trabalho
  const escaped = path.resolve(workDir, '..', '..', 'escapou');
  assert.ok(!fs.existsSync(escaped), 'o slug escapou da pasta de builds: ' + escaped);
});
