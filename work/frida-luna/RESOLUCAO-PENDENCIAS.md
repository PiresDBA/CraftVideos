# Resolução das pendências da Auditoria Visual

Data: 18/11/2026. Autor: agente coordenador. Base: `RELATORIO-AUDITORIA-VISUAL.md`.

## Pendência 1 — oval creme sob os pés da Luna

**Decisão: MANTER (não remover).**

Evidência medida:

| imagem | pixéis creme opacos na faixa inferior |
| --- | --- |
| referência aprovada `chars/poses-v3/luna/happy.png` | **1616** |
| `movimentos/luna/escuta/f00.png` | 1044 |
| `_novos/luna-escuta/f05.png` | 1145 |

A referência aprovada pela própria utilizadora tem **mais** pixéis creme do que os ciclos. O oval é portanto **arte integrante do desenho canónico**, não uma sombra falsa introduzida pelo Flow.

Teste de remoção (não aplicado): filtro por cor na faixa inferior removeu 1520 px mas criou **1402 novos buracos no contorno** — exactamente o dano que o utilizador reportou e que o `remover_sombra.py` por faixa causou. A oval é uma componente única ligada ao corpo (não separável por componente).

Conclusão: remover a oval quebraria (a) a continuidade com a pose aprovada e (b) o contorno. Mantém-se. A sombra de contacto do compositor (`FundosVivos`/`Episodio.tsx`) é um reforço cénico, não uma substituição da arte.

## Pendência 2 — `luna/olhar`: frente vs perfil

**Decisão: MANTER a versão canónica actual (`movimentos/luna/olhar`, frente, continuidade 0,237).**

Evidência:

- `animacao/movimentos-por-fala.json`: **nenhum beat** atribui `olhar` à Luna. No beat 4 ("Olha, pessoal!") a Luna faz `escuta`; o `olhar-frente` é só da Frida. A escolha não afecta o episódio actual.
- `movimentos/luna/olhar` (frente): 0 buracos, 8/8 quadros, continuidade 0,237 — inequivocamente a Luna aprovada.
- `_novos/luna-olhar` (perfil, `Dachshund_character_turn-around_...jpg`): continuidade 0,408 (perto do limite 0,45) e 1 micro-hiato de 68 px no `f03.png`, presente no desenho original.

A versão de perfil fica conservada em `_novos/luna-olhar` como experimento não usado. Não foi promovida a canónica para não introduzir uma leitura de "personagem diferente" num projecto onde a continuidade é a regra mais dura.

## Estado

Nenhuma destas decisões alterou o banco nem o manifest. O agente do Banco de Movimentos é dono do `movimentos/manifest.json`. Não houve conflito.
