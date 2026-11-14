// =============================================================================
// CONTRATO DE DIRECAO — FRIDA & LUNA STUDIO
// =============================================================================
//
// MANUAL DE USO
// -------------
// Proposito:
//   Este modulo e o contrato que liga o plano editorial (os beats p01..p28
//   produzidos pelo EDL) as duas apresentadoras. Ele responde a tres
//   perguntas por beat:
//
//     1. QUEM fala?          -> active_speaker ("frida" | "luna")
//     2. COM que emocao?     -> frida_state / luna_state (emotion, head_action,
//                                     eye_target, camera_framing, driving_template)
//     3. COM que enquadramento
//        e que banda?        -> camera_framing + top_band_visual
//
//   E o contrato que as fases seguintes obedecem:
//     F3 — os drivers procedurais sao escolhidos pela emocao (catalogo)
//     F4 — o compositor da banda inferior usa o enquadramento do beat
//     F5 — o TTS e o Wav2Lip usam o active_speaker para escolher a voz
//
// Parametros CLI:
//   Este modulo e uma biblioteca: nao tem CLI. O executavel que o usa e
//   .artcraft\yt-direcao.mjs (enriquece um plano e valida o contrato).
//
// Entradas:
//   Um "beat" no formato do EDL (.artcraft\yt-edl.mjs):
//     { id, parent, seconds, avatar, kicker, headline, body, text, narration,
//       framing, motion, ... }
//   E, opcionalmente, um contrato ja escrito a mao no proprio beat:
//     { active_speaker, frida_state, luna_state, top_band_visual }
//
// Saidas:
//   - normalizarDirecao(beat, opts)  -> um NOVO beat com o contrato completo
//   - aplicarDirecaoAoPlano(plano)   -> um NOVO plano com todos os beats
//   - validarDirecao(beat)            -> { ok, erros, avisos }
//   - resumoDirecao(plano)            -> { total, frida, luna, invalidos }
//
// Dependencias: nenhuma (so Node.js). Zero rede, zero GPU, zero ffmpeg.
//
// Regras de manutencao:
//   - NADA aqui muta o objecto recebido: os planos sao derivados do EDL e
//     nao podem ser alterados por um enricher.
//   - O que esta escrito a mao no beat vence sempre o valor inferido: a
//     direcao editorial e uma decisao humana, nao um palpite do modulo.
//   - Uma emocao fora do catalogo e um ERRO (nao um aviso): o F3 nao tem
//     driver para ela e o beat sairia com a cara parada.
// =============================================================================

/** Versao do contrato. Sobe quando a forma do JSON muda. */
export const VERSAO_CONTRATO = 1;

/** As duas apresentadoras. A ordem importa: [apresentadora, comentarista]. */
export const FALANTES = ['frida', 'luna'];

/**
 * Emocoes do catalogo. Todas tem de ter um driving template para cada
 * apresentadora (o catalogo e o que o F3 gera).
 */
export const EMOCOES = [
  'neutral',      // estado de repouso, respiracao
  'happy',        // sorriso largo
  'surprised',    // olhos arregalados, sobressalto
  'skeptical',    // uma sobrancelha levantada
  'excited',      // enfase, energia alta
  'serious',      // tom de noticia, boca firme
  'curious',      // interrogacao, olhos para a colega
  'ironic',       // ce Levantado, canto da boca
  'listening',    // a colega calada, a escutar
];

/**
 * Onde cada apresentadora pode olhar.
 * "frida" e "luna" sao aceite porque o Prompt Mestre usa o nome da colega
 * ("eye_target": "frida"); o canonico seria "cohost".
 */
export const ALVOS_OLHAR = ['camera', 'cohost', 'graphic_top', 'down', 'frida', 'luna'];

/** Enquadramentos da banda inferior (1080x826). */
export const ENQUADRAMENTOS = ['medium_closeup', 'closeup', 'dual_desk', 'wide'];

/** Accoes de cabeca que o driver procedural sabe fazer. */
export const ACCOES_CABECA = [
  'nod',              // aceno vertical
  'tilt_left_12deg',  // inclinacao de cao (Luna)
  'tilt_right_12deg',
  'shake',            // negacao
  'listen',           // quieta, a escutar
  'still',            // purposefully parada (pausa dramatica)
];

/** Motores da banda superior. "effectcraft" e o oficial. */
export const MOTORES_BANDA = ['effectcraft', 'remotion', 'figcraft'];

/** Pasta onde o F3 deposita os drivers procedurais. */
export const PASTA_DRIVERS = 'work/avatars/driving_templates';

/**
 * Catalogo emocao -> driving template.
 *
 * E a ponte entre o contrato e o F3: o beat pede uma EMOCAO e o F3 sabe
 * que ficheiro concreto animate aquela emocao para cada apresentadora.
 */
export const CATALOGO_DRIVERS = {
  frida: {
    neutral: 'frida_anchor_neutral_breathing.mp4',
    happy: 'frida_anchor_emphatic_nod.mp4',
    surprised: 'frida_anchor_emphatic_nod.mp4',
    skeptical: 'frida_anchor_neutral_breathing.mp4',
    excited: 'frida_anchor_emphatic_nod.mp4',
    serious: 'frida_anchor_neutral_breathing.mp4',
    curious: 'frida_anchor_neutral_breathing.mp4',
    ironic: 'frida_anchor_neutral_breathing.mp4',
    listening: 'frida_listening_to_luna.mp4',
  },
  luna: {
    neutral: 'luna_cohost_listening_react.mp4',
    happy: 'luna_cohost_listening_react.mp4',
    surprised: 'luna_cohost_curious_headtilt.mp4',
    skeptical: 'luna_cohost_skeptical_ironic.mp4',
    excited: 'luna_cohost_curious_headtilt.mp4',
    serious: 'luna_cohost_listening_react.mp4',
    curious: 'luna_cohost_curious_headtilt.mp4',
    ironic: 'luna_cohost_skeptical_ironic.mp4',
    listening: 'luna_cohost_listening_react.mp4',
  },
};

/**
 * A acao de cabeca de cada apresentadora quando fala.
 * A Frida e a ancora: acena. A Luna e a comentaria: inclina a cabeca.
 */
const ACOES_FALANDO = { frida: 'nod', luna: 'tilt_left_12deg' };

/**
 * Enquadramento de cada apresentadora quando esta a falar / a escutar.
 */
const ENQUADRAMENTOS_FALANDO = 'medium_closeup';
const ENQUADRAMENTOS_ESCUTA = 'dual_desk';

/** O texto de um beat, por ordem de prioridade: fala, depois titulo. */
function textoDoBeat(beat) {
  return String((beat && (beat.narration || beat.text || beat.headline)) || '');
}

/**
 * Quem fala neste beat.
 *
 * Ordem de precedencia (a mais forte primeiro):
 *   1. `active_speaker` escrito no beat  -> decisao editorial explicita.
 *   2. `avatar` do EDL                   -> o guiao ja diz quem esta no ar.
 *      (Nos dados reais do edl-ref5: p01..p08 e p18..p23 sao da Frida —
 *       abertura e analise; p09..p17 e p24..p28 sao da Luna — comentario e
 *       fecho. Alternar por posicao punha a Luna a falar na apresentacao
 *       da Frida, que e o oposto do guiao.)
 *   3. Regra do plano, quando o beat nao traz nenhum dos dois: a
 *      apresentadora nos indices pares, a comentarista nos impares, e o
 *      fecho (ultimo beat) sempre da apresentadora.
 *
 * @param {object} beat        o beat do EDL
 * @param {number} indice      posicao do beat no plano (0 = primeiro)
 * @param {number} total       numero total de beats do plano
 * @param {string[]} falantes  [apresentadora, comentarista]
 * @returns {string}           o id da apresentadora que fala
 */
export function inferirFalante(beat, indice, total, falantes = FALANTES) {
  const lista = Array.isArray(falantes) && falantes.length >= 2 ? falantes : FALANTES;

  // 1) decisao editorial explicita: manda.
  const explicito = beat && beat.active_speaker;
  if (explicito && lista.includes(String(explicito))) return String(explicito);

  // 2) o avatar do EDL: e a decisao do guiao, nao um palpite.
  const doEDL = beat && beat.avatar;
  if (doEDL && lista.includes(String(doEDL))) return String(doEDL);

  // 3) regra do plano: a apresentadora nos indices pares, a comentarista
  //    nos impares. O ultimo beat volta a ser da apresentadora (fecha).
  const i = Number(indice) || 0;
  const ultimo = Number(total) > 0 && i === Number(total) - 1;
  if (ultimo) return lista[0];
  return i % 2 === 0 ? lista[0] : lista[1];
}

/**
 * Emocao inferida da pontuacao da fala.
 *
 * E uma inferencia CONSERVADORA: so a pontuacao e lida. "!" e enfase,
 * "?" e uma pergunta (a Frida duvida, a Luna pergunta). Sem pontuacao a
 * apresentadora fica neutra — e sempre melhor um "neutral" do que uma
 * emocao errada.
 *
 * @param {object} beat     o beat
 * @param {string} falante  quem fala
 * @returns {string}        uma emocao do catalogo
 */
export function inferirEmocao(beat, falante) {
  const texto = textoDoBeat(beat);
  if (texto.includes('!')) return 'excited';
  if (texto.includes('?')) return falante === 'luna' ? 'curious' : 'skeptical';
  return 'neutral';
}

/**
 * Estado por omissao de uma apresentadora.
 *
 * @param {string} falante  'frida' | 'luna'
 * @param {object} opts     { emocao, olhaPara, enquadramento, accao }
 * @returns {object}        o estado no formato do contrato (sem driver)
 */
function estadoBase(falante, opts) {
  const emocao = opts.emocao || 'neutral';
  return {
    emotion: emocao,
    driving_template: '',
    head_action: opts.accao || 'still',
    eye_target: opts.olhaPara || 'camera',
    camera_framing: opts.enquadramento || ENQUADRAMENTOS_FALANDO,
  };
}

/**
 * Normaliza um beat: acrescenta o contrato de direcao completo.
 *
 * O que o beat ja traz (decisao editorial) vence sempre o que e inferido.
 * O objecto original NAO e alterado.
 *
 * @param {object} beat    o beat do EDL
 * @param {object} opts    { indice, total, falantes, motorBanda, presetBanda }
 * @returns {object}       um NOVO beat com o contrato preenchido
 */
export function normalizarDirecao(beat, opts = {}) {
  const base = beat && typeof beat === 'object' ? beat : {};
  const falantes = Array.isArray(opts.falantes) && opts.falantes.length >= 2 ? opts.falantes : FALANTES;
  const indice = Number(opts.indice) || 0;
  const total = Number(opts.total) || 0;

  const ativo = inferirFalante(base, indice, total, falantes);
  const colega = falantes.find((f) => f !== ativo) || falantes[1];

  // ---- estado por omissao de cada apresentadora:
  //      quem fala olha para a camara e tem emocao; quem escuta olha para
  //      a colega e fica neutra.
  const estadoPorOmissao = (falante) => {
    if (falante === ativo) {
      return estadoBase(falante, {
        emocao: inferirEmocao(base, ativo),
        olhaPara: 'camera',
        enquadramento: ENQUADRAMENTOS_FALANDO,
        accao: ACOES_FALANDO[ativo] || 'nod',
      });
    }
    return estadoBase(falante, {
      emocao: 'listening',
      olhaPara: 'cohost',
      enquadramento: ENQUADRAMENTOS_ESCUTA,
      accao: 'listen',
    });
  };

  // ---- o que foi escrito a mao no beat vence a inferencia
  const estadoFinal = (falante, escrito) => {
    const merged = Object.assign({}, estadoPorOmissao(falante), escrito && typeof escrito === 'object' ? escrito : {});
    // O driver e derivado da EMOCAO FINAL (nao da inferida): se o autor
    // escreveu "ironic" a mao, o driver tem de ser o ironic, e nao o da
    // emocao que a pontuacao tinha sugerido.
    const driver = (CATALOGO_DRIVERS[falante] && CATALOGO_DRIVERS[falante][merged.emotion]) ||
      CATALOGO_DRIVERS[falante].neutral;
    if (!merged.driving_template) merged.driving_template = PASTA_DRIVERS + '/' + driver;
    return merged;
  };

  const fridaState = estadoFinal('frida', base.frida_state);
  const lunaState = estadoFinal('luna', base.luna_state);

  // ---- banda superior
  const bandaEscrita = base.top_band_visual && typeof base.top_band_visual === 'object'
    ? base.top_band_visual : {};
  const topBand = Object.assign({
    engine: opts.motorBanda || 'effectcraft',
    preset: opts.presetBanda || 'E2_caption_top',
    broll_query: '',
  }, bandaEscrita);

  return Object.assign({}, base, {
    active_speaker: ativo,
    frida_state: fridaState,
    luna_state: lunaState,
    top_band_visual: topBand,
  });
}

/**
 * Valida o contrato de um beat.
 *
 * Erros = o beat nao pode ser animado como esta (bloqueiam a fase).
 * Avisos = o beat pode ser animado, mas ha algo a melhorar.
 *
 * @param {object} beat  o beat (ja normalizado, ou nao)
 * @returns {{ok: boolean, erros: string[], avisos: string[]}}
 */
export function validarDirecao(beat) {
  const erros = [];
  const avisos = [];
  const b = beat && typeof beat === 'object' ? beat : {};

  // ---- falante activo
  if (!b.active_speaker) {
    erros.push('active_speaker em falta');
  } else if (!FALANTES.includes(String(b.active_speaker))) {
    erros.push('active_speaker invalido: "' + b.active_speaker + '" (esperado: ' + FALANTES.join(' | ') + ')');
  }

  // ---- estados das apresentadoras
  for (const nome of ['frida_state', 'luna_state']) {
    const estado = b[nome];
    if (!estado || typeof estado !== 'object') {
      erros.push(nome + ' em falta');
      continue;
    }
    if (!EMOCOES.includes(String(estado.emotion))) {
      erros.push(nome + '.emotion invalida: "' + estado.emotion + '" (catalogo: ' + EMOCOES.join(' | ') + ')');
    }
    if (!ALVOS_OLHAR.includes(String(estado.eye_target))) {
      erros.push(nome + '.eye_target invalido: "' + estado.eye_target + '"');
    }
    if (!ACCOES_CABECA.includes(String(estado.head_action))) {
      erros.push(nome + '.head_action invalida: "' + estado.head_action + '"');
    }
    if (!ENQUADRAMENTOS.includes(String(estado.camera_framing))) {
      erros.push(nome + '.camera_framing invalido: "' + estado.camera_framing + '"');
    }
    if (!estado.driving_template) {
      avisos.push(nome + '.driving_template em falta (o F3 ainda nao o gerou)');
    }
  }

  // ---- banda superior
  const banda = b.top_band_visual;
  if (!banda || typeof banda !== 'object') {
    erros.push('top_band_visual em falta');
  } else {
    if (!MOTORES_BANDA.includes(String(banda.engine))) {
      erros.push('top_band_visual.engine invalido: "' + banda.engine + '" (permitidos: ' + MOTORES_BANDA.join(' | ') + ')');
    }
    if (!banda.preset) avisos.push('top_band_visual.preset em falta');
  }

  return { ok: erros.length === 0, erros, avisos };
}

/**
 * Enquadramento do beat: a regra que a F4 vai obedecer.
 *
 * Plano duplo na abertura (as duas juntas) e sempre que o EDL estava a
 * mostrar outra apresentadora; close-up quando o beat ja pedia a mesma
 * apresentadora que vai falar (o EDL acertou a quem estava no ar).
 *
 * @param {object} beat   o beat (com active_speaker)
 * @param {number} indice posicao no plano (0 = abertura)
 * @returns {string}      'dual_desk' | 'closeup'
 */
export function enquadramentoDoBeat(beat, indice) {
  const b = beat || {};
  if (Number(indice) === 0) return 'dual_desk';
  if (b.avatar && b.active_speaker && b.avatar === b.active_speaker) return 'closeup';
  return 'dual_desk';
}

/**
 * Enriquece um plano inteiro com o contrato de direcao.
 *
 * O plano original nao e tocado: devolve um plano novo.
 *
 * @param {object} plano  { version, kicker, scenes: [...] , ... }
 * @param {object} opts   { falantes, motorBanda, presetBanda }
 * @returns {object}      um NOVO plano
 */
export function aplicarDirecaoAoPlano(plano, opts = {}) {
  const p = plano && typeof plano === 'object' ? plano : {};
  const scenes = Array.isArray(p.scenes) ? p.scenes : [];
  const total = scenes.length;
  const scenesComDirecao = scenes.map((s, i) => normalizarDirecao(s, {
    indice: i,
    total,
    falantes: opts.falantes,
    motorBanda: opts.motorBanda,
    presetBanda: opts.presetBanda,
  }));
  return Object.assign({}, p, { scenes: scenesComDirecao });
}

/**
 * Sobrepoe a direccao EDITORIAL (escrita a mao) a um plano ja enriquecido.
 *
 * O ficheiro editorial e um mapa por id de beat:
 *   {
 *     "p01": {
 *       "active_speaker": "frida",
 *       "frida_state": { "emotion": "happy", "eye_target": "camera" },
 *       "luna_state":  { "emotion": "listening", "eye_target": "frida" }
 *     }
 *   }
 *
 * Os estados sao fundidos CAMPO A CAMPO: o que a editorial nao escreve
 * mantem o valor inferido. E assim que o operador mexe so na emocao de um
 * beat sem perder o olhar nem a accao de cabeca.
 *
 * @param {object} plano     o plano ja enriquecido
 * @param {object} editorial o mapa de decisoes por id de beat
 * @param {object} opts      { falantes } (passado a normalizarDirecao)
 * @returns {{plano: object, ignorados: string[]}}  o NOVO plano e os ids
 *           editoriais que nao corresponde a nenhum beat
 */
export function aplicarDirecaoEditorial(plano, editorial, opts = {}) {
  const p = plano && typeof plano === 'object' ? plano : {};
  const decisoes = editorial && typeof editorial === 'object' ? editorial : {};
  const scenes = Array.isArray(p.scenes) ? p.scenes : [];
  const ignorados = [];

  const novasScenes = scenes.map((beat, indiceBeat) => {
    const d = decisoes[beat && beat.id];
    if (!d || typeof d !== 'object') return beat;

    // ---- o falante pode ser trocado: e a decisao mais forte de todas.
    const trocouFalante = d.active_speaker && d.active_speaker !== beat.active_speaker;
    const novo = Object.assign({}, beat);
    if (trocouFalante) {
      // Reconstroi o beat pela propria inferencia: quem passa a falar
      // passa a ter emocao, olhar para a camara e o driver DELA; a outra
      // passa a estar a escutar. Sem isto, a nova falante ficava com o
      // estado de quem ouvia (emocao 'listening', driver de escuta).
      novo.active_speaker = d.active_speaker;
      // O beat vai para a inferencia SEM os estados antigos: normalizarDirecao
      // trata qualquer estado ja presente como "escrito a mao" e preserva-o.
      // Sem esta limpeza, a nova falante ficava com a emocao de quem
      // falava antes.
      const semEstados = Object.assign({}, beat);
      delete semEstados.frida_state;
      delete semEstados.luna_state;
      const reconstruido = normalizarDirecao(
        Object.assign({}, semEstados, { active_speaker: d.active_speaker }),
        {
          indice: indiceBeat,
          total: scenes.length,
          falantes: opts.falantes,
        }
      );
      novo.frida_state = reconstruido.frida_state;
      novo.luna_state = reconstruido.luna_state;
      novo.top_band_visual = reconstruido.top_band_visual;
    }
    // ---- os estados escritos a mao vem por cima (campo a campo)
    for (const nome of ['frida_state', 'luna_state']) {
      const escrito = d[nome];
      if (escrito && typeof escrito === 'object') {
        novo[nome] = Object.assign({}, novo[nome], escrito);
      }
    }
    // ---- o driver tem de acompanhar a EMOCAO FINAL.
    // A inferencia ja escolheu o driver pela emocao inferida; quando a
    // editorial muda a emocao (ou troca quem fala), esse driver deixa de
    // servir. Aqui refaz-se a ligacao emocao -> driver — sem esquecer um
    // driver escrito a mao, que e uma decisao explicita.
    for (const nome of ['frida_state', 'luna_state']) {
      const falante = nome === 'frida_state' ? 'frida' : 'luna';
      const estado = novo[nome];
      if (!estado || typeof estado !== 'object') continue;
      const escrito = (d[nome] && typeof d[nome] === 'object') ? d[nome] : {};
      if (escrito.driving_template) continue; // driver escrito a mao: manda
      const driver = (CATALOGO_DRIVERS[falante] && CATALOGO_DRIVERS[falante][estado.emotion]) ||
        CATALOGO_DRIVERS[falante].neutral;
      estado.driving_template = PASTA_DRIVERS + '/' + driver;
    }
    if (d.top_band_visual && typeof d.top_band_visual === 'object') {
      novo.top_band_visual = Object.assign({}, beat.top_band_visual, d.top_band_visual);
    }
    // ---- o plano do beat (closeup / dual_desk) tambem e uma decisao
    //      editorial: sem isto, o operador so conseguia escolher entre
    //      beats, nunca forcar o enquadramento de uma cena.
    if (d.camera_framing && ENQUADRAMENTOS.includes(String(d.camera_framing))) {
      novo.camera_framing = String(d.camera_framing);
    }
    return novo;
  });

  // ---- ids editoriais sem beat correspondente: nao e erro silencioso.
  // As chaves que comecam por "_" sao documentacao do ficheiro (manuais,
  // catalogos) e nao decisoes de beat.
  for (const id of Object.keys(decisoes)) {
    if (id.startsWith('_')) continue;
    if (!scenes.some((s) => s && s.id === id)) ignorados.push(id);
  }

  return { plano: Object.assign({}, p, { scenes: novasScenes }), ignorados };
}

/**
 * Enquadramentos de um plano inteiro: a REGRA DA ALTERNANCIA DINAMICA.
 *
 * O plano divide-se em BLOCOS de falante (beats seguidos de quem fala).
 * Em cada bloco:
 *   - o primeiro beat e em PLANO DUPLO (a nova falante entra e a outra
 *     reage ao lado);
 *   - o ultimo beat e em PLANO DUPLO (a passagem de testemunho);
 *   - os beats do meio sao CLOSE-UP da falante activa.
 *
 * Com os dados do edl-ref5 (abertura Frida, comentario Luna, analise
 * Frida, fecho Luna) da 4 blocos: 8 beats em plano duplo e 20 em
 * close-up. E a alternancia que o utilizador pediu ("1.2 B"): plano
 * duplo nas reacoes, close-up na falante activa.
 *
 * @param {object} plano  o plano ja enriquecido (com active_speaker)
 * @returns {string[]}    o enquadramento de cada beat, pela ordem
 */
export function enquadramentosDoPlano(plano) {
  const scenes = (plano && Array.isArray(plano.scenes)) ? plano.scenes : [];
  if (!scenes.length) return [];

  // ---- limites de cada bloco de falante
  const inicio = [];
  const fim = [];
  let i = 0;
  while (i < scenes.length) {
    const falante = scenes[i].active_speaker;
    let j = i;
    while (j + 1 < scenes.length && scenes[j + 1].active_speaker === falante) j++;
    inicio.push(i);
    fim.push(j);
    i = j + 1;
  }

  const resultado = new Array(scenes.length);
  for (let k = 0; k < inicio.length; k++) {
    for (let b = inicio[k]; b <= fim[k]; b++) {
      const entrada = b === inicio[k];
      const saida = b === fim[k];
      resultado[b] = (entrada || saida) ? 'dual_desk' : 'closeup';
    }
  }
  return resultado;
}

/**
 * Resumo do contrato: quem fala, quantos beats, quantos invalidos.
 *
 * @param {object} plano  o plano ja enriquecido
 * @returns {{total: number, frida: number, luna: number, invalidos: number}}
 */
export function resumoDirecao(plano) {
  const scenes = (plano && Array.isArray(plano.scenes)) ? plano.scenes : [];
  let frida = 0;
  let luna = 0;
  let invalidos = 0;
  for (const s of scenes) {
    if (s.active_speaker === 'frida') frida++;
    else if (s.active_speaker === 'luna') luna++;
    if (!validarDirecao(s).ok) invalidos++;
  }
  return { total: scenes.length, frida, luna, invalidos };
}
