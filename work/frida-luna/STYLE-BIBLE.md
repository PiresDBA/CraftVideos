# Bíblia de estilo — *O Parque dos Pets* (Frida & Luna, recriado)

Documento de autoridade para a recriação animada de **O Parque dos Pets**
(@FridaeLuna, 196,07 s · 30 fps · **5 882 frames**).
Áudio original reaproveitado intacto: `ref/audio.wav`.
Plano de sequências executável: `sequence-plan.json` (gerado por `build_sequence_plan.py`).

Este ficheiro decide **como se desenha, se compõe e se anima**. Se uma instrução
noutro sítio contradizer o que está aqui, vale o que está aqui.

---

## 0. Identidade — o que estamos a fazer e o que está proibido

| | Decisão |
| --- | --- |
| Estilo | **Cartoon 2D desenhado à mão**, infantil, contorno grosso castanho-escuro |
| Personagens | Frida = bulldog creme de pé, colar de pérolas · Luna = salsicha castanha de pé, bandana roxa |
| Fundo | **Papel creme** (#F4E7D0) visível entre os elementos; nunca céu fotográfico |
| Profundidade | Parallax 2.5D em camadas planas; **zero** modelação 3D, zero PBR |
| Tipografia | Sempre no pós (Remotion). **Nunca** dentro do Blender nem desenhada nas folhas |
| Personagem final | Sai **só** das folhas aprovadas do Artista-desenho. Proibido gerar personagem com IA de imagem |

**Proibido, sem excepção:**

- 3D realista, sombreado PBR, DOF fotográfico, *ambient occlusion* suave a fingir volume.
- SVG geométrico — círculos perfeitos, `border-radius` simétrico, gradientes vectoriais lisos. **Foi reprovado pelo utilizador.** A linha tem de ter tremor de mão.
- Gradientes longos (> 120 px) e *blur* gaussiano grande a fingir profundidade.
- Arco-íris de paleta: 11 cenas ≠ 11 cores. Ver §2.

**A referência serve para três coisas**, e só três: **tempo** (beats), **enquadramento**
(que plano, que eixo de câmara) e **paleta medida**. Não serve para copiar o rendering
3D do original — o original é Pixar-like; nós fazemos livro infantil desenhado.

---

## 1. O que foi medido na referência

Sondagem em `ref/_frames/` (12 frames, `-vf fps=1/16`) com k-means em CIELAB,
240 000 pixéis amostrados (`_palette_scan.py`). Cores dominantes reais:

| hex medido | % da área | o que é |
| --- | --- | --- |
| `#C9DBED` | 11,17 | céu |
| `#596129` | 10,18 | relva em sombra |
| `#806343` | 9,78 | pelagem castanha da Luna |
| `#3B4222` | 9,72 | folhagem escura |
| `#E3CEAE` | 9,16 | creme da pelagem da Frida / areia |
| `#858834` | 8,65 | relva em luz |
| `#B9B858` | 8,42 | relva em contraluz |
| `#62341F` | 8,07 | castanho médio da Luna |
| `#241610` | 7,86 | **contorno / sombra mais escura** |
| `#9B946D` | 7,22 | terra batida |
| `#CE905A` | 4,90 | castanho-claro / pele |
| `#7B7372` | 4,88 | pedra / caminho |

Saturados (S > 0,45): 96,9 % dos pixéis saturados caem na faixa **0°–60° de matiz**
(vermelhos, laranjas, amarelos). Praticamente não há verdes saturados, azuis ou violetas
com área relevante. **Conclusão: o original já é uma paleta quente de 6 famílias.** Não
temos de inventar; temos de a fechar.

Enquadramento (`ref/anatomy.json`): `presenterBandStart = 0.714` → a banda dos
apresentadores começa a **71,4 % da altura = y 771 px** num quadro de 1080. É este o
número que manda no layout (§3).

---

## 2. Paleta

### 2.1 As seis cores fixas

Toda a imagem — 11 cenas, 44 frases, 5 882 frames — sai destas seis. Hex finais
ajustados a partir dos valores medidos para garantir contraste 4,5:1 sobre papel.

| # | Nome | hex | RGB | Origem | Uso canónico |
| --- | --- | --- | --- | --- | --- |
| 1 | `papel-creme` | `#F4E7D0` | 244 231 208 | derivado de `#E3CEAE` clareado | fundo de tudo, cartões, respiro |
| 2 | `contorno-castanho` | `#2A1A12` | 42 26 18 | medido `#241610` | contorno grosso, texto principal, pupilas |
| 3 | `castanho-luna` | `#6B3A22` | 107 58 34 | medido `#62341F` | corpo da Luna, sombras médias, madeira |
| 4 | `areia-frida` | `#E5CFA8` | 229 207 168 | medido `#E3CEAE` | pelagem da Frida, areia, luz de pele |
| 5 | `verde-parque` | `#6E7A33` | 110 122 51 | medido `#596129`/`#858834` | folhagem, relva, túnel, silhuetas |
| 6 | `ambar-petisco` | `#E9A63C` | 233 166 60 | derivado do `#CE905A` saturado | bolinhas de ténis, letreiros, destaque quente |

### 2.2 Três acentos de identidade (área total ≤ 8 % do quadro)

Não são uma sétima cor de cena: são **marcas de personagem e de céu**. Cada uma tem
tecto de área e nunca aparece como fundo dominante.

| Nome | hex | Tecto | Onde |
| --- | --- | --- | --- |
| `roxo-bandana` | `#5B3A8E` | ≤ 2 % | **só** a bandana da Luna (e o eco dela no guarda-roupa) |
| `azul-ceu` | `#C9DBED` | ≤ 12 % | céu, só nas cenas `abertura`→`roda`; some a partir de `carrossel` |
| `vermelho-carrinho` | `#B23A2A` | ≤ 1,5 % | carrinho de osso, botão *like*, corações |

Regra de ouro: **se um objecto novo precisa de uma cor nova, ele não entra.** Redesenha-se
o objecto em `ambar-petisco` ou `verde-parque`.

### 2.3 As 11 cenas distinguem-se por *luz*, não por matiz

Cada cena recebe **uma multiplicação de temperatura aplicada só ao fundo** (nunca às
personagens, que mantêm a cor local). O arco é de valor e de temperatura, dentro da
mesma família quente. É isto que impede o arco-íris.

| # | Cena | Cor de temperatura | Opacidade | Leitura |
| --- | --- | --- | --- | --- |
| 1 | `hook` | `#FFF1DC` | 8 % | manhã de papel |
| 2 | `abertura` | `#FFF6E6` | 6 % | manhã clara, céu aberto |
| 3 | `portao` | `#FCEFD8` | 8 % | manhã tardia |
| 4 | `montanha` | `#FFF3DE` | 4 % | meio-dia alto, nuvens |
| 5 | `roda` | `#FFE3B8` | 12 % | tarde dourada |
| 6 | `carrossel` | `#FFCF9E` | 16 % | fim de tarde, luzes quentes |
| 7 | `bolinhas` | `#FFF0C8` | 8 % | amarelo reflectido pelas bolinhas |
| 8 | `tunel` | `#D9C79E` | 18 % | sombra de relva |
| 9 | `espelhos` | `#C9BBA6` | 22 % | interior, neutro, mais frio |
| 10 | `moral` | `#FFB877` | 26 % | pôr-do-sol |
| 11 | `final` | `#F7DCC0` | 14 % | cartão final âmbar |

A curva de opacidade (8 → 6 → 8 → 4 → 12 → 16 → 8 → 18 → 22 → 26 → 14) é o dia a passar.
**Não alterar sem refazer a tabela dos dois lados** (`build_sequence_plan.py` gera-a).

### 2.4 Proporções de área por quadro

Um quadro correcto de `O Parque dos Pets` gasta, em média:

- 38–48 % papel creme (respiro, céu de papel, cartão)
- 22–30 % verde-parque (folhagem, relva, túnel)
- 18–24 % castanho-luna + areia-frida + contorno (personagens e objectos)
- 4–8 % âmbar-petisco
- ≤ 8 % acentos (roxo + vermelho), azul-ceu fora desta conta

Se uma cena fechar com mais de 30 % de âmbar, está a virar poster. Corrigir.

### 2.5 Regra do contorno

O contorno é o que faz o estilo. **Nunca preto puro, nunca `#000`.**

| Elemento | Espessura (1920×1080) | Cor |
| --- | --- | --- |
| Silhueta de personagem | 9 px | `#2A1A12` |
| Detalhe interno (olhos, colar, dobras) | 5 px | `#2A1A12` |
| Objectos de cena (portão, carrinho) | 7 px | `#2A1A12` a 92 % |
| Silhuetas do pôr-do-sol | 0 px (massa cheia) | `#3A2415` |

Tremor de mão: cada linha é um traço com desvio de ±1,5 px e espessura variável
(0,85×–1,15×). Linhas perfeitamente rectas e paralelas leem-se como SVG e estão reprovadas.

---

## 3. Layout

### 3.1 Tela e grelha

- Canvas **1920 × 1080**, 30 fps, `durationInFrames = 5882`.
- Grelha de 12 colunas, gutters de 24 px, largura de coluna ≈ 146 px.
- **Margem de segurança: 96 px em todos os lados** (5 % da largura). Nada de texto ou
  olhos de personagem fora desta caixa — a barra de progresso do YouTube come os
  inferiores.

### 3.2 Zonas verticais (o número 71,4 % é lei)

```
y=0    ┌──────────────────────────────────────────┐
       │  margem de segurança 96 px               │
y=96   ├──────────────────────────────────────────┤
       │  ZONA A — TIPOGRAFIA            h 384    │  título, selos, legendas-título
y=480  ├──────────────────────────────────────────┤
       │  ZONA B — ARTE DE CENA          h 291    │  céu, montanha-russa, roda gigante,
       │  (fundo + parallax distante)             │  portão, carrossel
y=771  ├══════════════════════════════════════════┤  ← BANDA DOS APRESENTADORES
       │  ZONA C — PERSONAGENS + LEGENDA h 213    │  medido: presenterBandStart 0.714
y=984  ├──────────────────────────────────────────┤  (= 771/1080, ref/anatomy.json)
       │  margem inferior 96 px                   │
y=1080 └──────────────────────────────────────────┘
```

- **Linha de chão: y = 1000 px (0,926).** Todos os pés das personagens pousam aqui,
  excepto em planos aéreos declarados (`montanha` frases 16–18, `roda` frase 22).
- **A banda dos apresentadores começa em y = 771 px**, exactamente 0,714 da altura.
  Nenhum elemento de primeiro plano começa acima desta linha; é a fronteira entre
  "mundo" e "palco". Confirmado em `ref/anatomy.json → summary.presenterBandStart`.
- **Legenda queimada vive dentro da banda**: caixa `x 240 → 1680`, base em `y = 972`,
  altura máxima 2 linhas (≈ 116 px), centrada. Nunca sobe para a Zona B.
- A Zona A pode ser invadida por cabeças de personagem em planos fechados (`bolinhas`,
  `espelhos`) — mas então **a tipografia desce para a banda** e a Zona A fica vazia.

### 3.3 Colunas das personagens

Fixas no vídeo inteiro, para o olho não ter de reaprender onde elas estão:

| Personagem | Coluna | Centro X | Largura máx. |
| --- | --- | --- | --- |
| **Luna** (salsicha) | esquerda | **530 px** (0,276) | 470 px |
| **Frida** (bulldog) | direita | **1450 px** (0,755) | 560 px |

A Frida é mais pesada e mais larga: fica à direita e ocupa mais área. A Luna é comprida e
baixa: fica à esquerda, e o rabo pode sair até x = 298. **Nunca trocar os lados** — o
espectador infantil ancora a leitura por posição.

### 3.4 Escala

| Plano | Altura da personagem | Quando |
| --- | --- | --- |
| Dois planos (padrão) | 620 px | 34 das 44 frases |
| Plano médio | 760 px | `bolinhas`, `espelhos`, `tunel` |
| Plano fechado | 900 px | reacções isoladas (1 frase por cena, no máximo) |
| Plano geral | 380 px | `montanha` frases 16–18, `roda` frase 22, `moral` |

Altura medida do **topo da cabeça ao chão**. Olhos (ponto de lip-sync) ficam a
y ≈ 700 px no plano padrão — é a referência para o mapa RMS de boca.

### 3.5 Câmara — só três movimentos

Derivados de `beats.json → cam`:

1. **push-in lento** — escala 1,00 → 1,06 ao longo da cena. Máx. 6 %.
2. **pan / travelling lateral** — deslocamento de fundo de 0 a −140 px, com parallax
   a 0,35× e 0,65× nas camadas distantes.
3. **tilt up** — deslocamento vertical do fundo de 0 a −90 px.

**A câmara nunca mexe nas personagens** (elas ficam na Zona C, coladas ao palco). Só o
fundo e o parallax se deslocam. Excepção: `bolinhas` e `espelhos` podem ter *zoom* de
quadro inteiro em ±3 %.

### 3.6 Formato 9:16 (obrigatório, mesma timeline)

Um plano → três formatos. Para 1080×1920: Zona C comprime para 560 px de altura, as
personagens passam a estar empilhadas (Frida em cima, Luna em baixo) e a tipografia
ocupa o terço superior. Os mesmos 5 882 frames, os mesmos `from` — muda só o
`<AbsoluteFill>` de composição.

---

## 4. Tipografia

### 4.1 Famílias (todas livres, via `@remotion/google-fonts`)

| Papel | Fonte | Peso | Porquê |
| --- | --- | --- | --- |
| Título de cartão | **Fraunces** (eixo SOFT) | 700 itálico | serifa arredondada macia, casa com o cartão da referência |
| Voz de personagem | **Baloo 2** | 800 | arredondada, infantil, aguenta contorno grosso |
| Legenda / narrador | **Nunito** | 700 | humanista arredondada, excelente legibilidade a 46 px |
| Selo / número | **Nunito** | 800, `letter-spacing 0.18em`, maiúsculas | imita o selo "FRIDA E LUNA" da referência |

**Nunca** usar: Arial, Inter, Roboto, Montserrat. São o cheiro de "gerado por IA".

### 4.2 Hierarquia (valores a 1920×1080)

| Elemento | Tamanho | Cor | Contorno | Posição |
| --- | --- | --- | --- | --- |
| Título de cartão | 132 px / 118 px leading | `contorno-castanho` | nenhum (usa sombra) | centrado, y 470–600 |
| Subtítulo de cartão | 44 px | `castanho-luna` | nenhum | centrado, y 626 |
| Selo de marca | 26 px caps | `papel-creme` sobre pílula `ambar-petisco` | — | centrado, y 396 |
| Legenda de narrador | 46 px / 58 px leading | `papel-creme` com halo `#2A1A12` 70 % | 0 (usa halo) | base y 972 |
| Fala de personagem | 40 px | `contorno-castanho` | — | balão, acima da cabeça do falante |
| Texto de acção ("Que velocidade maluca!") | 96 px | `ambar-petisco` com contorno 6 px `contorno-castanho` | 6 px | centrado, y 300, roda ±3° |

### 4.3 Regras de tipografia

1. **Máximo 2 linhas** em qualquer texto na tela. Se não cabe, o texto está mal escolhido.
2. Um só elemento tipográfico a "gritar" por quadro. O resto é legenda.
3. O contorno de texto é sempre `#2A1A12`, nunca preto, e nunca > 6 px (a 46 px de corpo
   come a letra).
4. Sombras de texto: deslocamento `(4px, 6px)`, opacidade 22 %, cor `#2A1A12`. Nunca blur > 8.
5. **A tipografia nunca é animada dentro do Blender nem queimada no fundo.** Vive numa
   `<Sequence>` própria, por cima de tudo e abaixo do grão (§5).

### 4.4 Animação de texto

Só três entradas, todas por `interpolate()`:

- **`subir-e-assentar`** (cartões): `translateY 28→0`, `opacity 0→1`, `scale 0.96→1`, 14 frames, `Easing.out(Easing.cubic)`.
- **`salto-de-letra`** (texto de acção): por caractere, `translateY -18→0` com atraso de 2 frames por letra, `Easing.out(Easing.back(1.4))`.
- **`maquina-de-escrever`** (legenda, raro): 1,4 caracteres por frame, sem cursor.

Sem `spring()`. Sem CSS `transition`/`animation`. Ver §6.

---

## 5. Camadas — ordem obrigatória

Sempre esta ordem, de baixo para cima. Nunca reordenar. O `sequence-plan.json` já a
codifica em `layers[]` e o `build_sequence_plan.py` **falha** se a ordem for violada.

| z | Camada | Conteúdo | Mistura | Notas |
| --- | --- | --- | --- | --- |
| 0 | `fundo-*` | papel creme + céu de papel + temperatura da cena | normal | SVG/Python gerado, textura de papel por cima |
| 1 | `parallax-*` | 2–3 planos distantes (montanha-russa, roda, árvores, arcos) | normal | deslocamento 0,35× e 0,65× |
| 2 | `*-de-cena` | objectos de primeiro plano (portão, carrinho, luzinhas, bolinhas em voo) | normal / `screen` só nas luzinhas | |
| 3 | `personagem-frida` / `personagem-luna` | sprites das folhas aprovadas | normal | `mix-blend-mode: multiply` **proibido** — perde o creme |
| 4 | `tipografia-*` | texto e balões | normal | §4 |
| 5 | `grao-e-vinheta` | grão de papel + vinheta | `multiply` / `overlay` | o único sítio com `multiply` |

### 5.1 Grão e vinheta — o que une as 11 cenas

- **Grão**: textura de papel tileável a 5 % de opacidade, `overlay`, **com tremor por frame**
  (`background-position` deslocado por um padrão determinístico de `frame % 7`). Sem isto,
  o desenho lê-se como vector.
- **Vinheta**: radial de `rgba(42,26,18,0)` no centro para `rgba(42,26,18,0.22)` nos cantos.
  Mais forte nos cartões (`hook`, `final`: 0,32) e no pôr-do-sol (`moral`: 0,30).
- **Sem** *film grain* em movimento aleatório — tem de ser determinístico para o render
  bater frame a frame.

### 5.2 Regras de parallax

| Camada | Factor de deslocamento | Escala |
| --- | --- | --- |
| `parallax-fundo-distante` | 0,35 × câmara | 1,08 |
| `parallax-meio-termo` | 0,65 × câmara | 1,04 |
| `*-de-cena` | 1,00 × câmara | 1,00 |
| personagens | 0,00 (coladas) | 1,00 |

Deslocamento máximo no vídeo inteiro: 140 px. Mais do que isso e o parallax planar
denuncia-se.

---

## 6. Regras técnicas Remotion — invariantes

### 6.1 Animação

```tsx
// CORRECTO — determinístico, frame-indexado
const frame = useCurrentFrame();
const progresso = interpolate(frame, [0, 14], [0, 1], {
  easing: Easing.out(Easing.cubic),
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

**Proibido:**

| Proibido | Porquê |
| --- | --- |
| `useFrame()` do `@react-three/fiber` | regra de ouro #3 da cadeia; quebra o determinismo do render |
| `<Canvas>` com loop próprio | avança no relógio da GPU, não no frame do Remotion |
| `spring()` de R3F / `AnimationMixer.update(delta)` | dependem de `delta` real |
| CSS `transition`, CSS `@keyframes`, `animation-delay` | o render headless não espera |
| `Date.now()`, `performance.now()` | não é reproduzível |
| `Math.random()` | usar `random(seed)` de `remotion`, com seed = `hash(cena, beat)` |
| `useEffect` a mexer em estilo | o frame já passou |

Para "mola", usa `interpolate` com `Easing.elastic(n)` ou `Easing.bezier(...)`. Para
"peso" e "assentar", `Easing.out(Easing.back(1.4))`. Animação de personagem com 2 poses:
`interpolate` sobre o índice de pose + `frame % 2` para o ciclo de andamento. Nada disto
precisa de tempo real.

### 6.2 Estrutura de composição

```tsx
// src/video/RaizDoVideo.tsx
export const RaizDoVideo: React.FC = () => (
  <>
    <Audio src={staticFile("audio.wav")} />
    {plano.map((cena) => (
      <Sequence
        key={cena.scene}
        name={cena.scene}
        from={cena.from}
        durationInFrames={cena.durationInFrames}
      >
        <CenaDaCena cena={cena} />
      </Sequence>
    ))}
  </>
);
```

- `plano` é **importado de `sequence-plan.json`**. Nunca escrito à mão no `.tsx`.
- `totalDurationInFrames = 5882` na `<Composition>` do `Root.tsx`.
- Uma `<Sequence>` por cena. **Sem sobreposição** — a soma tem de dar 5 882 exactos
  (validado por `build_sequence_plan.py --check`).

### 6.3 Transições — dentro da duração, nunca a roubar frames

As 11 sequências são contíguas. Uma transição que se sobrepusesse às duas obrigaria a
encurtar `durationInFrames` e a soma deixaria de fechar. Por isso os quatro tipos abaixo
são **efeitos locais**, metade no fim da cena anterior, metade no início da seguinte
(5 + 5 frames, excepto onde indicado). O `transition_in` de cada cena está no
`sequence-plan.json`.

| Tipo | Frames | Como se faz | Onde é usado |
| --- | --- | --- | --- |
| `abertura-desde-papel` | 24 | a arte entra de `opacity 0` sobre o papel creme; nada de preto | `hook` (frame 0 é papel puro) |
| `ponte-de-papel` | 5+5 | 5 frames a subir para creme no fim da anterior, 5 a descer no início | `abertura`, `roda`, `espelhos`, `final` |
| `arrasto-lateral` | 6+6 | o parallax continua a andar enquanto a nova cena entra por trás | `portao`, `montanha`, `carrossel`, `tunel` |
| `corte-seco` | 0 | corte duro no frame exacto do beat | `bolinhas` |
| `escurecer-para-creme` | 18 | 9 frames a escurecer para `#3A2415`, 9 a abrir no papel | `moral` |

Cada transição cai **dentro de um silêncio da narração** (as folgas entre cenas são de
0,86 s a 1,46 s em `beats.json`), portanto nunca corta uma palavra.

### 6.4 Áudio

- `ref/audio.wav` intacto, uma única `<Audio>`, `startFrom = 0`.
- Loudness de entrega: **−14 LUFS integrado, pico −1,5 dB**. Se o ficheiro de origem já
  cumprir, não lhe tocar. Não há re-mistura: voz e música são as originais.
- O mapa de boca (`Especialista-Áudio`) chega em RMS por 1/30 s e é consumido pela camada
  `personagem-*`. Nunca por `useFrame`.

### 6.5 Cache e re-render

- Chave de cache = `sha256(cena + versão das folhas + hash do plano)`.
- Mudar uma cena re-renderiza **só** essa cena; a concatenação é feita no fim.

---

## 7. Personagens — regras de desenho

| | Frida | Luna |
| --- | --- | --- |
| Corpo | `areia-frida` `#E5CFA8`, barriga mais clara `#F0E0C4` | `castanho-luna` `#6B3A22`, peito em `#8A5230` |
| Contorno | 9 px `#2A1A12` | 9 px `#2A1A12` |
| Marca | colar de pérolas (8 pérolas `#F4E7D0` + fio `#2A1A12`) | bandana `roxo-bandana` `#5B3A8E` |
| Proporção | cabeça 38 % da altura, corpo baixo e largo | corpo 3,2 × altura da cabeça, orelhas longas |
| Altura | mais alta e mais pesada | mais comprida e mais baixa |
| Olhos | grandes, 18 % da cabeça, pupila `#2A1A12` | idem, com brilho branco de 6 px |

- **Estão de pé**, bípedes, no estilo do canal. Não são cães quadrúpedes realistas.
- 12 expressões do `beats.json` (`happy, excited, surprised, silly, loved, shy, proud,
  calm, curious, scared, mischievous, confused`) saem das folhas aprovadas. Se falta uma
  folha, **não se inventa**: usa-se a mais próxima e avisa-se.
- Nunca gerar personagem com IA de imagem (regra de ouro #6). A IA só toca em fundos.

## 8. Fundos

- Desenhados (Python/SVG à mão + textura) ou gerados com ComfyUI (`childrens-picture-book-sd15`,
  permitido **só** para fundos e texturas, nunca para personagem).
- Cada fundo entrega-se em 3 camadas PNG com alfa (`fundo`, `distante`, `meio-termo`) +
  `chao` separado, para o parallax.
- Todos os fundos passam pela temperatura da §2.3 antes de entrarem.
- Borda de "papel rasgado" a 24 px nas extremidades: nenhum fundo toca o rebordo do quadro.

---

## 9. Portões de QA

Antes de qualquer entrega, `Dev-Motion-QA` verifica:

1. `py build_sequence_plan.py --check` → `ok: 11 cenas, 5882 frames`.
2. Soma dos `durationInFrames` = 5 882 e `from` contíguos.
3. `grep -r "useFrame" src/` → **zero resultados**.
4. `grep -rn "Math.random\|Date.now\|performance.now" src/` → zero resultados.
5. Paleta: contar pixéis por frame em 11 frames-chave; nenhuma cena com > 8 % de acento,
   nenhuma cor fora da §2 a mais de 2 unités LAB das permitidas.
6. Contact sheet de 11 frames (1 por cena, a `duração × 0,9`) lado a lado com a referência.
7. Sincronia: 5 pontos de controlo (início de cada cena) comparados com `words.json`.
8. Áudio: −14 LUFS, pico −1,5 dB.

## 10. Nomenclatura

```
work/frida-luna/
  STYLE-BIBLE.md              esta bíblia
  sequence-plan.json          plano gerado (não editar à mão)
  build_sequence_plan.py      gerador do plano (fonte de verdade dos tempos)
  beats.json                  44 frases, tempos, expressões
  ref/                        original: mp4, audio.wav, words.json, anatomy.json, _frames/
  chars/                      folhas de expressão aprovadas -> sprites
  fundos/<cena>/              fundo.png, distante.png, meio-termo.png, chao.png
  src/video/RaizDoVideo.tsx   composição
  src/cenas/Cena<Cena>.tsx    uma por cena (CenaMontanha, CenaCarrossel, ...)
  out/                        renders e contact sheets
```

Proibido: `scene1.tsx`, `test.py`, `final_v2.tsx`, `Component.tsx`. Nomes descritivos
sempre — `CenaRodaGiganteDeTigelas`, `TransicaoPonteDePapel`, `CamadaGraoDePapel`.

---

*Última regra, a que vale mais que todas: se o resultado se parece com um slider de
gradiente do Illustrator, está errado. Tem de parecer desenhado por alguém com um lápis
grosso e uma opinião.*
