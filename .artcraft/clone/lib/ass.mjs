/**
 * Legendas queimadas (.ass) e ficheiros .srt.
 *
 * Por que escrever o ASS a mao: o filtro `subtitles` do ffmpeg assume
 * PlayResY=288 quando o ficheiro nao tem cabecalho, entao um Fontsize de 18
 * fica 6.7x maior num video de 1920 de altura — foi o que fez a primeira
 * versao ter legendas a cobrir o frame inteiro. Escrevendo o ASS, Fontsize
 * significa pixeles.
 */
import fs from 'node:fs';
import path from 'node:path';
import { layoutMetrics } from './layout.mjs';
import { keyWords, keywordsWithFallback, highlightRuns, accentRuns, captionChunks } from './text.mjs';
import { assColour } from './colour.mjs';

/** #RRGGBB -> &HAABBGGRR (o ASS guarda as cores ao contrario). */
export { assColour };

/** Segundos -> h:mm:ss.cc (formato ASS). */
export function assTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2);
}

/** Segundos -> hh:mm:ss,mmm (formato SRT). */
export function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
  return h + ':' + m + ':' + s + ',' + ms;
}

/** Cabecalho ASS partilhado pelo ficheiro do video inteiro e pelo de cada cena. */
export function assStyleHeader(cfg, bandH) {
  const LM = layoutMetrics(cfg);
  const W = LM.W;
  const H = LM.H;
  const SB = cfg.cards.subtitle || {};
  const fontPx = Math.max(28, Math.round(H * Number(SB.fontSizeRatio || 0.024)));
  // Split: as legendas fecham a banda visual, nunca passam por cima do apresentador.
  const marginV = LM.split
    ? Math.round((H - Number(bandH || LM.cardH)) + H * Number((cfg.layout && cfg.layout.captionGap) || 0.032))
    : Math.round(H * 0.055);
  const marginH = Math.round(W * 0.075);
  const bold = SB.bold === false ? 0 : -1;
  const outlineWidth = Math.max(1, Number(SB.outlineWidth || 3));
  // Fonte: 'Inter' nao existe neste Windows -> o libass nao a acha e as tags
  // {\\an2\\pos(...)} viram texto literal ("1075)"). Arial esta instalada e e'
  // a escolha segura para renderizacao determinista de sobreposicao.
  const FONT_NAME = SB.fontName || 'Arial';
  const line = (name, fill, outlineColour, sizePx, outW) =>
    'Style: ' + name + ',' + FONT_NAME + ',' + (sizePx || fontPx) + ',' + assColour(fill) + ',&H000000FF,' + assColour(outlineColour) + ',&H90000000,' +
    bold + ',0,0,0,100,100,0,0,1,' + (outW || outlineWidth) + ',1,2,' + marginH + ',' + marginH + ',' + marginV + ',1';
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: ' + W,
    'PlayResY: ' + H,
    // WrapStyle 1 = quebra nas palavras, sem transbordar. 0 = corre para fora
    // (foi o que fez "LO QUE NO CUENTAN" passar pelas orelhas do avatar).
    'WrapStyle: 1',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Default = sobre media (branco sobre imagem). Light = sobre o cartao creme (tinta sobre papel).
    line('Default', '#FFFFFF', SB.outlineColor || '#000000'),
    line('Light', SB.lightFill || '#111111', SB.lightOutline || '#F0E6D8'),
    // Head = a frase grande da referencia, pintada sobre o frame inteiro
    // (apresentador incluido). A posicao vertical vem do \pos do evento, porque
    // muda de plano para plano.
    line(
      'Head',
      SB.headFill || '#FFFFFF',
      SB.headOutline || '#000000',
      Math.max(40, Math.round(H * Number(SB.headSizeRatio || 0.056))),
      Math.max(4, Number(SB.headOutlineWidth || 10))
    ),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
}

/**
 * Um ASS por cena.
 *
 * Cada cena e codificada como um clip separado comecando em t=0, entao queimar
 * o ficheiro de legendas do video inteiro em cada clip mostraria o texto da
 * cena 1 sobre a imagem da cena 2. Este ficheiro tem uma unica entrada, que
 * cobre a cena.
 */
/**
 * Linha de `Dialogue:` com o numero de campos exacto que o `Format:` dos
 * Events declara (Layer, Start, End, Style, Name, MarginL, MarginR,
 * MarginV, Effect, Text = 10).
 *
 * O campo "Effect" e vazio, mas TEM de existir. Sem ele, a virgula dentro
 * de uma tag de posicao (`\pos(540,1075)`) ocupa o lugar do Effect e o
 * ffmpeg passa a ler o texto a partir de "1075)}" — as coordenadas
 * queimam-se no video como texto gigante.
 *
 * Bug real em 2026-11-13: o evento do Head era escrito a mao com 9 campos
 * e a banda de cima ficava coberta por "1075)}AGENTES...". Ver o teste de
 * regressao em ass.test.mjs.
 *
 * @param {number|string} layer   camada (0 = legendas, 1 = frase grande)
 * @param {string} start          tempo de inicio ja formatado (assTime)
 * @param {string} end            tempo de fim ja formatado (assTime)
 * @param {string} style          nome do estilo ("Head", "Default", "Light")
 * @param {string} text           conteudo (pode conter virgulas e tags)
 * @returns {string}              a linha completa
 */
export function assDialogue(layer, start, end, style, text) {
  // Name vazio, margens a zero, Effect vazio: 9 campos antes do texto.
  return 'Dialogue: ' + layer + ',' + start + ',' + end + ',' + style + ',,0,0,0,,' + text;
}

/**
 * Legendas de uma cena: frase grande (opcional) + legenda normal.
 *
 * @param {object} cfg          configuracao completa
 * @param {string} dir          pasta do clone
 * @param {string} lang         idioma ("pt-BR")
 * @param {string} sceneId      identificador da cena ("01", "s01", ...)
 * @param {string} text         legenda normal (a narração)
 * @param {number} seconds      duracao da cena
 * @param {number} bandH        altura da banda de cima
 * @param {boolean} onLight     true se o fundo da cena e claro (texto escuro)
 * @param {object} opts         { phrase, anchorY, phraseFallbacks }
 */
export function writeSceneASS(cfg, dir, lang, sceneId, text, seconds, bandH, onLight, opts = {}) {
  const folder = path.join(dir, 'subtitles', String(lang || 'pt-BR'));
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'scene-' + sceneId + '.ass');
  const clean = String(text || '').replace(/\r?\n/g, ' ').replace(/[{}]/g, '').trim();
  const SUB = cfg.cards.subtitle || {};
  const TS = cfg.cards.textStyle || {};
  const total = Math.max(0.5, seconds);
  const events = [];

  // ---- a frase grande: uma camada de texto sobre o frame inteiro, apresentador
  // incluido. Um cartao nao consegue pintar fora da sua banda — e por isso que
  // isto vive na camada ASS.
  //
  // EXCEPcao: quando a banda de cima ja desenha a frase (engine Remotion, que
  // faz tipografia cinetica com as mesmas palavras-chave), a camada ASS
  // duplicava o texto por cima da banda. `phraseInBand` desliga a duplicacao.
  const phrase = opts.phrase;
  if (TS.mode === 'caption' && phrase && !opts.phraseInBand) {
    const LM = layoutMetrics(cfg);
    const anchorY = Math.max(0.12, Math.min(0.95, Number(opts.anchorY != null ? opts.anchorY : 0.28)));
    // textStyle.captionWords = "keywords" mostra so as palavras mais
    // interessantes (a frase inteira cobria o avatar); "full" mantem a frase.
    // Se a frase for curta demais ("O QUE SÃO AGENTES" -> so "AGENTES"), as
    // reservas (body/narração) entram para a frase grande nao ficar com uma
    // palavra so.
    const rawSource = String(phrase).replace(/\r?\n/g, ' ').trim();
    const raw = String(TS.captionWords || '').toLowerCase() === 'keywords'
      ? keywordsWithFallback(rawSource, opts.phraseFallbacks || [], TS.maxCaptionWords || 4).join(' ')
      : rawSource;
    const uw = TS.uppercase !== false ? raw.toUpperCase() : raw;
    const runs = highlightRuns(uw, TS);
    const accent = (TS.highlight && TS.highlight.color) || (TS.onMedia && TS.onMedia.accent) || '#FF6A00';
    const y = Math.round(LM.H * anchorY);
    events.push(
      assDialogue(1, '0:00:00.00', assTime(total), 'Head',
        '{\\an2\\pos(' + Math.round(LM.W / 2) + ',' + y + ')}' + accentRuns(runs, accent))
    );
  }

  // ---- legendas normais (desligadas em modo caption: a frase grande ja diz)
  const wantCaptions = TS.mode !== 'caption' || SUB.captionsInCaptionMode === true;
  if (wantCaptions) {
    const shown = SUB.uppercase ? clean.toUpperCase() : clean;
    // Uma linha por frase vale mais do que um bloco de seis: a legenda crescia
    // para cima e invadia o headline e o body da mesma cena. Blocos de ~60
    // caracteres cabem em duas linhas no maximo.
    const chunks = clean ? captionChunks(shown, Number(SUB.maxCharsPerChunk || 62)) : [];
    const slice = chunks.length ? total / chunks.length : total;
    const style = onLight ? 'Light' : 'Default';
    chunks.forEach((c, i) => {
      events.push(assDialogue(0, assTime(i * slice), assTime((i + 1) * slice), style, c));
    });
  }

  fs.writeFileSync(file, assStyleHeader(cfg, bandH).concat(events).join('\n') + '\n', 'utf8');
  return events.length ? file : null;
}

/** Legendas do video inteiro (uma entrada por cena, com o tempo ja corrido). */
export function buildASS(tracks, cfg, dir, lang) {
  const assDir = path.join(dir, 'subtitles', String(lang || 'pt-BR'));
  fs.mkdirSync(assDir, { recursive: true });
  const head = assStyleHeader(cfg);

  let t = 0;
  const lines = [];
  for (const tr of tracks) {
    if (!tr.file || !tr.text) continue;
    const start = t;
    t += tr.duration;
    lines.push(
      assDialogue(0, assTime(start), assTime(t), 'Default',
        String(tr.text).replace(/\r?\n/g, ' ').replace(/[{}]/g, ''))
    );
  }

  const file = path.join(assDir, 'subtitles.ass');
  fs.writeFileSync(file, head.concat(lines).join('\n') + '\n', 'utf8');
  return file;
}

/** Legendas .srt (uma entrada por cena, com o tempo ja corrido). */
export function buildSRT(tracks, lang, dir) {
  const srtDir = path.join(dir, 'subtitles', lang);
  fs.mkdirSync(srtDir, { recursive: true });
  let index = 1;
  let time = 0;
  const lines = [];
  for (const t of tracks) {
    if (!t.file || !t.text) continue;
    const start = formatSRTTime(time);
    time += t.duration;
    const end = formatSRTTime(time);
    lines.push(String(index++));
    lines.push(start + ' --> ' + end);
    lines.push(t.text);
    lines.push('');
  }
  const srtFile = path.join(srtDir, 'subtitles.srt');
  fs.writeFileSync(srtFile, lines.join('\n'), 'utf8');
  return srtFile;
}
