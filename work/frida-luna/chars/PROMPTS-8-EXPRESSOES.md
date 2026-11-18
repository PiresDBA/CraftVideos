# Prompts — 8 expressões da Frida e da Luna

Para usar noutra IA de imagem. **Anexa sempre a folha aprovada como referência**
(`chars\frida-v2-ok-flat.png` ou `chars\luna-v2-ok-flat.png`) — com image-to-image a
força 0,55–0,75, ou como "reference/style image" se a ferramenta tiver esse campo.
Sem a referência, a IA muda o personagem.

## Regras que o prompt tem de impor (é o que falhou antes)

- corpo e pose **iguais** em todas as células — só a cara muda
- **sem** contorno branco de autocolante, **sem** sombra projetada, desenho direto no papel
- **sem** texto, números, etiquetas ou molduras
- fundo creme uniforme `#F4E7D0`
- contorno `#241610`, espessura constante

## Paleta

| uso | hex |
| --- | --- |
| fundo | `#F4E7D0` |
| contorno | `#241610` |
| creme da pelagem da Frida | `#E3CEAE` |
| castanho-claro (pele/tan) | `#CE905A` |
| pelagem da Luna | `#806343` |
| castanho médio da Luna | `#62341F` |
| bandana da Luna | `#6B4F9E` |
| pérolas da Frida | `#F2EDE4` |

---

## A) Grelha da FRIDA — 8 células (4 colunas × 2 linhas)

```
Cute 2D hand-drawn cartoon character sheet, flat children's-book style, drawn
directly on a uniform cream paper background (#F4E7D0) — no white sticker outline,
no drop shadow, no frame, no lettering.

The SAME chubby English bulldog character repeated exactly 8 times in a clean
4-column by 2-row grid, identical body, identical pose (standing upright on two
legs, arms relaxed at the sides, feet on the same ground line), identical size and
proportions in every cell. Cream and fawn coat (#E3CEAE / #CE905A), white chest,
white muzzle, white blaze on the forehead, small floppy ears, rosy blush cheeks,
and the same chunky white pearl necklace (#F2EDE4) in every cell. Thick dark-brown
ink outlines (#241610), uniform line weight, warm flat colors with a single soft
cel shadow.

Only the FACE changes, one expression per cell, in this exact order, left to right,
top to bottom:
1 happy — big closed-mouth smile, eyes bright and open
2 sad — drooping eyebrows, one small blue tear on the cheek
3 angry — frowning eyebrows pressed down, mouth in a hard line
4 excited — mouth wide open in a happy shout, eyes wide
5 scared — eyes huge, pupils small, mouth small and open, one sweat drop
6 surprised — eyes round, mouth a perfect small O, paws lifted slightly
7 loved — heart-shaped eyes, two small floating hearts beside the head
8 silly — eyes crossed, tongue hanging out to one side

No text, no numbers, no captions, no grid lines. Character fully inside each cell,
generous margins.
```

## B) Grelha da LUNA — 8 células (4 × 2)

```
Cute 2D hand-drawn cartoon character sheet, flat children's-book style, drawn
directly on a uniform cream paper background (#F4E7D0) — no white sticker outline,
no drop shadow, no frame, no lettering.

The SAME dachshund character repeated exactly 8 times in a clean 4-column by 2-row
grid, identical body, identical pose (standing upright on two legs, very long low
body, short arms relaxed at the sides, feet on the same ground line), identical size
and proportions in every cell. Chestnut brown coat (#806343) with darker rust
markings (#62341F) on the paws, muzzle and ear tips, very long floppy ears, tiny
tail, and the same purple bandana (#6B4F9E) tied at the neck in every cell. Thick
dark-brown ink outlines (#241610), uniform line weight, warm flat colors with a
single soft cel shadow.

Only the FACE changes, one expression per cell, in this exact order, left to right,
top to bottom:
1 happy — big smile, tongue slightly out, eyes bright
2 sad — drooping eyebrows, one small blue tear
3 angry — frowning eyebrows, mouth in a hard line
4 excited — mouth wide open in a happy shout, eyes wide
5 scared — eyes huge, pupils small, one sweat drop
6 surprised — eyes round, mouth a small O, ears lifted
7 loved — heart-shaped eyes, two small floating hearts
8 silly — eyes crossed, tongue hanging out sideways

No text, no numbers, no captions, no grid lines. Character fully inside each cell,
generous margins.
```

## C) Versões individuais (se preferires uma imagem por expressão)

Usa o bloco da personagem acima **sem a parte da grelha**, e acrescenta:

```
Single character, full body, centered, plain cream background. Expression: <EXPRESSÃO>.
```

Expressões, uma de cada vez:

| # | nome | frase para o prompt |
| --- | --- | --- |
| 1 | happy | `big closed-mouth smile, bright open eyes` |
| 2 | sad | `drooping eyebrows, one small blue tear on the cheek` |
| 3 | angry | `frowning eyebrows pressed down, mouth in a hard line` |
| 4 | excited | `mouth wide open in a happy shout, eyes wide` |
| 5 | scared | `eyes huge with small pupils, small open mouth, one sweat drop` |
| 6 | surprised | `eyes round, mouth a small O` |
| 7 | loved | `heart-shaped eyes, two small floating hearts beside the head` |
| 8 | silly | `eyes crossed, tongue hanging out to one side` |

## D) Negative prompt (colar no campo negativo, se houver)

```
white sticker border, white outline, drop shadow, paper cut, 3D render, photorealistic,
soft airbrush shading, text, letters, numbers, caption, frame, grid lines, watermark,
different character in each cell, different pose, different body, extra limbs, watermark
```

## E) O que me interessa na entrega

- PNG, fundo **creme liso** ou transparente — os dois servem
- 1024 px por célula (grelha 4096×2048) ou uma imagem por expressão a 1024×1024
- nomes: `frida-happy.png`, `luna-happy.png`, … (ou a grelha inteira, eu fatio)
- guardar em `D:\CRAFT\work\frida-luna\chars\krita\out\`

Eu depois recorto, reduzo a 512 px de altura e monto o contact sheet das 40 poses
para aprovação final.
