# Prompts e método das grelhas de expressões (Frida & Luna)

## Como a grelha é realmente produzida

O FLUX **não** cumpre uma grelha de 20 células num só pedido. Duas tentativas com
`gen_nvidia.py` (1088x1344):

1. devolveu **4x4 = 16 células**, com sombra no chão e o colar reduzido a um único pendente;
2. devolveu uma **imagem vazia** (9 KB).

Solução adoptada (3 ficheiros, todos em `chars/`):

| Ficheiro | Função |
| --- | --- |
| `gen_poses.py` | gera as 20 expressões **uma a uma** com o bloco de personagem fixo -> `_raw/<personagem>/<expressao>.png` (1024x1216) |
| `compor_grelhas.py` | limpa fundo/sombra, normaliza cada pose para 78% da altura da célula com a base alinhada e monta a grelha **4 colunas x 5 linhas** (2048x2560) -> `<personagem>-expressoes.png` |
| `fatiar.py` | fatia a grelha pelo mapa 4x5 explícito, tira o fundo creme para alfa, grava `poses/<personagem>/<expressao>.png` 512x512, o `poses/manifest.json` e o contact sheet `poses/_contact.png` |

```sh
py chars/gen_poses.py            # 40 imagens, ~6 min, 3 em paralelo
py chars/compor_grelhas.py       # monta as duas grelhas
py chars/fatiar.py               # 40 sprites + manifest + contact sheet
```

## Ordem das 20 expressões (leitura esquerda->direita, cima->baixo)

linha 1: happy, sad, angry, excited
linha 2: scared, tired, confused, proud
linha 3: surprised, shy, silly, sick
linha 4: worried, mischievous, loved, bored
linha 5: grumpy, jealous, calm, lovestruck

É o mesmo array `EXPRESSOES` em `gen_poses.py` e em `fatiar.py` — mexer num obriga a mexer
no outro, senão o manifesto passa a mentir.

## Bloco de estilo comum (idêntico em todas as chamadas)

Flat 2D hand-drawn cartoon for a children's animation, thick uniform dark brown ink outline,
flat solid colour fills, one flat cel shadow tone per colour, **no sticker edge / no white
die-cut border / no drop shadow, no floor ellipse**, plain cream background to the edges,
one character alone, standing upright on all four legs, both arms at the sides, full body
from head to paws, centred with generous margin, **no text / letters / numbers / watermark**.

Palavras que estragaram resultados e por isso saíram do prompt:

- **"sticker"** -> acrescenta halo branco de recorte e sombra projectada;
- **"3D"**, "render", "gloss" -> puxa o resultado para semi-realista;
- descrições longas de "sitting on the floor" -> o cão senta em vez de ficar de pé.

## Personagens

**Frida** — bulldog inglesa pequena e rechonchuda: pelo caramelo, risca creme larga na
cara, focinho e barriga creme, orelhas castanho-escuro caídas, olhos pretos redondos,
bochechas rosa, nariz preto, **colar de pérolas**, quatro patas curtas com pés creme,
braços pequenos, cauda enrolada.

**Luna** — salsicha: pelo castanho, barriga e focinho tan, corpo comprido em quatro patas
muito curtas, orelhas muito longas até aos ombros, tufo de três pêlos no topo da cabeça,
olhos pretos grandes, nariz preto, **bandana roxa**, cauda fina comprida, braços pequenos.

## Armadilhas observadas na geração

- `--h` só aceita 768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344. 1600 devolve HTTP 422.
- Algumas frases devolvem **imagem vazia de 7 KB** sem erro HTTP (aconteceu com `silly` e
  `lovestruck`). `gen_poses.py` valida o tamanho do ficheiro (>20 KB) e repete 3x; quando
  insiste, o remédio é **reescrever a frase** — foi o que resolveu (`tongue sticking out
  sideways` -> `tongue hanging out of the side of the mouth`).
- Alguns raws trazem um **cartão creme com cantos redondos** à volta do desenho. Se não for
  removido, incha a caixa do conteúdo e o cão é escalado para baixo: é o filtro de
  componentes do `fatiar.py` (fica a maior componente + o que estiver perto dela).
- A sombra do chão nem sempre é cinzenta (há poses com elipse laranja), por isso a remoção
  é estrutural — abaixo do último traço escuro da coluna — e não por cor.
