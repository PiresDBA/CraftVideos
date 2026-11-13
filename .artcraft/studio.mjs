#!/usr/bin/env node
/**
 * STUDIO — a porta de entrada única do estúdio.
 *
 * Lê studio.catalog.json (gerado por studio-catalog.mjs) e responde a
 * "o que é que eu tenho para isto?" em vez de obrigar a lembrar caminhos.
 *
 * Uso:
 *   node .artcraft\studio.mjs stats
 *   node .artcraft\studio.mjs list [--group skills|apps|pipelines|compositions|modules]
 *                                  [--category motion] [--search video] [--enabled] [--json]
 *   node .artcraft\studio.mjs show <id>
 *   node .artcraft\studio.mjs refresh          (recria o catálogo a partir do disco)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CC = 'D:\\CRAFT';
const CATALOG = path.join(CC, 'studio.catalog.json');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const FLAG = (n) => process.argv.includes('--' + n);

if (FLAG('refresh') || !fs.existsSync(CATALOG)) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'studio-catalog.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

const groups = {
  apps: 'APPS',
  skills: 'SKILLS',
  pipelines: 'PIPELINES',
  compositions: 'COMPOSICOES',
  modules: 'MODULOS',
};

function items(group) {
  return (cat[group] || []).map((x) => ({ ...x, group }));
}

function all() {
  return Object.keys(groups).flatMap((g) => items(g));
}

const cmd = process.argv[2] || 'stats';

if (cmd === 'stats') {
  console.log('\n  MASTER STUDIO — ' + cat.totals.skills + ' skills · ' + cat.totals.apps + ' apps · ' +
    cat.totals.pipelines + ' pipelines · ' + cat.totals.compositions + ' composicoes · ' + cat.totals.modules + ' modulos');
  console.log('  catalogo: ' + CATALOG + '  (' + cat.generatedAt.slice(0, 16).replace('T', ' ') + ')\n');
  const byCat = {};
  for (const s of cat.skills) {
    byCat[s.category] = byCat[s.category] || [];
    byCat[s.category].push(s.id);
  }
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
    console.log('  ' + k.padEnd(12) + String(v.length).padStart(3) + '  ' + v.slice(0, 6).join(', ') + (v.length > 6 ? ' …' : ''));
  }
  console.log('\n  apps: ' + cat.apps.map((a) => a.name).join(' · '));
  console.log('  voz : ' + cat.voice.providers.filter((p) => p.state.includes('pronto')).map((p) => p.id).join(', '));
  console.log('\n  procurar: node .artcraft\\studio.mjs list --search video\n');
  process.exit(0);
}

if (cmd === 'list') {
  const group = arg('group', '');
  const category = arg('category', '');
  const search = (arg('search', '') || '').toLowerCase();
  const onlyEnabled = FLAG('enabled');

  let rows = group ? items(group) : all();
  if (category) rows = rows.filter((r) => (r.category || '').toLowerCase() === category.toLowerCase());
  if (onlyEnabled) rows = rows.filter((r) => r.enabled !== false);
  if (search) {
    rows = rows.filter((r) =>
      [r.id, r.name, r.description, r.category].filter(Boolean).join(' ').toLowerCase().includes(search)
    );
  }

  if (FLAG('json')) {
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  }

  console.log('\n  ' + rows.length + ' resultado(s)' + (search ? ' para "' + search + '"' : '') + '\n');
  let lastGroup = '';
  for (const r of rows) {
    if (r.group !== lastGroup) {
      console.log('  ── ' + groups[r.group] + ' ' + '─'.repeat(Math.max(0, 60 - groups[r.group].length)));
      lastGroup = r.group;
    }
    const dot = r.enabled === false ? '○' : '●';
    const label = (r.name || r.id).slice(0, 26).padEnd(26);
    const cat = (r.category || '').padEnd(12);
    console.log('  ' + dot + ' ' + label + cat + (r.description || '').slice(0, 66));
  }
  console.log('');
  process.exit(0);
}

if (cmd === 'show') {
  const id = process.argv[3];
  if (!id) {
    console.error('uso: studio.mjs show <id>');
    process.exit(2);
  }
  const hit = all().find((r) => r.id === id || r.name === id);
  if (!hit) {
    console.error('nao encontrado: ' + id);
    process.exit(1);
  }
  console.log(JSON.stringify(hit, null, 2));
  process.exit(0);
}

console.error('comandos: stats | list | show <id> | refresh');
process.exit(2);
