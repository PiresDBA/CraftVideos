#!/usr/bin/env node
/**
 * ArtCraft MCP gateway.
 *
 * Problem it solves: registering all six ArtCraft MCP servers costs ~35,000 tokens
 * of tool definitions on every single request. That is paid forever, on every turn.
 *
 * This gateway exposes four tools and reaches all ~131 underlying tools on demand.
 * The agent asks `artcraft_search` what exists, then `artcraft_run` to execute it.
 *
 * Transport: JSON-RPC 2.0 over stdio (the same contract the native servers use).
 *
 * Tools:
 *   artcraft_apps     what is installed, versions, domains, control ports
 *   artcraft_search   find command ids in an app's catalog before running them
 *   artcraft_run      run any CLI subcommand on any app, with optional stdin
 *   artcraft_status   which apps are running and which control ports are live
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = 'D:\\CRAFT';
const REF = path.join(ROOT, '.artcraft', 'reference');

const APPS = {
  anicraft: { dir: 'AniCraft', gui: 'anicraft.exe', cli: 'anicraft-cli.exe', catalog: 'anicraft.commands.json', kind: 'json', controls: false,
    domain: '2D animation (Animate-class): tweens, timeline, symbols, sprite sheets, Lottie' },
  'craft-anything': { dir: 'Craft Anything', gui: 'craft-anything.exe', cli: 'craft-anything-cli.exe', catalog: 'craft-anything.commands.txt', kind: 'text', controls: false,
    domain: 'reverse engineering: how software/sites/games work, rebuild them as software' },
  effectcraft: { dir: 'EffectCraft', gui: 'effectcraft.exe', cli: 'effectcraft-cli.exe', catalog: 'effectcraft.commands.json', kind: 'json', controls: true,
    domain: 'motion graphics / VFX (After Effects-class): comps, keyframes, expressions, JSX' },
  figcraft: { dir: 'FigCraft', gui: 'figcraft.exe', cli: 'figcraft-cli.exe', catalog: 'figcraft.commands.txt', kind: 'text', controls: true,
    domain: 'UI/UX and layout (Figma-class): frames, components, variables, thumbnails' },
  filmcraft: { dir: 'FilmCraft', gui: 'filmcraft.exe', cli: 'filmcraft-cli.exe', catalog: 'filmcraft.commands.json', kind: 'json', controls: true,
    domain: 'video editing (Premiere-class): sequences, timeline, export, colour, sound' },
  vectorcraft: { dir: 'VectorCraft', gui: 'vectorcraft.exe', cli: 'vectorcraft-cli.exe', catalog: 'vectorcraft.commands.json', kind: 'json', controls: true,
    domain: 'vector illustration / image editing (Illustrator-class): SVG, PDF, PSD, booleans, type' },
};

const PORTS = { vectorcraft: 7979, filmcraft: 8123, figcraft: 8124, effectcraft: 8125 };
const ALIASES = {
  ani: 'anicraft', animation: 'anicraft', craft: 'craft-anything', reverse: 'craft-anything',
  fx: 'effectcraft', vfx: 'effectcraft', motion: 'effectcraft', fig: 'figcraft', ui: 'figcraft',
  film: 'filmcraft', video: 'filmcraft', vector: 'vectorcraft', svg: 'vectorcraft', image: 'vectorcraft',
};

// ------------------------------------------------------------------ helpers

function resolve(name) {
  const key = ALIASES[name] || name;
  const app = APPS[key];
  if (!app) return null;
  const dir = path.join(ROOT, app.dir);
  return {
    key,
    dir,
    gui: path.join(dir, app.gui),
    cli: path.join(dir, app.cli),
    exists: fs.existsSync(path.join(dir, app.cli)),
    domain: app.domain,
    controls: app.controls,
    port: PORTS[key] || null,
  };
}

function versionOf(cli) {
  const r = spawnSync(cli, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return ((r.stdout || r.stderr || '').trim().split(/\r?\n/)[0] || '').replace(/-cli\s*/, ' ');
}

function readCatalog(key) {
  const app = APPS[key];
  if (!app) return null;
  const file = path.join(REF, app.catalog);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (app.kind === 'json') {
    try {
      return { kind: 'json', raw, items: JSON.parse(raw) };
    } catch {
      return { kind: 'text', raw, items: null };
    }
  }
  return { kind: 'text', raw, items: null };
}

function runCli(cli, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cli, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, stdout, stderr: stderr + '\n[timeout]', timedOut: true });
    }, timeoutMs || 180000);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(e.message), timedOut: false });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(400);
    s.on('connect', () => done(true));
    s.on('timeout', () => done(false));
    s.on('error', () => done(false));
  });
}

// ------------------------------------------------------------------ tools

async function toolApps() {
  const rows = [];
  for (const [key, a] of Object.entries(APPS)) {
    const r = resolve(key);
    const cat = readCatalog(key);
    rows.push({
      app: key,
      version: r.exists ? versionOf(r.cli) : null,
      installed: r.exists,
      domain: a.domain,
      commandCatalog: cat ? (cat.items ? cat.items.length : 'text') : null,
      controlChannel: a.controls ? `127.0.0.1:${PORTS[key]}` : 'stdio only',
      cliPath: r.cli,
    });
  }
  return rows;
}

async function toolSearch(appName, query, limit) {
  const r = resolve(appName);
  if (!r) return { error: `unknown app "${appName}"` };
  const cat = readCatalog(r.key);
  if (!cat) return { error: `no catalog for ${appName}; run: node artcraft.mjs refresh` };
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { error: 'query is required' };
  const max = Math.min(Number(limit) || 20, 50);

  if (!cat.items) {
    const hits = cat.raw
      .split(/\r?\n/)
      .filter((l) => words.every((w) => l.toLowerCase().includes(w)))
      .slice(0, max);
    return { app: r.key, matches: hits.length, hits };
  }

  const score = (it) => {
    const id = String(it.id || '').toLowerCase();
    const label = String(it.label || '').toLowerCase();
    const menu = Array.isArray(it.menu) ? it.menu.join(' ').toLowerCase() : String(it.menu || '').toLowerCase();
    const params = String(it.params || '').toLowerCase();
    let s = 0;
    for (const w of words) {
      if (id === w) s += 100;
      if (id.split(/[.\-_]/).includes(w)) s += 40;
      if (id.includes(w)) s += 20;
      if (label.includes(w)) s += 12;
      if (menu.includes(w)) s += 6;
      if (params.includes(w)) s += 4;
    }
    return s;
  };

  const ranked = cat.items
    .map((it) => ({ it, s: score(it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => ({
      id: x.it.id,
      label: x.it.label,
      params: x.it.params,
      enabled: x.it.enabled,
    }));

  return { app: r.key, catalogSize: cat.items.length, matches: ranked.length, hits: ranked };
}

async function toolRun(appName, args, stdin) {
  const r = resolve(appName);
  if (!r) return { error: `unknown app "${appName}"` };
  if (!r.exists) return { error: `${appName} CLI not found at ${r.cli}` };
  const res = await runCli(r.cli, args, 600000);
  const out = (res.stdout || '').trim();
  return {
    app: r.key,
    exitCode: res.code,
    timedOut: res.timedOut,
    stdout: out.length > 200000 ? out.slice(0, 200000) + '\n[truncated]' : out,
    stderr: res.stderr.trim() || undefined,
  };
}

async function toolStatus() {
  const open = {};
  for (const p of new Set(Object.values(PORTS))) {
    open[p] = await portOpen(p);
  }
  const running = Object.entries(open).filter(([, v]) => v).map(([k]) => Number(k));
  return {
    controlPorts: open,
    live: running.length ? running : 'none',
    note: running.length
      ? 'At least one app is live; attached MCP mode is available via the native servers.'
      : 'No ArtCraft GUI is running. Run node artcraft.mjs gui <app> to start one.',
  };
}

const TOOLS = [
  {
    name: 'artcraft_apps',
    description:
      'List the six ArtCraft apps installed at D:\\CRAFT: version, what each is for, ' +
      'how many commands its catalog has, and its control port. Call this first to decide which app a task needs.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'artcraft_search',
    description:
      'Find command ids in one app before running them. Command ids are not guessable ' +
      '(VectorCraft has ~1430, FilmCraft ~718). Always search before artcraft_run.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'anicraft | vectorcraft | filmcraft | effectcraft | figcraft | craft-anything' },
        query: { type: 'string', description: 'one to three words, e.g. "razor", "export", "tween"' },
        limit: { type: 'integer', description: 'max results, default 20' },
      },
      required: ['app', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'artcraft_run',
    description:
      'Run any CLI subcommand of any ArtCraft app and return its stdout. ' +
      'This is the single execution path: every app action is reachable through it. ' +
      'Write outputs into D:\\CRAFT\\work\\<project>\\.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'anicraft | vectorcraft | filmcraft | effectcraft | figcraft | craft-anything' },
        args: { type: 'array', items: { type: 'string' }, description: 'CLI arguments, e.g. ["convert","in.svg","out.png"]' },
      },
      required: ['app', 'args'],
      additionalProperties: false,
    },
  },
  {
    name: 'artcraft_status',
    description: 'Report which ArtCraft control ports are live and which GUIs are running.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

// ------------------------------------------------------------------ JSON-RPC

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, message, code = -32603) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    ok(id, {
      protocolVersion: params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'artcraft-gateway', title: 'ArtCraft Gateway', version: '1.0.0' },
      instructions:
        'Gateway to six ArtCraft creative apps (AniCraft, VectorCraft, FilmCraft, EffectCraft, FigCraft, Craft Anything). ' +
        'Workflow: artcraft_apps to pick the app -> artcraft_search to find command ids -> artcraft_run to execute. ' +
        'Headless by default; start a GUI with `node D:\\CRAFT\\.artcraft\\artcraft.mjs gui <app>` only when live-UI tools are needed. ' +
        'Always write deliverables under D:\\CRAFT\\work\\ and verify the output file exists and is non-trivial in size.',
    });
    return;
  }

  if (method === 'notifications/initialized' || method === 'initialized') return;

  if (method === 'ping') {
    ok(id, {});
    return;
  }

  if (method === 'tools/list') {
    ok(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const a = params?.arguments || {};
    try {
      let result;
      if (name === 'artcraft_apps') result = await toolApps();
      else if (name === 'artcraft_search') result = await toolSearch(a.app, a.query, a.limit);
      else if (name === 'artcraft_run') result = await toolRun(a.app, a.args || []);
      else if (name === 'artcraft_status') result = await toolStatus();
      else {
        fail(id, `unknown tool: ${name}`, -32601);
        return;
      }
      const text = JSON.stringify(result, null, 2);
      const isError = Boolean(result && result.error);
      ok(id, { content: [{ type: 'text', text }], isError });
    } catch (e) {
      ok(id, { content: [{ type: 'text', text: String(e && e.message) }], isError: true });
    }
    return;
  }

  if (id !== undefined) fail(id, `method not found: ${method}`, -32601);
}

let buffer = '';
let pending = 0;
let inputEnded = false;

function maybeExit() {
  if (inputEnded && pending === 0) process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    // Notifications carry no id; they must not keep the process alive.
    if (msg.id === undefined) {
      Promise.resolve(handle(msg)).catch(() => {});
      continue;
    }
    pending++;
    Promise.resolve(handle(msg))
      .catch((e) => fail(msg.id, String(e && e.message)))
      .finally(() => {
        pending--;
        maybeExit();
      });
  }
});

process.stdin.on('end', () => {
  inputEnded = true;
  maybeExit();
});