# CONTRATO — Animação Frida & Luna (O Parque dos Petes)

Este contrato é a **fonte da verdade** para qualquer trabalho criativo neste projecto.
Foi consolidado do grafo (`CONTRATO_FABRICA.md`, `AGENTES.md` regras de ouro,
`espec-planos.md` 9 regras de continuidade, `STYLE-BIBLE.md`) mais as decisões do utilizador
em 18/11/2026. **Se uma regra antiga contradizer este contrato, este ganha.**

> Gatilho obrigatório: antes de gerar, animar, renderizar ou alterar personagens,
> ler este ficheiro e correr `py work\frida-luna\verificar_contrato.py`.
> O script imprime as portas fechadas. Nunca avançar com uma porta fechada.

## 1. Personagens — identidade única

| personagem | descrição | referência canónica |
| --- | --- | --- |
| Frida | buldogue inglesa, creme com manchas castanhas, colar de pérolas | `chars/poses-v3/frida/happy.png` |
| Luna | salsicha castanha, bandana roxa | `chars/poses-v3/luna/happy.png` |

- As **8 expressões aprovadas** por personagem são a única fonte do desenho final.
- A IA **nunca redesenha** a personagem final; só propõe movimentos com a referência anexada.
- **Uma única Frida e uma única Luna** no projecto. Qualquer folha com outra cor, outro
  focinho, outra proporção ou outra personagem é rejeitada.
- Proporção no ecrã: **Frida 520 px · Luna 450 px** (razão ~1,16 — "um pouquinho maior").
  Tamanho **fixo em todos os 44 beats**; a câmara e a posição mudam, a escala nunca.

## 2. Continuidade — regras duras

1. **Cor e estilo** idênticos ao longo de todo o episódio.
2. **Tamanho idêntico** — medido pelo validador (altura e largura da caixa do sprite).
3. **Uma personagem por quadro** — quadros com 2 ou 3 cópias encostadas são corrigidos
   por `corrigir_multiplos.py` antes de entrar no banco.
4. **Caixa fixa**: Frida 173×231, Luna 167×265 em todos os ciclos e expressões
   (`fixar_proporcoes.py`). Isto impede o `object-fit: contain` de mudar o tamanho visível.
5. **Eixo**: Frida à esquerda, Luna à direita; nunca trocar de lado.
6. **Pés na linha do chão** da cena, com sombra de contacto desenhada pela animação.
7. **Olhar** dirigido a um objecto que existe no fundo da cena.
8. **Câmara**: um plano = um movimento; push-in/tilt/pan dentro dos limites da bíblia.
9. **Legenda** na faixa inferior; nunca tapa os pés.

## 3. Regras do sprite (folha de movimento)

- Fundo **transparente de verdade (RGBA)** — é a primeira linha de todo o prompt.
- **Sem sombra desenhada**: nem oval cinzenta nem oval creme. A sombra é do compositor.
  Remover por **componente** no corte; nunca apagar pixeis por faixa (estraga o contorno).
- **Espaçamento mínimo de 1/4 da largura** entre figuras na folha — nunca encostadas.
- 8 quadros numa única linha, mesma altura, pés na mesma baseline, quadro 8 = quadro 1.
- Sem texto, números, moldura, linha de chão ou gradiente.
- **Micro-movimentos obrigatórios**: sobrancelha, olho (piscar com pálpebra curva),
  bochecha, focinho, orelha, patas/mãos, barriguinha, colar/bandana, rabinho.
  Pelo menos 3 regiões têm de mudar; quadros consecutivos nunca idênticos.
- **Emoção comanda o micro**: feliz = bochechas sobem/rabo rápido; triste = sobrancelhas
  juntas/orelhas caídas; surpreso = sobrancelhas sobem/olhos abrem; medo = orelhas baixas.

## 4. Google Flow — como usar

- É um **gerador de imagens**, não de vídeo. Pode gerar **até 20 imagens por prompt** —
  usar lotes para ganhar tempo (`py jarvis.py lote frida 20`).
- **Uma referência aprovada por lote** (nunca folha de 3 vistas). Anexo obrigatório:
  se falhar, repetir depois de recarregar; **nunca gerar sem referência**.
- Prompt detalhado, em inglês, com as regras da secção 3 injectadas automaticamente
  (`PROMPTS-MICRO-MOVIMENTOS.md`).
- Download sempre por `flow_dl_all.mjs` (bytes via CDP); `--hires` tenta srcset/2K.
  Os ficheiros baixados pelo utilizador em `imagens-download/` têm nomes descritivos —
  aproveitá-los para mapear movimento → imagem.
- Nenhuma imagem entra no banco sem passar as portas da secção 6.

## 5. Narração → movimento (camada semântica)

- A narração é a fonte da verdade do tempo e da acção (`beats.json`, 44 beats, 5 882 frames).
- `semantica_narracao.py` converte cada fala em: **acção, emoção, gesto e movimento
  nomeado** por personagem. Quando o falante é o narrador, as duas personagens executam
  a acção descrita.
- Cada movimento tem de ter **nome descritivo** (`acenar`, `salto`, `corrida`, `olhar-frente`,
  `abracar`, `sorrir`, `comer`, `giro`) — nunca "movimento genérico".
- A sincronia final é: narração → cena → fundo → movimento → micro-movimento → música.
- Resultado em `animacao/movimentos-por-fala.json`. Faltas em
  `animacao/movimentos-semanticos-faltam.json` → fila de geração no Flow.

## 6. Portas de validação (todas obrigatórias, nesta ordem)

| porta | ferramenta | critério |
| --- | --- | --- |
| plano | `plano_animacao.py` + `semantica_narracao.py` | 44 beats com acção semântica |
| continuidade | `validar_ciclo.py --quem` | distância ≤ **0,45** à pose aprovada |
| corte | `cortar_mascara.py` | ≥6 figuras, uma por quadro, sem sombra |
| movimento | `validar_ciclo.py` | marcha troca pernas; escuta não anda; fala fecha ciclo |
| micro | `validar_ciclo.py` | ≥3 regiões vivas, quadros não idênticos |
| caixa | `fixar_proporcoes.py` | 173×231 / 167×265 em todos |
| banco | `registar_novos.py` | nome curto, proveniência, 0 reprovados |
| timeline | `gerar_timeline.mjs` | 5 882 frames, soma conferida |
| amostra | Remotion 20 s | revisão humana obrigatória |
| render final | `npm run render` | só depois da aprovação escrita em `animacao/aprovacao.json` |

`verificar_contrato.py` imprime o estado destas portas. `jarvis.py episodio` bloqueia
se alguma estiver fechada.

## 7. Mapa de ferramentas

| precisas de | usa |
| --- | --- |
| perceber o vídeo original | `yt-ref-anatomy.mjs`,Demucs,`words.json` |
| partir narração | `beats.json` → `audio/tempos.json` |
| decidir movimentos pela fala | `semantica_narracao.py` |
| prompts | `PROMPTS-MOVIMENTOS.md`, `PROMPTS-MICRO-MOVIMENTOS.md`, `PROMPTS-PISCAR.md` |
| gerar no Flow | `jarvis.py lote` / `gerar_ciclos.py` → `flow_fetch_proj.py --submit-only` |
| descarregar | `flow_dl_all.mjs` |
| cortar / limpar | `cortar_mascara.py`, `corrigir_multiplos.py`, `remover_sombra.py` (só componente) |
| normalizar | `fixar_proporcoes.py`, `transferir_cor.py` |
| validar / auditar | `validar_ciclo.py`, `auditoria_consistencia.py`, `processar_download.py` |
| animar | `remotion/gerar_timeline.mjs`, `Episodio.tsx`, `FundosVivos.tsx` |
| comparar com a origem | `comparar.py` |
| orquestrar tudo | `jarvis.py` (`status`, `ciclo`, `lote`, `produzir`, `verificar`, `episodio`) |

## 8. Zaões honestas

- Sem lip-sync real: flap rítmico por RMS, não distingue vogais.
- Sem olhar dirigido por pupila (pupila fixa na folha); a direcção é encenação.
- Sem interacção física real: abraços são sobreposição de sprites planas.
- Fundos com parallax real só quando houver camadas separadas; senão é pan do PNG.
- CTR é privado e nunca se inventa.

## 9. Histórico de decisões do utilizador (18/11/2026)

1. Micro-movimentos e emoção são **mandatórios** em todas as animações.
2. Fundo transparente, sem sombra desenhada e com espaçamento entre figuras.
3. Continuidade é mais importante que movimento: se a personagem mudar, a tira volta ao Flow.
4. Tamanho fixo; Frida só um pouco maior que a Luna.
5. Gerar em lote no Flow (até 20 imagens por prompt) e usar nomes descritivos.
6. O Jarvis deve pensar e executar; o operador só aprova a amostra.
7. Tudo isto tem de estar no contrato e ser lido por um gatilho antes de qualquer trabalho.
