/**
 * Media da banda de cima de uma cena.
 *
 * Este modulo existe por uma razao historica: a regra "quando a banda de cima
 * e Remotion, a pasta `visuals/` fica de fora" estava ligada ao call site
 * errado — o que nunca era activo — e desligada no call site que importa
 * (a montagem das cenas). O resultado era o footage da referencia voltar a
 * entrar no video e as legendas deixarem de usar o estilo de tinta sobre o
 * cartao creme. Ter a regra aqui, com testes, torna impossivel repetir isso.
 */
import fs from 'node:fs';
import path from 'node:path';

const MEDIA_EXT = /\.(png|jpe?g|webp|mp4|mov|webm)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/**
 * Devolve o ficheiro de media da banda de cima de uma cena, por esta ordem:
 *   1. `scene.visual` (caminho do guiao ou escrito a mao) — sempre aceite
 *   2. `<slug>/visuals/sceneNN.* / NN.*` (pasta de drop-in, sem config)
 *   3. o N-esimo ficheiro de `<slug>/visuals/` por ordem alfabetica
 *
 * `opts.ignoreVisualsFolder` desliga a pasta (engine Remotion: a banda de cima
 * e tipografia nossa, nunca footage da referencia). O `scene.visual` explicito
 * continua a contar — foi posto a mao de proposito.
 *
 * @param {object[]} scenes
 * @param {string} dir      pasta do clone
 * @param {number} i        indice da cena
 * @param {object} opts     { ignoreVisualsFolder }
 */
export function sceneVisual(scenes, dir, i, opts = {}) {
  const explicit = scenes && scenes[i] && scenes[i].visual;
  if (explicit && fs.existsSync(explicit)) return explicit;
  if (opts.ignoreVisualsFolder) return null;

  const folder = path.join(dir, 'visuals');
  if (!fs.existsSync(folder)) return null;
  let all;
  try {
    all = fs.readdirSync(folder).filter((f) => MEDIA_EXT.test(f)).sort();
  } catch {
    return null;
  }
  if (!all.length) return null;

  const nn = String(i + 1).padStart(2, '0');
  const prefix = (f) => f.startsWith('scene' + nn) || f.startsWith(nn + '.') || f.startsWith(nn + '_');
  // Prioridade 1: video — banda de cima com movimento
  const video = all.find((f) => prefix(f) && VIDEO_EXT.test(f));
  if (video) return path.join(folder, video);
  // Prioridade 2: imagem, so se nao houver video
  const img = all.find((f) => prefix(f) && IMAGE_EXT.test(f));
  if (img) return path.join(folder, img);
  return null;
}
