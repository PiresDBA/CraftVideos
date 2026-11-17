# Graph Report - CRAFT  (2026-11-17)

## Corpus Check
- 159 files · ~172,835 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1241 nodes · 2554 edges · 74 communities (68 shown, 6 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 182 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Research Dashboard
- Train Scene React Code
- Pipeline Orchestrator
- Train Window Shader
- ArtCraft Dispatcher CLI
- Channel Collection
- Format Profiler
- ASS and SRT Subtitles
- EDL Beat Geometry
- Blender Diorama Scene
- Python CV/Blender Scripts
- Channel Classification
- Avatar Base Generator
- Analyze and Generate
- Motion Card Builder
- TTS and Build Helpers
- yt-clone-build Engine
- Card Config
- Script Generation
- Card Scaffolding
- Scene Visuals Builder
- Program Reference and Integrations
- Blender Scene Scripts
- Engine CLI Smoke Tests
- Runtime Detection
- Editorial Direction
- Fresh Channel Finder
- Blender Diorama Animation
- Smart Render CLI
- Layout Tests
- Preflight Checks
- Studio Catalog
- Channel Scanner
- EffectCraft Render
- Studio Panel Builder
- Reference Analysis
- Channel Scoring Pipeline
- Roteiro to Scene Builder
- CLI Helper Wrapper
- Narration Cache
- ComfyUI Client
- Studio CLI
- Asset Integration Scripts
- Target Collection
- Media Tests and Preview Server
- Remotion Motion Render
- Lint Scope Analysis
- VoiceCraft Status and LLM Rules
- World Ranking Export
- Blender Materials and Backdrop
- ComfyUI API Client
- Blender Render Setup
- Blender Patch Scripts
- Classifier Functions
- JS Lint Utilities
- Clone Queue Daemon
- Research Runner
- Blender Asset Integration
- VectorCraft Export Entry
- Explainer Effects Kit
- Shot Anatomy Measurement
- Bot Chain and Audio v1
- Luninha e Fridoca Story
- Mascot SVG Artwork
- Factory Contract Principles
- Channel Classifier Core
- OpenMontage Catalog
- Master Studio Skills
- Audio Artifacts v1 and v2
- Factory Map Docs
- Six-Bot Production Chain
- Clone Engine Notes
- Clone Rules and Gates
- Explainer Render Kit

## God Nodes (most connected - your core abstractions)
1. `main()` - 32 edges
2. `run()` - 21 edges
3. `build_variant()` - 20 edges
4. `Especificação Técnica — As Quatro Estações (revisão 2, Curador-Prompts → Diretor-Arte)` - 18 edges
5. `buildNarrationForLanguage()` - 17 edges
6. `writeSceneASS()` - 15 edges
7. `buildSceneClips()` - 15 edges
8. `Bot 4 — Especialista-Áudio e Avatar` - 14 edges
9. `generateSceneVisuals()` - 13 edges
10. `main()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Gates de qualidade Q1–Q8` --semantically_similar_to--> `Mix de prévia v2 — 163,415 s, -14,0 LUFS, valsa a -22 dB`  [AMBIGUOUS] [semantically similar]
  CONTRATO_FABRICA.md → video-orquestracao/public/assets/audio/RELATORIO-tecnico-audio-avatar.md
- `Uma frase com palavra em laranja (textStyle.mode caption)` --references--> `writeSceneASS()`  [INFERRED]
  AUDITORIA_CLONE.md → .artcraft/clone/lib/ass.mjs
- `Gates de qualidade Q1–Q8` --references--> `wav2lipSync()`  [INFERRED]
  CONTRATO_FABRICA.md → .artcraft/yt-clone-build.mjs
- `loadEnv()` --references--> `VoiceCraft (servidor TTS local :8090)`  [INFERRED]
  .artcraft/yt-script.mjs → AGENTS.md
- `comfyStatus()` --semantically_similar_to--> `comfyStatus()`  [INFERRED] [semantically similar]
  scripts/comfy_client.mjs → .artcraft/clone/lib/comfy.mjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Os 5 avatares do catálogo implementam o motor de lip-sync por energia RMS** — video_orquestracao_public_assets_avatar_catalogo_avatares_buldogue_ingles, video_orquestracao_public_assets_avatar_catalogo_avatares_salsicha_marrom, video_orquestracao_public_assets_avatar_catalogo_avatares_menina_cabelo_escuro, video_orquestracao_public_assets_avatar_catalogo_avatares_menino_cabelo_loiro, video_orquestracao_public_assets_avatar_catalogo_avatares_mascote_quatro_estacoes, video_orquestracao_public_assets_avatar_catalogo_avatares_sincronizacao_labial [EXTRACTED 1.00]
- **Cadeia de produção de 6 bots no OpenBot (handoff Curador → Diretor → especialistas → QA)** — video_orquestracao_agents_cadeia_producao_6_bots, video_orquestracao_agents_curador_prompts, video_orquestracao_agents_diretor_arte, video_orquestracao_agents_especialista_comfyui, video_orquestracao_agents_especialista_audio_avatar, video_orquestracao_agents_dev_3d_craft, video_orquestracao_agents_dev_motion_qa [EXTRACTED 1.00]
- **Code-Driven Facial Rig: both eyes and mouth animated by external code** — video_orquestracao_public_assets_avatar_avatar_mascote_flat_quatro_estacoes_olho_esquerdo, video_orquestracao_public_assets_avatar_avatar_mascote_flat_quatro_estacoes_olho_direito, video_orquestracao_public_assets_avatar_avatar_mascote_flat_quatro_estacoes_boca, video_orquestracao_public_assets_avatar_avatar_mascote_flat_quatro_estacoes_animacao_facial_por_codigo [EXTRACTED 1.00]
- **Pipeline de produção do clone (motor + voz + avatar + motion + daemon)** — contrato_fabrica_yt_clone_build, contrato_fabrica_voicecraft_voice, contrato_fabrica_explainer_effects_kit, system_docs_avatar_engine_selection, system_docs_daemon_http [INFERRED 0.75]
- **Sistema de apresentadoras Frida e Luna** — contrato_fabrica_frida_luna, _artcraft_clone_readme_direcao_contract, contrato_fabrica_voicecraft_voice, system_docs_avatar_engine_selection [INFERRED 0.75]
- **Inventário OpenMontage (203 tools / 13 pipelines / 13 composições / skills)** — varredura_openmontage, master_studio_openmontage_pipelines, master_studio_remotion_compositions, contrato_fabrica_openmontage_skills, system_docs_clone_system [INFERRED 0.75]
- **Direção visual Grand Budapest de As Quatro Estações (câmera, luz, paleta, dissolve, cortes, inserts)** — video_orquestracao_public_assets_especificacao_tecnica_quatro_estacoes_camera_master_continuo, video_orquestracao_public_assets_especificacao_tecnica_quatro_estacoes_direcao_luz_estacoes, video_orquestracao_public_assets_especificacao_tecnica_quatro_estacoes_paleta_grand_budapest, video_orquestracao_public_assets_especificacao_tecnica_quatro_estacoes_dissolucao_estacoes_shader, video_orquestracao_public_assets_especificacao_tecnica_quatro_estacoes_transicoes_estacao_t1_t4, video_orquestracao_public_assets_especificacao_tecnica_quatro_estacoes_inserts_detalhe [INFERRED 0.85]
- **Flat Four-Seasons Visual Identity: artwork, palette and costume form one design system** — video_orquestracao_public_assets_avatar_avatar_mascote_flat_quatro_estacoes_artwork, video_orquestracao_public_assets_avatar_avatar_mascote_flat_quatro_estacoes_paleta_visual, video_orquestracao_public_assets_avatar_avatar_mascote_flat_quatro_estacoes_traje_mascote [INFERRED 0.85]

## Communities (74 total, 6 thin omitted)

### Community 6 - "Research Dashboard"
Cohesion: 0.10
Nodes (20): ReferenceVideoManager, CloneManager, fail(), ok(), escapeHtml(), generateCategoryButtons(), generateChannelCards(), generateChannelOptions() (+12 more)

### Community 32 - "Train Scene React Code"
Cohesion: 0.25
Nodes (15): EstacaoTrem, PaletaExterior, ParticulaCena, ParticulaEstacao, deslizarPassagem(), montarParticulas(), progressoSuave(), ruidoDeterministico() (+7 more)

### Community 44 - "Pipeline Orchestrator"
Cohesion: 0.27
Nodes (5): CraftPipeline, main(), renderCard(), main(), raw

### Community 0 - "ArtCraft Dispatcher CLI"
Cohesion: 0.07
Nodes (56): appPaths(), cmdApps(), cmdCli(), cmdDoctor(), cmdGui(), cmdMcpConfig(), cmdRefresh(), cmdSearch() (+48 more)

### Community 1 - "Channel Collection"
Cohesion: 0.05
Nodes (42): daysSince(), isShortsDuration(), looksLikeShorts(), main(), parseJsonLines(), pool(), run(), step() (+34 more)

### Community 10 - "Format Profiler"
Cohesion: 0.09
Nodes (25): discoverTools(), findInTree(), flag(), requireTool(), which(), FLAG(), detectCuts(), findBin() (+17 more)

### Community 11 - "ASS and SRT Subtitles"
Cohesion: 0.18
Nodes (24): assDialogue(), assStyleHeader(), assTime(), buildASS(), buildSRT(), formatSRTTime(), parseAssEvents(), tmp() (+16 more)

### Community 12 - "EDL Beat Geometry"
Cohesion: 0.11
Nodes (22): beat(), assignParents(), beatGeometry(), capBeats(), foldShots(), framingFor(), loadScript(), loadShots() (+14 more)

### Community 13 - "Blender Diorama Scene"
Cohesion: 0.25
Nodes (18): assign(), bevel(), box(), build_books(), build_foreground(), build_gear(), build_orb_cluster(), build_panels() (+10 more)

### Community 14 - "Python CV/Blender Scripts"
Cohesion: 0.16
Nodes (7): carregar_rgb(), correr_pipeline(), main(), preparar_repo(), main(), BASE_DO_TEMPLATE, PASTA_DRIVERS

### Community 15 - "Channel Classification"
Cohesion: 0.09
Nodes (18): cadences, CHANNELS, durations, HERE, LANG, [nA, nB], niches, OUT_DIR (+10 more)

### Community 16 - "Avatar Base Generator"
Cohesion: 0.18
Nodes (20): aguardarResultado(), baixarImagem(), buscarObjectInfo(), carregarWorkflow(), construirPrompt(), resolverTodosValores(), gerarPersonagem(), main() (+12 more)

### Community 17 - "Analyze and Generate"
Cohesion: 0.16
Nodes (19): analyzeReference(), arg(), buildScriptFromFacts(), extractColorTempo(), main(), probeVideo(), samplesFromFrames(), sceneFromFact() (+11 more)

### Community 18 - "Motion Card Builder"
Cohesion: 0.22
Nodes (20): arrangeLayer(), backingLinesForScene(), backingSourceForScene(), buildCaptionA(), buildCaptionB(), buildLayerStack(), buildLowerThird(), buildMotionOverMedia() (+12 more)

### Community 19 - "TTS and Build Helpers"
Cohesion: 0.15
Nodes (21): killTree(), run(), argAll(), buildNarrationForLanguage(), customSay(), edgeSay(), elevenlabsSay(), filmcraftSay() (+13 more)

### Community 2 - "yt-clone-build Engine"
Cohesion: 0.06
Nodes (38): carregarOpus5(), consultarReferenciasOpus5(), fetchBroll(), generateCloudAvatar(), generateDrivingVideo(), generateHunyuanAvatar(), generateMuseTalkAvatar(), httpDownload() (+30 more)

### Community 21 - "Card Config"
Cohesion: 0.17
Nodes (14): applyOverride(), flatKey(), loadConfig(), rawConfig(), redactConfig(), cfgBase(), validateConfig(), withDefaults() (+6 more)

### Community 22 - "Script Generation"
Cohesion: 0.12
Nodes (17): arg(), attempt(), finish(), loadEnv(), child, env, ENV_PATH, FORMAT_PATH (+9 more)

### Community 23 - "Card Scaffolding"
Cohesion: 0.31
Nodes (17): archetypeFor(), cmds(), fullGraphic(), mono(), neonGrid(), neonRect(), panelStack(), rect() (+9 more)

### Community 24 - "Scene Visuals Builder"
Cohesion: 0.19
Nodes (13): comfyStatus(), blenderCard(), dioramaClip(), generateSceneVisuals(), kenBurns(), scenePrompt(), subjectFrom(), main() (+5 more)

### Community 25 - "Program Reference and Integrations"
Cohesion: 0.16
Nodes (10): run(), shortMenu(), generateAsset(), main(), exportVideo(), main(), main(), processAudio() (+2 more)

### Community 27 - "Blender Scene Scripts"
Cohesion: 0.20
Nodes (6): extract_frame(), main(), env_float(), env_int(), get_scene_params(), setup_scene()

### Community 28 - "Engine CLI Smoke Tests"
Cohesion: 0.13
Nodes (9): correr(), runEngine(), tmp(), CLI, created, HERE, created, ENGINE (+1 more)

### Community 29 - "Runtime Detection"
Cohesion: 0.19
Nodes (11): detectVRAM(), findFfmpeg(), httpGet(), httpPost(), pythonEnv(), server(), findLivePortraitOutput(), generateLivePortraitAvatar() (+3 more)

### Community 3 - "Editorial Direction"
Cohesion: 0.09
Nodes (34): aplicarDirecaoAoPlano(), aplicarDirecaoEditorial(), enquadramentoDoBeat(), enquadramentosDoPlano(), estadoBase(), inferirEmocao(), inferirFalante(), normalizarDirecao() (+26 more)

### Community 30 - "Fresh Channel Finder"
Cohesion: 0.12
Nodes (12): candidates, confirmed, DAYS, floor, MIN_VIEWS, OUT, pick, QUERIES (+4 more)

### Community 31 - "Blender Diorama Animation"
Cohesion: 0.17
Nodes (8): add_area(), animate(), key(), main(), setup_camera(), setup_compositor(), setup_world(), wipe()

### Community 33 - "Smart Render CLI"
Cohesion: 0.26
Nodes (13): defaultOutPath(), listCompositionsFromProject(), main(), renderComposition(), runCLI(), selectTransformProperties(), smoothSelectedTangents(), splitCompoundName() (+5 more)

### Community 34 - "Layout Tests"
Cohesion: 0.26
Nodes (12): layoutMetrics(), sceneLayout(), textAnchorY(), sceneKicker(), buildCards(), buildMotionCards(), buildSceneClips(), figcraftRun() (+4 more)

### Community 35 - "Preflight Checks"
Cohesion: 0.25
Nodes (10): formatPreflight(), resolvePath(), runPreflight(), speakerOf(), templatesDoScript(), ensureSeamlessLoop(), probeDuration(), ensureAvatarMask() (+2 more)

### Community 36 - "Studio Catalog"
Cohesion: 0.19
Nodes (13): categoryOf(), exists(), frontmatter(), apps, artDir, byCat, modules, OM (+5 more)

### Community 37 - "Channel Scanner"
Cohesion: 0.18
Nodes (11): main(), parseJsonLines(), pool(), run(), LIMIT, MAX_CHANNELS, OUT, SAMPLES (+3 more)

### Community 38 - "EffectCraft Render"
Cohesion: 0.27
Nodes (13): cli(), defaultOutPathForComp(), main(), parseArgs(), renderComp(), selectTransformProps(), smoothTangents(), splitCompoundName() (+5 more)

### Community 39 - "Studio Panel Builder"
Cohesion: 0.23
Nodes (12): appCard(), catBlock(), esc(), skillCard(), byCat, cat, cats, compChips (+4 more)

### Community 4 - "Reference Analysis"
Cohesion: 0.09
Nodes (37): acquire(), anatomy(), arg(), buildPlan(), buildScript(), decodeFrame(), faces(), frameAt() (+29 more)

### Community 40 - "Channel Scoring Pipeline"
Cohesion: 0.21
Nodes (9): loadSamples(), main(), pipelineFor(), scoreChannel(), OUT, SAMPLES, SCAN, THRESHOLD (+1 more)

### Community 41 - "Roteiro to Scene Builder"
Cohesion: 0.30
Nodes (11): buildScenes(), firstSentence(), headlineFor(), main(), plain(), readRoteiro(), splitBlocks(), splitLong() (+3 more)

### Community 43 - "CLI Helper Wrapper"
Cohesion: 0.27
Nodes (9): explain(), run(), runOrThrow(), CLI_PATH, __dirname, __filename, { fileURLToPath }, { join, dirname } (+1 more)

### Community 45 - "Narration Cache"
Cohesion: 0.38
Nodes (6): hashText(), narrationCachePath(), narrationFingerprint(), readNarrationCache(), writeNarrationCache(), VOICE_FIELDS

### Community 46 - "ComfyUI Client"
Cohesion: 0.42
Nodes (7): comfyFree(), comfyImage(), comfyVideo(), download(), queue(), waitResult(), prompts

### Community 47 - "Studio CLI"
Cohesion: 0.22
Nodes (7): all(), items(), cat, catalog, groups, HERE, CATALOG

### Community 48 - "Asset Integration Scripts"
Cohesion: 0.27
Nodes (6): generateAsset(), main(), main(), renderCard(), generateVector(), main()

### Community 5 - "Target Collection"
Cohesion: 0.08
Nodes (33): addVideo(), inferAudience(), isShortVideo(), listRunFiles(), main(), normCategory(), readJson(), toVideoItem() (+25 more)

### Community 50 - "Media Tests and Preview Server"
Cohesion: 0.31
Nodes (4): sceneVisual(), makeVisual(), PORT, TYPES

### Community 51 - "Remotion Motion Render"
Cohesion: 0.36
Nodes (7): buildRemotionCards(), remotionAvailable(), renderKineticCard(), runNode(), t0, REMOTION_CLI, REMOTION_COMPOSER

### Community 55 - "Lint Scope Analysis"
Cohesion: 0.43
Nodes (5): maskJs(), topLevelFunctions(), declaredIn(), identifiers(), KEYWORDS

### Community 57 - "VoiceCraft Status and LLM Rules"
Cohesion: 0.29
Nodes (6): pad(), isFree(), rows, DEFAULT_CHAIN, Estado 2026-11-15 (yryryr, Wav2Lip, loop do avatar, telemetria), Manual Animado (deck HTML de 9 páginas da Fábrica)

### Community 58 - "World Ranking Export"
Cohesion: 0.36
Nodes (6): cloneability(), fetchWiki(), main(), stripTags(), OUT, SAMPLE

### Community 59 - "Blender Materials and Backdrop"
Cohesion: 0.36
Nodes (5): build_backdrop(), build_cove(), new_material(), pinch(), set_inputs()

### Community 60 - "ComfyUI API Client"
Cohesion: 0.54
Nodes (7): comfyFree(), comfyImage(), comfyStatus(), comfyVideo(), download(), queue(), waitResult()

### Community 68 - "Classifier Functions"
Cohesion: 0.70
Nodes (5): createClassifier(), applyOverride(), classifyChannel(), scoreAi(), verdictOf()

### Community 7 - "Clone Queue Daemon"
Cohesion: 0.11
Nodes (31): appendQueue(), arg(), buildCloneArgs(), cloneJobPublic(), estimateEtaMs(), FLAG(), fmtMs(), inferStepFromLine() (+23 more)

### Community 70 - "Research Runner"
Cohesion: 0.60
Nodes (4): main(), parseJsonLines(), run(), SOURCES

### Community 8 - "Explainer Effects Kit"
Cohesion: 0.19
Nodes (31): advance(), buildCaptions(), buildNeonGrid(), buildPanelStack(), buildPresenterZone(), buildSplitBand(), buildUiPanel(), buildWhiteboard() (+23 more)

### Community 9 - "Shot Anatomy Measurement"
Cohesion: 0.11
Nodes (26): addBand(), analyseFrame(), bandStats(), classifyShot(), decodeRaw(), detectCuts(), isDark(), isOrange() (+18 more)

### Community 20 - "Bot Chain and Audio v1"
Cohesion: 0.22
Nodes (20): voice, tools/gerar_narracao_quatro_estacoes.py, tools/gerar_sfx_trilha_quatro_estacoes.py, tools/gerar_tempos_narracao.py, tools/montar_mix_previa_quatro_estacoes.py, tools/extrair_tempos_narracao_quatro_estacoes.py, tools/gerar_narracao_v2_quatro_estacoes.py, tools/gerar_trilha_valsa_v2_quatro_estacoes.py (+12 more)

### Community 26 - "Luninha e Fridoca Story"
Cohesion: 0.18
Nodes (14): PRESENTERS, Apresentadoras Frida (bulldog) e Luna (dachshund), Avatar Buldogue inglês (id buldogue-ingles, padrão atual), Avatar Mascote Quatro Estações (chapéu terracota, cachecol mostarda, passarinho), Avatar Menina de cabelo escuro (id menina-cabelo-escuro), Avatar Menino de cabelo loiro (id menino-cabelo-loiro), Avatar Salsicha marrom (id salsicha-marrom), Personagem Frida (buldogue inglês, voz en-US) (+6 more)

### Community 42 - "Mascot SVG Artwork"
Cohesion: 0.23
Nodes (10): CORES_VAGAO, Flat Seasonal Palette (cream #F4E9D8, teal #2F6F6A, mustard #D9A441, rust #B5532E, skin #E8B4A0, dark #2B2118), 10 inserts de detalhe (I1–I10, 34% do tempo sobre o master), Paleta Grand Budapest (rosa empoeirado #E3A9A6, mostarda #D9A441, esmeralda), Referência opus5 itsolelehmann-762215 — "4 seasons passing outside a train window, Grand Budapest Hotel style", Mascot Avatar — Flat Four Seasons (SVG artwork), Mouth Group (boca), Right Eye Group (olho-direito) (+2 more)

### Community 52 - "Factory Contract Principles"
Cohesion: 0.28
Nodes (8): ROOT, Layout por plano (sceneLayout, splitRatio, textSide), Referência medida ref5 (yccXYW5liLE, ref1080.mp4), Anatomia medida: 33 planos, 31,9 cortes/min, divisão 17–79%, Layout dividido topo/baixo (formato do nicho), 9 composições EffectCraft E1–E9 (whiteboard, caption, neon grid, ui panel, split, …), Short de referência yccXYW5liLE (60,23 s, 33 planos, ritmo 1,83 s/plano, acento #FF6A00), Página de resultado — Explainer effects (9 composições)

### Community 54 - "Channel Classifier Core"
Cohesion: 0.29
Nodes (7): EMPTY_AI, YT_CATEGORY_TO_NICHE, classifier, TAXONOMY_PATH, classifier, Classificação Dark em taxonomy.json (flags, não nicho), Classificação Dark v3 (duas camadas: nicho + IA)

### Community 56 - "OpenMontage Catalog"
Cohesion: 0.25
Nodes (8): compositions, pipelines, OpenMontage: 98 skills utilizáveis (§3.2), 13 pipelines do OpenMontage, 13 composições Remotion catalogadas, OpenMontage (produção agêntica de vídeo, AGPLv3), Teste Remotion (TalkingHead com Frida, 90 frames), Manual Visual — Mapa da Fábrica de Canais

### Community 71 - "Master Studio Skills"
Cohesion: 0.67
Nodes (3): OUT, 92 skills por área (Master Studio), Master Studio (painel gerado de studio.catalog.json)

### Community 49 - "Audio Artifacts v1 and v2"
Cohesion: 0.31
Nodes (9): Avatar Wav2Lip v1 — 600x704, 25fps, 15,0 s, placeholder s0.jpg, Narração v1 — 106,62 s, voz FranciscaNeural ritmo -5%, tempos-narracao.json v1 — 106,632 s, 3.199 frames @30fps, Avatar Wav2Lip cena-05 v2 — 600×704, 25fps, 22,84 s (rosto placeholder), Narração v2 — 163,415 s = 4.902 frames, voz FranciscaNeural ritmo -38%, tempos-narracao.json v2 — 4.902 frames @30fps, transcrição faster-whisper small int8, Beat sheet frame-exato (3.199 frames medidos no áudio), Janelas de fala estimadas por caracteres (cenas 01–05) (+1 more)

### Community 53 - "Factory Map Docs"
Cohesion: 0.32
Nodes (6): Radar diário de canais (tarefa ArtCraftRadar 09:00), Caminho do vídeo em 10 passos (radar → publicar), yt-daemon HTTP :8799 (/clone /settings /queue), Dashboard visual (337 canais, thumbs base64), CONTRATO DO PROJETO — Fábrica de Canais, ArtCraft Dark Channel Clone System (documentação técnica)

### Community 61 - "Six-Bot Production Chain"
Cohesion: 0.46
Nodes (7): Cadeia de produção com 6 bots (sala OpenBot), Bot 1 — Curador-Prompts, Bot 5 — Dev-3D-Craft, Bot 6 — Dev-Motion-QA, Bot 2 — Diretor-Arte, Bot 3 — Especialista-ComfyUI, Ficha de personagens — Luna e Frida no Espaço Sideral

### Community 62 - "Clone Engine Notes"
Cohesion: 0.29
Nodes (5): Cache de narração por fingerprint (narrationFingerprint), yt-ref-anatomy.mjs (medição de referência sem dependências), yt-clone-build.mjs (motor de produção do clone), Corrupção de yt-clone-build.mjs (3 harnesses, 13-11-2026), Medidor de formato (yt-format-profile.mjs, exemplo Jazzghost)

### Community 66 - "Clone Rules and Gates"
Cohesion: 0.40
Nodes (3): Contrato de Direção (active_speaker / frida_state / luna_state), Gates de qualidade Q1–Q8, CraftVideos — workspace do pipeline de clonagem

### Community 67 - "Explainer Render Kit"
Cohesion: 0.40
Nodes (5): Explainer effects kit (9 composições EffectCraft), Kit de efeitos do explainer (E1–E9), cli-helper.js (run / runOrThrow / explain), render.mjs (pipeline de render headless por omissão), selectedTangentsSmoothed (suavização de tangentes)

## Ambiguous Edges - Review These
- `STOP_MARKS` → `re`  [AMBIGUOUS]
  scripts/roteiro_para_cenas.mjs · relation: conceptually_related_to
- `Mix de prévia v2 — 163,415 s, -14,0 LUFS, valsa a -22 dB` → `Gates de qualidade Q1–Q8`  [AMBIGUOUS]
  CONTRATO_FABRICA.md · relation: semantically_similar_to
- `tempos-narracao.json v2 — 4.902 frames @30fps, transcrição faster-whisper small int8` → `Beat sheet frame-exato (3.199 frames medidos no áudio)`  [AMBIGUOUS]
  video-orquestracao/public/assets/especificacao-tecnica-quatro-estacoes.md · relation: shares_data_with
- `Beat sheet frame-exato (3.199 frames medidos no áudio)` → `TIMELINE As Quatro Estações (gerado, 169,868 s / 5097 frames @30fps)`  [AMBIGUOUS]
  video-orquestracao/TIMELINE-quatro-estacoes.md · relation: conceptually_related_to
- `ArtCraft Dark Channel Clone System (documentação técnica)` → `OpenMontage: 98 skills utilizáveis (§3.2)`  [AMBIGUOUS]
  CONTRATO_FABRICA.md · relation: conceptually_related_to

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md — mapa vivo do ecossistema Video Orchestrator` connect `Bot Chain and Audio v1` to `ArtCraft Dispatcher CLI`, `Train Scene React Code`, `OpenMontage Catalog`, `Luninha e Fridoca Story`, `Six-Bot Production Chain`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Should `Research Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.10084033613445378 - nodes in this community are weakly interconnected._
- **Why does `env_float()` connect `Blender Scene Scripts` to `Scene Visuals Builder`, `Blender Diorama Scene`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `ArtCraft Dispatcher CLI` be split into smaller, more focused modules?**
  _Cohesion score 0.07005649717514124 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `STOP_MARKS` and `re`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Mix de prévia v2 — 163,415 s, -14,0 LUFS, valsa a -22 dB` and `Gates de qualidade Q1–Q8`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `tempos-narracao.json v2 — 4.902 frames @30fps, transcrição faster-whisper small int8` and `Beat sheet frame-exato (3.199 frames medidos no áudio)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._