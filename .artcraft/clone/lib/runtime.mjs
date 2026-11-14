/**
 * Infraestrutura de execucao — processos, rede, ffmpeg, GPU.
 *
 * Fica num modulo para que o resto do pipeline nunca precise de saber de
 * onde veio o ffmpeg, nem lidar com `require` dentro de ESM, nem esquecer
 * headers HTTP.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { spawn } from 'node:child_process';

/**
 * Corre um comando e devolve { code, stdout, stderr } — nunca lanca.
 *
 * O pipeline inspecciona o `code` para decidir se repete por outro provider,
 * por isso a execucao nao pode explodir: um `throw` perderia o stderr, que e
 * onde esta a raza da falha.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} opts  { cwd, env, timeoutMs }
 *   cwd         directorio de trabalho. Por omissao, o directorio de onde o
 *               processo foi lancado (`process.cwd()`) — os caminhos que o
 *               pipeline passa sao absolutos, por isso o valor raramente
 *               importa; passe-o explicitamente quando importa.
 *   timeoutMs   quando o processo passa deste tempo, e' terminado e a promise
 *               resolve com `code: -2` (em vez de ficar pendurada para sempre).
 */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const spawnOpts = { windowsHide: true, cwd: opts.cwd || process.cwd() };
    if (opts.env) spawnOpts.env = opts.env;

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(cmd, args, spawnOpts);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => finish({ code: -1, stdout, stderr: String(e.message) }));
    child.on('close', (code) => finish({ code, stdout, stderr }));

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        stderr += '\n[timeout] ' + opts.timeoutMs + ' ms excedidos — processo terminado';
        killTree(child);
        finish({ code: -2, stdout, stderr });
      }, opts.timeoutMs);
      if (timer.unref) timer.unref();
    }
  });
}

/**
 * Termina um processo e a sua arvore.
 *
 * No Windows, `child.kill()` mata so o processo directo: um `node` que lanca
 * `python` que lanca `ffmpeg` deixa o ffmpeg a correr (e a segurar o ficheiro
 * de saida). `taskkill /T /F` mata a arvore toda.
 */
function killTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    try { child.kill(); } catch { /* ja morreu */ }
  }
}

/**
 * ffmpeg/ffprobe estao instalados mas NAO estao no PATH desta maquina.
 * Procura-os nos sitios known (hermes tools, WinGet) — mesma politica do media.mjs.
 */
export function findFfmpeg(name, explicit, home) {
  const HOME = home || os.homedir();
  if (explicit && fs.existsSync(explicit)) return explicit;
  const roots = [
    path.join(HOME, 'AppData', 'Local', 'hermes', 'tools'),
    path.join(HOME, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (!/ffmpeg/i.test(entry)) continue;
      const base = path.join(root, entry);
      const candidates = [
        path.join(base, 'bin', name + '.exe'),
        path.join(base, 'ffmpeg-9.0.1-win32-x64', 'bin', name + '.exe'),
      ];
      for (const c of candidates) if (fs.existsSync(c)) return c;
      try {
        for (const sub of fs.readdirSync(base)) {
          const p = path.join(base, sub, 'bin', name + '.exe');
          if (fs.existsSync(p)) return p;
        }
      } catch { /* nao e directorio */ }
    }
  }
  return '';
}

/**
 * GET HTTP(S) com headers e timeout.
 *
 * O `headers` e obrigatorio na pratica: sem ele, uma API que exige chave
 * (Pexels) responde 401 e o pipeline continua a baixar zero clips sem dizer
 * nada. Aceita `http://` e `https://` (a escolha da lib e feita pelo
 * protocolo, como em httpPost).
 */
export function httpGet(url, headers = {}, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let lib = https;
    try {
      const u = new URL(url);
      lib = u.protocol === 'http:' ? http : https;
    } catch {
      resolve({ code: -1, body: 'URL invalida: ' + String(url) });
      return;
    }
    const req = lib.get(url, { timeout: timeoutMs, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ code: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ code: -1, body: String(e.message) }));
    req.on('timeout', () => { req.destroy(); resolve({ code: -1, body: 'timeout' }); });
  });
}

/** POST JSON. `https` e `http` sao importados — `require` nao existe em ESM. */
export function httpPost(url, headers = {}, body = null, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      resolve({ ok: false, error: 'URL invalida: ' + String(e.message) });
      return;
    }
    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: headers || { 'Content-Type': 'application/json' },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        const ok = res.statusCode === 200 || res.statusCode === 201;
        try {
          resolve({ ok, data: JSON.parse(data), error: ok ? null : data });
        } catch {
          resolve({ ok, data, error: ok ? null : data });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: String(e.message) }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

/** VRAM total da GPU, em GB (0 se nao houver nvidia-smi). */
export function detectVRAM() {
  return new Promise((resolve) => {
    try {
      const child = spawn('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], { windowsHide: true });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.on('error', () => resolve(0));
      child.on('close', () => {
        const mb = parseInt(String(out).trim().split('\n')[0] || '0', 10);
        resolve(Number.isFinite(mb) ? mb / 1024 : 0);
      });
    } catch {
      resolve(0);
    }
  });
}

/**
 * Ambiente para processos Python que precisam de duas coisas:
 *   - console UTF-8 (o `rich` do LivePortrait desenha emoji e morre em cp1252)
 *   - ffmpeg no PATH da sessao (o Wav2Lip chama ffmpeg e o mantemos de fora do PATH)
 */
export function pythonEnv(ffmpegPath) {
  const env = Object.assign({}, process.env);
  env.PYTHONIOENCODING = 'utf-8';
  env.PYTHONUNBUFFERED = '1';
  if (ffmpegPath) {
    const bin = path.dirname(ffmpegPath);
    const sep = process.platform === 'win32' ? ';' : ':';
    const parts = String(env.PATH || '').split(sep);
    if (!parts.some((p) => p.toLowerCase() === bin.toLowerCase())) {
      env.PATH = bin + sep + (env.PATH || '');
    }
  }
  return env;
}
