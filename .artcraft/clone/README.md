# Pipeline de clonagem — núcleo extraído

O motor (`yt-clone-build.mjs`) orchestra o build. A **lógica de decisão** — que
palavras aparecem, onde fica a emenda das bandas, como se escreve o ASS — vive
nestes módulos, sem I/O e sem estado global, para poder ser testada.

```
.artcraft/clone/lib/
  text.mjs     wrap, keyWords v2, keywordsWithFallback, styleWords,
               sceneKicker, highlightRuns, accentRuns, captionChunks
  layout.mjs   layoutMetrics, sceneLayout, textAnchorY
  colour.mjs   assColour (#RRGGBB <-> &HAABBGGRR)
  ass.mjs      assDialogue, assTime, formatSRTTime, assStyleHeader,
               writeSceneASS, buildASS, buildSRT
  media.mjs    sceneVisual (a pasta visuals/ e a guarda do topEngine)
  runtime.mjs  run (com timeout), findFfmpeg, httpGet, httpPost,
               detectVRAM, pythonEnv
  config.mjs   loadConfig, withDefaults, applyOverride, validateConfig,
               redactConfig, rawConfig
  cache.mjs    narrationFingerprint, readNarrationCache, writeNarrationCache
  direcao.mjs  o CONTRATO DE DIRECAO: active_speaker, frida_state, luna_state,
               top_band_visual; inferencia, validacao, fusao da editorial,
               enquadramentosDoPlano (a alternancia dinamica)
```

## Porquê

| Antes | Agora |
|---|---|
| 2894 linhas num ficheiro só | motor + 8 módulos com responsabilidade única |
| `REMOTION_TOP_BAND` global mutável | decisão lida da config em cada chamada (`topEngineOf(cfg)`) |
| a guarda do `visuals/` estava no call site morto | `sceneVisual` em `media.mjs`, com teste de regressão |
| `require('node:http')` dentro de ESM | `import http from 'node:http'` no runtime |
| `httpGet(url, {Authorization})` ignorava o header | os headers são enviados (a key do Pexels funciona) |
| `httpGet` só sabia `https://` | escolhe a lib pelo protocolo |
| `runVastAI`/`runLambda` inexistentes | erro explícito a dizer o que usar em alternativa |
| `run()` sem timeout | timeout em todos os call sites (ffmpeg 15 min, TTS 5 min, Python 30 min) |
| um timeout só matava o filho directo | `taskkill /T /F` mata a árvore (node → python → ffmpeg) |
| `keyWords` sem pontuação | pontuação por posição/tamanho/caixa + mínimo de 2 palavras |
| "O QUE SÃO AGENTES" desenhava só "AGENTES" | `keywordsWithFallback` completa com body/narração da cena |
| `keyWords` perdia a des-duplicação | palavras repetidas contam uma vez |
| config lida às cegas | `--validate` diagnostica antes de gastar 2 minutos a renderizar |
| `manifest.tools.cards` sempre `'figcraft'` | o engine realmente usado |
| `manifest.json` embute a config crua | `redactConfig` remove chaves e tokens |
| cada rebuild re-sintetizava a narração | cache por impressão digital do texto + voz + cadeia de polimento |

## O que a F0 (13-11-2026) consertou

O build de validação do `ref5-clone` revelou defeitos que os testes não
apanhavam, porque estavam no motor e não na biblioteca:

| Defeito | Sintoma | Correcção |
|---|---|---|
| **Campo `Effect` em falta** no `Dialogue:` do `Head` | o vídeo queimava `1075)}AGENTES IA EXECUTAM` gigante por cima da banda | `assDialogue()` monta a linha com os 10 campos do `Format:`; teste de regressão |
| **A frase grande duplicada** | a banda Remotion desenhava as palavras e a camada ASS desenhava-as outra vez, por cima | `phraseInBand: true` quando a banda já pintou a frase |
| **`cfg.script.kicker`** | `TypeError` em três call sites quando o guião vem por `--script` (a config não tem secção `script`) | `sceneKicker(scene, cfg)` — acesso sempre seguro |
| **`phrase` em TDZ** | `ReferenceError` com uma cena sem texto | a declaração subiu para antes do primeiro uso |
| **Legendas dependiam do `cwd`** | a partir de outro directório, a primeira cena falhava com `Unable to open sub_pt_BR_01.ass` | o `.ass` vai para a pasta de build da cena e o ffmpeg corre com `cwd: buildDir` |
| **Raiz fixa `D:\CRAFT`** | o motor não corria noutra máquina | `CC = path.resolve(HERE, '..')` |
| **`paths.ffmpeg` decorativo** | a config prometia um caminho que o motor ignorava | a config é honrada depois de carregada |
| **`report.md` com chaves** | as chaves de API do avatar iam em claro para o relatório | `redactConfig(cfg.avatar)` |
| **`--slug` sem sanitizar** | `--slug ../../..` escrevia fora da pasta de builds | slug limitado a `[A-Za-z0-9_-]`, 64 chars |
| **`--script` inexistente** | ignorado em silêncio: o motor compunha o guião da config | falha com `script nao encontrado` (exit 2) |

### O bug do `Effect` — por que era invisível

O `Format:` dos Events do ASS declara dez campos (Layer, Start, End, Style,
Name, MarginL, MarginR, MarginV, **Effect**, Text). O evento do `Head` era
escrito com nove. A vírgula dentro de `\pos(540,1075)` ocupava então o
lugar do `Effect` e o ffmpeg passava a ler o texto a partir de `1075)}`:
as coordenadas queimavam-se no vídeo como texto gigante.

Agora existe **um só** construtor (`assDialogue()`) para as três linhas de
`Dialogue:` do módulo, e o teste de regressão compara o número de campos de
cada evento com o que o `Format:` declara.

### Teste de fumo da linha de comando

`engine-cli-smoke.test.mjs` lanca o motor como processo filho e verifica o
que o utilizador vê: `--validate` com e sem script, `--dry-run` com config
sem secção `script`, `--script` inexistente e `--slug` com traversal.
Não toca no workspace: a config e o guião vivem no `%TEMP%` e são removidos
no fim.

## O contrato de direção (F1 — 14-11-2026)

O contrato liga o plano editorial (os beats `p01..p28` do EDL) às duas
apresentadoras. Responde a três perguntas por beat:

| Pergunta | Onde vive | Quem decide |
|---|---|---|
| Quem fala? | `active_speaker` | `active_speaker` escrito → `avatar` do EDL → regra de posição |
| Com que emoção? | `frida_state` / `luna_state` | `direcao-editorial.json` → inferência pela pontuação da fala |
| Onde olham e como aparecem? | `eye_target`, `camera_framing`, `driving_template` | editorial → inferência |

### Módulos e ficheiros

| Ficheiro | Papel |
|---|---|
| `.artcraft/clone/lib/direcao.mjs` | o contrato: catálogos, inferência, validação, fusão da editorial |
| `.artcraft/clone/lib/direcao.test.mjs` | 49 testes do contrato |
| `.artcraft/clone/lib/direcao-cli.test.mjs` | 8 testes de fumo do CLI |
| `.artcraft/yt-direcao.mjs` | CLI: enriquece um plano e valida o contrato |
| `work/clones/edl-ref5/direcao-editorial.json` | a decisão escrita à mão (28 beats) |
| `work/clones/edl-ref5/plan-direcao.json` | o plano com o contrato materializado |

### Como se usa

```sh
# 1) inferir o contrato a partir do plano do EDL
node .artcraft/yt-direcao.mjs \
  --plan work/clones/edl-ref5/plan.json \
  --direcao work/clones/edl-ref5/direcao-editorial.json \
  --out work/clones/edl-ref5/plan-direcao.json

# 2) validar sem escrever nada
node .artcraft/yt-direcao.mjs \
  --plan work/clones/edl-ref5/plan-direcao.json --validate
```

O plano de entrada **nunca** é alterado: o EDL pode ser re-executado a
qualquer momento e o contrato volta a ser aplicado sobre o resultado.

### Três decisões que a inferência não podia adivinhar

1. **Quem fala: o `avatar` do EDL manda.** A primeira regra (alternar Frida
   e Luna por posição) punha a Luna a falar na apresentação da Frida. Os
   dados reais do `edl-ref5` são 4 blocos — abertura da Frida (`p01..p08`),
   comentário da Luna (`p09..p17`), análise da Frida (`p18..p23`), fecho da
   Luna (`p24..p28`) — e o `avatar` do beat é exactamente esse mapa.
2. **Emoção: a editorial decide.** A inferência só lê a pontuação da fala
   (`!` → `excited`, `?` → `curious`/`skeptical`) e é deliberadamente
   conservadora: uma Frida neutra é melhor do que uma Frida excitada no
   sítio errado.
3. **Enquadramento: alternância por bloco.** A entrada e a saída de cada
   bloco de falante ficam em plano duplo (8 beats) e o miolo em close-up da
   falante activa (20 beats). É a "alternância dinâmica" que foi pedida, e
   é uma regra determinística que a F4 vai obedecer.

### O bug do driver trocado

A inferência escolhe o `driving_template` a partir da emoção **inferida**.
Quando a editorial mudava a emoção (ex.: `ironic`), o driver continuava a
ser o da inferência — a Luna fazia a cara de quem ouve com a ironia pedida.
A fusão editorial volta agora a ligar `emoção → driver` depois de aplicar
as decisões escritas à mão. Um driver escrito explicitamente continua a
mandar.

## Comandos

```sh
# diagnostico da config (nao escreve nada, nao gasta nada)
node .artcraft/yt-clone-build.mjs --validate

# build completo de um idioma
node .artcraft/yt-clone-build.mjs --slug ref5-clone \
  --script work/clones/ref5-clone/script.json \
  --set 'languages.supported=["pt-BR"]' \
  --set 'languages.subtitleLanguages=["pt-BR"]' \
  --wav2lip --driving-video D:\CRAFT\work\reference\ref5\ref1080.mp4

# contrato de direcao: enriquecer um plano e valida-lo
node .artcraft/yt-direcao.mjs --plan work/clones/edl-ref5/plan.json \
  --direcao work/clones/edl-ref5/direcao-editorial.json \
  --out work/clones/edl-ref5/plan-direcao.json

# testes (PowerShell / bash — as aspas contam no Windows)
node --test ".artcraft/clone/lib/*.test.mjs"
```

170 testes (113 do motor e da biblioteca + 49 do contrato + 8 de fumo do CLI).

## Regras que os módulos respeitam

- **Nada preso no codigo.** Toda a parametrização vive em `clone.config.json`
  e pode ser sobreposta por `--set chave=valor`.
- **Conteúdo nosso, estrutura do canal.** O motor Remotion (`cards.topEngine:
  "remotion"`) desenha a banda de cima com palavras-chave animadas; o footage
  do canal de referência nunca entra no resultado. A pasta `visuals/` é
  ignorada nesse modo (`sceneVisual` + `ignoreVisualsFolder`).
- **Falhar cedo e com mensagem.** `validateConfig` apanha typos antes do
  build; os motores remotos dizem o que falta em vez de rebentar.
- **Nunca repetir trabalho já feito.** O cache de narração reusa o áudio
  quando o texto, a voz e o polimento não mudaram; o Wav2Lip tem o seu próprio
  cache por data de modificação. Nenhum trabalho existente é apagado.

## Palavras-chave: como são escolhidas

1. A frase da cena (`scene.text` / `headline`) passa pelo `keyWords`: sem
   stopwords pt/en/es, pontuação por posição, tamanho, caixa alta e dígitos.
2. Se ficarem **menos de 2 palavras** (o caso "O QUE SÃO AGENTES", que só tem
   uma de conteúdo), entram como **reserva** o `body` e a narração da cena,
   por esta ordem, sem repetir palavras.
3. A lista final passa por `styleWords`: CAIXA ALTA, a não ser que
   `cards.textStyle.uppercase` seja `false`.

As palavras de reserva vêm de frases diferentes — o resultado é uma lista de
palavras, não uma frase. É essa a intenção: a banda de cima é tipografia
cinética, não um subtítulo.

## Cache de narração

O registo fica ao lado do áudio, em
`<clone>/audio/<idioma>/<cena>.narration-cache.json`:

```json
{
  "fingerprint": "5ac781cbe0812c8a",
  "file": "D:\\...\\s02.master.wav",
  "duration": 10.85,
  "engine": "voicecraft"
}
```

A impressão digital cobre o **texto**, o **motor**, os campos de **voz**
(nome, provider, profile, ttsModel, speed, pitch — nunca chaves) e a
**cadeia de polimento**. Mudou qualquer um deles, o áudio é refeito; caso
contrário é reusado e o build continua sem gastar quota nem tempo de GPU.

Para invalidar à mão: apagar o ficheiro `.narration-cache.json` da cena
(o áudio continua no sítio — nada se perde).
