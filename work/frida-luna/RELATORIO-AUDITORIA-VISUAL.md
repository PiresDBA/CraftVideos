# Relatório — Auditoria Visual dos 5 ciclos (Frida & Luna)

**Data:** 18/11/2026 · **Autor:** agente Auditoria Visual · **Gatilho:** `CONTRATO-ANIMACAO.md` lido e `verificar_contrato.py` corrido antes de qualquer trabalho.

## Âmbito

Apenas os 5 ciclos possuídos e as suas cópias `_novos`:

| ciclo | pastas | quadros | caixa |
| --- | --- | --- | --- |
| frida/escuta | `movimentos/frida/escuta`, `_novos/frida-escuta` | 6 | 173×231 |
| frida/fala | `movimentos/frida/fala`, `_novos/frida-fala` | 9 | 173×231 |
| luna/escuta | `movimentos/luna/escuta`, `_novos/luna-escuta` | 8 | 167×265 |
| luna/fala | `movimentos/luna/fala`, `_novos/luna-fala` | 12 | 167×265 |
| luna/olhar | `movimentos/luna/olhar`, `_novos/luna-olhar` | 8 | 167×265 |

Folhas de contacto: `card/auditoria-frida-escuta.png`, `auditoria-frida-fala.png`, `auditoria-luna-escuta.png`, `auditoria-luna-fala.png`, `auditoria-luna-olhar.png` (linha de cima = `movimentos`, linha de baixo = `_novos`; xadrez = transparência, vermelho = buraco alfa, amarelo = opaco na borda). Dados brutos: `_av/audit_results.json`.

## Método de medição

- **buraco alfa** = região transparente (alpha ≤ 128) **não ligada à borda** da imagem (`ndimage.label` + exclusão dos rótulos de borda). Contagem exacta de pixéis.
- **fuga de fundo** = pixéis opacos (alpha > 128) nos 3 px de borda. **Atenção:** após `fixar_proporcoes.py` a caixa alfa é redimensionada para preencher exactamente o canvas, por isso a figura toca sempre as bordas — estes valores **não** são fuga de fundo real; a inspeção visual confirma-o. São reportados para transparência.
- **figuras duplas** = nº de componentes opacos com área ≥ 200 px.
- **sombra oval** = inspecção visual ampliada da faixa inferior + contagem de pixéis cinza/creme (saturação < 30, valor > 150).

## Achados por ciclo (ANTES → DEPOIS)

### 1. frida/escuta — DANIFICADO, corrigido

**Antes:** `f04.png` continha **três Fridas estreitas e esmagadas lado a lado** (uma única componente ligada, largura 495 px no JPEG de origem). Causa raiz: no JPEG `Sprite_sheet_for_escuta_cycle_60601875.jpg` as figuras 5, 6 e 7 estão encostadas; `cortar_mascara.py` fundiu as três num só componente (6 componentes em vez de 8) e `fixar_proporcoes.py` esticou esse componente para 173×231. Os outros 5 quadros estavam correctos.

| métrica | f04 antes | f04 depois |
| --- | --- | --- |
| figuras no quadro | **3 (fundidas)** | **1** |
| buracos alfa | 0 | 0 |
| fuga borda (opaco) | 237 | 208 |
| concavidade | 10 181 px | ~4–6 000 px |
| continuidade do quadro | 0,40 | 0,33 |

**Correcção:** reextraída a figura 6 do JPEG original (x≈863–1026) com `mascara_figuras` + `alfa_suave` do próprio `cortar_mascara.py` (corte por **componente**, sem `remover_sombra.py`), depois caixa fixa 173×231. Escolha da figura 6 (e não da 5) porque o centro da cabeça é 83,04 px — dentro da tolerância do teste de escuta; a figura 5 dava 77,7 px e fazia o validador reprovar ("cabeça desloca 8,4 px > 6"). Copiada para `movimentos/frida/escuta/f04.png` e `_novos/frida-escuta/f04.png`. Backups em `_av/f04_danificado_antes.png` e `_av/f04_head.png`.

**Depois:** 6/6 quadros com uma única Frida, 0 buracos, caixa 173×231, continuidade 0,315, `validar_ciclo.py` → **ACEITE**.

### 2. frida/fala — limpo

9/9 quadros com uma única Frida, 0 buracos alfa, 0 figuras duplas, caixa 173×231 (um quadro com 172×231 por arredondamento de anti-alias, dentro da tolerância do validador). Fuga de borda 164–230 px (esperado, ver método). Sem sombra oval visível. Continuidade 0,181. **ACEITE.** Nada alterado.

### 3. luna/escuta — sombra oval residual (não removida)

8/8 quadros com uma única Luna, caixa 167×265. **Sombra oval creme visível sob os pés em todos os 8 quadros** (confirmado por ampliação: RGB≈(230,203,176), oval achatada com contorno). **1 buraco alfa de 68 px** em `f05.png`, em (47–55, 77–85) — pequeno hiato entre orelha e cabeça, presente no JPEG de origem, não causado pelo filtro de sombra. Fuga de borda 179–199 px. Continuidade 0,238. **ACEITE.** Nada alterado.

### 4. luna/fala — sombra oval residual (não removida)

12/12 quadros, caixa 167×265, 0 buracos, 0 figuras duplas. **Sombra oval creme sob os pés/asso sentado em todos os 12 quadros** (mais fraca que em `escuta`: 0–6 pixéis cinza/creme na faixa inferior, mas visível na ampliação). Fuga de borda 71–155 px. Continuidade 0,248. **ACEITE.** Nada alterado.

### 5. luna/olhar — divergência de conteúdo (não alterada)

- **`movimentos/luna/olhar`**: 8 quadros frontais, 0 buracos, caixa 167×265, continuidade 0,237. **Conteúdo quase idêntico a `luna/escuta`** — diferença média por pixel de 2,94–6,20 entre os quadros indexados dos dois ciclos. Manifesto regista fonte `Flow flow-00.webp`. Sombra oval creme presente.
- **`_novos/luna-olhar`**: 8 quadros de Luna **de perfil** (olhando à direita), proveniente de `Dachshund_character_turn-around_._613e408e.jpg`. **1 buraco alfa de 68 px** em `f03.png` (54–60, 144–155). Continuidade **0,408** — acima dos outros ciclos, mas ≤ 0,45. Sombra oval em vários quadros.

As duas pastas **não são byte-idênticas** (ao contrário dos outros 4 pares). Não escolhi qual das duas é canónica: é uma decisão de conteúdo/semântica, fora do mandato desta auditoria. **Nenhuma foi alterada.**

## Síntese das contagens exactas

| ciclo | local | quadros | buracos alfa (total) | quadros com buraco | fuga borda opaca (min–max) | componentes máx. |
| --- | --- | --- | --- | --- | --- | --- |
| frida-escuta | movimentos / _novos | 6 / 6 | **0 / 0** | nenhum | 148–208 | 1 |
| frida-fala | movimentos / _novos | 9 / 9 | **0 / 0** | nenhum | 164–230 | 1 |
| luna-escuta | movimentos / _novos | 8 / 8 | **68 / 68** | `f05.png` (68 px) | 179–199 | 1 |
| luna-fala | movimentos / _novos | 12 / 12 | **0 / 0** | nenhum | 71–155 | 1 |
| luna-olhar | movimentos / _novos | 8 / 8 | **0 / 68** | `f03.png` (_novos, 68 px) | 164–202 / 97–215 | 1 |

A contagem de "buraco" inclui apenas regiões fechadas; as duas ocorrências de 68 px são micro-hiatos do desenho original, **não** o buraco de contorno junto aos pés que o utilizador reportou — esse (`frida/escuta/f04`) era uma reentrância aberta invisível ao detector automático e só foi encontrada por inspecção visual.

## Verificação final

- `validar_ciclo.py --quem <quem>` nas 10 pastas: **10/10 ACEITE**.
- Continuidade: frida/escuta 0,315 · frida/fala 0,181 · luna/escuta 0,238 · luna/fala 0,248 · luna/olhar 0,237 (`_novos` 0,408). **Todas ≤ 0,45.**
- Caixa fixa confirmada por `verificar_contrato.py` nos 5 ciclos: Frida 173×231, Luna 167×265 — **5/5 OK**.
- Os 4 pares `movimentos`/`_novos` voltaram a ser byte-idênticos; o par `luna-olhar` permanece divergente (decisão pendente).

## Limites honestos / pendências fora do meu mandato

1. **Sombra oval creme** permanece em `luna/escuta`, `luna/fala` e `luna/olhar`. Está no JPEG de origem e está **ligada aos pés** — os 8 componentes detectados em `luna-escuta` incluem todos a oval no bbox (ex.: componente 1 = 26 328 px, bbox 166×261). O corte por componente não a separa; removê-la exigiria um filtro de cor/faixa, precisamente o que destruiu o contorno da Frida. **Não removi.** Recomendo decisão do utilizador: aceitar como arte do sprite ou tratá-la no compositor.
2. **luna/olhar**: `movimentos` ≈ `escuta`; `_novos` é perfil com continuidade 0,408. Requer escolha humana.
3. `verificar_contrato.py` reporta **1 porta fechada** — 15 movimentos semânticos em falta (`comer`, `corrida`, `giro`, `marcha`, `olhar-frente`, `salto`, `sorrir`, `surpreso`). Pertence a outros agentes; não foi tocado.
4. Não fiz git commit nem push, conforme instruído.
