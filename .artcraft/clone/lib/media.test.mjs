import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sceneVisual } from './media.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clone-media-'));

function makeVisual(dir, name, size = 32) {
  const folder = path.join(dir, 'visuals');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, name);
  fs.writeFileSync(file, Buffer.alloc(size, 1));
  return file;
}

test('sceneVisual devolve null quando nao ha nada', () => {
  const dir = tmp();
  assert.equal(sceneVisual([{}], dir, 0), null);
});

test('sceneVisual encontra scene01.png na pasta visuals', () => {
  const dir = tmp();
  const file = makeVisual(dir, 'scene01.png');
  assert.equal(sceneVisual([{}], dir, 0), file);
});

test('sceneVisual prefere video sobre imagem', () => {
  const dir = tmp();
  makeVisual(dir, 'scene01.png');
  const video = makeVisual(dir, 'scene01.mp4');
  assert.equal(sceneVisual([{}], dir, 0), video);
});

test('sceneVisual respeita o indice da cena', () => {
  const dir = tmp();
  makeVisual(dir, 'scene01.png');
  const second = makeVisual(dir, 'scene02.png');
  assert.equal(sceneVisual([{}, {}], dir, 1), second);
});

test('REGRESSAO: ignoreVisualsFolder devolve null mesmo com footage na pasta', () => {
  // o bug do P0: com topEngine=remotion a pasta visuals/ (footage da referencia)
  // nao pode entrar na banda de cima.
  const dir = tmp();
  makeVisual(dir, 'scene01.mp4');
  assert.equal(sceneVisual([{}], dir, 0, { ignoreVisualsFolder: true }), null);
});

test('REGRESSAO: scene.visual explicito conta mesmo com ignoreVisualsFolder', () => {
  const dir = tmp();
  makeVisual(dir, 'scene01.mp4');
  const mine = path.join(dir, 'meu-material.mp4');
  fs.writeFileSync(mine, Buffer.alloc(64, 1));
  const out = sceneVisual([{ visual: mine }], dir, 0, { ignoreVisualsFolder: true });
  assert.equal(out, mine);
});

test('sceneVisual ignora scene.visual que nao existe', () => {
  const dir = tmp();
  makeVisual(dir, 'scene01.png');
  const out = sceneVisual([{ visual: path.join(dir, 'fantasma.png') }], dir, 0);
  assert.equal(out, path.join(dir, 'visuals', 'scene01.png'));
});

test('sceneVisual devolve null se a pasta nao for legivel', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'visuals'));
  // 'visuals' e um ficheiro, nao uma pasta
  fs.rmSync(path.join(dir, 'visuals'), { recursive: true, force: true });
  fs.writeFileSync(path.join(dir, 'visuals'), 'nao e uma pasta');
  assert.equal(sceneVisual([{}], dir, 0), null);
});
