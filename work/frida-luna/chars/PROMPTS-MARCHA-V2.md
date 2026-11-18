# Prompt — ciclo de marcha (v2, frame a frame)

Problema diagnosticado: o desenho que veio do Flow **não cumpre o ciclo** (as pernas não
alternam como deve ser; o corpo deriva dentro da linha; o tom muda entre frames). Pedir
"a walk cycle" não chega — tem de se ditar o estado dos membros em cada frame.

Regras que o prompt impõe:

- **8 frames numa única linha**, lado a lado, sem moldura de filme;
- **perna A** à frente enquanto a **perna B** está atrás; ao meio do ciclo trocam;
- **braços em oposição** às pernas, com amplitude pequena;
- **mesmo tom em todos os frames** (sem variação de sombreado — é isso que cintila);
- **mesmo tamanho**, pés visíveis e na mesma linha;
- fundo creme liso, sem texto, sem números, sem sombra.

## Bloco para colar (positivo)

```
One single horizontal row with exactly 8 evenly spaced frames of a walk cycle, read left to
right, NO film border, NO frame lines, NO text, NO numbers.

CHARACTER — identical in all 8 frames, drawn exactly the same way: chubby cream and fawn
English bulldog, white chest, white muzzle, white blaze on the forehead, big round brown eyes,
small floppy ears, rosy blush cheeks, chunky white pearl necklace, thick dark-brown ink
outlines, flat warm colours, ONE single flat shading tone, exactly the same colours and the
same line weight in every frame (no shading variation between frames).

VIEW — side view, walking to the right, standing upright on two legs with two short arms.
Both legs fully visible in every frame, both feet touching the same ground line, full body
inside the frame, identical size and identical centre in all 8 frames.

THE CYCLE — this is the important part, follow it exactly:
- frame 1: CONTACT. Front leg (near leg) stretched forward, heel on the ground; back leg
  stretched behind, toe on the ground; near arm swung back, far arm swung forward.
- frame 2: DOWN. Front leg takes the weight and bends slightly; back leg lifts off the ground.
- frame 3: PASSING. Back leg passes under the body, knee bent; front leg straight and
  vertical, supporting; arms passing close to the body.
- frame 4: UP. Supporting leg straightens and lifts the body slightly; the other leg swings
  forward, knee bent; arms at mid swing.
- frame 5: CONTACT (opposite). Now the other leg is stretched forward and the first one is
  behind; arms swapped: the arm that was back is now forward.
- frame 6: DOWN (opposite). Same as frame 2 with the legs swapped.
- frame 7: PASSING (opposite). Same as frame 3 with the legs swapped.
- frame 8: UP (opposite). Same as frame 4 with the legs swapped; this frame flows straight
  back into frame 1 to close the loop.

Arms swing with SMALL amplitude, gently, and always opposite to the legs. Head stays level,
no vertical head bobbing. The body does NOT drift sideways between frames: the character
stays centred in every cell.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, warm cream paper
background (#F4E7D0), no white sticker border, no drop shadow, no gradient, no text.
```

## Negativo

```
different character, orange fur, pink bow, changing colours between frames, different shading
per frame, different size per frame, body drifting sideways, missing feet, cut feet, extra legs,
legs crossing, three legs, arms rigid, text, numbers, labels, film border, frame lines,
drop shadow, 3D render, photorealistic, background scenery
```

## Depois de gerar

1. confirmar que os 8 frames estão numa linha e que o pé do frame 1 toca no do frame 8;
2. cortar por grelha regular (8 colunas) — não por componentes, porque as figuras tocam-se;
3. **estabilizar** pelo centro do tronco (`estabilizar_ciclo.py`);
4. **normalizar cor** (`normalizar_cores.py`);
5. registar como `frida/marcha-v2` a **8 fps** e renderizar 4 s.

Se o pé não fechar entre o último e o primeiro frame, é aceitável: a emenda fica com
2 frames de transição e não se vê a 8 fps.
