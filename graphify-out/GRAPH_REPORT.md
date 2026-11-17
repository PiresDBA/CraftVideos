# Graph Report - CRAFT  (2026-11-17)

## Corpus Check
- 188 files · ~233,946 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: .cmd 7, .pkl 3, .bat 1)

## Summary
- 1602 nodes · 3084 edges · 91 communities (84 shown, 7 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 204 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6c937ec1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ArtCraft Dispatcher CLI
- Channel Collection
- yt-clone-build Engine
- Editorial Direction
- Reference Analysis
- Target Collection
- Research Dashboard
- Clone Queue Daemon
- Explainer Effects Kit
- Shot Anatomy Measurement
- Format Profiler
- ASS and SRT Subtitles
- EDL Beat Geometry
- blender_diorama.py
- Python CV/Blender Scripts
- Channel Classification
- Avatar Base Generator
- Analyze and Generate
- Motion Card Builder
- Bíblia de estilo — *O Parque dos Pets* (Frida & Luna, recriado)
- Bot Chain and Audio v1
- Card Config
- Script Generation
- Card Scaffolding
- visuals.mjs
- Program Reference and Integrations
- Luninha e Fridoca Story
- Blender Scene Scripts
- ref_node_fs
- Runtime Detection
- Fresh Channel Finder
- expressoes.py
- Train Scene React Code
- Smart Render CLI
- Layout Tests
- Preflight Checks
- Studio Catalog
- Channel Scanner
- EffectCraft Render
- Studio Panel Builder
- Channel Scoring Pipeline
- Roteiro to Scene Builder
- Mascot SVG Artwork
- CLI Helper Wrapper
- Pipeline Orchestrator
- numpy
- gerar_fundos.py
- Studio CLI
- Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)
- Audio Artifacts v1 and v2
- pathlib
- Remotion Motion Render
- Factory Contract Principles
- Factory Map Docs
- Channel Classifier Core
- Lint Scope Analysis
- OpenMontage Catalog
- VoiceCraft Status and LLM Rules
- World Ranking Export
- build_erase_mask
- Canvas
- Six-Bot Production Chain
- Clone Engine Notes
- time
- O Parque dos Pets — beat sheet
- build_sequence_plan.py
- Gates de qualidade Q1–Q8
- qbez
- Classifier Functions
- JS Lint Utilities
- Research Runner
- Master Studio Skills
- Blender Asset Integration
- gen_edit.py
- TAREFAS DO TIME — historinha "Luna e Frida no Espaço Sideral"
- _iris
- O Parque dos Pets — especificação de planos
- manifest.json
- render
- limpar_halo.py
- DIREÇÃO DE ARTE — historinha "Luna e Frida no Espaço Sideral"
- desenhar_cartao
- gerar-driving-templates-f3.py
- ref_remotion
- Prompts e método das grelhas de expressões (Frida & Luna)
- Personagens — ficha técnica (aprovada 2026-11-17)
- REFERÊNCIA EXCLUSIVA — canal @FridaeLuna (172 imagens do canal)
- KIT DE REFERÊNCIA — Luna e Frida (padrão "Pixel Disney" do vídeo original)
- Agentes — Frida & Luna (recriados do OpenBot)
- Stems — O Parque dos Pets
- effectcraft_integration.mjs

## God Nodes (most connected - your core abstractions)
1. `main()` - 32 edges
2. `run()` - 21 edges
3. `build_variant()` - 20 edges
4. `Especificação Técnica — As Quatro Estações (revisão 2, Curador-Prompts → Diretor-Arte)` - 18 edges
5. `buildNarrationForLanguage()` - 17 edges
6. `writeSceneASS()` - 15 edges
7. `buildSceneClips()` - 15 edges
8. `Bot 4 — Especialista-Áudio e Avatar` - 14 edges
9. `Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)` - 13 edges
10. `generateSceneVisuals()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Gates de qualidade Q1–Q8` --semantically_similar_to--> `Mix de prévia v2 — 163,415 s, -14,0 LUFS, valsa a -22 dB`  [AMBIGUOUS] [semantically similar]
  CONTRATO_FABRICA.md → video-orquestracao/public/assets/audio/RELATORIO-tecnico-audio-avatar.md
- `Uma frase com palavra em laranja (textStyle.mode caption)` --references--> `writeSceneASS()`  [INFERRED]
  AUDITORIA_CLONE.md → .artcraft/clone/lib/ass.mjs
- `Gates de qualidade Q1–Q8` --references--> `wav2lipSync()`  [INFERRED]
  CONTRATO_FABRICA.md → .artcraft/yt-clone-build.mjs
- `loadEnv()` --references--> `VoiceCraft (servidor TTS local :8090)`  [INFERRED]
  .artcraft/yt-script.mjs → AGENTS.md
- `Layout dividido topo/baixo (formato do nicho)` --conceptually_related_to--> `sceneLayout()`  [INFERRED]
  CONTRATO_FABRICA.md → .artcraft/clone/lib/layout.mjs

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

## Communities (91 total, 7 thin omitted)

### Community 0 - "ArtCraft Dispatcher CLI"
Cohesion: 0.07
Nodes (56): artcraft.mjs shell dispatcher, artcraft-suite (skill router), artcraft MCP gateway (mcp-gateway.mjs, 4 tools), APP_ALIASES, appPaths(), APPS, cmdApps(), cmdCli() (+48 more)

### Community 1 - "Channel Collection"
Cohesion: 0.05
Nodes (42): DARK_QUERIES, DAYS, daysSince(), DEFAULT_QUERIES, EXTRACT, isShortsDuration(), looksLikeShorts(), main() (+34 more)

### Community 2 - "yt-clone-build Engine"
Cohesion: 0.06
Nodes (58): killTree(), run(), ARG_ERRORS, argAll(), buildCards(), buildNarrationForLanguage(), carregarOpus5(), CC (+50 more)

### Community 3 - "Editorial Direction"
Cohesion: 0.09
Nodes (34): ACCOES_CABECA, ACOES_FALANDO, ALVOS_OLHAR, aplicarDirecaoAoPlano(), aplicarDirecaoEditorial(), CATALOGO_DRIVERS, EMOCOES, enquadramentoDoBeat() (+26 more)

### Community 4 - "Reference Analysis"
Cohesion: 0.09
Nodes (37): ACCENT, acquire(), ANALYSIS, anatomy(), arg(), buildPlan(), buildScript(), decodeFrame() (+29 more)

### Community 5 - "Target Collection"
Cohesion: 0.08
Nodes (33): addVideo(), inferAudience(), isShortVideo(), listRunFiles(), main(), normCategory(), OUT_DIR, OUT_FILE (+25 more)

### Community 6 - "Research Dashboard"
Cohesion: 0.10
Nodes (20): Main(), DASH, DATA, fail(), ok(), PORT, CloneManager, CONFIG (+12 more)

### Community 7 - "Clone Queue Daemon"
Cohesion: 0.11
Nodes (31): ALL_PHASES, appendQueue(), arg(), AUTO_EXECUTE, buildCloneArgs(), cloneJobPublic(), cloneJobs, DASH (+23 more)

### Community 8 - "Explainer Effects Kit"
Cohesion: 0.19
Nodes (31): advance(), argv, BUILD, buildCaptions(), buildNeonGrid(), buildPanelStack(), buildPresenterZone(), buildSplitBand() (+23 more)

### Community 9 - "Shot Anatomy Measurement"
Cohesion: 0.11
Nodes (26): ANATOMY, addBand(), analyseFrame(), bandStats(), classifyShot(), decodeRaw(), detectCuts(), FPS (+18 more)

### Community 10 - "Format Profiler"
Cohesion: 0.09
Nodes (25): discoverTools(), findInTree(), flag(), KNOWN, requireTool(), SCAN_ROOTS, TOOLS, which() (+17 more)

### Community 11 - "ASS and SRT Subtitles"
Cohesion: 0.17
Nodes (26): assDialogue() — construtor único das linhas Dialogue, Bug do campo Effect em falta no Dialogue ASS, keyWords / keywordsWithFallback (selecção de palavras-chave), assDialogue(), assStyleHeader(), assTime(), buildASS(), buildSRT() (+18 more)

### Community 12 - "EDL Beat Geometry"
Cohesion: 0.11
Nodes (22): beat(), assignParents(), beatGeometry(), capBeats(), CHECK, CONFIG_FILE, foldShots(), framingFor() (+14 more)

### Community 13 - "blender_diorama.py"
Cohesion: 0.08
Nodes (34): add_area(), animate(), assign(), bevel(), box(), build_backdrop(), build_books(), build_cove() (+26 more)

### Community 14 - "Python CV/Blender Scripts"
Cohesion: 0.27
Nodes (4): carregar_rgb(), correr_pipeline(), main(), preparar_repo()

### Community 15 - "Channel Classification"
Cohesion: 0.09
Nodes (18): cadences, CHANNELS, durations, HERE, LANG, [nA, nB], niches, OUT_DIR (+10 more)

### Community 16 - "Avatar Base Generator"
Cohesion: 0.18
Nodes (20): BASES_V2, ROOT, aguardarResultado(), baixarImagem(), buscarObjectInfo(), carregarWorkflow(), construirPrompt(), resolverTodosValores() (+12 more)

### Community 17 - "Analyze and Generate"
Cohesion: 0.16
Nodes (19): analyzeReference(), arg(), buildScriptFromFacts(), EDGE_TTS, EFFECT_CLI, extractColorTempo(), FFMPEG, FFPROBE (+11 more)

### Community 18 - "Motion Card Builder"
Cohesion: 0.22
Nodes (20): arrangeLayer(), backingLinesForScene(), backingSourceForScene(), buildCaptionA(), buildCaptionB(), buildLayerStack(), buildLowerThird(), buildMotionOverMedia() (+12 more)

### Community 19 - "Bíblia de estilo — *O Parque dos Pets* (Frida & Luna, recriado)"
Cohesion: 0.06
Nodes (34): 0. Identidade — o que estamos a fazer e o que está proibido, 10. Nomenclatura, 1. O que foi medido na referência, 2.1 As seis cores fixas, 2.2 Três acentos de identidade (área total ≤ 8 % do quadro), 2.3 As 11 cenas distinguem-se por *luz*, não por matiz, 2.4 Proporções de área por quadro, 2.5 Regra do contorno (+26 more)

### Community 20 - "Bot Chain and Audio v1"
Cohesion: 0.26
Nodes (16): VoiceCraft (servidor TTS local :8090), Bot 4 — Especialista-Áudio e Avatar, AGENTS.md — mapa vivo do ecossistema Video Orchestrator, Relatório técnico Áudio e Avatar v1 (backup 106,632 s, 2026-11-16), Mix de prévia v1 — 106,6 s, -16,8 LUFS, Narração v1 — 106,62 s, voz FranciscaNeural ritmo -5%, tools/gerar_narracao_quatro_estacoes.py, tools/gerar_sfx_trilha_quatro_estacoes.py (+8 more)

### Community 21 - "Card Config"
Cohesion: 0.18
Nodes (14): applyOverride(), CARD_ENGINES, DEFAULTS, flatKey(), loadConfig(), RAW_CONFIG, rawConfig(), redactConfig() (+6 more)

### Community 22 - "Script Generation"
Cohesion: 0.12
Nodes (17): child, arg(), attempt(), env, ENV_PATH, finish(), FORMAT_PATH, freeIds (+9 more)

### Community 23 - "Card Scaffolding"
Cohesion: 0.31
Nodes (17): ARCHETYPE_NAMES, archetypeFor(), ARCHETYPES, cmds(), fullGraphic(), mono(), neonGrid(), neonRect() (+9 more)

### Community 24 - "visuals.mjs"
Cohesion: 0.10
Nodes (29): comfyFree(), comfyImage(), comfyStatus(), comfyVideo(), download(), queue(), waitResult(), blenderCard() (+21 more)

### Community 25 - "Program Reference and Integrations"
Cohesion: 0.12
Nodes (18): fs, path, run(), shortMenu(), generateAsset(), main(), generateAsset(), main() (+10 more)

### Community 26 - "Luninha e Fridoca Story"
Cohesion: 0.26
Nodes (12): PRESENTERS, Apresentadoras Frida (bulldog) e Luna (dachshund), ffmpeg concat list — Luninha e Fridóca (10 cenas + silêncios alternados), Catálogo de avatares cartoon 2D (Quatro Estações), Avatar Buldogue inglês (id buldogue-ingles, padrão atual), Avatar Menina de cabelo escuro (id menina-cabelo-escuro), Avatar Menino de cabelo loiro (id menino-cabelo-loiro), Avatar Salsicha marrom (id salsicha-marrom) (+4 more)

### Community 27 - "Blender Scene Scripts"
Cohesion: 0.19
Nodes (6): extract_frame(), main(), get_scene_params(), setup_scene(), is_blank(), main()

### Community 28 - "ref_node_fs"
Cohesion: 0.09
Nodes (19): hashText(), narrationCachePath(), narrationFingerprint(), readNarrationCache(), VOICE_FIELDS, writeNarrationCache(), CLI, correr() (+11 more)

### Community 29 - "Runtime Detection"
Cohesion: 0.19
Nodes (13): detectVRAM(), findFfmpeg(), httpGet(), httpPost(), pythonEnv(), server(), fetchBroll(), findLivePortraitOutput() (+5 more)

### Community 30 - "Fresh Channel Finder"
Cohesion: 0.12
Nodes (12): candidates, confirmed, DAYS, floor, MIN_VIEWS, OUT, pick, QUERIES (+4 more)

### Community 31 - "expressoes.py"
Cohesion: 0.07
Nodes (16): contact_sheet(), _down2(), eye_coracao(), eye_espiral(), _font(), heart_pts(), main(), mouth_aberta() (+8 more)

### Community 32 - "Train Scene React Code"
Cohesion: 0.17
Nodes (17): Especificação Técnica — As Quatro Estações (revisão 2, Curador-Prompts → Diretor-Arte), Direção de luz: interior tungstênio 2700K fixo × exterior variável por estação, Shader dissolucaoEstacoes — dissolve em bandas horizontais alinhadas ao horizonte, Transições de estação T1–T4 (frames 604/1323/2042/2749), deslizarPassagem(), EstacaoTrem, montarParticulas(), PaletaExterior (+9 more)

### Community 33 - "Smart Render CLI"
Cohesion: 0.26
Nodes (13): ARGS, CLI_PATH, defaultOutPath(), __dirname, __filename, listCompositionsFromProject(), main(), PROJECT_PATH (+5 more)

### Community 34 - "Layout Tests"
Cohesion: 0.42
Nodes (8): layoutMetrics(), sceneLayout(), baseCfg, textAnchorY(), buildMotionCards(), buildSceneClips(), sceneFilter(), topEngineOf()

### Community 35 - "Preflight Checks"
Cohesion: 0.26
Nodes (10): DRIVERS_GENERICOS, formatPreflight(), resolvePath(), runPreflight(), speakerOf(), templatesDoScript(), ensureSeamlessLoop(), probeDuration() (+2 more)

### Community 36 - "Studio Catalog"
Cohesion: 0.19
Nodes (13): apps, artDir, byCat, categoryOf(), exists(), frontmatter(), modules, OM (+5 more)

### Community 37 - "Channel Scanner"
Cohesion: 0.18
Nodes (11): LIMIT, main(), MAX_CHANNELS, OUT, parseJsonLines(), pool(), run(), SAMPLES (+3 more)

### Community 38 - "EffectCraft Render"
Cohesion: 0.26
Nodes (14): selectedTangentsSmoothed (suavização de tangentes), ARTCRAFT_CLI, cli(), defaultOutPathForComp(), __dirname, __filename, main(), parseArgs() (+6 more)

### Community 39 - "Studio Panel Builder"
Cohesion: 0.23
Nodes (12): appCard(), byCat, cat, catBlock(), cats, compChips, esc(), ICON (+4 more)

### Community 40 - "Channel Scoring Pipeline"
Cohesion: 0.21
Nodes (9): loadSamples(), main(), OUT, pipelineFor(), SAMPLES, SCAN, scoreChannel(), THRESHOLD (+1 more)

### Community 41 - "Roteiro to Scene Builder"
Cohesion: 0.30
Nodes (11): buildScenes(), firstSentence(), headlineFor(), main(), plain(), readRoteiro(), splitBlocks(), splitLong() (+3 more)

### Community 42 - "Mascot SVG Artwork"
Cohesion: 0.23
Nodes (10): Mascot Avatar — Flat Four Seasons (SVG artwork), Mouth Group (boca), Right Eye Group (olho-direito), Left Eye Group (olho-esquerdo), Flat Seasonal Palette (cream #F4E9D8, teal #2F6F6A, mustard #D9A441, rust #B5532E, skin #E8B4A0, dark #2B2118), Mascot Costume: round rust hat with teal band and mustard scarf, 10 inserts de detalhe (I1–I10, 34% do tempo sobre o master), Paleta Grand Budapest (rosa empoeirado #E3A9A6, mostarda #D9A441, esmeralda) (+2 more)

### Community 43 - "CLI Helper Wrapper"
Cohesion: 0.18
Nodes (13): Explainer effects kit (9 composições EffectCraft), Kit de efeitos do explainer (E1–E9), CLI_PATH, __dirname, explain(), __filename, { fileURLToPath }, { join, dirname } (+5 more)

### Community 44 - "Pipeline Orchestrator"
Cohesion: 0.31
Nodes (3): raw, CraftPipeline, main()

### Community 45 - "numpy"
Cohesion: 0.14
Nodes (10): compor(), main(), pose_normalizada(), alpha_do_creme(), contact_sheet(), descontaminar(), fatiar(), main() (+2 more)

### Community 46 - "gerar_fundos.py"
Cohesion: 0.17
Nodes (14): aplicar_temperatura(), construir_workflow(), descarregar(), ErroComfy, esperar(), gerar(), ler_manifest(), libertar_vram() (+6 more)

### Community 47 - "Studio CLI"
Cohesion: 0.22
Nodes (7): all(), cat, catalog, groups, HERE, items(), CATALOG

### Community 48 - "Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)"
Cohesion: 0.09
Nodes (21): 0. Resumo executivo, 10. Limites que ficam escritos, 11. Ficheiros desta entrega, 1. Porque não se usa avatar neuronal, 2. Janela de análise: 40 ms, passo 1 frame, 3. Normalização e limiares (valores medidos, não inventados), 4. Quantos níveis: 3 (não 4), 5.1 Estrutura de sprite exigida ao Artista-desenho (+13 more)

### Community 49 - "Audio Artifacts v1 and v2"
Cohesion: 0.36
Nodes (8): tools/gerar_tempos_narracao.py, tempos-narracao.json v1 — 106,632 s, 3.199 frames @30fps, Narração v2 — 163,415 s = 4.902 frames, voz FranciscaNeural ritmo -38%, tools/extrair_tempos_narracao_quatro_estacoes.py, tempos-narracao.json v2 — 4.902 frames @30fps, transcrição faster-whisper small int8, Beat sheet frame-exato (3.199 frames medidos no áudio), Janelas de fala estimadas por caracteres (cenas 01–05), TIMELINE As Quatro Estações (gerado, 169,868 s / 5097 frames @30fps)

### Community 51 - "Remotion Motion Render"
Cohesion: 0.39
Nodes (6): t0, REMOTION_CLI, REMOTION_COMPOSER, remotionAvailable(), renderKineticCard(), runNode()

### Community 52 - "Factory Contract Principles"
Cohesion: 0.27
Nodes (9): Uma frase com palavra em laranja (textStyle.mode caption), Layout por plano (sceneLayout, splitRatio, textSide), Referência medida ref5 (yccXYW5liLE, ref1080.mp4), Anatomia medida: 33 planos, 31,9 cortes/min, divisão 17–79%, Layout dividido topo/baixo (formato do nicho), 9 composições EffectCraft E1–E9 (whiteboard, caption, neon grid, ui panel, split, …), Página de resultado — Explainer effects (9 composições), Short de referência yccXYW5liLE (60,23 s, 33 planos, ritmo 1,83 s/plano, acento #FF6A00) (+1 more)

### Community 53 - "Factory Map Docs"
Cohesion: 0.28
Nodes (8): Radar diário de canais (tarefa ArtCraftRadar 09:00), CONTRATO DO PROJETO — Fábrica de Canais, Manual Visual — Mapa da Fábrica de Canais, Caminho do vídeo em 10 passos (radar → publicar), selectAvatarEngine + detectVRAM (fallback por VRAM), ArtCraft Dark Channel Clone System (documentação técnica), yt-daemon HTTP :8799 (/clone /settings /queue), Dashboard visual (337 canais, thumbs base64)

### Community 54 - "Channel Classifier Core"
Cohesion: 0.29
Nodes (7): Classificação Dark em taxonomy.json (flags, não nicho), EMPTY_AI, YT_CATEGORY_TO_NICHE, classifier, TAXONOMY_PATH, classifier, Classificação Dark v3 (duas camadas: nicho + IA)

### Community 55 - "Lint Scope Analysis"
Cohesion: 0.43
Nodes (5): maskJs(), topLevelFunctions(), declaredIn(), identifiers(), KEYWORDS

### Community 56 - "OpenMontage Catalog"
Cohesion: 0.29
Nodes (7): compositions, pipelines, OpenMontage: 98 skills utilizáveis (§3.2), 13 pipelines do OpenMontage, 13 composições Remotion catalogadas, OpenMontage (produção agêntica de vídeo, AGPLv3), Teste Remotion (TalkingHead com Frida, 90 frames)

### Community 57 - "VoiceCraft Status and LLM Rules"
Cohesion: 0.29
Nodes (6): pad(), rows, DEFAULT_CHAIN, isFree(), Manual Animado (deck HTML de 9 páginas da Fábrica), Estado 2026-11-15 (yryryr, Wav2Lip, loop do avatar, telemetria)

### Community 58 - "World Ranking Export"
Cohesion: 0.36
Nodes (6): cloneability(), fetchWiki(), main(), OUT, SAMPLE, stripTags()

### Community 59 - "build_erase_mask"
Cohesion: 0.13
Nodes (8): build_alpha(), build_erase_mask(), _components(), inpaint(), load_char(), _lum(), _pinkish(), _poly_mask()

### Community 61 - "Six-Bot Production Chain"
Cohesion: 0.57
Nodes (7): Cadeia de produção com 6 bots (sala OpenBot), Bot 1 — Curador-Prompts, Bot 5 — Dev-3D-Craft, Bot 6 — Dev-Motion-QA, Bot 2 — Diretor-Arte, Bot 3 — Especialista-ComfyUI, Ficha de personagens — Luna e Frida no Espaço Sideral

### Community 62 - "Clone Engine Notes"
Cohesion: 0.20
Nodes (7): Contrato de Direção (active_speaker / frida_state / luna_state), Cache de narração por fingerprint (narrationFingerprint), yt-ref-anatomy.mjs (medição de referência sem dependências), yt-clone-build.mjs (motor de produção do clone), Corrupção de yt-clone-build.mjs (3 harnesses, 13-11-2026), Medidor de formato (yt-format-profile.mjs, exemplo Jazzghost), CraftVideos — workspace do pipeline de clonagem

### Community 64 - "O Parque dos Pets — beat sheet"
Cohesion: 0.15
Nodes (12): abertura —   16.8s →   27.6s ( 10.8s), bolinhas —  111.8s →  125.7s ( 13.8s), carrossel —   94.2s →  110.8s ( 16.6s), espelhos —  141.6s →  156.1s ( 14.5s), final —  169.8s →  190.4s ( 20.6s), hook —    3.9s →   15.3s ( 11.5s), montanha —   44.2s →   75.9s ( 31.7s), moral —  157.0s →  168.7s ( 11.7s) (+4 more)

### Community 65 - "build_sequence_plan.py"
Cohesion: 0.23
Nodes (6): agrupar_cenas(), carregar_beats(), construir_plano(), frame_de(), main(), validar()

### Community 66 - "Gates de qualidade Q1–Q8"
Cohesion: 0.40
Nodes (4): voice, Gates de qualidade Q1–Q8, VoiceCraft: cascata de 10 provedores TTS, Piper TTS (voz offline gratuita do OpenMontage)

### Community 67 - "qbez"
Cohesion: 0.17
Nodes (6): eye_fechado(), mouth_franzida(), mouth_lingua(), mouth_sorriso(), mouth_sorriso_grande(), qbez()

### Community 68 - "Classifier Functions"
Cohesion: 0.70
Nodes (5): createClassifier(), applyOverride(), classifyChannel(), scoreAi(), verdictOf()

### Community 70 - "Research Runner"
Cohesion: 0.60
Nodes (4): main(), parseJsonLines(), run(), SOURCES

### Community 71 - "Master Studio Skills"
Cohesion: 0.67
Nodes (3): OUT, Master Studio (painel gerado de studio.catalog.json), 92 skills por área (Master Studio)

### Community 73 - "gen_edit.py"
Cohesion: 0.29
Nodes (4): main(), post(), attempt(), main()

### Community 74 - "TAREFAS DO TIME — historinha "Luna e Frida no Espaço Sideral""
Cohesion: 0.18
Nodes (10): 1. Artista-desenho — ESTAVA PARADO, AGORA TRABALHANDO (gargalo desbloqueado), 2. Curador-Prompts, 3. Especialista-ComfyUI, 4. Especialista-Audio-Avatar, 5. Dev-3D-Craft — estado real corrigido, 6. Dev-Motion-QA, 7. Organizador, Estado real verificado em disco (fatos, não achismos) (+2 more)

### Community 75 - "_iris"
Cohesion: 0.18
Nodes (6): eye_aberto(), eye_lado(), eye_meio_fechado(), _fill(), eye_muito_aberto(), _iris()

### Community 76 - "O Parque dos Pets — especificação de planos"
Cohesion: 0.18
Nodes (10): Fidelidade ao original (o que se copia e o que não se copia), Legenda, Notas de execução, O Parque dos Pets — especificação de planos, O que este documento não decide, Os 44 planos, Planos hero (9), Referências usadas (só padrão, nunca fotorealismo) (+2 more)

### Community 77 - "manifest.json"
Cohesion: 0.20
Nodes (9): falhas, fundos, gerador, projeto, resolucao_padrao, altura, largura, servidor (+1 more)

### Community 78 - "render"
Cohesion: 0.20
Nodes (5): apply_green(), draw_brow(), _ellipse_mask(), _filter_line(), render()

### Community 80 - "DIREÇÃO DE ARTE — historinha "Luna e Frida no Espaço Sideral""
Cohesion: 0.25
Nodes (7): 1. Estilo final — FECHADO, 2. Nomes, 3. FPS / frames / resolução, 4. Paleta (proposta, sujeita à lousa crítica), 5. Critério de aceite — lousa crítica (obrigatório), 6. O que cada um faz agora (distribuição de demandas), DIREÇÃO DE ARTE — historinha "Luna e Frida no Espaço Sideral"

### Community 81 - "desenhar_cartao"
Cohesion: 0.25
Nodes (4): _coracao(), desenhar_cartao(), _poligono_rasgado(), random_between()

### Community 82 - "gerar-driving-templates-f3.py"
Cohesion: 0.38
Nodes (3): BASE_DO_TEMPLATE, PASTA_DRIVERS, main()

### Community 83 - "ref_remotion"
Cohesion: 0.38
Nodes (4): Avatar Wav2Lip v1 — 600x704, 25fps, 15,0 s, placeholder s0.jpg, Avatar Wav2Lip cena-05 v2 — 600×704, 25fps, 22,84 s (rosto placeholder), Avatar Mascote Quatro Estações (chapéu terracota, cachecol mostarda, passarinho), Avatar estilizado flat 2D (SVG vetorial animado por código) — Quatro Estações

### Community 84 - "Prompts e método das grelhas de expressões (Frida & Luna)"
Cohesion: 0.29
Nodes (6): Armadilhas observadas na geração, Bloco de estilo comum (idêntico em todas as chamadas), Como a grelha é realmente produzida, Ordem das 20 expressões (leitura esquerda->direita, cima->baixo), Personagens, Prompts e método das grelhas de expressões (Frida & Luna)

### Community 85 - "Personagens — ficha técnica (aprovada 2026-11-17)"
Cohesion: 0.29
Nodes (6): Decisão do utilizador, Ficheiros canónicos, Identidade visual fixa, O que nenhum agente pode fazer, Personagens — ficha técnica (aprovada 2026-11-17), Proporção (regra dura)

### Community 86 - "REFERÊNCIA EXCLUSIVA — canal @FridaeLuna (172 imagens do canal)"
Cohesion: 0.33
Nodes (5): Arquivado (NÃO usar como referência), Como baixar mais (o canal tem 1000+ imagens), O que as imagens do canal mostram (o padrão a seguir), O que é a referência, REFERÊNCIA EXCLUSIVA — canal @FridaeLuna (172 imagens do canal)

### Community 87 - "KIT DE REFERÊNCIA — Luna e Frida (padrão "Pixel Disney" do vídeo original)"
Cohesion: 0.33
Nodes (5): 1. Referência direta do vídeo original (frames 1280x720), 2. Folhas de referência geradas no ComfyUI local (SD 1.5, gratuito), 3. Como usar no Blender (pipeline acordado), 4. Regras que continuam valendo, KIT DE REFERÊNCIA — Luna e Frida (padrão "Pixel Disney" do vídeo original)

### Community 88 - "Agentes — Frida & Luna (recriados do OpenBot)"
Cohesion: 0.33
Nodes (5): Agentes — Frida & Luna (recriados do OpenBot), Decisões herdadas que continuam válidas, Elenco, Estado por agente (herdado do canal antigo), Regras de ouro (válidas para todos)

### Community 89 - "Stems — O Parque dos Pets"
Cohesion: 0.40
Nodes (4): Ficheiros, Limites (a declarar a quem montar a timeline), Qualidade medida (44 janelas de fala de `ref/words.json`), Stems — O Parque dos Pets

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
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md — mapa vivo do ecossistema Video Orchestrator` connect `Bot Chain and Audio v1` to `ArtCraft Dispatcher CLI`, `Train Scene React Code`, `Audio Artifacts v1 and v2`, `ref_remotion`, `OpenMontage Catalog`, `Six-Bot Production Chain`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Should `ArtCraft Dispatcher CLI` be split into smaller, more focused modules?**
  _Cohesion score 0.07005649717514124 - nodes in this community are weakly interconnected._
- **Why does `===============================================================================…` connect `Python CV/Blender Scripts` to `Avatar Base Generator`, `Runtime Detection`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Should `Channel Collection` be split into smaller, more focused modules?**
  _Cohesion score 0.05357142857142857 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `STOP_MARKS` and `re`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Mix de prévia v2 — 163,415 s, -14,0 LUFS, valsa a -22 dB` and `Gates de qualidade Q1–Q8`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `tempos-narracao.json v2 — 4.902 frames @30fps, transcrição faster-whisper small int8` and `Beat sheet frame-exato (3.199 frames medidos no áudio)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._