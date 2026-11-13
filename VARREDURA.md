# VARREDURA — OpenMontage

> Relatório breve para o próximo agente. Data: 2026-11-12.

## O que é

**OpenMontage** é um sistema **agêntico de produção de vídeo** (licença AGPLv3), instalado em
`D:\CRAFT\OpenMontage`. Não é um editor: é um conjunto de *pipelines com qualidade
controlada* que um agente conduz — ideia, guião, cenas, assets, edição, composição e
publicação.

| Recurso | Quantidade |
|---------|-----------|
| Ferramentas Python (`tools/`) | **203** |
| Pipelines (`pipeline_defs/`) | **13** |
| Composições Remotion (React) | **13** |
| Estilos (`styles/`) | 6 + custom |
| Venv próprio | `.venv` (Python 3.12.9, torch 2.15, **piper-tts 1.8.0**) |

### Pipelines relevantes para nós
`avatar-spokesperson` · `localization-dub` · `clip-factory` · `talking-head` ·
`animated-explainer` · `documentary-montage` · `podcast-repurpose` · `animation` ·
`character-animation` · `cinematic` · `hybrid` · `screen-demo`

Cada pipeline tem 7 estágios com *gates*:
**idea → script → scene_plan → assets → edit → compose → publish**, com modelo de
execução "executive producer", orçamento por defeito e revisões limitadas.

### Composições Remotion disponíveis
`TalkingHead` · `TitledVideo` · `Explainer` · `CinematicRenderer` · `HeroTitle` ·
e um catálogo de cenas: `text_card`, `hero_title`, `stat_card`, `callout`, `comparison`,
`bar_chart`, `line_chart`, `pie_chart`, `kpi_grid`, `progress_bar`, `anime_scene`,
`terminal_scene`, `screenshot_scene` — mais overlays (`section_title`, `stat_reveal`,
`provider_chip`).

## O que ficou provado hoje

| Teste | Resultado |
|-------|-----------|
| `piper.exe` no venv | ✅ existe |
| Vozes Piper pt/en/es | ✅ descarregadas (3 × 60 MB) em `~/.piper/models` |
| Piper a falar 3 línguas | ✅ wav gerado (pt 176 KB, en 161 KB, es 166 KB) |
| Remotion a renderizar | ✅ **90 frames, 550 kB** com a Frida (`TalkingHead`) |
| Remotion com caminho absoluto `file://` | ❌ bloqueado → copiar para `public/` |
| Avatar local (SadTalker/Wav2Lip) | ⚠️ existe mas exige instalação própria |

Ficheiro do teste: `work/clones/_remotion/frida_simple.mp4`
Props de exemplo: `OpenMontage/remotion-composer/frida_props3.json`

## Decisão de arquitetura

```
RADAR (nosso)              PRODUÇÃO (OpenMontage)            ENTREGA
yt-channels / dashboard →  pipeline avatar-spokesperson   →  Remotion render
taxonomy / classificação    + piper_tts (voz local)          + mp4 por idioma
                            + nosso LivePortrait (Frida/Luna)
                            + SoundCraft (masterização)
```

- **Nosso radar e dashboard** continuam a ser a entrada (descobrir o que bomba).
- **OpenMontage** passa a ser o cérebro de produção (estágios, gates, composição).
- **LivePortrait + SoundCraft** ficam como as nossas peças locais, já provadas.
- **Piper** é a voz **offline e gratuita** que o OpenMontage usa por defeito
  (`piper_tts` é o "default offline path" do próprio código).

## Limites honestos

- OpenMontage espera um **agente** a conduzir as skills; não é um CLI de um só comando.
- Muitos providers de TTS/vídeo são **pagos** (ElevenLabs, Kling, Veo, fal.ai). Os
  caminhos livres são: `piper_tts`, `comfyui_*` (ComfyUI local em `D:\Comfy`),
  `stock_sources` e `corpus_builder`/`clip_search` (footage livre).
- `remotion-composer/package.json` pede Node `^24.22.1`; temos **24.14.0** e funcionou.
- Remotion não lê `file://` — os assets têm de estar em `remotion-composer/public/`.

## Próximos passos concretos

1. Pôr `piper` no PATH e ligar `piper_tts` como motor de voz do nosso pipeline
   (alternativa offline ao Edge TTS).
2. Migrar a montagem de ffmpeg para **TalkingHead + Explainer** do Remotion
   (layout, legendas palavra-a-palavra e gráficos prontos).
3. Ler `pipeline_defs/avatar-spokesperson.yaml` e usar os 7 estágios como guião de
   produção do nosso agente.
4. Estudar `clip-factory.yaml` para produção em série.
