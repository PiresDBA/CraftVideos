import test from 'node:test';
import assert from 'node:assert/strict';
import { wrap, keyWords, keywordsWithFallback, styleWords, highlightRuns, accentRuns, captionChunks, STOPWORDS } from './text.mjs';

test('wrap parte em palavras e nunca ultrapassa o limite', () => {
  const lines = wrap('palavra um dois tres quatro cinco', 12);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 12, 'linha demasiado longa: ' + l);
});

test('wrap nao perde palavras', () => {
  const text = 'O QUE ELES NAO CONTAM';
  assert.equal(wrap(text, 10).join(' '), text);
});

test('keyWords tira stopwords e devolve palavras de conteudo', () => {
  const out = keyWords('O QUE ELES NAO CONTAM', 3);
  assert.deepEqual(out, ['ELES', 'CONTAM']);
});

test('keyWords nunca devolve stopwords quando ha conteudo na frase', () => {
  const out = keyWords('de da do em no na os as um uma com que para AGENTES IA', 4);
  assert.ok(out.length > 0);
  for (const w of out) assert.equal(STOPWORDS.has(w.toLowerCase()), false, 'stopword escapou: ' + w);
});

test('keyWords respeita o limite de palavras', () => {
  const out = keyWords('AGENTES DE IA EXECUTAM TAREFAS AUTOMA', 3);
  assert.equal(out.length, 3);
});

test('keyWords devolve pelo menos 2 palavras quando a frase permite', () => {
  // o bug antigo: "AGENTES DE IA" ficava so com "AGENTES"
  const out = keyWords('AGENTES DE IA', 3);
  assert.ok(out.length >= 2, 'ficou com ' + out.length + ' palavra(s): ' + out.join(' '));
  assert.ok(out.includes('AGENTES'));
});

test('keyWords preserva a ordem original da frase', () => {
  const out = keyWords('ROSTO SINTETICO E VIDEO MONTADO', 3);
  const idx = out.map((w) => 'ROSTO SINTETICO E VIDEO MONTADO'.split(' ').indexOf(w));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test('keyWords devolve lista vazia para texto vazio', () => {
  assert.deepEqual(keyWords('', 3), []);
  assert.deepEqual(keyWords('   ', 3), []);
});

test('keyWords com frase so de stopwords devolve palavras cruas', () => {
  const out = keyWords('de da do', 3);
  assert.ok(out.length > 0);
});

test('highlightRuns: marcadores {PALAVRA}', () => {
  const runs = highlightRuns('SO EACH {DRAWING}', { highlight: { mode: 'markers' } });
  assert.equal(runs.filter((r) => r.accent).length, 1);
  assert.equal(runs.find((r) => r.accent).text, 'DRAWING');
});

test('highlightRuns: lastWords acenta as ultimas N', () => {
  const runs = highlightRuns('SO EACH DRAWING TODAY', { highlight: { mode: 'lastWords', words: 2 } });
  const accent = runs.filter((r) => r.accent).map((r) => r.text.trim());
  assert.deepEqual(accent, ['DRAWING TODAY']);
});

test('highlightRuns: none nao acenta nada', () => {
  const runs = highlightRuns('{TUDO}', { highlight: { mode: 'none' } });
  assert.equal(runs.filter((r) => r.accent).length, 0);
});

test('accentRuns escreve o override de cor do ASS', () => {
  const out = accentRuns([{ text: 'A', accent: false }, { text: 'B', accent: true }], '#FF6A00', (h) => '&H' + h);
  assert.ok(out.includes('{\\c&H#FF6A00&}B'));
});

test('captionChunks respeita o tamanho maximo', () => {
  const chunks = captionChunks('uma frase bem comprida para partir em varios blocos de legenda', 20);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 20, 'chunk grande: ' + c);
});

// ---- keywordsWithFallback (a reserva que resolve "so AGENTES")

test('keywordsWithFallback completa a frase curta com a reserva', () => {
  // o bug reportado: "O QUE SÃO AGENTES" so tinha uma palavra de conteudo
  const out = keywordsWithFallback('O QUE SÃO AGENTES', ['Programas autónomos que realizam funções'], 5);
  assert.ok(out.length >= 2, 'ficou com ' + out.length + ': ' + out.join(' '));
  assert.equal(out[0], 'AGENTES', 'a palavra da frase tem de vir primeiro');
  assert.ok(out.some((w) => /PROGRAMAS|AUTÓNOMOS/i.test(w)), 'a reserva nao entrou: ' + out.join(' '));
});

test('keywordsWithFallback nao mexe numa frase ja informativa', () => {
  const out = keywordsWithFallback('EXEMPLO PRÁTICO REAL', ['Programas autónomos que realizam funções'], 5);
  assert.deepEqual(out, ['EXEMPLO', 'PRÁTICO', 'REAL']);
});

test('keywordsWithFallback nunca repete palavras', () => {
  const out = keywordsWithFallback('AGENTES DE IA', ['Agentes de IA executam tarefas'], 5);
  const lower = out.map((w) => w.toLowerCase());
  assert.equal(new Set(lower).size, lower.length, 'repetiu: ' + out.join(' '));
});

test('keywordsWithFallback respeita o limite maximo', () => {
  const out = keywordsWithFallback('AGENTES DE IA', ['Programas autónomos que realizam funções específicas'], 2);
  assert.ok(out.length <= 2, 'excedeu o limite: ' + out.join(' '));
});

test('keywordsWithFallback devolve a frase intacta sem reservas', () => {
  const out = keywordsWithFallback('AGENTES DE IA', [], 5);
  assert.ok(out.length >= 2);
  assert.equal(out[0], 'AGENTES');
});

// ---- styleWords (caixa unificada)

test('styleWords passa tudo a CAIXA ALTA por omissao', () => {
  assert.deepEqual(styleWords(['AGENTES', 'Programas', 'autónomos']), ['AGENTES', 'PROGRAMAS', 'AUTÓNOMOS']);
});

test('styleWords respeita uppercase: false', () => {
  assert.deepEqual(styleWords(['AGENTES', 'Programas'], { uppercase: false }), ['AGENTES', 'Programas']);
});

test('styleWords nunca perde palavras', () => {
  const words = ['a', 'b', 'c'];
  assert.equal(styleWords(words, {}).length, words.length);
});

// ---- des-duplicacao (a v1 fazia, a v2 tinha perdido)

test('keyWords nao devolve a mesma palavra duas vezes', () => {
  const out = keyWords('MUITO MUITO IMPORTANTE', 3);
  assert.equal(out.length, new Set(out.map((w) => w.toLowerCase())).size, 'repetiu: ' + out.join(' '));
});

test('keyWords conta cada repeticao como uma palavra so', () => {
  const out = keyWords('IA IA IA AGENTES', 2);
  assert.equal(out.length, 2);
  assert.ok(out.includes('AGENTES'));
});
