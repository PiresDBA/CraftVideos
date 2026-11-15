#!/usr/bin/env node
// =============================================================================
// ARTCRAFT LAUNCHER — Interface única e simples para o pipeline completo
// =============================================================================
//
// MANUAL DE USO
// -------------
// Proposito:
//   Um unico comando para subir todo o ambiente ArtCraft:
//   1. Verifica/inicia o daemon (porta 8799) com o dashboard de canais
//   2. Abre o browser automaticamente no dashboard
//   3. Mostra status simples no console
//   4. Limpa tudo ao sair (Ctrl+C)
//
// Uso:
//   node .artcraft\launcher.mjs [--port 8799] [--no-browser] [--daemon-only]
//
//   --port N        Porta do daemon (default: 8799)
//   --no-browser    Nao abre o browser automaticamente
//   --daemon-only   So inicia o daemon, nao abre browser nem fica no foreground
//   --rebuild       Regera dashboard e studio panel antes de subir
//
// Exemplos:
//   node .artcraft\launcher.mjs                    # Tudo automatico (recomendado)
//   node .artcraft\launcher.mjs --rebuild          # Regera dashboard + sobe
//   node .artcraft\launcher.mjs --daemon-only      # So o daemon em background
//   node .artcraft\launcher.mjs --no-browser       # Sobe mas nao abre browser
//
// O que faz:
//   1. Opcionalmente regenera dashboard (yt-dashboard.mjs) + studio panel (studio-panel.mjs)
//   2. Verifica se daemon ja esta rodando na porta (health check)
//   3. Se nao, inicia yt-daemon.mjs
//   3. Abre browser em http://127.0.0.1:8799 (dashboard de canais)
//   4. Mostra status no console + logs do daemon
//   5. Ctrl+C para tudo limpo
//
// Dependencias: Node.js (fetch nativo). Zero instalacao extra.
// =============================================================================

import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DAEMON_SCRIPT = path.join(HERE, 'yt-daemon.mjs');
const DASHBOARD_SCRIPT = path.join(HERE, 'yt-dashboard.mjs');
const STUDIO_PANEL_SCRIPT = path.join(HERE, 'studio-panel.mjs');

const PORT = 8799;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${BASE_URL}/health`;
const DASHBOARD_URL = `${BASE_URL}/`;

let daemonProcess = null;
let isShuttingDown = false;

// -----------------------------------------------------------------------------
// Utilitarios
// -----------------------------------------------------------------------------
function log(...args) {
  const ts = new Date().toLocaleTimeString('pt-PT', { hour12: false });
  console.log(`[${ts}]`, ...args);
}

function err(...args) {
  const ts = new Date().toLocaleTimeString('pt-PT', { hour12: false });
  console.error(`[${ts}]`, ...args);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function healthCheck() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForDaemon(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthCheck()) return true;
    await sleep(500);
  }
  return false;
}

function startDaemon() {
  log('🚀 Iniciando daemon (yt-daemon.mjs)...');
  const child = spawn(process.execPath, [DAEMON_SCRIPT, '--port', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout?.on('data', (d) => {
    const lines = d.toString().trim().split('\n').filter(Boolean);
    for (const line of lines) log('📡', line);
  });
  child.stderr?.on('data', (d) => {
    const line = d.toString().trim();
    if (line) err('⚠️', line);
  });
  child.on('close', (code) => {
    if (!isShuttingDown) {
      err(`❌ Daemon terminou inesperadamente (codigo ${code})`);
    }
  });
  child.on('error', (e) => err('❌ Erro ao iniciar daemon:', e.message));

  return child;
}

function openBrowser(url) {
  const open = process.platform === 'win32' ? 'cmd' : 'open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(open, args, { detached: true, stdio: 'ignore' }).unref();
}

async function rebuildDashboards() {
  log('🔄 Regenerando dashboard de canais...');
  const r1 = spawn(process.execPath, [DASHBOARD_SCRIPT], { cwd: ROOT, stdio: 'inherit' });
  await new Promise(r => { r.on('close', () => r1.kill()); r1.on('close', () => r); });
  await new Promise(r => setTimeout(r, 500));

  log('🔄 Regenerando Master Studio Panel...');
  const r2 = spawn(process.execPath, [STUDIO_PANEL_SCRIPT], { cwd: ROOT, stdio: 'inherit' });
  await new Promise(r => r2.on('close', r));
  await new Promise(r => setTimeout(r, 500));

  log('✅ Dashboards regenerados');
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const FLAG = (name) => argv.includes('--' + name);
  const ARG = (name) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 ? argv[i + 1] : null;
  };

  const PORT_ARG = Number(ARG('port') || 8799);
  const NO_BROWSER = FLAG('no-browser');
  const DAEMON_ONLY = FLAG('daemon-only');
  const REBUILD = FLAG('rebuild');
  const HELP = FLAG('help') || FLAG('h');

  if (HELP) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\/ ?/gm, ''));
    process.exit(0);
  }

  log('╔══════════════════════════════════════════════════════════╗');
  log('║           ARTCRAFT LAUNCHER — Pipeline F0-F5               ║');
  log('╚══════════════════════════════════════════════════════════╝');
  log('');

  // 1. Rebuild opcional
  if (REBUILD) {
    await rebuildDashboards();
    log('');
  }

  // 2. Verifica se daemon ja esta rodando
  log('🔍 Verificando daemon na porta 8799...');
  const alreadyRunning = await healthCheck();

  if (alreadyRunning) {
    log('✅ Daemon ja esta rodando em http://127.0.0.1:8799');
  } else {
    log('⏳ Daemon nao encontrado, iniciando...');
    daemonProcess = startDaemon();
    const ok = await waitForDaemon(20000);
    if (!ok) {
      err('❌ Falha ao iniciar daemon (timeout)');
      process.exit(1);
    }
    log('✅ Daemon iniciado com sucesso');
  }

  // 3. Modo daemon-only
  if (DAEMON_ONLY) {
    log('🔧 Modo --daemon-only: daemon rodando em background');
    log('   Acesse: http://127.0.0.1:8799');
    log('   Pressione Ctrl+C para parar');
    // Mantem processo vivo
    await new Promise(() => {});
    return;
  }

  // 4. Abre browser
  if (!NO_BROWSER) {
    log('🌐 Abrindo dashboard no browser...');
    openBrowser('http://127.0.0.1:8799');
  } else {
    log('🌐 Browser nao aberto (--no-browser)');
    log(`   Acesse manualmente: http://127.0.0.1:8799`);
  }

  // 4. Status final
  log('');
  log('══════════════════════════════════════════════════════════');
  log('🎯 PRONTO — ArtCraft Studio rodando');
  log('══════════════════════════════════════════════════════════');
  log('   Dashboard de canais:  http://127.0.0.1:8799');
  log('   Master Studio Panel:  file://' + path.resolve('MASTER_STUDIO.html').replace(/\\/g, '/'));
  log('   Pipeline (CLI):       node .artcraft\\yt-clone-build.mjs --help');
  log('   Direcao (CLI):        node .artcraft\\yt-direcao.mjs --help');
  log('   Opus 5.5 Prompts:     node .artcraft\\opus5-reference\\index.mjs search "..."');
  log('');
  log('   Fluxo tipico:');
  log('   1. No dashboard, clique "Clonar formato" num canal');
  log('   2. Ajuste parametros no modal se quiser');
  log('   3. Clique "Enfileirar / Executar"');
  log('   4. Acompanhe na aba "Fila" do dashboard');
  log('   5. Video final em work/clones/<slug>/out/final_<lang>.mp4');
  log('');
  log('   Pressione Ctrl+C para parar tudo');
  log('══════════════════════════════════════════════════════════');

  // 5. Handler de shutdown
  async function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log('');
    log('🛑 Encerrando...');
    if (daemonProcess) {
      log('🛑 Parando daemon...');
      daemonProcess.kill();
      await sleep(500);
    }
    log('👋 Ate a proxima!');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Mantem vivo
  await new Promise(() => {});
}

import fs from 'node:fs';

main().catch(e => {
  err('❌ Erro fatal:', e);
  process.exit(1);
});