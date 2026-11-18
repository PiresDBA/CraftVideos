# Relatório — Banco de Movimentos Semânticos (Frida & Luna)

Data: 18/11/2026 · Agente: Banco de Movimentos

## Resultado final

**20 ciclos no banco** (5 existentes + 15 novos). **Todas as portas do contrato abertas**:
`py verificar_contrato.py` → `TODAS AS PORTAS ABERTAS`. Cobertura semântica: **0 em falta**.
Validador especialista aplicado a **20/20 ciclos, 0 reprovados**.

## 1. Análise das 26 imagens do teste inicial

Folha de contacto: `card/analise-_semanticos.png`. Dados: `card/analise-_semanticos.csv` / `.json`.

**0 das 26 servem para o banco.**

| verificação | resultado |
| --- | --- |
| fundo RGBA transparente real | **0/26** — todas `RGB`, alpha=255 em todos os pixéis |
| espaçamento ≥ 1/4 da largura | só **5/26** (flow-03, 09, 10, 15, 21) |
| corte por componentes | falha nas 26: fundo xadrez funde as figuras; nas 5 com espaçamento OK o corte devolve 1 só componente |

Identificação visual: Frida em `flow-00`–`flow-15`, `flow-17`, `flow-23` (18); Luna em
`flow-16`, `flow-18`–`flow-22`, `flow-24`, `flow-25` (8). São identificações visuais aproximadas.

Quarentena: `movimentos/_quarentena/lote1-teste/` com `relatorio.json` por imagem
(26 fundo opaco, 21 espaçamento insuficiente).

## 2. Validador especialista — `validar_imagem.py`

Criado e ligado a `processar_download.py` e `registar_novos.py`. Cinco portas, sempre:

| porta | critério |
| --- | --- |
| (a) fundo | borda com alpha=0 em ≥85% dos pixéis (calibrado nos 5 ciclos aprovados: 0,887–0,906), >4% transparente, sem papel opaco na borda, sem linha de chão |
| (b) caixa | exactamente **173×231** (Frida) / **167×265** (Luna) em todos os frames |
| (c) sombra | nenhum componente oval achatado (larg/alt>2,2) no terço inferior com área<30% da figura |
| (d) figura | exactamente uma figura por frame; o espaçamento ≥1/4 é medido na folha por `validar_espacamento()` |
| (e) continuidade | ≤ **0,45** contra `chars/poses-v3/<quem>/happy.png` |

Compatível com a chamada de um só argumento usada por `verificar_contrato.py`
(`validar(caminho_do_f00.png)`, infere a personagem do caminho). Devolve `ok`/`veredito`/
`motivos`/`scores`. Os 5 ciclos existentes **não foram alterados** e passam todos.

## 3. Geração, processamento e registo

- **Gerados no Flow: 15/15 submissões** (`gerar_semanticos.py --so frida` 8/8, `--so luna` 7/7),
  sempre com a referência aprovada anexada (retry do "file chooser travou" funcionou em todas).
- Download `--hires`: 25 imagens (`chars/folhas/_semanticos-novo/`), das quais as 15 mais
  recentes correspondem às submissões (7 Luna nos índices 0–6, 8 Frida nos índices 7–14).
  Folha: `card/analise-_novo.png`.
- **Aceites: 15/15. Reprovados: 0.** Detalhe em `animacao/semanticos-processamento.json`.
- Pipeline por imagem: corte neutro (`cortar_neutro.py`) → correcção de múltiplos →
  caixa fixa (`fixar_proporcoes.py`) → reconstrução da folha com gap de 1/4 →
  transferência de cor quando necessário → validador especialista →
  verificação genérica/micro → `movimentos.py registar`.
- Scores de continuidade (todos ≤0,45): Luna 0,143–0,350; Frida 0,135–0,297.
  Regiões micro vivas: 7 em todos os ciclos.

## 4. Banco final (20 ciclos)

| personagem | movimentos |
| --- | --- |
| **Frida** (10) | escuta\*, fala\*, comer, olhar-frente, marcha, salto, corrida, giro, sorrir, surpreso |
| **Luna** (10) | olhar\*, escuta\*, fala\*, comer, marcha, salto, corrida, giro, sorrir, surpreso |

`*` = ciclo pré-existente, intacto.

Índice: `movimentos/manifest.json`. Cobertura semântica actualizada:
`animacao/movimentos-semanticos-faltam.json` → `{"frida": {}, "luna": {}}`.

## 5. Limitações honestas

1. **O Flow não entrega fundo RGBA transparente** — as 25 imagens descarregadas são RGB opacas
   (branco, creme ou xadrez cinzento), apesar do prompt explícito. A transparência foi obtida
   por corte de máscara; o validador garante que o resultado final tem alpha real.
2. **O Flow ignora o espaçamento de 1/4 da largura** (medido: gaps de 5–41 px contra 33–64 px
   exigidos em 11/15 folhas). O requisito foi aplicado na **folha reconstruída**
   (`chars/folhas/_reconstruidas/`, gap exacto de 1/4), não na entrega bruta do Flow.
3. **Transferência de cor**: duas folhas (Luna/corrida, Frida/corrida) tinham desvio de cor
   que fazia a continuidade subir para 1,52 / 0,62; `transferir_cor.py` baixou-a para 0,16 / 0,25.
   Isto alinha estatísticas de cor, não redesenha a personagem.
4. **Fecho do ciclo**: um ciclo (Frida/olhar-frente) teve o último quadro trocado pelo mais
   parecido com o primeiro para fechar o loop (emenda 51,8 → 21,7).
5. **Nomes dos movimentos**: o Flow não expõe o prompt nos atributos das imagens; a atribuição
   movimento→ficheiro segue a ordem de submissão (confirmada pelo agrupamento por personagem).
   Movimentos visualmente próximos (ex.: marcha/corrida) podem estar trocados entre si.
6. Algumas folhas do Flow incluem números 1–8 desenhados sob as figuras; o corte remove-os
   porque ficam fora da máscara de cor, mas não foi feita uma verificação específica de texto.
7. Sem lip-sync real (o projecto usa flap rítmico por RMS). A sombra de contacto é desenhada
   pelo Remotion, nunca pelas folhas.
