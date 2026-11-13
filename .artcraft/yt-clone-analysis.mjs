#!/usr/bin/env node
/**
 * Clone feasibility analysis.
 *
 * Reads collection runs + taxonomy.json and answers two questions per channel:
 *   "was this made by AI?"  and  "can we reproduce the format with the ArtCraft apps?"
 *
 * Dark = a channel produced 100% by AI: the presenter may be an avatar of the creator,
 * the voice is synthesised, the script is written by a model and the publishing is
 * automated. It is not a niche — there are Dark channels about technology, food and news.
 *
 * Every verdict comes from the shared classifier in yt-classify.mjs, so the panel and this
 * report can never disagree. The cloneability score is explicit and printed at the end, so
 * you can argue with the weights and change them here.
 *
 * Usage:
 *   node yt-clone-analysis.mjs --sample "a.json" [--sample "b.json"] [--top 40]
 *                              [--channel-scan "channel-scan.json"]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClassifier } from './yt-classify.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function argAll(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--' + name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}

const SAMPLES = argAll('sample');
const TAXONOMY_PATH = arg('taxonomy', 'D:\\CRAFT\\taxonomy.json');
const CHANNEL_SCAN = arg('channel-scan', arg('shorts-scan', 'D:\\CRAFT\\work\\research\\channel-scan.json'));
const OUT = arg('out', 'D:\\CRAFT\\work\\research\\clone-feasibility.md');
const TOP = Number(arg('top', '40'));

const classifier = createClassifier(TAXONOMY_PATH);
const THRESHOLD = Number(classifier.AI.threshold || 6);

const SCAN = (() => {
  if (!fs.existsSync(CHANNEL_SCAN)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHANNEL_SCAN, 'utf8')).channels || null;
  } catch {
    return null;
  }
})();

function loadSamples(paths) {
  const videos = new Map();
  const channels = new Map();
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      console.error('amostra nao encontrada: ' + p);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const v of data.videos || []) if (v && v.id && !videos.has(v.id)) videos.set(v.id, v);
    for (const c of data.channels || []) {
      const key = c.channel_id || c.channel;
      if (!key) continue;
      if (!channels.has(key)) {
        channels.set(key, Object.assign({}, c));
      } else {
        const prev = channels.get(key);
        if ((c.videosSeen || 0) > (prev.videosSeen || 0)) {
          prev.videosSeen = c.videosSeen;
          prev.totalViewsSeen = c.totalViewsSeen;
          prev.avgViews = c.avgViews;
          prev.maxViews = c.maxViews;
        }
        prev.subs = prev.subs || c.subs;
        const a = prev.rssVideosInWindow;
        const b = c.rssVideosInWindow;
        prev.rssVideosInWindow = a === undefined ? b : b === undefined ? a : Math.max(a, b);
      }
    }
  }
  return { channels: Array.from(channels.values()), videos: Array.from(videos.values()) };
}

/**
 * How hard is this format to reproduce with the six ArtCraft apps?
 *
 * The question is not "is it popular" — it is "does it need a person, a licence, or
 * footage we cannot obtain". An AI channel is by construction a repeatable pipeline, which
 * is why the AI verdict carries points.
 */
function scoreChannel(c, vids, verdict) {
  const reasons = [];
  let score = 0;
  const add = (pts, why) => {
    score += pts;
    reasons.push((pts >= 0 ? '+' : '') + pts + ' ' + why);
  };

  const shortsShare = vids.length ? vids.filter((v) => v.isShort).length / vids.length : 0;
  const durations = vids.map((v) => v.duration).filter((d) => typeof d === 'number' && d > 0);
  const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : (c.avgDuration || 0);
  const v7 = c.rssVideosInWindow || 0;
  const avg = c.avgViews || 0;
  const subs = c.subs || 0;
  const ratio = subs ? avg / subs : 0;
  const scan = SCAN ? SCAN[c.channel_id] : null;
  const shortsCount = scan ? scan.shorts : 0;

  if (verdict.ai) add(3, 'canal 100% IA: o formato já é um pipeline, não uma pessoa');
  else if (verdict.aiVerdict === 'maybe') add(1, 'provavelmente IA: ' + verdict.aiReasons.slice(0, 2).join('; '));

  if (shortsCount >= 3) add(1, 'publica shorts (' + shortsCount + ' no separador /shorts): dá para testar temas barato');
  if (shortsShare >= 0.5) add(1, 'formato shorts: produção barata e testável em série');
  else if (avgDur && avgDur <= 480) add(1, 'vídeos curtos (' + Math.round(avgDur / 60) + ' min): guião pequeno, montagem rápida');
  else if (avgDur > 1200) add(-1, 'vídeos longos (' + Math.round(avgDur / 60) + ' min): guião e montagem pesados');

  if (v7 >= 3) add(2, v7 + ' uploads/semana: há cadência para copiar');
  else if (v7 >= 1) add(1, v7 + ' uploads/semana');
  else add(-1, 'sem cadência recente para estudar');

  if (ratio >= 1) add(2, 'views acima dos subscritores: o tema puxa, não a pessoa');
  else if (ratio >= 0.4) add(1, 'views próximos dos subscritores');
  else if (ratio > 0 && ratio < 0.25) add(-1, 'audiência presa à pessoa: difícil replicar');

  if (c.niche === 'infantil') add(-2, 'infantil exige personagens e propriedade intelectual');
  else if (c.niche === 'musica' || c.niche === 'cinema-animacao') add(-2, 'direitos de música/filme bloqueiam reutilização');
  else if (c.niche === 'desporto' || c.niche === 'noticias') add(-2, 'depende de direitos de transmissão/actualidade');
  else if (c.niche === 'vlogs') add(-1, 'formato de pessoa real: difícil sem a pessoa');

  if (subs > 5000000) add(-1, 'canal gigante: copiar o formato não chega, a distribuição é deles');

  return { score: Math.max(0, Math.min(10, score)), reasons, avgDur, shortsShare };
}

function pipelineFor(format) {
  if (format === 'shorts') {
    return [
      'Guião de 30-45s: 1 gancho + 3 factos + remate (o bot faz isto por tema, à noite)',
      'Voz: FilmCraft `tts.render` (en-US). Vozes básicas já instaladas; Kokoro-82M (335 MB) para voz natural',
      'FigCraft: cartão 1080x1920 com tipografia grande — script JSONL, export PNG',
      'EffectCraft: texto animado + 2-3 imagens com zoom',
      'FilmCraft: montagem 9:16, legendas queimadas, export H.264',
    ];
  }
  return [
    'Guião de 8-12 min: gancho nos primeiros 15s, blocos de história, cliffhanger a cada 60-90s',
    'Voz: FilmCraft `tts.render` / `tts.preview` (en-US); PT exigiria voz externa',
    'B-roll: banco de imagens/vídeo ou gerador externo; VectorCraft para tratar e compor',
    'EffectCraft: lower thirds, mapas, texto animado, grão e vinheta do "look dark"',
    'FilmCraft: timeline, música, legendas (captions.import de um SRT) e export',
    'FigCraft: thumbnail 1280x720 com 3-5 palavras',
  ];
}

function main() {
  if (!SAMPLES.length) {
    console.error('usa --sample <caminho> [--sample ...]');
    process.exit(2);
  }
  const sample = loadSamples(SAMPLES);

  const byChannel = new Map();
  for (const v of sample.videos) {
    const key = v.channel_id || v.channel;
    if (!key) continue;
    if (!byChannel.has(key)) byChannel.set(key, []);
    byChannel.get(key).push(v);
  }

  const rows = sample.channels.map((c) => {
    const vids = byChannel.get(c.channel_id || c.channel) || [];
    const scan = SCAN ? SCAN[c.channel_id] : null;
    const verdict = classifier.verdictOf(c, vids, scan);
    const merged = Object.assign({}, c, { niche: verdict.niche });
    const s = scoreChannel(merged, vids, verdict);
    return {
      channel: c.channel,
      id: c.channel_id,
      url: c.channel_url || 'https://www.youtube.com/channel/' + c.channel_id,
      subs: c.subs,
      views: c.totalViewsSeen || 0,
      avg: c.avgViews || 0,
      v7: c.rssVideosInWindow,
      niche: verdict.label,
      nicheId: verdict.niche,
      ai: verdict.ai,
      aiVerdict: verdict.aiVerdict,
      aiScore: verdict.aiScore,
      aiMax: verdict.aiThreshold,
      aiReasons: verdict.aiReasons,
      format: s.shortsShare >= 0.5 ? 'shorts' : 'long',
      shortsCount: scan ? scan.shorts : 0,
      shortsViews: scan ? (scan.shortsViews === undefined ? scan.views : scan.shortsViews) : 0,
      avgDur: s.avgDur,
      score: s.score,
      reasons: s.reasons,
    };
  });

  // Most viewed first — the user's default ordering, everywhere.
  rows.sort((a, b) => b.views - a.views);

  const ai = rows.filter((r) => r.ai);
  const maybe = rows.filter((r) => r.aiVerdict === 'maybe');
  const shorts = rows.filter((r) => r.format === 'shorts');
  const shortsActive = rows.filter((r) => r.shortsCount >= 3).sort((a, b) => (b.shortsViews || 0) - (a.shortsViews || 0));

  const band = (s) => (s >= 7 ? 'Alta' : s >= 4 ? 'Média' : 'Baixa');
  const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-PT'));
  const dur = (s) => (s ? Math.round(s / 60) + ' min' : '—');
  const n7 = (n) => (n === null || n === undefined ? '—' : n);
  const verdictTag = (r) => (r.ai ? '**DARK IA** ' + r.aiScore + '/' + r.aiMax : r.aiVerdict === 'maybe' ? 'IA? ' + r.aiScore + '/' + r.aiMax : 'humano');

  const L = [];
  L.push('# É possível clonar estes canais? — análise');
  L.push('');
  L.push('Gerado: ' + new Date().toISOString());
  L.push('Amostra: ' + sample.channels.length + ' canais, ' + sample.videos.length + ' vídeos.');
  L.push('Fonte de IA: ' + (SCAN ? path.basename(CHANNEL_SCAN) + ' (descrição + tags + separador /shorts)' : 'sem channel-scan — veredicto de IA limitado à cadência'));
  L.push('');
  L.push('> **CTR não existe em dados públicos** — é analytics privado do YouTube Studio.');
  L.push('> A nota de clonabilidade vem de: veredicto de IA, formato, cadência, relação');
  L.push('> views/subscritores e risco de direitos. As regras estão no fim do documento.');
  L.push('');

  L.push('## O que é Dark, aqui');
  L.push('');
  L.push('Dark = canal produzido **100 % por IA**, sem humano em câmara. O apresentador pode ser');
  L.push('um avatar do próprio criador; a voz é sintetizada; o guião é escrito por um modelo; a');
  L.push('edição e a publicação são automáticas. O fluxo típico: um bot apanha notícias/Reddit de');
  L.push('madrugada, escreve o guião, o avatar fala, a montagem corre sozinha, o vídeo é publicado.');
  L.push('');
  L.push('**Não é um nicho.** Há Dark de tecnologia, de comida, de notícias, de terror. Por isso o');
  L.push('nicho nesta análise é uma coluna, nunca o veredicto.');
  L.push('');
  L.push('O sinal medido é: avatar/automação declarados na descrição, ferramentas de IA nas tags,');
  L.push('e uma cadência que nenhum humano sustenta. Abaixo de ' + THRESHOLD + ' pontos o canal fica');
  L.push('"duvidoso" em vez de "dark" — e diz-se isso em vez de inventar certeza.');
  L.push('');

  L.push('## Resposta curta');
  L.push('');
  L.push('- canais **100 % IA** na amostra: **' + ai.length + '**');
  L.push('- duvidosos (perto do limiar): **' + maybe.length + '**');
  L.push('- canais com shorts no separador /shorts (>= 3): **' + shortsActive.length + '**');
  L.push('- canais cuja amostra é sobretudo shorts: **' + shorts.length + '**');
  L.push('- dark com nota Alta (>= 7): **' + ai.filter((r) => r.score >= 7).length + '**');
  L.push('');
  L.push('Sim, clona-se — mas o que se clona é o **pipeline**, não o conteúdo: mesma anatomia');
  L.push('(gancho → narração → imagens → música → legendas → thumbnail), tema diferente.');
  L.push('');

  L.push('## Canais 100 % IA, dos mais vistos para os menos vistos');
  L.push('');
  if (!ai.length) {
    L.push('Nenhum canal passou o limiar nesta amostra. Corre `yt-channel-scan.mjs` para ler as');
    L.push('descrições e o separador `/shorts` — sem isso o veredicto só vê a cadência.');
  } else {
    L.push('| # | Canal | Subs | Views (amostra) | Vids/7d | Nicho | Formato | IA | Nota |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    ai.slice(0, TOP).forEach((r, i) => {
      L.push('| ' + (i + 1) + ' | [' + r.channel + '](' + r.url + ') | ' + fmt(r.subs) + ' | ' + fmt(r.views) +
        ' | ' + n7(r.v7) + ' | ' + r.niche + ' | ' + (r.format === 'shorts' ? 'Shorts' : dur(r.avgDur)) +
        ' | ' + r.aiScore + '/' + r.aiMax + ' | **' + r.score + '/10** (' + band(r.score) + ') |');
    });
  }
  L.push('');

  L.push('## Os canais mais vistos da amostra, com o veredicto de IA ao lado');
  L.push('');
  L.push('É aqui que se vê que Dark não é nicho: a lista mistura temas, e o que separa os');
  L.push('clonáveis é o pipeline, não o assunto.');
  L.push('');
  L.push('| # | Canal | Views (amostra) | Nicho | Veredicto | Nota |');
  L.push('|---|---|---|---|---|---|');
  rows.slice(0, 25).forEach((r, i) => {
    L.push('| ' + (i + 1) + ' | [' + r.channel + '](' + r.url + ') | ' + fmt(r.views) + ' | ' + r.niche +
      ' | ' + verdictTag(r) + ' | ' + r.score + '/10 |');
  });
  L.push('');

  L.push('## Canais que publicam shorts, ordenados pelas views dos shorts');
  L.push('');
  L.push('Lido directamente do separador `/shorts` de cada canal — a pesquisa normal do');
  L.push('YouTube não devolve Shorts, por isso esta é a única medição honesta.');
  L.push('São os 12 shorts mais recentes de cada canal; "views dos shorts" é a soma desses 12.');
  L.push('');
  if (!shortsActive.length) {
    L.push('Nenhum canal com 3+ shorts nesta amostra.');
  } else {
    L.push('| # | Canal | Subs | Shorts vistos | Views dos shorts | Nicho | Veredicto | Nota |');
    L.push('|---|---|---|---|---|---|---|---|');
    shortsActive.slice(0, TOP).forEach((r, i) => {
      L.push('| ' + (i + 1) + ' | [' + r.channel + '](' + r.url + ') | ' + fmt(r.subs) + ' | ' + r.shortsCount +
        ' | ' + fmt(r.shortsViews) + ' | ' + r.niche + ' | ' + verdictTag(r) + ' | **' + r.score + '/10** (' + band(r.score) + ') |');
    });
  }
  L.push('');

  L.push('## Como se clona, em concreto');
  L.push('');
  L.push('Um vídeo Dark tem sempre a mesma anatomia: **gancho → narração → imagens → música → legendas → thumbnail**.');
  L.push('Só o tema muda. É por isso que é o formato mais automatizável do YouTube.');
  L.push('');
  L.push('| Peça | Ferramenta | O que faz |');
  L.push('|---|---|---|');
  L.push('| Guião | agente (texto) | estrutura + factos verificáveis, nunca copiados do original |');
  L.push('| Voz | **FilmCraft** `tts.preview` / `tts.render` | TTS embutido; hoje só `en-US`. `basic-female`/`basic-male` instaladas; Kokoro-82M (335 MB) dá voz natural |');
  L.push('| B-roll | banco de imagens + **VectorCraft** (`imageTrace`, composição, recorte) | tratar, recortar, compor |');
  L.push('| Movimento | **EffectCraft** (`text.presets`, `text.addSelector`, `prop.setExpression`) | texto animado, zoom, grão, vinheta |');
  L.push('| Montagem | **FilmCraft** (`captions.import`, `audio.voiceover.*`, export H.264/HEVC) | timeline, música, legendas, render |');
  L.push('| Thumbnail | **FigCraft** (`run` + `export png`) | 1280x720 com 3-5 palavras e contraste alto |');
  L.push('| Shorts | FilmCraft 9:16 + EffectCraft | mesma cadeia, mais curta |');
  L.push('| Canal novo | **AniCraft** | só se o formato for desenho animado |');
  L.push('');
  L.push('### Pipeline dark longo (8-12 min)');
  pipelineFor('long').forEach((s, i) => L.push((i + 1) + '. ' + s));
  L.push('');
  L.push('### Pipeline dark shorts (30-45 s)');
  pipelineFor('shorts').forEach((s, i) => L.push((i + 1) + '. ' + s));
  L.push('');

  L.push('## Os melhores alvos desta amostra');
  L.push('');
  L.push('Ordenados por views (o teu critério), não por nota: um formato clonável com 2 M views');
  L.push('vale mais do que um 9/10 com 40 mil.');
  L.push('');
  const targets = ai
    .filter((r) => r.score >= 6)
    .sort((a, b) => b.views - a.views || b.score - a.score)
    .slice(0, 10);
  if (!targets.length) {
    L.push('Nenhum canal 100 % IA passou a nota 6 nesta amostra. Corre o colector com `--preset dark`');
    L.push('e volta a correr `yt-channel-scan.mjs` para mais evidência.');
  } else {
    targets.forEach((r, i) => {
      L.push('### ' + (i + 1) + '. ' + r.channel + ' — ' + r.score + '/10 (' + band(r.score) + ')');
      L.push('');
      L.push('- link: ' + r.url);
      L.push('- subs: ' + fmt(r.subs) + ' · views na amostra: ' + fmt(r.views) + ' · uploads/7d: ' + n7(r.v7));
      L.push('- nicho: ' + r.niche + ' · formato: ' + (r.format === 'shorts' ? 'shorts' : dur(r.avgDur)));
      L.push('- porquê é IA: ' + (r.aiReasons.length ? r.aiReasons.join('; ') : 'override manual'));
      L.push('- porquê é clonável: ' + r.reasons.join('; '));
      L.push('');
    });
  }

  L.push('## Limites que não vou esconder');
  L.push('');
  L.push('1. **Voz.** O FilmCraft sintetiza (TTS), mas só tem `en-US` instalado. Para PT é preciso gravar ou usar um TTS externo; para voz natural é preciso descarregar o pacote Kokoro-82M (335 MB).');
  L.push('2. **B-roll.** O ArtCraft não gera imagem nem vídeo: vem de banco, de gravação própria ou de um gerador externo.');
  L.push('3. **Direitos.** Copiar guião, voz ou imagens de um canal é violação de direitos e, no YouTube, conteúdo reutilizado sem valor acrescentado. O que se clona é a **estrutura**.');
  L.push('4. **CTR.** Não existe publicamente. Toda esta análise usa views, cadência e proporções.');
  L.push('5. **Amostra.** São 7 dias de pesquisa, não um censo. O veredicto de IA é heurístico: um canal que nunca menciona IA não pode ser provado em nenhum sentido — usa `overrides` em `taxonomy.json`.');
  L.push('');

  L.push('## Regras da nota (editáveis em `yt-clone-analysis.mjs`)');
  L.push('');
  L.push('| Condição | Pontos |');
  L.push('|---|---|');
  L.push('| canal 100 % IA (veredicto dark) | +3 |');
  L.push('| duvidoso (perto do limiar) | +1 |');
  L.push('| >= 50% shorts, ou duração média <= 8 min | +1 |');
  L.push('| duração média > 20 min | −1 |');
  L.push('| >= 3 uploads na semana | +2 |');
  L.push('| 1-2 uploads na semana | +1 |');
  L.push('| sem uploads recentes | −1 |');
  L.push('| views >= subscritores | +2 |');
  L.push('| views >= 40% dos subscritores | +1 |');
  L.push('| views < 25% dos subscritores | −1 |');
  L.push('| infantil / música / cinema / desporto / notícias | −2 |');
  L.push('| vlogs | −1 |');
  L.push('| mais de 5 M subscritores | −1 |');
  L.push('');
  L.push('Nota final limitada a 0-10. Alta >= 7, Média 4-6, Baixa < 4.');
  L.push('');
  L.push('O veredicto de IA vem de `taxonomy.json` (`ai.weights`, `ai.cadenceBands`, listas de');
  L.push('palavras, `ai.threshold`), lido por `yt-classify.mjs` — o mesmo código que desenha o painel.');
  L.push('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, L.join('\n'), 'utf8');
  console.log('relatorio: ' + OUT);
  console.log('ia: ' + ai.length + ' dark · ' + maybe.length + ' duvidosos · shorts: ' + shorts.length + ' · alvos >=6: ' + ai.filter((r) => r.score >= 6).length);
}

main();
