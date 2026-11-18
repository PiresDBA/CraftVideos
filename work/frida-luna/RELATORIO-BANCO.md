# Relatório — Banco de Movimentos Semânticos (Frida & Luna)

Data: 18/11/2026 · Agente: Banco de Movimentos

## 1. Análise das 26 imagens do teste inicial

Folha de contacto: `card/analise-_semanticos.png` (26 miniaturas, fundo xadrez).
Dados medidos: `card/analise-_semanticos.csv` e `card/analise-_semanticos.json`.

**Resultado: 0 das 26 servem para o banco.**

Achados medidos:

| verificação | resultado |
| --- | --- |
| fundo RGBA transparente real | **0/26** — todas são `RGB`, alpha=255 em todos os pixéis |
| fundo branco/creme/xadrez opaco | 26/26 |
| espaçamento ≥ 1/4 da largura | só **5/26** (flow-03, 09, 10, 15, 21) |
| corte por componentes | falha nas 26 (as 5 com espaçamento OK têm fundo xadrez que funde as figuras numa só componente) |

Identificação visual (folha de contacto):

- **Frida** (buldogue creme, manchas castanhas, colar de pérolas): `flow-00` a `flow-15`, `flow-17`, `flow-23` — 18 imagens.
- **Luna** (salsicha castanha, bandana roxa): `flow-16`, `flow-18`–`flow-22`, `flow-24`, `flow-25` — 8 imagens.
- Movimentos aproximados por pose: marcha (01, 06, 11, 16, 17, 19), corrida (07, 20, 24),
  giro/rotação (00, 03, 08, 09, 15, 21, 22), sentar (05, 10, 18), escuta (12),
  sorrir/olhar-frente (02, 04, 13, 14, 23, 25). São identificações visuais, não classificações validadas.

As 26 foram movidas para `movimentos/_quarentena/lote1-teste/` com `relatorio.json` por imagem.

## 2. Validador especialista — `validar_imagem.py`

Criado e ligado a `processar_download.py` e `registar_novos.py`.
Cinco portas, aplicadas sempre e nesta ordem a cada folha candidata:

| porta | critério |
| --- | --- |
| (a) fundo | borda com alpha=0 em ≥85% dos pixéis, >4% transparente, sem papel opaco na borda, sem linha de chão (componente achatada no último décimo) |
| (b) caixa | exactamente **173×231** (Frida) / **167×265** (Luna) em todos os frames |
| (c) sombra | nenhum componente oval achatado (larg/alt>2,2) no terço inferior com área<30% da figura |
| (d) figura | exactamente uma figura grande por frame; o espaçamento ≥1/4 da largura é medido na **folha original** por `validar_espacamento()` antes do corte |
| (e) continuidade | ≤ **0,45** contra `chars/poses-v3/<quem>/happy.png` |

O validador é compatível com a chamada de um só argumento usada por
`verificar_contrato.py` (`validar(caminho_do_f00.png)`), inferindo a personagem do caminho.
Verificação: **5 ciclos existentes, 0 reprovados** — nenhum dos cinco foi alterado.

## 3. Geração, processamento e registo

_(a preencher com os resultados finais)_

## 4. Banco final

_(a preencher)_

## 5. Limitações honestas

_(a preencher)_
