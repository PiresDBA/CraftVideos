#!/usr/bin/env node
/**
 * Scope-leak detector for the clone pipeline.
 *
 * WHY: the pipeline died at step 5/6 after 22 minutes with
 *   ERRO: lipSyncByLang is not defined
 * `lipSyncByLang` WAS declared - but as a `const` inside main(), while
 * buildSceneClips() (a sibling function) used it. `node --check` cannot see
 * that: it is a runtime ReferenceError.
 *
 * This tool extracts every top-level function, collects the names it
 * DECLARES and the names it READS, and reports a name read in one function
 * while declared (only) in a different one - the signature of a scope leak.
 *
 * Usage: node .artcraft/yt-lint-scope.mjs [file...]
 */
import fs from 'node:fs';
import { topLevelFunctions } from './clone/lib/js-scan.mjs';

const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['D:/CRAFT/.artcraft/yt-clone-build.mjs'];

const KEYWORDS = new Set([
  'const','let','var','function','class','if','else','for','while','do','switch','case',
  'break','continue','return','throw','try','catch','finally','new','delete','typeof',
  'instanceof','in','of','void','this','super','async','await','yield','static','get','set',
  'extends','import','export','from','as','default','null','true','false','undefined',
]);

function identifiers(maskedText, offset) {
  const res = [];
  const lines = maskedText.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/([A-Za-z_$][\w$]*)/g)) {
      const name = m[1];
      if (name.length < 2) continue;
      const before = line.slice(0, m.index).trimEnd();
      const after = line.slice(m.index + name.length).trimStart();
      if (before.endsWith('.') || before.endsWith('?.')) continue;
      if (after.startsWith(':') && (before.endsWith('{') || before.endsWith(',') || before === '')) continue;
      if (/[\w$]/.test(before.slice(-1))) continue;
      res.push({ name, line: (offset || 0) + i + 1, text: line.trim().slice(0, 120) });
    }
  });
  return res;
}

function declaredIn(text) {
  const names = new Set();
  const add = (n) => { if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n); };
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of text.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of text.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of text.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(',')) {
      const parts = p.split(':');
      add((parts[1] || parts[0]).split('=')[0].trim().replace(/^\.\.\./, ''));
    }
  }
  for (const m of text.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    for (const p of m[1].split(',')) add(p.split('=')[0].trim());
  }
  for (const m of text.matchAll(/function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
    for (const p of m[1].split(',')) {
      const n = p.split('=')[0].trim().replace(/^\.\.\./, '');
      if (n) add(n.split(/\s+/)[0]);
    }
  }
  for (const m of text.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const p of m[1].split(',')) {
      const n = p.split('=')[0].trim().replace(/^\.\.\./, '');
      if (n) add(n.split(/\s+/)[0]);
    }
  }
  for (const m of text.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of text.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of text.matchAll(/for\s*\(\s*(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    for (const p of m[1].split(',')) add(p.split('=')[0].trim());
  }
  for (const m of text.matchAll(/import\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(',')) {
      const parts = p.trim().split(/\s+as\s+/);
      add((parts[1] || parts[0]).trim());
    }
  }
  return names;
}

let problems = 0;
for (const file of FILES) {
  if (!fs.existsSync(file)) { console.log('SKIP (not found): ' + file); continue; }
  const raw = fs.readFileSync(file, 'utf8');

  const blocks = topLevelFunctions(raw);
  const fns = blocks.map((b) => ({
    name: b.name,
    from: b.from,
    to: b.to,
    declared: declaredIn(b.text),
    used: identifiers(b.masked, b.from),
  }));

  // module-level declarations: everything outside any function block,
  // PLUS the names of the top-level functions themselves (they are module
  // scoped and callable from anywhere).
  const inFn = new Set();
  for (const b of blocks) for (let i = b.from; i <= b.to; i++) inFn.add(i);
  const moduleText = raw.split('\n').filter((_, i) => !inFn.has(i)).join('\n');
  const moduleDeclared = declaredIn(moduleText);
  for (const b of blocks) if (b.name) moduleDeclared.add(b.name);

  console.log('\n=== ' + file + ' ===');
  console.log('  funcoes de topo analisadas: ' + fns.length);

  const leaks = [];
  for (const f of fns) {
    const seen = new Set();
    for (const u of f.used) {
      if (KEYWORDS.has(u.name)) continue;
      if (f.declared.has(u.name)) continue;
      if (moduleDeclared.has(u.name)) continue;
      if (seen.has(u.name)) continue;
      const owners = fns.filter((g) => g !== f && g.declared.has(u.name));
      if (owners.length === 1) {
        seen.add(u.name);
        leaks.push({ fn: f.name, name: u.name, owner: owners[0].name, place: u });
      }
    }
  }

  if (!leaks.length) {
    console.log('  OK - nenhum vazamento de escopo detetado.');
  } else {
    for (const l of leaks) {
      problems++;
      console.log('  ! "' + l.name + '" lido em ' + l.fn + '() mas so declarado em ' + l.owner + '()  [L' + l.place.line + ']');
      console.log('      ' + l.place.text);
      console.log('      -> passe "' + l.name + '" como parametro de ' + l.fn + '() ou mova a declaracao para nivel de modulo.');
    }
  }
}

console.log('\n=== vazamentos de escopo: ' + problems + ' ===');
process.exit(problems ? 1 : 0);
