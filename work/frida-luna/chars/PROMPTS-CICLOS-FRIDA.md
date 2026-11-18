# Prompts — ciclos de movimento da Frida (a nossa, creme com pérolas)

Problema: a Frida do StickFilms é **laranja com lacinho rosa** — não é a nossa. A nossa é
**creme/fawn com colar de pérolas** (`chars/frida-v2-ok-flat.png`).

Solução: pedir ao Flow as folhas de ciclo **com a nossa folha como referência de imagem**.
Sem referência anexada, a IA muda a personagem — é a regra que já aprendemos.

Anexa sempre: `D:\CRAFT\work\frida-luna\chars\frida-v2-ok-flat.png`

---

## 1. Marcha (ciclo de 8 frames) — a mais importante

```
Using the attached character as the exact reference, draw an 8-frame WALK CYCLE of the same
cream and fawn English bulldog with the white chest, white muzzle and white blaze, wearing the
white pearl necklace. Side view, walking to the right. Full body, standing upright on two legs
with two short arms, the same thick dark-brown outlines, flat warm colors with light cel shading,
plain cream background, no white sticker border, no drop shadow, no text.

Frames arranged left to right in one row, evenly spaced, same size and same character in all
eight. The cycle must read: contact (front leg forward) → down → passing → up → contact (opposite
leg forward) → down → passing → up. Arms swing opposite to the legs. Keep the head steady, the
ears and the pearl necklace with a slight secondary motion.
```

## 2. Corrida (ciclo de 8 frames)

```
Using the attached character as the exact reference, draw an 8-frame RUN CYCLE of the same
cream and fawn English bulldog with the white blaze and the white pearl necklace. Side view,
running to the right, leaning slightly forward. Full body, upright on two legs, thick dark-brown
outlines, flat warm colors, light cel shading, plain cream background, no sticker border, no
shadow, no text.

One row, eight evenly spaced frames, identical character and identical size. Both feet leave the
ground at the passing pose. Arms pump strongly. Ears and pearls react to the movement.
```

## 3. Salto (6 frames)

```
Using the attached character as the exact reference, draw a 6-frame JUMP sequence of the same
cream and fawn English bulldog with the pearl necklace: 1 crouch, 2 push off, 3 rising with arms
up, 4 top of the jump, 5 falling, 6 landing with a small squash. Side view, upright on two legs,
same outlines and colors, plain cream background, no text, one row, evenly spaced, same size.
```

## 4. Falar / idle (6 frames)

```
Using the attached character as the exact reference, draw a 6-frame TALKING IDLE loop of the same
cream and fawn English bulldog with the pearl necklace: standing in place, three-quarter view,
small gestures with the paws, mouth changing from closed to half open to open and back, subtle
breathing, tiny head movements. Same outlines, same colors, plain cream background, no text, one
row, evenly spaced, same size.
```

## 5. Festa / dança (8 frames)

```
Using the attached character as the exact reference, draw an 8-frame CELEBRATION loop of the same
cream and fawn English bulldog with the pearl necklace: arms up, hips swinging, one small hop in
the middle, big happy face. Same outlines, colors and size in all frames, plain cream background,
no text, one row, evenly spaced.
```

---

## Negativo (colar no campo negativo)

```
different character, orange fur, pink bow, collar without pearls, changing proportions between
frames, text, letters, numbers, white sticker border, drop shadow, 3D render, photorealistic,
background scenery, blurry, watermarked
```

## Depois de gerar

Guardar em `D:\CRAFT\work\frida-luna\chars\folhas\` com nomes:
`frida-ciclo-marcha.jpg`, `frida-ciclo-corrida.jpg`, `frida-ciclo-salto.jpg`,
`frida-idle-fala.jpg`, `frida-festa.jpg`.

Eu fatio cada linha, alinho pela base (centro dos pés) e mesma escala — é isso que impede o
boneco de saltar entre frames — e ligo ao motor.
