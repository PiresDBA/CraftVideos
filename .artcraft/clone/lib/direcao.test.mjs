// =============================================================================
// TESTES DO CONTRATO DE DIRECAO (FRIDA & LUNA STUDIO)
// =============================================================================
//
// MANUAL DE USO
// -------------
// O que este ficheiro prova:
//   O modulo direcao.mjs e o contrato que liga o plano editorial (os beats
//   p01..p28) as duas apresentadoras. Ele decide QUEM fala, COM que emocao,
//   para ONDE olham e COM que enquadramento aparece cada uma.
//
// Porquê que o contrato precisa de testes:
//   O contrato vai ser consumido por tres fases (F3 drivers, F4 layout,
//   F5 dialogo). Um valor silenciosamente errado (uma emocao invalida, um
//   falante que nao existe) nao rebenta nada: o video sai com a apresentadora
//   errada a falar. O unico sitio onde isto se apanha e aqui.
//
// Como correr:
//   node --test ".artcraft/clone/lib/*.test.mjs"
//
// Dependencias: apenas Node.js (nada de rede, nada de GPU, nada de ffmpeg).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALANTES,
  EMOCOES,
  ALVOS_OLHAR,
  ENQUADRAMENTOS,
  ACCOES_CABECA,
  MOTORES_BANDA,
  CATALOGO_DRIVERS,
  PASTA_DRIVERS,
  inferirFalante,
  inferirEmocao,
  normalizarDirecao,
  validarDirecao,
  aplicarDirecaoAoPlano,
  aplicarDirecaoEditorial,
  enquadramentoDoBeat,
  enquadramentosDoPlano,
  resumoDirecao,
} from './direcao.mjs';

/** Beat minimo, com a forma que o EDL (yt-edl.mjs) produz. */
function beat(id, extra = {}) {
  return {
    id,
    parent: 's01',
    seconds: 2,
    layout: 'full',
    textSide: 'bottom',
    avatar: 'frida',
    kicker: 'DARK - IA',
    headline: 'O QUE ELES NAO CONTAM',
    body: 'Canal 100% IA.',
    text: 'O QUE ELES NAO CONTAM',
    narration: 'Ola,',
    framing: 'wide',
    motion: { kenBurns: { from: 1, to: 1.06 } },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// As constantes do contrato
// ---------------------------------------------------------------------------

test('o contrato declara as duas apresentadoras', () => {
  assert.deepEqual(FALANTES, ['frida', 'luna']);
});

test('o contrato declara as emocoes do catalogo de drivers', () => {
  for (const e of ['neutral', 'happy', 'surprised', 'skeptical', 'excited', 'serious', 'curious', 'listening']) {
    assert.ok(EMOCOES.includes(e), 'emocao em falta no contrato: ' + e);
  }
});

test('o contrato aceita olhar para a camara, para a colega, para a banda ou para baixo', () => {
  for (const a of ['camera', 'cohost', 'graphic_top', 'down']) {
    assert.ok(ALVOS_OLHAR.includes(a), 'alvo de olhar em falta: ' + a);
  }
  // o nome da colega tambem e aceite (exemplo do Prompt Mestre: "frida")
  assert.ok(ALVOS_OLHAR.includes('frida'));
  assert.ok(ALVOS_OLHAR.includes('luna'));
});

test('o contrato declara os enquadramentos e as accoes de cabeca', () => {
  assert.ok(ENQUADRAMENTOS.includes('medium_closeup'));
  assert.ok(ENQUADRAMENTOS.includes('closeup'));
  assert.ok(ENQUADRAMENTOS.includes('dual_desk'));
  assert.ok(ACCOES_CABECA.includes('nod'));
  assert.ok(ACCOES_CABECA.includes('tilt_left_12deg'));
  assert.ok(ACCOES_CABECA.includes('listen'));
});

test('o contrato so aceita os motores de banda conhecidos', () => {
  assert.ok(MOTORES_BANDA.includes('effectcraft'));
  assert.ok(MOTORES_BANDA.includes('remotion'));
  assert.ok(MOTORES_BANDA.includes('figcraft'));
});

test('cada emocao do catalogo tem um driving template para cada apresentadora', () => {
  for (const f of FALANTES) {
    for (const e of EMOCOES) {
      const t = CATALOGO_DRIVERS[f] && CATALOGO_DRIVERS[f][e];
      assert.ok(t, 'sem driving template para ' + f + '/' + e);
      assert.ok(t.endsWith('.mp4'), 'o template tem de ser um mp4: ' + t);
    }
  }
  assert.equal(PASTA_DRIVERS, 'work/avatars/driving_templates');
});

// ---------------------------------------------------------------------------
// Inferencia do falante
// ---------------------------------------------------------------------------

test('inferirFalante alterna Frida e Luna e o ultimo beat e da Frida', () => {
  // Sem `avatar` no beat (planos que nao trazem o EDL): alterna por
  // posicao, e o fecho e sempre da apresentadora.
  const semAvatar = (id) => { const b = beat(id); delete b.avatar; return b; };
  assert.equal(inferirFalante(semAvatar('p01'), 0, 28), 'frida');
  assert.equal(inferirFalante(semAvatar('p02'), 1, 28), 'luna');
  assert.equal(inferirFalante(semAvatar('p03'), 2, 28), 'frida');
  // o fecho e sempre da apresentadora principal
  assert.equal(inferirFalante(semAvatar('p28'), 27, 28), 'frida');
});

test('inferirFalante respeita o avatar do EDL (o guiao ja diz quem fala)', () => {
  // DADOS REAIS do edl-ref5: p01..p08 e p18..p23 sao da Frida (abertura e
  // analise), p09..p17 e p24..p28 sao da Luna (comentario e fecho).
  // Alternar por posicao punha a Luna a falar na apresentacao da Frida.
  assert.equal(inferirFalante(beat('p02', { avatar: 'frida' }), 1, 28), 'frida');
  assert.equal(inferirFalante(beat('p10', { avatar: 'luna' }), 9, 28), 'luna');
  assert.equal(inferirFalante(beat('p28', { avatar: 'luna' }), 27, 28), 'luna');
});

test('inferirFalante respeita um active_speaker explicito', () => {
  assert.equal(inferirFalante(beat('p05', { active_speaker: 'luna' }), 4, 28), 'luna');
});

test('inferirFalante ignora um active_speaker invalido', () => {
  // nao pode rebentar: volta a inferir
  assert.equal(inferirFalante(beat('p05', { active_speaker: 'nina' }), 4, 28), 'frida');
});

test('inferirFalante aceita uma lista de falantes alternativa (o primeiro e a apresentadora)', () => {
  // A lista e ordenada: [apresentadora, comentarista]. Com ['luna','frida']
  // a Luna e a apresentadora e a Frida a comentarista.
  // (sem `avatar`, para exercitar a regra de posicao e nao a do EDL)
  const semAvatar = (id) => { const b = beat(id); delete b.avatar; return b; };
  assert.equal(inferirFalante(semAvatar('p01'), 0, 28, ['luna', 'frida']), 'luna');
  assert.equal(inferirFalante(semAvatar('p02'), 1, 28, ['luna', 'frida']), 'frida');
});

// ---------------------------------------------------------------------------
// Inferencia de emocao
// ---------------------------------------------------------------------------

test('inferirEmocao le a pontuacao da fala', () => {
  assert.equal(inferirEmocao(beat('p01', { narration: 'Ola!' }), 'frida'), 'excited');
  assert.equal(inferirEmocao(beat('p01', { narration: 'Sera mesmo?' }), 'frida'), 'skeptical');
  assert.equal(inferirEmocao(beat('p01', { narration: 'Sera mesmo?' }), 'luna'), 'curious');
  assert.equal(inferirEmocao(beat('p01', { narration: 'Ola.' }), 'frida'), 'neutral');
});

test('inferirEmocao usa o texto do titulo quando a fala esta vazia', () => {
  assert.equal(inferirEmocao(beat('p01', { narration: '', text: 'INCRIVEL!' }), 'frida'), 'excited');
});

test('inferirEmocao nunca devolve uma emocao fora do contrato', () => {
  for (const fala of ['', 'Ola', '?!', 'E que mais?!']) {
    for (const f of FALANTES) {
      assert.ok(EMOCOES.includes(inferirEmocao(beat('p01', { narration: fala }), f)), 'emocao invalida: ' + fala);
    }
  }
});

// ---------------------------------------------------------------------------
// Normalizacao de um beat
// ---------------------------------------------------------------------------

test('normalizarDirecao preenche o contrato completo de um beat vazio', () => {
  const out = normalizarDirecao(beat('p01'), { indice: 0, total: 28 });
  assert.equal(out.active_speaker, 'frida');
  assert.ok(out.frida_state, 'falta o estado da Frida');
  assert.ok(out.luna_state, 'falta o estado da Luna');
  assert.ok(out.top_band_visual, 'falta a indicacao da banda superior');
  assert.equal(out.frida_state.eye_target, 'camera');
  assert.equal(out.luna_state.eye_target, 'cohost');
  assert.equal(out.luna_state.emotion, 'listening');
  assert.equal(out.luna_state.head_action, 'listen');
});

test('normalizarDirecao nao muta o beat original', () => {
  const original = beat('p01');
  const copia = JSON.parse(JSON.stringify(original));
  normalizarDirecao(original, { indice: 0, total: 28 });
  assert.deepEqual(original, copia);
});

test('normalizarDirecao preserva os campos do EDL (retrocompatibilidade)', () => {
  const out = normalizarDirecao(beat('p07'), { indice: 6, total: 28 });
  assert.equal(out.id, 'p07');
  assert.equal(out.parent, 's01');
  assert.equal(out.avatar, 'frida');
  assert.equal(out.narration, 'Ola,');
  assert.equal(out.headline, 'O QUE ELES NAO CONTAM');
  assert.deepEqual(out.motion, { kenBurns: { from: 1, to: 1.06 } });
});

test('normalizarDirecao nao sobrescreve um estado ja escrito a mao', () => {
  const out = normalizarDirecao(
    beat('p03', {
      luna_state: { emotion: 'ironic', eye_target: 'graphic_top', head_action: 'tilt_left_12deg' },
    }),
    { indice: 2, total: 28 }
  );
  assert.equal(out.luna_state.emotion, 'ironic');
  assert.equal(out.luna_state.eye_target, 'graphic_top');
  assert.equal(out.luna_state.head_action, 'tilt_left_12deg');
  // e os campos que nao foram escritos entram por omissao
  assert.equal(out.luna_state.camera_framing, 'dual_desk');
});

test('normalizarDirecao escreve o caminho do driving template', () => {
  const out = normalizarDirecao(beat('p01'), { indice: 0, total: 28 });
  assert.ok(out.frida_state.driving_template.startsWith(PASTA_DRIVERS));
  assert.ok(out.frida_state.driving_template.endsWith('.mp4'));
});

test('normalizarDirecao aceita a apresentadora activa ja escrita', () => {
  const out = normalizarDirecao(beat('p02', { active_speaker: 'luna' }), { indice: 1, total: 28 });
  assert.equal(out.active_speaker, 'luna');
  // quem fala olha para a camara; quem escuta olha para a colega
  assert.equal(out.luna_state.eye_target, 'camera');
  assert.equal(out.frida_state.eye_target, 'cohost');
  assert.equal(out.frida_state.emotion, 'listening');
});

// ---------------------------------------------------------------------------
// Validacao
// ---------------------------------------------------------------------------

test('validarDirecao aceita um beat normalizado', () => {
  const out = normalizarDirecao(beat('p01'), { indice: 0, total: 28 });
  const r = validarDirecao(out);
  assert.equal(r.ok, true, 'erros: ' + JSON.stringify(r.erros));
  assert.deepEqual(r.erros, []);
});

test('validarDirecao apanha um falante que nao existe', () => {
  // Beat completo com SO o falante trocado: a validacao tem de apontar
  // exactamente um erro (nada mais, nada menos).
  const out = normalizarDirecao(beat('p01'), { indice: 0, total: 28 });
  out.active_speaker = 'nina';
  const r = validarDirecao(out);
  assert.equal(r.ok, false);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /active_speaker/);
});

test('validarDirecao apanha as partes do contrato que faltam', () => {
  const r = validarDirecao({ ...beat('p01'), active_speaker: 'frida' });
  assert.equal(r.ok, false);
  // sem estados nem banda sao tres coisas em falta
  assert.equal(r.erros.length, 3);
  assert.ok(r.erros.some((e) => /frida_state/.test(e)));
  assert.ok(r.erros.some((e) => /luna_state/.test(e)));
  assert.ok(r.erros.some((e) => /top_band_visual/.test(e)));
});

test('validarDirecao apanha uma emocao fora do catalogo', () => {
  const out = normalizarDirecao(beat('p01'), { indice: 0, total: 28 });
  out.luna_state.emotion = 'bravo';
  const r = validarDirecao(out);
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /emotion/);
});

test('validarDirecao apanha um motor de banda desconhecido', () => {
  const out = normalizarDirecao(beat('p01'), { indice: 0, total: 28 });
  out.top_band_visual.engine = 'blender';
  const r = validarDirecao(out);
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /engine/);
});

test('validarDirecao avisa quando falta o driving template', () => {
  const out = normalizarDirecao(beat('p01'), { indice: 0, total: 28 });
  out.frida_state.driving_template = '';
  const r = validarDirecao(out);
  assert.equal(r.ok, true, 'a falta do driver e um aviso, nao um erro');
  assert.ok(r.avisos.length >= 1);
  assert.match(r.avisos[0], /driving_template/);
});

test('validarDirecao apanha a falta do falante activo', () => {
  const r = validarDirecao({ ...beat('p01'), active_speaker: undefined });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /active_speaker/);
});

// ---------------------------------------------------------------------------
// Enquadramento do beat (a regra que a F4 vai obedecer)
// ---------------------------------------------------------------------------

test('enquadramentoDoBeat faz close-up quando quem fala e quem o EDL ja pedia', () => {
  assert.equal(enquadramentoDoBeat(beat('p03', { avatar: 'luna', active_speaker: 'luna' })), 'closeup');
});

test('enquadramentoDoBet mantem o plano duplo quando a colega e a protagonista do beat', () => {
  assert.equal(enquadramentoDoBeat(beat('p03', { avatar: 'luna', active_speaker: 'frida' })), 'dual_desk');
});

test('enquadramentoDoBeat abre sempre em plano duplo', () => {
  assert.equal(enquadramentoDoBeat(beat('p01', { avatar: 'frida', active_speaker: 'frida' }), 0), 'dual_desk');
});

// ---------------------------------------------------------------------------
// Plano inteiro
// ---------------------------------------------------------------------------

test('aplicarDirecaoAoPlano normaliza os 28 beats sem perder nenhum', () => {
  const scenes = Array.from({ length: 28 }, (_, i) => beat('p' + String(i + 1).padStart(2, '0')));
  const plano = { version: 1, kicker: 'DARK', scenes };
  const out = aplicarDirecaoAoPlano(plano);
  assert.equal(out.scenes.length, 28);
  assert.equal(out.scenes[0].id, 'p01');
  assert.equal(out.scenes[27].id, 'p28');
  for (const s of out.scenes) {
    assert.ok(s.active_speaker, 'beat sem falante: ' + s.id);
    assert.ok(s.frida_state && s.luna_state, 'beat sem estados: ' + s.id);
  }
});

test('aplicarDirecaoAoPlano nao altera o plano original', () => {
  const scenes = Array.from({ length: 28 }, (_, i) => beat('p' + String(i + 1).padStart(2, '0')));
  const plano = { version: 1, scenes };
  const copia = JSON.parse(JSON.stringify(plano));
  aplicarDirecaoAoPlano(plano);
  assert.deepEqual(plano, copia);
});

test('aplicarDirecaoAoPlano preserva o resto do plano', () => {
  const plano = {
    version: 1,
    generatedAt: '2026-11-13T10:39:22.975Z',
    grade: 'A7',
    kicker: 'DARK',
    summary: { total: 28 },
    scenes: [beat('p01'), beat('p02')],
  };
  const out = aplicarDirecaoAoPlano(plano);
  assert.equal(out.version, 1);
  assert.equal(out.generatedAt, '2026-11-13T10:39:22.975Z');
  assert.equal(out.grade, 'A7');
  assert.equal(out.kicker, 'DARK');
  assert.deepEqual(out.summary, { total: 28 });
});

test('aplicarDirecaoAoPlano aceita um plano sem scenes e devolve um plano vazio', () => {
  const out = aplicarDirecaoAoPlano({ version: 1 });
  assert.deepEqual(out.scenes, []);
});

test('resumoDirecao conta quem fala e quantos beats tem', () => {
  // Reproduz a estrutura real do edl-ref5: abertura da Frida, comentario
  // da Luna, analise da Frida, fecho da Luna.
  const avatares = ['frida', 'luna', 'frida', 'luna'];
  const scenes = avatares.map((a, i) => beat('p' + String(i + 1).padStart(2, '0'), { avatar: a }));
  const out = aplicarDirecaoAoPlano({ version: 1, scenes });
  const r = resumoDirecao(out);
  assert.equal(r.total, 4);
  assert.equal(r.frida, 2);
  assert.equal(r.luna, 2);
  assert.equal(r.invalidos, 0);
});

// ---------------------------------------------------------------------------
// Direccao editorial escrita a mao (o ficheiro que o operador edita)
// ---------------------------------------------------------------------------

test('aplicarDirecaoEditorial aplica a emocao escrita a mao', () => {
  const scenes = [beat('p01'), beat('p02')];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const editorial = { p01: { frida_state: { emotion: 'happy' } } };
  const r = aplicarDirecaoEditorial(plano, editorial);
  const out = r.plano;
  assert.equal(out.scenes[0].frida_state.emotion, 'happy');
  // os campos nao escritos continuam com o valor inferido
  assert.equal(out.scenes[0].frida_state.eye_target, 'camera');
  assert.equal(out.scenes[0].frida_state.head_action, 'nod');
});

test('aplicarDirecaoEditorial funde os estados campo a campo', () => {
  const scenes = [beat('p01', { avatar: 'frida' })];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const editorial = { p01: { luna_state: { eye_target: 'frida', head_action: 'tilt_left_12deg' } } };
  const out = aplicarDirecaoEditorial(plano, editorial).plano;
  assert.equal(out.scenes[0].luna_state.eye_target, 'frida');
  assert.equal(out.scenes[0].luna_state.head_action, 'tilt_left_12deg');
  // a emocao nao foi escrita: mantem a inferida
  assert.equal(out.scenes[0].luna_state.emotion, 'listening');
});

test('aplicarDirecaoEditorial pode mudar quem fala', () => {
  const scenes = [beat('p01', { avatar: 'frida' })];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const out = aplicarDirecaoEditorial(plano, { p01: { active_speaker: 'luna' } }).plano;
  assert.equal(out.scenes[0].active_speaker, 'luna');
});

test('aplicarDirecaoEditorial nao mexe nos beats sem entrada', () => {
  const scenes = [beat('p01'), beat('p02')];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const out = aplicarDirecaoEditorial(plano, { p01: { frida_state: { emotion: 'happy' } } }).plano;
  assert.deepEqual(out.scenes[1], plano.scenes[1]);
});

test('aplicarDirecaoEditorial nao altera o plano original', () => {
  const scenes = [beat('p01')];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const copia = JSON.parse(JSON.stringify(plano));
  aplicarDirecaoEditorial(plano, { p01: { frida_state: { emotion: 'happy' } } });
  assert.deepEqual(plano, copia);
});

test('aplicarDirecaoEditorial refaz o driving template quando a emocao muda', () => {
  // BUG REAL (2026-11-14): a inferencia escolhe o driver a partir da
  // emocao inferida ('neutral' -> listening). Quando a editorial muda a
  // emocao para 'ironic', o driver continuava a ser o do 'listening' — a
  // Luna fazia a cara de quem ouve com a ironia pedida.
  const scenes = [beat('p01', { avatar: 'luna' })];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const r = aplicarDirecaoEditorial(plano, { p01: { luna_state: { emotion: 'ironic' } } });
  const estado = r.plano.scenes[0].luna_state;
  assert.equal(estado.emotion, 'ironic');
  assert.ok(
    estado.driving_template.endsWith('luna_cohost_skeptical_ironic.mp4'),
    'o driver nao acompanhou a emocao: ' + estado.driving_template
  );
});

test('aplicarDirecaoEditorial refaz o driver tambem quando o falante muda', () => {
  const scenes = [beat('p01', { avatar: 'frida' })];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  // a Frida passa a falar: o driver dela e' o de escuta (esta a ouvir a
  // Luna), nao o de apresentadora. A Luna passa a falar com a emocao
  // inferida da fala (aqui 'neutral', porque o texto nao tem pontuacao).
  const r = aplicarDirecaoEditorial(plano, { p01: { active_speaker: 'luna' } });
  assert.equal(r.plano.scenes[0].frida_state.emotion, 'listening');
  assert.ok(
    r.plano.scenes[0].frida_state.driving_template.endsWith('frida_listening_to_luna.mp4'),
    'driver errado: ' + r.plano.scenes[0].frida_state.driving_template
  );
  assert.equal(r.plano.scenes[0].luna_state.emotion, 'neutral');
  assert.ok(
    r.plano.scenes[0].luna_state.driving_template.endsWith('luna_cohost_listening_react.mp4'),
    'driver errado: ' + r.plano.scenes[0].luna_state.driving_template
  );
});

test('aplicarDirecaoEditorial pode forcar o plano do beat', () => {
  const scenes = [beat('p01', { avatar: 'frida' })];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const r = aplicarDirecaoEditorial(plano, { p01: { camera_framing: 'closeup' } });
  assert.equal(r.plano.scenes[0].camera_framing, 'closeup');
});

test('aplicarDirecaoEditorial reporta as entradas sem beat correspondente', () => {
  const scenes = [beat('p01')];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const r = aplicarDirecaoEditorial(plano, { p99: { frida_state: { emotion: 'happy' } } });
  assert.deepEqual(r.ignorados, ['p99']);
  assert.equal(r.plano.scenes.length, 1);
});

test('aplicarDirecaoEditorial ignora as chaves de documentacao (_manual, etc.)', () => {
  const scenes = [beat('p01')];
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const r = aplicarDirecaoEditorial(plano, { _manual: 'texto', _catalogoEmocoes: 'neutral' });
  assert.deepEqual(r.ignorados, []);
});

// ---------------------------------------------------------------------------
// A regra da alternancia dinamica (a F4 vai obedecer a isto)
// ---------------------------------------------------------------------------

test('enquadramentosDoPlano poe a entrada e a saida de cada bloco em plano duplo', () => {
  // Reproduz a estrutura real: 3 beats da Frida, 2 da Luna.
  const avatares = ['frida', 'frida', 'frida', 'luna', 'luna'];
  const scenes = avatares.map((a, i) => beat('p' + String(i + 1).padStart(2, '0'), { avatar: a }));
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const e = enquadramentosDoPlano(plano);
  assert.deepEqual(e, ['dual_desk', 'closeup', 'dual_desk', 'dual_desk', 'dual_desk']);
});

test('enquadramentosDoPlano devolve um close-up no meio do bloco', () => {
  const avatares = ['frida', 'frida', 'frida', 'frida', 'frida'];
  const scenes = avatares.map((a, i) => beat('p' + String(i + 1).padStart(2, '0'), { avatar: a }));
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const e = enquadramentosDoPlano(plano);
  assert.deepEqual(e, ['dual_desk', 'closeup', 'closeup', 'closeup', 'dual_desk']);
});

test('enquadramentosDoPlano devolve uma lista vazia para um plano sem beats', () => {
  assert.deepEqual(enquadramentosDoPlano({ scenes: [] }), []);
});

test('enquadramentosDoPlano conta os beats do edl-ref5 (8 duplos, 20 close-ups)', () => {
  // 4 blocos: Frida p01-p08, Luna p09-p17, Frida p18-p23, Luna p24-p28.
  const avatares = [
    'frida', 'frida', 'frida', 'frida', 'frida', 'frida', 'frida', 'frida',
    'luna', 'luna', 'luna', 'luna', 'luna', 'luna', 'luna', 'luna', 'luna',
    'frida', 'frida', 'frida', 'frida', 'frida', 'frida',
    'luna', 'luna', 'luna', 'luna', 'luna',
  ];
  const scenes = avatares.map((a, i) => beat('p' + String(i + 1).padStart(2, '0'), { avatar: a }));
  const plano = aplicarDirecaoAoPlano({ version: 1, scenes });
  const e = enquadramentosDoPlano(plano);
  assert.equal(e.length, 28);
  assert.equal(e.filter((x) => x === 'dual_desk').length, 8);
  assert.equal(e.filter((x) => x === 'closeup').length, 20);
});
