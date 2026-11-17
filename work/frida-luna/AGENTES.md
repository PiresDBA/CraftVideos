# Agentes — Frida & Luna (recriados do OpenBot)

Cadeia recuperada de `video-orquestracao/AGENTS.md` (mapa vivo) + histórico do canal
`e9dec44f` (seq 1029–1180). O OpenBot travou; os papéis são recriados aqui como
subagentes, com o mesmo escopo e as mesmas regras de ouro.

## Regras de ouro (válidas para todos)

1. Todo ficheiro gerado (.py/.tsx/.ts/.json) leva bloco de manual no topo + comentários.
2. Nomes descritivos; proibido `test.py`, `scene1.tsx`.
3. Remotion + Three.js: **proibido** `useFrame()` do R3F — só `useCurrentFrame()` + `interpolate()`.
4. Usar a suíte Craft local antes de escrever código redundante.
5. VRAM (GTX 1060 6 GB): nunca ComfyUI + LivePortrait + Wav2Lip ao mesmo tempo; fila sequencial.
6. Nada de IA de imagem para o **personagem final** — personagem sai das folhas aprovadas.
7. Comparar sempre contra o canal antes de entregar.
8. CTR é privado e não existe — nunca inventar métrica.

## Elenco

| # | Agente | Papel original | Missão nesta produção |
| --- | --- | --- | --- |
| 1 | **Curador-Prompts** | pesquisa em `tools/opus5-reference` + templates OpenMontage/FilmCraft; entrega especificações de câmara, luz, shader, ritmo | traduzir as 44 frases em 44 especificações de plano (enquadramento, luz, movimento, ritmo) |
| 2 | **Diretor-Arte** | arquiteta o roteiro em `<Sequence>` Remotion, define FPS/frames/paleta, distribui demandas | bíblia de estilo + `Sequence` de 196,07 s a 30 fps (5 882 frames), 11 cenas |
| 3 | **Especialista-ComfyUI** | workflows API JSON para GTX 1060, texturas/fundos, libera VRAM | fundos das 11 cenas + variações de expressão consistentes (FLUX via NVIDIA NIM) |
| 4 | **Especialista-Áudio e Avatar** | narração (VoiceCraft), SFX/trilha (SoundCraft), avatar (LivePortrait/Wav2Lip) | separar voz/trilha do áudio original, mapa de tempos, planear lip-sync RMS |
| 5 | **Dev-3D-Craft** | cenas Three.js em `src/components/3d/` | camadas de parallax 2.5D das 11 cenas (sem R3F imperativo) |
| 6 | **Dev-Motion-QA** | timeline final, efeitos, render MP4 | gates de QA, contact sheet, comparação lado-a-lado com o original |
| 7 | **Artista-desenho** | criado a seguir; desenho à mão 2D dos personagens (substituiu o SVG reprovado) | fatiar as folhas aprovadas em sprites, recortar fundo, montar pose-sheet utilizável |

## Estado por agente (herdado do canal antigo)

- **Curador-Prompts**: 15 entradas de animação/desenho levantadas no Opus 5.5; nenhuma era cartoon infantil com cães → fonte visual primária continua a ser o canal.
- **Diretor-Arte**: escolheu 2D à mão com textura de lápis (woojinrad-455731); plano B Luna em 3D cel. Áudio aprovado, vídeo reprovado, personagem não aprovado.
- **Especialista-ComfyUI**: LoRA `childrens-picture-book-sd15` testado e **reprovado** para personagem (serve para fundos/texturas). Recomendou não instalar mais nada.
- **Especialista-Áudio e Avatar**: narração v2 163,4 s / 4 902 frames, valsa 3/4 a −22 dB, mix −14 LUFS; avatar Wav2Lip com rosto placeholder.
- **Dev-3D-Craft**: propôs 2.5D — personagens em PNG com alfa + fundo em camadas com parallax.
- **Dev-Motion-QA**: pipeline de montagem e QA ainda não exercitado com desenho 2D aprovado.
- **Artista-desenho**: entregou exemplo SVG/GIF reprovado; ficou com ordem de entregar desenho à mão em 2 vistas. **Substituído pelas folhas de expressão que o utilizador forneceu.**

## Decisões herdadas que continuam válidas

- Clonar **estrutura**, nunca conteúdo.
- Texto no pós, nunca no Blender.
- Áudio: −14 LUFS, pico −1,5 dB.
- Cache por hash da cena; re-render só da cena tocada.
- Um plano → três formatos (16:9, 9:16).
