# Processo de produção — vídeo animado a partir de uma fonte

Este é o procedimento obrigatório para **qualquer** vídeo: do original à animação final.
Serve para o episódio actual e para os próximos. A regra de ouro: **o personagem é uma
única imagem aprovada; o que muda é o movimento, nunca o desenho.**

## Fase 0 — Entender a fonte (antes de desenhar qualquer coisa)

1. Baixar o vídeo original para `ref/` e medir com `ffprobe`: duração, fps, resolução.
2. Medir cortes e energia de movimento (`yt-ref-anatomy.mjs`): quantos planos, quantos
   cortes/minuto, se é estático. Isto decide se vamos animar ou só sincronizar.
3. Separar o áudio (`demucs`) em voz e música. A narração é a fonte da verdade do tempo.
4. Transcrever e partir a narração em beats (`ref/words.json` → `beats.json`): para cada
   beat, tempo de entrada/saída, falante, texto, cena, expressão e acção.
5. Converter beats a frames (`audio/tempos.json`) — a soma tem de fechar o total de frames.

**Critério de saída:** 44 beats com tempos que somam exactamente 5 882 frames.

## Fase 1 — Travar o personagem (aqui falhámos)

1. Escolher **uma** imagem aprovada por personagem como referência canónica:
   - Frida → `chars/poses-v3/frida/happy.png`
   - Luna → `chars/poses-v3/luna/happy.png`
   - **Nunca** uma folha de 3 vistas: o Flow não a entende e inventa outra personagem.
2. Todas as expressões vêm de `chars/poses-v3/<quem>/` (8 por personagem).
3. Medir a assinatura de cor/proporção de cada expressão aprovada: o intervalo é
   **0,00–0,40**. Qualquer sprite com distância > **0,45** é outro desenho e é rejeitado.
4. O anexo da referência no Flow é **obrigatório**: se falhar, o gerador aborta. Nunca
   gerar "sem anexo" para poupar tempo — é exactamente o que criou 13 ciclos inválidos.

**Critério de saída:** limiar de continuidade calibrado e gravado em
`animacao/calibracao-{frida,luna}.json`.

## Fase 2 — Inventário de movimentos (planeamento)

Correr `plano_animacao.py`: para cada beat, decidir o movimento de cada personagem
(fala / escuta / marcha / corrida / giro / sentar / olhar / abraçar). O resultado é
`animacao/plano-por-beat.json` + `animacao/faltam.json` com o nº de beats que cada
movimento desbloqueia.

Prioridade = nº de beats desbloqueados. Para este episódio:

| prioridade | movimento | beats |
| --- | --- | --- |
| 1 | Luna escuta | 33 |
| 2 | Frida escuta | 31 |
| 3 | Frida fala | 3 |
| 4 | Luna marcha | 3 |
| 5 | Frida/Luna abraçar | 2 cada |
| 6 | Frida/Luna giro | 2 cada |
| 7 | corrida, sentar, olhar | 1–2 cada |

**Critério de saída:** lista fechada de movimentos, cada um com personagem, tipo e nº
de quadros pedidos. Nada é gerado antes desta lista existir.

## Fase 3 — Geração no Flow

Para cada movimento da lista:
1. Prompt com: referência anexada, estilo travado, descrição quadro a quadro,
   **bloco de micro-movimentos obrigatório** (`PROMPTS-MICRO-MOVIMENTOS.md`) e negativo.
2. Pedir **3 folhas candidatas por movimento** (o Flow falha muito; 3 é o mínimo para
   ter uma boa). Se precisarmos de 20–30 imagens para o episódio inteiro, geramos 20–30.
3. Descarregar sempre por `flow_dl_all.mjs` (bytes via CDP) — o download interno do
   `flow_fetch_proj.py` falha neste ambiente.
4. Anotar proveniência: que prompt, que folha, que data.

**Critério de saída:** pelo menos 3 folhas candidatas por movimento em
`chars/folhas/_auto/`.

## Fase 4 — Corte, validação e banco

Para cada folha candidata, nesta ordem:
1. **Continuidade primeiro** — distância à pose aprovada ≤ 0,45. Se falhar, nem se vê
   o movimento: é outro personagem.
2. Corte por máscara de cor + ligação à borda (`cortar_mascara.py`), com a linha de chão
   removida só se for fina e isolada.
3. Movimento (`validar_ciclo.py`): marcha tem de trocar pernas; escuta não pode andar;
   fala tem de fechar a boca no início/fim; ciclo tem de fechar.
4. Micro-movimentos: pelo menos 2 regiões vivas e quadros não idênticos.
5. Só então registar em `movimentos/manifest.json` com nome curto (`escuta`, não
   `luna-escuta`) e renderizar um cartão de 4 s para aprovação visual.

**Critério de saída:** banco com 0 ciclos que falhem continuidade. Auditoria final com
`auditoria_consistencia.py`.

## Fase 5 — Animação

1. `DIRECAO-ARTE.md`: linha do chão, alturas (Frida 1,00 / Luna 0,72), x ini→fim,
   sombra, câmara e ordem de desenho por cena.
2. `gerar_timeline.mjs`: cruza cenas + beats + tempos + banco → `timeline.json`.
3. Remotion compõe fundos, sprites, micro-movimentos procedurais (respiração 7 px,
   inclinação 2,5°, balanço 1,2 px), legenda, áudio. Sem crossfade entre desenhos.
4. Renderizar amostra curta **antes** do episódio completo.

**Critério de saída:** amostra de 20 s revista; proporção dentro de ±3 %; pés na linha
do chão; nenhuma personagem duplicada.

## Fase 6 — QA final

1. `comparar.py`: duração, áudio, energia de movimento face à origem.
2. `auditoria_consistencia.py`: nenhum sprite acima de 0,45.
3. Checklist de 11 pontos de `DIRECAO-ARTE.md`.
4. Só depois render final (`npm run render`).

## Fase 7 — Persistência

Commit + push em `feat/frida-luna-animacao`, graphify actualizado. Todos os scripts,
prompts e limiares ficam versionados para o próximo vídeo começar na Fase 0 com o banco
já pronto.

---

## Estado deste episódio (onde estamos)

- ✅ Fases 0, 1, 2 concluídas.
- ✅ Limiar 0,45 calibrado e aplicado ao validador.
- ⏳ Fase 3 recomeça: os 13 ciclos antigos foram para quarentena (desenho errado).
- ⏳ Fase 4/5/6 por fazer com o banco novo.
