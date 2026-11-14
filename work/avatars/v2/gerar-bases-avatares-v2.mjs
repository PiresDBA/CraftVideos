// =============================================================================
// GERAR BASES DE AVATAR v2 — ComfyUI + IPAdapter
// =============================================================================
//
// MANUAL DE USO
// -------------
// Proposito:
//   Gerar as bases de avatar v2 (Frida e Luna) a 1024x1024 via ComfyUI,
//   transferindo a identidade das referencias atuais (work/avatars/*.png)
//   com o IPAdapter (preset PLUS, SD1.5). O resultado fica em
//   work/avatars/v2/<nome>_v2_base.png, pronto para ser validado pelo
//   validar-avatar-v2.py e depois consumido pelo motor (LivePortrait).
//
//   O modelo base e o DreamShaper 8 (SD1.5). O IPAdapter usa CLIP-ViT-H.
//   Como a GTX 1060 tem 6 GB, o ComfyUI tem de estar a correr com --lowvram.
//
// Parametros CLI:
//   --workflow <ficheiro>   template do workflow (default: workflow-base-v2.json
//                           na mesma pasta deste script).
//   --personagem <id>       personagem a gerar (frida, luna). Repetivel.
//                           Sem este parametro gera todas as de _personagens.
//   --comfy <url>           URL da API ComfyUI (default: http://127.0.0.1:8188).
//   --input-dir <pasta>     input do ComfyUI (default: D:\Comfy\ComfyUI\input).
//   --out-dir <pasta>       onde gravar os PNG gerados (default: ao lado do
//                           script, em work/avatars/v2/).
//   --timeout <s>           tempo maximo de espera por cada imagem (default 300).
//   --dry-run               so resolve o workflow e imprime o plano na stdout.
//                           Nao contacta o ComfyUI. Exit 0 se tudo estiver ok.
//   --validate              valida o workflow contra o /object_info do ComfyUI
//                           e sai. Exit 0 se valido.
//   --ajuda                 mostra esta ajuda.
//
// Dependencias: apenas Node.js (fetch nativo). Zero rede externa alem do
// ComfyUI local, zero GPU local (o ComfyUI ja tem a sua).
//
// Exemplos:
//   node gerar-bases-avatares-v2.mjs --validate
//   node gerar-bases-avatares-v2.mjs --dry-run
//   node gerar-bases-avatares-v2.mjs --personagem frida --personagem luna
//   node gerar-bases-avatares-v2.mjs --comfy http://127.0.0.1:8188 --out-dir work/avatars/v2
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(HERE, '..', '..', '..'); // D:\CRAFT

// -----------------------------------------------------------------------------
// 1) Carregamento do workflow e resolucao de placeholders.
//    Tudo que nao e {{chave}} e literal: o gerador nunca decide nada por conta
//    propria. Qualquer mudanca de prompt, semente, peso ou tamanho faz-se so
//    no workflow-base-v2.json.
// -----------------------------------------------------------------------------

/** Carrega o workflow JSON (template com placeholders {{ }}). */
export function carregarWorkflow(ficheiro) {
  if (!fs.existsSync(ficheiro)) throw new Error('workflow nao encontrado: ' + ficheiro);
  const texto = fs.readFileSync(ficheiro, 'utf8').replace(/^\uFEFF/, '');
  const dados = JSON.parse(texto);
  const required = ['_manual', '_parametros', '_personagens', 'workflow'];
  for (const k of required) {
    if (!(k in dados)) throw new Error('workflow invalido: falta a secao "' + k + '"');
  }
  return dados;
}

/** Lista de personagens disponiveis no workflow. */
export function personagensDisponiveis(workflow) {
  const p = workflow._personagens || {};
  return Object.keys(p).sort();
}

/**
 * Substitui {{chave}} no texto. Aceita valores primitivos (string, number,
 * boolean) e objetos (serializa JSON). Devolve { texto, usado: [...] }.
 * Lança se existir algum placeholder nao resolvido (protege contra valores
 * esquecidos no template).
 */
export function resolverPlaceholders(texto, valores) {
  const usados = [];
  let resultado = texto.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (match, chave) => {
    if (!(chave in valores)) return match; // nao resolvido: deixa para reportar
    usados.push(chave);
    const v = valores[chave];
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
  const naoResolvidos = [...resultado.matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)].map((m) => m[1]);
  return { resultado, usados, naoResolvidos };
}

/**
 * Constroi o prompt da API do ComfyUI para um personagem:
 *   - substitui todos os placeholders do workflow (parametros + personagem);
 *   - resolve a referencia de imagem para o input-dir do ComfyUI (nome de
 *     ficheiro so, sem caminho);
 *   - ajusta o filename_prefix do SaveImage para o saida do personagem.
 *
 * Devolve { prompt, personagem, valoresUsados }.
 *
 * @param {object} workflow   o workflow carregado
 * @param {string} idPersonagem  chave em _personagens
 * @param {object} opcoes     { inputDir }
 * @returns {{prompt: object, personagem: object, valoresUsados: string[]}}
 */
export function construirPrompt(workflow, idPersonagem, opcoes = {}) {
  const personagens = workflow._personagens || {};
  const personagem = personagens[idPersonagem];
  if (!personagem) throw new Error('personagem desconhecido: "' + idPersonagem + '"');

  // Valores globais do workflow + valores especificos do personagem.
  const valores = Object.assign({}, workflow._parametros, {
    imagem_referencia: personagem.referencia, // nome de ficheiro (sem caminho)
    prefixo: personagem.prefixo,
    ...personagem,
  });

  // Resolve a referencia: so o nome do ficheiro, relativo ao input-dir do ComfyUI.
  valores.imagem_referencia = path.basename(personagem.referencia);

  const usados = [];

  /**
   * Substitui {{ }} em todos os valores string de um objecto (inputs e _meta),
   * recursivamente. Arrays sao percorridos item a item. Devolve um NOVO
   * objecto. Lança se algum placeholder ficar nao resolvido.
   */
  function resolverTodosValores(obj, contexto) {
    const out = {};
    for (const [chave, valor] of Object.entries(obj)) {
      if (typeof valor === 'string') {
        const r = resolverPlaceholders(valor, valores);
        if (r.naoResolvidos.length) {
          throw new Error(
            'no "' + contexto.noId + '" (' + contexto.classType + '), "' + chave + '": ' +
            'placeholders nao resolvidos: ' + r.naoResolvidos.join(', ') +
            '. Verifique _parametros e _personagens no workflow.'
          );
        }
        out[chave] = r.resultado;
        usados.push(...r.usados);
      } else if (Array.isArray(valor)) {
        out[chave] = valor.map((v) => {
          if (typeof v === 'string') {
            const r = resolverPlaceholders(v, valores);
            if (r.naoResolvidos.length) {
              throw new Error(
                'no "' + contexto.noId + '" (' + contexto.classType + '), "' + chave + '[]": ' +
                'placeholders nao resolvidos: ' + r.naoResolvidos.join(', ')
              );
            }
            usados.push(...r.usados);
            return r.resultado;
          }
          return v;
        });
      } else if (valor && typeof valor === 'object') {
        out[chave] = resolverTodosValores(valor, contexto);
      } else {
        out[chave] = valor;
      }
    }
    return out;
  }

  const prompt = {};
  for (const [noId, no] of Object.entries(workflow.workflow)) {
    const contexto = { noId, classType: no.class_type };
    prompt[noId] = {
      class_type: no.class_type,
      inputs: resolverTodosValores(no.inputs || {}, contexto),
      _meta: no._meta ? resolverTodosValores(no._meta, contexto) : undefined,
    };
  }
  return { prompt, personagem, valoresUsados: [...new Set(usados)] };
}

// -----------------------------------------------------------------------------
// 2) Validacao do workflow contra o /object_info do ComfyUI.
//    Confirma que cada class_type existe e que cada input declarado no
//    workflow corresponde a um input real do no (required ou optional).
// -----------------------------------------------------------------------------

/** Busca as informacoes de todos os nos no ComfyUI. */
export async function buscarObjectInfo(comfy) {
  const resposta = await fetch(comfy.replace(/\/$/, '') + '/object_info', {
    headers: { Accept: 'application/json' },
  });
  if (!resposta.ok) throw new Error('ComfyUI /object_info falhou (HTTP ' + resposta.status + ')');
  return await resposta.json();
}

/**
 * Valida o workflow ja resolvido contra o object_info.
 * Devolve { valido, problemas: string[] }.
 */
export function validarPromptContraObjectInfo(prompt, objectInfo) {
  const problemas = [];
  for (const [noId, no] of Object.entries(prompt)) {
    const info = objectInfo[no.class_type];
    if (!info) {
      problemas.push('no ' + noId + ': class_type desconhecido "' + no.class_type + '"');
      continue;
    }
    const declarados = Object.assign({}, info.input?.required || {}, info.input?.optional || {});
    for (const input of Object.keys(no.inputs || {})) {
      if (!(input in declarados)) {
        problemas.push('no ' + noId + ' (' + no.class_type + '): input desconhecido "' + input + '"');
      }
    }
    // inputs required ausentes
    for (const input of Object.keys(info.input?.required || {})) {
      if (!(input in (no.inputs || {}))) {
        problemas.push('no ' + noId + ' (' + no.class_type + '): input required em falta "' + input + '"');
      }
    }
  }
  return { valido: problemas.length === 0, problemas };
}

// -----------------------------------------------------------------------------
// 3) Cliente do ComfyUI: submit, poll e download.
// -----------------------------------------------------------------------------

const CLIENT_ID = 'clone-avatar-v2-' + String(Date.now());

export function tempoEspera(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** Submete o prompt ao ComfyUI e devolve o prompt_id. */
export async function submeterPrompt(comfy, prompt) {
  const corpo = { prompt, client_id: CLIENT_ID };
  const resposta = await fetch(comfy.replace(/\/$/, '') + '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => '');
    throw new Error('ComfyUI /prompt falhou (HTTP ' + resposta.status + '): ' + texto.slice(0, 300));
  }
  const dados = await resposta.json();
  if (!dados.prompt_id) throw new Error('ComfyUI nao devolveu prompt_id: ' + JSON.stringify(dados));
  return { promptId: dados.prompt_id, numero: dados.number };
}

/**
 * Aguarda a conclusao do prompt e devolve as imagens de output.
 * Devolve a lista de { filename, subfolder, type } do ultimo no que produziu imagem.
 */
export async function aguardarResultado(comfy, promptId, timeoutS = 300, intervaloMs = 2000) {
  const url = comfy.replace(/\/$/, '') + '/history/' + promptId;
  const t0 = Date.now();
  for (;;) {
    const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resposta.ok) throw new Error('ComfyUI /history falhou (HTTP ' + resposta.status + ')');
    const dados = await resposta.json();
    const execucao = dados[promptId];
    if (!execucao) {
      if (Date.now() - t0 > timeoutS * 1000) throw new Error('timeout aguardando ' + promptId);
      await tempoEspera(intervaloMs);
      continue;
    }
    const status = execucao.status || {};
    if (status.completed || status.status_code === 'success' || execucao.outputs) {
      // Recolhe imagens de todos os nos de output
      const imagens = [];
      for (const [noId, saida] of Object.entries(execucao.outputs || {})) {
        if (Array.isArray(saida.images)) {
          for (const img of saida.images) {
            imagens.push({ node: noId, ...img });
          }
        }
      }
      return { imagens, status };
    }
    if (status.status_code === 'error' || status.exception) {
      throw new Error('ComfyUI executou com erro: ' + JSON.stringify(status).slice(0, 400));
    }
    if (Date.now() - t0 > timeoutS * 1000) throw new Error('timeout aguardando ' + promptId);
    await tempoEspera(intervaloMs);
  }
}

/** Faz download de uma imagem via /view e grava no destino. */
export async function baixarImagem(comfy, imagem, destino) {
  const params = new URLSearchParams();
  params.set('filename', imagem.filename);
  if (imagem.subfolder) params.set('subfolder', imagem.subfolder);
  if (imagem.type) params.set('type', imagem.type);
  const resposta = await fetch(comfy.replace(/\/$/, '') + '/view?' + params.toString());
  if (!resposta.ok) throw new Error('ComfyUI /view falhou (HTTP ' + resposta.status + ')');
  const buffer = Buffer.from(await resposta.arrayBuffer());
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
  return { destino, bytes: buffer.length };
}

/**
 * Copia a imagem de referencia para o input-dir do ComfyUI (LoadImage so aceita
 * ficheiros dentro da pasta input). Devolve o caminho destino.
 */
export function prepararReferencia(caminhoReferencia, inputDir) {
  const nome = path.basename(caminhoReferencia);
  const destino = path.join(inputDir, nome);
  if (!fs.existsSync(caminhoReferencia)) {
    throw new Error('referencia nao encontrada: ' + caminhoReferencia);
  }
  fs.mkdirSync(inputDir, { recursive: true });
  fs.copyFileSync(caminhoReferencia, destino);
  return destino;
}

// -----------------------------------------------------------------------------
// 4) Orquestracao por personagem.
// -----------------------------------------------------------------------------

export async function gerarPersonagem(workflow, idPersonagem, opcoes) {
  const comfy = opcoes.comfy || 'http://127.0.0.1:8188';
  const inputDir = opcoes.inputDir || 'D:\\Comfy\\ComfyUI\\input';
  const outDir = opcoes.outDir || HERE;
  const timeoutS = Number(opcoes.timeout || 300);

  const { prompt, personagem } = construirPrompt(workflow, idPersonagem, { inputDir });

  // Coloca a referencia no input-dir do ComfyUI (nome de ficheiro so).
  const refDestino = prepararReferencia(personagem.referencia, inputDir);
  const refUsada = path.basename(refDestino);

  // Garante que o input da referencia no prompt bate com o ficheiro copiado.
  for (const no of Object.values(prompt)) {
    if (no.class_type === 'LoadImage' && typeof no.inputs.image === 'string') {
      no.inputs.image = refUsada;
    }
  }

  if (opcoes.dryRun) {
    return {
      personagem: idPersonagem,
      dryRun: true,
      prompt,
      referenciaCopiada: refDestino,
      saida: path.resolve(outDir, personagem.saida),
    };
  }

  const { promptId } = await submeterPrompt(comfy, prompt);
  const { imagens } = await aguardarResultado(comfy, promptId, timeoutS);

  if (imagens.length === 0) {
    throw new Error('personagem ' + idPersonagem + ': ComfyUI nao produziu imagem de output');
  }

  // Salva a primeira imagem de output (SaveImage costuma produzir uma).
  const destino = path.resolve(outDir, personagem.saida);
  const gravado = await baixarImagem(comfy, imagens[0], destino);
  return {
    personagem: idPersonagem,
    dryRun: false,
    promptId,
    saida: gravado.destino,
    bytes: gravado.bytes,
    referencias: imagens,
  };
}

/** Execucao principal da linha de comando. */
export async function main(argv) {
  const opcoes = {
    workflow: path.join(HERE, 'workflow-base-v2.json'),
    personagens: [],
    comfy: 'http://127.0.0.1:8188',
    inputDir: 'D:\\Comfy\\ComfyUI\\input',
    outDir: HERE,
    timeout: 300,
    dryRun: false,
    validate: false,
  };

  // Parse simples de argumentos.
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ajuda' || a === '--help') {
      const texto = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
      console.log(texto.split('*/')[0].replace(/^\/\/ ?/gm, ''));
      return 0;
    }
    if (a === '--workflow' && argv[i + 1]) { opcoes.workflow = argv[++i]; continue; }
    if (a === '--comfy' && argv[i + 1]) { opcoes.comfy = argv[++i]; continue; }
    if (a === '--input-dir' && argv[i + 1]) { opcoes.inputDir = argv[++i]; continue; }
    if (a === '--out-dir' && argv[i + 1]) { opcoes.outDir = argv[++i]; continue; }
    if (a === '--timeout' && argv[i + 1]) { opcoes.timeout = Number(argv[++i]); continue; }
    if (a === '--personagem' && argv[i + 1]) { opcoes.personagens.push(argv[++i]); continue; }
    if (a === '--dry-run') { opcoes.dryRun = true; continue; }
    if (a === '--validate') { opcoes.validate = true; continue; }
    throw new Error('argumento desconhecido: ' + a);
  }

  const workflow = carregarWorkflow(opcoes.workflow);

  if (opcoes.validate) {
    // Valida o workflow template (sem substituir placeholders: so verifica
    // class_type e nomes de input declarados).
    const objectInfo = await buscarObjectInfo(opcoes.comfy);
    const problemas = [];
    for (const [noId, no] of Object.entries(workflow.workflow)) {
      const info = objectInfo[no.class_type];
      if (!info) { problemas.push('no ' + noId + ': class_type desconhecido "' + no.class_type + '"'); continue; }
      const declarados = Object.assign({}, info.input?.required || {}, info.input?.optional || {});
      for (const input of Object.keys(no.inputs || {})) {
        if (!(input in declarados)) problemas.push('no ' + noId + ': input "' + input + '" nao existe em ' + no.class_type);
      }
    }
    if (problemas.length) {
      console.log('INVALIDO');
      for (const p of problemas) console.log('  - ' + p);
      return 1;
    }
    console.log('WORKFLOW VALIDO contra /object_info do ComfyUI (' + Object.keys(objectInfo).length + ' nos registados)');
    return 0;
  }

  const ids = opcoes.personagens.length ? opcoes.personagens : personagensDisponiveis(workflow);
  const resultados = [];
  for (const id of ids) {
    const r = await gerarPersonagem(workflow, id, opcoes);
    resultados.push(r);
    if (r.dryRun) {
      console.log('[dry-run] ' + id + ' -> ' + r.saida + ' (referencia em ' + r.referenciaCopiada + ')');
    } else {
      console.log(id + ' -> ' + r.saida + ' (' + r.bytes + ' bytes, prompt_id ' + r.promptId + ')');
    }
  }

  console.log('');
  console.log('total: ' + resultados.length + ' personagem' + (resultados.length !== 1 ? 'ns' : '') + ' processada' + (resultados.length !== 1 ? 's' : ''));
  return 0;
}

// Executa so quando chamado diretamente (nao quando importado em testes).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv)
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error('ERRO: ' + (err && err.message ? err.message : err));
      process.exit(2);
    });
}
