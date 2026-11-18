# ArtCraft workspace — agent instructions

This folder is the managed install root for six ArtCraft creative applications. Any agent
working here is expected to drive them through the CLI rather than describe what a human
would click.

## Read this first

Skills live in `~/.config/opencode/skills/`. The router is **`artcraft-suite`**.
Load it before touching any ArtCraft binary — it holds the app-selection table, the
dispatcher usage, and the failure playbook.

**Preferred entry point: the `artcraft` MCP server** (`D:\CRAFT\.artcraft\mcp-gateway.mjs`,
registered in `~/.config/opencode/opencode.json`). Four tools — `artcraft_apps`,
`artcraft_search`, `artcraft_run`, `artcraft_status` — reach every app for ~425 tokens.
The six native servers would cost ~35,000 tokens per request; do not register them together.

Use the shell dispatcher (`node D:\CRAFT\.artcraft\artcraft.mjs ...`) when you need
process-level control: launching/killing a GUI, refreshing catalogs, inspecting ports.

> **Craft Anything is not an editor.** It reverse-engineers software, sites and games. It
> cannot cut video or assemble animation. Visual work goes to the apps below.

| Task | Skill |
| --- | --- |
| any ArtCraft work at all | `artcraft-suite` |
| image, logo, poster, SVG, PDF, vector | `vectorcraft-image` |
| animation, GIF, sprite, Lottie | `anicraft-animation` |
| video edit, cut, export | `filmcraft-video` |
| motion graphics, VFX, intro, JSX | `effectcraft-vfx` |
| thumbnail, cover, UI, layout | `figcraft-design` |
| reverse engineering, "how does this work" | `craft-anything-reverse` |
| YouTube channel/video research | `youtube-channel-research` |
| "create a channel like this one" | `channel-clone-pipeline` |
| downloading / transcoding media | `media-download` |
| wiring MCP into an agent client | `artcraft-mcp` |

## Non-negotiable rules

1. **Use the dispatcher, never hard-coded paths.**
   `node D:\CRAFT\.artcraft\artcraft.mjs <cmd>` resolves executables, ports and versions.

2. **Search the catalog before running a command.** Ids are not guessable —
   1430 in VectorCraft, 763 in EffectCraft, 718 in FilmCraft.
   ```sh
   node D:\CRAFT\.artcraft\artcraft.mjs search filmcraft razor
   node D:\CRAFT\.artcraft\artcraft.mjs show   filmcraft timeline.razor
   ```

3. **Headless is the default.** Only start a GUI when the user wants to see it, or when a
   task needs live-UI tools (`ui_click`, `ui_type`).

4. **Write outputs into `D:\CRAFT\work\<project>\`.** Never into an app install directory.

5. **Verify every deliverable.** Render/export, then confirm the file exists and is a
   plausible size. `ok` with a 0-byte output is a failure.

6. **Clean up GUIs you started.** `node D:\CRAFT\.artcraft\artcraft.mjs stop <app>`.

## Layout

```
D:\CRAFT\
  AniCraft\         VectorCraft\     FilmCraft\
  EffectCraft\      FigCraft\        Craft Anything\
  .artcraft\
    artcraft.mjs              dispatcher (apps|doctor|status|search|show|cli|gui|stop|serve|refresh)
    media.mjs                 yt-dlp / ffmpeg acquisition + transcode
    reference\                dumped command catalogs (refresh with `node .artcraft\artcraft.mjs refresh`)
    state\pids\               GUI pid files
  work\                       <- all output goes here
```

Each app folder holds `<app>.exe` (GUI) and `<app>-cli.exe` (automation).

## Ports

| App | Control channel | Default port |
| --- | --- | --- |
| vectorcraft | `--control PORT` | 7979 |
| filmcraft | `--control PORT` / `FILMCRAFT_CONTROL_PORT` | 8123 |
| figcraft | `--control PORT` | 8124 |
| effectcraft | `--control PORT` / `EFFECTCRAFT_CONTROL_PORT` | 8125 |
| anicraft | stdio only | — |
| craft-anything | stdio only | — |

`vectorcraft-cli mcp` connects to `127.0.0.1:7979` by default and falls back to headless.

## Environment facts (verified)

- `node` v24.14.0, `py` 3.12.9 at `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`.
- `python` on PATH is LibreOffice's interpreter — **do not use it**.
- **ffmpeg / ffprobe / yt-dlp are installed but NOT on PATH.** `media.mjs` resolves them itself:
  - `yt-dlp` 2026.03.17 → `%LOCALAPPDATA%\Programs\Python\Python312\Scripts\yt-dlp.exe`
  - `ffmpeg`/`ffprobe` **9.0.1** → `%LOCALAPPDATA%\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\`
  - also available: FFmpeg 8.1-full at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\`
  - Do not reinstall; do not edit PATH.
- FilmCraft and EffectCraft encode video natively (NVENC / AMF / QSV / VideoToolbox) and do
  **not** need ffmpeg. AniCraft's MP4/WebM export does.
- ArtCraft Launcher (`%LOCALAPPDATA%\Programs\ArtCraft\Launcher\artcraft-launcher.exe`) is the
  installer/updater. It points all six apps at `D:\CRAFT`. Its local socket on 127.0.0.1:47413
  is a proprietary IPC channel — not HTTP, not MCP.

## Explainer effects kit — EffectCraft headless

Recipe, rationale and the nine compositions: `CONTRATO_FABRICA.md §3.4`.
Builder: `work\clone-tooling\explainer-effects.mjs`.

```sh
node work\clone-tooling\explainer-effects.mjs            # jsonl + PNG de QA + MP4 por comp
node work\clone-tooling\explainer-effects.mjs --frames   # só os PNG de QA
node work\clone-tooling\explainer-effects.mjs --dry      # só o jsonl e o plano
```

Outputs in `work\explainer-study\` (`build/`, `frames/`, `clips/`, `norm/`, demos).

### Command ids that exist headless

Do not guess these — several obvious spellings do **not** exist.

| need | id | notes |
| --- | --- | --- |
| new comp | `comp.new` | `{name,width,height,frameRate,duration,background}` |
| solid | `layer.newSolid` | `{name,color,width,height}` |
| rect / ellipse / star | `layer.newShape` | `{kind,size:[w,h],position:[cx,cy],fill,stroke,strokeWidth}` |
| free path | **`shape.newPath`** | `layer.newPath` does **not** exist |
| text | `layer.newText` | `{text,font,style,size,fill,box:[x,y,w,h],justify,...}` |
| text animation | `layer.applyTextPreset` | `typewriter` `fadeUpCharacters` `bounceInWords` `trackingIn` `scramble` `blurIn` `jitter` `dropInLines` |
| transform | `layer.setTransform` | `{layers,prop:'opacity'\|'rotation'\|'position'\|'scale',value}` |
| z-order | `layer.arrange` | `{layer,to:'front'\|'back'}` |

`layer.style.add` (outerGlow) exists but is awkward to tune headless — fake glow with three
stacked strokes instead (see the kit's `neonRect`).

### Traps

- **Colour is `#hex`, `[r,g,b]` or `false`.** The string `'none'` is rejected with
  `invalid parameters for layer.newShape: stroke`. Pass `false` for "no fill/stroke".
- **`applyStroke` paints over the fill.** Set `strokeOverFill: false`, otherwise heavy
  outlines swallow the glyph and the text renders as a solid black block.
- **Text `box` width decides wrapping.** Give slack (`W - x - 10` or `est * 1.7`); a box
  equal to the text width wraps at the hyphen (`HOME-MADE` → `HOME-` / `MADE`).
- **There is no text-measure command.** Estimate advances (`0.47` narrow, `0.8` wide,
  `0.626` default) for centring, and put an accent overlay on the same box origin.
- **Take QA frames at `duration * 0.9`.** A frame at ~1.6 s lands mid-preset
  (`fadeUpCharacters`/`scramble` still running) and looks broken — do not "fix" a non-bug.
- **`props` / `get` need `--project`** before the comp name, else `no composition "X"`.

### Workflow order (mandatory)

```sh
# 1. build the steps into a project
node .artcraft/artcraft.mjs cli effectcraft run --commands steps.jsonl --save-as out.ecproj
# 2. still frame to check the look
node .artcraft/artcraft.mjs cli effectcraft render-frame --project out.ecproj --comp NAME --time 3.1 --out f.png
# 3. real encode
node .artcraft/artcraft.mjs cli effectcraft render --project out.ecproj --comp NAME \
  --out clip.mp4 --format h264 --fps 30 --start 0 --end 4 --quality best --resolution full
```

`render` without a prior `run --save-as` fails with "select or open a composition".
The `.jsonl` must be JSON Lines (`lines.map(JSON.stringify).join('\n')`), never a
stringified JSON array.

### ffmpeg for concat / normalise

`command -v ffmpeg` returns nothing in Git Bash, and `WinGet\Links\` only holds `eza.exe`.
Call the hermes build directly:

```sh
FF="$LOCALAPPDATA/hermes/tools/ffmpeg-9.0.1-win32-x64/bin/ffmpeg.exe"
```

Normalise every clip to the same canvas before concatenating (`scale` + `pad` + `fps=30` +
`format=yuv420p`); the concat demuxer refuses mismatched streams.

## Style

Answer in the user's language. Keep confirmations short: what was produced, where it is,
and how to open it.

## Vídeo 3D (Blender) — padrão

Obra de referência: `work\eletricos-3d-blender\` (BYD Seal, 1:18).
Regras que se provaram na prática estão em `work\eletricos-3d-blender\PADRAO-3D.md`:
carro por modelo real (glTF Sketchfab) via `car.py`, armadilhas de import glTF
(rotation_mode quaternion, eixo Y, recentragem), plinto ≤ 0.94, `frame_key` só com o
carro, cabo de eletroposto com `lift` negativo, e o pipeline render → post → encode.

Renderizar só as cenas afetadas: `py render_all.py 2,3,4,8,10`.

## Radar diário de canais

Runs daily at 09:00 via the Windows task `ArtCraftRadar`
(`D:\CRAFT\.artcraft\yt-daily.cmd`, log at `work\research\daily.log`).

Chain (`yt-daily.mjs`): collect geral → collect dark/shorts → scan `/shorts` de cada
canal → ranking mundial → painel → relatório de clonagem (`clone-feasibility.md`).

```sh
# manual run
node D:\CRAFT\.artcraft\yt-daily.mjs

# serve the dashboard and accept clone requests
node D:\CRAFT\.artcraft\yt-daemon.mjs --open
#   -> http://127.0.0.1:8799
```

The dashboard (`work\research\dashboard\index.html`) is a single self-contained file:
category chips, sorting, grid/table toggle, inline YouTube player, and a **Clonar** button.
Thumbnails are downloaded once into `work\research\dashboard\thumbs\` (webp, cached across
runs) and **embedded as base64** in the HTML — never referenced from `i.ytimg.com`. Remote
images are blocked inside sandboxed preview panes, which renders as a grid of broken icons.
Embedding keeps the file working over `http://`, `file://` and offline (~1.5 MB for 99
thumbs). Cards are rendered server-side; JS only filters, sorts and opens the player.

**Classification is data, not code.** `D:\CRAFT\taxonomy.json` holds the niches, their
keywords (PT/EN/ES) and the `flags` array. A niche counts as **Dark** if and only if its
`flags` contains `"dark"` — add or remove the flag, add a niche, or force one channel via
`overrides`. A dark niche only wins if it scores ≥ 8 and ≥ 1.5× the runner-up, which stops
a single `#terror` tag inside a gaming channel from reclassifying the whole channel.
The panel exposes quick filters (Dark: todos / só dark / só não-dark; Formato: todos /
só longos / só shorts / com shorts) and sorts by views by default.

**Shorts must be measured on the channel's `/shorts` tab.** YouTube search does not index
Shorts: searching `facts shorts` sorted by upload date returns 20–40 minute long videos
whose titles merely contain the word (measured: median 1485 s, 1 real short in 141).
`yt-shorts-scan.mjs` reads `/channel/<id>/shorts` with a flat playlist and writes
`work\research\shorts-scan.json`; the dashboard and the clone report both consume it.
Without that file every channel looks long-form, which is the wrong conclusion.

The Clonar button copies a ready-to-paste prompt; if the daemon is running it also enqueues
to `work\research\queue.jsonl`.

**When the user asks to clone something from the queue**, read `work\research\queue.jsonl`,
take the `pending` entries, run them through `channel-clone-pipeline`, then mark each entry
`"status": "done"` with an `"output"` path.

Limits to state plainly, never paper over: **CTR is private analytics and unobtainable**;
the recent-view sample is a sample, not a census.

---

## VoiceCraft (TTS local) - `D:\CRAFT\VoiceCraft`

Servidor HTTP local que transforma **texto em voz humana** (10 provedores, fallback em
cascata, perfis adulto/infantil) e **masteriza** o audio com o SoundCraft.
Nao e um app ArtCraft: e um projeto Python 3.12 com venv propria.

| Item | Valor |
| --- | --- |
| Subir | `cd D:\CRAFT\VoiceCraft` e rodar `Iniciar API de Voz.bat` |
| Painel | http://127.0.0.1:8090 |
| API | `POST /api/tts` / `POST /v1/audio/speech` (OpenAI-compat) |
| Contrato | `D:\CRAFT\VoiceCraft\AGENTS.md` + `contrato-grafo.json` |
| Manual visual | `D:\CRAFT\VoiceCraft\MANUAL-QUADRINHOS.pdf` |
| Python | usar `D:\CRAFT\VoiceCraft\.venv\Scripts\python.exe` (nunca o do PATH) |
| Integracao | chama `D:\CRAFT\SoundCraft\soundcraft-cli.exe` para mastering |

Para gerar video com narracao: peca o MP3 em `POST /api/tts` e passe o arquivo para o
FilmCraft (mux) ou AniCraft (animacao).

---

## Autocine — prompt → vídeo completo

`D:\craft\work\autocine\` transforma **uma frase** em vídeo narrado: roteiro (LLM),
voz (VoiceCraft), cenas 3D (Blender), tipografia em pós (PIL), créditos, SRT e MP4.
Não é app ArtCraft; é um pipeline Python + Blender.

```sh
cd D:\craft\work\autocine
py autocine.py "seu tema" --preview        # rascunho 640x360 em ~5 min
py autocine.py "seu tema"                  # 1920x1080 final
py autocine.py "seu tema" --vertical       # 1080x1920 (Shorts, com avatar)
py autocine.py "seu tema" --only 4         # refaz só a cena 4 (cache por cena em .hash)
```

**API** (para outro programa chamar): `py -u api.py --port 8091` →
`POST /api/video {prompt, vertical, preview, scale, voz, perfil, workers, thumbs, trilha}`,
`GET /api/jobs/<id>`, `GET /api/files/<id>/<arquivo>`, `POST /api/plan`, `GET /api/health`.

**Contratos e manuais**
- `docs/contrato.json` — grafo máquina-legível (nós, arestas, artefatos, invariantes, custos).
- `MANUAL-QUADRINHOS.pdf` — manual visual em quadrinhos (fonte: `MANUAL-QUADRINHOS.html`).
- `README.md` — uso, layouts 16:9 × 9:16, capas A/B, limites honestos.
- `AUDITORIA.md` — o que foi medido.

**Templates de cena**: `title`, `counter`, `bars`, `list`, `map`, `hero`.

### Armadilhas que custaram render

| sintoma | causa | conserto |
| --- | --- | --- |
| PNG em `C:\out\...`, pasta do projeto vazia | **Blender roda com CWD=`C:\`**; `_dir` relativo escapa | passar sempre caminho absoluto (`pasta.resolve()`) |
| cena "ok" e zero quadros | render devolveu 0 sem gravar | `_render_cena` confere `framesSUF/sNN/f_*.png` e falha alto |
| blocos cortados / câmera colada | enquadramento medido no **quadro 1**, quando a escala animada está em 2% | `enquadra_caixa(lo, hi, ...)` com a caixa real |
| capa com blocos achatados | chapa renderizada com `dur=2/24` (2 quadros) | dur ≥ 1,2 s para o pop-in terminar |
| capa com a cena do anel, fora do tema | `title` em 16:9 ainda desenha o anel + estrelas | escolher `hero>map>bars>counter>list`; `title` só em último caso |
| capa 1 com título cortado | laço de ajuste de fonte não convergia | `_ajusta()` reduz até caber em 4 linhas |
| job da API "travado" para sempre | filho sem `-u` → stdout em buffer; leitor do pipe morre | spawnar com `-u` e proteger o `print` |
| roteiro genérico ("plano local") | chave OpenRouter **sem crédito (402)** | cadeia `MODELOS` em `brain.py`: pago → `:free` (ernie/particle/nemotron) → fallback |

### Regras de operação

1. **Aprovar o `--preview` antes de gastar GPU.** É 1/4 do tempo.
2. Texto **sempre** em pós (PIL). Corrigir uma palavra = re-encodar, não re-renderizar.
3. `plan.json` é a fonte da verdade: o mesmo plano reproduz o mesmo vídeo nos três formatos.
4. Capa é chapa limpa + tipografia; a chapa fica em `capas/`.
5. Não inventar número: o LLM pode escrever um dado sem fonte — conferir antes de publicar.
6. Modelo 3D CC-BY exige crédito: `CREDITOS.txt` já sai pronto, colar na descrição.

Saída: `work\autocine\out\<slug>\` (`mp4`, `plan.json`, `legenda.srt`, `CREDITOS.txt`,
`thumb-1..3.jpg`, `narracao.wav`, `mix.wav`).

---

## GATILHO OBRIGATÓRIO — animação Frida & Luna

Antes de **gerar imagens, animar, renderizar ou mexer nas personagens**, lê
`D:\CRAFT\CONTRATO-ANIMACAO.md` e corre:

```sh
py D:\CRAFT\work\frida-luna\verificar_contrato.py
```

O contrato consolida as regras de ouro, as 9 regras de continuidade, os limiares medidos
e as decisões do utilizador. Se o script disser que há uma porta fechada, **parar e corrigir
antes de continuar**. Nunca gerar sem a referência aprovada anexada, nunca aceitar outra
personagem e nunca avançar para o render final sem a amostra aprovada.
