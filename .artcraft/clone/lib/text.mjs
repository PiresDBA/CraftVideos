/**
 * Logica de texto do pipeline de clonagem — pura, sem I/O, testavel.
 *
 * Tudo o que decide "que palavras aparecem no ecra" vive aqui: o pipeline le a
 * cena, escolhe as palavras-chave e escreve-as na banda de cima (Remotion),
 * embaixo do avatar (ASS) e na frase grande. As regras sao as mesmas para os
 * tres sitios, por isso ficam num unico sitio.
 */
import { assColour } from './colour.mjs';

/** Palavras vazias de pt/en/es — nao dizem nada e roubam espaco da banda. */
export const STOPWORDS = new Set([
  // pt
  'o','a','os','as','um','uma','uns','umas','de','do','da','dos','das','em','no','na','nos','nas',
  'por','para','com','que','e','ou','nao','se','ao','aos','à','às','é','são','sao','está','esta','estão','estao',
  'como','mas','mais','sem','até','ate','pelo','pela','pelos','pelas','dele','dela','deles','delas',
  'isso','este','esta','esse','essa','aqui','ali','la','ser','sou','e','foi','era','sao','foram',
  'meu','minha','meus','minhas','seu','sua','seus','suas','nos','nos','ja','ainda','muito','pouco',
  'quando','onde','porque','pois','entao','assim','tambem','cada','todo','toda','todos','todas',
  'outro','outra','outros','outras','num','numa','dele','dela','la','aqui','entao','ser','estar',
  // en
  'the','a','an','of','to','and','in','for','on','with','is','are','it','that','this','be','by','from',
  'as','at','we','you','they','he','she','not','but','or','so','if','can','will','just','our','your',
  'their','them','his','her','has','have','had','was','were','been','more','most','into','than','then',
  // es
  'el','la','los','las','un','una','unos','unas','y','en','es','por','con','que','del','al','lo','su','sus',
  'se','le','les','nos','nos','ya','más','mas','pero','como','cuando','donde','porque','muy','todo','toda',
  'todos','todas','otro','otra','este','esta','esto','eso','ese','esa','hay','ser','estar','tiene','tienen',
]);

/**
 * Divide texto em linhas que nao passam de `maxChars`, pela fronteira de palavras.
 * Nao depende de metricas de fonte — a largura real vem do renderizador.
 */
export function wrap(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Palavras-chave de uma frase.
 *
 * Devolve ate `max` palavras de conteudo, **na ordem original da frase** (ler-se
 * melhor do que por pontuacao) mas escolhidas por relevancia: inicio da frase
 * pesa mais, palavras longas pesam mais e CAIXA ALTA (que e como o guiao escreve
 * as palavras de enfase) pesa mais.
 *
 * O numero minimo e 2: uma frase como "AGENTES DE IA" nao pode ficar so com
 * "AGENTES" — a banda de cima ficava vazia de sentido. `minWords` e configuravel.
 *
 * @param {string} phrase  texto da cena
 * @param {number} max     maximo de palavras (cards.remotion.maxWords, cards.belowText.maxWords)
 * @param {object} opts    { minWords = 2 }
 */
export function keyWords(phrase, max, opts = {}) {
  const limit = Math.max(1, Number(max || 4));
  const min = Math.max(0, Math.min(limit, Number(opts.minWords ?? 2)));
  const raw = String(phrase || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  const tokens = raw
    .split(' ')
    .map((word, index) => ({
      index,
      word,
      clean: word.replace(/[^\p{L}\p{N}'’-]/gu, ''),
    }))
    .filter((t) => t.clean);

  if (!tokens.length) return [];

  // Des-duplicacao: "MUITO MUITO IMPORTANTE" contava "MUITO" duas vezes e
  // cada repeticao gastava um dos slots (maxWords). A v1 des-duplicava; a v2
  // tinha perdido isso — aqui volta, sem perder a primeira ocorrencia (que
  // fica na posicao original da frase).
  const seen = new Set();
  const unique = [];
  for (const t of tokens) {
    const k = t.clean.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(t);
  }

  const content = unique.filter((t) => !STOPWORDS.has(t.clean.toLowerCase()));
  // Frase so com stopwords -> usa as palavras cruas (melhor que nada).
  const pool = content.length ? content : unique;

  const scored = pool.map((t, rank) => {
    const position = 1 / (1 + rank * 0.35);
    const length = Math.min(t.clean.length, 14) / 40;
    // Caixa alta: o guiao escreve as palavras de enfase em CAIXA ALTA. A
    // primeira letra sozinha nao conta ("IA" e' inicial + maiuscula), por isso
    // so conta a partir da segunda — excepto em palavras de uma letra so.
    const shouted = /[A-ZÀ-Ý]/.test(t.clean.slice(1)) ||
      (t.clean.length === 1 && /[A-ZÀ-Ý]/.test(t.clean)) ? 0.25 : 0;
    const digits = /\d/.test(t.clean) ? 0.15 : 0;
    return { ...t, score: position + length + shouted + digits };
  });

  scored.sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, limit);
  // Minimo de palavras: se a frase permite mais contexto, completa o que falta.
  if (picked.length < min) {
    const remaining = scored.slice(limit);
    for (const t of remaining) {
      if (picked.length >= min) break;
      picked.push(t);
    }
  }

  picked.sort((a, b) => a.index - b.index);
  return picked.map((t) => t.clean);
}

/**
 * Palavras-chave de uma cena, com reserva.
 *
 * Uma frase curta ("O QUE SÃO AGENTES") so tem **uma** palavra de conteudo:
 * o resto sao stopwords. A banda de cima ficava com "AGENTES" sozinho, que
 * era exactamente o defeito reportado: a cena perdia o assunto. Aqui, quando
 * a frase nao chega ao minimo, entram como reserva o texto de apoio da cena
 * (body/caption) e a narracao, por esta ordem, sem repetir palavras ja
 * escolhidas.
 *
 * A reserva nunca substitui palavras ja apanhadas: so acrescenta, e so
 * quando e preciso. Uma frase curta mas informativa fica intacta.
 *
 * @param {string} phrase    frase principal da cena
 * @param {string[]} fallbacks  reservas, por ordem de prioridade
 * @param {number} max       maximo de palavras
 * @param {object} opts      { minWords = 2 }
 */
export function keywordsWithFallback(phrase, fallbacks = [], max = 4, opts = {}) {
  const limit = Math.max(1, Number(max || 4));
  const min = Math.max(0, Math.min(limit, Number(opts.minWords ?? 2)));
  const picked = keyWords(phrase, limit, opts);
  if (picked.length >= min) return picked;

  const seen = new Set(picked.map((w) => w.toLowerCase()));
  for (const source of Array.isArray(fallbacks) ? fallbacks : [fallbacks]) {
    if (!source || picked.length >= min) continue;
    const extra = keyWords(source, limit, opts);
    for (const w of extra) {
      if (picked.length >= limit) break;
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(w);
    }
  }
  return picked;
}

/**
 * Aplica o estilo de caixa a uma lista de palavras.
 *
 * A banda de cima e a frase grande sao CAIXA ALTA; o texto abaixo do avatar
 * segue `cards.textStyle.uppercase`. Sem esta regra, as palavras de reserva
 * (vindas do body, em caixa de frase) ficavam a meio caminho: "AGENTES |
 * Programas | autónomos".
 *
 * @param {string[]} words
 * @param {object} textStyle  { uppercase: boolean }
 */
export function styleWords(words, textStyle = {}) {
  const list = Array.isArray(words) ? words : [words];
  if (textStyle && textStyle.uppercase === false) return list.map((w) => String(w));
  return list.map((w) => String(w).toUpperCase());
}

/**
 * Divide a frase em runs para pintar uma palavra na cor de acento.
 *
 * Modos:
 *   markers    — {PALAVRA} na frase vira accent (o guiao controla)
 *   lastWords  — as ultimas N palavras sao accent
 *   none       — tudo na cor normal
 */
export function highlightRuns(text, style) {
  const H = (style && style.highlight) || {};
  const mode = H.mode || 'markers';
  const raw = String(text || '');
  if (mode === 'none') return [{ text: raw, accent: false }];

  if (mode === 'markers') {
    const runs = [];
    const re = /\{([^}]+)\}/g;
    let last = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      if (m.index > last) runs.push({ text: raw.slice(last, m.index), accent: false });
      runs.push({ text: m[1], accent: true });
      last = m.index + m[0].length;
    }
    if (last < raw.length) runs.push({ text: raw.slice(last), accent: false });
    return runs.length ? runs : [{ text: raw, accent: false }];
  }

  if (mode === 'lastWords') {
    const n = Math.max(1, Number(H.words || 1));
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length <= n) return [{ text: raw, accent: true }];
    const head = parts.slice(0, parts.length - n).join(' ');
    const tail = parts.slice(parts.length - n).join(' ');
    return [{ text: head + ' ', accent: false }, { text: tail, accent: true }];
  }

  return [{ text: raw, accent: false }];
}

/**
 * Runs -> texto ASS com override de cor (`{\c&HBBGGRR&}`).
 *
 * A conversao de cor vem de `colour.mjs` (partilhado com ass.mjs). O terceiro
 * argumento existe so por compatibilidade: passa-se `assColour` explicitamente
 * se quiser overriding; caso contrario usa-se a implementacao do modulo.
 */
export function accentRuns(runs, accentHex, colourFn) {
  const colour = (colourFn || assColour)(accentHex || '#FF6A00');
  return runs
    .map((r) => (r.accent ? '{\\c' + colour + '&}' + r.text + '{\\c&HFFFFFF&}' : r.text))
    .join('');
}

/**
 * Quebra uma frase em blocos de legenda (no max ~2 linhas).
 * Sem isto a legenda cresce para cima e invade o headline da mesma cena.
 */
export function captionChunks(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}
