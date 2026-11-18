# Prompt — ciclo de marcha v3 (perfil puro, duas pernas)

## Diagnóstico que este prompt corrige (medido, não suposto)

Nas 9 tiras geradas até agora, a perna **de trás nunca passa à frente**: o centro da perna
clara fica entre +7 e +13 px à frente do corpo e a escura entre −11 e −19 px atrás, em
todos os quadros. Resultado: a animação lê-se como **mancar** (o cão salta com a mesma
perna, a outra só acompanha).

Causa: as imagens estão em **vista de 3/4**. Nessa vista a perna de trás fica escondida
atrás do tronco e nunca aparece à frente — não é falha de corte, fps ou passada.

## As três regras que faltavam

1. **Perfil puro (90°)** — não 3/4, não meio-perfil. O cão olha para a direita, corpo de
   lado, e as DUAS pernas estão no mesmo plano, sempre visíveis.
2. **A perna de trás é mais escura e deslocada ~8 % da largura** — assim vê-se a passar
   por detrás e por diante, sem se fundir com a da frente.
3. **Alternância explícita**: no quadro 1 a perna da frente está à frente; no quadro 5 é a
   OUTRA que está à frente. Se as duas ficarem sempre na mesma ordem, a tira é inútil.

## Bloco para colar (positivo)

```
One single horizontal row of exactly 8 evenly spaced drawings of a walk cycle, read left to
right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: chubby cream and fawn English bulldog, white chest,
white muzzle, white blaze on the forehead, big round brown eyes, small floppy ears, rosy blush
cheeks, chunky white pearl necklace, thick dark-brown ink outlines, flat warm colours, one
single flat shading tone, same line weight, same size, same face in every drawing.

VIEW — PURE SIDE PROFILE, exactly 90 degrees, walking to the right. NOT three-quarter view,
NOT front view, NOT turned towards the camera. The body is a flat silhouette seen from the
side and BOTH legs are in the same plane, one slightly behind the other, fully visible in
every drawing. The far leg is drawn in a clearly darker tan than the near leg, and its outline
is complete, so it never disappears behind the body.

THE CYCLE — this is the essential part, follow it exactly and make the alternation obvious:
- drawing 1: NEAR leg forward, heel on the ground and clearly ahead of the body; FAR leg
  (darker) stretched back, toe on the ground and clearly behind the body.
- drawing 2: NEAR leg takes the weight and bends; FAR leg lifts off and starts to swing
  forward, knee bent.
- drawing 3: FAR leg passes under the body, still on the far side, still darker.
- drawing 4: FAR leg is now IN FRONT, foot ahead of the body; NEAR leg is behind.
- drawing 5: FAR leg (darker) forward on the ground; NEAR leg stretched back. This is the
  mirror of drawing 1 — the legs have SWAPPED places.
- drawing 6: FAR leg takes the weight and bends; NEAR leg lifts and swings forward.
- drawing 7: NEAR leg passes under the body.
- drawing 8: NEAR leg is IN FRONT again, foot ahead of the body, and this drawing flows
  straight back into drawing 1 to close the loop.

Rule to check: in drawings 1-2 the NEAR leg is ahead; in drawings 4-6 the FAR (darker) leg is
ahead. The two legs MUST swap. Arms swing in opposition, small amplitude. Head level, no
vertical head bobbing. The character stays centred in every cell: the body does NOT drift
sideways and does not change size.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, warm cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

## Negativo

```
three-quarter view, front view, body turned to camera, only one leg visible, both legs always
in the same order, far leg hidden, far leg same colour as near leg, hopping on one leg, limp,
legs merging into one shape, different character, orange fur, pink bow, changing colours
between drawings, different size per drawing, body drifting sideways, missing feet, cut feet,
three legs, arms rigid, text, numbers, ground line, drop shadow, 3D render, photorealistic,
background scenery
```

## Como verificar quando chegar (antes de animar)

```sh
py cortar_mascara.py <tira> _pes/<nome>
py medir_pes.py _pes/<nome>
```

Critério de aceitação, medido: nos quadros 1-2 a perna clara está à frente; nos quadros 4-6
a escura está à frente. Se a ordem nunca trocar, devolver ao Flow — não vale a pena animar.

Depois: `py analisar_pernas.py <pasta-das-tiras>` para comparar com as tentativas anteriores.
