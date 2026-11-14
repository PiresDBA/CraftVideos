#!/usr/bin/env node
/**
 * Referência → roteiro + topos.
 *
 * Dois passos num ficheiro só:
 *  1. analyzeReference(<mp4>)  →  script.scenes (tudo que o pipeline precisa)
 *  2. sceneTopVariants(scene)  →  jsonl do EffectCraft para a parte de cima
 *
 * Também serve como referência de contrato: como emitir scenes para o
 * yt-clone-build.mjs e como emitir topos para a mesma cadeia do pipeline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CC = 'D:\\CRAFT';
const EFFECT_CLI = path.join(CC, 'EffectCraft', 'effectcraft-cli.exe');
const PYTHON = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe');
const EDGE_TTS = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts', 'edge_tts');
const FFMPEG = path.join(process.env.LOCALAPPDATA || '', 'hermes', 'tools', 'ffmpeg-9.0.1-win32-x64', 'bin', 'ffmpeg.exe');
const FFPROBE = path.join(process.env.LOCALAPPDATA || '', 'hermes', 'tools', 'ffmpeg-9.0.1-win32-x64', 'bin', 'ffprobe.exe');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

// ---------------------------------------------------------------- helpers
function uuid4() {
  const h = (n) => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return h(0) + h(0) + '-' + h(0) + '-' + h(0) + '-' + h(0) + '-' + h(0) + h(0) + h(0);
}

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .split(' ')
    .map((w) => w.toUpperCase())
    .join(' ');
}

// ---------------------------------------------------------------- análise da referência

/**
 * Mede algo que o outro analisador (yt-ref-anatomy.mjs) não expõe em clean JSON:
 *   - duração + fps + dimensões
 *   - tom de cor dominante (extractColorTempo)
 *   - quadros de convite para samples visuais/loop (samplesFromFrames)
 *
 * Não tenta transcrever nem detectar gestos aqui — o pipeline usa TTS e
 * avatar separadamente. O que ele produz aqui é apenas o inventário visual
 * e temporal para aliviar o humano na escolha de topos.
 */
async function probeVideo(file) {
  return JSON.parse(
    spawnSync(FFPROBE, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      file,
    ]).stdout,
  );
}

function tempo(file) {
  const info = probeVideo(file);
  const fmt = info.format || {};
  const video = info.streams?.find((s) => s.codec_type === 'video');
  return {
    path: file,
    duration: Number(fmt.duration) || 0,
    fps: video?.r_frame_rate ? (() => {
      const [a, b] = (video.r_frame_rate || '0/1').split('/').map(Number);
      return b && a ? a / b : Number(video.avg_frame_rate) || 0;
    })() : 0,
    width: Number(video?.width) || 0,
    height: Number(video?.height) || 0,
    codec: video?.codec_name || '',
  };
}

/**
 * Extrai um tom de cor da cena média.
 * É aproximado, mas basta para orientar a paleta do clone.
 */
function extractColorTempo(file) {
  const out = path.join(path.dirname(file), '_ref_temp.jpg');
  const r = spawnSync(FFMPEG, [
    '-y', '-i', file,
    '-frames:v', '1',
    '-vf', 'scale=128:-1:flags=bilinear',
    '-f', 'image2',
    out,
  ]);
  if (r.status !== 0) {
    console.warn('extractColorTempo: ffmpeg falhou, ignorando tom');
    return { dominant: '#000000', note: 'falhou' };
  }
  // Imagem 128px de largura: calcula o tom médio de pixels tos.
  const spawn = spawnSync(PYTHON, [
    '-c',
    `from PIL import Image, ImageStat; im=Image.open("${out}").convert("RGB"); stat=ImageStat.Stat(im); print(" ".join(str(int(v)) for v in stat.mean))`,
  ]);
  try {
    const [r_, g, b] = spawn.stdout.trim().split(/\s+/).map(Number);
    return {
      dominant: '#' + [r_, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''),
      mean: { r: r_, g, b },
      note: 'approx',
    };
  } catch {
    return { dominant: '#000000', note: 'parse falhou' };
  }
}

/**
 * Amostra N imagens igualmente espaçadas da referência, para o humano
 * escolher topos/manuais/look. Não é overlay final — é input de decisão.
 */
function samplesFromFrames(file, count = 6, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const dur = tempo(file).duration;
  const step = Math.max(1, Math.floor(dur / count));
  for (let i = 0; i < count; i++) {
    const t = Math.min(dur - 0.1, i * step);
    const name = path.join(outDir, `ref-${String(i + 1).padStart(2, '0')}_${Math.round(t * 1000)}.jpg`);
    spawnSync(FFMPEG, [
      '-y', '-ss', String(t), '-i', file,
      '-frames:v', '1',
      '-vf', 'scale=720:-2:flags=bilinear',
      '-q:v', '3',
      name,
    ]);
  }
  return outDir;
}

// ---------------------------------------------------------------- roteiro a partir da referência

/**
 * Estrutura de cena que o pipeline espera.
 * Fonte de verdade: `clone.config.json → script.scenes`.
 */
function sceneFromFact(id, fact, narration, opts = {}) {
  return Object.assign(
    {
      id,
      avatar: opts.avatar || 'frida',
      narrator: opts.narrator || null,
      visual: opts.visual || null, // pasta drop-in ou figura específica
      layout: opts.layout || null, // sobrescreve split/razão se necessário
      kicker: opts.kicker || '',
      headline: opts.headline || '',
      body: opts.body || '',
      narration,
    },
    opts.extra || {},
  );
}

/**
 * Constrói um roteiro ``script.scenes`` a partir de fatos extraídos
 * manualmente ou automaticamente da referência.
 *
 * A estrutura que o canal de referência usa é, em termos do pipeline:
 *   - gancho (cena curta, muitas vezes com texto em cima)
 *   - blocos de factos / ideias (1 ou mais cenas)
 *   - remate / chamada para ação
 *
 * O script gera assim:
 *   - slate: cenas táticas 1 a N
 *   - per cena: narration pronta para TTS, e metadados para o gerador de topos
 *
 * Quando não há referência de texto (porque o vídeo não foi ainda transcrito),
 * o parâmetro `facts` carrega os factos gerados pelo agente/outro passo.
 */
function buildScriptFromFacts(facts, opts = {}) {
  const scenes = [];
  let idx = 1;
  for (const f of facts) {
    const id = 's' + String(idx).padStart(2, '0');
    scenes.push(
      sceneFromFact(
        id,
        f,
        opts.narrationFn ? opts.narrationFn(f, idx) : (f.narration || ''),
        {
          avatar: f.avatar || opts.avatar || 'frida',
          narrator: f.narrator || null,
          visual: f.visual || null,
          layout: f.layout || null,
          kicker: f.kicker || opts.kicker || '',
          headline: f.headline || '',
          body: f.body || '',
          extra: f.extra || {},
        },
      ),
    );
    idx += 1;
  }
  return {
    kicker: opts.kicker || 'DARK · IA',
    scenes,
    source: opts.source || 'analyze',
    _ref: opts.ref || null,
  };
}

// ---------------------------------------------------------------- topos (EffectCraft) para uma cena

/**
 * Contrato de topo ─ o que o EffectCraft recebe.
 *
 * Um topo é uma composição vertical 1080x(altura da banda) com:
 *   - uma frase principal (headline) e opcionalmente kicker + body
 *   - texto sob media = preto com stroke laranja, maiúsculas
 *   - ou frase grande sobre tudo (modo caption) se scene.textStyle.mode = 'caption'
 *
 * Variantes que o pipeline pede para o canal de referência:
 *   - captionA: frase única em laranja sob a imagem, tamanho máximo, borda grossa
 *   - captionB: mesma frase, mas tipografia ligeiramente diferente (tracking + altura)
 *   - layerStack: kicker + headline + body com motion presets
 *   - lowerThird: headline curta num painel lower-third com fundo translúcido
 *
 * O gerador devolve jsonl listo para o EffectCraft CLI.
 */
const TOP_VARIANTS = [
  { id: 'captionA', mode: 'caption' },
  { id: 'captionB', mode: 'captionB' },
  { id: 'layerStack', mode: 'layers' },
  { id: 'lowerThird', mode: 'lowerThird' },
];

/**
 * Constrói um jsonl de topo EffectCraft para uma cena.
 *
 * Devolve:
 *   - jsonl: string com as instruções
 *   - meta: { comps: [{ name, height, variant }] }
 */
function sceneTopVariants(scene, cfg = {}) {
  const C = cfg.cards || {};
  const TS = C.textStyle || {};
  const layout = scene.layout || C.avatarLayout || C.layout || {};
  const W = 1080;
  const scale = W / 1080;

  const cardH = {
    caption: 1920,
    captionB: 1920,
    layers: Math.round(1056 * scale),
    lowerThird: 620,
  };

  const lines = [];
  const comps = [];

  for (const v of TOP_VARIANTS) {
    const name = 'T' + scene.id + '_' + v.id;
    const H = cardH[v.mode] || 1056;
    lines.push(JSON.stringify({ command: 'comp.new', params: { name, width: W, height: H, frameRate: 30, duration: 3, background: C.palette?.bg || '#0B0B12' } }) + '\n');
    comps.push({ comp: name, height: H, variant: v.id });

    if (v.mode === 'caption' || v.mode === 'captionB') {
      // Frase única grande sobre tudo, maiúsculas, stroke laranja.
      const phrase = scene.headline || scene.narration?.slice(0, 90) || '';
      const fill = TS.onMedia?.fill || '#FFFFFF';
      const stroke = TS.onMedia?.stroke || '#FF8A3D';
      const strokeRatio = TS.onMedia?.strokeWidthRatio || 0.07;
      const size = v.mode === 'captionB'
        ? Math.round(108 * scale * 1.05)
        : Math.round(108 * scale);
      const sw = Math.max(3, Math.round(size * strokeRatio));
      lines.push(JSON.stringify({
        command: 'layer.newText',
        params: {
          text: phrase.toUpperCase(),
          name: 'headline',
          font: C.fontFamily || 'Inter',
          style: C.weight || 'Bold',
          size,
          fill,
          applyStroke: true,
          stroke,
          strokeWidth: sw,
          box: [90, Math.round(H * 0.5 - 150), W - 180, 400],
          justify: 'center',
        },
      }) + '\n');
      lines.push(JSON.stringify({
        command: 'layer.applyTextPreset',
        params: { layer: 'headline', preset: v.mode === 'captionB' ? 'trackingIn' : 'scramble' },
      }) + '\n');
    } else if (v.mode === 'layers') {
      // Kicker + headline + body arrumados na banda.
      const pad = 90;
      const width = W - pad * 2;

      const kicker = scene.kicker || '';
      if (kicker) {
        lines.push(JSON.stringify({
          command: 'layer.newText',
          params: {
            text: kicker.toUpperCase(),
            name: 'kick',
            font: C.fontFamily || 'Inter',
            style: C.weight || 'Bold',
            size: Math.round((C.kicker?.size || 34) * scale),
            fill: C.palette?.accent || '#FF8A3D',
            box: [pad, Math.round(H * layout.kickerY || 53), width, 70],
            justify: 'left',
          },
        }) + '\n');
        lines.push(JSON.stringify({ command: 'layer.applyTextPreset', params: { layer: 'kick', preset: 'fadeUpCharacters' } }) + '\n');
      }

      const headline = scene.headline || '';
      if (headline) {
        lines.push(JSON.stringify({
          command: 'layer.newText',
          params: {
            text: headline.toUpperCase(),
            name: 'head',
            font: C.fontFamily || 'Inter',
            style: C.weight || 'Bold',
            size: Math.round((C.headline?.size || 92) * scale),
            fill: TS.onMedia ? (TS.onMedia.fill || '#FFFFFF') : (C.palette?.ink || '#F4F4F4'),
            box: [pad, Math.round(H * (layout.headlineY || 0.1)), width, 430],
            justify: 'left',
          },
        }) + '\n');
        lines.push(JSON.stringify({ command: 'layer.applyTextPreset', params: { layer: 'head', preset: 'scramble' } }) + '\n');
      }

      const body = scene.body || '';
      if (body) {
        lines.push(JSON.stringify({
          command: 'layer.newText',
          params: {
            text: body.toUpperCase(),
            name: 'body',
            font: C.fontFamily || 'Inter',
            size: Math.round((C.body?.size || 40) * scale),
            fill: TS.onMedia ? (TS.onMedia.fill || '#FFFFFF') : (C.palette?.muted || '#9AA3B5'),
            box: [pad, Math.round(H * (layout.bodyY || 0.3)), width, 280],
            justify: 'left',
          },
        }) + '\n');
        lines.push(JSON.stringify({ command: 'layer.applyTextPreset', params: { layer: 'body', preset: 'fadeUpCharacters' } }) + '\n');
      }
    } else if (v.mode === 'lowerThird') {
      // Headline num lower-third.
      const headline = scene.headline || scene.narration?.slice(0, 50) || '';
      const h = Math.round(80 * scale);
      const y = Math.round(H - h - 40);
      lines.push(JSON.stringify({
        command: 'layer.newText',
        params: {
          text: headline.toUpperCase(),
          name: 'headline',
          font: C.fontFamily || 'Inter',
          style: C.weight || 'Bold',
          size: h,
          fill: C.palette?.ink || '#F4F4F4',
          box: [90, y, W - 180, h * 2],
          justify: 'left',
        },
      }) + '\n');
      lines.push(JSON.stringify({ command: 'layer.applyTextPreset', params: { layer: 'headline', preset: 'fadeUpCharacters' } }) + '\n');
      if (scene.kicker) {
        lines.push(JSON.stringify({
          command: 'layer.newText',
          params: {
            text: scene.kicker.toUpperCase(),
            name: 'kick',
            font: C.fontFamily || 'Inter',
            style: C.weight || 'Bold',
            size: Math.round(26 * scale),
            fill: C.palette?.accent || '#FF8A3D',
            box: [90, y - 40, W - 180, 36],
            justify: 'left',
          },
        }) + '\n');
        lines.push(JSON.stringify({ command: 'layer.applyTextPreset', params: { layer: 'kick', preset: 'fadeUpCharacters' } }) + '\n');
      }
    }
  }

  return { jsonl: lines.join(''), meta: { scene: scene.id, comps } };
}

// ---------------------------------------------------------------- e2e simples

async function analyzeReference(input) {
  const info = tempo(input);
  const color = extractColorTempo(input);
  const samplesDir = path.join(path.dirname(input), '_ref_samples');
  samplesFromFrames(input, 6, samplesDir);
  return { info, color, samplesDir };
}

function writeScriptScenes(slug, script, targetDir) {
  const out = path.join(targetDir, 'script.scenes.json');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(script, null, 2) + '\n', 'utf8');
  return out;
}

function writeTopVariantsJsonl(scene, cfg, outDir) {
  const { jsonl, meta } = sceneTopVariants(scene, cfg);
  const name = 'top-' + scene.id + '.jsonl';
  const out = path.join(outDir, name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(out, jsonl, 'utf8');
  return { out, meta };
}

function writeAllTopVariants(scenes, cfg, outDir) {
  const files = [];
  for (const sc of scenes) {
    files.push(writeTopVariantsJsonl(sc, cfg, outDir));
  }
  return files;
}

// ---------------------------------------------------------------- CLI

async function main() {
  const mode = arg('mode', 'analyze');
  const input = arg('input');
  const slug = arg('slug', 'ref-' + path.basename(input || 'video', '.mp4').replace(/\.[^.]+$/, ''));
  const outDir = arg('out-dir', path.join(CC, 'work', 'clones', slug));

  if (mode === 'analyze' && input) {
    const a = await analyzeReference(input);
    console.log(JSON.stringify({
      slug,
      info: a.info,
      color: a.color,
      samplesDir: a.samplesDir,
    }, null, 2));
    return;
  }

  if (mode === 'script' && input) {
    // Para este demo, gera um roteiro a partir de fatos simples lidos do Vídeo:
    // duração / número de cenas estimado / tom.
    const t = tempo(input);
    const color = extractColorTempo(input);
    const facts = [
      {
        kicker: 'DARK · IA',
        headline: 'COPIAR O FORMATO NÃO É COPIAR O CONTEÚDO',
        body: 'O mesmo esqueleto, outro assunto.',
        narration: 'Copiar o formato não é copiar o conteúdo.',
      },
      {
        kicker: 'ESTRUTURA',
        headline: 'GANCHO → NARRAÇÃO → IMAGEM',
        body: 'Motion, legendas e thumbnail no mesmo molde.',
        narration: 'O esqueleto é sempre o mesmo: gancho, narração, imagem.',
      },
      {
        kicker: 'REMATE',
        headline: 'O CANAL FICA IGUAL, O TEMA MUDA',
        body: 'Pipeline repetível, tema novo.',
        narration: 'O canal fica igual. O tema muda.',
      },
    ];
    const script = buildScriptFromFacts(facts, { ref: input, source: 'analyze' });
    const scriptPath = writeScriptScenes(slug, script, outDir);
    console.log('script.scenes → ' + scriptPath);
    const tops = writeAllTopVariants(script.scenes, { cards: (JSON.parse(fs.readFileSync(path.join(CC, 'clone.config.json'), 'utf8'))).cards }, path.join(outDir, 'tops'));
    console.log('top variants wrote: ' + tops.map((t) => t.out).join(', '));
    return;
  }

  if (mode === 'tops-only' && input) {
    const scriptPath = path.join(outDir, 'script.scenes.json');
    if (!fs.existsSync(scriptPath)) {
      console.error('script.scenes.json não existe em ' + outDir);
      process.exit(2);
    }
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
    const tops = writeAllTopVariants(script.scenes, { cards: (JSON.parse(fs.readFileSync(path.join(CC, 'clone.config.json'), 'utf8'))).cards }, path.join(outDir, 'tops'));
    console.log('top variants wrote: ' + tops.map((t) => t.out).join(', '));
    return;
  }

  console.error('modos: analyze | script | tops-only');
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
