# AUDITORIA DE CLONE — o que é preciso para clonar um vídeo viral

Data: 13/11/2026
Referência medida: `https://youtube.com/shorts/yccXYW5liLE` ("The easiest way to make
whiteboard explainers", Guney Topcu / AI Made Easy)
Ficheiro de análise: `work/reference/ref5/ref1080.mp4`, `anatomy.json`, `faces.json`,
`shots-merged.json`, `shots-sheet.png`

---

## 1. O que foi medido (não estimado)

### 1.1 O ficheiro

| Propriedade | Valor medido |
| --- | --- |
| Melhor stream disponível | **1080×1920, H.264 (avc1.640028), 1921 kb/s** + AAC 128 kb/s |
| Duração | **60,23 s** |
| Frames | **1803** @ 29,97 fps |
| Streams alternativos | av01 1080p 826k, vp9 1080p 1022k, 720p avc1 1042k, 608×1080 av01 |
| Tamanho | 15,4 MB (mux 1080p + áudio) |

A análise anterior dizia "AV1, 608×1080, 60,16 s, ~3,4 MB". Isso é apenas o stream
progressivo de 608×1080. O YouTube serve 1080×1920 em H.264 — que é o que interessa para
medir texto, cara e cortes com precisão.

### 1.2 O ritmo (ffmpeg scene detection, threshold 0.15)

| Métrica | Valor |
| --- | --- |
| Planos | **33** |
| Cortes | 32 |
| Cortes por minuto | **31,9** |
| Duração mediana do plano | **1,8 s** |
| Plano mais curto / mais longo | **0,1 s** / **4,6 s** |

Um clone com cenas de 12 s (o que o pipeline faz hoje) não se parece com isto em ritmo
nenhum. O original troca de plano a cada ~2 s.

### 1.3 A divisão de ecrã (por plano)

Classificação automática dos 33 planos, cruzada com detecção facial:

| Tipo de plano | Quantos |
| --- | --- |
| `split` (gráfico em cima, apresentador em baixo) | **16** |
| `full-whiteboard` (quadro branco, frame inteiro) | **9** |
| `full-graphic` (só interface/gráfico, sem pessoa) | **7** |
| `presenter-top` (apresentador em cima) | **1** |

| Geometria | Valor |
| --- | --- |
| Linha de divisão (topo da cabeça) | **mediana 57%** da altura; varia **17%–79%** |
| Altura da cara | **28%** da altura da frame (~538 px em 1920) |
| Cara presente | **115/181 amostras (64%)**, a 3 amostras/s |
| Topo da cara | **58%** da altura (mediana) |

Conclusão dura: **não existe um layout.** Existem 33 planos com geometrias diferentes, e a
divisão muda dentro do próprio vídeo. Qualquer pipeline com `layout.topRatio` global
(como era o nosso, 0,55 fixo) está estruturalmente errado para este tipo de vídeo.

### 1.4 O texto

| Propriedade | Valor medido |
| --- | --- |
| Onde está a frase | **14 planos em baixo / 13 no meio / 6 no topo** |
| Camadas de texto | **uma** — não há kicker + headline + body + legenda |
| Caixa | maiúsculas, condensada, peso máximo |
| Cor | branco com **uma palavra em laranja** (`#FF6A00`–`#FF8A3D`) |
| Contorno | preto, muito grosso (~8–12 px a 1080) |
| Cor de acento dominante na frame | detetada em 21 dos 33 planos |

A decisão anterior do projeto — "texto sempre no topo" — veio de 5 shorts observados à mão.
Medido com cor de acento por linha: é falso. O texto ocupa **o espaço vazio do plano**, que
na maioria das vezes é em baixo, por cima do peito do apresentador ou sobre o quadro branco.

### 1.5 Estrutura narrativa

Sequência real dos 33 planos: whiteboard (0–6 s) → apresentador com gráfico (6–24 s) →
alternância cerrada apresentador/aplicação/whiteboard (24–58 s) → whiteboard de fecho
(58–60 s). Uma única ideia, explicada em 33 batidas curtas.

---

## 2. Correções à análise anterior

Sete afirmações da auditoria que colada estavam desactualizadas ou erradas. Verifiquei cada
uma contra o código e o hardware.

| # | Afirmação | Veredicto | Prova |
| --- | --- | --- | --- |
| 1 | "É AV1 608×1080, 60,16 s" | **Errado** | Existe 1080×1920 H.264, 60,23 s, 1803 frames |
| 2 | "Não há lip-sync palavra a palavra localmente" | **Errado** | Wav2Lip instalado em `tools/Wav2Lip`, corre na GTX 1060: clipe de 12,4 s, 25 fps, áudio embutido |
| 3 | "Gestos exigem 16–24 GB / cloud" | **Meio certo** | LivePortrait aceita **vídeo** como driving: pose de cabeça + expressão transferem localmente. Braços/mãos não — isso precisa de pose → puppet, outro produto |
| 4 | "Texto está no topo" | **Errado** | 14 em baixo, 13 no meio, 6 no topo |
| 5 | "Uma divisão de ecrã" | **Errado** | 16 split / 9 whiteboard / 7 gráfico, divisão 17%–79% |
| 6 | "Não existe análise de referência" | **Meio certo** | `yt-format-profile.mjs` já media cortes e paleta. Faltava apresentador, tipo de plano, lado do texto, acento — agora existe (`yt-ref-anatomy.mjs`, `ref-face-detect.py`) |
| 7 | "Reconstruir o whiteboard sai do escopo" | **Certo para os traços, errado para o look** | Reproduzir o traço original exigiria vetorização do desenho. Produzir um quadro branco com desenho progressivo é produção de assets, não tecnologia em falta |

O que a análise anterior acertou e continua verdadeiro: **CTR é privado e inobtenível**;
MuseTalk (16 GB) e Hunyuan (24 GB) não correm nesta GPU; publicação no YouTube não está
implementada (sem OAuth).

---

## 3. O que falta, por ordem de valor

### Nível A — dá para fazer hoje, com o que já está instalado

| # | Peça | Estado |
| --- | --- | --- |
| A1 | **Anatomia automática da referência** — cortes, tipo de plano, cara, linha de divisão, lado do texto, cor de acento | **FEITO** nesta passagem (`yt-ref-anatomy.mjs` + `ref-face-detect.py`) |
| A2 | **Layout por plano** — cada cena escolhe `split`/`full` e onde fica a costura | **FEITO** (`sceneLayout`, `scene.splitRatio`) |
| A3 | **Uma frase em vez de três camadas**, com palavra em laranja | **FEITO** (`textStyle.mode: 'caption'` + `{palavra}`) |
| A4 | **Texto por cima do apresentador** (a camada ASS, não o cartão) | **FEITO** (style `Head`) |
| A5 | **Lip-sync palavra a palavra** | Ferramenta pronta (Wav2Lip + `wav2lip_gan.pth` verificados). Desenho completo em `work/plans/FECHAR-LACUNAS-CLONE.md` §5; falta ligar ao build |
| A6 | **Transferência de expressão/pose de cabeça do original** | LivePortrait aceita vídeo. Recorte da cara como driving: desenho em `work/plans/FECHAR-LACUNAS-CLONE.md` §6 |
| A7 | **Ritmo de corte do original** | **FEITO** — `yt-edl.mjs` lê `shots-merged.json` e escreve `plan.json`; o build respeita `scene.seconds`. Medido: 1 → 26 planos detetados, 0,0 → 23,4 cortes/min (referência 31,9). Ver `work/plans/FECHAR-LACUNAS-CLONE.md` §3 |
| A8 | **Guião a partir do vídeo** | Falta: transcrição com timestamps → cenas. `whisper`/`faster-whisper` **não** estão instalados; caminho barato é `yt-dlp --write-auto-subs`. Desenho em `work/plans/FECHAR-LACUNAS-CLONE.md` §4 |

> **Actualização 13/11/2026 (A7 fechado).** O ritmo deixou de ser estimado: `yt-edl.mjs`
> planeia os planos a partir de `shots-merged.json` e o build obedece. Medido no mesmo
> short: **1 → 26 planos detetados, 0,0 → 23,4 cortes/min** (referência 31,9), duração
> 64,1 s contra 60,2 s, desvio médio 0,14 s por plano. O resto do caminho e os desenhos de
> A5/A6/A8 estão em `work/plans/FECHAR-LACUNAS-CLONE.md`.
>
> **Aviso de dados:** para geometria, a fonte é `shots-merged.json`, **não** `anatomy.json`
> — o `splitLine` do `anatomy.json` dá mediana 0,024 contra 0,572 real, porque a caixa do
> apresentador cobre a frame toda em 23 dos 33 planos.

### Nível B — precisa de trabalho de produto, não de instalação

| # | Peça | O que exige |
| --- | --- | --- |
| B1 | Braços e mãos do apresentador | Deteção de pose (MediaPipe) + rig 2D do avatar. Semanas, não horas |
| B2 | Whiteboard desenhado progressivamente | Assets com traço animado (SVG stroke-dashoffset → EffectCraft). Produção, não CV |
| B3 | Micro-animações exactas (seta que desenha, reveal à mão) | Biblioteca de presets + mapeamento por descrição da referência |

### Nível C — fora do alcance desta máquina

MuseTalk / HunyuanVideo-Avatar (vídeo foto-realista audio-driven) em 6 GB: não. Só cloud.

---

## 4. O que mudou no pipeline nesta passagem

### 4.1 `yt-ref-anatomy.mjs` (novo)

Mede um vídeo de referência sem dependências novas: decodifica para rgb24 48×84 com ffmpeg
e faz a matemática em Node (sem sharp, sem jimp, sem pngjs).

```sh
node .artcraft/yt-ref-anatomy.mjs --video ref.mp4 --out anatomy.json --frames shots/
```

Produz: lista de cortes, por plano o tipo (whiteboard / talking-head / screen), lado do
texto, cor de acento, energia de movimento, e ainda uma still por plano.

### 4.2 `tools/ref-face-detect.py` (novo)

Usa o **S3FD que já vinha com o Wav2Lip** — zero instalações. Diz se o blob quente num plano
é uma cara ou a mão a desenhar, e devolve a caixa normalizada.

```sh
D:\Comfy\ComfyUI\venv\Scripts\python.exe tools\ref-face-detect.py --video ref.mp4 --out faces.json
```

### 4.3 Layout por plano (`yt-clone-build.mjs`)

```json
{ "id": "s03", "layout": "full", "textSide": "mid", "splitRatio": 0.5 }
```

- `layout`: `split` | `full` (sobrepõe `layout.mode` só nesta cena)
- `splitRatio`: 0,2–0,9 — onde fica a costura **nesta** cena
- `textSide`: `auto` | `top` | `mid` | `bottom` — `auto` põe a frase no vazio do plano

O cartão de cada cena passa a ser construído com a altura dessa cena, não com uma altura
global. Sem isto, uma cena `full` ficava com um cartão de 1056 px esticado para 1920.

### 4.4 Uma frase, com palavra em laranja (`cards.textStyle`)

```json
{
  "mode": "caption",
  "highlight": { "mode": "markers", "color": "#FF6A00" }
}
```

Em `caption`, o cartão deixa de ter kicker/headline/body e a frase é queimada no passo ASS,
com `\pos` calculado por cena — é a única forma de pintar por cima do apresentador, porque
um cartão só pinta dentro da sua própria banda.

Texto da cena: `"THEN {CLAUDE} ANIMATES"` → `CLAUDE` sai em laranja.

### 4.5 Ficheiros tocados

| Ficheiro | O que mudou |
| --- | --- |
| `.artcraft/yt-ref-anatomy.mjs` | novo — anatomia da referência |
| `tools/ref-face-detect.py` | novo — presença e caixa da cara (S3FD) |
| `.artcraft/yt-clone-build.mjs` | `sceneLayout`, `textAnchorY`, `highlightRuns`, `accentRuns`, style `Head`, cartão por cena |
| `clone.config.json` | `layout.perShot`, `layout.textSide`, `textStyle.mode`, `textStyle.highlight`, `subtitle.head*` |

Nada foi removido: `mode: "layers"` continua a produzir o desenho antigo, e
`layout.perShot: false` volta ao layout global fixo.

---

## 5. Declaração de limites

Não afirmo que o pipeline clona este vídeo frame a frame. Não clona:

- os traços exactos do whiteboard (não há vetorização da referência);
- os braços e mãos do apresentador (LivePortrait move cabeça e expressão, não o corpo);
- a animação exacta de cada elemento gráfico (temos presets, não replay de keyframes).

Afirmo, com medição, que a partir de agora o pipeline **sabe** como o vídeo de referência
está construído — 33 planos, que tipo tem cada um, onde está a cara em cada um, onde está o
texto e de que cor — e que produz com essa geometria, com a Frida no lugar do apresentador.
