# Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)

**Autor:** Especialista-Áudio e Avatar · **Data:** 2026-11-17
**Entradas:** `ref/audio.wav` (196,069 s, intocável), `ref/words.json` (44 segmentos,
451 palavras), `audio/voz.wav` (stem real), `audio/tempos.json` (44 blocos, 5 882 frames).
**Alvo:** 30 fps · 5 882 frames · mix final a −14 LUFS (medido: o original **já está** a
−14,0 LUFS integrado).

---

## 0. Resumo executivo

| Decisão | Valor | Porquê |
| --- | --- | --- |
| Método | **RMS por energia** (não Wav2Lip, não LivePortrait) | não existe vídeo de rosto; as personagens são desenho 2D com boca em camada separada |
| Janela de análise | **40 ms** (1 764 amostras a 44,1 kHz), centrada no frame | cobre o ataque de oclusivas (`p`, `t`, `b`) sem perder o frame; 33 ms (1 frame) deixa frames sem energia a meio de vogal |
| Passo | 1 frame = 33,3 ms (janelas sobrepostas 1,2×) | um valor por frame, determinístico |
| Níveis de boca | **3** (fechada / meia / aberta) | as folhas só têm 2 desenhos de boca; o 3.º nível sai por escala da mandíbula. 4 níveis exigiria um desenho novo (“boca em O”) e não paga o custo |
| Origem do sinal | `audio/voz.wav` (Demucs, separação **real**) | contraste fala/pausa 16,6 dB no stem de voz (era 5,45 dB na mistura) |
| Quem mexe a boca | só quem tem `speaker: frida` ou `luna` — **5 segmentos, 437 frames (7,4 %)** | o resto é narrador; pôr as duas cadelas a morder o ar durante a narração parece dobragem mal feita |
| Nas pausas | boca **fechada e parada**, pose mantida | 98,4 % dos frames de pausa já fecham sozinhos; a histerese resolve os 1,6 % restantes |
| Custo GPU | zero | numpy puro no build; o vídeo renderiza no Remotion |

Ficheiros de apoio já gerados: `audio/voz.wav`, `audio/musica.wav`,
`audio/tempos.json`, `audio/energia-voz.json`, `audio/relatorio-stems.json`,
`audio/RELATORIO-stems.md`.

---

## 1. Porque não se usa avatar neuronal

- Não há vídeo do rosto a animar: as personagens finais vêm das folhas de expressão
  (`chars/frida-model-sheet.png`, `chars/luna-model-sheet.png`) — SVG/GIF gerado por IA
  foi reprovado pela regra 6 do `AGENTES.md`.
- Wav2Lip/LivePortrait inventam píxeis de boca fotorrealistas: num desenho de contorno
  grosso isso aparece como um borrão. Além disso ocupam 4–6 GB de VRAM e obrigariam a
  fila sequencial com o ComfyUI.
- O motor já existe no ecossistema: `D:\CRAFT\OpenMontage\remotion-composer\src\projeto-quatro-estacoes\SincronizacaoLabial.ts`
  (`aberturaBocaNoFrame`) e o gerador
  `D:\CRAFT\video-orquestracao\tools\gerar_sincronizacao_labial_quatro_estacoes.py`.
  Reaproveita-se o motor; muda-se apenas a **fonte** (stem de voz em vez de narração
  limpa, porque aqui voz e música vêm juntas) e o **mapeamento para sprites**.

---

## 2. Janela de análise: 40 ms, passo 1 frame

```
taxa            = 44 100 Hz
janela          = 0,040 s  ->  1 764 amostras
passo           = 1/30 s   ->  1 470 amostras  (sobreposição 20 %)
centro do frame = round(frame * 1470)
rms[f]          = sqrt(mean(voz[centro-882 : centro+882] ** 2))
padding         = "edge" nos 20 ms iniciais e finais (não inventa silêncio)
```

Comparação prática com a janela de 33 ms usada no projecto anterior: a 30 fps uma janela
de 1 frame apanha, em média, 1 em cada 6 frames com energia quase nula a meio de uma
vogal (o RMS cai e a boca fecha e abre). A janela de 40 ms sobrepõe-se ao frame seguinte e
suaviza isso já na origem — menos trabalho para o filtro depois.

`audio/medir_energia_voz.py` faz exactamente este cálculo e é a implementação de
referência. Correr: `py audio/medir_energia_voz.py`.

---

## 3. Normalização e limiares (valores medidos, não inventados)

De `audio/energia-voz.json` (5 882 frames, stem de voz real):

| grandeza | valor |
| --- | --- |
| piso (percentil 10) | **0,00053** RMS |
| topo (percentil 98) | **0,2857** RMS |
| mediana | 0,0949 |
| p90 / p99 | 0,2156 / 0,3081 |
| abertura média (0..1) | 0,3495 |

```
abertura[f] = clip((rms[f] - 0.00053) / (0.2857 - 0.00053), 0, 1)
```

Os dois números ficam **fixos no código** (constantes `PISO_RMS`, `TOPO_RMS`). Não se
recalcula percentil em runtime: se a cena for renderizada isolada, os percentis mudariam e
a boca passaria a abrir de forma diferente da cena vizinha — a timeline deixaria de ser
consistente. Este é o único ponto em que se diverge do gerador antigo (que normaliza por
ficheiro).

Depois da normalização, na ordem:

1. **Gate de silêncio:** `abertura < 0,10` → 0. (O piso já é baixo; o gate serve para o
   resíduo de música do Demucs não encostar no nível 1.)
2. **Suavização:** média móvel de 3 frames (100 ms) — `JANELA_SUAVIZACAO = 3`, igual ao
   motor existente. Jitter médio medido entre frames vizinhos: **0,113**; a média de 3
   frames corta o tremor sem atrasar o ataque mais do que 1 frame.
3. **Quantização em 3 níveis** com histerese (secção 4).

---

## 4. Quantos níveis: 3 (não 4)

### Distribuição real com 3 níveis

| nível | limiar | frames | % do vídeo |
| --- | --- | --- | --- |
| 0 — fechada | `a < 0,34` | 2 986 | 50,8 % |
| 1 — meia | `0,34 ≤ a < 0,67` | 2 014 | 34,2 % |
| 2 — aberta | `a ≥ 0,67` | 882 | 15,0 % |

Transições de nível: **1 576** em 5 882 frames (uma a cada 3,7 frames) — a boca mexe
durante a fala e fica quieta fora dela.

### Porque não 4

Quatro níveis (`fechada / meia / aberta / O`) distinguem vogais arredondadas (`o`, `u`) das
abertas (`a`). Para isso é preciso um **terceiro desenho** de boca em cada pose. As folhas
actuais só têm duas bocas por personagem (fechada com sorriso e aberta com língua). O
ganho num vídeo infantil de focinho de cão, a 640×360 no original, não paga o custo de
redesenhar 13 poses × 2 personagens. **Fica 3.** Se o Artista-desenho entregar a boca em
“O” na pose `excited`, sobe-se para 4 sem mexer no motor: `limiares = 0,25 / 0,50 / 0,75`.

### Histerese e permanência mínima (anti-tremor)

```
para SUBIR de nível:   a > limiar + 0,06
para DESCER de nível:  a < limiar - 0,06
permanência mínima:    2 frames (66 ms) em cada nível
```

Sem isto a boca “vibra” nos 1,6 % de frames de pausa que ainda têm resíduo de música, e nos
39,5 % de frames dentro de palavra em que o RMS cai (oclusivas, consoantes finais). A
histerese é mais barata e mais previsível que aumentar a janela.

### Regra da palavra (importante)

39,5 % dos frames **dentro de uma palavra** caem no nível 0 com o gate simples — ou seja, a
boca fecha a meio da palavra falada. Correção: para cada uma das 451 palavras de
`ref/words.json`, se o pico de abertura na janela da palavra for `≥ 0,25`, força o nível
mínimo 1 no miolo da palavra (do 20 % ao 80 % da sua duração) e garante **uma** passagem
por nível 2 se o pico for `≥ 0,70`. Fora das palavras, manda o RMS puro. Resultado: boca
fechada só entre palavras, nunca a meio de uma sílaba tónica.

---

## 5. Como casar com as poses das folhas de expressão

### 5.1 Estrutura de sprite exigida ao Artista-desenho

Cada pose é composta por **três camadas separadas**, com a mesma origem (o canto superior
esquerdo do focinho, em px, na resolução da folha):

```
frida-<pose>-corpo.png      corpo + cabeça, boca em falta (fundo transparente)
frida-<pose>-boca-0.png     boca fechada  (a do desenho actual)
frida-<pose>-boca-2.png     boca aberta   (a do desenho actual)
```

O nível 1 **não é ficheiro novo**: é `boca-2` com `scaleY 0,55`, origem no bordo superior
da boca, e a língua escondida (`opacity 0` no sub-sprite da língua). Isso dá a meia-abertura
sem custo de desenho e sem salto de contorno.

Ancoragem: a boca sobrepõe-se ao focinho com o mesmo `anchor` nas 3 camadas; o corpo nunca
é recortado pela boca (a boca fica por cima, com `zIndex` local).

### 5.2 Pose → tratamento da boca

As poses vêm de `tempos.json` (`poses.frida` / `poses.luna`), uma por segmento. 13 poses
distintas: `surprised, excited, happy, silly, loved, shy, proud, calm, curious, jump,
mischievous, scared, confused`.

| pose | boca base (desenho) | lip-sync? | nota |
| --- | --- | --- | --- |
| `calm`, `proud`, `shy`, `curious`, `confused`, `mischievous` | fechada | **sim** quando é a falante | caso normal |
| `happy`, `loved` | fechada com sorriso | **sim** | o sorriso vive na camada do corpo, a boca abre por cima |
| `excited`, `silly` | aberta com língua | **sim** | nível 2 = desenho de origem; nível 0 usa a boca fechada da mesma pose |
| `jump` | aberta (esforço) | **não** — boca fixa no nível 2 | pulo é acção, não fala; mexer a boca tira o impacto |
| `scared` | aberta/grito | **não** — boca fixa no nível 2 (ver 5.3) | |

### 5.3 Poses que já têm a boca aberta no desenho

`scared` e `jump` têm a boca desenhada em esforço. Duas regras:

- Lip-sync desligado nesses blocos: fica o desenho, com um tremor de 1 px a 3 Hz
  (`interpolate` + `Math.sin(frame * ...)`, nunca `useFrame`).
- `scared` em bloco **falado** (acontece na cena `montanha`, beats 16–17, falante =
  narrador): mantém-se o grito desenhado e a fala é do narrador — coerente.

### 5.4 Movimento secundário (não áudio)

Sobrancelha e orelha não são lip-sync: seguem a pose e o `cam` do beat (ex.: beat 17, “vento
a balançar as orelhas”). Ficam num `interpolate` por cima da boca, sem tocar no valor RMS.

---

## 6. Quem fala (vem de `beats.json`, `speaker`)

| beat | falante | cena | frames (`from`/`dur`) | texto |
| --- | --- | --- | --- | --- |
| 4 | frida | abertura | 483 / 62 | “Olha, pessoal!” |
| 5 | frida | abertura | 545 / 85 | “Que alegria ter vocês aqui…” |
| 14 | frida | montanha | 1686 / 112 | “Vamos ver quem chega primeiro…” |
| 22 | frida | roda | 2716 / 95 | “Dá para ver o parque inteiro…” |
| 26 | luna | carrossel | 3256 / 83 | “Girar assim dá uma tontura boa.” |

Total **437 frames** (7,4 % do vídeo) com boca animada por RMS. Os outros 39 segmentos têm
`speaker: narrador`: as cadelas **não** articulam — mantêm a boca da pose e reagem com
olhos/orelhas/corpo (`action` do beat). Isto evita o efeito “dobragem dessincronizada”, que
é o defeito mais visível em vídeos infantis clonados.

Modo opcional (desligado por omissão, decisão do Diretor-Arte): durante a narração, a
personagem em quadro faz “boca de escuta” — nível 1 a 60 % da amplitude do envelope, só nos
beats de `hook` e no refrão final, para dar vida sem fingir que fala. Nunca nos dois
personagens ao mesmo tempo.

---

## 7. O que fazer nas pausas

1. **Entre frases (43 vãos: mediana 0,50 s, média 0,61 s, máximo 1,50 s; mais o vão inicial
   de 3,86 s e o rabo final de 5,65 s, que são os maiores de todos):** nível 0 fixo. Nada de
   micro-aberturas. A pose do beat anterior é mantida até ao fim do bloco
   (`tempos.json.toExclusive`) e a transição de pose é feita no início do bloco seguinte,
   com 6 frames de crossfade.
   **Excepção — 3 vãos de 0,0 s** (beats 13→14, 19→20, 31→32, frases coladas): aí a boca
   **não fecha**: mantém nível 1 e faz a transição de pose em 3 frames. Fechar e reabrir em
   66 ms lê-se como soluço.
2. **Dentro do bloco, antes da primeira palavra** (`silencioAntes` em `tempos.json`, 0,09 s a
   0,74 s): boca fechada; o movimento é do corpo (respiração: `scaleY` 1 → 1,012 em 90
   frames).
3. **Beat 4 (“Olha, pessoal!”) começa 0,74 s depois do fim do beat 3** (o maior vão depois
   da abertura) — boca fecha em 12 frames (400 ms) e reabre no ataque; não se antecipa a
   boca ao áudio.
4. **Fim do vídeo:** a última fala termina a 190,42 s (frame 5 713). De 5 713 a 5 882 a boca
   fica fechada e o cartão final respira. É o único sítio onde se pode usar o sorriso
   `loved` estático sem parecer congelado.
5. **Nunca** interpolar a boca de um bloco para o seguinte através de uma pausa longa: o
   valor tem de bater em 0 e **ficar** em 0, senão a boca “desliza” sozinha no silêncio.

---

## 8. Implementação (Remotion, determinística)

Fonte de verdade: `audio/tempos.json` (44 blocos, soma exacta 5 882) + `audio/energia-voz.json`.
O passo seguinte (ainda **não** gerado nesta entrega, é trabalho de código para o
Dev-Motion-QA) é um `gerar_boca_frames.py` que produza, por personagem falante, um array de
5 882 inteiros (0/1/2) e um array de aberturas contínuas (0..1) para o nível 1 por escala.
`medir_energia_voz.py` já tem o cálculo do envelope: falta só a quantização com histerese,
a regra das 451 palavras e a gravação em `.json` + `.ts`.

```
// dentro de <Sequence from={bloco.from} durationInFrames={bloco.durationInFrames}>
const abertura = aberturaBocaNoFrame(VALORES_BOCA_FRIDA, frame);
// abertura -> nível com histerese já resolvida no build
const nivel = NIVEIS_BOCA_FRIDA[frame];
```

Regras:
- Só `useCurrentFrame()` + `interpolate()`. Proibido `useFrame()` do R3F (`AGENTES.md`, regra 3).
- Nada de `Math.random()` nem de relógio de parede: o mesmo frame tem de dar sempre o mesmo
  pixel, senão o render por cenas isoladas não fecha.
- A curva do nível 2 volta ao 0 com `interpolate` de 2 frames — o corte seco do limiar
  faria a mandíbula “teleportar”.

---

## 9. Gates de QA (para o Dev-Motion-QA)

1. `tempos.json`: soma 5 882, sem buracos, 44 blocos — já validado no gerador (levanta
   excepção se falhar).
2. Contact sheet de 12 frames nas 5 falas (ataque, meio, fim de cada uma): boca aberta no
   ataque, meia no meio, fechada ≤ 2 frames depois do fim da palavra.
3. Frame 5 713 → boca fechada; frame 5 882 → boca fechada.
4. Nenhum frame de pausa (fora das 451 palavras) com nível 2. O envelope cru já deixa
   escapar 4 frames; depois do gate e da histerese a tolerância é **0 frames**.
5. `voz.wav` e `musica.wav` **não entram no render**: o áudio final é `ref/audio.wav`
   (medido −14,0 LUFS integrado, true peak −0,8 dBTP, LRA 2,3 LU). Os stems são
   instrumentos de decisão, não de mistura.
6. Comparação lado-a-lado com o original nas 5 falas (`ref/parque-dos-pets.mp4`).

---

## 10. Limites que ficam escritos

- **A separação de stems é real** (Demucs 4.1.0, `htdemucs`, GPU, 1 job — caber nos 6 GB
  foi a razão de não correr mais nada em paralelo), mas é **estatística**: `voz.wav` tem
  resíduo de trilha (RMS 0,021 em pausa, contra 0,145 em fala) e `musica.wav` perde corpo
  nos ataques de voz. A soma dos stems não reconstrói a mistura ao bit (erro RMS 0,002).
- **O áudio do vídeo final não pode ser alterado**: a animação cabe nos 196,069 s. O alvo
  de −14 LUFS do projecto já está cumprido pelo original; o **true peak −0,8 dBTP está
  0,7 dB acima** do teto de −1,5 dBTP da regra de áudio. Como o ficheiro é intocável, isto
  fica registado — não se “corrige” o original nem se normaliza por cima.
- A 640×360 de origem, uma boca de cão tem ~12×8 px. Três níveis são o máximo que se lê
  nesse tamanho; quatro seriam indistinguíveis.
- CTR não existe nos dados. Nada aqui estima audiência.

---

## 11. Ficheiros desta entrega

| ficheiro | conteúdo |
| --- | --- |
| `audio/voz.wav` | voz isolada, PCM 16/44,1 kHz, estéreo (33,0 MB) |
| `audio/musica.wav` | trilha sem voz, mesmo formato |
| `audio/tempos.json` | 44 blocos → frames, soma 5 882, `speaker`, poses, janela de voz |
| `audio/energia-voz.json` | piso/topo/percentis/limiares/níveis medidos |
| `audio/RELATORIO-stems.md` | método e qualidade da separação |
| `audio/relatorio-stems.json` | os mesmos números em JSON |
| `audio/separar_stems.py` | separa (Demucs ou plano B mid/side) + QA |
| `audio/gerar_tempos.py` | `tempos.json` com verificações duras |
| `audio/medir_energia_voz.py` | envelope RMS de referência (40 ms / 1 frame) |
