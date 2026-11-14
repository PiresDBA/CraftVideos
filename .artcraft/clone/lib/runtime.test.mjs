import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, httpGet, httpPost, detectVRAM, pythonEnv, findFfmpeg } from './runtime.mjs';

function server(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

test('run devolve o codigo de saida e o stdout', async () => {
  const r = await run(process.execPath, ['-e', 'console.log("ola")']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /ola/);
});

test('run devolve stderr e codigo != 0 sem rebentar', async () => {
  const r = await run(process.execPath, ['-e', 'console.error("falhou"); process.exit(3)']);
  assert.equal(r.code, 3);
  assert.match(r.stderr, /falhou/);
});

test('run com comando inexistente devolve code -1', async () => {
  const r = await run('comando-que-nao-existe-xyz', []);
  assert.equal(r.code, -1);
  assert.ok(r.stderr.length > 0);
});

test('run com timeout termina o processo e devolve code -2', async () => {
  const r = await run(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 1200 });
  assert.equal(r.code, -2);
  assert.match(r.stderr, /timeout/);
});

test('run passa o cwd pedido', async () => {
  const r = await run(process.execPath, ['-e', 'console.log(process.cwd())'], { cwd: os.tmpdir() });
  assert.equal(r.code, 0);
  assert.match(r.stdout.toLowerCase(), new RegExp(os.tmpdir().toLowerCase().replace(/\\/g, '\\\\')));
});

test('run passa o env pedido', async () => {
  const r = await run(process.execPath, ['-e', 'console.log(process.env.MARCADOR_TESTE)'], {
    env: Object.assign({}, process.env, { MARCADOR_TESTE: 'valor' }),
  });
  assert.match(r.stdout, /valor/);
});

// ---- httpGet

test('httpGet envia os headers (a key do Pexels nunca era enviada)', async () => {
  const { srv, port } = await server((req, res) => {
    res.end(req.headers.authorization || 'nenhum');
  });
  const r = await httpGet('http://127.0.0.1:' + port + '/', { Authorization: 'chave-secreta' });
  assert.equal(r.code, 200);
  assert.equal(r.body, 'chave-secreta');
  srv.close();
});

test('httpGet funciona em http:// (antes so sabia https)', async () => {
  const { srv, port } = await server((req, res) => res.end('ok'));
  const r = await httpGet('http://127.0.0.1:' + port + '/x');
  assert.equal(r.code, 200);
  assert.equal(r.body, 'ok');
  srv.close();
});

test('httpGet devolve o codigo HTTP do servidor', async () => {
  const { srv, port } = await server((req, res) => { res.statusCode = 401; res.end('sem chave'); });
  const r = await httpGet('http://127.0.0.1:' + port + '/');
  assert.equal(r.code, 401);
  srv.close();
});

test('httpGet com URL invalida resolve em vez de rejeitar', async () => {
  const r = await httpGet('nao-e-um-url');
  assert.equal(r.code, -1);
  assert.match(r.body, /URL invalida/);
});

// ---- httpPost

test('httpPost envia o body JSON', async () => {
  const { srv, port } = await server((req, res) => {
    let data = '';
    req.on('data', (d) => { data += d; });
    req.on('end', () => { res.statusCode = 201; res.end(data); });
  });
  const r = await httpPost('http://127.0.0.1:' + port + '/', { 'Content-Type': 'application/json' }, { a: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { a: 1 });
  srv.close();
});

test('httpPost devolve erro em HTTP != 200/201', async () => {
  const { srv, port } = await server((req, res) => { res.statusCode = 500; res.end('explodiu'); });
  const r = await httpPost('http://127.0.0.1:' + port + '/', {}, { a: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'explodiu');
  srv.close();
});

test('httpPost com URL invalida devolve erro em vez de rebentar', async () => {
  const r = await httpPost('nao-e-um-url', {}, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /URL invalida/);
});

// ---- pythonEnv

test('pythonEnv põe o ffmpeg no PATH sem duplicar', () => {
  const ffmpeg = path.join('C:\\', 'tools', 'ffmpeg-9.0.1-win32-x64', 'bin', 'ffmpeg.exe');
  const env1 = pythonEnv(ffmpeg);
  const env2 = pythonEnv(ffmpeg);
  const bin = path.dirname(ffmpeg);
  const count = (env) => String(env.PATH || '').split(';').filter((p) => p.toLowerCase() === bin.toLowerCase()).length;
  assert.equal(count(env1), 1, 'o binario do ffmpeg deve aparecer uma vez');
  assert.equal(count(env2), 1, 'a segunda chamada nao pode duplicar');
});

test('pythonEnv poe PYTHONIOENCODING=utf-8', () => {
  assert.equal(pythonEnv('').PYTHONIOENCODING, 'utf-8');
});

// ---- outros

test('detectVRAM devolve um numero (0 sem nvidia-smi)', async () => {
  const v = await detectVRAM();
  assert.equal(typeof v, 'number');
  assert.ok(v >= 0);
});

test('findFfmpeg devolve string', () => {
  const out = findFfmpeg('ffmpeg', '');
  assert.equal(typeof out, 'string');
});

test('findFfmpeg respeita o caminho explicito', () => {
  const fake = path.join(os.tmpdir(), 'ffmpeg-explicito-' + Date.now() + '.exe');
  fs.writeFileSync(fake, 'x');
  assert.equal(findFfmpeg('ffmpeg', fake), fake);
  fs.unlinkSync(fake);
});

test('findFfmpeg com caminho explicito inexistente cai na busca', () => {
  const out = findFfmpeg('ffmpeg', path.join(os.tmpdir(), 'nao-existe-' + Date.now() + '.exe'));
  // devolve '' (nao achou) ou um caminho que existe de facto
  if (out) assert.ok(fs.existsSync(out), 'devolve um caminho que nao existe: ' + out);
});
