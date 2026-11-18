# Piscar dos olhos e auditoria do banco de movimentos

Data: 18/11/2026. Escopo: chars/poses-v3/, movimentos/, animacao/faltam.json.
Não gerei imagens, não corri o Flow, não alterei código.

---

## Parte 1 - Piscar (a personagem não pode parecer um robô)

### 1.1 O que as 16 folhas realmente tem

Lidas as 8 expressões de chars/poses-v3/frida/ e as 8 de chars/poses-v3/luna/
(PNGs de 512 px de altura; larguras 377-400 em Frida, 327-352 em Luna), mais
chars/poses-v3/_mapa-emocoes.json (21 nomes de emoção mapeados para 8 folhas).

Duas colunas medidas. **Tinta** = maior corrida vertical contígua de pixéis com
luminância < 95 na coluna de maior densidade escura da janela do olho esquerdo
(algoritmo reproduzível, PNG original 512 px). **Abertura** = altura visível da
fenda entre pálpebras, leitura a 1:1 com aperto de +/-2 px. A coluna "Tinta" inclui
sobrancelha/pálpebra quando o traço se funde com o olho - por isso sad pontua
alto apesar de ter a menor abertura.

| Expressão | Frida tinta / abertura (px) | Luna tinta / abertura (px) | Estado do olho |
| --- | --- | --- | --- |
| happy | 36 / ~45 | 31 / ~45 | Aberto, íris grande, olhar levemente para cima |
| sad | 35 / **~20** | 33 / **~22** | **Quase fechado**: pálpebra superior caída, fenda estreita |
| angry | 31 / ~28 | 29 / ~30 | Semicerrado por sobrancelhas baixas |
| excited | 40 / ~48 | 36 / ~42 | Muito aberto |
| loved | 17 / **0** | 19 / **0** | Olhos-coração - não é olho |
| silly | 19 / ~28 (olho X) | 23 / ~50 | Frida: um X e uma espiral; Luna: abertos |
| scared | 27 / ~34 | 29 / ~40 | Muito abertos, com lágrima |
| surprised | 36 / ~40 (pupila 15) | 24 / ~40 (pupila 20) | Esclera grande, pupila pequena |

**Conclusão dura:** nenhuma das 16 folhas tem olho fechado. sad é o mais próximo
(abertura ~20 px, menos de metade de happy), mas muda também boca e sobrancelhas -
não serve como quadro de piscar isolado. loved são corações e silly da Frida e um
X: ambos seriam lidos como expressão, não como piscar.

### 1.2 Já existe um piscar verdadeiro no banco

movimentos/frida/escuta/f06.png (quadro 7 em numeração 1-based; 164x262) tem o olho
reduzido a um arco horizontal de ~4 px de espessura, contra ~23 px do olho aberto em
f04.png - medição feita na própria PNG. É o único quadro de olho fechado do projecto.
Serve como referência de desenho da pálpebra, mas só para a Frida e só na vista 3/4
da folha de escuta; não cobre a Luna nem as outras expressões.

### 1.3 Esquema concreto a aplicar

- **Período:** 96 frames (3,2 s a 30 fps), igual a DIRECAO-ARTE.md secção B.
- **Duração:** fechar 2 f -> manter 2 f -> abrir 2 f = 6 frames por piscar, com
  exactamente 2 frames de olho fechado.
- **Fase:** Frida começa em f 48 e repete em 144, 240, 336...; Luna começa em f 96 e
  repete em 192, 288, 384... (atráso de +48 f). Nunca as duas no mesmo frame.
- **Inibição:** não disparar nos primeiros 12 f nem nos ultimos 6 f de um beat;
  suspender nos beats de fala (4, 5, 14, 22, 26) e em planos fechados.
- **Como fazer sem barra sobre o olho:** criar, por expressão e por personagem, três
  sprites (aberto, meio, fechado) derivados da folha aprovada e guardados ao lado
  dela. O sprite fechado e feito recortando a ROI do olho, preenchendo com a cor da
  pelagem amostrada 6 px acima e abaixo, e redesenhando a curva da pálpebra superior
  com traço de 5 px #2A1A12 e tremor de +/-1,5 px (regra da STYLE-BIBLE 2.5). A
  transição e cross-fade por alpha entre sprites inteiros em 2 f - não se desenha
  nada por cima do olho em runtime e não se mexe o corpo.
- **Escolha:** prefiro derivar da imagem, não gerar no Flow. Gerar 2 quadros novos
  por expressão daria 32 gerações (8 x 2 personagens x 2) e violaria a regra de
  PERSONAGENS.md de que o corpo e sempre o pixel da folha aprovada; a derivação e
  determinística, auditável e reproduzível frame a frame. Uso escuta/f06.png como
  padrão de comparação do arco da pálpebra.
- **Alternativa honesta (não preferida):** se a derivação falhar o QA visual, pedir
  2 quadros no Flow com --ref-image da folha aprovada, aceitando so se a diferença
  de corpo for < 2 px e o porteiro de MOTOR-FLOW.md passar. Ainda assim fica uma
  aproximação - a pálpebra desenhada a mão e mais controlável.

### 1.4 Limites do piscar

A pálpebra derivada e uma aproximação: o traço pode não casar com o tremor original do
olho em planos fechados (900 px). Validar em contact sheet a 1:1 antes de aprovar. Não
reutilizar o arco da escuta em primeiros planos sem novo desenho.

---

## Parte 2 - Auditoria do banco de movimentos

### 2.1 Medição de todos os ciclos registados

movimentos/manifest.json tem **11 ciclos** (1 de Luna, 10 de Frida). Todos os
ficheiros listados existem e abrem sem erro (PIL verify() + load()), sem PNG
corrompido. "Div 30?" indica se 30/fps da um inteiro - regra de MOTOR-FLOW.md
(aceites: 7,5 e 10).

| Personagem | Ciclo | Frames | OK | fps | Div 30? | Dimensões (px) | Veredito |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Luna | corrida | 6 | 6 | 12,0 | **não** (2,5) | 6 larguras diferentes: 388, 460, 495, 518, 554, 600 x 512 | **Remover/recortar** |
| Frida | marcha-8f | 8 | 8 | 10,0 | sim | 165x213 | **Coxo** (flow-04) |
| Frida | marcha-24f | 24 | 24 | 15,0 | sim (2) | 182x236 | **Coxo** (flow-00) |
| Frida | marcha-24f-fix | 24 | 24 | 15,0 | sim (2) | 182x236 | **Coxo** (flow-00) |
| Frida | marcha-24f-ok | 24 | 24 | 9,0 | **não** (3,33) | 182x236 | **Coxo + fps invalido** |
| Frida | marcha-12f | 12 | 12 | 10,0 | sim | 92x208 | **Coxo** (flow-03) |
| Frida | marcha-12f-v2 | 12 | 12 | 10,0 | sim | 127x208 | **Coxo** (flow-03) |
| Frida | marcha-8f-v2 | 8 | 8 | 10,0 | sim | 203x266 | **Coxo** (flow-09) |
| Frida | marcha-flow10 | 8 | 8 | 10,0 | sim | 209x270 | **Manter - aprovado** |
| Frida | marcha-flow10-lenta | 8 | 8 | 7,5 | sim (4) | 209x270 | **Manter - aprovado** |
| Frida | escuta | 8 | 8 | 7,5 | sim (4) | 164x262 | **Manter - tem o piscar em f06** |

Além destes, existem pastas órfãs não registadas (m12, m12-est, m12-ok, m13,
m20, m21, m22, marcha-12f-est, marcha-12f-ok, marcha-16f com 63 quadros de
29x38). marcha-16f e demasiado pequena para render; não registar.

### 2.3 Os 3 ciclos a gerar a seguir (por beats desbloqueados)

Cruzamento com animacao/faltam.json (44 beats, plano-por-beat.json):

| Prioridade | Ciclo | Beats que desbloqueia | Porque |
| --- | --- | --- | --- |
| 1 | **Luna - escuta** | **33 beats** (1, 2, 9, 10, 12-14, 16-22, 24, 25, 27-36, 38-44) | E de longe o maior bloco em falta; a Frida já tem escuta de 8 f, a Luna não tem nenhum idle |
| 2 | **Luna - marcha** | **3 beats** (4, 7, 8) | O banco so tem corrida da Luna, e os beats 7-8 pedem marcha no portão |
| 3 | **Frida - fala** | **3 beats** (4, 14, 22) | Únicos beats com a Frida a falar; fecha o mapa de boca |

Nota operacional: o ciclo de fala **não precisa de Flow** - DIRECAO-ARTE.md define
10 frames de boca (5 aberto / 5 fechado) derivados da sprite. Se o orçamento for so de
geração no Flow, o 3. lugar passa para **abracar** (Frida + Luna, beats 5 e 37 = 4
beats contando as duas personagens), a frente de corrida/giro (2 beats cada).

### 2.4 Entradas a remover por serem coxas

Regras de MOTOR-FLOW.md secção "Receita aprovada": a perna de trás tem de passar a
frente em >= 2 quadros; fps so 7,5 ou 10; altura mediana e base alinhadas; frames
inteiros, sem crossfade. movimentos/padroes.json ja regista as rejeições medidas:

| Entrada | Evidência medida | Acção |
| --- | --- | --- |
| marcha-8f (flow-04) | 0/8 trocas de perna | Remover |
| marcha-8f-v2 (flow-09) | perna escura nunca chega a frente | Remover |
| marcha-12f, marcha-12f-v2 (flow-03) | amplitude 2,9 / 4,9 px a 208 px de altura | Remover |
| marcha-24f, marcha-24f-fix, marcha-24f-ok (flow-00) | repete meia-passada e não fecha; -ok ainda usa 9 fps | Remover |
| luna/corrida | 12 fps (30/12 = 2,5) e 6 larguras diferentes - base não alinhada | Recortar de uma única tira |

Sobrevivem 3 ciclos: marcha-flow10, marcha-flow10-lenta e escuta da Frida.
É pouco, mas e melhor do que sete ciclos coxos a mancar no vídeo final.

### 2.5 Limites honestos

- As medições de tinta e de abertura são feitas nas PNGs de 512 px; ao renderizar a
  620 px multiplicam por ~1,21, a 900 px por ~1,76. A abertura "visual" tem +/-2 px de
  incerteza - não e uma medição de contorno sub-pixel.
- A auditoria valida existência, dimensoes e legibilidade dos PNGs; **não** voltou a
  medir a troca de pernas quadro a quadro - esse juízo vem de padroes.json, medido
  em 18/11. Antes de remover definitivamente, confirmar com animar_tira.py.
- faltam.json conta beats em que a acção esta assinalada, não duração. Um ciclo de
  8 f cobre 0,8-1,07 s; beats longos precisam de repetição, não de gerações novas.
- A taxa de piscar de 96 f e uma escolha de direcção, não um dado medido na referência.



