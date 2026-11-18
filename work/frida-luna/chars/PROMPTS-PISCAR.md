# Folha de piscar — Luna (e Frida, se precisar)

Nenhuma das 16 expressões aprovadas tem olho fechado. O idle da Frida gerado em 18/11
traz um piscar real no quadro 7 (arco de ~4 px contra ~23 px aberto). A Luna ainda não
tem piscar: os prompts dos 13 ciclos proibem "blinking" no negativo.

Por isso pedimos uma folha **só de piscar**, com olhos abertos/fechados de verdade — nunca
uma barra desenhada por cima do olho.

## Luna — piscar (8 quadros, prioridade alta)

```
One single horizontal row of exactly 8 evenly spaced drawings of a BLINK LOOP, read left to
right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow, NO ground line.

CHARACTER — identical in all 8 drawings: small long-bodied chestnut dachshund with short
legs, long floppy ears, warm brown eyes, cream muzzle and chest, purple bandana around the
neck, thick dark-brown ink outlines, flat warm colours, one single flat shading tone, same
line weight, same size, same face in every drawing.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. Standing still, four paws flat on the same invisible baseline. The body, head, ears,
tail, bandana and legs are PIXEL-IDENTICAL in all 8 drawings: only the EYELIDS change.

THE CYCLE — follow exactly:
- drawings 1, 2, 3: eyes fully open, big round brown eyes with a white highlight.
- drawing 4: eyelids half closed, real curved eyelids coming down over the eyes.
- drawing 5: eyes fully closed — a single dark-brown curved line where the eyes were, real
  eyelids, NO straight bar, NO stripe, NO black rectangle over the eyes.
- drawing 6: eyelids half closed again.
- drawings 7, 8: eyes fully open, exactly like drawing 1, so the loop closes invisibly.

Rule to check: the eye opening goes from about 22 pixels (open) to zero (closed) and the
closed line is curved like an eyelid, not a straight stroke. Nothing else in the drawing
moves, not one pixel of the body or the bandana.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0), no white sticker border, no gradient.
```

**Negativo:**

```
straight bar over the eyes, black stripe over the eyes, rectangle covering the eyes, eyes
painted over, different head position, body moving, head moving, tail wagging, ears moving,
bandana moving, mouth open, walking, different character, bulldog body, tall body, pearl
necklace, wrong bandana colour, different size per drawing, changing colours, text, numbers,
frame borders, ground line, 3D render, photorealistic
```

**Critério de aceitação (medido):**
- A abertura dos olhos no quadro 5 tem de ser ≤ 2 px de altura (contra ~22 px no quadro 1).
- O contorno do corpo tem de ser idêntico nos 8 quadros dentro de 2 px.
- A linha do olho fechado tem de ser curva: medir a diferença de y entre o centro e as
  pontas da linha ≥ 2 px.

## Frida — piscar (só se o idle não servir)

Mesmo bloco, trocando a descrição da personagem por:

```
chubby cream and fawn English bulldog, white chest, white muzzle, white blaze on the
forehead, big round brown eyes, small floppy ears, rosy blush cheeks, chunky white pearl
necklace, thick dark-brown ink outlines, flat warm colours
```

e a abertura dos olhos de ~23 px (aberta) para ~3 px (fechada).
