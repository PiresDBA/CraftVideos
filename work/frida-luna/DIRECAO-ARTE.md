# Direcção de arte — *O Parque dos Pets* (Frida & Luna)

Documento de execução. Números em px sobre 1920×1080, 30 fps, 5 882 frames.
Alturas: **Frida = 1,00 · Luna = 0,72** (regra dura, não negociável).
Fonte das expressões: `chars/poses-v3/{frida,luna}/` — 8 folhas: `angry, excited, happy,
loved, sad, scared, silly, surprised`. Fundos: `bg/flow/*.png` (1376×768, escala 1,40625
para 1080 de altura; recortar 7–8 px em cada lado, dentro da borda de papel de 24 px).

## A) Tabela por cena

`x` = centro da personagem. Margem dura: Frida x ∈ [360, 1560] (largura 560), Luna x ∈
[320, 1605] (largura 470) — nenhum pixél a < 80 px da borda. Sombra = elipse `#2A1A12`,
sem blur > 8 px, centrada 6 px abaixo dos pés; `larg×alt @ opacidade`.

| # | Cena | Chão y | Alt. Frida | Alt. Luna | x Frida ini→fim | x Luna ini→fim | À frente | Sombra Frida | Sombra Luna | Câmara (decisão) | Luz / espaço livre |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | hook | 1000 | 620 | 446 | 1400→1500 | 500→620 | Luna | 280×16 @20% | 215×12 @20% | **Confirma** push-in 1,00→1,06 em 505 f | luz alta-esq.; rodapé livre, Zona A para título |
| 2 | abertura | 996 | 620 | 446 | 1520→1450 | 320→530 | Luna | 300×18 @22% | 230×14 @22% | **Confirma** fixa (350 f) | luz alta-esq.; caminho central livre, entradas pelos lados |
| 3 | portao | 1002 | 620 | 446 | 1320→1500 | 380→620 | Luna | 300×18 @22% | 230×14 @22% | **Confirma** pan 0→−140 px, parallax 0,35/0,65 (472 f) | luz alta-esq.; calçada de pedras livre, letreiro acima |
| 4 | montanha | 1008 | 620→380 (beats 16–18) | 446→274 | 1340→1480 | 400→560 | Frida nos beats 14–15; Luna nos restantes | 300×18 @18%, −14 px em x | 230×14 @18%, −14 px em x | **Confirma** push-in 1,00→1,06 + tilt 0→−90 px (995 f) | sol alto-à-direita; sombra para esq.; margem de papel ~26 px, respeitar |
| 5 | roda | 1012 | 620 / beat 22: 380 | 446 / beat 22: 274 | 1450 (fixo) | 530 (fixo) | Frida no beat 22; Luna nos restantes | 310×18 @26% | 235×14 @26% | **Corrige**: tilt limitado a 0→−90 px (não “lento” livre) | luz difusa de tarde; relva inferior livre, céu no topo |
| 6 | carrossel | 1000 | 620 | 446 | 1450 (fixo) | 530 (fixo) | Luna | 300×18 @24% | 230×14 @24% | **Corrige**: órbita não existe — pan 0→−60 px; giro é da sprite, não da câmara | luz de cima; relva livre, plataforma central ocupada |
| 7 | bolinhas | 972 | 760 / beat 29: 620 | 547 / beat 29: 446 | 1450 (fixo) | 530 (fixo) | Luna; Frida no beat 29 | 300×16 @20% | 230×13 @20% | **Corrige**: zoom de quadro 1,00→1,03, sem outro movimento | luz alta-esq.; bordo de madeira é o chão; bolinhas em primeiro plano |
| 8 | tunel | 1006 | 760 | 547 | 1450 (fixo) | 530 (fixo) | Luna | 300×16 @14% | 230×12 @14% | **Confirma** pan 0→−140 px, parallax 0,35/0,65 (438 f) | contraluz do centro do túnel; caminho livre em baixo |
| 9 | espelhos | 998 | 760 | 547 | 1450 (fixo) | 530 (fixo) | Frida no beat 35; Luna nos restantes | 290×15 @20% | 220×12 @20% | **Corrige**: sem wobble de câmara — fixa; tremor ±4 px só no fundo, `frame % 12` | luz de cima (luzinhas); piso xadrez livre, espelhos ao fundo |
| 10 | moral | 1006 | 380 | 274 | 1450 (fixo) | 530 (fixo) | Luna | 300×18 @28%, +8 px em y | 230×14 @28%, +8 px em y | **Confirma** push-in 1,00→1,06 (382 f) | sol ao centro-horizonte; relva livre, silhuetas ao fundo |
| 11 | final | 1000 | 620 | 446 | 1450 (fixo) | 530 (fixo) | Luna | 280×16 @18% | 215×12 @18% | **Confirma** fixa (789 f) | luz de cima; cartão, chão implícito, confete nas bordas |

Regras da tabela: personagens **nunca** se deslocam com a câmara (factor 0,00). O `x`
só muda na marcha/corrida indicada, com salto máximo de 8 px/frame. A ordem de desenho
é sempre `fundo → parallax → objectos → Frida → Luna → tipografia → grão`; “à frente”
indica qual das duas recebe o último `z` dentro da camada de personagens. Onde a cena
pede plano médio (760), a cabeça entra na Zona A e a tipografia desce para a banda.

## B) Regras de representação

### Escuta (idle) — 5 movimentos mensuráveis

| Efeito | Amplitude | Período | Fase |
| --- | --- | --- | --- |
| Respiração | escala Y 1,000→1,012→1,000 (≈7 px a 620 de altura), âncora nos pés | 48 f (0→12→24→36→48) | Frida fase 0, Luna fase +12 |
| Piscar | 2 frames de olhos fechados | 96 f (3,2 s) | Luna com +48 f de atraso; nunca as duas a piscar no mesmo frame |
| Inclinação da cabeça | 0→+2,5°→0→−2,5°→0 (rotação da sprite inteira em torno dos pés; ≈27 px no topo) | 120 f (30 f por troço) | Frida fase 0, Luna fase +60 |
| Balanço de marcha | deslocamento Y de 6 px e X de 4 px, 1 ciclo por 12 f | 12 f | só nos beats com `marcha`/`corrida` |
| Micro-expressão | troca de sprite **só** no frame inicial do beat | — | ver mapeamento abaixo |

Sem estes quatro movimentos a personagem lê-se como morta. Respiração e piscar correm
mesmo em `escuta`; inclinação só em beats ≥ 2,5 s.

### Fala sem lip-sync

- Ciclo de boca: **10 frames** (5 aberta / 5 fechada) = 3,0 Hz; abertura visual de 6 px
  a 620 de altura (0,01×altura), escalada com a altura da cena.
- Mapa RMS (1/30 s): `RMS > 0,12 × máximo do beat` → boca aberta; senão fechada.
  Mínimo 2 frames abertos por sílaba, máximo 6 frames fechados consecutivos enquanto o
  falante estiver activo. Fora do falante designado, boca fechada em ≥ 90 % dos frames.
- O ciclo começa no `t0` do beat e para no `t1`; nunca se reinicia a meio de palavra.
- Falante designado: beats 4, 5, 14, 22 (Frida) e 26 (Luna). Todos os outros beats são
  `narrador` — nenhuma boca se move por fala, só o ciclo de escuta.

### Expressões — mapeamento obrigatório (das 8 folhas existentes)

| Beat pede | Sprite usada |
| --- | --- |
| `happy`, `proud`, `calm` | `happy` |
| `excited`, `jump` | `excited` |
| `silly`, `mischievous` | `silly` |
| `loved`, `lovestruck` | `loved` |
| `shy`, `scared`, `worried` | `scared` |
| `surprised`, `confused`, `curious` | `surprised` |
| `sad`, `sick`, `bored`, `tired` | `sad` |
| `angry`, `grumpy`, `jealous` | `angry` |

Em **escuta**: usar `happy` por omissão; se o beat pedir `curious`/`confused` → `surprised`,
`shy` → `scared`, `proud`/`calm` → `happy`. Em **fala**: manter a expressão do beat já
mapeada (ex.: beat 14 Frida `mischievous` → `silly`; beat 26 Luna `confused` → `surprised`).
Nunca misturar folhas de personagens diferentes; o corpo é sempre o pixel da folha aprovada.

### Quando uma personagem pode estar menor / “fora de foco”

- Planos gerais da tabela (beats 16–18, 22, moral): ambas reduzem para 380/274; é plano,
  não desfoque.
- No único beat de fala da outra (4, 14, 22, 26): a personagem que escuta passa a escala
  **0,94×** da altura da cena e recua 12 px em x — sem blur, sem opacidade < 100 %.
- Em `bolinhas` beat 29: Frida a 620/446 com as `bolinhas-em-voo` por cima (simulação de
  submersão), sombra mantida. Não é desfoque fotográfico.

## C) Checklist de QA — reprova uma cena se…

1. `hLuna / hFrida` sair de **0,72 ± 0,03** em qualquer frame (620→446, 760→547, 380→274).
2. Um pé ficar a > **4 px** da linha do chão da cena; excepção declarada: beat 29 de
   `bolinhas` (submersão simulada), ainda assim com sombra.
3. Algum pixél de personagem entrar na faixa de **80 px** das bordas, ou olhos fora da
   margem de 96 px da bíblia de estilo.
4. Faltar sombra de contacto num frame com os pés pousados, ou largura/opacidade sair
   de **±10 %** do valor da tabela.
5. A sprite visível não corresponder ao mapeamento do beat, ou a troca ocorrer fora do
   frame de fronteira do beat (`jump` → `excited`; `curious` → `surprised`).
6. O fundo esticado: escala não uniforme, crop > 24 px, ou proporção 1376:768 alterada.
   Escala correcta 1,40625× até 1080 de altura.
7. Câmara fora dos limites: push-in > 1,06, pan > 140 px, tilt > 90 px, wobble > 4 px,
   zoom > 3 %, ou personagem a deslocar-se com o fundo.
8. Contorno fora de 9 px `#2A1A12` (detalhe 5 px), presença de `#000000`, ou acento
   (`roxo`+`vermelho`) acima de 8 % da área do quadro.
9. Salto de posição > 8 px/frame ou salto de expressão sem ser no início de beat.
10. Boca a mexer-se em personagem não falante, ou RMS ignorado no falante designado.
11. Soma dos `durationInFrames` ≠ 5 882, ou sequências sobrepostas.

## D) Limites honestos

- **8 expressões, não 12.** `shy`, `proud`, `calm`, `curious`, `mischievous` e `confused`
  não existem em `poses-v3`; são substituídas por `scared`, `happy`, `happy`, `surprised`,
  `silly` e `surprised`. A nuance emocional desses beats perde-se. Só uma nova folha
  aprovada a recupera.
- **Sem lip-sync real.** O ciclo de 10 frames é um *flap* rítmico com NDAs de RMS; não
  distingue vogais, consoantes nem sílabas. Em expressões com boca desenhada fechada, o
  efeito pode ler-se como “boca a saltar”, não como fala articulada.
- **Sem olhar dirigido.** As pupilas são fixas na folha; girar ou inclinar a sprite não
  muda a direcção do olhar. “Frida olha para a montanha” (beat 11) é encenação por
  posição e fundo, não por pupila.
- **Sem interacção física.** Abraços (beats 5, 37) e o “morder o ar” (beat 25) são
  sobreposição de duas sprites planas com deslocamento ≤ 20 px; não há braços a
  envolver, contacto de malhas nem sombra projectada de uma na outra.
- **Sem andar com pernas alternadas** se a folha não tiver ciclo de passo: marcha é
  deslocamento em x + balanço de 6 px, não animação de pernas.
- **Sem desfoque/foco real.** “Fora de foco” é escala 0,94× e recuo de 12 px; blur
  gaussiano e DOF estão proibidos pela bíblia de estilo.
- **Sem reflexo deformado da personagem.** Os espelhos de `espelhos.png` são fundo;
  o `reflexo-deformado-da-frida` é decorativo e não segue a sprite em tempo real.
- **Luz não muda a cor da personagem.** A temperatura da cena aplica-se só ao fundo;
  em `moral` as personagens mantêm creme/castanho mesmo com sol de costas.
