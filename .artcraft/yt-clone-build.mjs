#!/usr/bin/env node
/**
 * Dark channel clone pipeline â€” full featured.
 *
 * Turns a script into finished videos (one per language) using:
 *   FigCraft  : typographic cards (PNG) + thumbnail
 *   TTS       : SAPI (Windows, pt-BR), FilmCraft (en-US), ElevenLabs, XTTS, Kokoro, custom CLI
 *   Avatar    : local video file, HeyGen, Synthesia, D-ID, or AI-generated (Craft Anything)
 *   B-roll    : Pexels, Pixabay, or local folder
 *   ffmpeg    : Ken Burns + transitions + narration + music + subtitles + avatar overlay -> MP4
 *   YouTube   : optional upload via OAuth2
 *
 * Everything parameterised by clone.config.json + `--set` overrides.
 *
 * Usage:
 *   node yt-clone-build.mjs [--config clone.config.json] [--script cenas.json]
 *                            [--out dir] [--slug nome] [--voice sapi|filmcraft|elevenlabs|xtts|kokoro|custom|none]
 *                            [--music arquivo.mp3] [--transition xfade|none]
 *                            [--set video.width=1920 --set cards.headline.size=96 ...]
 *                            [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { renderKineticCard, remotionAvailable, REMOTION_COMPOSER } from './yt-motion-remotion.mjs';

// ---- modulos internos (logica pura isolada e testavel)
import { loadConfig as loadConfigFile, validateConfig, redactConfig, rawConfig } from './clone/lib/config.mjs';
import { run, findFfmpeg, httpGet, httpPost, detectVRAM, pythonEnv } from './clone/lib/runtime.mjs';
import { wrap, keyWords, keywordsWithFallback, styleWords, sceneKicker } from './clone/lib/text.mjs';
import { layoutMetrics, sceneLayout, textAnchorY } from './clone/lib/layout.mjs';
import { writeSceneASS, buildASS, buildSRT } from './clone/lib/ass.mjs';
import { narrationFingerprint, readNarrationCache, writeNarrationCache } from './clone/lib/cache.mjs';
import { sceneVisual } from './clone/lib/media.mjs';
import { runPreflight, formatPreflight, resolvePath as resolveProjectPath, speakerOf } from './clone/lib/preflight.mjs';
import { ensureSeamlessLoop, probeDuration as probeMediaDuration } from './clone/lib/seamless.mjs';
import { aplicarDirecaoAoPlano } from './clone/lib/direcao.mjs';

// ---- OPUS 5.5 REFERENCE-FIRST PHASE (import dinamico para path Windows)
let _opus5 = null;
async function carregarOpus5() {
  if (!_opus5) {
    const mod = await import('file:///D:/CRAFT/work/opus5-reference/index.mjs');
    _opus5 = mod;
  }
  return _opus5;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

// A raiz do workspace e a pasta que contem este ficheiro (.artcraft/).
// Antes era "D:\\CRAFT" fixo, o que partia o motor em qualquer outra
// maquina â€” num repo publico isso e fatal. Resolver a partir do proprio
// ficheiro torna o pipeline portavel: clona-se a pasta e funciona.
const CC = path.resolve(HERE, '..');

// ---------------------------------------------------------------- args

const ARG_ERRORS = [];
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (value === undefined || String(value).startsWith('--')) {
    ARG_ERRORS.push('falta o valor de --' + name);
    return fallback;
  }
  return value;
}
function argAll(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--' + name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}
const FLAG = (name) => process.argv.includes('--' + name);

// Timeouts dos processos (ms). Sem estes limites, um ffmpeg, um TTS ou um
// script Python encravado pendura o build para sempre â€” e nao ha forma de
// saber se o processo vai acabar. O runtime.mjs termina a arvore de
// processos (taskkill /T /F no Windows) quando o tempo expira.
const TIMEOUT = {
  ffprobe: 60 * 1000,          // 1 min â€” so le metadados
  ffmpeg: 15 * 60 * 1000,      // 15 min â€” um render de cena
  tts: 5 * 60 * 1000,          // 5 min â€” uma locucao
  python: 30 * 60 * 1000,      // 30 min â€” LivePortrait/Wav2Lip sao lentos
  cli: 10 * 60 * 1000,         // 10 min â€” EffectCraft/FigCraft/FilmCraft
};

const CONFIG_PATH = arg('config', path.join(CC, 'clone.config.json'));
const SCRIPT_PATH_ARGV = arg('script', '');
let SCRIPT_PATH = SCRIPT_PATH_ARGV;
const OUT_DIR = arg('out', '');
const SLUG = arg('slug', '');
const VOICE = arg('voice', '');
const MUSIC_FILE = arg('music', '');
const TRANSITION_TYPE = arg('transition', '');
const DRY = FLAG('dry-run');
const VALIDATE = FLAG('validate');
const W2L = FLAG('wav2lip');
const VISUALS_VIDEO = arg('visuals-video', '');
const DRIVING_VIDEO = arg('driving-video', '');
// --url / --video <ficheiro>: a referencia a clonar. Sem isto o build usava
// SEMPRE as cenas do clone.config.json e a referencia era ignorada — foi
// por isso que o clone de 2026-11-15 saiu generico e desligado da origem.
const URL_REF = arg('url', '');
const VIDEO_REF = arg('video', '');
const REF_SCENES = Number(arg('ref-scenes', '6'));
const REF_TOPIC = arg('ref-topic', '');

// ---------------------------------------------------------------- config

/** `--set cards.headline.size=96` -> deep assignment. Values are JSON when they parse. */


// ---------------------------------------------------------------- process helpers


let FFMPEG = findFfmpeg('ffmpeg', '');
let FFPROBE = findFfmpeg('ffprobe', '');

// ---------------------------------------------------------------- Wav2Lip (lip-sync audio-driven)
// Wav2Lip esta instalado localmente em tools/Wav2Lip. Nao e invocado por default;
// ative com --wav2lip ou wav2lip.enabled=true no clone.config.json.
const WAV2LIP_PY = 'D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe';
const WAV2LIP_INFERENCE = path.join(CC, 'tools', 'Wav2Lip', 'inference.py');
const WAV2LIP_CHECKPOINT = path.join(CC, 'tools', 'Wav2Lip', 'checkpoints', 'wav2lip_gan.pth');
const FLAG_WAV2LIP = FLAG('wav2lip');

async function probeDuration(file) {
  if (!FFPROBE || !fs.existsSync(file)) return 0;
  const r = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeoutMs: TIMEOUT.ffprobe });
  const n = Number(String(r.stdout).trim());
  return Number.isFinite(n) ? n : 0;
}


function httpDownload(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ ok: true })));
    }).on('error', (e) => resolve({ ok: false, error: String(e.message) }));
  });
}


// ---------------------------------------------------------------- VRAM Detection & Engine Selection

/** Detect available VRAM via nvidia-smi. Returns VRAM in GB (float) or 0 if no GPU. */
async function selectAvatarEngine(cfg) {
  const avatarCfg = cfg.avatar || {};
  const cloudCfg = avatarCfg.cloud || {};
  
  // Explicit engine override
  if (avatarCfg.engine && avatarCfg.engine !== 'auto') {
    console.log('  avatar engine (manual): ' + avatarCfg.engine);
    return avatarCfg.engine;
  }

  const vram = await detectVRAM();
  console.log('  VRAM detectada: ' + vram.toFixed(2) + ' GB');

  const fallbackOrder = avatarCfg.fallbackOrder || ['liveportrait', 'musetalk', 'hunyuan', 'cloud', 'cards'];
  
  for (const engine of fallbackOrder) {
    const engCfg = avatarCfg[engine] || {};
    if (!engCfg.enabled) continue;

    const minVRAM = {
      liveportrait: engCfg.mode === 'cpu' ? 0 : 6,  // 6GB mÃ­nimo com otimizaÃ§Ãµes
      musetalk: 16,
      hunyuan: 24,
      cloud: 0,  // cloud nÃ£o precisa VRAM local
      cards: 0
    }[engine] || 999;

    if (vram >= minVRAM) {
      console.log('  avatar engine (auto): ' + engine + ' (VRAM ok: ' + vram.toFixed(1) + ' >= ' + minVRAM + ')');
      return engine;
    }
    console.log('  avatar engine: ' + engine + ' pulado (VRAM: ' + vram.toFixed(1) + ' < ' + minVRAM + ')');
  }

  console.log('  avatar engine: cards (fallback - nenhum engine viÃ¡vel)');
  return 'cards';
}

/**
 * Run LivePortrait via Docker or the local Python interpreter.
 *
 * LivePortrait's CLI takes a DIRECTORY in -o, not a file: it names the output itself
 * (source--driving.mp4). So we pass a scratch dir and resolve the file afterwards.
 * `source-max-dim` is the VRAM lever â€” 512 keeps a 6 GB card out of trouble.
 */
async function runLivePortrait(cfg, avatarCfg, sourceImage, drivingVideo, outFile, dir) {
  const lp = avatarCfg.liveportrait || {};
  const mode = lp.mode || 'python';
  // driving templates e source images podem vir RELATIVOS (ex.: vindos do
  // contrato de direcao / scenes[].*.driving_template), mas o LivePortrait
  // resolve contra o proprio cwd (repoPath). Normaliza para absoluto aqui.
  const resolvePathSafe = (p) => {
    if (!p) return p;
    return path.isAbsolute(p) ? p : path.resolve(CC, p);
  };
  sourceImage = resolvePathSafe(sourceImage);
  drivingVideo = resolvePathSafe(drivingVideo);
  if (!sourceImage || !fs.existsSync(sourceImage)) {
    throw new Error('source image not found: ' + sourceImage);
  }
  if (!drivingVideo || !fs.existsSync(drivingVideo)) {
    throw new Error('driving template not found: ' + drivingVideo);
  }
  const device = lp.device === 'auto' ? (await detectVRAM() >= 6 ? 'cuda' : 'cpu') : (lp.device || 'cpu');
  const res = Number(lp.resolution || 512);
  const stitching = lp.stitching !== false;
  const ret = lp.retargeting || { eyes: false, lips: false };
  const useFp16 = lp.precision === 'fp16';
  const forceCpu = device === 'cpu';
  const deviceId = Number(lp.deviceId || 0);

  // LivePortrait writes into a directory and names the file itself
  const outDir = path.dirname(outFile);
  fs.mkdirSync(outDir, { recursive: true });
  const scratch = path.join(dir, 'build', 'lp-out');
  fs.mkdirSync(scratch, { recursive: true });

  const inferArgs = [
    '-s', sourceImage,
    '-d', drivingVideo,
    '-o', scratch,
    stitching ? '--flag-stitching' : '--no-flag-stitching',
    '--flag-relative-motion',
    '--flag-pasteback',
    '--source-max-dim', String(res),
    useFp16 ? '--flag-use-half-precision' : '--no-flag-use-half-precision',
    forceCpu ? '--flag-force-cpu' : '--no-flag-force-cpu',
    '--device-id', String(deviceId),
    '--animation-region', 'all',
    '--driving-option', lp.drivingOption || 'expression-friendly',
    '--det-thresh', String(lp.detThresh || 0.15),
  ];
  if (ret.eyes) inferArgs.push('--flag-eye-retargeting');
  if (ret.lips) inferArgs.push('--flag-lip-retargeting');
  if (lp.normalizeLip) inferArgs.push('--flag-normalize-lip');

  let cmd;
  let args;
  let cwd;

  if (mode === 'docker') {
    cmd = 'docker';
    args = [
      'run', '--rm',
      '--gpus', forceCpu ? 'none' : 'all',
      '-v', lp.repoPath.replace(/\\/g, '/') + ':/workspace',
      '-v', outDir.replace(/\\/g, '/') + ':/out',
      '-v', scratch.replace(/\\/g, '/') + ':/scratch',
      lp.dockerImage || 'liveportrait:latest',
      'python', 'inference.py',
      '-s', sourceImage.replace(/\\/g, '/'),
      '-d', drivingVideo.replace(/\\/g, '/'),
      '-o', '/scratch',
    ];
  } else {
    // Python mode: use the interpreter that already has a working CUDA build
    // (e.g. the ComfyUI venv â€” installing torch from scratch is a 2.5 GB detour).
    cmd = lp.pythonPath || 'python';
    cwd = lp.repoPath || path.join(CC, 'tools', 'LivePortrait');
    args = [path.join(cwd, 'inference.py')].concat(inferArgs);
    if (!fs.existsSync(cmd)) throw new Error('interprete nao encontrado: ' + cmd);
    if (!fs.existsSync(path.join(cwd, 'inference.py'))) throw new Error('LivePortrait nao encontrado em ' + cwd);
  }

  console.log('  LivePortrait (' + mode + '): ' + cmd);
  console.log('    ' + args.join(' ') + (cwd ? '\n    cwd: ' + cwd : ''));
  // PYTHONIOENCODING: LivePortrait prints emoji via `rich`, which crashes on a cp1252 console.
  // PATH: it shells out to ffmpeg, and ffmpeg is deliberately not on this machine's PATH.
  const r = await run(cmd, args, { cwd: cwd || dir, env: pythonEnv(FFMPEG), timeoutMs: TIMEOUT.python });
  if (r.code !== 0) throw new Error('LivePortrait falhou: ' + String(r.stderr).slice(-600));

  // Resolve the file LivePortrait actually produced
  const produced = findLivePortraitOutput(scratch);
  if (!produced) throw new Error('LivePortrait nao produziu video em ' + scratch);
  fs.copyFileSync(produced, outFile);
  return { ok: true, produced: produced };
}

function findLivePortraitOutput(scratchDir) {
  if (!fs.existsSync(scratchDir)) return null;
  let best = null;
  let bestM = -1;
  for (const entry of fs.readdirSync(scratchDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(mp4|mov|gif)$/i.test(entry.name)) continue;
    const p = path.join(scratchDir, entry.name);
    const m = fs.statSync(p).mtimeMs;
    if (m > bestM) {
      bestM = m;
      best = p;
    }
  }
  return best;
}

/** Wav2Lip â€” re-rende os lÃ¡bios do avatar para bater com o Ã¡udio da narraÃ§Ã£o.
 *
 * Entrada: vÃ­deo do avatar (LivePortrait) + Ã¡udio da narraÃ§Ã£o.
 * SaÃ­da: mesmo vÃ­deo com boca sincronizada palavra-a-palavra.
 *
 * Requisitos de ambiente (ja verificados localmente):
 *   - Python: D:\Comfy\ComfyUI\venv\Scripts\python.exe  (NAO o python do PATH)
 *   - PYTHONIOENCODING=utf-8
 *   - ffmpeg no PATH da sessao (o Wav2Lip shella-out para ffmpeg no final)
 *   - Pasta temp/ existente no cwd do processo
 *
 * Ative com --wav2lip na linha de comando ou wav2lip.enabled=true no clone.config.json.
 */
async function wav2lipSync(cfg, faceFile, audioFile, outFile, dir) {
  const py = cfg.w2l && cfg.w2l.python ? cfg.w2l.python : WAV2LIP_PY;
  const ckpt = cfg.w2l && cfg.w2l.checkpoint ? cfg.w2l.checkpoint : WAV2LIP_CHECKPOINT;
  const nosmooth = cfg.w2l && cfg.w2l.nosmooth !== false;
  const tempDir = path.join(dir, 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  const env = Object.assign({}, process.env);
  env.PYTHONIOENCODING = 'utf-8';
  const ffBin = path.dirname(FFMPEG || '');
  const sep = process.platform === 'win32' ? ';' : ':';
  env.PATH = ffBin + sep + (env.PATH || '');
  // Wav2Lip escreve temp/result.avi relativo ao cwd -> forca cwd no dir do projeto
  const args = [
    WAV2LIP_INFERENCE,
    '--checkpoint_path', ckpt,
    '--face', faceFile,
    '--audio', audioFile,
    '--outfile', outFile,
  ];
  if (nosmooth) args.push('--nosmooth');
  const r = await run(py, args, { cwd: dir, env: env, timeoutMs: TIMEOUT.python });
  if (r.code !== 0) {
    const errOut = String(r.stderr || r.out).slice(-900);
    throw new Error('Wav2Lip falhou (codigo ' + r.code + '): ' + errOut);
  }
  if (!fs.existsSync(outFile)) throw new Error('Wav2Lip nao produziu ' + outFile);
  return { ok: true, file: outFile };
}

/** Generate driving video from audio (TTS) for LivePortrait. */
async function generateDrivingVideo(cfg, audioFile, outFile, dir) {
  // Simple approach: create a silent video with face landmarks matching audio duration
  // For now, use a pre-recorded driving video or generate from first card
  // TODO: implement proper driving generation from audio landmarks
  console.log('  Driving video: usando fonte padrÃ£o (precisa driving real para lip-sync perfeito)');
  return { ok: true, file: outFile };
}

/** Run cloud avatar (RunPod) for engines needing high VRAM. */
async function runCloudAvatar(cfg, avatarCfg, engine, params, dir) {
  const cloud = avatarCfg.cloud || {};
  const provider = cloud.provider || 'runpod';
  
  if (provider === 'runpod') return await runRunPod(cfg, cloud.runpod, engine, params, dir);
  // vastai/lambda: o cliente HTTP existe (runtime.httpPost) mas os bindings
  // destes dois fornecedores nao foram escritos. Falhar com uma mensagem clara
  // e' melhor do que um ReferenceError em producao.
  if (provider === 'vastai' || provider === 'lambda') {
    throw new Error(
      'cloud.provider "' + provider + '" ainda nao tem integracao implementada â€” ' +
      'use "runpod" ou ponha avatar.engine = "cards" para working sem cloud'
    );
  }

  throw new Error('Cloud provider nÃ£o suportado: ' + provider);
}

/** RunPod integration - create pod, upload files, run inference, download result. */
async function runRunPod(cfg, runpodCfg, engine, params, dir) {
  if (!runpodCfg.apiKey) throw new Error('RunPod API key nÃ£o configurada');
  
  const baseUrl = 'https://api.runpod.io/graphql';
  const headers = { 'Authorization': 'Bearer ' + runpodCfg.apiKey, 'Content-Type': 'application/json' };
  
  // 1. Create pod
  const createPodMutation = `
    mutation CreatePod($input: PodInput!) {
      podCreate(input: $input) { id desiredStatus imageName }
    }
  `;
  
  const podInput = {
    name: 'avatar-' + engine + '-' + Date.now(),
    imageName: runpodCfg.templateId || 'runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04',
    gpuTypeId: runpodCfg.gpuType || 'RTX 3090',
    gpuCount: runpodCfg.gpuCount || 1,
    volumeInGb: 20,
    containerDiskInGb: 20,
    ports: '8000/http,8888/http',
    env: [
      { key: 'ENGINE', value: engine },
      { key: 'PARAMS', value: JSON.stringify(params) }
    ],
    cloudType: 'SECURE',
    minMemoryInGb: 32,
    maxPricePerHour: runpodCfg.maxPricePerHour || 0.50
  };
  
  console.log('  RunPod: criando pod ' + engine + '...');
  const podRes = await httpPost(baseUrl, headers, { query: createPodMutation, variables: { input: podInput } });
  if (!podRes.ok) throw new Error('RunPod create pod falhou: ' + podRes.error);
  const podId = podRes.data?.podCreate?.id;
  if (!podId) throw new Error('RunPod: pod ID nÃ£o retornado');
  
  console.log('  RunPod: pod ' + podId + ' criado, aguardando RUNNING...');
  
  // 2. Wait for pod to be running
  let podStatus = '';
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusQuery = `
      query PodStatus($id: String!) {
        pod(id: $id) { id desiredStatus lastStatusChange }
      }
    `;
    const s = await httpPost(baseUrl, headers, { query: statusQuery, variables: { id: podId } });
    podStatus = s.data?.pod?.desiredStatus || '';
    if (podStatus === 'RUNNING') break;
    console.log('  RunPod: status ' + podStatus + '...');
  }
  if (podStatus !== 'RUNNING') {
    await terminatePod(baseUrl, headers, podId);
    throw new Error('RunPod: pod nÃ£o subiu a tempo (status: ' + podStatus + ')');
  }
  
  // 3. Get pod connection info (SSH/HTTP)
  const connQuery = `
    query PodConn($id: String!) {
      pod(id: $id) { id runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } } }
    }
  `;
  const conn = await httpPost(baseUrl, headers, { query: connQuery, variables: { id: podId } });
  const ports = conn.data?.pod?.runtime?.ports || [];
  const httpPort = ports.find(p => p.privatePort === 8000 && p.isIpPublic);
  if (!httpPort) throw new Error('RunPod: porta 8000 nÃ£o exposta');
  const podUrl = 'http://' + httpPort.ip + ':' + httpPort.publicPort;
  
  console.log('  RunPod: pod rodando em ' + podUrl);
  
  // 4. Call inference API on pod
  const inferRes = await httpPost(podUrl + '/inference', { 'Content-Type': 'application/json' }, {
    engine,
    params,
    outputPath: '/workspace/output.mp4'
  });
  
  if (!inferRes.ok) {
    await terminatePod(baseUrl, headers, podId);
    throw new Error('RunPod inference falhou: ' + inferRes.error);
  }
  
  // 5. Download result
  const outputFile = path.join(dir, 'avatar_' + engine + '.mp4');
  const dlRes = await httpDownload(podUrl + '/download/output.mp4', outputFile);
  
  // 6. Terminate pod (or let idle timeout handle it)
  if (runpodCfg.idleTimeoutSeconds) {
    setTimeout(() => terminatePod(baseUrl, headers, podId), runpodCfg.idleTimeoutSeconds * 1000);
  } else {
    await terminatePod(baseUrl, headers, podId);
  }
  
  console.log('  RunPod: resultado baixado para ' + outputFile);
  return { ok: true, file: outputFile };
}

async function terminatePod(baseUrl, headers, podId) {
  const mutation = `
    mutation TerminatePod($input: PodTerminateInput!) {
      podTerminate(input: $input) { id desiredStatus }
    }
  `;
  await httpPost(baseUrl, headers, { query: mutation, variables: { input: { podId } } });
  console.log('  RunPod: pod ' + podId + ' terminado');
}

async function localizeScenes(cfg, scenes, lang) {
  const def = cfg.languages?.default || 'pt-BR';
  if (lang === def || !cfg.languages?.autoTranslate) return scenes;

  const engine = cfg.languages?.translateEngine || 'google';
  const out = [];
  for (const sc of scenes) {
    const copy = Object.assign({}, sc);
    for (const field of ['kicker', 'headline', 'body', 'narration']) {
      const value = sc[field];
      if (typeof value !== 'string' || !value.trim()) continue;
      const translated = await translateText(value, def, lang, engine);
      if (translated) copy[field] = translated;
    }
    out.push(copy);
  }
  return out;
}

function loadScenes(cfg) {
  // Um --script que nao existe era ignorado em silencio: o motor compilava o
  // guiao da config e produzia um video com o conteudo errado, sem aviso.
  // Agora falha com mensagem clara.
  if (SCRIPT_PATH && !fs.existsSync(SCRIPT_PATH)) {
    console.error('script nao encontrado: ' + SCRIPT_PATH);
    console.error('verifica o caminho (ou tira o --script e usa as cenas da config)');
    process.exit(2);
  }
  if (SCRIPT_PATH) {
    const data = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8').replace(/^\uFEFF/, ''));
    const scenes = data.scenes || [];
    if (!scenes.length) {
      console.error('script sem cenas: ' + SCRIPT_PATH);
      process.exit(2);
    }
    return { kicker: data.kicker || cfg.script?.kicker, scenes, source: SCRIPT_PATH };
  }
  return { kicker: cfg.script?.kicker, scenes: cfg.script?.scenes || [], source: 'clone.config.json' };
}

/** Wrap on word boundaries so the card never overflows and we do not rely on font metrics. */

/**
 * Engine da banda de cima, normalizado. `remotion` = tipografia cinetica original;
 * `effectcraft` = presets do EffectCraft; `figcraft` = cartoes estaticos.
 */
function topEngineOf(cfg) {
  return String((cfg.cards && cfg.cards.topEngine) || '').toLowerCase();
}

// ---------------------------------------------------------------- cards (FigCraft)

function figcraftScript(steps) {
  return steps.map((s) => JSON.stringify(s)).join('\n') + '\n';
}

async function figcraftRun(scriptFile, extra) {
  const r = await run(process.execPath, [path.join(HERE, 'artcraft.mjs'), 'cli', 'figcraft', 'run', scriptFile].concat(extra || []), { timeoutMs: TIMEOUT.cli });
  const ids = [];
  for (const line of String(r.stdout).split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try {
      const j = JSON.parse(s);
      if (j.ok && j.result && j.result.id !== undefined) ids.push(j.result.id);
      if (j.ok === false) return { ok: false, ids, error: j.error || s };
    } catch { /* partial */ }
  }
  return { ok: r.code === 0, ids, error: r.code === 0 ? '' : String(r.stderr).slice(-400) };
}

/**
 * Cartoes ANIMADOS (EffectCraft) em vez de PNG estatico.
 *
 * Cada cena vira uma composicao de 3 s: kicker entra, headline faz "scramble",
 * corpo sobe. O ffmpeg depois segura o ultimo frame ate' ao fim da narracao, por isso
 * 3 s chegam para qualquer duracao de cena.
 *
 * Devolve a mesma forma que buildCards(): { cards:[{scene,name,file}], thumb }.
 */

async function buildMotionCards(cfg, scenes, dir, avatarMode, lang, durations) {
  const C = cfg.cards;
  const LM = layoutMetrics(cfg);
  const W = LM.W;
  // One frame size per scene: a whiteboard shot is full height, a talking-head shot is only
  // the top band. `cardH` is therefore resolved inside the loop.
  const H = LM.cardH;
  const TS = C.textStyle || {};
  // 'caption' = one huge phrase over the frame (what yccXYW5liLE does). 'layers' = the
  // kicker/headline/body stack (what the channel did before). Both stay available.
  const captionMode = TS.mode === 'caption';
  const fps = Number(cfg.video.fps);
  const motion = C.motion || {};
  const seconds = Number(motion.entranceSeconds || 3);
  const cli = motion.cli || 'D:\\CRAFT\\EffectCraft\\effectcraft-cli.exe';
  const scale = W / 1080;
  const pad = Number(C.padding);
  const width = W - pad * 2;
  const layout = avatarMode && C.avatarLayout ? Object.assign({}, C.layout, C.avatarLayout) : C.layout;
  const hSize = (avatarMode && C.avatarHeadline ? C.avatarHeadline.size : C.headline.size) * scale;
  const kSize = (avatarMode && C.avatarKicker ? C.avatarKicker.size : C.kicker.size) * scale;
  const bSize = (avatarMode && C.avatarBody ? C.avatarBody.size : C.body.size) * scale;
  const hChars = avatarMode && C.avatarHeadline ? C.avatarHeadline.maxCharsPerLine : C.headline.maxCharsPerLine;
  const bChars = avatarMode && C.avatarBody ? C.avatarBody.maxCharsPerLine : C.body.maxCharsPerLine;

  const cardsDir = path.join(dir, 'cards', String(lang || 'pt-BR'));
  const buildDir = path.join(dir, 'build');
  fs.mkdirSync(cardsDir, { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });

  if (!fs.existsSync(cli)) throw new Error('effectcraft-cli nao encontrado: ' + cli);

  const steps = [{ command: 'file.newProject', params: {} }];
  const comps = [];

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const compName = 'SC' + String(i + 1).padStart(2, '0');
    comps.push({ compName, scene: sc.id || 's' + (i + 1), layout: sceneLayout(cfg, sc) });
    const SL = sceneLayout(cfg, sc);
    const SH = SL.cardH;

    // Each card lives as long as its narration, so the animation is not a 3 s sticker
    // followed by a frozen frame â€” it breathes with the voice track.
    const told = Number(durations && durations[i] ? durations[i] : 0);
    const sceneSeconds = Math.min(14, Math.max(2, told > 0 ? told + 0.3 : seconds));

    steps.push({
      command: 'comp.new',
      params: { name: compName, width: W, height: SH, frameRate: fps, duration: sceneSeconds, background: C.palette.bg, open: true },
    });

    // Media for the top band. Imported as footage, dropped at the centre of the band and
    // scaled to the band width â€” the comp frame crops the overflow, so it reads as a
    // full-bleed shot instead of a letterboxed thumbnail.
    const visual = sceneVisual(scenes, dir, i, { ignoreVisualsFolder: topEngineOf(cfg) === 'remotion' });
    const onMedia = !!visual;
    if (visual) {
      steps.push({ command: 'file.import', params: { paths: [visual] } });
      steps.push({ command: 'layer.addItem', params: { item: path.basename(visual), position: [Math.round(W / 2), Math.round(SH / 2)] } });
      steps.push({ command: 'layer.transform', params: { op: 'fitWidth' } });
    }
    // Reference shorts 2k4Q3nIjq1U / zYlCtVGRwKo / yccXYW5liLE paint uppercase text straight
    // over the media with a thick coloured outline. Configurable, never hard-coded.
    const onMediaStyle = TS.onMedia || {};
    const upper = TS.uppercase !== false;
    const legibility = (size) =>
      onMedia
        ? {
            applyStroke: true,
            stroke: onMediaStyle.stroke || '#000000',
            strokeWidth: Math.max(3, Math.round(size * Number(onMediaStyle.strokeWidthRatio || 0.07))),
          }
        : {};
    const onMediaFill = (fallback) => (onMedia ? onMediaStyle.fill || '#FFFFFF' : fallback);
    const say = (v) => (upper ? String(v || '').toUpperCase() : String(v || ''));

    const kicker = sceneKicker(sc, cfg, { uppercase: upper });
    const headline = say(Array.isArray(sc.headline) ? sc.headline.join(' ') : sc.headline);
    const body = say(Array.isArray(sc.body) ? sc.body.join(' ') : sc.body);

    // In caption mode the big single phrase is burned later as one ASS layer over the whole
    // frame, presenter included â€” a card can only paint inside its own band. BUT the card
    // still needs its own kicker + headline layers in the top band, otherwise the scene
    // renders an empty cream rectangle (the bug that made ref5-clone's top band blank).
    // So: in caption mode we SKIP ONLY the body (redundant with the ASS headline), not the
    // whole text stack.
    const skipBody = captionMode && !kicker && !headline;

    if (kicker) {
      steps.push({
        command: 'layer.newText',
        params: { text: kicker, name: 'kick', font: C.fontFamily || 'Inter', style: 'Bold', size: Math.round(kSize), fill: C.palette.accent, box: [pad, Math.round(SH * layout.kickerY), width, Math.round(70 * scale)], ...legibility(Math.round(kSize)) },
      });
      steps.push({ command: 'layer.applyTextPreset', params: { layer: 'kick', preset: motion.kickerPreset || 'fadeUpCharacters' } });
    }
    if (headline) {
      const lines = wrap(headline, hChars);
      steps.push({
        command: 'layer.newText',
        params: { text: lines.join('\n'), name: 'head', font: C.fontFamily || 'Inter', style: 'Bold', size: Math.round(hSize), fill: onMediaFill(C.palette.ink), box: [pad, Math.round(SH * layout.headlineY), width, Math.round(430 * scale)], ...legibility(Math.round(hSize)) },
      });
      steps.push({ command: 'layer.applyTextPreset', params: { layer: 'head', preset: motion.headlinePreset || 'scramble' } });
    }
    if (!skipBody && body) {
      const lines = wrap(body, bChars);
      steps.push({
        command: 'layer.newText',
        params: { text: lines.join('\n'), name: 'body', font: C.fontFamily || 'Inter', size: Math.round(bSize), fill: onMediaFill(C.palette.muted), box: [pad, Math.round(SH * layout.bodyY), width, Math.round(280 * scale)], ...legibility(Math.round(bSize)) },
      });
      steps.push({ command: 'layer.applyTextPreset', params: { layer: 'body', preset: motion.bodyPreset || 'fadeUpCharacters' } });
    }
  }

  const scriptFile = path.join(buildDir, 'motion-' + String(lang || 'pt').replace(/[^A-Za-z0-9]/g, '_') + '.jsonl');
  fs.writeFileSync(scriptFile, steps.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');

  const proj = path.join(buildDir, 'motion-' + String(lang || 'pt').replace(/[^A-Za-z0-9]/g, '_') + '.ecproj');
  const build = await run(cli, ['run', '--commands', scriptFile, '--save-as', proj], { timeoutMs: TIMEOUT.cli });
  if (build.code !== 0) throw new Error('effectcraft (build): ' + String(build.stderr).slice(-500));

  const cards = [];
  for (let i = 0; i < comps.length; i++) {
    const out = path.join(cardsDir, 'scene' + String(i + 1).padStart(2, '0') + '.mp4');
    const r = await run(cli, ['render', '--project', proj, '--comp', comps[i].compName, '--out', out, '--format', 'h264', '--fps', String(fps)], { timeoutMs: TIMEOUT.cli });
    if (r.code !== 0 || !fs.existsSync(out)) throw new Error('effectcraft (render ' + comps[i].compName + '): ' + String(r.stderr).slice(-400));
    cards.push({ scene: comps[i].scene, name: comps[i].compName, file: out, motion: true });
  }

  return { cards, thumb: null, doc: proj, motion: true };
}


async function buildRemotionCards(cfg, scenes, dir, avatarMode, lang, durations) {
  const C = cfg.cards;
  const fps = Number(cfg.video.fps);
  const cardsDir = path.join(dir, 'cards', String(lang || 'pt-BR'));
  fs.mkdirSync(cardsDir, { recursive: true });
  if (!remotionAvailable()) throw new Error('remotion-composer nao encontrado em ' + REMOTION_COMPOSER + ' â€” use cards.topEngine: "effectcraft" ou "figcraft"');

  const REMO = C.remotion || {};
  const TS = C.textStyle || {};
  const palette = C.palette || {};
  const cards = [];

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const SL = sceneLayout(cfg, sc);
    // O cartao vive o tempo da narracao (como no EffectCraft) e o build segura o
    // ultimo estado â€” aqui o float continuo nunca deixa a banda ficar parada.
    const told = Number(durations && durations[i] ? durations[i] : 0);
    const seconds = Math.min(14, Math.max(2, told > 0 ? told + 0.3 : 4));

    // So as palavras mais interessantes: headline/texto da cena, depois a
    // reserva (body + narracao) para quando a frase curta nao chega a 2.
    // Sem isto "O QUE SÃƒO AGENTES" desenhava so "AGENTES" na banda de cima.
    const raw = Array.isArray(sc.headline) ? sc.headline.join(' ') : (sc.headline || sc.text || sc.caption || '');
    const words = keywordsWithFallback(
      raw,
      [sc.body, sc.caption, sc.narration],
      REMO.maxWords || 5
    );
    // A banda de cima e tipografia cinetica: uma unica caixa. As palavras do
    // titulo ja vem em CAIXA ALTA, as de reserva nao â€” sem isto a cena ficava
    // "AGENTES | Programas | autonomously" a meio caminho.
    const bandWords = styleWords(words, TS);
    const kicker = sceneKicker(sc, cfg, { uppercase: TS.uppercase !== false });

    const out = path.join(cardsDir, 'scene' + String(i + 1).padStart(2, '0') + '.mp4');
    const ok = await renderKineticCard({
      out,
      width: SL.W,
      height: SL.cardH,
      fps,
      seconds,
      words: bandWords.join(' '),
      kicker,
      color: REMO.color || palette.ink || '#111111',
      accentColor: REMO.accentColor || (TS.onMedia && TS.onMedia.accent) || '#FF6A00',
      backgroundColor: REMO.backgroundColor || palette.bg || '#F0E6D8',
      kickerColor: REMO.kickerColor || palette.accent || '#FF8A3D',
      fontSize: Number(REMO.fontSize || (C.headline && C.headline.size) || 96),
      stagger: Number(REMO.stagger || 7),
      accentEvery: Number(REMO.accentEvery || 3),
      layout: REMO.layout || 'editorial',
      signature: REMO.signature || '',
    });
    if (!ok) throw new Error('remotion (cena ' + (i + 1) + '): render falhou');
    console.log('    ' + path.basename(out) + ': ' + (bandWords.join(' ') || '(sem palavras)') + ' â€” ' + seconds.toFixed(1) + 's');
    cards.push({ scene: sc.id || 's' + (i + 1), name: 'R' + String(i + 1).padStart(2, '0'), file: out, motion: true });
  }

  return { cards, thumb: null, doc: cardsDir, motion: true };
}

/**
 * Two passes, because FigCraft's `node.create` needs a real numeric parent id â€” you cannot
 * name the parent, so the frames have to exist before their text does.
 */
async function buildCards(cfg, scenes, dir, avatarMode, lang) {
  const C = cfg.cards;
  const LM = layoutMetrics(cfg);
  // With a presenter in frame the text moves to the top and bottom edges.
  const layout = avatarMode && C.avatarLayout ? Object.assign({}, C.layout, C.avatarLayout) : C.layout;
  const kickerSize = avatarMode && C.avatarKicker ? C.avatarKicker.size : C.kicker.size;
  const headlineSize = avatarMode && C.avatarHeadline ? C.avatarHeadline.size : C.headline.size;
  const bodySize = avatarMode && C.avatarBody ? C.avatarBody.size : C.body.size;
  // Bases: avatarHeadline/avatarBody quando ha apresentador, senao os valores globais.
  // (Estava a ler headlineChars/bodyChars dentro do proprio inicializador -> ReferenceError
  //  em qualquer build com avatar desligado, que e' exactamente o caminho dos testes.)
  const headlineChars = Number((avatarMode && C.avatarHeadline && C.avatarHeadline.maxCharsPerLine) || C.headline.maxCharsPerLine || 18);
  const bodyChars = Number((avatarMode && C.avatarBody && C.avatarBody.maxCharsPerLine) || C.body.maxCharsPerLine || 40);
  const W = LM.W;
  const H = LM.cardH;
  const pad = Number(C.padding);
  const width = W - pad * 2;
  const scale = W / 1080;
  const cardsDir = path.join(dir, 'cards', String(lang || 'pt-BR'));
  fs.mkdirSync(cardsDir, { recursive: true });

  const cardIds = scenes.map((s, i) => 'c' + String(i + 1).padStart(2, '0') + '_' + String(s.id || 's' + (i + 1)).replace(/[^A-Za-z0-9_-]/g, ''));
  const thumbName = 'thumbnail';

  // pass 1 â€” frames
  const p1 = [];
  for (let i = 0; i < scenes.length; i++) {
    p1.push({ command: 'node.create', params: { type: 'frame', width: W, height: H, name: cardIds[i], props: { fill: C.palette.bg } } });
  }
  p1.push({
    command: 'node.create',
    params: { type: 'frame', width: Number(C.thumbnail.width), height: Number(C.thumbnail.height), name: thumbName, props: { fill: C.palette.bg } },
  });

  const dirBuild = path.join(dir, 'build');
  fs.mkdirSync(dirBuild, { recursive: true });
  const tag = String(lang || 'pt-BR').replace(/[^A-Za-z0-9]/g, '_');
  const p1File = path.join(dirBuild, 'cards-1-' + tag + '.jsonl');
  fs.writeFileSync(p1File, figcraftScript(p1), 'utf8');

  if (DRY) return { dry: true, cards: [], thumb: null, doc: null };

  const doc1 = path.join(dirBuild, 'cards-1-' + tag + '.figcraft');
  const r1 = await figcraftRun(p1File, ['--out', doc1]);
  if (!r1.ok) throw new Error('figcraft (frames): ' + r1.error);
  if (r1.ids.length !== p1.length) throw new Error('figcraft: esperava ' + p1.length + ' ids, recebi ' + r1.ids.length);

  const frameIds = r1.ids.slice(0, scenes.length);
  const thumbId = r1.ids[r1.ids.length - 1];

  // pass 2 â€” text, now that the frames have ids
  const p2 = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const parent = frameIds[i];
    const upper = !(C.textStyle && C.textStyle.uppercase === false);
    const say = (v) => (Array.isArray(v) ? v.map(say) : upper ? String(v == null ? '' : v).toUpperCase() : String(v == null ? '' : v));
    const kicker = sceneKicker(s, cfg, { uppercase: upper });
    const headline = say(s.headline || s.title);
    const body = say(s.body || s.sub);

    if (kicker) {
      p2.push({
        command: 'node.create',
        params: {
          type: 'text', parent, x: pad, y: Math.round(H * layout.kickerY), width, height: Math.round(60 * scale),
          text: kicker,
          props: { fontSize: Math.round(kickerSize * scale), fill: C.palette.accent, fontFamily: C.fontFamily, fontStyle: C.weight, letterSpacing: C.kicker.tracking },
        },
      });
    }
    if (headline) {
      const lines = Array.isArray(headline) ? headline : wrap(headline, headlineChars);
      p2.push({
        command: 'node.create',
        params: {
          type: 'text', parent, x: pad, y: Math.round(H * layout.headlineY), width, height: Math.round(420 * scale),
          text: lines.join('\n'),
          props: { fontSize: Math.round(headlineSize * scale), fill: C.palette.ink, fontFamily: C.fontFamily, fontStyle: C.weight, textAlign: 'left', lineHeight: C.headline.lineHeight },
        },
      });
    }
    if (body) {
      const lines = Array.isArray(body) ? body : wrap(body, bodyChars);
      p2.push({
        command: 'node.create',
        params: {
          type: 'text', parent, x: pad, y: Math.round(H * layout.bodyY), width, height: Math.round(260 * scale),
          text: lines.join('\n'),
          props: { fontSize: Math.round(bodySize * scale), fill: C.palette.muted, fontFamily: C.fontFamily, textAlign: 'left', lineHeight: C.body.lineHeight },
        },
      });
    }
  }

  const thumbKicker = String(cfg.thumbnail.kicker || '').toUpperCase();
  const thumbWords = (cfg.thumbnail.words || []).join('\n');
  p2.push({
    command: 'node.create',
    params: {
      type: 'text', parent: thumbId, x: 60, y: 500, width: Number(C.thumbnail.width) - 120, height: 140,
      text: thumbWords,
      props: { fontSize: Number(C.thumbnail.headlineSize), fill: C.palette.ink, fontFamily: C.fontFamily, fontStyle: C.weight, textAlign: 'left', lineHeight: '104%' },
    },
  });
  if (thumbKicker) {
    p2.push({
      command: 'node.create',
      params: {
        type: 'text', parent: thumbId, x: 60, y: 450, width: Number(C.thumbnail.width) - 120, height: 60,
        text: thumbKicker,
        props: { fontSize: Number(C.thumbnail.kickerSize), fill: C.palette.accent, fontFamily: C.fontFamily, fontStyle: C.weight, letterSpacing: 6 },
      },
    });
  }

  const p2File = path.join(dirBuild, 'cards-2-' + tag + '.jsonl');
  fs.writeFileSync(p2File, figcraftScript(p2), 'utf8');

  const doc2 = path.join(dirBuild, 'cards-' + tag + '.figcraft');
  const r2 = await figcraftRun(p2File, ['--in', doc1, '--out', doc2]);
  if (!r2.ok) throw new Error('figcraft (texto): ' + r2.error);

  const exp = await run(process.execPath, [path.join(HERE, 'artcraft.mjs'), 'cli', 'figcraft', 'export', doc2, '--out', cardsDir, '--format', 'png'], { timeoutMs: TIMEOUT.cli });
  if (exp.code !== 0) throw new Error('figcraft (export): ' + String(exp.stderr).slice(-400));

  const cards = scenes.map((s, i) => ({
    scene: s.id || 's' + (i + 1),
    name: cardIds[i],
    file: path.join(cardsDir, cardIds[i] + '.png'),
  }));
  const thumbFile = path.join(cardsDir, thumbName + '.png');
  for (const c of cards) if (!fs.existsSync(c.file)) throw new Error('cartao nao exportado: ' + c.file);
  if (!fs.existsSync(thumbFile)) throw new Error('thumbnail nao exportada: ' + thumbFile);

  return { cards, thumb: thumbFile, doc: doc2 };
}

// ---------------------------------------------------------------- TTS engines

/** Windows SAPI â€” offline, pt-BR voice available. */
async function sapiSay(text, outWav, v, dirBuild) {
  const txt = path.join(dirBuild, 'tts-' + path.basename(outWav, '.wav') + '.txt');
  fs.writeFileSync(txt, text, 'utf8');
  const ps = [
    'Add-Type -AssemblyName System.Speech;',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
    "try { $s.SelectVoice('" + String(v.voice || '').replace(/'/g, "''") + "') } catch {};",
    '$s.Rate = ' + Number(v.rate || 0) + ';',
    '$s.Volume = ' + Number(v.volume === undefined ? 100 : v.volume) + ';',
    "$s.SetOutputToWaveFile('" + outWav.replace(/'/g, "''") + "');",
    "$s.Speak([System.IO.File]::ReadAllText('" + txt.replace(/'/g, "''") + "', [System.Text.Encoding]::UTF8));",
    '$s.Dispose();',
  ].join(' ');
  const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeoutMs: TIMEOUT.cli });
  return { ok: fs.existsSync(outWav) && fs.statSync(outWav).size > 1000, err: r.stderr };
}

/** FilmCraft TTS â€” `tts.preview` writes a file. */
async function filmcraftSay(text, outWav, v) {
  const job = path.join(path.dirname(outWav), path.basename(outWav, '.wav') + '.jsonl');
  fs.writeFileSync(job, JSON.stringify({
    id: 'tts.preview',
    params: { text, voice: v.voice, pitch: v.pitch, pace: v.pace, path: outWav },
  }) + '\n', 'utf8');
  await run(process.execPath, [path.join(HERE, 'artcraft.mjs'), 'cli', 'filmcraft', 'run', job], { timeoutMs: TIMEOUT.cli });
  return { ok: fs.existsSync(outWav) && fs.statSync(outWav).size > 1000, err: '' };
}

/**
 * Edge TTS â€” Microsoft's neural voices via the free public endpoint.
 *
 * This is the "humanised" option: Francisca/Thalita (pt-BR), Aria/Ava (en-US),
 * Elvira/Ximena (es-ES). No API key, no billing, and vastly better than the
 * built-in SAPI or FilmCraft basic voices. Text is passed through a UTF-8 file,
 * never as a CLI argument, so accents and quotes survive.
 */
async function edgeSay(text, outFile, v, cfg) {
  const py =
    (v && v.python) ||
    (cfg && cfg.voice && cfg.voice.edge && cfg.voice.edge.python) ||
    (cfg && cfg.avatar && cfg.avatar.liveportrait && cfg.avatar.liveportrait.pythonPath) ||
    'python';
  const txt = outFile.replace(/\.[^.]+$/, '') + '.txt';
  fs.writeFileSync(txt, text, 'utf8');
  const args = ['-m', 'edge_tts', '--file', txt, '--voice', (v && v.voice) || 'pt-BR-FranciscaNeural', '--write-media', outFile];
  if (v && v.rate) args.push('--rate=' + v.rate);
  if (v && v.pitch) args.push('--pitch=' + v.pitch);
  if (v && v.volume) args.push('--volume=' + v.volume);
  const r = await run(py, args, { env: pythonEnv(FFMPEG), timeoutMs: TIMEOUT.tts });
  const ok = fs.existsSync(outFile) && fs.statSync(outFile).size > 2000;
  return { ok, err: ok ? '' : String(r.stderr).slice(-300) };
}

/**
 * Voice mastering with SoundCraft.
 *
 * The TTS reaches us clean but flat and a little sterile. This chain â€” high-pass,
 * corrective EQ, gentle compression, de-esser, a touch of saturation and a limiter â€”
 * is what a voice-over engineer would do before publishing, and it is the difference
 * between "computer reading" and "person talking".
 *
 * SoundCraft's CLI reads "ID JSON" per line (not the JSONL the other apps use), and it
 * refuses the mp3 that edge-tts writes, so the input is converted to WAV first.
 */
async function polishVoice(cfg, inputFile, outputFile) {
  const pc = cfg.voice && cfg.voice.polish;
  if (!pc || !pc.enabled || !inputFile || !fs.existsSync(inputFile)) return { ok: false, file: inputFile };
  const cli = pc.cli || 'D:\\CRAFT\\SoundCraft\\soundcraft-cli.exe';
  if (!fs.existsSync(cli)) return { ok: false, file: inputFile };
  if (!FFMPEG) return { ok: false, file: inputFile };

  const work = path.dirname(outputFile);
  fs.mkdirSync(work, { recursive: true });
  const raw = outputFile.replace(/\.[^.]+$/, '') + '.raw.wav';

  // 1. normalise the container so SoundCraft accepts it
  const conv = await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', inputFile, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', raw], { timeoutMs: TIMEOUT.ffmpeg });
  if (conv.code !== 0 || !fs.existsSync(raw)) return { ok: false, file: inputFile };

  // 2. build the effect chain script
  const lines = [
    'session.new ' + JSON.stringify({ name: 'voice', sample_rate: 48000, bit_depth: 24 }),
    'file.import_audio ' + JSON.stringify({ path: raw, new_tracks: true }),
  ];
  for (const item of pc.chain || []) {
    lines.push('mix.insert ' + JSON.stringify({ track: 2, slot: lines.length - 2, plugin: item.plugin, params: item.params || {} }));
  }
  lines.push('file.bounce_mix ' + JSON.stringify({ path: outputFile, format: 'wav', bit_depth: 24 }));

  const script = outputFile.replace(/\.[^.]+$/, '') + '.soundcraft.txt';
  fs.writeFileSync(script, lines.join('\n') + '\n', 'utf8');

  const r = await run(cli, ['script', script], { cwd: work, timeoutMs: TIMEOUT.tts });
  const ok = fs.existsSync(outputFile) && fs.statSync(outputFile).size > 2000;
  if (ok) {
    try { fs.unlinkSync(raw); } catch { /* keep */ }
  }
  return { ok, file: ok ? outputFile : inputFile, log: String(r.stdout || '').slice(-300) };
}

/**
 * VoiceCraft â€” the local TTS studio on :8090.
 *
 * It fronts ten providers with a cascade, so one call can land on NVIDIA Magpie
 * (the most natural pt-BR we have), Gemini, or Edge when the quotas run out. It also
 * masters through SoundCraft on its side, so the audio arrives already levelled.
 *
 * Returns the MP3 path; the caller keeps the normal polish/measure pipeline.
 */
async function voicecraftSay(text, outFile, v, cfg) {
  const vc = (cfg.voice && cfg.voice.voicecraft) || {};
  const base = (v.baseUrl || vc.baseUrl || 'http://127.0.0.1:8090').replace(/\/$/, '');
  const body = {
    text,
    language: v.language || vc.language || 'pt-BR',
    profile: v.profile || vc.profile || 'adulto',
    provider: v.provider || vc.provider || 'auto',
    format: v.format || vc.format || 'mp3',
  };
  if (v.voice) body.voice = v.voice;
  if (v.instructions) body.instructions = v.instructions;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(vc.timeoutMs || 180000));
  try {
    const res = await fetch(base + '/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || buf.length < 3000) {
      return { ok: false, err: 'voicecraft ' + res.status + ': ' + buf.toString('utf8').slice(0, 200) };
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, buf);
    const used = res.headers.get('x-tts-provider') || body.provider;
    const voice = res.headers.get('x-tts-voice') || '';
    console.log('      voicecraft -> ' + used + (voice ? ' / ' + voice : ''));
    return { ok: true, err: '', used, voice };
  } catch (e) {
    return { ok: false, err: 'voicecraft: ' + String(e.message) };
  } finally {
    clearTimeout(timer);
  }
}

/** ElevenLabs HTTP API. */
async function elevenlabsSay(text, outWav, v) {
  if (!v.apiKey || !v.voiceId) return { ok: false, err: 'ElevenLabs: falta apiKey ou voiceId' };
  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(v.voiceId) + '?output_format=wav_44100';
  const body = JSON.stringify({
    text,
    model_id: v.model || 'eleven_multilingual_v2',
    voice_settings: { stability: v.stability || 0.5, similarity_boost: v.similarity || 0.75 },
  });
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'xi-api-key': v.apiKey, 'content-type': 'application/json', 'accept': 'audio/wav' },
    }, (res) => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', (d) => err += d);
        res.on('end', () => resolve({ ok: false, err: 'ElevenLabs ' + res.statusCode + ': ' + err }));
        return;
      }
      const file = fs.createWriteStream(outWav);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ ok: fs.existsSync(outWav) && fs.statSync(outWav).size > 1000, err: '' })));
    });
    req.on('error', (e) => resolve({ ok: false, err: String(e.message) }));
    req.write(body);
    req.end();
  });
}

/** XTTS (Coqui) â€” local or HTTP. Expects a CLI `xtts` or Python script. */
async function xttsSay(text, outWav, v) {
  if (!v.speakerWav || !fs.existsSync(v.speakerWav)) return { ok: false, err: 'XTTS: speakerWav nao encontrado' };
  // Try local CLI first
  const cli = v.cli || 'xtts';
  const args = [
    '--text', text,
    '--speaker_wav', v.speakerWav,
    '--language_idx', v.language || 'pt',
    '--out_path', outWav,
  ];
  if (v.modelPath) args.push('--model_path', v.modelPath);
  const r = await run(cli, args, { timeoutMs: TIMEOUT.tts });
  if (r.code === 0 && fs.existsSync(outWav) && fs.statSync(outWav).size > 1000) return { ok: true, err: '' };
  // Fallback: Python coqui-tts
  const py = v.python || 'python';
  const pyArgs = ['-m', 'TTS.api', '--text', text, '--speaker_wav', v.speakerWav, '--language_idx', v.language || 'pt', '--out_path', outWav];
  if (v.modelPath) pyArgs.push('--model_path', v.modelPath);
  const r2 = await run(py, pyArgs, { timeoutMs: TIMEOUT.tts });
  return { ok: r2.code === 0 && fs.existsSync(outWav) && fs.statSync(outWav).size > 1000, err: r2.stderr };
}

/** Kokoro â€” local CLI or Python. */
async function kokoroSay(text, outWav, v) {
  const cli = v.cli || 'kokoro';
  const args = ['--text', text, '--voice', v.voice || 'pt-br-female-1', '--output', outWav];
  if (v.modelPath) args.push('--model_path', v.modelPath);
  const r = await run(cli, args, { timeoutMs: TIMEOUT.tts });
  if (r.code === 0 && fs.existsSync(outWav) && fs.statSync(outWav).size > 1000) return { ok: true, err: '' };
  // Python fallback
  const py = v.python || 'python';
  const pyArgs = ['-m', 'kokoro', '--text', text, '--voice', v.voice || 'pt-br-female-1', '--output', outWav];
  if (v.modelPath) pyArgs.push('--model_path', v.modelPath);
  const r2 = await run(py, pyArgs, { timeoutMs: TIMEOUT.tts });
  return { ok: r2.code === 0 && fs.existsSync(outWav) && fs.statSync(outWav).size > 1000, err: r2.stderr };
}

/** Custom CLI â€” user provides command template with {text} {out} placeholders. */
async function customSay(text, outWav, v) {
  if (!v.command) return { ok: false, err: 'Custom TTS: comando vazio' };
  const cmd = v.command.replace('{text}', text).replace('{out}', outWav);
  const args = (v.args || []).map(a => a.replace('{text}', text).replace('{out}', outWav));
  const parts = cmd.split(/\s+/);
  const r = await run(parts[0], parts.slice(1).concat(args), { timeoutMs: TIMEOUT.tts });
  return { ok: r.code === 0 && fs.existsSync(outWav) && fs.statSync(outWav).size > 1000, err: r.stderr };
}

// ---------------------------------------------------------------- narration (multi-language)

async function buildNarrationForLanguage(cfg, scenes, dir, lang, alreadyLocalized) {
  const langCfg = cfg.languages?.perLanguage?.[lang] || {};
  const engine = String(langCfg.engine || cfg.voice?.engine || 'sapi').toLowerCase();
  const audioDir = path.join(dir, 'audio', lang);
  const buildDir = path.join(dir, 'build');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });

  const tracks = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const name = String(s.id || 's' + (i + 1)).replace(/[^A-Za-z0-9_-]/g, '');
    const wav = path.join(audioDir, name + '.wav');
    const audioPathFor = (eng) => ((eng === 'edge' || eng === 'voicecraft') ? path.join(audioDir, name + '.mp3') : wav);
    let text = String(s.narration || s.text || '').trim();

    // Each presenter may have its own voice (Frida presents, Luna comments).
    const presenter = s.avatar || s.presenter;
    // A voz por apresentador so faz sentido com o avatar ligado. Com avatar.enabled=false
    // (testes de ritmo, builds sem cara) a voz do apresentador arrastava o TTS para o
    // engine dele â€” VoiceCraft na rede para um video que nao tem apresentador nenhum.
    const avCfg = cfg.avatar?.enabled && presenter && cfg.avatar?.avatars?.[presenter];
    // voice may be keyed by language ({ "pt-BR": {...} }) or flat ({ engine, voice })
    let avVoice = null;
    if (avCfg && avCfg.voice) {
      avVoice = avCfg.voice[lang] || (avCfg.voice.engine ? avCfg.voice : null);
    }
    const sceneEngine = String((avVoice && avVoice.engine) || engine).toLowerCase();
    const v = avVoice || langCfg;

    // Auto-translate if enabled and text exists (skipped when main already localized)
    if (!alreadyLocalized && text && cfg.languages?.autoTranslate && lang !== cfg.languages?.default && cfg.languages?.translateEngine !== 'none') {
      const translated = await translateText(text, cfg.languages.default, lang, cfg.languages.translateEngine);
      if (translated) text = translated;
      else console.error('  aviso: traducao falhou para ' + lang + ' cena ' + name + ' â€” usando original');
    }

    if (DRY || sceneEngine === 'none' || !text) {
      tracks.push({ scene: name, file: null, duration: 0, engine: 'silent', presenter: presenter || null, text });
      continue;
    }

    // ---- cache da locucao
    // O texto e a voz nao mudaram desde a ultima sintese? Reusa-se o audio.
    // Sem isto, cada rebuild voltava a chamar o TTS e a invalidar o cache do
    // Wav2Lip, refazendo o trabalho mais caro do pipeline.
    const fingerprint = narrationFingerprint(text, {
      engine: sceneEngine,
      voice: v,
      // a cadeia de polimento entra inteira: mudar o EQ muda o master e tem
      // de invalidar o cache
      polish: cfg.voice?.polish?.enabled ? (cfg.voice.polish.chain || cfg.voice.polish.engine || 'on') : null,
    });
    const cached = readNarrationCache(audioDir, name, fingerprint);
    if (cached) {
      console.log('      cache: ' + path.basename(cached.file) + ' (' + cached.duration.toFixed(2) + 's)');
      tracks.push({ scene: name, file: cached.file, duration: cached.duration, engine: sceneEngine, presenter: presenter || null, text });
      continue;
    }

    let r;
    if (sceneEngine === 'voicecraft') {
      r = await voicecraftSay(text, audioPathFor('voicecraft'), Object.assign({}, v, { language: lang }), cfg);
      // VoiceCraft can answer 200 with a stub, or a provider can exhaust its quota.
      // Retry once through the cascade, then drop to the keyless Edge voice.
      if (!r.ok) {
        console.log('      voicecraft falhou, a repetir com provider=auto');
        r = await voicecraftSay(text, audioPathFor('voicecraft'), Object.assign({}, v, { language: lang, provider: 'auto' }), cfg);
      }
      if (!r.ok && cfg.voice?.fallback?.enabled !== false) {
        const fbVoice = (cfg.voice.fallback?.perLanguage || {})[lang] || 'pt-BR-FranciscaNeural';
        console.log('      fallback -> edge / ' + fbVoice);
        r = await edgeSay(text, audioPathFor('edge'), { engine: 'edge', voice: fbVoice }, cfg);
      }
    }
    else if (sceneEngine === 'edge') r = await edgeSay(text, audioPathFor('edge'), v, cfg);
    else if (sceneEngine === 'filmcraft') r = await filmcraftSay(text, wav, v);
    else if (sceneEngine === 'elevenlabs') r = await elevenlabsSay(text, wav, v);
    else if (sceneEngine === 'xtts') r = await xttsSay(text, wav, v);
    else if (sceneEngine === 'kokoro') r = await kokoroSay(text, wav, v);
    else if (sceneEngine === 'custom') r = await customSay(text, wav, v);
    else r = await sapiSay(text, wav, v, buildDir);

    let producedFile = audioPathFor(sceneEngine);
    // master the voice before measuring: EQ/compression change the level
    if (r.ok && cfg.voice?.polish?.enabled) {
      const polished = await polishVoice(cfg, producedFile, producedFile.replace(/\.[^.]+$/, '') + '.master.wav');
      if (polished.ok) producedFile = polished.file;
    }
    let duration = r.ok ? await probeDuration(producedFile) : 0;

    // Um provedor pode devolver 200 com um ficheiro minusculo (visto na NVIDIA).
    // Se a duracao nao bate certo com o numero de palavras, o audio e' lixo:
    // repetir pelo Edge, que nunca falha.
    const nWords = text.trim().split(/\s+/).filter(Boolean).length;
    const expected = Math.max(1.2, nWords * 0.10);
    if (r.ok && duration > 0 && duration < expected && sceneEngine !== 'edge') {
      console.log('      audio truncado (' + duration.toFixed(2) + 's para ' + nWords + ' palavras) â€” a repetir pelo Edge');
      const fb = (cfg.voice && cfg.voice.fallback && cfg.voice.fallback.perLanguage && cfg.voice.fallback.perLanguage[lang]) || 'pt-BR-FranciscaNeural';
      const r2 = await edgeSay(text, audioPathFor('edge'), { engine: 'edge', voice: fb }, cfg);
      if (r2.ok) {
        producedFile = audioPathFor('edge');
        duration = await probeDuration(producedFile);
      }
    }
    if (!r.ok || !duration) {
      console.error('  aviso: narracao ' + lang + ' falhou em ' + name + (r.err ? ' â€” ' + String(r.err).slice(0, 160) : ''));
      tracks.push({ scene: name, file: null, duration: 0, engine: 'silent', presenter: presenter || null, text });
      continue;
    }
    tracks.push({ scene: name, file: producedFile, duration, engine: sceneEngine, presenter: presenter || null, text });
    // Regista o cache para o proximo build nao voltar a sintetizar.
    writeNarrationCache(audioDir, name, fingerprint, producedFile, duration, sceneEngine);
  }
  return tracks;
}

async function translateText(text, fromLang, toLang, engine) {
  if (engine === 'libre') {
    // LibreTranslate public instance (or self-hosted)
    const url = 'https://libretranslate.de/translate';
    const body = JSON.stringify({ q: text, source: fromLang.split('-')[0], target: toLang.split('-')[0], format: 'text' });
    return new Promise((resolve) => {
      const req = https.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', (d) => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data).translatedText || ''); } catch { resolve(''); }
        });
      });
      req.on('error', () => resolve(''));
      req.write(body);
      req.end();
    });
  }
  if (engine === 'deepl') {
    // DeepL API (requires key in env or config)
    const key = process.env.DEEPL_API_KEY || '';
    if (!key) return '';
    const url = 'https://api-free.deepl.com/v2/translate';
    const body = new URLSearchParams({ text, source_lang: fromLang.split('-')[0].toUpperCase(), target_lang: toLang.split('-')[0].toUpperCase() });
    return new Promise((resolve) => {
      const req = https.request(url, {
        method: 'POST',
        headers: { 'Authorization': 'DeepL-Auth-Key ' + key, 'content-type': 'application/x-www-form-urlencoded' },
      }, (res) => {
        let data = '';
        res.on('data', (d) => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data).translations?.[0]?.text || ''); } catch { resolve(''); }
        });
      });
      req.on('error', () => resolve(''));
      req.write(body);
      req.end();
    });
  }
  if (engine === 'google') {
    // Google Translate (unofficial endpoint). The reply is a list of segments, one per
    // sentence: taking only [0][0][0] silently truncates the text to its first sentence.
    const sl = fromLang.split('-')[0];
    const tl = toLang.split('-')[0];
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sl +
      '&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text);

    // No custom User-Agent: the endpoint answers 302 to browser-like headers, and
    // https.get does not follow redirects.
    const once = () =>
      new Promise((resolve) => {
        const req = https.get(url, { timeout: 20000 }, (res) => {
          let data = '';
          res.on('data', (d) => (data += d));
          res.on('end', () => {
            if (res.statusCode !== 200) return resolve('');
            try {
              const parsed = JSON.parse(data);
              const segs = Array.isArray(parsed && parsed[0]) ? parsed[0] : [];
              resolve(segs.map((seg) => (seg && seg[0] ? seg[0] : '')).join('').trim());
            } catch {
              resolve('');
            }
          });
        });
        req.on('error', () => resolve(''));
        req.on('timeout', () => {
          req.destroy();
          resolve('');
        });
      });

    let out = await once();
    for (let attempt = 1; !out && attempt <= 2; attempt++) {
      await new Promise((r) => setTimeout(r, 700 * attempt));
      out = await once();
    }
    if (out) return out;

    // Fallback: MyMemory (free tier, no key). It caps each request at ~500 chars,
    // so long narration is split at sentence boundaries and rejoined.
    const chunks = [];
    let buf = '';
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if ((buf + ' ' + sentence).trim().length > 450 && buf) {
        chunks.push(buf.trim());
        buf = sentence;
      } else {
        buf = (buf ? buf + ' ' : '') + sentence;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());

    const parts = [];
    for (const chunk of chunks) {
      const url =
        'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) +
        '&langpair=' + sl + '|' + tl;
      const translated = await new Promise((resolve) => {
        const req = https.get(url, { timeout: 20000 }, (res) => {
          let data = '';
          res.on('data', (d) => (data += d));
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              resolve((j && j.responseData && j.responseData.translatedText) || '');
            } catch {
              resolve('');
            }
          });
        });
        req.on('error', () => resolve(''));
        req.on('timeout', () => {
          req.destroy();
          resolve('');
        });
      });
      if (!translated) return '';
      parts.push(translated);
      await new Promise((r) => setTimeout(r, 250));
    }
    return parts.join(' ');
  }
  return '';
}

// ---------------------------------------------------------------- subtitles (.srt)





// ---------------------------------------------------------------- avatar

async function prepareAvatar(cfg, dir) {
  if (!cfg.avatar?.enabled) return null;
  const type = cfg.avatar.type || 'local';
  const avatarDir = path.join(dir, 'avatar');
  fs.mkdirSync(avatarDir, { recursive: true });

  if (type === 'local') {
    const src = cfg.avatar.local?.path;
    if (!src || !fs.existsSync(src)) return null;
    const dst = path.join(avatarDir, 'avatar.mp4');
    fs.copyFileSync(src, dst);
    return { file: dst, loop: true, chromaKey: cfg.avatar.backgroundRemoval };
  }

  if (type === 'heygen' && cfg.avatar.heygen?.apiKey && cfg.avatar.heygen?.avatarId) {
    // HeyGen API â€” generate avatar video for each scene text
    console.log('  HeyGen avatar generation not fully implemented â€” using local fallback');
    return null;
  }

  if (type === 'synthesia' && cfg.avatar.synthesia?.apiKey && cfg.avatar.synthesia?.avatarId) {
    console.log('  Synthesia avatar generation not fully implemented â€” using local fallback');
    return null;
  }

  if (type === 'did' && cfg.avatar.did?.apiKey && cfg.avatar.did?.presenterId) {
    console.log('  D-ID avatar generation not fully implemented â€” using local fallback');
    return null;
  }

  if (type === 'generated') {
    // Craft Anything or external video generator
    console.log('  AI avatar generation not fully implemented â€” using local fallback');
    return null;
  }

  return null;
}

// ---------------------------------------------------------------- B-roll

async function fetchBroll(cfg, scenes, dir) {
  if (!cfg.pipeline?.broll?.enabled) return [];
  const source = cfg.pipeline.broll.source || 'pexels';
  const apiKey = cfg.pipeline.broll.apiKey;
  const minClips = cfg.pipeline.broll.minClipsPerScene || 2;
  const maxDur = cfg.pipeline.broll.maxDurationSec || 10;
  const brollDir = path.join(dir, 'broll');
  fs.mkdirSync(brollDir, { recursive: true });

  const clips = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const keywords = (s.brollKeywords || s.headline || s.title || '').split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(',');
    if (!keywords) continue;

    const sceneClips = [];
    if (source === 'pexels' && apiKey) {
      const url = 'https://api.pexels.com/videos/search?query=' + encodeURIComponent(keywords) + '&per_page=' + minClips + '&orientation=portrait';
      const r = await httpGet(url, { Authorization: apiKey });
      if (r.code === 200) {
        const data = JSON.parse(r.body);
        for (const vid of (data.videos || []).slice(0, minClips)) {
          const file = vid.video_files?.find(f => f.quality === 'hd' || f.quality === 'sd')?.link;
          if (file) {
            const dst = path.join(brollDir, 'scene' + (i + 1) + '_' + sceneClips.length + '.mp4');
            await httpDownload(file, dst);
            if (fs.existsSync(dst)) sceneClips.push(dst);
          }
        }
      }
    } else if (source === 'pixabay' && apiKey) {
      const url = 'https://pixabay.com/api/videos/?key=' + apiKey + '&q=' + encodeURIComponent(keywords) + '&per_page=' + minClips + '&video_type=film';
      const r = await httpGet(url);
      if (r.code === 200) {
        const data = JSON.parse(r.body);
        for (const vid of (data.hits || []).slice(0, minClips)) {
          const file = vid.videos?.large?.url || vid.videos?.medium?.url;
          if (file) {
            const dst = path.join(brollDir, 'scene' + (i + 1) + '_' + sceneClips.length + '.mp4');
            await httpDownload(file, dst);
            if (fs.existsSync(dst)) sceneClips.push(dst);
          }
        }
      }
    } else if (source === 'local') {
      // Use local folder â€” pick random files
      const localDir = cfg.pipeline.broll.localDir || path.join(CC, 'work', 'broll');
      if (fs.existsSync(localDir)) {
        const files = fs.readdirSync(localDir).filter(f => /\.(mp4|mov|webm)$/i.test(f));
        for (let j = 0; j < Math.min(minClips, files.length); j++) {
          sceneClips.push(path.join(localDir, files[j]));
        }
      }
    }
    clips.push({ scene: i, files: sceneClips });
  }
  return clips;
}

// ---------------------------------------------------------------- scene assembly (with avatar, broll, subtitles)

function sceneFilter(cfg, frames, outW, outH, scene) {
  const LM = layoutMetrics(cfg);
  const W = Number(outW || LM.W);
  const H = Number(outH || LM.cardH);
  const fs_ = Number(cfg.video.fps);
  // O plano pode trazer o seu proprio enquadramento (scene.motion): uma faixa do cartao,
  // zoom para dentro/fora e pan. Sem isto dois planos seguidos mostram o mesmo cartao e o
  // corte existe na timeline sem existir no ecra (medido: 26 clipes, 7 planos detetados).
  const mo = (scene && scene.motion) || {};
  const kb = Object.assign({}, cfg.motion?.kenBurns || {}, mo.kenBurns || {});
  const crop = mo.crop && Number(mo.crop.h) > 0 && Number(mo.crop.h) < 1
    ? 'crop=iw:ih*' + Number(mo.crop.h).toFixed(4) + ':0:ih*' + Number(mo.crop.y0 || 0).toFixed(4) + ','
    : '';
  if (!kb.enabled) return crop + 'scale=' + W + ':' + H + ',fps=' + fs_ + ',format=' + cfg.video.pixFmt;
  const from = Number(kb.from || 1);
  const toZ = Number(kb.to || 1.07);
  const z = "z='" + from + '+(' + (toZ - from) + ")*on/" + Math.max(1, frames - 1) + "'";
  const PAN = {
    left: ['0', 'ih/2-(ih/zoom/2)'],
    right: ['iw-iw/zoom', 'ih/2-(ih/zoom/2)'],
    up: ['iw/2-(iw/zoom/2)', '0'],
    down: ['iw/2-(iw/zoom/2)', 'ih-ih/zoom'],
  };
  const pan = PAN[mo.pan] || ['iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)'];
  return (
    crop +
    'scale=' + W * 2 + ':' + H * 2 + ':flags=lanczos,' +
    'zoompan=' + z + ":x='" + pan[0] + "':y='" + pan[1] + "':d=" + frames + ':s=' + W + 'x' + H + ':fps=' + fs_ + ',' +
    'format=' + cfg.video.pixFmt
  );
}
async function buildSceneClips(cfg, cards, tracks, avatarClips, scenes, broll, subtitles, dir, lang, lipSyncScenes, avatarTemplates) {
  const buildDir = path.join(dir, 'build', lang);
  fs.mkdirSync(buildDir, { recursive: true });
  const clips = [];
  const fps = Number(cfg.video.fps);
  const LM = layoutMetrics(cfg);
  const defaultAvatar = cfg.avatar?.default || Object.keys(avatarClips || {})[0] || null;

  for (let i = 0; i < cards.length; i++) {
    const t = tracks[i] || { duration: 0 };
    // Duracao: narracao manda, excepto quando a cena traz `seconds` (plano de EDL).
    // Um plano de 1,8 s nao pode ser esticado pelo minSeconds global de 4 s, e uma
    // narracao mais longa que o plano nunca pode ser cortada a meio â€” o atrim comeria a
    // ultima palavra. Logo: max(pedido, narracao) e o clamps passa a incluir o pedido.
    const need = (t.duration || 0) + Number(cfg.scene?.padSeconds || 0.4);
    const asked = Number((scenes[i] && scenes[i].seconds) || 0);
    const respect = !cfg.scene || cfg.scene.respectScriptSeconds !== false;
    let lo = Number(cfg.scene?.minSeconds || 4);
    let hi = Number(cfg.scene?.maxSeconds || 18);
    if (asked > 0 && respect) { lo = Math.min(lo, asked); hi = Math.max(hi, asked); }
    let dur = Math.min(hi, Math.max(lo, Math.max(need, asked > 0 && respect ? asked : 0)));

    // Tempo-fit: um guiao mais denso do que o plano empurra cada corte para a frente e o
    // ritmo medido desaparece (26 planos -> 76 s em vez de 60 s). Quando o plano manda na
    // duracao, a narracao e' acelerada/abrandada dentro de limites audiveis para caber no
    // plano; se o limite nao chega, o plano cresce â€” nunca se corta uma palavra a meio.
    let tempo = 1;
    const fit = asked > 0 && respect && !!t.file && (cfg.scene?.fitNarration !== false);
    if (fit) {
      const natural = Number(t.duration || 0);
      const want = Math.max(0.4, asked);
      const maxT = Number(cfg.scene?.maxTempo || 1.4);
      const minT = Number(cfg.scene?.minTempo || 0.8);
      tempo = Math.min(maxT, Math.max(minT, natural / want));
      dur = Math.min(hi, Math.max(lo, Math.max(want, natural / tempo)));
    }
    const frames = Math.max(2, Math.round(dur * fps));
    const out = path.join(buildDir, 'scene' + String(i + 1).padStart(2, '0') + '.mp4');

    // Which presenter is in this scene?
    // "none" is a sentinel for "no presenter" (full-frame card). Fall back to the
    // default presenter only when the scene does not say anything at all.
    const speaker = scenes[i] ? speakerOf(scenes[i]) : '';
    const wantsNone = scenes[i] && String(scenes[i].presenter || scenes[i].avatar || '').trim().toLowerCase() === 'none';
    const wanted = wantsNone ? null : (speaker || defaultAvatar);
    // F5: usar o clip lipsynced especifico desta cena (se Wav2Lip ativo).
    // lipSyncScenes chega por parametro: mapa { scene01: clip, ... } por idioma.
    // (Antes isto lia `lipSyncByLang`, que so existe dentro de main() -> ReferenceError
    //  que matava o pipeline no passo 5/6, depois de 20+ minutos de trabalho.)
    const sceneKey = 'scene' + String(i + 1).padStart(2, '0');
    const lipSynced = lipSyncScenes && lipSyncScenes[sceneKey];
    // Driver do BEAT: o contrato de direcao escolhe um template por emocao
    // (work/avatars/driving_templates). Usar o clip do driver certo e o que
    // faz o avatar "falar" com a expressao da cena em vez do driver generico.
    const beatDriver = (scenes[i] && scenes[i][wanted + '_state'] && scenes[i][wanted + '_state'].driving_template) || '';
    const beatClip = beatDriver && avatarTemplates && avatarTemplates[wanted]
      ? avatarTemplates[wanted][resolveProjectPath(beatDriver)]
      : null;
    const avatar = lipSynced || beatClip || (wanted && avatarClips ? avatarClips[wanted] : null);
    const hasAvatar = !!(avatar && avatar.file && fs.existsSync(avatar.file));

    // Per-shot geometry: a whiteboard scene is full frame, a talking-head scene is split at
    // its own ratio. This is what makes the clone follow the reference's screen divisions
    // instead of applying one split to every scene.
    const SL = sceneLayout(cfg, scenes[i]);
    // The body below was written against one global layout; binding it to the scene's own
    // metrics is what turns a fixed split into a per-shot split.
    const LM = SL;

    const filterParts = [];
    let videoInputIdx = 0;
    let lastVideo = '0:v';

    // A scene without a presenter takes the whole frame: that is how channels whose
    // videos have no talking head are cloned, without a dead band at the bottom.
    const bandH = SL.split && !hasAvatar && (cfg.layout?.fillWhenNoPresenter !== false) ? SL.H : SL.cardH;

    // ---- top band: motion card (mp4, holds its last frame) or static card (Ken Burns)
    const cardIsVideo = /\.(mp4|mov|webm)$/i.test(cards[i].file);
    if (cardIsVideo) {
      // the motion card is short: hold its last frame for the rest of the scene
      const padSec = Math.max(0, dur + 2 - Number(cfg.cards?.motion?.entranceSeconds || 3));
      filterParts.push(
        '[' + videoInputIdx + ':v]scale=' + SL.W + ':' + bandH +
        ':force_original_aspect_ratio=increase,crop=' + SL.W + ':' + bandH + ',setsar=1,' +
        'tpad=stop_mode=clone:stop_duration=' + padSec.toFixed(2) + ',' +
        'trim=duration=' + dur.toFixed(3) + ',setpts=PTS-STARTPTS,fps=' + fps +
        ',format=' + cfg.video.pixFmt + '[vcard]'
      );
    } else {
      filterParts.push('[' + videoInputIdx + ':v]' + sceneFilter(cfg, frames, SL.W, bandH, scenes[i]) + '[vcard]');
    }
    lastVideo = 'vcard';
    videoInputIdx++;

    // ---- split layout: the card fills only the TOP band; the BOTTOM band gets its own
    //      fill colour and belongs to the presenter.
    if (SL.split && bandH < SL.H) {
      const fill = String((cfg.layout && cfg.layout.bottomFill) || '#12100E').replace('#', '0x');
      filterParts.push('[' + lastVideo + ']pad=' + SL.W + ':' + SL.H + ':0:0:color=' + fill + '[vframe]');
      lastVideo = 'vframe';
    }

    // Presenter overlay. The avatar clip is only a few seconds long, so it is
    // replayed with -stream_loop -1 and cut by -frames:v / -shortest.
    if (hasAvatar) {
      const comp = cfg.avatar && cfg.avatar.compose ? cfg.avatar.compose : {};
      const padTopR = avatar.padTopRatio != null ? avatar.padTopRatio : 0;
      const panelR = avatar.panelHeightRatio != null ? avatar.panelHeightRatio : 1;
      const aspect = avatar.panelAspect && avatar.panelAspect > 0 ? avatar.panelAspect : 0.88;
      const scaleW = LM.W / 1080;
      let boxX;
      let boxY;
      let avatarComposited = false;

      // ---- F4: camera_framing decide o layout da banda inferior
      // scenes[i].camera_framing vem do contrato de direcao (F1): 'dual_desk' | 'closeup'
      const framing = (scenes[i] && scenes[i].camera_framing) || 'closeup';
      const activeKey = wanted; // quem fala nesta cena
      const otherKey = Object.keys(avatarClips || {}).find((k) => k !== activeKey) || null;

      if (framing === 'dual_desk' && LM.split && otherKey && avatarClips[otherKey]?.file) {
        // ===== DUAL DESK: dois apresentadores lado a lado =====
        const avatarA = avatarClips[activeKey];
        const avatarB = avatarClips[otherKey];
        const hasA = avatarA && fs.existsSync(avatarA.file);
        const hasB = avatarB && fs.existsSync(avatarB.file);
        if (hasA && hasB) {
          // Ambos lado a lado: cada um ocupa ~45% da largura, com gap central
          const gap = Math.round(LM.W * 0.03);
          const totalW = LM.W - gap;
          const boxW = Math.round(totalW / 2);
          const boxH = Math.round(boxW * aspect);
          const boxY = LM.cardH + Math.max(0, LM.botH - boxH);

          // Avatar A (esquerda - quem fala)
          const boxXA = Math.round((LM.W - totalW) / 2);
          // Avatar B (direita - quem escuta)
          const boxXB = boxXA + boxW + gap;

          // Backdrop comum (blur do avatar ativo)
          const backdrop = (comp.bandBackdrop || 'blur') !== 'color';
          if (backdrop) {
            filterParts.push(
              '[' + videoInputIdx + ':v]crop=iw:ih*' + panelR.toFixed(4) + ':0:ih*' + padTopR.toFixed(4) +
              ',split=2[avbgraw][avfgraw]'
            );
            filterParts.push(
              '[avbgraw]scale=' + LM.W + ':' + LM.botH + ':force_original_aspect_ratio=increase,setsar=1,' +
              'crop=' + LM.W + ':' + LM.botH + ',eq=brightness=-0.10:saturation=0.85,gblur=sigma=28[avbg]'
            );
            filterParts.push('[avfgraw]scale=' + boxW + ':' + boxH + ':flags=lanczos,setsar=1[avpanelA]');
            filterParts.push('[' + lastVideo + '][avbg]overlay=0:' + LM.cardH + '[vb1]');
            videoInputIdx++;
          }

          // Avatar A (ativo - esquerda)
          filterParts.push(
            '[' + videoInputIdx + ':v]crop=iw:ih*' + panelR.toFixed(4) + ':0:ih*' + padTopR.toFixed(4) +
            ',scale=' + boxW + ':' + boxH + ':flags=lanczos,setsar=1[avpanelA]'
          );
          if (avatar.chromaKey) {
            filterParts.push('[avpanelA]chromakey=0x00FF00:0.08:0.2[avckA]');
            filterParts.push('[vb1][avckA]overlay=' + boxXA + ':' + boxY + '[vA]');
          } else {
            filterParts.push('[vb1][avpanelA]overlay=' + boxXA + ':' + boxY + '[vA]');
          }
          lastVideo = 'vA';
          videoInputIdx++;

          // Avatar B (ouvinte - direita)
          filterParts.push(
            '[' + videoInputIdx + ':v]crop=iw:ih*' + panelR.toFixed(4) + ':0:ih*' + padTopR.toFixed(4) +
            ',scale=' + boxW + ':' + boxH + ':flags=lanczos,setsar=1[avpanelB]'
          );
          if (avatar.chromaKey) {
            filterParts.push('[avpanelB]chromakey=0x00FF00:0.08:0.2[avckB]');
            filterParts.push('[vA][avckB]overlay=' + boxXB + ':' + boxY + '[vpresenter]');
          } else {
            filterParts.push('[vA][avpanelB]overlay=' + boxXB + ':' + boxY + '[vpresenter]');
          }
          lastVideo = 'vpresenter';
          videoInputIdx++;
          avatarComposited = true;
        }
      }

      if (!avatarComposited && LM.split) {
        // Presenter inside the bottom band. The band gets its own backdrop made from the
        // avatar itself (cover + heavy blur), so there is no grey studio box floating in a
        // dark band: the edges of the portrait bleed into the frame.
        const panelW = 1 / (aspect > 0 ? aspect : 1);
        const wantW = Math.round(LM.W * Number(comp.bandZoom != null ? comp.bandZoom : 0.78));
        const boxW = Math.max(160, Math.min(wantW, Math.round(LM.botH * panelW)));
        const boxH = Math.round(boxW * aspect);
        const alignB = comp.align || 'center';
        const marginB = Math.round(Number(comp.margin || 30) * (LM.W / 1080));
        boxX = alignB === 'left' ? marginB : alignB === 'right' ? LM.W - boxW - marginB : Math.round((LM.W - boxW) / 2);
        boxY = LM.cardH + Math.max(0, LM.botH - boxH);

        const backdrop = (comp.bandBackdrop || 'blur') !== 'color';
        if (backdrop) {
          filterParts.push(
            '[' + videoInputIdx + ':v]crop=iw:ih*' + panelR.toFixed(4) + ':0:ih*' + padTopR.toFixed(4) +
            ',split=2[avbgraw][avfgraw]'
          );
          filterParts.push(
            '[avbgraw]scale=' + LM.W + ':' + LM.botH + ':force_original_aspect_ratio=increase,setsar=1,' +
            'crop=' + LM.W + ':' + LM.botH + ',eq=brightness=-0.10:saturation=0.85,gblur=sigma=28[avbg]'
          );
          filterParts.push('[avfgraw]scale=' + boxW + ':' + boxH + ':flags=lanczos,setsar=1[avpanel]');
          filterParts.push('[' + lastVideo + '][avbg]overlay=0:' + LM.cardH + '[vb1]');
          if (avatar.chromaKey) {
            filterParts.push('[avpanel]chromakey=0x00FF00:0.08:0.2[avck]');
            filterParts.push('[vb1][avck]overlay=' + boxX + ':' + boxY + '[vpresenter]');
          } else {
            filterParts.push('[vb1][avpanel]overlay=' + boxX + ':' + boxY + '[vpresenter]');
          }
          lastVideo = 'vpresenter';
          videoInputIdx++;
          avatarComposited = true;
        } else {
          filterParts.push(
            '[' + videoInputIdx + ':v]crop=iw:ih*' + panelR.toFixed(4) + ':0:ih*' + padTopR.toFixed(4) +
            ',scale=' + boxW + ':' + boxH + ':flags=lanczos,setsar=1[avpanel]'
          );
        }
      } else {
        // Box mode: a small presenter box, media and text use the rest of the frame.
        const boxW = Math.round((comp.boxWidth || 520) * scaleW);
        const boxH = Math.round(boxW * aspect);
        const margin = Math.round((comp.margin || 40) * scaleW);
        const align = comp.align || 'center';
        boxX = align === 'left' ? margin : align === 'right' ? LM.W - boxW - margin : Math.round((LM.W - boxW) / 2);
        boxY = Math.round(LM.H * (comp.boxY || 0.52));
        filterParts.push(
          '[' + videoInputIdx + ':v]crop=iw:ih*' + panelR.toFixed(4) + ':0:ih*' + padTopR.toFixed(4) +
          ',scale=' + boxW + ':' + boxH + ':flags=lanczos,setsar=1[avpanel]'
        );
      }

      if (!avatarComposited) {
        if (avatar.chromaKey) {
          filterParts.push('[avpanel]chromakey=0x00FF00:0.08:0.2[avck]');
          filterParts.push('[' + lastVideo + '][avck]overlay=' + boxX + ':' + boxY + '[vpresenter]');
        } else {
          filterParts.push('[' + lastVideo + '][avpanel]overlay=' + boxX + ':' + boxY + '[vpresenter]');
        }
      }

      // moldura da caixa (so ligada explicitamente no config)
      if (!LM.split && comp.border !== false) {
        const bc = String(comp.borderColor || '#E04848').replace('#', '0x');
        const bw = Math.round((comp.borderWidth || 3) * scaleW);
        const boxW = Math.round((comp.boxWidth || 520) * scaleW);
        const boxH = Math.round(boxW * aspect);
        filterParts.push(
          '[vpresenter]drawbox=x=' + boxX + ':y=' + boxY + ':w=' + boxW + ':h=' + boxH +
          ':color=' + bc + '@0.85:t=' + bw + '[vboxed]'
        );
        lastVideo = 'vboxed';
      } else {
        lastVideo = 'vpresenter';
      }
      videoInputIdx++;
    }

    // ---- seam between the two bands
    if (LM.split && bandH < LM.H && cfg.layout && cfg.layout.divider && cfg.layout.divider.enabled !== false) {
      const dc = String(cfg.layout.divider.color || '#FF8A3D').replace('#', '0x');
      const dw = Math.max(1, Math.round(Number(cfg.layout.divider.width || 4) * (LM.W / 1080)));
      filterParts.push(
        '[' + lastVideo + ']drawbox=x=0:y=' + (bandH - Math.round(dw / 2)) + ':w=' + LM.W + ':h=' + dw +
        ':color=' + dc + '@0.9:t=fill[vseam]'
      );
      lastVideo = 'vseam';
    }

    // ---- frase da cena (titulo/caption/headline), normalizada
    // Declarada aqui, ANTES de qualquer uso: antes vivia em baixo, no bloco
    // das legendas, e o bloco do texto abaixo do avatar usava-a primeiro â€”
    // com uma cena sem texto, isso era um ReferenceError (TDZ) que matava o
    // build inteiro.
    const scene = scenes[i] || {};
    const phrase = scene.text || scene.caption ||
      (Array.isArray(scene.headline) ? scene.headline.join(' ') : scene.headline) || '';

    // ---- texto embaixo do avatar (nao na frente do rosto, apenas abaixo do peito)
    // cards.belowText.mode: "keywords" = so as palavras-chave (o usuario pediu: a frase
    // completa poluia o avatar); "full" = frase inteira; "off" = nada. maxWords limita.
    if (hasAvatar && LM.split && (t.text || phrase)) {
      const BELOW = (cfg.cards && cfg.cards.belowText) || {};
      const belowMode = String(BELOW.mode || 'keywords').toLowerCase();
      const rawBelow = String(t.text || phrase || '');
      // Reserva: quando a frase da cena so da 1 palavra ("O QUE SÃƒO AGENTES"),
      // o texto de apoio e a narracao entram para o avatar nao ficar sozinho
      // com uma palavra solta.
      const belowScene = scenes[i] || {};
      const belowWords = belowMode === 'keywords'
        ? styleWords(
            keywordsWithFallback(
              rawBelow,
              [belowScene.body, belowScene.narration],
              (BELOW && BELOW.maxWords) || 3
            ),
            cfg.cards?.textStyle || {}
          ).join(' ')
        : belowMode === 'off' ? '' : rawBelow;
      const belowText = belowWords;
      if (belowText.length > 0) {
        const fontSizeBelow = Math.max(20, Math.round(LM.H * 0.025));
        const marginBelow = Math.round(LM.H * 0.05);
        const maxCharsPerLine = Math.round(LM.W / (fontSizeBelow * 0.55));
        // Quebra manual em linhas para nao estourar a largura da janela
        const words = belowText.split(/\s+/);
        const lines = [];
        let cur = '';
        for (const w of words) {
          const trial = cur ? cur + ' ' + w : w;
          if (trial.length <= maxCharsPerLine) cur = trial;
          else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        const lineH = Math.round(fontSizeBelow * 1.25);
        let y = LM.H - marginBelow - (lines.length - 1) * lineH;
        for (const ln of lines) {
          const escapeText = ln
            .replace(/\\/g, '\\\\')
            .replace(/'/g, '\u2019')
            .replace(/:/g, '\\:')
            .replace(/%/g, '\\%');
          filterParts.push(
            '[' + lastVideo + ']drawtext=font=Arial:' +
            'text=\'' + escapeText + '\':' +
            'fontsize=' + fontSizeBelow + ':' +
            'fontcolor=white:' +
            'x=(w-text_w)/2:' +
            'y=' + y + ':' +
            'borderw=3:' +
            'bordercolor=black@0.9[vbelow]'
          );
          lastVideo = 'vbelow';
          y += lineH;
        }
      }
    }

    // B-roll sits between the card and the presenter (kept simple on purpose)
    const br = broll.find((b) => b.scene === i);
    if (br && br.files.length) {
      // reserved: full b-roll compositing
    }

    // Subtitles
    const subsEnabled = subtitles?.[lang];
    if (subsEnabled && (t.text || phrase)) {
      // O P0 da revisao: esta chamada decide o estilo das legendas (tinta sobre
      // o cartao creme vs branco sobre imagem). Com a banda de cima em Remotion,
      // a pasta visuals/ (footage da referencia) NAO pode contar â€” senao o
      // footage volta a entrar no video. O scene.visual explicito conta sempre.
      const hasSceneVisual = !!sceneVisual(scenes, dir, i, {
        ignoreVisualsFolder: topEngineOf(cfg) === 'remotion',
      });
      const sceneAss = writeSceneASS(
        cfg, dir, lang, String(i + 1).padStart(2, '0'), t.text, dur, bandH,
        !hasSceneVisual,
        {
          phrase,
          anchorY: textAnchorY(cfg, SL),
          // reservas para a frase grande: quando o titulo e curto demais
          phraseFallbacks: [scene.body, scene.narration],
          // Com a banda de cima em Remotion, a frase JA esta pintada na banda
          // (tipografia cinetica com as mesmas palavras-chave). A camada ASS
          // duplicava-a por cima â€” a banda ficava ilegivel.
          phraseInBand: topEngineOf(cfg) === 'remotion',
        }
      );
      if (sceneAss) {
        const simpleName = 'sub_' + lang.replace(/[^A-Za-z0-9]/g, '_') + '_' + String(i + 1).padStart(2, '0') + '.ass';
        // A legenda vai para a pasta de build DA CENA, nao para a raiz do
        // workspace: o filtro `subtitles=` recebe um nome relativo e o ffmpeg
        // resolve-o contra o cwd do processo. Com a legenda na raiz, o build
        // so funcionava se o motor fosse lancado a partir de D:\CRAFT â€”
        // a partir de outro directorio, a primeira cena falhava com
        // "Unable to open sub_pt_BR_01.ass". O cwd do ffmpeg e fixado abaixo.
        fs.copyFileSync(sceneAss, path.join(buildDir, simpleName));
        // No fontsdir here: the drive colon cannot be escaped reliably through the
        // filtergraph parser ("No option name near '/Windows/Fonts'"). With 'Arial' as the
        // style font (which exists on this Windows) libass finds it via the native Windows
        // font provider.
        // (O literal "1075)}" que aparecia no video nao era deste filtro: era o
        // campo "Effect" em falta na linha Dialogue â€” corrigido em
        // clone/lib/ass.mjs, com teste de regressao em ass.test.mjs.)
        filterParts.push('[' + lastVideo + ']subtitles=' + simpleName + '[vsub]');
        lastVideo = 'vsub';
      }
    }

    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', cards[i].file];
    let audioInputIdx = 1;
    if (hasAvatar) {
      args.push('-stream_loop', '-1', '-i', avatar.file);
      audioInputIdx++;
    }

    const fitFilter = tempo !== 1 ? 'atempo=' + tempo.toFixed(4) + ',' : '';
    const audioArgs = t.file
      ? ['-i', t.file, '-af', fitFilter + 'apad=whole_dur=' + dur + ',atrim=0:' + dur + ',aresample=' + cfg.video.sampleRate]
      : ['-f', 'lavfi', '-i', 'anullsrc=r=' + cfg.video.sampleRate + ':cl=stereo', '-af', 'atrim=0:' + dur];
    args.push(...audioArgs);

    if (filterParts.length) {
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[' + lastVideo + ']');
    } else {
      args.push('-map', '0:v');
    }
    args.push('-map', String(audioInputIdx) + ':a');
    args.push(
      '-frames:v', String(frames),
      '-c:v', cfg.video.codec, '-crf', String(cfg.video.crf), '-preset', cfg.video.preset,
      '-pix_fmt', cfg.video.pixFmt,
      '-c:a', cfg.video.audioCodec, '-b:a', cfg.video.audioBitrate, '-ar', String(cfg.video.sampleRate), '-ac', '2',
      '-shortest', out
    );
    // cwd: buildDir â€” o filtro de legendas usa o nome relativo do .ass, que
    // o ffmpeg resolve contra o cwd do processo.
    const r = await run(FFMPEG, args, { cwd: buildDir, timeoutMs: TIMEOUT.ffmpeg });
    if (r.code !== 0) throw new Error('ffmpeg (cena ' + (i + 1) + ' ' + lang + '): ' + String(r.stderr).slice(-800));
    clips.push({ file: out, duration: frames / fps, presenter: hasAvatar ? wanted : null });
  }
  return clips;
}

/**
 * One animated clip per presenter, generated once and reused by every scene.
 *
 * LivePortrait is the expensive step (~50 s per face), so the result is cached on disk
 * and only regenerated when the portrait or the driving template changes.
 */
async function generateAvatarClips(cfg, dir, scenes, drivingVideoFile) {
  const registry = cfg.avatar?.avatars || {};
  const outDir = path.join(dir, 'avatar');
  fs.mkdirSync(outDir, { recursive: true });

  // Which presenters actually appear in this script?
  const wanted = new Set();
  const def = cfg.avatar?.default;
  if (def) wanted.add(def);
  for (const sc of scenes) {
    const who = speakerOf(sc);
    if (who) wanted.add(who);
  }
  if (!wanted.size) {
    // legacy single-avatar config
    const legacy = cfg.avatar?.liveportrait?.sourceImage;
    if (legacy) return { _legacy: { file: path.join(outDir, 'liveportrait_avatar.mp4'), name: '_legacy' } };
    return {};
  }

  const clips = {};
  // templates[avatar][templatePath] = clip  -> cada beat usa o SEU driver
  const templates = {};

  for (const key of wanted) {
    const a = registry[key];
    if (!a) {
      console.log('  avatar "' + key + '" nao existe no registo, ignorado');
      continue;
    }
    const sourceImage = a.sourceImage;
    if (!sourceImage || !fs.existsSync(sourceImage)) {
      console.log('  avatar ' + key + ': sourceImage em falta (' + sourceImage + ')');
      continue;
    }

    // ---- drivers que este avatar usa, por beat -------------------------------
    // O contrato de direcao (direcao.mjs) poe `driving_template` no estado de
    // cada beat: work/avatars/driving_templates/<avatar>_<emocao>.mp4. Esse e
    // o MODELO DE AVATAR do projeto. Sem isto o motor usava o driver generico
    // do LivePortrait (d13.pkl) e o avatar saia com a cara errada.
    const beatDrivers = [];
    for (const sc of scenes) {
      const who = sc.avatar || sc.presenter;
      const state = sc[key + '_state'];
      const tpl = state && state.driving_template;
      if (!tpl) continue;
      const abs = resolveProjectPath(tpl);
      if (!beatDrivers.includes(abs)) beatDrivers.push(abs);
    }
    const drivers = beatDrivers.filter(d => fs.existsSync(d));
    const missingDrivers = beatDrivers.filter(d => !fs.existsSync(d));

    // Prioridade: drivers do contrato de direcao > driving video extraido do
    // referencia > drivingVideo do avatar > global.
    const fallback = drivingVideoFile || a.drivingVideo || cfg.avatar.liveportrait?.drivingVideo;
    const plan = [];
    for (const d of drivers) plan.push({ driver: d, key: key + '__' + path.basename(d, path.extname(d)) });
    if (!plan.length && fallback && fs.existsSync(fallback)) {
      plan.push({ driver: fallback, key: key });
    }

    if (!plan.length) {
      console.log('  avatar ' + key + ': drivingVideo em falta');
      continue;
    }
    if (missingDrivers.length) {
      console.log('  avatar ' + key + ': ' + missingDrivers.length + ' driving_template(s) do beat em falta -> ' +
        missingDrivers.map(m => path.basename(m)).join(', '));
    }
    if (drivers.length) {
      console.log('  avatar ' + key + ': ' + drivers.length + ' driver(s) do contrato de direcao: ' +
        drivers.map(d => path.basename(d)).join(', '));
    }

    const perTemplate = {};
    let primeiro = null;

    for (const item of plan) {
      const driving = item.driver;
      const outFile = path.join(outDir, item.key + '.mp4');
      const fresh =
        fs.existsSync(outFile) &&
        fs.statSync(outFile).mtimeMs > fs.statSync(sourceImage).mtimeMs &&
        fs.statSync(outFile).mtimeMs > fs.statSync(driving).mtimeMs;

      if (fresh) {
        console.log('  avatar ' + key + ': cache reutilizado (' + path.basename(outFile) + ')');
      } else {
        console.log('  avatar ' + key + ': a animar com LivePortrait... [' + path.basename(driving) + ']');
        const lpCfg = Object.assign({}, cfg.avatar, { liveportrait: Object.assign({}, cfg.avatar.liveportrait, a.liveportrait || {}) });
        try {
          await runLivePortrait(cfg, lpCfg, sourceImage, driving, outFile, dir);
          console.log('  avatar ' + key + ': ok -> ' + outFile);
        } catch (e) {
          console.log('  avatar ' + key + ': FALHOU â€” ' + e.message);
          continue;
        }
      }

      // Geometry of the usable panel inside the padded canvas, so the scene can crop
      // the letterbox away instead of showing grey bars.
      const sidecar = sourceImage.replace(/\.[^.]+$/, '.json');
      let padTopRatio = 0;
      let panelHeightRatio = 1;
      let clipAspect = 1;
      if (fs.existsSync(sidecar)) {
        try {
          const geo = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
          if (geo.height) {
            padTopRatio = Number(geo.padTop || 0) / Number(geo.height);
            panelHeightRatio = Number(geo.panelHeight || geo.height) / Number(geo.height);
            // altura/largura do painel util: serve para dimensionar a caixa
            clipAspect = Number(geo.panelHeight || geo.height) / Number(geo.panelWidth || geo.width || 1);
          }
        } catch { /* keep defaults */ }
      }

      const clipObj = {
        file: outFile,
        name: a.name || key,
        role: a.role || '',
        chromaKey: a.chromaKey || false,
        padTopRatio,
        panelHeightRatio,
        panelAspect: clipAspect,
        driver: driving,
      };

      // Loop sem costura: a cena faz -stream_loop -1, que e um CORTE SECO a
      // cada repeticiao. Com um template curto (3.1s) o avatar piscava a
      // cada ~3 segundos. O ping-pong (clip + invertido)remove o corte.
      try {
        const target = Number(cfg.scene?.maxSeconds || 18);
        const looped = await ensureSeamlessLoop(FFMPEG, FFPROBE, outFile, target);
        if (looped !== outFile) {
          const dOrig = await probeMediaDuration(FFPROBE, outFile);
          const dLoop = await probeMediaDuration(FFPROBE, looped);
          console.log('  avatar ' + key + ': loop sem costura (' + dOrig.toFixed(1) + 's -> ' + dLoop.toFixed(1) + 's)');
          clipObj.file = looped;
          clipObj.loopFile = looped;
        } else {
          const d = await probeMediaDuration(FFPROBE, outFile);
          if (d) console.log('  avatar ' + key + ': ' + d.toFixed(1) + 's, sem loop necessario');
        }
      } catch (e) {
        console.log('  avatar ' + key + ': nao foi possivel criar loop sem costura â€” ' + e.message);
      }

      perTemplate[driving] = clipObj;
      if (!primeiro) primeiro = clipObj;
    }

    templates[key] = perTemplate;
    if (primeiro) clips[key] = primeiro;
  }
  clips._templates = templates;
  return clips;
}

// ---------------------------------------------------------------- join clips per language

async function joinClips(cfg, clips, dir, lang) {
  const out = path.join(dir, 'out', 'final_' + lang + '.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const t = Number(cfg.transition?.seconds || 0);
  const useXfade = cfg.transition?.type === 'xfade' && clips.length > 1 && t > 0;
  const inputs = [];
  for (const c of clips) inputs.push('-i', c.file);
  const music = cfg.music?.path && fs.existsSync(cfg.music.path) ? cfg.music.path : '';
  if (music) {
    if (cfg.music.loop !== false) inputs.push('-stream_loop', '-1');
    inputs.push('-i', music);
  }

  const parts = [];
  let videoTail = '0:v';
  let audioTail = '0:a';

  if (useXfade) {
    let acc = clips[0].duration;
    for (let i = 1; i < clips.length; i++) {
      const offset = acc - t;
      const vLabel = 'v' + i;
      const aLabel = 'a' + i;
      parts.push('[' + videoTail + '][' + i + ':v]xfade=transition=' + (cfg.transition.name || 'fade') + ':duration=' + t + ':offset=' + offset.toFixed(3) + '[' + vLabel + ']');
      parts.push('[' + audioTail + '][' + i + ':a]acrossfade=d=' + t + ':c1=tri:c2=tri[' + aLabel + ']');
      videoTail = vLabel;
      audioTail = aLabel;
      acc = acc + clips[i].duration - t;
    }
  } else if (clips.length > 1) {
    const pads = [];
    for (let i = 0; i < clips.length; i++) pads.push('[' + i + ':v][' + i + ':a]');
    parts.push(pads.join('') + 'concat=n=' + clips.length + ':v=1:a=1[vcat][acat]');
    videoTail = 'vcat';
    audioTail = 'acat';
  }

  let audioOut = audioTail;
  if (music) {
    const idx = clips.length;
    parts.push('[' + audioTail + ']volume=1.0[abase]');
    parts.push('[' + idx + ':a]volume=' + Number(cfg.music.gain || 0.1) + '[amus]');
    parts.push('[abase][amus]amix=inputs=2:duration=first:dropout_transition=0[amixed]');
    audioOut = 'amixed';
  }
  if (cfg.loudness?.enabled) {
    parts.push(
      '[' + audioOut + ']loudnorm=I=' + cfg.loudness.targetLufs + ':TP=' + cfg.loudness.truePeak + ':LRA=' + cfg.loudness.range + '[afinal]'
    );
    audioOut = 'afinal';
  }

  const filter = parts.join(';');
  const args = ['-y', '-hide_banner', '-loglevel', 'error', ...inputs];
  if (filter) args.push('-filter_complex', filter);
  args.push(
    '-map', '[' + videoTail + ']',
    '-map', '[' + audioOut + ']',
    '-c:v', cfg.video.codec, '-crf', String(cfg.video.crf), '-preset', cfg.video.preset, '-pix_fmt', cfg.video.pixFmt,
    '-c:a', cfg.video.audioCodec, '-b:a', cfg.video.audioBitrate, '-ar', String(cfg.video.sampleRate),
    '-movflags', '+faststart',
    '-shortest', out
  );
  const r = await run(FFMPEG, args, { timeoutMs: TIMEOUT.ffmpeg });
  if (r.code !== 0) throw new Error('ffmpeg (montagem ' + lang + '): ' + String(r.stderr).slice(-800));
  return out;
}

// ---------------------------------------------------------------- YouTube upload (stub)

async function uploadToYouTube(cfg, videoFile, metadata) {
  if (!cfg.advanced?.uploadToYoutube) return null;
  const yt = cfg.advanced.youtube || {};
  if (!yt.clientId || !yt.clientSecret || !yt.refreshToken) return null;
  console.log('  YouTube upload not fully implemented â€” requires OAuth2 token refresh flow');
  return null;
}

// ---------------------------------------------------------------- avatar generation

/** Generate avatar using LivePortrait (local Docker/Python/CPU). */
async function generateLivePortraitAvatar(cfg, avatarCfg, cards, scenes, dir) {
  const lp = avatarCfg.liveportrait || {};
  const avatarDir = path.join(dir, 'avatar');
  fs.mkdirSync(avatarDir, { recursive: true });
  
  // Source image: use first card or configured image
  let sourceImage = lp.sourceImage;
  if (!sourceImage && cards.length) {
    sourceImage = cards[0].file; // Use first typographic card as reference
  }
  if (!sourceImage || !fs.existsSync(sourceImage)) {
    console.log('  LivePortrait: sem imagem fonte vÃ¡lida');
    return null;
  }
  
  // Driving video: generate from audio or use configured
  let drivingVideo = lp.drivingVideo;
  if (!drivingVideo) {
    // Create a simple driving video from first scene narration
    // For now, use a placeholder - in production would generate from audio landmarks
    drivingVideo = path.join(CC, 'tools', 'LivePortrait', 'assets', 'examples', 'driving', 'd0.mp4');
    if (!fs.existsSync(drivingVideo)) {
      console.log('  LivePortrait: driving video padrÃ£o nÃ£o encontrado');
      return null;
    }
  }
  
  const outFile = path.join(avatarDir, 'liveportrait_avatar.mp4');
  try {
    await runLivePortrait(cfg, avatarCfg, sourceImage, drivingVideo, outFile, dir);
    if (fs.existsSync(outFile)) {
      console.log('  LivePortrait: avatar gerado em ' + outFile);
      return { file: outFile, type: 'liveportrait', loop: true };
    }
  } catch (e) {
    console.error('  LivePortrait falhou: ' + e.message);
  }
  return null;
}

/** Generate avatar using MuseTalk (local Docker/Fal API). */
async function generateMuseTalkAvatar(cfg, avatarCfg, cards, scenes, dir) {
  const mt = avatarCfg.musetalk || {};
  const avatarDir = path.join(dir, 'avatar');
  fs.mkdirSync(avatarDir, { recursive: true });
  
  // Source video: assemble cards into base video first
  const baseVideo = path.join(dir, 'build', 'base_for_musetalk.mp4');
  // TODO: create base video from cards + narration
  if (!fs.existsSync(baseVideo)) {
    console.log('  MuseTalk: base video nÃ£o disponÃ­vel');
    return null;
  }
  
  const outFile = path.join(avatarDir, 'musetalk_avatar.mp4');
  // TODO: implement MuseTalk inference
  console.log('  MuseTalk: nÃ£o implementado ainda');
  return null;
}

/** Generate avatar using HunyuanVideo-Avatar (cloud only for 6GB VRAM). */
async function generateHunyuanAvatar(cfg, avatarCfg, cards, scenes, dir) {
  console.log('  Hunyuan: requer cloud (24GB+ VRAM)');
  return await generateCloudAvatar(cfg, avatarCfg, cards, scenes, dir);
}

/** Generate avatar using cloud (RunPod/Vast.ai/Lambda). */
async function generateCloudAvatar(cfg, avatarCfg, cards, scenes, dir) {
  const cloud = avatarCfg.cloud || {};
  const provider = cloud.provider || 'runpod';
  
  if (provider === 'runpod') {
    return await runRunPodCloudAvatar(cfg, cloud.runpod, avatarCfg, cards, scenes, dir);
  }
  // Add vastai, lambda later
  console.log('  Cloud provider ' + provider + ' nÃ£o implementado');
  return null;
}

/** RunPod cloud avatar generation. */
async function runRunPodCloudAvatar(cfg, runpodCfg, avatarCfg, cards, scenes, dir) {
  if (!runpodCfg.apiKey) {
    console.log('  RunPod: API key nÃ£o configurada');
    return null;
  }
  
  const avatarDir = path.join(dir, 'avatar');
  fs.mkdirSync(avatarDir, { recursive: true });
  
  // Determine which engine to run on cloud
  const engine = avatarCfg.type || 'liveportrait';
  
  // Prepare params for cloud
  const params = {
    engine,
    sourceImage: cards[0]?.file,
    drivingVideo: avatarCfg.liveportrait?.drivingVideo,
    narration: scenes.map(s => s.narration).join(' '),
    resolution: avatarCfg.liveportrait?.resolution || 512,
    outputPath: '/workspace/output.mp4'
  };
  
  try {
    const result = await runCloudAvatar(cfg, avatarCfg, engine, params, dir);
    if (result && result.ok && result.file) {
      console.log('  Cloud: avatar gerado em ' + result.file);
      return { file: result.file, type: 'cloud-' + engine, loop: true };
    }
  } catch (e) {
    console.error('  Cloud falhou: ' + e.message);
  }
  return null;
}

// ---------------------------------------------------------------- OPUS 5.5 REFERENCE-FIRST PHASE
/**
 * Consulta a biblioteca Opus 5.5 para prompts relevantes antes de gerar.
 * Esta fase e obrigatoria (reference-first): antes de gerar qualquer video
 * ou animacao, o motor pesquisa prompts relevantes na biblioteca de 703
 * prompts do repositorio awesome-opus5-5-videos.
 *
 * @param {object} cfg - configuracao carregada
 * @returns {object} { referencias: Array, adaptacoes: Array }
 */
async function consultarReferenciasOpus5(cfg) {
  console.log('\n=== FASE REFERENCE-FIRST: Opus 5.5 ===');
  const { estatisticas, buscarPrompts, adaptarPrompt } = await carregarOpus5();
  const stats = estatisticas();
  console.log(`  Catalogo: ${stats.total} prompts (${Object.entries(stats.byCategory).map(([k,v])=>k+':'+v).join(', ')})`);

  // Determinar tecnologias alvo baseadas na config
  const topEngine = cfg.cards?.topEngine || 'effectcraft';
  const techsAlvo = topEngine === 'remotion' ? ['canvas', 'gsap', 'svg'] :
                    topEngine === 'effectcraft' ? ['svg', 'gsap', 'canvas'] :
                    ['canvas', 'svg'];

  // Categorias relevantes para o tipo de video
  const categorias = cfg.cards?.belowText?.mode === 'keywords' ? ['motion', 'explainer'] :
                     topEngine === 'remotion' ? ['motion', '3d', 'interactive'] :
                     ['motion', 'explainer'];

  const referencias = [];
  const adaptacoes = [];

  for (const cat of categorias) {
    for (const tech of techsAlvo) {
      const prompts = buscarPrompts({ category: cat, tech: [tech], limit: 2 });
      for (const p of prompts) {
        if (!referencias.some(r => r.slug === p.slug)) {
          referencias.push(p);
          // Gerar adaptacao automatica para o contexto atual
          const langArr = Array.isArray(cfg.languages?.supported) ? cfg.languages.supported : [cfg.languages?.supported || 'pt-BR'];
          const contexto = `Clone video: ${cfg.script?.kicker || cfg.script?.headline || 'Dark IA'} - ${langArr.join(', ')}`;
          const adapt = adaptarPrompt(p.slug, contexto, techsAlvo);
          if (adapt) adaptacoes.push(adapt);
        }
      }
    }
  }

  console.log(`  Referencias coletadas: ${referencias.length} prompts unicos`);
  console.log(`  Adaptacoes geradas: ${adaptacoes.length}`);

  // Log das top 3 referencias
  for (const r of referencias.slice(0, 3)) {
    console.log(`    - ${r.slug} (${r.category}/${r.tech_tags.join(',')}): ${r.prompt_preview.slice(0, 100)}...`);
  }

  return { referencias, adaptacoes };
}

// ---------------------------------------------------------------- main

async function main() {
  if (ARG_ERRORS.length) {
    console.error('linha de comando invalida:');
    for (const e of ARG_ERRORS) console.error('  ' + e);
    process.exit(2);
  }

  const cfg = loadConfigFile({
    configPath: CONFIG_PATH,
    overrides: argAll('set'),
    voice: VOICE,
    music: MUSIC_FILE,
    transition: TRANSITION_TYPE,
  });

  // ffmpeg/ffprobe: a config pode apontar para um binario proprio
  // (paths.ffmpeg / paths.ffprobe). Antes estes campos eram decorativos â€”
  // o motor procurava sempre no PATH do utilizador e no do hermes, e a
  // mensagem de erro mandava "preenche paths.ffmpeg na config" sem que
  // isso tivesse qualquer efeito. Agora a config e honrada.
  FFMPEG = findFfmpeg('ffmpeg', cfg.paths?.ffmpeg || '');
  FFPROBE = findFfmpeg('ffprobe', cfg.paths?.ffprobe || '');

  // FASE REFERENCE-FIRST: consultar biblioteca Opus 5.5
  const { referencias, adaptacoes } = await consultarReferenciasOpus5(cfg);
  // As adaptacoes ficam disponiveis para o resto do pipeline via closure
  // (podem ser usadas por EffectCraft, Remotion, cards, etc.)
  cfg._opus5Refs = { referencias, adaptacoes };

  // --validate: diagnostico da config e nada mais. Sem ficheiros, sem rede,
  // sem custo â€” e o que se corre antes de cada build para apanhar typos.
  if (VALIDATE) {
    const report = validateConfig(cfg, rawConfig(cfg), {
      hasExternalScript: !!(SCRIPT_PATH && fs.existsSync(SCRIPT_PATH)),
    });
    console.log('config      : ' + CONFIG_PATH);
    console.log('cenas       : ' + (loadScenes(cfg).scenes.length));
    console.log('banda de cima: ' + topEngineOf(cfg));
    console.log('voz         : ' + cfg.voice.engine);
    console.log('idiomas     : ' + (Array.isArray(cfg.languages.supported) ? cfg.languages.supported : [cfg.languages.supported || 'pt-BR']).join(', '));
    if (report.errors.length) {
      console.error('\nERROS (' + report.errors.length + '):');
      for (const e of report.errors) console.error('  x ' + e);
    }
    if (report.warnings.length) {
      console.log('\nAVISOS (' + report.warnings.length + '):');
      for (const w of report.warnings) console.log('  ! ' + w);
    }
    if (!report.errors.length) console.log('\nconfig valida.');
    process.exit(report.ok ? 0 : 1);
  }

  // ---- 0-A REFERENCE INGEST -----------------------------------------
  // Quando --url/--video e dado, a referencia e o script: analisada aqui
  // (anatomia, corts, geometria, OCR, faces) e o seu script.json e usado.
  // Sem esta fase o motor produzia SEMPRE o clone generico da config —
  // o clone de 2026-11-15 saiu desligado da origem por isto.
  if (!SCRIPT_PATH && (URL_REF || VIDEO_REF)) {
    console.log('\n0-A/6 referencia');
    const slugRef = SLUG || (VIDEO_REF ? path.basename(VIDEO_REF, path.extname(VIDEO_REF)) : 'clone-' + Date.now());
    const refArgs = [path.join(HERE, 'yt-ref-analyze.mjs')];
    if (VIDEO_REF) refArgs.push('--video', VIDEO_REF);
    else refArgs.push('--url', URL_REF);
    refArgs.push('--slug', slugRef, '--scenes', String(REF_SCENES), '--presenters', 'frida,luna');
    if (REF_TOPIC) refArgs.push('--script', '--topic', REF_TOPIC);
    console.log('  a analisar a referencia: ' + (URL_REF || VIDEO_REF));
    const t0 = Date.now();
    const r = await run(process.execPath, refArgs, { timeoutMs: 20 * 60 * 1000 });
    const outTxt = String(r.out || r.err || '').trim();
    if (outTxt) console.log(outTxt.slice(-1600));
    const candidate = path.join(CC, 'work', 'clones', slugRef, 'script.json');
    if (r.code !== 0 || !fs.existsSync(candidate)) {
      console.error('a analise da referencia falhou (codigo ' + r.code + '). nada foi gerado.');
      process.exit(4);
    }
    SCRIPT_PATH = candidate;
    console.log('  referencia analisada em ' + ((Date.now() - t0) / 1000).toFixed(0) + 's -> ' + candidate);
  }

  const script = loadScenes(cfg);
  if (!script.scenes.length) {
    console.error('sem cenas: usa --script <cenas.json> ou preenche script.scenes na config');
    process.exit(2);
  }

  // 0-A CONTRATO DE DIRECAO — o motor precisa do estado de cada beat
  //     (active_speaker, frida_state/luna_state com emotion e driving_template).
  //     Sem isto o avatar usava SEMPRE o driver generico do LivePortrait e
  //     perdia a expressao da cena. O que estiver escrito a mao no beat
  //     vence a inferencia (normalizarDirecao nao sobrescreve).
  if (cfg.direction?.enabled !== false && cfg.avatar?.avatars && Object.keys(cfg.avatar.avatars).length >= 2) {
    try {
      const comDirecao = aplicarDirecaoAoPlano({ scenes: script.scenes }, {
        falantes: Object.keys(cfg.avatar.avatars),
      });
      let comAvatar = 0;
      for (const sc of comDirecao.scenes) {
        // A cena tem de saber QUEM fala: o motor le sc.avatar / sc.presenter.
        if (!sc.avatar && !sc.presenter && sc.active_speaker) sc.avatar = sc.active_speaker;
        if (sc.avatar || sc.presenter) comAvatar++;
      }
      script.scenes = comDirecao.scenes;
      const drivers = new Set();
      for (const sc of script.scenes) {
        for (const k of Object.keys(sc)) {
          if (!k.endsWith('_state')) continue;
          const t = sc[k] && sc[k].driving_template;
          if (t) drivers.add(path.basename(t));
        }
      }
      console.log('direcao     : ' + comAvatar + '/' + script.scenes.length + ' cenas com apresentador | ' +
        (drivers.size ? [...drivers].join(', ') : 'sem driving_template'));
    } catch (e) {
      console.log('direcao     : nao aplicada — ' + e.message);
    }
  }

  // Translation is rate-limited on the free endpoints: localize once per language.
  const localizedCache = new Map();
  const getLocalized = async (lang) => {
    if (!localizedCache.has(lang)) localizedCache.set(lang, await localizeScenes(cfg, script.scenes, lang));
    return localizedCache.get(lang);
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  // slug: nome seguro para uma pasta. Sem esta proteccao, "--slug ../../.."
  // escrevia fora da pasta de builds (o daemon 8799 aceita pedidos locais
  // sem autenticacao, e um browser pode fazer POST cross-origin a localhost).
  const rawSlug = SLUG || path.basename(SCRIPT_PATH || '').replace(/\.[^.]+$/, '') || 'clone-' + stamp;
  const slug = String(rawSlug).replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) ||
    ('clone-' + stamp);
  // path.resolve: os caminhos que daqui saem resolvem contra a raiz do
  // workspace (D:\CRAFT), e nao contra o directorio de onde o comando foi
  // lancado (o run() usa process.cwd() como cwd por omissao).
  const dir = path.resolve(OUT_DIR || cfg.paths.workDir, slug);
  fs.mkdirSync(dir, { recursive: true });

  const languages = (cfg.languages?.supported && Array.isArray(cfg.languages.supported) && cfg.languages.supported.length)
    ? cfg.languages.supported
    : [cfg.languages?.default || 'pt-BR'];

  console.log('clone       : ' + slug);
  console.log('cenas       : ' + script.scenes.length + ' (' + script.source + ')');
  console.log('video       : ' + cfg.video.width + 'x' + cfg.video.height + ' @' + cfg.video.fps + 'fps, ' + cfg.video.codec + ' crf ' + cfg.video.crf);
  console.log('idiomas     : ' + languages.join(', '));
  console.log('voz         : ' + cfg.voice.engine);
  console.log('avatar      : auto (detectando VRAM...)');
  console.log('b-roll      : ' + (cfg.pipeline?.broll?.enabled ? cfg.pipeline.broll.source : 'desativado'));
  console.log('ffmpeg      : ' + (FFMPEG || 'NAO ENCONTRADO'));

  // 0/6 PREFLIGHT â€” o hook que evita perder 22 minutos.
  //     Um clone morreu no passo 5/6 depois de 22 min de LivePortrait+TTS com
  //     "lipSyncByLang is not defined"; outro passou mas com avatares feios
  //     porque usava o driver generico e a base errada. Aqui apanha-se isso em
  //     segundos, antes de gastar GPU, rede e tempo.
  console.log('\n0/6 preflight');
  const preflight = runPreflight(cfg, script, { slug });
  console.log(formatPreflight(preflight));
  if (!preflight.ok) {
    console.error('\nPREFLIGHT FALHOU â€” nada foi gerado. Corrige o que estÃ¡ acima e volta a correr.');
    process.exit(3);
  }

  if (DRY) {
    console.log('\n--dry-run: nada foi escrito.');
    return;
  }
  if (!FFMPEG) throw new Error('ffmpeg nao encontrado â€” instala ou aponta paths.ffmpeg na config');

  // 1. Cards are built per language later, after the text is translated
  console.log('\n1/6 preparacao');
  const avatarMode = !!(cfg.avatar && cfg.avatar.enabled);

  // 1.5 Driving video da referencia â€” extrai a parte do apresentador do video de
  //     referencia (regiao inferior, abaixo da linha de divisao) para usar como -d
  //     do LivePortrait. Assim o avatar copia os gestos e movimentos de cabeca do
  //     cara do short original, em vez de usar um driver generico (d13.pkl).
  //     So roda com --driving-video.
  console.log('1.5/6 driving video (gestos do referencia)');
  let drivingVideoFile = null;
  if (DRIVING_VIDEO && fs.existsSync(DRIVING_VIDEO)) {
    const outDriving = path.join(dir, 'driving_ref.mp4');
    if (!fs.existsSync(outDriving)) {
      // topRatio = onde termina a banda de cima e comeÃ§a a do apresentador (medido: ~57%)
      const topRatio = Number((cfg.layout && cfg.layout.topRatio) || 0.55);
      const cropH = Math.max(100, Math.round(1920 * (1 - topRatio)));
      const cropY = Math.round(1920 * topRatio);
      // Driving video com duracao completa da referencia para o avatar nao ficar fixo
      // ao fazer loop. Usa ate 60s (ou o que o video tiver).
      const r = await run(FFMPEG, [
        '-y', '-v', 'error',
        '-i', DRIVING_VIDEO,
        '-filter_complex',
        '[0:v]crop=1080:' + cropH + ':0:' + cropY + ',scale=720:-2:flags=lanczos,setsar=1[drv]',
        '-map', '[drv]', '-an',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-t', '60',
        outDriving,
      ], { timeoutMs: TIMEOUT.ffmpeg });
      if (r.code !== 0) console.log('    falha ao extrair driving video â€” ' + String(r.stderr).slice(-200));
    } else {
      console.log('    driving video ja existe, reutilizado');
    }
    drivingVideoFile = outDriving;
    console.log('    driving video: ' + path.basename(outDriving));
  } else if (DRIVING_VIDEO) {
    console.log('    video de referencia para driving nao encontrado: ' + DRIVING_VIDEO);
  } else {
    console.log('    sem --driving-video (avatar usa driver generico d13.pkl â€” gestos nao sao do referencia)');
  }

  // 2. Avatar engine selection + generation
  console.log('2/6 avatares');
  let avatarClips = {};
  if (cfg.avatar?.enabled) {
    const engine = await selectAvatarEngine(cfg);
    console.log('  engine: ' + engine);
    if (engine === 'liveportrait') {
      avatarClips = await generateAvatarClips(cfg, dir, script.scenes, drivingVideoFile);
    } else if (engine === 'cloud' || engine === 'hunyuan' || engine === 'musetalk') {
      console.log('  engine ' + engine + ' ainda nao ligado â€” a usar cartoes');
    }
    const names = Object.keys(avatarClips);
    console.log('  apresentadores: ' + (names.length ? names.join(', ') : 'nenhum (cartoes)'));
  } else {
    console.log('  avatar desactivado na config');
  }

  // 3. B-roll (if enabled)
  console.log('3/6 b-roll');
  const broll = await fetchBroll(cfg, script.scenes, dir);
  console.log('    ' + broll.reduce((a, b) => a + b.files.length, 0) + ' clipes baixados');

  // 4. Narration + subtitles per language
  console.log('4/6 narracao + legendas');
  const allTracks = {};
  const allSubtitles = {};
  for (const lang of languages) {
    console.log('  ' + lang + '...');
    const localizedForNarration = await getLocalized(lang);
    const tracks = await buildNarrationForLanguage(cfg, localizedForNarration, dir, lang, true);
    allTracks[lang] = tracks;
    if (cfg.languages?.subtitleLanguages?.includes(lang)) {
      const srt = buildSRT(tracks, lang, dir);
      const ass = buildASS(tracks, cfg, dir, lang);
      allSubtitles[lang] = { srt, ass };
      console.log('    legendas: ' + ass);
    }
    for (const t of tracks) console.log('    ' + t.scene + ': ' + (t.file ? t.duration.toFixed(2) + 's (' + t.engine + ')' : 'sem voz'));
  }

  // 4.5 Wav2Lip â€” re-sintetiza os labios do avatar PARA CADA CENA
  //     usando o audio da PRÃ“PRIA cena e o driving template do active_speaker.
  //     Antes usava o primeiro audio para todos os avatares â€” agora e' por cena.
  console.log('4.5/6 lipsync (Wav2Lip)');
  const w2lEnabled = FLAG_WAV2LIP || !!(cfg.w2l && cfg.w2l.enabled);
  const lipSyncByLang = {};
  if (w2lEnabled && avatarMode && Object.keys(avatarClips).length && FFMPEG) {
    for (const lang of languages) {
      lipSyncByLang[lang] = {};
      const tracks = allTracks[lang] || [];
      for (let i = 0; i < script.scenes.length; i++) {
        const sc = script.scenes[i];
        const track = tracks[i];
        if (!track || !track.file || !fs.existsSync(track.file)) {
          console.log('    ' + lang + ' cena ' + (i + 1) + ': sem audio â€” pulando lipsync');
          continue;
        }

        // Quem fala nesta cena? Vem do contrato de direcao (F1)
        const activeSpeaker = sc.active_speaker;
        if (!activeSpeaker || !avatarClips[activeSpeaker]?.file) {
          console.log('    ' + lang + ' cena ' + (i + 1) + ': active_speaker ' + activeSpeaker + ' sem avatar clip â€” pulando');
          continue;
        }

        const clip = avatarClips[activeSpeaker];
        if (!clip.file || !fs.existsSync(clip.file)) continue;

        // Driving template correto para a emocao do orador ativo
        const stateKey = activeSpeaker + '_state';
        const drivingTemplate = sc[stateKey]?.driving_template;
        if (!drivingTemplate || !fs.existsSync(drivingTemplate)) {
          console.log('    ' + lang + ' cena ' + (i + 1) + ': driving template em falta â€” pulando');
          continue;
        }

        const audioFile = track.file;
        const out = path.join(dir, 'avatar', activeSpeaker + '_' + lang.replace(/[^A-Za-z0-9]/g, '_') + '_scene' + String(i + 1).padStart(2, '0') + '_lipsync.mp4');
        const fresh = fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(clip.file).mtimeMs && fs.statSync(out).mtimeMs > fs.statSync(audioFile).mtimeMs && fs.statSync(out).mtimeMs > fs.statSync(drivingTemplate).mtimeMs;
        if (fresh) {
          console.log('    ' + lang + ' cena ' + (i + 1) + ' (' + activeSpeaker + '): cache reutilizado');
          lipSyncByLang[lang]['scene' + String(i + 1).padStart(2, '0')] = Object.assign({}, clip, { file: out, scene: i, activeSpeaker });
          continue;
        }

        // Gerar avatar com LivePortrait usando o driving template correto
        // Precisamos regenerar o clip do orador com o driving template correto
        const tempDrivingDir = path.join(dir, 'build', 'lp-scene' + String(i + 1).padStart(2, '0'));
        fs.mkdirSync(tempDrivingDir, { recursive: true });
        const tempOut = path.join(tempDrivingDir, activeSpeaker + '_lipsync.mp4');

        try {
          // Re-animar o orador ativo com o driving template correto
          const lpCfg = Object.assign({}, cfg.avatar, {
            liveportrait: Object.assign({}, cfg.avatar.liveportrait, { drivingVideo: drivingTemplate })
          });
          const sourceImage = cfg.avatar.avatars[activeSpeaker].sourceImage;
          await runLivePortrait(cfg, lpCfg, sourceImage, drivingTemplate, tempOut, dir);

          // Agora sincronizar labios com Wav2Lip
          await wav2lipSync(cfg, tempOut, audioFile, out, dir);

          console.log('    ' + lang + ' cena ' + (i + 1) + ' (' + activeSpeaker + '): lipsync ok -> ' + path.basename(out));
          lipSyncByLang[lang]['scene' + String(i + 1).padStart(2, '0')] = Object.assign({}, clip, { file: out, scene: i, activeSpeaker });
        } catch (e) {
          console.log('    ' + lang + ' cena ' + (i + 1) + ' (' + activeSpeaker + '): lipsync FALHOU â€” ' + e.message + ' (usa avatar sem sincronia)');
          lipSyncByLang[lang]['scene' + String(i + 1).padStart(2, '0')] = clip;
        }
      }
    }
  } else {
    console.log('    lipsync desactivado (passe --wav2lip ou defina wav2lip.enabled=true)');
    for (const lang of languages) lipSyncByLang[lang] = avatarClips;
  }

  // 4.7 Visuals da banda de cima â€” extrai um clipe de video curto do ponto medio de cada cena
  //     do video de referencia, cortado apenas na top band (splitRatio da cena), para que o
  //     top band nao fique vazio (cor solida) e sim mostre mini-videos rodando enquanto o
  //     avatar fala embaixo. So roda com --visuals-video.
  console.log('4.7/6 visuals (banda de cima)');
  const visualsDir = path.join(dir, 'visuals');
  fs.mkdirSync(visualsDir, { recursive: true });
  if (VISUALS_VIDEO && fs.existsSync(VISUALS_VIDEO)) {
    for (let i = 0; i < script.scenes.length; i++) {
      const sc = script.scenes[i];
      const mid = Number(sc.start || (i * 10)) + (Number(sc.seconds || 8) / 2);
      const dur = Number(sc.seconds || 8);
      const ratio = Number(sc.splitRatio || (cfg.layout && cfg.layout.topRatio) || 0.55);
      const cardH = sc.layout === 'full' ? 1920 : Math.max(100, Math.round(1920 * ratio));
      const out = path.join(visualsDir, 'scene' + String(i + 1).padStart(2, '0') + '.mp4');
      if (!fs.existsSync(out)) {
        const r = await run(FFMPEG, [
          '-y', '-v', 'error',
          '-i', VISUALS_VIDEO,
          '-filter_complex',
          '[0:v]trim=start=' + mid.toFixed(3) + ':duration=' + dur.toFixed(3) + ',setpts=PTS-STARTPTS,crop=iw:ih*' + ratio.toFixed(4) + ':0:0,scale=1080:' + cardH + ':flags=lanczos,setsar=1[clip]',
          '-map', '[clip]', '-an',
          '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
          out,
        ], { timeoutMs: TIMEOUT.ffmpeg });
        if (r.code !== 0) console.log('    cena ' + (i + 1) + ': falha ao extrair clipe â€” ' + String(r.stderr).slice(-200));
      } else {
        console.log('    cena ' + (i + 1) + ': clipe ja existe, reutilizado');
      }
      console.log('    cena ' + (i + 1) + ': visual ' + path.basename(out));
    }
  } else if (VISUALS_VIDEO) {
    console.log('    video de referencia nao encontrado: ' + VISUALS_VIDEO);
  } else {
    console.log('    sem --visuals-video (top band so fica preenchida se scenes[].visual ou visuals/ tiver ficheiros)');
  }

  // 5. Cards + scene clips per language (text is translated, so cards are too)
  console.log('5/6 cartoes + cenas por idioma');
  const topEngineGlobal = topEngineOf(cfg);
  if (topEngineGlobal === 'remotion') console.log('    banda de cima: tipografia cinetica Remotion (original, sem footage de referencia)');
  const allClips = {};
  const builtByLang = {};
  for (const lang of languages) {
    const localized = await getLocalized(lang);
    const wantMotion = !!(cfg.cards && cfg.cards.motion && cfg.cards.motion.enabled);
    // cards.topEngine escolhe quem desenha a banda de cima. "remotion" = tipografia
    // cinetica original (sem footage de referencia); "effectcraft"/"figcraft" = engines
    // antigos, mantidos. Narration durations are known by now (step 4), so every card can
    // be built exactly as long as the scene it belongs to.
    const topEngine = topEngineOf(cfg);
    const sceneSeconds = (allTracks[lang] || []).map((t) => Number(t.duration || 0));
    const cards = topEngine === 'remotion'
      ? await buildRemotionCards(cfg, localized, dir, avatarMode, lang, sceneSeconds)
      : wantMotion
      ? await buildMotionCards(cfg, localized, dir, avatarMode, lang, sceneSeconds)
      : await buildCards(cfg, localized, dir, avatarMode, lang);
    builtByLang[lang] = cards;
    if (lang === languages[0]) console.log('    cartoes: ' + path.dirname(cards.cards[0].file));
    const clips = await buildSceneClips(cfg, cards.cards, allTracks[lang], avatarClips, localized, broll, allSubtitles, dir, lang, lipSyncByLang[lang] || {}, (avatarClips && avatarClips._templates) || {});
    allClips[lang] = clips;
    console.log('  ' + lang + ': ' + clips.length + ' clipes, ' + clips.reduce((a, c) => a + c.duration, 0).toFixed(1) + 's');
  }

  // 6. Final assembly per language
  console.log('6/6 montagem final');
  const outputs = {};
  for (const lang of languages) {
    const final = await joinClips(cfg, allClips[lang], dir, lang);
    const dur = await probeDuration(final);
    const bytes = fs.statSync(final).size;
    outputs[lang] = { file: final, duration: dur, bytes };
    console.log('  ' + lang + ': ' + final + ' (' + dur.toFixed(1) + 's, ' + (bytes / 1024 / 1024).toFixed(2) + ' MB)');
  }

  // Thumbnail (shared)
  const thumbOut = path.join(dir, 'out', 'thumb.png');
  const firstBuilt = builtByLang[languages[0]];
  if (firstBuilt && firstBuilt.thumb && fs.existsSync(firstBuilt.thumb)) {
    fs.copyFileSync(firstBuilt.thumb, thumbOut);
  } else if (firstBuilt && firstBuilt.cards.length) {
    // motion mode has no FigCraft thumbnail: take a frame from the first card
    const srcCard = firstBuilt.cards[0].file;
    if (/\.(mp4|mov|webm)$/i.test(srcCard)) {
      await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '1.2', '-i', srcCard, '-frames:v', '1', thumbOut], { timeoutMs: TIMEOUT.ffmpeg });
    } else {
      fs.copyFileSync(srcCard, thumbOut);
    }
  }

  // YouTube upload (optional)
  if (cfg.advanced?.uploadToYoutube) {
    console.log('\nUpload YouTube...');
    for (const lang of languages) {
      await uploadToYouTube(cfg, outputs[lang].file, {
        title: script.scenes[0]?.headline || slug,
        description: script.scenes.map(s => s.narration).join('\n\n'),
        tags: cfg.advanced.metadata?.defaultTags || [],
        category: cfg.advanced.metadata?.defaultCategory || '24',
        privacyStatus: cfg.advanced.metadata?.privacyStatus || 'private',
      });
    }
  }

  // Manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    slug,
    target: cfg.target || {},
    languages,
    script: { source: script.source, scenes: script.scenes.map((s, i) => ({ id: s.id || 's' + (i + 1), headline: s.headline, narration: s.narration })) },
    config: redactConfig(cfg),
    cards: Object.fromEntries(Object.entries(builtByLang).map(([l, b]) => [l, b.cards])),
    thumbnail: thumbOut,
    avatars: Object.fromEntries(Object.entries(avatarClips).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.file])),
    broll: broll.map(b => ({ scene: b.scene, files: b.files })),
    narration: allTracks,
    subtitles: allSubtitles,
    scenes: {},
    output: outputs,
    tools: { ffmpeg: FFMPEG, cards: topEngineGlobal || 'figcraft', voice: cfg.voice.engine, avatar: cfg.avatar?.engine || 'none', presenters: Object.keys(avatarClips).filter(k => !k.startsWith('_')) },
  };
  for (const lang of languages) {
    manifest.scenes[lang] = allClips[lang].map((c, i) => ({ file: c.file, seconds: Number(c.duration.toFixed(3)), voice: allTracks[lang][i]?.engine || 'silent', presenter: c.presenter || null }));
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // Report
  const rel = (p) => path.relative(dir, p).replace(/\\/g, '/');
  const R = [];
  R.push('# Clone â€” ' + slug);
  R.push('');
  R.push('Gerado: ' + manifest.generatedAt);
  R.push('Idiomas: ' + languages.join(', '));
  R.push('Alvo: ' + (cfg.target && cfg.target.channel ? '[' + cfg.target.channel + '](' + (cfg.target.url || '') + ')' : 'sem alvo definido'));
  R.push('');
  R.push('| Idioma | VÃ­deo final | DuraÃ§Ã£o | Tamanho |');
  R.push('|---|---|---|---|');
  for (const lang of languages) {
    const o = outputs[lang];
    R.push('| ' + lang + ' | `' + rel(o.file) + '` | ' + o.duration.toFixed(1) + 's | ' + (o.bytes / 1024 / 1024).toFixed(2) + ' MB |');
  }
  R.push('');
  R.push('| PeÃ§a | Ficheiro |');
  R.push('|---|---|');
  R.push('| Thumbnail | `' + rel(thumbOut) + '` |');
  for (const [k, v] of Object.entries(avatarClips)) {
    if (k.startsWith('_')) continue; // _templates é um map interno, não um apresentador
    R.push('| Apresentador ' + k + ' | `' + rel(v.file) + '` |');
  }
  manifest.broll.forEach(b => b.files.forEach(f => R.push('| B-roll cena ' + (b.scene + 1) + ' | `' + rel(f) + '` |')));
  R.push('');
  R.push('## ParÃ¢metros usados');
  R.push('');
  R.push('```json');
  R.push(JSON.stringify({
    video: cfg.video,
    scene: cfg.scene,
    voice: cfg.voice.engine,
    // redactConfig: o report.md e um artefacto legivel e facil de partilhar.
    // A config de avatar pode ter chaves de API (runpod, vastai, lambda,
    // musetalk) â€” no manifest.json ja eram redigidas, aqui nao ficavam.
    avatar: redactConfig(cfg.avatar),
    languages: cfg.languages,
    motion: cfg.motion,
    transition: cfg.transition,
    cards: { palette: cfg.cards.palette, headline: cfg.cards.headline },
    broll: cfg.pipeline?.broll,
  }, null, 2));
  R.push('```');
  R.push('');
  R.push('## Como repetir');
  R.push('');
  R.push('```sh');
  R.push('node D:\\CRAFT\\.artcraft\\yt-clone-build.mjs --script "' + script.source + '" --slug "' + slug + '"');
  R.push('```');
  fs.writeFileSync(path.join(dir, 'report.md'), R.join('\n'), 'utf8');

  console.log('\nâœ… ConcluÃ­do!');
  console.log('pasta       : ' + dir);
  for (const lang of languages) {
    console.log('  ' + lang + ': ' + outputs[lang].file);
  }
  console.log('thumbnail   : ' + thumbOut);
  console.log('manifest    : ' + path.join(dir, 'manifest.json'));
}

main().catch((e) => {
  console.error('ERRO: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});