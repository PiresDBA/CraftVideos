#!/usr/bin/env node
/**
 * ArtCraft suite dispatcher.
 *
 * Single entry point for driving the six ArtCraft CLIs installed at D:\CRAFT.
 * Every skill in ~/.config/opencode/skills/artcraft-* routes through here so the
 * agent never has to hard-code an executable path or a port.
 *
 * Usage:
 *   node artcraft.mjs apps
 *   node artcraft.mjs doctor
 *   node artcraft.mjs status
 *   node artcraft.mjs search <app> <terms...>
 *   node artcraft.mjs show <app> <command-id>
 *   node artcraft.mjs cli <app> [cli args...]
 *   node artcraft.mjs gui <app> [--control PORT] [-- extra app args...]
 *   node artcraft.mjs stop <app|all>
 *   node artcraft.mjs serve <app> [mcp args...]     (stdio MCP server, exec passthrough)
 *   node artcraft.mjs mcp-config [--all]            (print an mcpServers JSON block)
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';

const ROOT = 'D:\\CRAFT';
const REF = path.join(ROOT, '.artcraft', 'reference');
const STATE = path.join(ROOT, '.artcraft', 'state');
const PID_DIR = path.join(STATE, 'pids');

const APPS = {
  anicraft: {
    dir: 'AniCraft',
    gui: 'anicraft.exe',
    cli: 'anicraft-cli.exe',
    domain: '2D animation (Animate-class): tweens, timeline, sprite sheets, Lottie',
    catalog: 'anicraft.commands.json',
    kind: 'json',
    controls: false,
  },
  'craft-anything': {
    dir: 'Craft Anything',
    gui: 'craft-anything.exe',
    cli: 'craft-anything-cli.exe',
    domain: 'reverse engineering / target investigation (how software works, rebuild it)',
    catalog: 'craft-anything.commands.txt',
    kind: 'text',
    controls: false,
  },
  effectcraft: {
    dir: 'EffectCraft',
    gui: 'effectcraft.exe',
    cli: 'effectcraft-cli.exe',
    domain: 'motion graphics / VFX (After Effects-class): comps, layers, keyframes, expressions',
    catalog: 'effectcraft.commands.json',
    kind: 'json',
    controls: true,
  },
  figcraft: {
    dir: 'FigCraft',
    gui: 'figcraft.exe',
    cli: 'figcraft-cli.exe',
    domain: 'UI/UX design (Figma-class): frames, components, variables, prototyping',
    catalog: 'figcraft.commands.txt',
    kind: 'text',
    controls: true,
  },
  filmcraft: {
    dir: 'FilmCraft',
    gui: 'filmcraft.exe',
    cli: 'filmcraft-cli.exe',
    domain: 'video editing (Premiere-class): sequences, timeline, export, color, sound',
    catalog: 'filmcraft.commands.json',
    kind: 'json',
    controls: true,
  },
  vectorcraft: {
    dir: 'VectorCraft',
    gui: 'vectorcraft.exe',
    cli: 'vectorcraft-cli.exe',
    domain: 'vector illustration / image editing (Illustrator-class): SVG, PDF, PSD, booleans, text',
    catalog: 'vectorcraft.commands.json',
    kind: 'json',
    controls: true,
  },
};

const APP_ALIASES = {
  ani: 'anicraft',
  animation: 'anicraft',
  'craft_anything': 'craft-anything',
  craft: 'craft-anything',
  reverse: 'craft-anything',
  fx: 'effectcraft',
  vfx: 'effectcraft',
  motion: 'effectcraft',
  fig: 'figcraft',
  ui: 'figcraft',
  film: 'filmcraft',
  video: 'filmcraft',
  vector: 'vectorcraft',
  svg: 'vectorcraft',
  image: 'vectorcraft',
};

// Ports the ecosystem conventionally uses. VectorCraft's MCP server connects to
// 127.0.0.1:7979 by default; the others are free picks kept stable for skills.
const PORTS = {
  vectorcraft: 7979,
  filmcraft: 8123,
  figcraft: 8124,
  effectcraft: 8125,
};

const CONTROL_PORT_ENV = {
  filmcraft: 'FILMCRAFT_CONTROL_PORT',
  effectcraft: 'EFFECTCRAFT_CONTROL_PORT',
};

// ---------------------------------------------------------------- utilities

function die(msg, code = 1) {
  process.stderr.write(`artcraft: ${msg}\n`);
  process.exit(code);
}

function resolveApp(name) {
  if (!name) die('missing <app>. Known: ' + Object.keys(APPS).join(', '));
  const key = APP_ALIASES[name] || name;
  const app = APPS[key];
  if (!app) die(`unknown app "${name}". Known: ${Object.keys(APPS).join(', ')}`);
  return { key, app, dir: path.join(ROOT, app.dir) };
}

function appPaths(key) {
  const { app, dir } = resolveApp(key);
  const gui = path.join(dir, app.gui);
  const cli = path.join(dir, app.cli);
  const ok = (p) => (fs.existsSync(p) ? p : null);
  return { ...app, key, dir, gui: ok(gui), cli: ok(cli) };
}

function run(exe, args, opts = {}) {
  const r = spawnSync(exe, args, {
    stdio: opts.capture ? 'pipe' : 'inherit',
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
    shell: false,
    ...opts,
  });
  if (r.error) die(`${path.basename(exe)}: ${r.error.message}`);
  return r;
}

function loadCatalog(key) {
  const { app } = resolveApp(key);
  const file = path.join(REF, app.catalog);
  if (!fs.existsSync(file)) die(`catalog missing: ${file} (re-run: node artcraft.mjs refresh)`);
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (app.kind === 'json') {
    try {
      return { kind: 'json', raw, items: JSON.parse(raw) };
    } catch (e) {
      die(`catalog ${app.catalog} is not valid JSON: ${e.message}`);
    }
  }
  return { kind: 'text', raw, items: null };
}

function portsInUse() {
  return new Promise((resolve) => {
    const found = [];
    const candidates = new Set(Object.values(PORTS));
    let pending = 0;
    const done = () => {
      if (pending === 0) resolve(found.sort((a, b) => a - b));
    };
    for (const p of candidates) {
      pending++;
      const s = net.connect({ host: '127.0.0.1', port: p });
      const finish = (open) => {
        if (open) found.push(p);
        s.destroy();
        pending--;
        done();
      };
      s.setTimeout(400);
      s.on('connect', () => finish(true));
      s.on('timeout', () => finish(false));
      s.on('error', () => finish(false));
    }
    done();
  });
}

function pidFile(key) {
  return path.join(PID_DIR, `${key}.pid`);
}

function runningPids() {
  if (!fs.existsSync(PID_DIR)) return {};
  const out = {};
  for (const key of Object.keys(APPS)) {
    const f = pidFile(key);
    if (!fs.existsSync(f)) continue;
    const pid = parseInt(fs.readFileSync(f, 'utf8').trim(), 10);
    if (!Number.isFinite(pid)) continue;
    const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8', windowsHide: true });
    if (/no tasks/i.test(r.stdout || '')) {
      fs.unlinkSync(f);
      continue;
    }
    out[key] = pid;
  }
  return out;
}

function which(cmd) {
  const r = spawnSync('where', [cmd], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  return (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null;
}

// ---------------------------------------------------------------- commands

function cmdApps() {
  const rows = [];
  for (const [key, a] of Object.entries(APPS)) {
    const p = appPaths(key);
    rows.push({
      app: key,
      version: safeVersion(p.cli),
      domain: a.domain,
      gui: p.gui || 'MISSING',
      cli: p.cli || 'MISSING',
      control: a.controls ? `127.0.0.1:${PORTS[key]}` : 'stdio only',
      sizeMB: dirSizeMB(p.dir),
    });
  }
  print(rows);
}

function safeVersion(cli) {
  if (!cli || !fs.existsSync(cli)) return null;
  const r = spawnSync(cli, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return ((r.stdout || r.stderr || '').trim().split(/\r?\n/)[0] || '').replace(/-cli\s*/, ' ');
}

function dirSizeMB(dir) {
  try {
    let total = 0;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else total += fs.statSync(p).size;
      }
    };
    walk(dir);
    return Math.round((total / 1048576) * 10) / 10;
  } catch {
    return null;
  }
}

function cmdDoctor() {
  const report = {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    artcraftRoot: fs.existsSync(ROOT) ? ROOT : 'MISSING',
    apps: {},
    tools: {
      ffmpeg: which('ffmpeg'),
      ffprobe: which('ffprobe'),
      'yt-dlp': which('yt-dlp'),
      python: which('py') ? safePy() : null,
    },
    mcpServers: [],
  };
  for (const key of Object.keys(APPS)) {
    const p = appPaths(key);
    const catalogFile = path.join(REF, p.catalog);
    let commands = null;
    if (fs.existsSync(catalogFile)) {
      const c = loadCatalog(key);
      if (c.items) {
        commands = c.items.length;
      } else {
        // text catalog: count id-like lines, allowing the indented layout Craft Anything uses
        const ids = new Set(
          c.raw
            .split(/\r?\n/)
            .map((l) => l.trim().split(/\s{2,}/)[0])
            .filter((t) => /^[a-z][a-z0-9]*(?:[.\-_][a-z0-9]+)+[=*]?$/.test(t))
        );
        commands = ids.size;
      }
    }
    report.apps[key] = {
      cli: p.cli ? 'ok' : 'MISSING',
      gui: p.gui ? 'ok' : 'MISSING',
      catalog: fs.existsSync(catalogFile) ? `${commands} commands` : 'MISSING',
      mcp: `${p.cli ? 'available' : 'unavailable'} (stdio)`,
    };
  }
  print(report);
}

function safePy() {
  const r = spawnSync('py', ['-V'], { encoding: 'utf8', windowsHide: true });
  return (r.stdout || r.stderr || '').trim();
}

async function cmdStatus() {
  const pids = runningPids();
  const open = await portsInUse();
  print({
    runningApps: Object.keys(pids).length ? pids : 'none',
    listeningControlPorts: open.length ? open : 'none',
    expectedPorts: PORTS,
    note:
      open.length === 0
        ? 'No ArtCraft app is running. Use `node artcraft.mjs gui <app> --control <port>` before any --bridge/--attach call.'
        : 'At least one control port is live; attached MCP mode is possible.',
  });
}

function cmdSearch(appName, terms) {
  const { key } = resolveApp(appName);
  const q = terms.join(' ').toLowerCase();
  if (!q) die('usage: search <app> <terms...>');
  const words = q.split(/\s+/).filter(Boolean);
  const cat = loadCatalog(key);
  if (!cat.items) {
    const lines = cat.raw.split(/\r?\n/);
    const hits = lines.filter((l) => words.every((w) => l.toLowerCase().includes(w))).slice(0, 40);
    print({ app: key, kind: 'text', matches: hits.length, hits });
    return;
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
    .map((it) => ({ item: it, s: score(it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40)
    .map((x) => ({
      id: x.item.id,
      label: x.item.label,
      menu: x.item.menu,
      params: x.item.params,
      shortcut: x.item.shortcut || x.item.defaultShortcut,
      enabled: x.item.enabled,
    }));
  print({ app: key, query: q, totalCatalog: cat.items.length, matches: ranked.length, hits: ranked });
}

function cmdShow(appName, id) {
  const { key } = resolveApp(appName);
  if (!id) die('usage: show <app> <command-id>');
  const cat = loadCatalog(key);
  if (!cat.items) {
    const block = cat.raw
      .split(/\r?\n/)
      .filter((l) => l.toLowerCase().includes(id.toLowerCase()))
      .slice(0, 10);
    print({ app: key, kind: 'text', id, matches: block });
    return;
  }
  const hit = cat.items.find((it) => String(it.id).toLowerCase() === id.toLowerCase());
  if (!hit) die(`command "${id}" not found in ${key}. Try: node artcraft.mjs search ${key} <words>`);
  print(hit);
}

function cmdCli(appName, args) {
  const p = appPaths(appName);
  if (!p.cli) die(`${appName}: CLI not found at ${path.join(p.dir, p.cli)}`);
  const r = run(p.cli, args);
  process.exit(r.status ?? 0);
}

function cmdGui(appName, rest) {
  const p = appPaths(appName);
  if (!p.gui) die(`${appName}: GUI not found at ${path.join(p.dir, p.gui)}`);
  const controlIdx = rest.indexOf('--control');
  let control = controlIdx >= 0 ? rest[controlIdx + 1] : null;
  const extra = controlIdx >= 0 ? [...rest.slice(0, controlIdx), ...rest.slice(controlIdx + 2)] : [...rest];

  if (p.controls && !control) {
    control = String(PORTS[appName] || 0);
    process.stderr.write(`artcraft: no --control given; defaulting to ${control}\n`);
  }

  const args = [];
  if (control) {
    if (p.key === 'figcraft' || p.key === 'vectorcraft') args.push('--control', String(control));
    else args.push('--control', String(control));
  }
  args.push(...extra);

  fs.mkdirSync(PID_DIR, { recursive: true });
  const child = spawn(p.gui, args, {
    cwd: p.dir,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  fs.writeFileSync(pidFile(appName), String(child.pid));
  print({
    app: appName,
    pid: child.pid,
    exe: p.gui,
    control: control ? `127.0.0.1:${control}` : null,
    attach: p.controls
      ? `node artcraft.mjs serve ${appName} --connect 127.0.0.1:${control || PORTS[appName]}`
      : 'stdio only (no live-app attach)',
  });
}

function cmdStop(appName) {
  const pids = runningPids();
  const targets = appName === 'all' ? Object.keys(pids) : [resolveApp(appName).key];
  if (!targets.length) return print({ stopped: [], note: 'nothing running' });
  const stopped = [];
  for (const t of targets) {
    const pid = pids[t];
    if (!pid) continue;
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
    stopped.push({ app: t, pid, ok: r.status === 0 });
    const f = pidFile(t);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  print({ stopped });
}

function cmdServe(appName, args) {
  const p = appPaths(appName);
  if (!p.cli) die(`${appName}: CLI not found`);
  const child = spawn(p.cli, ['mcp', ...args], { stdio: 'inherit', windowsHide: true });
  child.on('exit', (code) => process.exit(code ?? 0));
}

function cmdMcpConfig(all) {
  const keys = all ? Object.keys(APPS) : ['vectorcraft', 'filmcraft', 'figcraft'];
  const servers = {};
  for (const key of keys) {
    const p = appPaths(key);
    if (!p.cli) continue;
    const args = ['mcp'];
    if (key === 'vectorcraft') args.push('--automation-read-root', ROOT, '--automation-write-root', ROOT);
    if (key === 'figcraft') args.push('--automation-read-root', ROOT, '--automation-write-root', ROOT);
    servers[key] = { command: p.cli, args };
  }
  print({ mcpServers: servers });
}

function cmdRefresh() {
  const results = {};
  for (const key of Object.keys(APPS)) {
    const p = appPaths(key);
    if (!p.cli) {
      results[key] = 'CLI missing';
      continue;
    }
    const out = path.join(REF, p.catalog);
    let args = ['commands'];
    if (key === 'effectcraft' || key === 'filmcraft') args = ['commands', '--json'];
    if (key === 'craft-anything') args = ['commands', '--output-format', 'text'];
    const r = run(p.cli, args, { capture: true });
    if (r.error) {
      results[key] = `error: ${r.error.message}`;
      continue;
    }
    const text = (r.stdout || '') + (r.stderr && r.status !== 0 ? r.stderr : '');
    fs.mkdirSync(REF, { recursive: true });
    fs.writeFileSync(out, text, 'utf8');
    results[key] = `${text.length} bytes -> ${path.basename(out)}`;
  }
  print({ refreshed: results, reference: REF });
}

function print(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

// ---------------------------------------------------------------- main

const [, , cmd, ...rest] = process.argv;
const table = {
  apps: cmdApps,
  doctor: cmdDoctor,
  status: cmdStatus,
  search: () => cmdSearch(rest[0], rest.slice(1)),
  show: () => cmdShow(rest[0], rest[1]),
  cli: () => cmdCli(rest[0], rest.slice(1)),
  gui: () => cmdGui(rest[0], rest.slice(1)),
  stop: () => cmdStop(rest[0] || 'all'),
  serve: () => cmdServe(rest[0], rest.slice(1)),
  'mcp-config': () => cmdMcpConfig(rest.includes('--all')),
  refresh: cmdRefresh,
};

if (!cmd || !table[cmd]) {
  process.stderr.write(
    `artcraft dispatcher\n\n` +
      Object.keys(table).map((k) => `  node artcraft.mjs ${k}`).join('\n') +
      `\n\napps: ${Object.keys(APPS).join(', ')}\n`
  );
  process.exit(cmd ? 1 : 0);
}

const result = table[cmd]();
if (result && typeof result.then === 'function') result.catch((e) => die(e.message));