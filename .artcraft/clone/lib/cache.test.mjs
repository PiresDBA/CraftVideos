import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashText, narrationFingerprint, narrationCachePath, readNarrationCache, writeNarrationCache } from './cache.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clone-cache-'));

test('hashText e estavel e differente para textos differentes', () => {
  assert.equal(hashText('ola'), hashText('ola'));
  assert.notEqual(hashText('ola'), hashText('olá'));
  assert.equal(hashText('ola').length, 16);
});

test('narrationFingerprint muda quando o texto muda', () => {
  const a = narrationFingerprint('ola mundo', { engine: 'voicecraft', voice: { voice: 'Leda' } });
  const b = narrationFingerprint('ola mundo outro', { engine: 'voicecraft', voice: { voice: 'Leda' } });
  assert.notEqual(a, b);
});

test('narrationFingerprint muda quando a voz muda', () => {
  const a = narrationFingerprint('ola', { engine: 'voicecraft', voice: { voice: 'Leda' } });
  const b = narrationFingerprint('ola', { engine: 'voicecraft', voice: { voice: 'Zephyr' } });
  assert.notEqual(a, b);
});

test('narrationFingerprint nao guarda chaves de API', () => {
  const fp = narrationFingerprint('ola', { engine: 'voicecraft', voice: { voice: 'Leda', apiKey: 'sk-secreto' } });
  assert.ok(!String(fp).includes('sk-secreto'));
  assert.equal(String(fp).length, 16);
});

test('write/read do cache devolve o audio', () => {
  const dir = tmp();
  const audio = path.join(dir, 's01.mp3');
  fs.writeFileSync(audio, Buffer.alloc(4096, 7));
  const fp = narrationFingerprint('ola', { engine: 'voicecraft' });
  writeNarrationCache(dir, 's01', fp, audio, 3.25, 'voicecraft');
  const out = readNarrationCache(dir, 's01', fp);
  assert.ok(out, 'o cache devia devolver um registo');
  assert.equal(out.file, path.resolve(audio));
  assert.equal(out.duration, 3.25);
});

test('o cache e invalido quando a impressao digital muda', () => {
  const dir = tmp();
  const audio = path.join(dir, 's01.mp3');
  fs.writeFileSync(audio, Buffer.alloc(4096, 7));
  writeNarrationCache(dir, 's01', narrationFingerprint('ola', { engine: 'voicecraft' }), audio, 3, 'voicecraft');
  assert.equal(readNarrationCache(dir, 's01', narrationFingerprint('outro', { engine: 'voicecraft' })), null);
});

test('o cache e invalido quando o ficheiro de audio desaparece', () => {
  const dir = tmp();
  const audio = path.join(dir, 's01.mp3');
  fs.writeFileSync(audio, Buffer.alloc(4096, 7));
  const fp = narrationFingerprint('ola', { engine: 'voicecraft' });
  writeNarrationCache(dir, 's01', fp, audio, 3, 'voicecraft');
  fs.unlinkSync(audio);
  assert.equal(readNarrationCache(dir, 's01', fp), null);
});

test('o cache ignora audio demasiado pequeno', () => {
  const dir = tmp();
  const audio = path.join(dir, 's01.mp3');
  fs.writeFileSync(audio, Buffer.alloc(10, 7));
  const fp = narrationFingerprint('ola', { engine: 'voicecraft' });
  writeNarrationCache(dir, 's01', fp, audio, 3, 'voicecraft');
  assert.equal(readNarrationCache(dir, 's01', fp), null);
});

test('o cache sobrevive a um registo corrompido', () => {
  const dir = tmp();
  fs.writeFileSync(narrationCachePath(dir, 's01'), '{isto nao e json');
  assert.equal(readNarrationCache(dir, 's01', 'x'), null);
});
