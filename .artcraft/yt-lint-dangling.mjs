#!/usr/bin/env node
/**
 * Static check for DANGLING identifiers in the clone pipeline.
 *
 * Why this exists: buildSceneClips() referenced `lipSyncByLang`, a name that
 * only existed as a `const` inside main(). `node --check` does NOT catch that
 * (runtime ReferenceError), so the pipeline died at step 5/6 — after 22
 * minutes of avatar animation and TTS.
 *
 * Heuristic (not a full parser): strip comments/strings, then report names
 * that are read as variables but never declared anywhere in the file.
 * Object keys, property accesses and label-like identifiers are ignored.
 *
 * Usage: node .artcraft/yt-lint-dangling.mjs [file...]
 */
import fs from 'node:fs';

const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['D:/CRAFT/.artcraft/yt-clone-build.mjs'];

const GLOBALS = new Set([
  // keywords (not variables)
  'const','let','var','function','class','if','else','for','while','do','switch','case',
  'break','continue','return','throw','try','catch','finally','new','delete','typeof',
  'instanceof','in','of','void','this','super','async','await','yield','static','get','set',
  'extends','import','export','from','as','default','null','true','false','undefined',
  'console','process','Buffer','setTimeout','setInterval','clearTimeout','clearInterval',
  'require','module','exports','__dirname','__filename','globalThis','global','window',
  'document','fetch','URL','URLSearchParams','TextEncoder','TextDecoder','AbortController',
  'structuredClone','queueMicrotask','Intl','Reflect','Proxy','WeakMap','WeakSet','Map','Set',
  'Promise','Symbol','JSON','Math','Date','RegExp','Error','TypeError','RangeError',
  'Array','Object','String','Number','Boolean','parseInt','parseFloat','isNaN','isFinite',
  'encodeURIComponent','decodeURIComponent','encodeURI','decodeURI',
  'Infinity','NaN','arguments',
  'fs','path','https','http','os','child_process','url','crypto','zlib','stream','events',
  'spawn','execFile','exec','execSync','spawnSync','readFileSync','writeFileSync','existsSync',
  'mkdirSync','readdirSync','statSync','unlinkSync','rmSync','copyFileSync','renameSync',
  'createReadStream','createWriteStream','readFile','writeFile','mkdir','readdir','stat',
  'rm','unlink','rename','copyFile','join','resolve','dirname','basename','extname','parse',
  'relative','isAbsolute','sep','tmpdir','homedir','platform','arch','cpus','totalmem','freemem',
  'env','argv','exit','kill','pid','stdout','stderr','stdin',
  'allSettled','all','race','any','entries','values','keys','assign','freeze',
  'isArray','isObject','isString','isNumber','isFunction','isPlainObject','pick','omit',
  'trim','trimEnd','trimStart','padStart','padEnd','toUpperCase','toLowerCase','split','join',
  'replace','replaceAll','match','matchAll','includes','indexOf','lastIndexOf','slice','splice',
  'push','pop','shift','unshift','concat','reverse','sort','filter','map','forEach','find',
  'findIndex','findLast','some','every','reduce','reduceRight','flat','flatMap','fill',
  'startsWith','endsWith','repeat','charAt','charCodeAt','codePointAt','at','toString',
  'valueOf','hasOwnProperty','toFixed','toPrecision','toExponential','random','round','floor',
  'ceil','abs','min','max','pow','sqrt','sign','trunc','log','exp','sin','cos','tan',
  'now','getTime','getHours','getMinutes','getSeconds','getFullYear','getMonth','getDate',
  'toISOString','toLocaleString','toLocaleDateString','toLocaleTimeString',
  'textContent','innerHTML','innerText','className','id','style','value','checked','disabled',
  'href','src','title','type','name','parentNode','children','dataset',
  'querySelector','querySelectorAll','getElementById','getElementsByClassName',
  'addEventListener','removeEventListener','createElement','createTextNode','appendChild',
  'removeChild','insertBefore','replaceChild','closest','matches','contains',
  'getBoundingClientRect','scrollTop','scrollLeft','scrollTo','scrollIntoView','focus','blur',
  'click','getAttribute','setAttribute','removeAttribute','hasAttribute','preventDefault',
  'stopPropagation','target','currentTarget','key','code','keyCode','button','clientX','clientY',
  'pageX','pageY','offsetX','offsetY','length','size','index','prototype','constructor',
  '__proto__','toJSON','then','catch','cause','stack','message','description','signal','headers',
  'body','status','ok','json','text','blob','arrayBuffer','formData','clone','statusText',
]);

function stripCommentsAndStrings(src) {
  // keep line structure so line numbers stay correct
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/\/\/[^\n]*/g, '');
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => m.replace(/[^\n]/g, ' '));
  // regex literals: /pattern/flags when the slash starts an expression
  out = out.replace(/(^|[\s(=[{,:;!&|?+\-*%~^<>])((\/\\.|[^\/\n\\])+)\/[gimsuy]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
  return out;
}

function collectDeclared(src) {
  const declared = new Set(GLOBALS);
  const add = (n) => { if (n && /^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n); };

  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  // import { a, b as c } from '...'
  for (const m of src.matchAll(/import\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(',')) {
      const parts = p.trim().split(/\s+as\s+/);
      add((parts[1] || parts[0]).trim());
    }
  }
  for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(',')) {
      const parts = p.split(':');
      add((parts[1] || parts[0]).split('=')[0].trim().replace(/^\.\.\./, ''));
    }
  }
  for (const m of src.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    for (const p of m[1].split(',')) add(p.split('=')[0].trim());
  }
  for (const m of src.matchAll(/function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
    for (const p of m[1].split(',')) {
      const n = p.split('=')[0].trim().replace(/^\.\.\./, '');
      if (n) add(n.split(/\s+/)[0]);
    }
  }
  for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const p of m[1].split(',')) {
      const n = p.split('=')[0].trim().replace(/^\.\.\./, '');
      if (n) add(n.split(/\s+/)[0]);
    }
  }
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    for (const p of m[1].split(',')) add(p.split('=')[0].trim());
  }
  return declared;
}

function findUsages(clean) {
  const hits = new Map();
  const lines = clean.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/([A-Za-z_$][\w$]*)/g)) {
      const name = m[1];
      if (name.length < 2) continue;          // regex flags (g, i, m) and single letters
      const before = line.slice(0, m.index).trimEnd();
      const after = line.slice(m.index + name.length).trimStart();
      // property access:  .name   or  ?.name
      if (before.endsWith('.') || before.endsWith('?.')) continue;
      // object key:  { name:  ,  name:  or name: at the start of a line
      if (after.startsWith(':') && (before.endsWith('{') || before.endsWith(',') || before === '')) continue;
      // numeric literal / part of a bigger token
      if (/[\w$]/.test(before.slice(-1))) continue;
      if (!hits.has(name)) hits.set(name, []);
      hits.get(name).push({ line: i + 1, text: line.trim().slice(0, 120) });
    }
  });
  return hits;
}

let problems = 0;
for (const file of FILES) {
  if (!fs.existsSync(file)) { console.log('SKIP (not found): ' + file); continue; }
  const src = fs.readFileSync(file, 'utf8');
  const clean = stripCommentsAndStrings(src);
  const declared = collectDeclared(src);
  const usages = findUsages(clean);

  console.log('\n=== ' + file + ' ===');
  const suspect = [];
  for (const [name, places] of usages) {
    if (declared.has(name)) continue;
    suspect.push({ name, count: places.length, places });
  }
  suspect.sort((a, b) => b.count - a.count);

  if (!suspect.length) console.log('  OK - nenhum identificador solto.');
  for (const s of suspect) {
    problems++;
    console.log('  ! "' + s.name + '" usado ' + s.count + 'x mas NUNCA declarado');
    s.places.slice(0, 5).forEach(p => console.log('      L' + p.line + ': ' + p.text));
  }
}

console.log('\n=== identificadores suspeitos: ' + problems + ' ===');
process.exit(problems ? 1 : 0);
