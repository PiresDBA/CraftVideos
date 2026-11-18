# Prompts — os 13 movimentos em falta (Frida e Luna)

Este ficheiro é só de **prompts para o Google Flow**. Não gera imagens, não corre o Flow,
não altera código. Cada bloco abaixo está pronto a colar: linha única horizontal, mesma
personagem em todos os quadros, vista indicada, ciclo descrito quadro a quadro, fundo
creme liso sem linha de chão nem sombra.

## Ordem de entrega (prioridade)

1. **Frida — escuta** (31 beats) — o movimento mais importante do episódio
2. **Luna — escuta** (33 beats)
3. **Frida — fala** (3 beats, mas é a boca que falta toda)
4. Frida — corrida · 5. Luna — marcha · 6. Frida — giro · 7. Luna — giro
8. Frida — sentar · 9. Luna — sentar · 10. Frida — olhar · 11. Luna — olhar
12. Frida — abraçar · 13. Luna — abraçar

Fonte dos beats: `animacao/faltam.json`. Modelo de formato: `chars/PROMPTS-MARCHA-V3.md`.
Receita de animação: `MOTOR-FLOW.md` § "Receita aprovada".

## Regras comuns (não repetidas em cada bloco, mas presentes em todos os prompts)

- **Anexar sempre a folha aprovada como referência de imagem:**
  `chars/frida-v2-ok-flat.png` ou `chars/luna-v2-ok-flat.png`. Sem referência, a IA muda a
  personagem — é a regra que já falhou nas grelhas de expressão.
- **8 quadros por omissão**, numa única linha horizontal em canvas 16:9. É o número da
  marcha aprovada (`flow-10`) e dá um ciclo fechado e simétrico; mantém também cada desenho
  grande o suficiente para recortar. Só peço **12 quadros** onde o motivo está escrito no
  bloco (giro e sentar): mudança de vista e tempo de assento, respetivamente.
- **Fundo creme liso `#F4E7D0`** — o mesmo creme quente registado como `#F4E9D8` na ficha
  de personagens. Sem linha de chão, sem sombra projetada, sem contorno branco de autocolante.
- **Contorno `#241610`**, espessura constante, cores planas com um único tom de sombreamento.
- **Nunca** números, texto, legendas, etiquetas ou molduras nas imagens.
- Para marcha e corrida: **perfil puro (90°)** e **perna de trás mais escura**, porque em 3/4
  a perna de trás esconde-se e o ciclo lê-se como mancar (diagnóstico do V3).
- As proporções da ficha aprovada mantêm-se: Frida escala 1,00; Luna escala 0,72 em altura,
  mas ganha em **comprimento** — é longa e baixa, não uma Frida pequena.
- Ao animar, respeitar a receita aprovada: **7,5 fps** (4 frames por desenho) ou **10 fps**
  (3 frames por desenho). Qualquer outro valor tremelica. Isto é nota de animação, não vai
  no prompt do Flow.

## Como ler os critérios de aceitação

Todas as medidas são em **pixels numa sprite já recortada e normalizada para H = 270 px de
altura** (ver `movimentos/padroes.json`, sprite da marcha aprovada). Se a sprite final tiver
outra altura H′, multiplica as tolerâncias por H′/270. Medir depois de `cortar_mascara.py` +
`ciclo_de_tira.py` (fundo ligado à borda, altura mediana, base dos pés alinhada). Onde se diz
"quadro 8 ≈ quadro 1", compara as máscaras depois de alinhadas pela base.

---

## 1. Frida — escuta (PRIORIDADE MÁXIMA, 31 beats)

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: é um idle de ciclo fechado e simétrico; 8 quadros bastam para uma respiração
(entrada → saída) e uma mudança mínima de peso sem o boneco "pensar" demais. É também o
formato que o motor já sabe cortar e alinhar. Não pedir 12: quanto mais quadros num idle,
mais hipóteses de a IA introduzir tremor e quebrar a imobilidade das pernas.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a subtle IDLE / LISTENING
loop, read left to right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: chubby cream and fawn English bulldog (#E3CEAE /
#CE905A), white chest, white muzzle, white blaze on the forehead, big round brown eyes with
a highlight, small floppy ears, rosy blush cheeks, chunky white pearl necklace (#F2EDE4),
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT back view. Standing upright on two legs, arms relaxed at
the sides, both feet flat on the same invisible baseline in every drawing.

THE CYCLE — this is an IDLE, not a walk and not a performance. The legs, feet and hands NEVER
move: no stepping, no foot lift, no arm gesture. Only breathing, a tiny sway and a minimum
weight shift. Follow exactly:
- drawing 1: neutral, mouth closed, gentle smile, weight even on both feet.
- drawing 2: inhale — chest expands by 1 to 2 pixels, head rises by 1 pixel.
- drawing 3: tiny sway of the torso to the right, ears settle, pearls sway 1 pixel.
- drawing 4: exhale — chest returns, head back to neutral.
- drawing 5: minimum weight shift to the other foot, head tilts by 1 or 2 degrees, nothing else.
- drawing 6: second inhale, chest expands by 1 to 2 pixels.
- drawing 7: sway back to centre, pearls settle.
- drawing 8: EXACTLY drawing 1 — same pose, same face, same everything, so the loop closes
  invisibly.

Rule to check: the head travels only a few pixels in total, the chest breathes just enough
to be alive, and the feet are pixel-identical in all 8 drawings. It must not look dead and it
must not look like walking. The character stays centred: no sideways drift, no size change.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
three-quarter turn of the body, walking, stepping, foot lift, arm gesture, head turn, mouth
open, blinking, different character, orange fur, pink bow, collar without pearls, missing
pearls, different size per drawing, body drifting sideways, chest heaving, bouncing, hopping,
different face per drawing, changing colours, text, numbers, labels, captions, frame borders,
ground line, drop shadow, white sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Centro dos olhos: deslocamento ≤ **3 px** em x e ≤ **2 px** em y entre quaisquer dois quadros.
- Altura total da figura (topo da cabeça → base dos pés): variação ≤ **4 px** (1,5 % de H).
- Respiração: expansão do peito entre **1 e 3 px**. Se for 0 o idle está morto; se passar de
  4 px está a "inchar". Medir a largura do tronco ao nível do peito.
- Pés e pernas: máscara da região dos pés idêntica nos 8 quadros dentro de **2 px**; nenhum
  pé se levanta mais de **1 px**. É o teste que impede que a escuta se leia como marcha.
- Base dos pés (y): constante ± **1 px**.
- Boca fechada nos 8 quadros (abertura ≤ **1 px**).
- Quadro 8 ≈ quadro 1 dentro de **3 px**. Se falhar, a tira dá um salto ao repetir.

---

## 2. Luna — escuta (PRIORIDADE MÁXIMA, 33 beats)

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: mesma razão da Frida — é o idle com mais beats do episódio e tem de ser
perfeitamente imóvel nas patas. Oito quadros fecham a respiração sem dar margem a tremor.
Atenção extra: a Luna é longa e baixa, por isso o balanço tem de ser ainda mais contido do
que na Frida, senão o corpo comprido amplifica qualquer deslocamento.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a subtle IDLE / LISTENING
loop, read left to right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: long and LOW chestnut-brown dachshund (#806343)
with darker rust markings (#62341F) on the paws, muzzle and ear tips, very long floppy ears,
tiny tail, big round brown eyes with a highlight, purple bandana (#6B4F9E) tied at the neck,
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. Long in BODY LENGTH, not in height.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT back view. Standing upright on two short legs, arms relaxed
at the sides, both feet flat on the same invisible baseline in every drawing.

THE CYCLE — this is an IDLE, not a walk. The legs, feet and hands NEVER move. Only a slow
breath, a tiny sway and a minimum weight shift. Follow exactly:
- drawing 1: neutral, mouth closed, gentle smile, weight even, ears hanging.
- drawing 2: inhale — chest expands by 1 to 2 pixels, head rises by 1 pixel.
- drawing 3: tiny sway of the long torso to the right; the long ears lag by 1 pixel.
- drawing 4: exhale — chest returns, head back to neutral.
- drawing 5: minimum weight shift to the other foot, head tilts by 1 or 2 degrees, nothing else.
- drawing 6: second inhale, chest expands by 1 to 2 pixels.
- drawing 7: sway back to centre, bandana and ears settle.
- drawing 8: EXACTLY drawing 1 — same pose, same face, same everything, so the loop closes
  invisibly.

Rule to check: the head travels only a few pixels, the chest breathes just enough to be
alive, and the feet are pixel-identical in all 8 drawings. The long body must not undulate
like a worm. The character stays centred: no sideways drift, no size change.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
walking, stepping, foot lift, body undulating, worm-like bending, arm gesture, head turn,
mouth open, tail wagging, different character, bulldog body, short legs, tall body, wrong
bandana colour, red bandana, missing bandana, different size per drawing, body drifting
sideways, bouncing, different face per drawing, changing colours, text, numbers, labels,
captions, frame borders, ground line, drop shadow, white sticker border, 3D render,
photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Centro dos olhos: deslocamento ≤ **3 px** em x e ≤ **2 px** em y entre quaisquer dois quadros.
- Altura total da figura: variação ≤ **4 px** (1,5 % de H). Atenção redobrada: o comprimento
  do corpo (focinho → rabo) também não pode variar mais de **3 px** — é o equivalente da Luna.
- Respiração: expansão do peito entre **1 e 3 px**; 0 está morto, > 4 px está a inchar.
- Pés e pernas: máscara da região dos pés idêntica nos 8 quadros dentro de **2 px**; nenhum
  pé se levanta mais de **1 px**.
- Orelhas compridas: deslocamento das pontas ≤ **4 px** (movimento secundário, não leque).
- Base dos pés (y): constante ± **1 px**. Boca fechada nos 8 quadros (abertura ≤ **1 px**).
- Quadro 8 ≈ quadro 1 dentro de **3 px**.

---

## 3. Frida — fala (PRIORIDADE ALTA)

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: é um ciclo de boca a abrir e fechar, simétrico por natureza — 4 quadros de
abertura e 4 de fecho. Oito dá uma curva limpa e, sobretudo, permite dizer explicitamente
que a boca está fechada no quadro 1 e no quadro 8. Não é lip-sync: não se pedem sílabas nem
palavras, só o mecanismo da boca.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a TALKING mouth loop, read
left to right. This is NOT lip-sync: no syllables, no words, just the mouth opening and
closing. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: chubby cream and fawn English bulldog (#E3CEAE /
#CE905A), white chest, white muzzle, white blaze on the forehead, big round brown eyes with
a highlight, small floppy ears, rosy blush cheeks, chunky white pearl necklace (#F2EDE4),
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT back view. Standing upright on two legs, arms relaxed at
the sides, both feet flat on the same invisible baseline in every drawing. Only the mouth
and the cheeks animate; the body is as still as in the listening idle.

THE CYCLE — follow exactly, and keep the closing rule:
- drawing 1: mouth CLOSED, gentle smile. This is the closed start of the loop.
- drawing 2: mouth opens slightly, a small rounded opening; cheeks lift a little.
- drawing 3: mouth open medium; cheeks wider and rounder.
- drawing 4: mouth open wide in a happy "ah"; cheeks at their widest, eyes unchanged.
- drawing 5: mouth back to medium; cheeks settling.
- drawing 6: mouth small again.
- drawing 7: mouth almost closed.
- drawing 8: mouth CLOSED, gentle smile, EXACTLY drawing 1. The mouth MUST be closed in
  drawing 1 and in drawing 8 so the loop closes without a jump.

Rule to check: the cheeks follow the mouth — they widen as it opens and return as it closes.
The eyes, head and body do not change. The legs and feet are identical in all 8 drawings;
no gesturing with the paws. No sideways drift, no size change.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
lip-sync syllables, written words, speech bubble, different mouth shape per drawing, mouth
open in the first drawing, mouth open in the last drawing, teeth, tongue out, head movement,
arm gesture, paw gesture, walking, different character, orange fur, pink bow, collar without
pearls, different size per drawing, changing colours, text, numbers, labels, captions, frame
borders, ground line, drop shadow, white sticker border, 3D render, photorealistic,
background scenery
```

**Critério de aceitação (medido):**
- Abertura da boca (altura da abertura escura do focinho): **≤ 1 px no quadro 1 e no quadro 8**
  (boca fechada — requisito de fecho do ciclo); pico de **8 a 14 px no quadro 4**. A curva
  tem de subir 1→4 e descer 4→8 sem voltas.
- Bochechas: a largura de cada bochecha acompanha a abertura com desvio ≤ **3 px** da curva
  esperada; deslocamento lateral ≤ **3 px**. Se as bochechas ficarem paradas, rejeitar.
- Centro dos olhos: ≤ **3 px** em x e em y entre quadros. Altura total da figura: ≤ **3 px**.
- Pés e pernas: máscara idêntica dentro de **2 px**; base dos pés ± **1 px**.
- Quadro 8 ≈ quadro 1 dentro de **2 px**, incluindo a boca. É o critério mais duro deste
  bloco: se a boca não fechar, a fala dá um estalo ao repetir.

---

## 4. Frida — corrida

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: a corrida é o mesmo mecanismo da marcha aprovada, só que mais rápido e com fase
de voo; o porteiro de pernas (`animar_tira.py`) foi calibrado para tiras de 8. Manter 8
também permite reutilizar directamente os 7,5 / 10 fps da receita aprovada.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a RUN CYCLE, read left to
right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: chubby cream and fawn English bulldog (#E3CEAE /
#CE905A), white chest, white muzzle, white blaze on the forehead, big round brown eyes with
a highlight, small floppy ears, rosy blush cheeks, chunky white pearl necklace (#F2EDE4),
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing.

VIEW — PURE SIDE PROFILE, exactly 90 degrees, running to the right, leaning slightly
forward. NOT three-quarter view, NOT front view, NOT turned towards the camera. The body is
a flat silhouette seen from the side and BOTH legs are in the same plane, fully visible in
every drawing. The far leg is drawn in a clearly darker tan than the near leg, and its
outline is complete, so it never disappears behind the body.

THE CYCLE — running in place, with a clear flight phase and a real leg swap:
- drawing 1: NEAR leg forward and planted; FAR leg (darker) stretched back.
- drawing 2: NEAR leg takes the weight and compresses; FAR leg lifts and swings forward.
- drawing 3: FLIGHT — both feet are off the ground, body at its highest, legs tucked.
- drawing 4: FAR leg (darker) lands IN FRONT; NEAR leg is behind. The legs have SWAPPED.
- drawing 5: FAR leg takes the weight; NEAR leg lifts and drives forward.
- drawing 6: FLIGHT — both feet off the ground again.
- drawing 7: NEAR leg lands IN FRONT; FAR leg (darker) behind.
- drawing 8: NEAR leg planted, FAR leg passing back — flows straight into drawing 1.

Rule to check: in drawings 1-2 the NEAR leg is ahead; in drawings 4-5 the FAR (darker) leg
is ahead. The two legs MUST swap. Arms pump strongly in opposition. Ears and pearls stream
backwards with the speed. The head bobs only a few pixels. The character runs in place: the
body does NOT drift sideways and does not change size. Feet return to the same invisible
baseline; there is no drawn ground line.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
three-quarter view, front view, body turned to camera, only one leg visible, far leg hidden,
far leg same colour as near leg, both legs always in the same order, no flight phase,
walking, hopping on one leg, limp, legs merging into one shape, different character, orange
fur, pink bow, changing colours between drawings, different size per drawing, body drifting
sideways, feet below the baseline, missing feet, three legs, text, numbers, ground line,
drop shadow, white sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Troca de perna: o centro da perna clara está à frente do centro do corpo em **≥ 2 quadros**
  e o da escura em **≥ 2 quadros** (medir com `medir_pes.py`, o mesmo porteiro da marcha).
  Se a ordem nunca trocar, devolver ao Flow.
- Fase de voo: em **≥ 1 quadro** ambos os pés estão ≥ **4 px** acima da base dos pés.
- Perna de trás visível nos **8** quadros (nunca fundida com a da frente).
- Desvio lateral do centro do corpo ≤ **3 px** (é corrida no lugar, não travessia do quadro).
- Bob da cabeça ≤ **6 px**: mais do que na marcha, mas sem saltar.
- Altura total constante ≤ **6 px**; quadro 8 ≈ quadro 1 dentro de **4 px**.

---

## 5. Luna — marcha

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: é o mesmo formato da marcha aprovada da Frida e permite aplicar o porteiro de
pernas sem adaptações. A Luna tem as pernas curtas, por isso a alternância é mais difícil
de ver — o contraste de cor da perna de trás é ainda mais importante do que na Frida.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a WALK CYCLE, read left to
right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: long and LOW chestnut-brown dachshund (#806343)
with darker rust markings (#62341F) on the paws, muzzle and ear tips, very long floppy ears,
tiny tail, big round brown eyes with a highlight, purple bandana (#6B4F9E) tied at the neck,
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. Long in BODY LENGTH, not in height.

VIEW — PURE SIDE PROFILE, exactly 90 degrees, walking to the right. NOT three-quarter view,
NOT front view, NOT turned towards the camera. The body is a flat silhouette seen from the
side and BOTH short legs are in the same plane, one slightly behind the other, fully visible
in every drawing. The far leg is drawn in a clearly darker brown than the near leg, and its
outline is complete, so it never disappears behind the long body.

THE CYCLE — follow exactly and make the alternation obvious:
- drawing 1: NEAR leg forward, heel on the ground and clearly ahead of the body; FAR leg
  (darker) stretched back, toe on the ground and clearly behind the body.
- drawing 2: NEAR leg takes the weight and bends; FAR leg lifts and starts to swing forward.
- drawing 3: FAR leg passes under the body, still on the far side, still darker.
- drawing 4: FAR leg is now IN FRONT, foot ahead of the body; NEAR leg is behind.
- drawing 5: FAR leg (darker) forward on the ground; NEAR leg stretched back. This is the
  mirror of drawing 1 — the legs have SWAPPED places.
- drawing 6: FAR leg takes the weight and bends; NEAR leg lifts and swings forward.
- drawing 7: NEAR leg passes under the body.
- drawing 8: NEAR leg is IN FRONT again, and this drawing flows straight back into drawing 1.

Rule to check: in drawings 1-2 the NEAR leg is ahead; in drawings 4-6 the FAR (darker) leg is
ahead. The two legs MUST swap. Arms swing in opposition, small amplitude. Head level, no
vertical head bobbing. The long ears trail with a slight delay. The character stays centred:
the body does NOT drift sideways, does not change size and does not stretch in length. Feet
on the same invisible baseline; no drawn ground line.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
three-quarter view, front view, body turned to camera, only one leg visible, far leg hidden,
far leg same colour as near leg, both legs always in the same order, body stretching and
shrinking, worm-like undulation, hopping on one leg, limp, legs merging into one shape,
bulldog body, tall body, wrong bandana colour, different character, changing colours between
drawings, different size per drawing, body drifting sideways, missing feet, cut feet, three
legs, text, numbers, ground line, drop shadow, white sticker border, 3D render,
photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Troca de perna: centro da perna clara à frente em **≥ 2 quadros** e da escura em **≥ 2
  quadros** (`medir_pes.py`). É o mesmo porteiro que rejeitou `flow-04`, `flow-09` e a tira
  de 12 quadros.
- Perna de trás visível nos **8** quadros (comprimento do contorno da perna escura > 0).
- Comprimento do corpo, focinho → rabo: constante dentro de **4 px**; altura do tronco
  dentro de **3 px**. A Luna não pode esticar-se como um elástico.
- Bob da cabeça ≤ **2 px**; base dos pés ± **1 px**; desvio lateral ≤ **2 px**.
- Quadro 8 ≈ quadro 1 dentro de **3 px**.

---

## 6. Frida — giro (12 quadros justificados)

**Quadros pedidos: 12, numa única linha, canvas 16:9 ligeiramente mais largo.**
Porquê 12: é o único ciclo em que a **vista muda** (perfil → frente → perfil). Com 8 quadros
a posição de frente aparece só num desenho e a rotação lê-se como um salto. Doze quadros
dão passos de ~15° e dois quadros de frente, o que suaviza a mudança de silhueta. O canvas
pode ser mais largo que 16:9 para que cada desenho não fique mais pequeno do que nas folhas
de 8 — o corte e a normalização depois tratam disso.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 12 evenly spaced drawings of a TURN-AROUND loop, read
left to right (a slightly wider canvas is fine, so each drawing stays large). NO text, NO
numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 12 drawings: chubby cream and fawn English bulldog (#E3CEAE /
#CE905A), white chest, white muzzle, white blaze on the forehead, big round brown eyes with
a highlight, small floppy ears, rosy blush cheeks, chunky white pearl necklace (#F2EDE4),
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. The SAME dog in every drawing —
the turn changes the VIEW, not the character.

VIEW — this cycle goes from PURE SIDE PROFILE (exactly 90 degrees, facing right) to FRONT
VIEW and back to the same PURE SIDE PROFILE facing right. Drawing 1 and drawing 12 are pure
profile; drawings 5 and 6 are front view. NOT three-quarter in the first and last drawings.

THE CYCLE — a turn to the camera and back, in even steps, rotating in place:
- drawing 1: pure side profile, facing right — one eye visible, muzzle pointing right,
  necklace seen edge-on, narrow silhouette.
- drawing 2: beginning to turn towards the camera, still mostly profile.
- drawing 3: three-quarter, both eyes starting to appear.
- drawing 4: almost front, necklace widening across the chest.
- drawing 5: front view, two eyes visible, necklace straight and horizontal.
- drawing 6: front view, hold — same as drawing 5.
- drawing 7: starting to turn back, the reverse of drawing 4.
- drawing 8: three-quarter again, the reverse of drawing 3.
- drawing 9: three-quarter facing right again, the reverse of drawing 2.
- drawing 10: late three-quarter, almost profile.
- drawing 11: nearly pure side profile.
- drawing 12: EXACTLY drawing 1 — pure side profile facing right, so the loop closes.

Rule to check: the rotation is smooth and even, without a jump; the head stays at the same
height and the feet stay on the same invisible baseline. The dog turns on the spot: no
sideways drift, no size change, no change of face. No step, no foot lift — the legs are the
same drawing seen from different angles.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
three-quarter in the first drawing, three-quarter in the last drawing, different character
when facing front, face changing during the turn, body growing wider without turning, jump
cut, spin a full 360 degrees, walking while turning, foot lift, different size per drawing,
head changing height, different colours between drawings, extra limbs, text, numbers,
labels, captions, frame borders, ground line, drop shadow, white sticker border, 3D render,
photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Desenhos 1 e 12: perfil puro — **um olho visível** e ponta do focinho a apontar para a
  direita. Desenhos 5 e 6: frente — **dois olhos visíveis** e colar horizontal.
- Largura do tronco: a largura em frente (desenhos 5–6) tem de ser **≥ 25 % maior** do que a
  largura em perfil (desenhos 1 e 12). Se a largura não mudar, a IA limitou-se a mexer na cara.
- Variação do ângulo da cabeça entre quadros consecutivos ≤ **45°** (sem saltos de 90°).
- Centro da cabeça em x dentro de **± 4 px**; base dos pés ± **1 px**; altura total constante
  ≤ **5 px**.
- Quadro 12 ≈ quadro 1 dentro de **4 px** (máscara e cor).

---

## 7. Luna — giro (12 quadros justificados)

**Quadros pedidos: 12, numa única linha, canvas 16:9 ligeiramente mais largo.**
Porquê 12: mesma razão da Frida, com um agravante — o corpo comprido da Luna faz a silhueta
mudar muito entre perfil e frente (perfil é uma linha longa, frente é estreita). Sem passos
intermédios suficientes a mudança parece um "estalido" de geometria. O canvas mais largo
evita esmagar o corpo longo da Luna em células estreitas.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 12 evenly spaced drawings of a TURN-AROUND loop, read
left to right (a slightly wider canvas is fine, so the long body stays large). NO text, NO
numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 12 drawings: long and LOW chestnut-brown dachshund (#806343)
with darker rust markings (#62341F) on the paws, muzzle and ear tips, very long floppy ears,
tiny tail, big round brown eyes with a highlight, purple bandana (#6B4F9E) tied at the neck,
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. The SAME dog in every drawing —
the turn changes the VIEW, not the character. Long in BODY LENGTH, not in height.

VIEW — this cycle goes from PURE SIDE PROFILE (exactly 90 degrees, facing right) to FRONT
VIEW and back to the same PURE SIDE PROFILE facing right. Drawing 1 and drawing 12 are pure
profile; drawings 5 and 6 are front view. NOT three-quarter in the first and last drawings.

THE CYCLE — a turn to the camera and back, in even steps, rotating in place:
- drawing 1: pure side profile, facing right — one eye visible, muzzle pointing right, the
  long body at its full length, bandana seen edge-on.
- drawing 2: beginning to turn towards the camera, body slightly shorter in silhouette.
- drawing 3: three-quarter, both eyes starting to appear.
- drawing 4: almost front, bandana widening across the chest.
- drawing 5: front view, two eyes visible, bandana straight, body at its narrowest.
- drawing 6: front view, hold — same as drawing 5.
- drawing 7: starting to turn back, the reverse of drawing 4.
- drawing 8: three-quarter again, the reverse of drawing 3.
- drawing 9: three-quarter facing right again, the reverse of drawing 2.
- drawing 10: late three-quarter, long body almost back in profile.
- drawing 11: nearly pure side profile.
- drawing 12: EXACTLY drawing 1 — pure side profile facing right, so the loop closes.

Rule to check: the long ears and the tail follow the turn with a slight delay, but the
length of the body in profile is always the same. The head stays at the same height and the
feet stay on the same invisible baseline. The dog turns on the spot: no sideways drift, no
size change, no undulating. No step, no foot lift.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
three-quarter in the first drawing, three-quarter in the last drawing, body stretching and
shrinking during the turn, worm-like undulation, different character when facing front,
face changing during the turn, jump cut, spin a full 360 degrees, walking while turning,
foot lift, different size per drawing, head changing height, wrong bandana colour, different
colours between drawings, extra limbs, text, numbers, labels, captions, frame borders,
ground line, drop shadow, white sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Desenhos 1 e 12: perfil puro — **um olho visível**; desenhos 5 e 6: frente — **dois olhos
  visíveis**, bandana horizontal.
- Largura do corpo em perfil (desenhos 1 e 12) ≥ **1,4 ×** a largura em frente (desenhos 5–6).
  Na Luna o sinal da rotação é exactamente o inverso da Frida: o perfil é o mais largo.
- Comprimento do corpo em perfil constante dentro de **4 px** nos desenhos 1, 2, 11 e 12.
- Variação do ângulo da cabeça entre quadros consecutivos ≤ **45°**.
- Centro da cabeça em x dentro de **± 4 px**; base dos pés ± **1 px**; altura total constante
  ≤ **5 px**; pontas das orelhas com atraso ≤ **6 px**.
- Quadro 12 ≈ quadro 1 dentro de **4 px**.

---

## 8. Frida — sentar (12 quadros justificados)

**Quadros pedidos: 12, numa única linha, canvas 16:9.**
Porquê 12: sentar não é só descer e subir — precisa de um **assento com peso** (2–3 quadros
quase iguais no ponto mais baixo) para não ler como um salto elástico. Oito quadros deixam
apenas um quadro no fundo. Doze permitem descida (1–5), assento (6–8) e subida (9–12).

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 12 evenly spaced drawings of a SIT DOWN AND STAND UP
loop, read left to right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 12 drawings: chubby cream and fawn English bulldog (#E3CEAE /
#CE905A), white chest, white muzzle, white blaze on the forehead, big round brown eyes with
a highlight, small floppy ears, rosy blush cheeks, chunky white pearl necklace (#F2EDE4),
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT back view. Both FEET stay planted on the same invisible
baseline in all 12 drawings; only the knees bend and the rump lowers.

THE CYCLE — the feet never move, the torso never stretches; the drop comes from the knees:
- drawing 1: standing, neutral, arms relaxed at the sides.
- drawing 2: weight shifts back, knees begin to bend.
- drawing 3: lowering, rump down about 8 pixels.
- drawing 4: lowering, rump down about 18 pixels, arms float forward for balance.
- drawing 5: rump near the lowest point, knees deeply bent.
- drawing 6: SEATED, lowest point, body settled.
- drawing 7: seated, hold — tiny breathing only, almost identical to drawing 6.
- drawing 8: seated, hold — almost identical to drawings 6 and 7.
- drawing 9: starting to rise, rump up slightly.
- drawing 10: rising, knees extending.
- drawing 11: almost standing.
- drawing 12: EXACTLY drawing 1 — standing, so the loop closes.

Rule to check: drawings 6, 7 and 8 must look like a held sitting pose, not a bounce. The
head comes down with the body but the torso keeps its length; no squashing like rubber. No
drawn ground line, no shadow under the dog, no cushion, no chair.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
bouncing, elastic squash and stretch, chair, cushion, stool, floor line, shadow on the floor,
feet sliding, feet lifting, knees bending backwards, extra limbs, changing torso length,
different char, different size per drawing, head growing, body turning to profile, different
colours, text, numbers, labels, captions, frame borders, drop shadow, white sticker border,
3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Altura total no ponto mais baixo (desenhos 6–8): **H − (25 ± 5) px**, ou seja, uma quebra
  de **≥ 20 px** em relação ao desenho 1. Se a quebra for < 20 px, o boneco não chegou a sentar.
- Desenhos 6, 7 e 8 dentro de **3 px** entre si (assento estável, não saltito).
- Altura do tronco (nuca → topo da cabeça) constante dentro de **4 px** — a descida tem de
  vir das pernas, não do tronco a encolher.
- Pés na mesma base ± **2 px**; nenhuma parte do corpo desce abaixo da base dos pés.
- Altura total do desenho 1 = desenho 12 dentro de **3 px**; quadro 12 ≈ quadro 1 dentro de
  **3 px**.

---

## 9. Luna — sentar (12 quadros justificados)

**Quadros pedidos: 12, numa única linha, canvas 16:9.**
Porquê 12: mesma razão da Frida, mas com o cuidado extra de medir a descida no **rabo /
parte de trás**, não no peito — a Luna é longa e baixa, e o peito mal desce. Doze quadros
dão ainda espaço para as orelhas compridas assentarem depois do movimento.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 12 evenly spaced drawings of a SIT DOWN AND STAND UP
loop, read left to right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 12 drawings: long and LOW chestnut-brown dachshund (#806343)
with darker rust markings (#62341F) on the paws, muzzle and ear tips, very long floppy ears,
tiny tail, big round brown eyes with a highlight, purple bandana (#6B4F9E) tied at the neck,
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. Long in BODY LENGTH, not in height.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT back view. Both FEET stay planted on the same invisible
baseline in all 12 drawings; only the short legs bend and the long rump lowers.

THE CYCLE — measure the drop at the rump, not at the chest:
- drawing 1: standing, neutral, arms relaxed at the sides.
- drawing 2: weight shifts back, short legs begin to bend.
- drawing 3: lowering, rump down about 8 pixels.
- drawing 4: lowering, rump down about 18 pixels, ears beginning to swing.
- drawing 5: rump near the lowest point, legs deeply bent.
- drawing 6: SEATED, lowest point, body settled, ears hanging down.
- drawing 7: seated, hold — tiny breathing only, almost identical to drawing 6.
- drawing 8: seated, hold — almost identical to drawings 6 and 7.
- drawing 9: starting to rise, rump up slightly, ears lagging.
- drawing 10: rising, legs extending.
- drawing 11: almost standing.
- drawing 12: EXACTLY drawing 1 — standing, so the loop closes.

Rule to check: drawings 6, 7 and 8 must look like a held sitting pose, not a bounce. The torso
keeps its length; the long body must not fold or undulate like a worm. No drawn ground line,
no shadow under the dog, no cushion, no chair.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
bouncing, elastic squash and stretch, worm-like bending, body folding in the middle, chair,
cushion, stool, floor line, shadow on the floor, feet sliding, feet lifting, knees bending
backwards, extra limbs, bulldog body, tall body, wrong bandana colour, different size per
drawing, body turning to profile, different colours, text, numbers, labels, captions, frame
borders, drop shadow, white sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Altura total no ponto mais baixo (desenhos 6–8): quebra de **≥ 20 px** (ideal 25 ± 5) face
  ao desenho 1, medida no **rabo / parte de trás**, não no peito.
- Desenhos 6, 7 e 8 dentro de **3 px** entre si.
- Altura do tronco constante dentro de **4 px**; comprimento do corpo focinho → rabo
  constante dentro de **4 px** (a Luna não se dobra ao sentar).
- Pés na mesma base ± **2 px**; pontas das orelhas com atraso ≤ **6 px** no movimento.
- Quadro 12 ≈ quadro 1 dentro de **3 px**.

---

## 10. Frida — olhar

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: é um movimento de cabeça e olhos, curto e simétrico — olhar para o lado e voltar.
Oito quadros chegam para o "ir", um quadro de pausa e o "voltar", sem mexer no corpo.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a LOOK / GLANCE loop, read
left to right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: chubby cream and fawn English bulldog (#E3CEAE /
#CE905A), white chest, white muzzle, white blaze on the forehead, big round brown eyes with
a highlight, small floppy ears, rosy blush cheeks, chunky white pearl necklace (#F2EDE4),
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT a full turn. Standing upright on two legs, arms relaxed at
the sides, both feet flat on the same invisible baseline in every drawing. The BODY DOES NOT
TURN — only the eyes, the head and the ears react.

THE CYCLE — follow exactly:
- drawing 1: head forward, eyes looking forward, neutral.
- drawing 2: pupils dart to the right; head just beginning to follow.
- drawing 3: head turned slightly to the right, eyes to the right.
- drawing 4: hold — slight ear follow, eyes still to the right.
- drawing 5: pupils come back first; head starts to return.
- drawing 6: head halfway back to centre.
- drawing 7: head almost forward again.
- drawing 8: EXACTLY drawing 1 — head forward, eyes forward, so the loop closes.

Rule to check: this is a glance, not a turn-around. The muzzle tip moves only a few pixels,
still inside the head silhouette. The torso, arms and legs are identical in all 8 drawings;
the necklace does not rotate. No sideways drift, no size change.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
full body turn, turn-around, three-quarter to profile, walking, stepping, foot lift, arm
gesture, body leaning, eyes changing size, pupils disappearing, blinking, different character,
orange fur, pink bow, collar without pearls, different size per drawing, body drifting,
different colours, text, numbers, labels, captions, frame borders, ground line, drop shadow,
white sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Ponta do focinho: deslocamento de **4 a 8 px** em x no pico (desenho 3 ou 4); centro da
  cabeça ≤ **8 px** no total.
- Pupilas: deslocamento de **2 a 5 px** dentro do olho; diâmetro do olho constante ± **1 px**.
- Tronco e pernas: máscara idêntica dentro de **2 px**; largura do tronco varia ≤ **5 %**.
  Se o tronco rodar, é giro e não olhar — rejeitar.
- Base dos pés ± **1 px**; quadro 8 ≈ quadro 1 dentro de **3 px**.

---

## 11. Luna — olhar

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: mesmo ciclo curto e simétrico da Frida. Na Luna o sinal visual principal são as
orelhas compridas, que chegam um pouco depois da cabeça — é isso que dá vida ao olhar sem
mexer no corpo longo.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a LOOK / GLANCE loop, read
left to right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: long and LOW chestnut-brown dachshund (#806343)
with darker rust markings (#62341F) on the paws, muzzle and ear tips, very long floppy ears,
tiny tail, big round brown eyes with a highlight, purple bandana (#6B4F9E) tied at the neck,
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. Long in BODY LENGTH, not in height.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT a full turn. Standing upright on two short legs, arms
relaxed at the sides, both feet flat on the same invisible baseline in every drawing. The
BODY DOES NOT TURN — only the eyes, the head and the very long ears react.

THE CYCLE — follow exactly:
- drawing 1: head forward, eyes looking forward, ears hanging, neutral.
- drawing 2: pupils dart to the right; head just beginning to follow.
- drawing 3: head turned slightly to the right, eyes to the right, ears starting to swing.
- drawing 4: hold — long ears catch up a moment later, eyes still to the right.
- drawing 5: pupils come back first; head starts to return, ears still lagging.
- drawing 6: head halfway back to centre, ears settling.
- drawing 7: head almost forward again.
- drawing 8: EXACTLY drawing 1 — head forward, eyes forward, ears hanging, so the loop closes.

Rule to check: this is a glance, not a turn-around. The long body does not undulate and the
bandana does not rotate. The torso, arms and legs are identical in all 8 drawings. No
sideways drift, no size change.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
full body turn, turn-around, body undulating, worm-like bending, walking, stepping, foot lift,
arm gesture, tail wagging wildly, eyes changing size, pupils disappearing, blinking, bulldog
body, tall body, wrong bandana colour, different character, different size per drawing, body
drifting, different colours, text, numbers, labels, captions, frame borders, ground line,
drop shadow, white sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Ponta do focinho: deslocamento de **4 a 8 px** em x no pico; centro da cabeça ≤ **8 px**.
- Pupilas: deslocamento de **2 a 5 px** dentro do olho; diâmetro do olho constante ± **1 px**.
- Pontas das orelhas: deslocamento ≤ **6 px**, com atraso visível entre o desenho 2 e o 4.
- Tronco e pernas: máscara idêntica dentro de **2 px**; comprimento do corpo constante dentro
  de **3 px**; base dos pés ± **1 px**.
- Quadro 8 ≈ quadro 1 dentro de **3 px**.

---

## 12. Frida — abraçar

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: o abraço é um gesto de ir e voltar — braços que se abrem, vão para a frente,
apertam e regressam ao lado do corpo. Oito quadros dão um arco limpo e um fecho exacto sem
introduzir membros novos (risco alto neste movimento).

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a HUG loop, read left to
right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: chubby cream and fawn English bulldog (#E3CEAE /
#CE905A), white chest, white muzzle, white blaze on the forehead, big round brown eyes with
a highlight, small floppy ears, rosy blush cheeks, chunky white pearl necklace (#F2EDE4),
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. Always exactly TWO arms and TWO
paws — no extra limbs in any drawing.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT back view. Standing upright on two legs, both feet flat on
the same invisible baseline in every drawing. No other character, no person, no object to
hug — the arms simply reach forward into the empty space and come back.

THE CYCLE — follow exactly:
- drawing 1: arms relaxed at the sides, neutral, happy face.
- drawing 2: arms begin to lift, hands moving forward.
- drawing 3: arms half extended, hands ahead of the chest.
- drawing 4: arms fully forward, hands at maximum reach, open hug.
- drawing 5: hands squeeze slightly inward, a small 2 to 5 pixel squeeze — the actual hug.
- drawing 6: arms begin to release and come back down.
- drawing 7: arms half way down.
- drawing 8: EXACTLY drawing 1 — arms relaxed at the sides, so the loop closes.

Rule to check: the hands travel forward and back but the paws keep the SAME shape and size;
they never detach, stretch or split. The head, torso and legs stay still, the feet never
move. No sideways drift, no size change.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
extra arms, extra paws, third arm, arms detaching, stretching arms, rubber arms, changing paw
shape, another character, a person to hug, object to hug, walking, stepping, foot lift, body
leaning, head turning, different character, orange fur, pink bow, collar without pearls,
different size per drawing, different colours, text, numbers, labels, captions, frame borders,
ground line, drop shadow, white sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Distância das pontas das patas ao centro do peito: igual no quadro 1 e no 8 dentro de
  **3 px**; avanço máximo de **15 a 30 px** no quadro 4. Mais de 30 px indica braços a
  esticar; menos de 15 px o abraço não se lê.
- Quadro 5 difere do quadro 4 em **2 a 5 px** para dentro (o "aperto" existe mas é subtil).
- Número de componentes conectados constante nos 8 quadros (sem membro novo, sem pata solta).
- Centro dos olhos ≤ **3 px**; altura do tronco ≤ **4 px**; base dos pés ± **1 px**.
- Quadro 8 ≈ quadro 1 dentro de **3 px**.

---

## 13. Luna — abraçar

**Quadros pedidos: 8, numa única linha, canvas 16:9.**
Porquê 8: mesmo arco de ir e voltar da Frida. A Luna tem braços curtos, por isso o avanço
máximo em px é menor — o critério é proporcional à escala 0,72 da personagem.

**Prompt (inglês) — pronto a colar:**

```
One single horizontal row of exactly 8 evenly spaced drawings of a HUG loop, read left to
right. NO text, NO numbers, NO labels, NO frame borders, NO drop shadow.

CHARACTER — identical in all 8 drawings: long and LOW chestnut-brown dachshund (#806343)
with darker rust markings (#62341F) on the paws, muzzle and ear tips, very long floppy ears,
tiny tail, big round brown eyes with a highlight, purple bandana (#6B4F9E) tied at the neck,
thick dark-brown ink outlines (#241610), flat warm colours, one single flat shading tone,
same line weight, same size, same face in every drawing. Always exactly TWO short arms and
TWO paws — no extra limbs in any drawing. Long in BODY LENGTH, not in height.

VIEW — front three-quarter view, facing slightly to the right, the approved character sheet
angle. NOT pure side profile, NOT back view. Standing upright on two short legs, both feet
flat on the same invisible baseline in every drawing. No other character, no person, no
object to hug — the short arms simply reach forward into the empty space and come back.

THE CYCLE — follow exactly:
- drawing 1: short arms relaxed at the sides, neutral, happy face.
- drawing 2: arms begin to lift, hands moving forward, long ears swaying slightly.
- drawing 3: arms half extended, hands ahead of the chest.
- drawing 4: arms fully forward, hands at maximum reach, open hug.
- drawing 5: hands squeeze slightly inward, a small 2 to 4 pixel squeeze — the actual hug.
- drawing 6: arms begin to release and come back down, ears lagging.
- drawing 7: arms half way down.
- drawing 8: EXACTLY drawing 1 — short arms relaxed at the sides, so the loop closes.

Rule to check: the hands travel forward and back but the paws keep the SAME shape and size;
they never detach, stretch or split. The head, long torso and legs stay still, the feet never
move, the body does not undulate. No sideways drift, no size change.

STYLE — flat 2D children's book illustration, thick dark-brown outlines, plain cream paper
background (#F4E7D0) with no ground line and no shadow, no white sticker border, no gradient.
```

**Negativo:**

```
extra arms, extra paws, third arm, long human arms, arms detaching, stretching arms, rubber
arms, changing paw shape, another character, a person to hug, object to hug, walking,
stepping, foot lift, body undulating, worm-like bending, body leaning, bulldog body, tall
body, wrong bandana colour, different character, different size per drawing, different
colours, text, numbers, labels, captions, frame borders, ground line, drop shadow, white
sticker border, 3D render, photorealistic, background scenery
```

**Critério de aceitação (medido):**
- Distância das pontas das patas ao centro do peito: igual no quadro 1 e no 8 dentro de
  **3 px**; avanço máximo de **11 a 22 px** no quadro 4 (escala 0,72 da Luna — cerca de
  75 % do avanço da Frida).
- Quadro 5 difere do quadro 4 em **2 a 4 px** para dentro.
- Número de componentes conectados constante nos 8 quadros; pontas das orelhas ≤ **6 px**.
- Centro dos olhos ≤ **3 px**; comprimento do corpo constante dentro de **3 px**;
  base dos pés ± **1 px**.
- Quadro 8 ≈ quadro 1 dentro de **3 px**.

---

## Verificação final antes de animar

Depois de gerada cada tira, correr o porteiro da receita aprovada antes de registar:

```powershell
py animar_tira.py "chars\folhas\_flowN\flow-XX.webp" <nome> --fps 7.5
```

Para os ciclos de pernas (corrida da Frida, marcha da Luna) a rejeição automática é a mesma
da marcha: **"coxo: a perna de trás nunca passa à frente"**. Para os restantes, aplicar os
critérios medidos acima — em especial o fecho do ciclo (último quadro ≈ primeiro), que é o
que o olho humano não apanha e o vídeo expõe imediatamente.
