import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { assColour, assTime, formatSRTTime, assStyleHeader, writeSceneASS, buildASS, buildSRT } from './ass.mjs';

/**
 * Le um ficheiro .ass e devolve os eventos com os campos ja separados.
 *
 * O `Format:` dos Events declara o numero de campos (Layer, Start, End,
 * Style, Name, MarginL, MarginR, MarginV, Effect, Text = 10). O texto do
 * evento e o ultimo campo e pode conter virgulas (ex.: \pos(540,1075)), por
 * isso so se pode separar a cabecalho a seguir com limite.
 */
function parseAssEvents(text) {
  const formatLine = text.split('\n').find((l) => l.startsWith('Format: Layer'));
  assert.ok(formatLine, 'o ficheiro .ass nao declara o Format dos Events');
  const fields = formatLine.split(':')[1].split(',').length;
  const events = text
    .split('\n')
    .filter((l) => l.startsWith('Dialogue:'))
    .map((line) => {
      const parts = line.split(',');
      return {
        meta: parts.slice(0, fields - 1),
        body: parts.slice(fields - 1).join(','),
        raw: line,
      };
    });
  return { fields, events };
}

const cfg = {
  video: { width: 1080, height: 1920, fps: 30 },
  layout: { mode: 'split', topRatio: 0.55, captionGap: 0.032 },
  cards: {
    palette: { bg: '#F0E6D8', ink: '#111111', accent: '#FF8A3D' },
    textStyle: { uppercase: true, mode: 'caption', captionWords: 'keywords', maxCaptionWords: 3 },
    subtitle: { bold: true, uppercase: true, outlineColor: '#000000', outlineWidth: 4, fontSizeRatio: 0.026, headFill: '#FFFFFF', headOutline: '#000000' },
  },
};

// Os testes criam pastas temporarias: limpam-se no fim (sem lixo no %TEMP%).
const created = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-ass-'));
  created.push(dir);
  return dir;
};
after(() => {
  for (const dir of created) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ja foi */ }
  }
});

test('assColour inverte os canais (ASS e BGR)', () => {
  assert.equal(assColour('#FFFFFF'), '&H00FFFFFF');
  // #FF6A00 -> R=FF G=6A B=00 -> o ASS guarda BGR: &H00 00 6A FF
  assert.equal(assColour('#FF6A00'), '&H00006AFF');
  assert.equal(assColour('#111111'), '&H00111111');
});

test('assTime formata h:mm:ss.cc', () => {
  assert.equal(assTime(0), '0:00:00.00');
  assert.equal(assTime(65.5), '0:01:05.50');
  assert.equal(assTime(3661.25), '1:01:01.25');
});

test('formatSRTTime formata hh:mm:ss,mmm', () => {
  assert.equal(formatSRTTime(0), '00:00:00,000');
  assert.equal(formatSRTTime(61.5), '00:01:01,500');
});

test('assStyleHeader declara o tamanho real do canvas', () => {
  const head = assStyleHeader(cfg, 1056).join('\n');
  assert.ok(head.includes('PlayResX: 1080'));
  assert.ok(head.includes('PlayResY: 1920'));
  // a fonte tem de existir neste Windows, senao o libass mostra a tag como texto
  assert.ok(head.includes('Arial'));
  assert.ok(head.includes('WrapStyle: 1'));
});

test('writeSceneASS em modo caption escreve so palavras-chave', () => {
  const dir = tmp();
  const file = writeSceneASS(cfg, dir, 'pt-BR', 's01', 'texto completo', 5, 1056, false, {
    phrase: 'AGENTES DE IA EXECUTAM TAREFAS',
    anchorY: 0.28,
  });
  assert.ok(file && fs.existsSync(file));
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('Head'), 'falta o evento Head');
  // conjunto exacto: a frase vira 3 palavras (maxCaptionWords), nao 4
  const event = text.split('\n').find((l) => l.startsWith('Dialogue: 1,'));
  assert.ok(event, 'falta o Dialogue do Head');
  assert.match(event, /AGENTES/);
  assert.ok(!event.includes('TAREFAS'), 'a frase inteira devia estar reduzida a palavras-chave');
  assert.ok(!event.includes('texto completo'), 'a legenda nao deve ir para o evento Head');
});

test('writeSceneASS em modo caption devolve null sem frase', () => {
  const dir = tmp();
  const out = writeSceneASS(cfg, dir, 'pt-BR', 's02', 'texto', 3, 1056, false, {});
  assert.equal(out, null);
});

test('REGRESSAO: o Dialogue do Head tem os 10 campos que o Format declara', () => {
  // BUG REAL (2026-11-13): o evento do Head era escrito com 9 campos — o
  // campo "Effect" faltava. A virgula dentro de \pos(540,1075) ocupava
  // entao o lugar do Effect, e o ffmpeg passava a ler o texto a partir de
  // "1075)}": o video queimava a frase gigante "1075)}AGENTES..." por cima
  // da banda de cima. Este teste e a rede de seguranca desse bug.
  const dir = tmp();
  const file = writeSceneASS(cfg, dir, 'pt-BR', 's03', 'texto completo', 5, 1056, false, {
    phrase: 'AGENTES DE IA EXECUTAM TAREFAS',
    anchorY: 0.28,
  });
  const { fields, events } = parseAssEvents(fs.readFileSync(file, 'utf8'));
  assert.equal(fields, 10, 'o Format dos Events deve declarar 10 campos');
  assert.ok(events.length >= 1, 'esperava-se pelo menos um evento');
  for (const ev of events) {
    assert.equal(ev.meta.length, fields - 1, 'cabecalho com o numero errado de campos: ' + ev.raw);
    assert.ok(ev.body.length > 0, 'evento sem texto: ' + ev.raw);
    // o texto NUNCA pode comecar por coordenadas: e o sintoma do campo em falta
    assert.ok(
      !/^\s*\d+\)/.test(ev.body),
      'o texto comeca por coordenadas (campo Effect em falta): ' + ev.body.slice(0, 40)
    );
  }
  const head = events.find((e) => e.raw.startsWith('Dialogue: 1,'));
  assert.ok(head, 'falta o evento Head');
  assert.ok(head.body.startsWith('{\\an2\\pos('), 'a tag de posicao ficou partida: ' + head.body.slice(0, 40));
});

test('REGRESSAO: a frase nao e duplicada quando a banda ja a desenha', () => {
  // Com a banda de cima em Remotion (tipografia cinetica), as palavras-chave
  // ja estao pintadas na banda. A camada ASS escrevia a MESMA frase por
  // cima, gigante, e tapava a banda. `phraseInBand` desliga a duplicacao.
  const dir = tmp();
  const file = writeSceneASS(cfg, dir, 'pt-BR', 's05', 'texto', 5, 1056, false, {
    phrase: 'AGENTES IA EXECUTAM',
    anchorY: 0.28,
    phraseInBand: true,
  });
  assert.equal(file, null, 'sem frase na camada ASS nao deve haver ficheiro de legendas');
});

test('REGRESSAO: as legendas normais tambem respeitam os 10 campos', () => {
  const dir = tmp();
  const cfgLayers = {
    ...cfg,
    cards: { ...cfg.cards, textStyle: { ...cfg.cards.textStyle, mode: 'layers' } },
  };
  const file = writeSceneASS(cfgLayers, dir, 'pt-BR', 's04', 'primeira legenda', 5, 1056, false, {
    phrase: 'IGNORADO',
  });
  const { fields, events } = parseAssEvents(fs.readFileSync(file, 'utf8'));
  assert.ok(events.length >= 1, 'esperava-se uma legenda');
  for (const ev of events) {
    assert.equal(ev.meta.length, fields - 1, 'cabecalho com o numero errado de campos: ' + ev.raw);
    assert.ok(!/^\s*\d+\)/.test(ev.body), 'texto comeca por coordenadas: ' + ev.body.slice(0, 40));
  }
});

test('buildASS/buildSRT correm o tempo pelas cenas', () => {
  const dir = tmp();
  const tracks = [
    { file: 'a.mp3', duration: 2.5, text: 'primeira cena' },
    { file: 'b.mp3', duration: 3, text: 'segunda cena' },
  ];
  const ass = buildASS(tracks, cfg, dir, 'pt-BR');
  const srt = buildSRT(tracks, 'pt-BR', dir);
  const assText = fs.readFileSync(ass, 'utf8');
  const srtText = fs.readFileSync(srt, 'utf8');
  assert.ok(assText.includes('0:00:00.00') && assText.includes('0:00:05.50'));
  assert.ok(srtText.includes('00:00:00,000 --> 00:00:02,500'));
  assert.ok(srtText.includes('segunda cena'));
});
