# O Parque dos Pets — especificação de planos

**Curador-Prompts** · 44 planos para 196,069 s a 30 fps (5 882 frames) · frame de referência 1920×1080

Tempos lidos de `beats.json` (não reescritos). O que este documento acrescenta é o que falta para executar: enquadramento, posição e escala em px, direção do olhar, luz, parâmetros de câmara e ritmo de corte.

Cada plano **cobre também o silêncio** até ao beat seguinte — a coluna `plano (s)` fecha a timeline sem buracos até 196,069 s. A soma dos 44 planos é 196,069 s.

Leitura rápida: a coluna **plano (s)** é o que o Remotion corta; a coluna **fala (s)** é o que o lip-sync usa; `x`/`h` são px no frame de 1920; o resto está nas notas de execução.

## Legenda

A escala é a da maior personagem no plano (nos closes da Luna, é ela que manda); as percentagens são medidas dos 44 planos, não estimadas.

| código | enquadramento | escala real (maior personagem) | n.º de planos | para que serve |
| --- | --- | --- | --- | --- |
| GRÁF | cartão gráfico (sem cenário) | 31–43% | 4 | hook, moral em texto, cartão final |
| GERAL | plano geral / plano de conjunto | 28–39% | 8 | estabelecer espaço, deixar o cenário contar |
| MÉDIO | plano médio (do focinho ao rabo) | 39–70% | 14 | ação legível, personagens inteiras |
| CONJ | plano médio conjunto (as duas, próximas) | 52–57% | 4 | abraço, apresentação, moral |
| MÉDIO↓ | médio em contra-picado leve | 59–65% | 3 | dar poder à Luna: saltos, mergulho, retrato |
| MÉDIO↑ | médio em picado leve | 70% | 1 | alguém a olhar para cima (roda, parque inteiro) |
| MÉDIO-2 | médio de duas personagens em cantos opostos | 80% | 1 | ação lateral, overlays de texto |
| CLOSE | close individual (3/4 ou perfil) | 91–94% | 3 | fala e gag de uma personagem |
| CLOSE-2 | close duplo (dois rostos) | 83% | 2 | emoção a dois, ligação com a câmara |

**Coordenadas:** `x` = centro horizontal do sprite; `h` = altura de pé a topo da cabeça; a linha dos pés (`y`) está no JSON e **pode passar dos 1080 px** nos closes — o sprite é ancorado pelos pés.

**Câmara:** push-in/pull-out = multiplicador de escala; pan/tilt/travelling = px; órbita = graus aparentes (2.5D, ±25° máx.); wobble = px senoidais, **só no fundo/reflexo**.

## Ritmo de montagem por cena

O original tem **0,3 cortes/min** (2 planos em 196 s). Esta versão tem **13,5 planos/min** — 45× mais — mas distribuídos de forma desigual: acelera no hook e na montanha-russa, abranda no túnel e no pôr do sol.

| cena | planos | t0 → t1 (s) | dur (s) | planos/min | intenção |
| --- | --- | --- | --- | --- | --- |
| hook | 3 | 0.00 → 16.84 | 16.84 | 10.7 | vender a pergunta em 3 planos; o último acelera |
| abertura | 3 | 16.84 → 28.50 | 11.66 | 15.4 | assentar; 1 plano de 1 s faz de respiro |
| portao | 4 | 28.50 → 44.22 | 15.72 | 15.3 | 4 planos curtos: descoberta em cadeia |
| montanha | 8 | 44.22 → 77.40 | 33.18 | 14.5 | crescente; o plano mais curto é o grito (1,68 s) |
| roda | 4 | 77.40 → 94.22 | 16.82 | 14.3 | respirar; a câmara sobe, a montagem abranda |
| carrossel | 4 | 94.22 → 111.84 | 17.62 | 13.6 | os planos ficam mais longos à medida que gira |
| bolinhas | 3 | 111.84 → 127.02 | 15.18 | 11.9 | fisgado: queda, splash, pay-off |
| tunel | 3 | 127.02 → 141.64 | 14.62 | 12.3 | travelling contínuo entre planos (cortes invisíveis) |
| espelhos | 3 | 141.64 → 157.02 | 15.38 | 11.7 | o mais lento do vídeo: a gag precisa de tempo |
| moral | 3 | 157.02 → 169.78 | 12.76 | 14.1 | 3 planos longos, quase sem corte |
| final | 6 | 169.78 → 196.07 | 26.29 | 13.7 | 6 planos rápidos de despedida + 5,65 s de cauda |

## Os 44 planos

| # | fala (s) | plano (s) | enq. | Frida x / h | Luna x / h | olhar F · L | luz | câmara | corte |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 3.86–7.94 | 0.00–8.16 | GRÁF | 400 / 340 (31%) | 1520 / 300 (28%) | F ↑20° à direita, para o "?" ao centro · L ↑18° à esquerda, para o "?" | quente-neutra · cartão gráfico | push-in 1.00→1.05 · pivot (960,470) | fade de creme 10f · respiro |
| **2** ★ | 8.16–12.70 | 8.16–13.08 | GRÁF | 430 / 350 (32%) | 1500 / 310 (29%) | F ↑25° à direita, para o topo da montanha de osso · L ↑20° à esquerda, para a roda gigante de petiscos | quente-neutra · cartão gráfico | push-in 1.02→1.08 (herda o anterior) | corte seco · normal |
| 3 | 13.08–15.34 | 13.08–16.84 | GRÁF | 520 / 420 (39%) | 1400 / 380 (35%) | F para a câmara, 0° · L para a câmara, -4° | quente-neutra · cartão gráfico | push-in 1.05→1.12 (acelera) | corte seco · staccato |
| 4 | 16.84–17.86 | 16.84–18.50 | GERAL | 700 / 300 (28%) | 1180 / 260 (24%) | F frente-direita 10°, para a câmara/público · L frente-esquerda 10°, para a câmara | quente · manhã, 08h30 | fixa (micro-settle 1,5 px) | corte seco + 2f de flash · staccato |
| **5** ★ | 18.50–20.78 | 18.50–21.24 | CONJ | 860 / 620 (57%) | 1120 / 520 (48%) | F para a Luna, direita 8° / ligeiro baixo · L para a Frida, esquerda 8° | quente · manhã, 08h30 | fixa + micro push 1.00→1.02 | corte no gesto · respiro |
| 6 | 21.24–27.64 | 21.24–28.50 | GERAL | 700 / 420 (39%) | 1220 / 370 (34%) | F frente 5° para a câmara · L frente -5° para a câmara | quente · manhã, 08h30 | fixa + push 1.00→1.03 (linear) | corte seco · respiro |
| 7 | 28.50–34.42 | 28.50–34.82 | GERAL | 760 / 380 (35%) | 1150 / 330 (31%) | F para a frente-direita 15°, caminhando · L frente-esquerda 10°, focinho no chão | quente · manhã, 09h00 | pan 180 px esq→dir (30 px/s) | corte seco · normal |
| 8 | 34.82–37.54 | 34.82–37.80 | GERAL↑ | 720 / 400 (37%) | 1140 / 350 (32%) | F ↑40° à direita, para o letreiro · L ↑45° à direita, para o letreiro | quente · manhã, 09h00 | tilt up 0→60 px + push 1.00→1.03 | corte seco · normal |
| 9 | 37.80–40.50 | 37.80–40.96 | MÉDIO↓ | 640 / 640 (59%) | 1200 / 560 (52%) | F ↓15° à direita, para a Luna · L para a câmara -6°, no ar | quente · manhã, 09h00 | fixa, 20 cm do chão | corte seco · staccato |
| **10** ★ | 40.96–42.82 | 40.96–44.22 | CLOSE-2 | 780 / 900 (83%) | 1150 / 820 (76%) | F para a Luna → para a câmara nos últimos 12f · L para a Frida → para a câmara nos últimos 12f | quente · manhã, 09h00 | push-in 1.00→1.06 · pivot (960,560) | corte seco · respiro |
| 11 | 44.22–49.64 | 44.22–50.20 | GERAL↓ | 620 / 400 (37%) | 980 / 350 (32%) | F ↑38° à direita, para o topo da montanha · L ↑32° à direita | quente · meio-dia, 12h00 | push-in 1.00→1.06 + tilt up 0→70 px | corte seco + 3f de whip vertical · normal |
| 12 | 50.20–52.74 | 50.20–53.18 | MÉDIO | 700 / 480 (44%) | 1080 / 420 (39%) | F direita 25° + acima 15°, para o carrinho · L direita 30° + acima 10°, para o carrinho | quente · meio-dia, 12h00 | fixa | corte seco · normal |
| 13 | 53.18–56.20 | 53.18–56.20 | MÉDIO | 760 / 720 (67%) | 1420 / 420 (39%) | F ←20° para a Luna e depois à direita a chamar · L ←15° para a Frida | quente · meio-dia, 12h00 | push-in 1.00→1.04 · pivot (760,620) | corte seco · normal |
| 14 | 56.20–59.44 | 56.20–60.42 | CLOSE | 820 / 1000 (93%) | 1480 / 560 (52%) | F quase câmara, -8° · L ←18° para a Frida | quente · meio-dia, 12h00 | push-in 1.02→1.06 · pivot (820,520) | corte seco no INÍCIO da fala · normal |
| 15 | 60.42–63.64 | 60.42–63.90 | GERAL↓ | 700 / 380 (35%) | 1010 / 330 (31%) | F →25°, a correr em 3/4 · L →30°, a correr | quente · meio-dia, 12h00 | push-in 1.00→1.05 + tilt up 0→40 px | corte seco · normal |
| **16** ★ | 63.90–68.04 | 63.90–68.62 | MÉDIO | 760 / 760 (70%) | 1150 / 660 (61%) | F para a câmara, +5° · L para a câmara | quente · meio-dia, 12h00 | push-in 1.00→1.10 (ease-in, 8f) | corte seco + 4f de whip · staccato |
| 17 | 68.62–73.96 | 68.62–74.26 | MÉDIO | 1250 / 520 (48%) | 780 / 640 (59%) | F ←20° para a Luna · L para a câmara -4°, a latir | quente · meio-dia, 12h00 | push-in 1.02→1.08 + tilt up 0→50 px | corte seco · normal |
| 18 | 74.26–75.94 | 74.26–77.40 | MÉDIO-2 | 520 / 860 (80%) | 1400 / 780 (72%) | F ↑15° à direita · L ↑15° à esquerda | quente · meio-dia, 12h00 | push-in 1.06→1.10 | corte seco · staccato |
| 19 | 77.40–82.78 | 77.40–82.78 | GERAL↓ | 640 / 390 (36%) | 1090 / 340 (31%) | F ↑40° à direita, para a roda · L ↑45° à direita | quente-dourada · tarde, 16h30 | tilt up 0→90 px (17 px/s) | corte seco · respiro |
| 20 | 82.78–87.20 | 82.78–87.64 | MÉDIO | 800 / 620 (57%) | 1230 / 540 (50%) | F ↑30° à direita, para a cabine · L ↑33° à direita, segue a cabine | quente-dourada · tarde, 16h30 | tilt up 40→90 px (herda o plano 19) | corte seco · normal |
| **21** ★ | 87.64–90.18 | 87.64–90.88 | CLOSE | 780 / 1020 (94%) | 1420 / 600 (56%) | F ↑35° à direita · L ←18° para a Frida | quente-dourada · tarde, 16h30 | tilt up 0→20 px residual | corte seco · staccato |
| 22 | 90.88–93.20 | 90.88–94.22 | MÉDIO↑ | 820 / 760 (70%) | 1180 / 600 (56%) | F ↑40°, para o parque inteiro · L ↑35° | quente-dourada · tarde, 16h30 | tilt up 20→50 px + push 1.00→1.03 | corte seco · normal |
| 23 | 94.22–97.92 | 94.22–98.32 | GERAL | 640 / 380 (35%) | 1060 / 330 (31%) | F →20°, para o carrossel · L →22° | quente dupla · tarde, 17h30 | órbita 0→7° · pivot carrossel | corte seco · normal |
| 24 | 98.32–104.74 | 98.32–105.20 | CONJ | 760 / 600 (56%) | 1180 / 520 (48%) | F →10° · L para a Frida | quente dupla · tarde, 17h30 | órbita 7→14° + push 1.03→1.05 | corte seco · respiro |
| 25 | 105.20–108.32 | 105.20–108.74 | CLOSE | 1480 / 620 (57%) | 900 / 980 (91%) | F ←18° para a Luna · L ↑15° à direita, a morder o ar | quente dupla · tarde, 17h30 | órbita 14→18° + push 1.05→1.07 | corte seco · staccato |
| 26 | 108.74–110.78 | 108.74–111.84 | MÉDIO | 1420 / 560 (52%) | 960 / 760 (70%) | F ←15° para a Luna · L para a câmara, -5°, olhos em espiral | quente dupla · tarde, 17h30 | órbita 18→22° + tilt 8 px + wobble 4 px | corte seco · staccato |
| 27 | 111.84–117.42 | 111.84–117.64 | GERAL | 700 / 370 (34%) | 1100 / 320 (30%) | F ↓20° à direita, para a piscina · L ↓25° à direita | quente rasante · fim de tarde, 18h15 | fixa + zoom 1.00→1.03 | corte seco · respiro |
| 28 | 117.64–121.36 | 117.64–121.76 | MÉDIO | 780 / 420 (39%) | 1240 / 380 (35%) | F ↓10° à esquerda · L para a Frida | quente rasante · fim de tarde, 18h15 | fixa + zoom 1.03→1.05 | corte seco · normal |
| **29** ★ | 121.76–125.66 | 121.76–127.02 | MÉDIO↓ | 860 / 700 (65%) | 1250 / 480 (44%) | F para a câmara, 0° · L para a Frida | quente rasante · fim de tarde, 18h15 | fixa + zoom 1.05→1.06 | corte seco + 6f de hold antes de ela emergir · normal |
| 30 | 127.02–131.68 | 127.02–132.22 | GERAL | 780 / 380 (35%) | 1060 / 330 (31%) | F →30°, para o túnel · L →35° | fria com acentos quentes · hora azul, 19h00 | travelling 0→260 px dir | corte seco · normal |
| 31 | 132.22–137.00 | 132.22–137.00 | MÉDIO | 1380 / 460 (43%) | 960 / 560 (52%) | F ←20° para a Luna · L para a câmara, -8° | fria com acentos quentes · hora azul, 19h00 | travelling 260→520 px dir (contínuo) | corte seco · normal |
| 32 | 137.00–140.70 | 137.00–141.64 | MÉDIO↓ | 1330 / 560 (52%) | 900 / 700 (65%) | F ←20° para a Luna · L para a câmara, -2°, queixo levantado | fria com acentos quentes · hora azul, 19h00 | travelling 520→700 px (ease-out) + push 1.00→1.03 | corte seco · respiro |
| 33 | 141.64–146.02 | 141.64–146.26 | GERAL | 720 / 400 (37%) | 1120 / 350 (32%) | F →15°, para a entrada · L →20° | fria · noite a cair, 19h40 | fixa + wobble 3 px (só fundo/reflexo) | corte seco · respiro |
| **34** ★ | 146.26–151.08 | 146.26–151.62 | MÉDIO | 900 / 640 (59%) | 1300 / 520 (48%) | F para a câmara, 0°, a olhar o reflexo · L Frida → reflexo, alterna 3× | fria · noite a cair, 19h40 | fixa + wobble 4 px no reflexo + push 1.02→1.05 | corte seco · normal |
| 35 | 151.62–156.14 | 151.62–157.02 | MÉDIO | 820 / 700 (65%) | 1360 / 520 (48%) | F → reflexo, 3 latidos · L ←15° para a Frida | fria · noite a cair, 19h40 | fixa + wobble 3 px + push 1.05→1.07 | corte seco · staccato |
| 36 | 157.02–158.78 | 157.02–159.28 | GERAL | 760 / 360 (33%) | 1120 / 310 (29%) | F →5°, de 3/4 de costas, para o parque · L →5° | quente-âmbar · pôr do sol, 20h10 | push-in 1.00→1.03 (lento) | corte seco · respiro |
| **37** ★ | 159.28–165.56 | 159.28–166.00 | CONJ | 840 / 620 (57%) | 1120 / 540 (50%) | F para a Luna, ↓6° · L para a Frida, ↑6° | quente-âmbar · pôr do sol, 20h10 | push-in 1.03→1.09 (6,28 s) | corte seco · respiro |
| 38 | 166.00–168.72 | 166.00–169.78 | MÉDIO | 780 / 520 (48%) | 1140 / 460 (43%) | F para a câmara, 0° · L para a câmara, -3° | quente-âmbar · pôr do sol, 20h10 | push-in 1.09→1.11 (herda) | corte seco · normal |
| 39 | 169.78–172.58 | 169.78–173.08 | GRÁF | 700 / 460 (43%) | 1220 / 400 (37%) | F para a câmara, 0° · L para a câmara, 0° | quente de estúdio · noite, 21h00 | fixa | corte seco · normal |
| 40 | 173.08–174.88 | 173.08–176.04 | CONJ | 760 / 560 (52%) | 1160 / 480 (44%) | F para a câmara, 0° · L para a câmara, 0° | quente de estúdio · noite, 21h00 | fixa | corte seco · staccato |
| 41 | 176.04–179.40 | 176.04–180.12 | MÉDIO | 800 / 620 (57%) | 1140 / 520 (48%) | F para a câmara, 0° · L para a câmara, -5° | quente de estúdio · noite, 21h00 | fixa | corte seco · normal |
| 42 | 180.12–184.44 | 180.12–184.86 | MÉDIO | 720 / 540 (50%) | 1220 / 460 (43%) | F ↓25° à direita para a UI → câmara · L ↓25° à esquerda para a UI → câmara | quente de estúdio · noite, 21h00 | fixa | corte seco · normal |
| **43** ★ | 184.86–187.82 | 184.86–188.40 | CLOSE-2 | 760 / 900 (83%) | 1120 / 820 (76%) | F para a câmara, 0° · L para a câmara, 0° | quente de estúdio · noite, 21h00 | fixa (close frontal, sem truque) | corte seco · respiro |
| 44 | 188.40–190.42 | 188.40–196.07 | MÉDIO | 720 / 560 (52%) | 1160 / 480 (44%) | F →20°, para a seta · L →20°, para a seta | quente de estúdio · noite, 21h00 | fixa | corte seco · normal |

★ = plano hero. A coluna **plano (s)** mostra a cobertura real do plano, que inclui o silêncio até ao beat seguinte.

## Notas de execução

O que não cabe na tabela: tipo exato de corte à entrada e a armadilha de cada plano.

**hook**

- **1** · 3.86–7.94 s — fade de creme 10f (o plano já existe desde 0,00 s). Pré-roll de 3,86 s sem fala: usar para assentar o "?" e as partículas
  - F: entra em cena já em pose; orelhas a tremer 1× · L: rabo a abanar 3 Hz
- **2** · 8.16–12.70 s — corte seco (fim da pergunta). A montanha de osso desenha-se da esquerda para a direita em 1,4 s; a roda entra aos 2,8 s
  - F: inclina-se para a frente 6° · L: duas patas no ar a "apontar"
- **3** · 13.08–15.34 s — corte seco (na interjeição "Pois"). Plano curto de arranque; letras saltam com squash 0,8→1,15→1,0
  - F: cabeça rodada 12°, orelha caída · L: salta 2× curto, 10f cada

**abertura**

- **4** · 16.84–17.86 s — corte seco + 2f de flash (cartão creme → céu azul). 1,02 s: funciona como respiro de 1 segundo entre o cartão e a apresentação
  - F: entra em quadro pela esquerda a correr, para no frame 8 · L: entra 3f depois da Frida (atraso cómico)
- **5** · 18.50–20.78 s — corte no gesto (as duas já abraçadas no frame 0). Não animar o abraço do zero: entrar no abraço feito, só respirar 2×
  - F: braço por cima do ombro da Luna · L: focinho apoiado no ombro da Frida
  - ⚠ câmara: o beat pede "fixa"; fica fixa com 2% de push — dois planos fixos seguidos parecem um slide
- **6** · 21.24–27.64 s — corte seco. 6,4 s de narração: precisa de 2 marcas de ação (aceno 1,2 s, salto 4,0 s) para não parecer slide
  - F: peito para fora, acena aos 1,2 s · L: rabo 3 Hz; salto pequeno aos 4,0 s
  - ⚠ câmara: o beat pede "fixa"; 3% de push ao longo de 6,4 s mantém o plano vivo sem ser movimento percetível

**portao**

- **7** · 28.50–34.42 s — corte seco. Pan lento a 30 px/s; o portão só cabe inteiro no fim do movimento
  - F: ciclo de passo de 24f · L: passos mais rápidos (18f), fareja 3×
- **8** · 34.82–37.54 s — corte seco. Segurar 12f depois da palavra "Petes" para a criança ler o letreiro
  - F: boca aberta 2f depois do letreiro entrar · L: orelhas sobem 6 px, rabo para
  - ⚠ câmara: o beat pede pan esq→dir; o letreiro está ACIMA da linha do olhar, por isso o pan vira tilt (a entrada pela esquerda mantém-se no objeto, não na câmara)
- **9** · 37.80–40.50 s — corte seco. O ritmo vem dos 3 saltos, não da câmara: não mexer na câmara
  - F: ri, mão na barriga · L: 3 saltos de 14f, 90 px de altura
  - ⚠ câmara: o beat pede pan; a câmara fica fixa porque o movimento é o salto da Luna — um pan a acompanhar o salto duplica a energia e cansa
- **10** · 40.96–42.82 s — corte seco. 1,86 s: é o silêncio antes da montanha-russa; 12–18 partículas-brilho por segundo
  - F: olhos húmidos 2f de brilho · L: cabeça encosta no ombro
  - ⚠ câmara: o beat pede pan esq→dir; num close a dois rostos o pan corta um deles, por isso o plano é push-in

**montanha**

- **11** · 44.22–49.64 s — corte seco + 3f de whip vertical (simula o tilt a arrancar). Plano de chegada: o tilt é o argumento, não a personagem
  - F: pescoço esticado, orelhas para trás · L: patas da frente a bater no chão
- **12** · 50.20–52.74 s — corte seco. Câmara fixa de propósito: o movimento é todo do objeto
  - F: orelhas levantam 4 px · L: inclina a cabeça para seguir
  - ⚠ câmara: o beat pede push-in + tilt up; a câmara fica fixa para o carrinho entrar em velocidade — se a câmara se mover, perde-se a referência de rapidez
- **13** · 53.18–56.20 s — corte seco. Plano de foco na Frida: a Luna desfocada é intencional, não bug
  - F: ajeita as duas orelhas 2×, 8f cada · L: desfoque 2 px: está atrás do plano de foco
- **14** · 56.20–59.44 s — corte seco no INÍCIO da fala (nunca no fim). Cortar no início do diálogo dá 3,24 s limpos de lip-sync — é o plano de fala mais longo do vídeo
  - F: sobrancelha sobe 3 px; fala em 3/4 · L: meio corpo, fora de foco (4 px)
- **15** · 60.42–63.64 s — corte seco. O carrinho está no fundo à direita: é o destino visível da corrida
  - F: corre atrás da Luna, 40 px atrás · L: à frente da Frida (ela "ganha" a corrida)
- **16** · 63.90–68.04 s — corte seco + 4f de whip. Sem corte interno: a aceleração é feita no mov e no blur, não na montagem
  - F: orelhas para trás, boca aberta, segura a barra · L: orelhas a voar na horizontal
- **17** · 68.62–73.96 s — corte seco. 3 "batidas" de orelha a 1,6 s marcam o ritmo interno do plano
  - F: ri com a boca aberta · L: orelhas com 2 oscilações de 0,5 s
- **18** · 74.26–75.94 s — corte seco. Plano mais curto da cena (1,68 s): é o "grito" da montanha-russa
  - F: só cabeça e patas no canto inferior esquerdo · L: canto inferior direito, espelhada

**roda**

- **19** · 77.40–82.78 s — corte seco. A câmara sobe devagar: é a chegada, não a ação
  - F: ainda com o pelo revoltado da descida · L: cabeça inclinada 8°, uma pata no ar
- **20** · 82.78–87.20 s — corte seco. Continuidade de eixo: o tilt continua do plano anterior, a câmara nunca "volta atrás"
  - F: boca em "o" 6f · L: cabeça roda 12° no sentido da cabine
- **21** · 87.64–90.18 s — corte seco. Gag curta: entra, baba, sai. 2,54 s
  - F: 3 oscilações do fio de baba, 0,8 s cada · L: ri, uma pata na boca
- **22** · 90.88–93.20 s — corte seco. A cena inteira é uma subida contínua: 0→50 px de tilt ao longo de 4 planos
  - F: aponta para cima com a pata · L: patas na borda da cabine, inclinada para fora 8°

**carrossel**

- **23** · 94.22–97.92 s — corte seco. O carrossel a girar já dá movimento: a câmara só acompanha 7°
  - F: braço a apontar · L: salta 1× ao ver o carrossel
- **24** · 98.32–104.74 s — corte seco. 6,42 s: 2 marcas de ação obrigatórias (abraço 2,0 s, volta 4,6 s)
  - F: roda em cima da almofada aos 4,6 s · L: abraça a pelúcia de roedor aos 2,0 s
- **25** · 105.20–108.32 s — corte seco. As 3 bocadas dão o ritmo: 1 por cada 1,04 s
  - F: desfoque 4 px · L: 3 bocadas de 12f, 26 px de avanço
- **26** · 108.74–110.78 s — corte seco. 2,04 s: fala curta da Luna, plano curto
  - F: desfoque 3 px · L: cabeça oscila 6°, 2 voltas de espiral

**bolinhas**

- **27** · 111.84–117.42 s — corte seco. Plano de estabelecer: a piscina ocupa o terço inferior inteiro
  - F: boca aberta 8f · L: uma pata a testar a borda
- **28** · 117.64–121.36 s — corte seco. O splash fica para o fim do plano, para o corte seguinte colher o resultado
  - F: corpo em prancha; arco de 260 px em 26f · L: ri; leva as patas à cara
- **29** · 121.76–125.66 s — corte seco + 6f de hold antes de ela emergir. O "hold" de 6f é o suspense dentro do plano; não cortar antes
  - F: só a cabeça e as orelhas de fora do monte de bolinhas · L: 2 saltos, 12f cada

**tunel**

- **30** · 127.02–131.68 s — corte seco. O travelling é horizontal: nunca juntar tilt ou zoom, senão perde-se o "corredor"
  - F: corre em 3/4; orelhas a bater · L: à frente, rabo em hélice
- **31** · 132.22–137.00 s — corte seco. A continuidade do travelling faz o corte parecer invisível — é o objetivo
  - F: recua 20 px, orelhas sobem · L: entra pela esquerda, sai pela direita; 3 manchas de terra aparecem no focinho
- **32** · 137.00–140.70 s — corte seco. Rim duplo (azul por trás, luzinhas quentes por baixo): é o retrato do vídeo
  - F: ri, mão na barriga · L: pose de "topeira charmosa": sentada, focinho sujo

**espelhos**

- **33** · 141.64–146.02 s — corte seco. A cena dos espelhos é a mais escura: dar 2 s antes de qualquer gag
  - F: cauda baixa, passo lento · L: fareja o ar, cabeça inclinada
- **34** · 146.26–151.08 s — corte seco. O reflexo (Frida em 1080,300, h 420, deformado 1,35× na horizontal) é mais quente que a Frida real
  - F: não pisca durante 1,5 s · L: pata na boca a abafar o riso
- **35** · 151.62–156.14 s — corte seco. 3 latidos a 1,4 s: o último cai no fim do plano e corta a seco
  - F: corpo arqueado; cabeça avança 12 px por latido · L: tapa os ouvidos a brincar

**moral**

- **36** · 157.02–158.78 s — corte seco. Contraluz total: rim de 2 px no pelo. Sem rim, as duas desaparecem no laranja
  - F: imóvel, só a respiração · L: imóvel; uma orelha mexe ao vento
- **37** · 159.28–165.56 s — corte seco. Fill frontal de 30% para os olhos não ficarem negros; 6–10 corações a subir por segundo
  - F: braço por cima do ombro; olhos fecham 1× aos 3 s · L: cabeça apoiada no ombro da Frida
- **38** · 166.00–168.72 s — corte seco. Espaço superior reservado (y 180–460) para as 2 linhas de texto
  - F: sem ação: deixa o texto ler-se · L: inclina a cabeça para a Frida

**final**

- **39** · 169.78–172.58 s — corte seco. Volta ao cartão do início (mesma composição, fundo azul): fecha o círculo
  - F: acena com a pata 2× · L: rabo 3 Hz
- **40** · 173.08–174.88 s — corte seco. Os acenos dão o ritmo: 3 batidas em 1,8 s
  - F: 3 acenos de pata, 14f cada · L: 3 acenos com 4f de atraso (não são robôs)
- **41** · 176.04–179.40 s — corte seco. Aproximar 10% em relação ao plano 40: a câmara "entra" sem se mexer, por corte de escala
  - F: inclina a cabeça 8° · L: esconde-se 15% atrás da Frida
- **42** · 180.12–184.44 s — corte seco. 2 marcas: LIKE aos 0,4 s (760,860) e INSCREVER-SE aos 1,1 s (1160,860)
  - F: aponta para o botão · L: salta 2× no 2.º botão
- **43** · 184.86–187.82 s — corte seco. Fundo ligeiramente mais escuro: o halo rosa atrás separa as caras do azul
  - F: pisca 1×; manda o beijo aos 1,2 s · L: pisca no mesmo frame da Frida
- **44** · 188.40–190.42 s — corte seco. Último plano: 2,02 s de fala + 5,65 s de cauda até 196,069 s (o cartão fica, a música fecha)
  - F: aponta com a pata · L: salta 1×

## Planos hero (9)

- **2** · 8.16–12.70 s · *push-in 1.02→1.08 (herda o anterior)* — É a imagem-promessa (serve de miniatura): osso + petisco desenhados dizem o tema do vídeo em 1 segundo, sem uma palavra.
- **5** · 18.50–20.78 s · *fixa + micro push 1.00→1.02* — O primeiro abraço é o contrato emocional do vídeo: é aqui que a criança decide gostar das duas, e é o primeiro dos dois abraços entre elas (o outro é o da moral, plano 37).
- **10** · 40.96–42.82 s · *push-in 1.00→1.06 · pivot (960,560)* — Único close frontal dos dois no primeiro terço: os olhos viram para a lente e a narração passa a ser promessa em vez de descrição.
- **16** · 63.90–68.04 s · *push-in 1.00→1.10 (ease-in, 8f)* — É o único pico de adrenalina real do vídeo: dois pares de olhos abertos e orelhas para trás valem mais que qualquer efeito, e é o frame que segura quem já ia sair.
- **21** · 87.64–90.18 s · *tilt up 0→20 px residual* — Gag físico de um segundo: o fio de baba a brilhar em contraluz é o plano que faz rir — e é o único close da Frida entre a fala dela (56,20 s) e o abraço final.
- **29** · 121.76–125.66 s · *fixa + zoom 1.05→1.06* — Pay-off cómico da piscina: a bolinha na boca faz de coroa e o plano é o mais "brinquedo" do vídeo — é a imagem que a criança imita depois.
- **34** · 146.26–151.08 s · *fixa + wobble 4 px no reflexo + push 1.02→1.05* — A gag central do vídeo: a cabeça de melancia é o único absurdo visual que sobrevive à narração, e vive dos 8 frames de atraso entre a Frida e o reflexo.
- **37** · 159.28–165.56 s · *push-in 1.03→1.09 (6,28 s)* — É o coração do vídeo: abraço + push-in + corações dizem a moral sem uma única palavra de texto.
- **43** · 184.86–187.82 s · *fixa (close frontal, sem truque)* — Ligação direta: dois rostos a olhar para a lente e um beijo — é o plano que transforma espectador em subscritor.

## Regras de continuidade (obrigatórias)

1. **Eixo:** a Frida está sempre mais perto do bordo esquerdo, a Luna do direito. Não há troca de lado em nenhum dos 44 planos — não cruzar o eixo, nem por corte.
2. **Escala:** há 16 saltos na escala da Frida ≥ 1,6× e **todos** coincidem com uma mudança de tamanho de plano (nenhuma exceção). O maior é **2,63×** no corte 14→15. Nunca há salto de escala entre dois planos do mesmo tamanho.
3. **Zona segura:** rostos entre x 160–1760 e y 120–960. A faixa inferior de 96 px é da legenda/UI; a superior de 120 px é do título. Em close, os pés podem sair de quadro, a cabeça nunca.
4. **Luz:** a temperatura muda uma vez por cena e nunca dentro do mesmo plano. O tunel é o único bloco de luz fria — é o respiro cromático.
5. **Câmara:** um plano = um movimento. Push-in e tilt podem coexistir (é o caso da montanha), mas nunca com pan ou órbita no mesmo plano.
6. **Olhar:** todas as direções de olhar apontam para um objeto que existe no fundo daquele plano (a montanha, o carrinho, o letreiro, o reflexo). Se o objeto não estiver no frame, o olhar está errado.
7. **Silêncios:** cada plano estende-se até ao t0 do beat seguinte. O único plano que arranca antes da fala é o 1 (pré-roll de 3,86 s). O último tem 5,65 s de cauda.
8. **Desvios declarados:** em 6 planos a câmara não faz o que o `cam` do beats.json diz (marcados com ⚠ nas notas). Foi uma decisão de plano, não um esquecimento — se o Diretor-Arte quiser repor o original, sabe exatamente onde.
9. **Hero:** os 9 hero não levam sobreposição de texto nem corte interno; são os primeiros a render e os únicos que levam motion blur com 2 amostras por frame.

## Fidelidade ao original (o que se copia e o que não se copia)

O original (`ref/parque-dos-pets.mp4`) tem **2 planos, câmara parada e luz de dia do princípio ao fim** — 0,3 cortes/min. Copiar isso seria copiar o defeito. O que se copia é o elenco, o guarda-roupa, a paleta saturada de parque e a ordem das atrações; o que se muda é a montagem (44 planos), o movimento de câmara e o arco de luz.

**Divergência assumida:** o pôr do sol (planos 36–38) e a noite (39–44) **não existem no original**. Vêm do `beats.json` (`bg: "por do sol, silhuetas do parque"` e `bg: "cartao final, coracoes"`) e servem para fechar o dia e o vídeo. Se o Diretor-Arte preferir fidelidade literal, é trocar uma linha: 36–38 para "tarde dourada 18h30" e 39–44 para "crepúsculo azul", mantendo tudo o resto igual.

Nada aqui foi medido em `i.ytimg` nem em métricas do canal: posições, escalas e luz são decisões de plano, não dados do YouTube.

## Referências usadas (só padrão, nunca fotorealismo)

De `tools/opus5-reference` (703 receitas) tirou-se apenas *como* a câmara e a luz se comportam — o estilo final é cartoon 2D infantil com textura de lápis (folhas aprovadas):

- `thusatharan-433543` (Golden Hour Manor) — viragem dia→noite num só cenário. É o modelo do arco de luz das 11 cenas.
- `ishuagra02-678129` (ambiente 3D que adapta a hora do dia) — separar luz de ambiente da luz de personagem.
- `woojinrad-455731` (colored-pencil storybook) — o registo que o Diretor-Arte já escolheu: traço a lápis, paleta lavada.
- `notdwd-766641` (1920×1080, 30 fps, um `seek(t)`) — confirma que a especificação em px + escala é executável sem estado.
- Nenhuma receita foi usada para personagem (regra 6 de `AGENTES.md`).

## O que este documento não decide

- Paleta hexadecimal final e textura do traço → bíblia de estilo do Diretor-Arte.
- Desenho das personagens → folhas aprovadas em `chars/`.
- Áudio, SFX e tempos de lip-sync → Especialista-Áudio e Avatar (aqui só se declara *quando* corta).
- Números de tempo: todos vêm de `beats.json`; os frames são derivados (×30).

---

Gerado por `build_espec_planos.mjs` (este `.md` e o `espec-planos.json` saem do mesmo script, por isso não divergem). Para regenerar depois de mexer no `beats.json`: `node D:\CRAFT\work\frida-luna\build_espec_planos.mjs`.
