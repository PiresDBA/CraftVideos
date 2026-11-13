#!/usr/bin/env node
/**
 * Gerador de guião — o passo M5 que faltava.
 *
 * Recebe um TEMA (e opcionalmente um perfil de formato medido) e devolve um
 * script.json pronto para o yt-clone-build.mjs:
 *
 *   node .artcraft\yt-script.mjs --topic "bots que publicam enquanto dormes"
 *                                [--format work\reference\jazzghost.format.json]
 *                                [--scenes 4] [--lang pt-BR] [--out work\clones\meu\script.json]
 *
 * Usa o OpenRouter que já está no .env do VoiceCraft. Nada de chaves no código.
 * Regra: escreve conteúdo ORIGINAL; nunca copia o canal de referência.
 */
import fs from 'node:fs';
import path from 'node:path';

const CC = 'D:\\CRAFT';
const ENV_PATH = path.join(CC, 'VoiceCraft', '.env');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const FLAG = (n) => process.argv.includes('--' + n);

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const KEY = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const MODEL = arg('model', env.OPENROUTER_MODEL || 'openrouter/free');

const TOPIC = arg('topic', '');
const FORMAT_PATH = arg('format', '');
const SCENES = Number(arg('scenes', '4'));
const LANG = arg('lang', 'pt-BR');
const OUT = arg('out', '');
const TONE = arg('tone', 'direto, curioso, sem exagero publicitario');
const PRESENTERS = (arg('presenters', 'frida,luna') || 'frida,luna').split(',').map((s) => s.trim()).filter(Boolean);

if (!TOPIC) {
  console.error('usa --topic "o tema do vídeo"');
  process.exit(2);
}
if (!KEY) {
  console.error('sem OPENROUTER_API_KEY em ' + ENV_PATH);
  process.exit(2);
}

let format = null;
if (FORMAT_PATH && fs.existsSync(FORMAT_PATH)) {
  try {
    format = JSON.parse(fs.readFileSync(FORMAT_PATH, 'utf8'));
  } catch { /* ignore */ }
}

const fmtLine = format
  ? `Formato alvo medido de uma referência: ${format.duration}s, ${format.shots} planos, ` +
    `${format.cutsPerMinute} cortes/min, ${format.recipe?.cutStyle || ''}, estrutura ${(format.recipe?.structure || []).join(' → ')}.`
  : 'Formato alvo: vídeo curto vertical, plano de apresentador, ritmo calmo.';

const sys = `És argumentista de um canal de YouTube em ${LANG}.
Escreves curto, falado, sem floreados. Cada cena tem de poder ser lida em voz alta em 8 a 14 segundos.
Não copias nenhum canal existente: usas a ESTRUTURA, nunca o texto de outro.
Nunca mencionas nomes de canais, marcas, nem falas sobre "formato", "cruzamento" ou sobre o processo de criar o vídeo.
O vídeo é sobre um ASSUNTO, não sobre si mesmo.
Nunca inventas estatísticas, estudos ou notícias: se precisares de um exemplo, descreve-o como cenário hipotético.
Escreves em português europeu (pt-PT): "estás", "tens", "ecrã", "equipa", nunca "você".
Devolves SEMPRE JSON puro, sem markdown, sem comentários.`;

const user = `TEMA: ${TOPIC}

${fmtLine}
Número de cenas: ${SCENES}.
Apresentadoras disponíveis (alterna entre elas): ${PRESENTERS.join(', ')}.
Tom: ${TONE}.

Devolve exactamente este JSON:
{
  "kicker": "etiqueta curta em maiúsculas, 2-4 palavras",
  "scenes": [
    {
      "id": "s01",
      "avatar": "${PRESENTERS[0]}",
      "kicker": "ETIQUETA CURTA",
      "headline": "3 a 6 palavras em maiúsculas",
      "body": "uma frase de apoio, no máximo 12 palavras",
      "narration": "o que é dito em voz alta, 25 a 40 palavras, português europeu"
    }
  ]
}

Regras:
- A primeira cena é o gancho: prende em 3 segundos.
- A última cena fecha com uma ideia, não com "subscreve".
- Cada cena alterna a apresentadora quando fizer sentido.
- "narration" tem de soar natural falado, sem listas e sem parênteses.
- Nada de números inventados ou estatísticas falsas.
- Escreve apenas o JSON.`;

// ---------------------------------------------------------------- regra de ouro
// SO modelos FREE. Consulta o catalogo do OpenRouter e recusa qualquer outro.
const modelsRes = await fetch('https://openrouter.ai/api/v1/models', {
  headers: { authorization: 'Bearer ' + KEY },
});
const allModels = modelsRes.ok ? (await modelsRes.json()).data : [];
const isFree = (m) => {
  const p = m.pricing || {};
  const z = (x) => Number(x || 0) === 0;
  return z(p.prompt) && z(p.completion);
};
const freeIds = new Set(allModels.filter(isFree).map((m) => m.id));

// Ordem medida: estes responderam com JSON em testes reais.
const DEFAULT_CHAIN = [
  'cohere/north-mini-code:free',
  'liquid/lfm-3-1.7b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'dots-studio/dots-3-note-preview:free',
  'apodex/apodex-1.1-mini:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'openrouter/free',
].filter((id) => id === 'openrouter/free' || freeIds.has(id));

if (MODEL && MODEL !== 'openrouter/free' && !freeIds.has(MODEL)) {
  console.error('RECUSADO: "' + MODEL + '" nao e um modelo FREE. Regra de ouro: so modelos gratuitos.');
  console.error('Disponiveis: ' + Array.from(freeIds).slice(0, 12).join(', '));
  process.exit(2);
}

const chain = MODEL ? [MODEL].concat(DEFAULT_CHAIN.filter((m) => m !== MODEL)) : DEFAULT_CHAIN;

async function attempt(model) {
  const t = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + KEY,
      'content-type': 'application/json',
      'HTTP-Referer': 'http://127.0.0.1:8799',
      'X-Title': 'ArtCraft Script Writer',
    },
    body: JSON.stringify({
      model,
      temperature: Number(arg('temperature', '0.7')),
      max_tokens: 4000,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 160);
    // 429 = limite temporario do provedor; esperar e tentar de novo
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 4000));
      const retry = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + KEY,
          'content-type': 'application/json',
          'HTTP-Referer': 'http://127.0.0.1:8799',
          'X-Title': 'ArtCraft Script Writer',
        },
        body: JSON.stringify({
          model,
          temperature: Number(arg('temperature', '0.7')),
          max_tokens: 4000,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!retry.ok) {
        return { ok: false, model, ms: Date.now() - t, err: 'HTTP ' + res.status + ' (retry ' + retry.status + ')' };
      }
      const j2 = await retry.json();
      return finish(j2, model, t);
    }
    return { ok: false, model, ms: Date.now() - t, err: 'HTTP ' + res.status + ' ' + body };
  }

  const json = await res.json();
  return finish(json, model, t);
}

/** Valida e extrai o JSON de uma resposta do OpenRouter. */
function finish(json, model, t0) {
  let text = (json.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    const reason = json.choices?.[0]?.finish_reason || 'vazio';
    return { ok: false, model, ms: Date.now() - t0, err: 'resposta vazia (' + reason + ')' };
  }
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) text = text.slice(a, b + 1);
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) {
      return { ok: false, model, ms: Date.now() - t0, err: 'sem scenes' };
    }
    return { ok: true, model, ms: Date.now() - t0, script: parsed, usage: json.usage };
  } catch {
    return { ok: false, model, ms: Date.now() - t0, err: 'JSON invalido: ' + text.slice(0, 90) };
  }
}

let win = null;
for (const model of chain) {
  const r = await attempt(model);
  if (r.ok) {
    win = r;
    break;
  }
  console.error('  ' + model + ' -> ' + r.err + ' (' + r.ms + 'ms)');
}
if (!win) {
  console.error('nenhum modelo FREE respondeu com JSON valido.');
  process.exit(1);
}

const script0 = win.script;
let script = script0;

// normalizar
script.scenes = script.scenes.slice(0, SCENES).map((s, i) => ({
  id: s.id || 's' + String(i + 1).padStart(2, '0'),
  avatar: PRESENTERS.includes(s.avatar) ? s.avatar : PRESENTERS[i % PRESENTERS.length],
  kicker: String(s.kicker || script.kicker || '').toUpperCase(),
  headline: String(s.headline || '').toUpperCase(),
  body: String(s.body || ''),
  narration: String(s.narration || s.body || ''),
}));

const outFile = OUT || path.join(CC, 'work', 'clones', 'script-' + Date.now() + '.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(script, null, 2) + '\n', 'utf8');

const words = script.scenes.reduce((a, s) => a + s.narration.split(/\s+/).length, 0);
console.log('guiao     : ' + script.scenes.length + ' cenas · ' + words + ' palavras');
console.log('modelo    : ' + win.model + ' (FREE) · ' + win.ms + 'ms · ' +
  (win.usage ? win.usage.prompt_tokens + '+' + win.usage.completion_tokens + ' tokens' : 'sem usage'));
console.log('ficheiro  : ' + outFile);
console.log('');
for (const s of script.scenes) {
  console.log('  [' + s.id + '] ' + s.avatar + ' · ' + s.headline.slice(0, 40));
  console.log('        ' + s.narration.slice(0, 96) + (s.narration.length > 96 ? '…' : ''));
}
