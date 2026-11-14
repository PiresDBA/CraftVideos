# Pipeline de clonagem — núcleo extraído

O motor (`yt-clone-build.mjs`) orchestra o build. A **lógica de decisão** — que
palavras aparecem, onde fica a emenda das bandas, como se escreve o ASS — vive
nestes módulos, sem I/O e sem estado global, para poder ser testada.

```
.artcraft/clone/lib/
  text.mjs     wrap, keyWords v2, keywordsWithFallback, styleWords,
               highlightRuns, accentRuns, captionChunks
  layout.mjs   layoutMetrics, sceneLayout, textAnchorY
  colour.mjs   assColour (#RRGGBB <-> &HAABBGGRR)
  ass.mjs      assTime, formatSRTTime, assStyleHeader, writeSceneASS,
               buildASS, buildSRT
  media.mjs    sceneVisual (a pasta visuals/ e a guarda do topEngine)
  runtime.mjs  run (com timeout), findFfmpeg, httpGet, httpPost,
               detectVRAM, pythonEnv
  config.mjs   loadConfig, withDefaults, applyOverride, validateConfig,
               redactConfig, rawConfig
  cache.mjs    narrationFingerprint, readNarrationCache, writeNarrationCache
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

# testes (PowerShell / bash — as aspas contam no Windows)
node --test ".artcraft/clone/lib/*.test.mjs"
```

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
