# O Parque dos Pets — Remotion

Composição **`Episodio`**: 1920×1080, 30 fps, **5882 frames** (196,07 s).
Fundos aprovados, sprites com alfa, câmara simples, legenda e o áudio original.

**Fonte dos números:** `../DIRECAO-ARTE.md` — o gerador lê a **tabela A** (chão, alturas,
x ini→fim, sombras, "à frente", câmara) e as **regras B** (mapa de expressões, 0,94× em
beats de fala, excepções de altura). Nenhum número é inventado no compositor.

```
remotion/
  gerar_timeline.mjs      le DIRECAO-ARTE.md + beats + tempos + manifest -> timeline.json
  preparar_publico.mjs    liga/copia os assets para public/
  timeline.json           gerado (contrato consumido pela composição)
  timeline.example.json   exemplo mínimo do contrato + fallback de segurança
  src/index.ts            registerRoot
  src/Root.tsx            <Composition id="Episodio" 1920x1080 30fps 5882f>
  src/Episodio.tsx        fundo/câmara, elenco, sombras, z-order, legenda, áudio
  src/timeline.ts         tipos + leitura de public/timeline.json
  public/                 assets servidos por staticFile()
```

## 1. Gerar o timeline

```sh
cd D:\CRAFT\work\frida-luna\remotion
npm run gerar
```

Lê `../DIRECAO-ARTE.md`, `../animacao/plano-por-beat.json`, `../sequence-plan.json`,
`../audio/tempos.json` e `../movimentos/manifest.json`. Escreve `timeline.json` e
`public/timeline.json`. Descobre também ciclos ainda não manifestados em
`movimentos/<quem>/<nome>/` — aceita qualquer nome e qualquer número de frames; sem
manifest, usa **7,5 fps**. Valida a soma dos frames, a proporção 0,72 (com a excepção
0,94× dos beats de fala) e o passo máximo de 8 px/frame.

## 2. Preparar os assets

```sh
npm run preparar
```

Copia os 11 fundos de `bg/flow/` para `public/bg/flow/`, as 8 expressões de `chars/poses-v3/{frida,luna}/` e
`audio/{voz,musica}.wav` para `public/`. `public/movimentos/{frida,luna}` é uma **junção**
para `movimentos/{frida,luna}`: novos ciclos aparecem sem recopiar. Idempotente.

## 3. Verificar e renderizar

```sh
npm run compositions        # deve listar Episodio 1920x1080 30fps 5882f
npm run sample              # amostra 10 s, meia resolução -> _remotion-sample.mp4
npm run render              # episódio completo -> ../card/parque-dos-petes.mp4
```

Render final (equivalente ao `npm run render`):

```sh
cd D:\CRAFT\work\frida-luna\remotion
npx remotion render src/index.ts Episodio ..\card\parque-dos-petes.mp4 --codec=h264 --pixel-format=yuv420p --crf=18
```

Para ver no browser: `npm run studio`.

## 4. Contrato do `timeline.json`

```jsonc
{
  "fps": 30, "width": 1920, "height": 1080, "durationInFrames": 5882,
  "audio": "audio/voz.wav", "musica": "audio/musica.wav", "musicaVolume": 0.12,
  "banco": { "frida/marcha-flow10": { "fps": 10, "frames": ["movimentos/frida/marcha-flow10/f00.png", "..."] } },
  "expressoes": { "frida": { "happy": "chars/poses-v3/frida/happy.png", "..." } },
  "scenes": [{
    "scene": "hook", "from": 0, "durationInFrames": 505,
    "bg": "bg/flow/hook.png", "chao": 1000,
    "camera": { "move": "push-in", "amount": 0.06, "tilt": 0, "fundoTremor": 0, "nota": "..." },
    "sombraFrida": { "w": 280, "h": 16, "op": 0.2, "dx": 0, "dy": 0 },
    "beats": [{
      "i": 1, "from": 116, "durationInFrames": 122,
      "frida": { "mov": "escuta", "expr": "surprised", "x": 1400, "y": 1000, "h": 620,
                 "flip": false,
                 "sombra": { "w": 280, "h": 16, "op": 0.2, "dx": 0, "dy": 0 },
                 "frente": false },
      "luna": { "mov": "escuta", "expr": "excited", "x": 500, "y": 1000, "h": 446, "frente": true },
      "caption": "E se os animais tivessem um parque..."
    }]
  }]
}
```

Regras aplicadas (todas do `DIRECAO-ARTE.md`):

- **`y` é o chão da cena** (972–1012 px), igual para as duas; a sombra `#2A1A12`
  fica centrada **6 px abaixo dos pés**, com `w×h @ op`, `dx`/`dy` da tabela e blur 2 px.
- **Alturas**: 620/446, 760/547 e 380/274 (0,72). Beats 16–18 e 22 usam 380/274;
  beat 29 usa 620/446. Em beats com falante designado (4, 14, 22, 26), quem escuta
  fica a **0,94×** e recua **12 px** em x.
- **`x`** interpola ini→fim da tabela ao longo da cena (≤ 0,2 px/frame, longe do limite
  de 8 px/frame).
- **Câmara**: `amount` é fracção em `push-in`/`zoom` (≤ 0,06 / 0,03) e **px** em `pan`
  (≤ 140) / `tilt` (≤ 90). `tilt` extra em `montanha`; `fundoTremor: 4` em `espelhos`
  (`frame % 12`, **só no fundo**). **O elenco nunca se desloca com a câmara** (factor 0,00).
- **z-order**: fundo → objectos → personagem que não está "à frente" → personagem que
  está → legenda → áudio.
- **Sem interpolação entre desenhos**: `índice = floor(local / (30 / fps_anim)) % n`
  (7,5 fps → 4 frames por desenho). Corte seco.
- **Fallback**: movimento sem ciclo → pose estática da expressão; expressão fora das 8
  folhas segue o mapa obrigatório (`shy/scared→scared`, `curious/confused→surprised`,
  `proud/calm→happy`, `mischievous→silly`, `jump→excited`). Nunca desaparece.
- **Beat.from/duration** vêm de `vozFrom/vozFrames`: a legenda só aparece durante a fala.
- **Som**: `voz.wav` a volume 1 e `musica.wav` a 0,12. Determinismo: só `useCurrentFrame()`.

### Limites honestos

Um PNG por cena: o `parallax 0,35/0,65` de `portao`/`tunel` é representado pelo pan do
fundo, sem camadas separadas. Não há lip-sync, foco real, reflexo dinâmico nem
interacção física — ver secção D do `DIRECAO-ARTE.md`.
