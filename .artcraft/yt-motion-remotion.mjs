/**
 * Banda de cima em tipografia cinetica ORIGINAL — Remotion (OpenMontage).
 *
 * Porque existe: a banda de cima do clone usava footage do canal de referencia
 * (--visuals-video), o que nao se pode publicar por direitos autorais. Este modulo
 * renderiza mini-videos 100% originais com as palavras-chave de cada cena, animadas
 * palavra a palavra (spring) e sempre em movimento (float/pulse) — o estilo
 * (paleta, fonte, acento) vem do clone.config.json, a estrutura vem da medicacao.
 *
 * Uso:
 *   import { renderKineticCard, remotionAvailable } from './yt-motion-remotion.mjs';
 *   await renderKineticCard({ out, width: 1080, height: 1056, fps: 30, seconds: 10,
 *     words: 'AGENTES IA EXECUTAM', kicker: 'DARK · IA', ... });
 *
 * Engine: composicao "Explainer" do remotion-composer, cut.type "kinetic_words"
 * (componente KineticWords.tsx — ver SCENE_TYPES.md). Nada aqui removido: os engines
 * antigos (figcraft estatico, effectcraft com presets) continuam disponiveis.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const COMPOSER = 'D:\\CRAFT\\OpenMontage\\remotion-composer';
const REMOTION_CLI = path.join(COMPOSER, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');

/** true se o remotion-composer do OpenMontage esta instalado com dependencias. */
export function remotionAvailable() {
  return fs.existsSync(REMOTION_CLI) && fs.existsSync(path.join(COMPOSER, 'src', 'index.tsx'));
}

export const REMOTION_COMPOSER = COMPOSER;

/** Spawn de node com captura de saida (mesma forma de run() do yt-clone-build). */
function runNode(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { windowsHide: true, cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e.message) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * Renderiza UM cartao cinetico.
 *
 * spec: { out, width, height, fps, seconds, words, kicker, color, accentColor,
 *         backgroundColor, kickerColor, fontSize, stagger, accentEvery, propsFile? }
 *
 * Devolve true so quando o mp4 existe e nao esta vazio.
 */
export async function renderKineticCard(spec) {
  if (!remotionAvailable()) throw new Error('remotion-composer nao encontrado: ' + COMPOSER);
  const fps = Number(spec.fps || 30);
  const seconds = Math.max(0.5, Number(spec.seconds || 4));
  const frames = Math.max(1, Math.round(seconds * fps));
  const props = {
    cuts: [{
      id: 'c1',
      source: '',
      in_seconds: 0,
      out_seconds: seconds,
      type: 'kinetic_words',
      words: String(spec.words || ''),
      kicker: String(spec.kicker || ''),
      fontSize: Number(spec.fontSize || 96),
      color: spec.color || '#111111',
      accentColor: spec.accentColor || '#FF6A00',
      backgroundColor: spec.backgroundColor || '#F0E6D8',
      kickerColor: spec.kickerColor || '#FF8A3D',
      kineticLayout: spec.layout || 'editorial',
      kineticSignature: spec.signature || '',
      kineticStagger: Number(spec.stagger || 7),
      kineticAccentEvery: Number(spec.accentEvery || 3),
    }],
    overlays: [],
    captions: [],
    audio: {},
  };
  const propsFile = spec.propsFile || path.join(path.dirname(spec.out), path.basename(spec.out, '.mp4') + '.props.json');
  fs.writeFileSync(propsFile, JSON.stringify(props, null, 1), 'utf8');

  const r = await runNode([
    REMOTION_CLI,
    'render', 'src/index.tsx', 'Explainer', spec.out,
    '--props', propsFile,
    '--frames', '0-' + frames,
    '--width', String(Math.round(spec.width)),
    '--height', String(Math.round(spec.height)),
    '--log', 'error',
  ], COMPOSER);

  if (r.code !== 0 || !fs.existsSync(spec.out) || fs.statSync(spec.out).size < 1000) {
    console.error('    remotion: ' + String(r.stderr).slice(-600));
    return false;
  }
  return true;
}
