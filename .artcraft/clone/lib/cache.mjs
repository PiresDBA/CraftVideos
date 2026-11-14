/**
 * Cache de audio sintetizado.
 *
 * Porquê: sem cache, cada rebuild voltava a chamar a API de TTS e a refazer o
 * Wav2Lip — mesmo com o guiao intacto. Como a narração é a parte mais lenta
 * (e a que gasta quota), o cache é guardado **com a impressão digital do
 * texto e da voz**: se o guiao ou a voz mudarem, o audio é refeito; se nada
 * mudou, reusa-se o ficheiro e o resto do pipeline continua a correr depressa.
 *
 * A impressão digital nunca inclui chaves de API: só descreve *o que* foi
 * falado e *com que voz*.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Hash curto e estavel de um texto (NFC para nao duplicar por acentos). */
export function hashText(text) {
  return crypto
    .createHash('sha256')
    .update(String(text || '').normalize('NFC'))
    .digest('hex')
    .slice(0, 16);
}

/** Campos da voz que mudam o audio — e nada mais (nunca chaves). */
const VOICE_FIELDS = [
  'voice', 'voiceName', 'provider', 'language', 'style', 'speed', 'pitch',
  'rate', 'profile', 'ttsModel',
];

/**
 * Impressao digital de uma locucao: texto + motor + voz + polimento.
 * Se qualquer um destes mudar, o audio tem de ser refeito.
 *
 * O polimento entra com a **cadeia** (EQ/compressor/de-esser/...), nao com um
 * booleano: mudar o EQ muda o master e tem de invalidar o cache.
 */
export function narrationFingerprint(text, opts = {}) {
  const voice = {};
  const v = opts.voice || {};
  for (const key of VOICE_FIELDS) {
    if (v[key] !== undefined && v[key] !== null && v[key] !== '') voice[key] = v[key];
  }
  const payload = [
    hashText(text),
    String(opts.engine || ''),
    hashText(JSON.stringify(voice)),
    hashText(JSON.stringify(opts.polish || null)),
  ].join('|');
  return hashText(payload);
}

/** Onde fica o registo do cache de uma cena. */
export function narrationCachePath(audioDir, name) {
  return path.join(audioDir, name + '.narration-cache.json');
}

/**
 * Le o cache de uma cena.
 *
 * Devolve null quando: nao existe registo, o texto/voz mudou, o ficheiro de
 * audio desapareceu ou ficou demasiado pequeno para ser audio util.
 */
export function readNarrationCache(audioDir, name, fingerprint) {
  const file = narrationCachePath(audioDir, name);
  if (!fs.existsSync(file)) return null;
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!rec || rec.fingerprint !== fingerprint) return null;
  if (!rec.file || !fs.existsSync(rec.file)) return null;
  try {
    if (fs.statSync(rec.file).size < 1000) return null;
  } catch {
    return null;
  }
  return {
    file: rec.file,
    duration: Number(rec.duration) || 0,
    engine: rec.engine || '',
  };
}

/**
 * Grava o registo do cache.
 *
 * Guarda o caminho **absoluto** do audio produzido: o masterizado
 * (`.master.wav`) quando o polimento correu, o original caso contrario.
 */
export function writeNarrationCache(audioDir, name, fingerprint, audioFile, duration, engine) {
  const file = narrationCachePath(audioDir, name);
  const rec = {
    fingerprint,
    file: path.resolve(audioFile),
    duration: Number(duration) || 0,
    engine: engine || '',
    createdAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(file, JSON.stringify(rec, null, 2), 'utf8');
  } catch {
    /* cache e' uma optimizacao: falhar aqui nao pode partir o build */
  }
  return file;
}
