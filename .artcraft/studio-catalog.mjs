/**
 * Constrói o catálogo mestre do estúdio, a partir das fontes reais no disco.
 *
 * Nada é escrito à mão: as skills vêm dos SKILL.md, os apps dos .exe, os pipelines
 * dos YAML. Se instalares mais alguma coisa, voltas a correr isto e o catálogo
 * actualiza-se sozinho.
 *
 * Uso: node .artcraft\studio-catalog.mjs
 * Saída: D:\CRAFT\studio.catalog.json
 */
import fs from 'node:fs';
import path from 'node:path';

const CC = 'D:\\CRAFT';
const OUT = path.join(CC, 'studio.catalog.json');
const OM = path.join(CC, 'OpenMontage');

const exists = (p) => fs.existsSync(p);

/** Lê o frontmatter YAML simples de um SKILL.md. */
function frontmatter(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const lines = m[1].replace(/\r/g, '').split('\n');

  let name = '';
  let desc = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^name:\s*/.test(line) && !name) {
      name = line.replace(/^name:\s*/, '').trim().replace(/^["']|["']$/g, '');
      continue;
    }
    const dm = line.match(/^description:\s*(.*)$/);
    if (dm && !desc) {
      const rest = dm[1].trim();
      if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
        // bloco: apanha as linhas indentadas seguintes
        const buf = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s+\S/.test(lines[j]) || lines[j].trim() === '') buf.push(lines[j].trim());
          else break;
        }
        desc = buf.map((l) => l.trim()).filter(Boolean).join(' ');
      } else {
        desc = rest.replace(/^["']|["']$/g, '');
      }
    }
  }
  return { name: name.trim(), description: desc.trim() };
}

/** Categoriza pelo nome — heurística explícita e fácil de editar depois. */
function categoryOf(id) {
  const has = (...k) => k.some((x) => id.includes(x));
  if (has('video-understand', 'video-download', 'video-edit', 'video-translate', 'ffmpeg', 'media-use', 'video-toolkit')) return 'video';
  if (has('tts', 'text-to-speech', 'speech-to-text', 'elevenlabs', 'azure-speech', 'azure-text', 'fish-audio', 'doubao', 'acestep')) return 'voz';
  if (has('music', 'sound-effects', 'lyria')) return 'audio';
  if (has('remotion', 'motion-graphics', 'gsap', 'framer-motion', 'hyperframes', 'lottie', 'canvas-procedural', 'visual-style', 'manim', 'd3-viz')) return 'motion';
  if (has('threejs', '3d-asset')) return '3d';
  if (has('avatar', 'faceswap', 'heygen', 'character', 'pose-library', 'svg-character')) return 'avatar';
  if (has('comfyui', 'flux', 'bfl', 'dashscope', 'ai-video', 'kling', 'seedance', 'ltx', 'pika', 'minimax', 'gemini-omni', 'grok-media')) return 'geracao';
  if (has('playwright', 'synthetic', 'website-to-video', 'screen')) return 'captura';
  if (has('design', 'tailwind', 'vercel', 'web-design', 'mermaid')) return 'design';
  if (has('setup-api-key', 'provider-', 'agents')) return 'infra';
  return 'outro';
}

// ---------------------------------------------------------------- skills
const skills = [];
const skillsRoot = path.join(OM, '.agents', 'skills');
if (exists(skillsRoot)) {
  for (const dir of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const f = path.join(skillsRoot, dir.name, 'SKILL.md');
    if (!exists(f)) continue;
    const fm = frontmatter(f);
    skills.push({
      id: dir.name,
      name: fm.name || dir.name,
      description: fm.description || '',
      category: categoryOf(dir.name),
      path: path.relative(CC, f).replace(/\\/g, '/'),
      source: 'openmontage',
      enabled: true,
    });
  }
}
skills.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

// ---------------------------------------------------------------- apps
const apps = [
  ['vectorcraft', 'VectorCraft', 'Ilustração vetorial, imagem, SVG/PDF/PSD', 'imagem'],
  ['figcraft', 'FigCraft', 'Design, cartões, thumbnails, UI', 'design'],
  ['filmcraft', 'FilmCraft', 'Edição de vídeo, sequências, export', 'video'],
  ['effectcraft', 'EffectCraft', 'Motion graphics, VFX, keyframes', 'motion'],
  ['anicraft', 'AniCraft', 'Animação 2D, sprite sheets, Lottie', 'animacao'],
  ['craft-anything', 'Craft Anything', 'Engenharia reversa de software/sites', 'investigacao'],
  ['soundcraft', 'SoundCraft', 'DAW, plugins, masterização de áudio', 'audio'],
].map(([id, name, what, cat]) => {
  const dir = path.join(CC, id === 'soundcraft' ? 'SoundCraft' : name === 'Craft Anything' ? 'Craft Anything' : name);
  const found = exists(dir);
  return {
    id, name, description: what, category: cat,
    path: dir,
    cli: exists(path.join(dir, id + '-cli.exe')) ? path.join(dir, id + '-cli.exe') : null,
    source: 'artcraft',
    enabled: found,
  };
});

// ---------------------------------------------------------------- pipelines
const pipelines = [];
const pipeDir = path.join(OM, 'pipeline_defs');
if (exists(pipeDir)) {
  for (const f of fs.readdirSync(pipeDir).filter((x) => x.endsWith('.yaml'))) {
    const txt = fs.readFileSync(path.join(pipeDir, f), 'utf8');
    const name = (txt.match(/^name:\s*(.+)$/m) || [])[1] || f.replace('.yaml', '');
    const desc = (txt.match(/^description:\s*>\s*\r?\n([\s\S]*?)(?=^\w+:|$)/m) || [])[1] || '';
    const cat = (txt.match(/^category:\s*(.+)$/m) || [])[1] || '';
    pipelines.push({
      id: name.trim(),
      description: desc.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ').slice(0, 240),
      category: cat.trim() || 'custom',
      path: 'OpenMontage/pipeline_defs/' + f,
      source: 'openmontage',
      enabled: true,
    });
  }
}

// ---------------------------------------------------------------- composições Remotion
const compositions = [];
const rootTsx = path.join(OM, 'remotion-composer', 'src', 'Root.tsx');
if (exists(rootTsx)) {
  const txt = fs.readFileSync(rootTsx, 'utf8');
  for (const m of txt.matchAll(/id="([A-Za-z0-9_]+)"/g)) {
    if (!compositions.find((c) => c.id === m[1])) {
      compositions.push({ id: m[1], source: 'openmontage', enabled: true });
    }
  }
}

// ---------------------------------------------------------------- módulos nossos
const modules = [];
const artDir = path.join(CC, '.artcraft');
if (exists(artDir)) {
  for (const f of fs.readdirSync(artDir).filter((x) => x.endsWith('.mjs') && !x.startsWith('_'))) {
    const txt = fs.readFileSync(path.join(artDir, f), 'utf8');
    const first = txt.split(/\r?\n/).find((l) => l.trim().startsWith('*') && l.trim().length > 6) || '';
    modules.push({
      id: f.replace('.mjs', ''),
      description: first.replace(/^\s*\*\s?/, '').trim().slice(0, 160),
      path: '.artcraft/' + f,
      source: 'ours',
      enabled: true,
    });
  }
}

// ---------------------------------------------------------------- vozes
const voice = {
  service: 'VoiceCraft',
  url: 'http://127.0.0.1:8090',
  contract: 'VoiceCraft/AGENTS.md',
  state_command: 'node .artcraft\\voicecraft-status.mjs',
  providers: [
    { id: 'nvidia', naturalness: 3, key: true, state: 'pronto' },
    { id: 'gemini', naturalness: 2, key: true, state: 'pronto' },
    { id: 'edge', naturalness: 6, key: false, state: 'pronto (sem chave)' },
    { id: 'gcloud', naturalness: 7, key: true, state: 'pronto' },
    { id: 'elevenlabs', naturalness: 1, key: true, state: 'sem chave (Puter.js no painel)' },
    { id: 'openai', naturalness: 4, key: true, state: 'sem chave (Puter.js no painel)' },
    { id: 'polly', naturalness: 5, key: true, state: 'sem chave (Puter.js no painel)' },
    { id: 'azure', naturalness: 8, key: true, state: 'sem chave' },
    { id: 'voicestudio', naturalness: 9, key: false, state: 'offline :3900' },
    { id: 'kokoro', naturalness: 10, key: false, state: 'offline :8880' },
  ],
  local_piper: {
    installed: exists(path.join(OM, '.venv', 'Scripts', 'piper.exe')),
    voices_dir: path.join(process.env.USERPROFILE || '', '.piper', 'models'),
    voices: exists(path.join(process.env.USERPROFILE || '', '.piper', 'models'))
      ? fs.readdirSync(path.join(process.env.USERPROFILE || '', '.piper', 'models')).filter((f) => f.endsWith('.onnx'))
      : [],
  },
};

const catalog = {
  generatedAt: new Date().toISOString(),
  version: 1,
  notes: [
    'Catalogo gerado automaticamente. Edita os "enabled"/"useFor" e volta a correr para preservar,',
    'ou corre node .artcraft\\studio-catalog.mjs para recriar a partir do disco.',
  ],
  totals: {
    skills: skills.length,
    apps: apps.length,
    pipelines: pipelines.length,
    compositions: compositions.length,
    modules: modules.length,
  },
  apps,
  skills,
  pipelines,
  compositions,
  modules,
  voice,
};

fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

console.log('catalogo : ' + OUT);
console.log('  apps        : ' + apps.length);
console.log('  skills      : ' + skills.length);
console.log('  pipelines   : ' + pipelines.length);
console.log('  composicoes : ' + compositions.length);
console.log('  modulos     : ' + modules.length);
const byCat = {};
for (const s of skills) byCat[s.category] = (byCat[s.category] || 0) + 1;
console.log('  skills por categoria: ' + JSON.stringify(byCat));
