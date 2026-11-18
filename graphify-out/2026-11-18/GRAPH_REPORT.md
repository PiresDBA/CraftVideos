# Graph Report - CRAFT  (2026-11-18)

## Corpus Check
- 283 files · ~319,676 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: .cmd 7, .pkl 3, .bat 2)

## Summary
- 2411 nodes · 4671 edges · 133 communities (127 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 250 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f72b27f8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- blender_diorama.py
- yt-clone-build Engine
- ArtCraft Dispatcher CLI
- Channel Collection
- Editorial Direction
- Reference Analysis
- Target Collection
- ref_node_fs
- visuals.mjs
- Bíblia de estilo — *O Parque dos Pets* (Frida & Luna, recriado)
- Research Dashboard
- ASS and SRT Subtitles
- Program Reference and Integrations
- Clone Queue Daemon
- Explainer Effects Kit
- numpy
- Format Profiler
- expressoes.py
- gerar_fundos.py
- numpy
- EDL Beat Geometry
- Channel Classification
- Motion Card Builder
- Avatar Base Generator
- Fresh Channel Finder
- Analyze and Generate
- pathlib
- Luninha e Fridoca Story
- Script Generation
- Card Scaffolding
- Runtime Detection
- Train Scene React Code
- Bot Chain and Audio v1
- fatiar_grelha.py
- Card Config
- Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)
- build_erase_mask
- CLI Helper Wrapper
- Smart Render CLI
- Canvas
- Python CV/Blender Scripts
- Preflight Checks
- Studio Catalog
- Channel Scanner
- gerar_timeline.mjs
- EffectCraft Render
- Cadeia de produção com 6 bots (sala OpenBot)
- espec-planos.md
- Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)
- Studio Panel Builder
- Pipeline Orchestrator
- build_sequence_plan.py
- Channel Scoring Pipeline
- math
- reconstruir_ciclos.py
- Personagens — ficha técnica (aprovada 2026-11-17)
- O Parque dos Pets — beat sheet
- qbez
- TAREFAS DO TIME — historinha "Luna e Frida no Espaço Sideral"
- _iris
- Canvas
- Clone Engine Notes
- Studio CLI
- Factory Contract Principles
- manifest.json
- render
- O Parque dos Pets — especificação de planos
- Factory Map Docs
- Channel Classifier Core
- Lint Scope Analysis
- Layout Tests
- OpenMontage Catalog
- Remotion Motion Render
- VoiceCraft Status and LLM Rules
- World Ranking Export
- DIREÇÃO DE ARTE — historinha "Luna e Frida no Espaço Sideral"
- shutil
- subprocess
- Mascot SVG Artwork
- Episodio.tsx
- Prompts e método das grelhas de expressões (Frida & Luna)
- package.json
- REFERÊNCIA EXCLUSIVA — canal @FridaeLuna (172 imagens do canal)
- KIT DE REFERÊNCIA — Luna e Frida (padrão "Pixel Disney" do vídeo original)
- Classifier Functions
- JS Lint Utilities
- Plano de lip-sync — “O Parque dos Pets” (Frida & Luna) (2)
- validar_ciclo.py
- Stems — O Parque dos Pets
- Master Studio Skills
- json
- expressoes_v3.py
- re
- Prompts — os 13 movimentos em falta (Frida e Luna)
- flow_fetch_proj.py
- submit_flow_prompt
- grab_image
- load_char
- .artcraft/media.mjs
- Canvas
- run_setup_learning
- compilerOptions
- diffuse_fill
- grab_media
- Motor Flow — gerar movimento, baixar, cortar, guardar
- Parte 1 - Piscar (a personagem não pode parecer um robô)
- render
- main
- Processo de produção — vídeo animado a partir de uma fonte
- preparar_publico.mjs
- CONTRATO — Animação Frida & Luna (O Parque dos Petes)
- Entrega do Artista de Desenho — Luna e Frida (2D à mão)
- REGRAS DE RENDER — As Quatro Estações
- B) Regras de representação
- Prompts — 8 expressões da Frida e da Luna
- Prompts — ciclos de movimento da Frida (a nossa, creme com pérolas)
- FundosVivos.tsx
- yt-audit.mjs
- apply_green
- draw_iris
- Micro-movimentos obrigatórios — regra do motor
- Desenhos da historinha — Luna e Frida (2D à mão)
- AGENTES.md
- Prompt — ciclo de marcha v3 (perfil puro, duas pernas)
- _flow_target_url
- O Parque dos Pets — Remotion
- heart_pts
- Prompt — ciclo de marcha (v2, frame a frame)
- Personagens — ficha técnica (aprovada 2026-11-17)
- star_pts
- Folha de piscar — Luna (e Frida, se precisar)

## God Nodes (most connected - your core abstractions)
1. `main()` - 32 edges
2. `run()` - 21 edges
3. `build_variant()` - 20 edges
4. `main()` - 19 edges
5. `grab_image()` - 18 edges
6. `Prompts — os 13 movimentos em falta (Frida e Luna)` - 18 edges
7. `Especificação Técnica — As Quatro Estações (revisão 2, Curador-Prompts → Diretor-Arte)` - 18 edges
8. `buildNarrationForLanguage()` - 17 edges
9. `writeSceneASS()` - 15 edges
10. `buildSceneClips()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Gates de qualidade Q1–Q8` --semantically_similar_to--> `Mix de prévia v2 — 163,415 s, -14,0 LUFS, valsa a -22 dB`  [AMBIGUOUS] [semantically similar]
  CONTRATO_FABRICA.md → video-orquestracao/public/assets/audio/RELATORIO-tecnico-audio-avatar.md
- `Uma frase com palavra em laranja (textStyle.mode caption)` --references--> `writeSceneASS()`  [INFERRED]
  AUDITORIA_CLONE.md → .artcraft/clone/lib/ass.mjs
- `Layout dividido topo/baixo (formato do nicho)` --conceptually_related_to--> `sceneLayout()`  [INFERRED]
  CONTRATO_FABRICA.md → .artcraft/clone/lib/layout.mjs
- `Correções de pipeline: buildMotionCards em modo caption, campo Effect em writeSceneASS, fontsdir no filtro subtitles` --references--> `buildMotionCards()`  [EXTRACTED]
  work/explainer-study/preview/index.html → .artcraft/yt-clone-build.mjs
- `Apresentadoras Frida (bulldog) e Luna (dachshund)` --references--> `PRESENTERS`  [INFERRED]
  CONTRATO_FABRICA.md → .artcraft/yt-ref-analyze.mjs

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

## Communities (133 total, 6 thin omitted)

### Community 0 - "blender_diorama.py"
Cohesion: 0.06
Nodes (40): blenderCard(), add_area(), animate(), assign(), bevel(), box(), build_backdrop(), build_books() (+32 more)

### Community 1 - "yt-clone-build Engine"
Cohesion: 0.05
Nodes (57): run(), ARG_ERRORS, argAll(), buildCards(), buildNarrationForLanguage(), carregarOpus5(), CC, CONFIG_PATH (+49 more)

### Community 2 - "ArtCraft Dispatcher CLI"
Cohesion: 0.07
Nodes (56): artcraft.mjs shell dispatcher, artcraft-suite (skill router), artcraft MCP gateway (mcp-gateway.mjs, 4 tools), APP_ALIASES, appPaths(), APPS, cmdApps(), cmdCli() (+48 more)

### Community 3 - "Channel Collection"
Cohesion: 0.05
Nodes (42): DARK_QUERIES, DAYS, daysSince(), DEFAULT_QUERIES, EXTRACT, isShortsDuration(), looksLikeShorts(), main() (+34 more)

### Community 4 - "Editorial Direction"
Cohesion: 0.07
Nodes (46): ACCOES_CABECA, ACOES_FALANDO, ALVOS_OLHAR, aplicarDirecaoAoPlano(), aplicarDirecaoEditorial(), CATALOGO_DRIVERS, EMOCOES, enquadramentoDoBeat() (+38 more)

### Community 5 - "Reference Analysis"
Cohesion: 0.05
Nodes (63): ACCENT, acquire(), ANALYSIS, ANATOMY, anatomy(), arg(), buildPlan(), buildScript() (+55 more)

### Community 6 - "Target Collection"
Cohesion: 0.08
Nodes (33): addVideo(), inferAudience(), isShortVideo(), listRunFiles(), main(), normCategory(), OUT_DIR, OUT_FILE (+25 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.10
Nodes (17): hashText(), narrationCachePath(), narrationFingerprint(), readNarrationCache(), VOICE_FIELDS, writeNarrationCache(), CLI, correr() (+9 more)

### Community 8 - "visuals.mjs"
Cohesion: 0.11
Nodes (25): comfyFree(), comfyImage(), comfyStatus(), comfyVideo(), download(), queue(), waitResult(), dioramaClip() (+17 more)

### Community 9 - "Bíblia de estilo — *O Parque dos Pets* (Frida & Luna, recriado)"
Cohesion: 0.06
Nodes (34): 0. Identidade — o que estamos a fazer e o que está proibido, 10. Nomenclatura, 1. O que foi medido na referência, 2.1 As seis cores fixas, 2.2 Três acentos de identidade (área total ≤ 8 % do quadro), 2.3 As 11 cenas distinguem-se por *luz*, não por matiz, 2.4 Proporções de área por quadro, 2.5 Regra do contorno (+26 more)

### Community 10 - "Research Dashboard"
Cohesion: 0.16
Nodes (14): CloneManager, CONFIG, escapeHtml(), generateCategoryButtons(), generateChannelCards(), generateChannelOptions(), generateHTML(), generateRecentClones() (+6 more)

### Community 11 - "ASS and SRT Subtitles"
Cohesion: 0.18
Nodes (24): assDialogue() — construtor único das linhas Dialogue, Bug do campo Effect em falta no Dialogue ASS, keyWords / keywordsWithFallback (selecção de palavras-chave), assDialogue(), assStyleHeader(), assTime(), buildASS(), buildSRT() (+16 more)

### Community 12 - "Program Reference and Integrations"
Cohesion: 0.11
Nodes (20): fs, path, run(), shortMenu(), generateAsset(), main(), generateAsset(), main() (+12 more)

### Community 13 - "Clone Queue Daemon"
Cohesion: 0.11
Nodes (31): ALL_PHASES, appendQueue(), arg(), AUTO_EXECUTE, buildCloneArgs(), cloneJobPublic(), cloneJobs, DASH (+23 more)

### Community 14 - "Explainer Effects Kit"
Cohesion: 0.19
Nodes (31): advance(), argv, BUILD, buildCaptions(), buildNeonGrid(), buildPanelStack(), buildPresenterZone(), buildSplitBand() (+23 more)

### Community 15 - "numpy"
Cohesion: 0.06
Nodes (22): assinatura(), distancia(), fontes(), main(), componentes(), main(), sem_fundo(), main() (+14 more)

### Community 16 - "Format Profiler"
Cohesion: 0.18
Nodes (15): detectCuts(), FFMPEG, FFPROBE, main(), MAX_FRAMES, OPENMONTAGE, OUT, palette() (+7 more)

### Community 17 - "expressoes.py"
Cohesion: 0.12
Nodes (9): contact_sheet(), eye_espiral(), _font(), main(), mouth_aberta(), mouth_ondulada(), x_lagrima(), x_suor() (+1 more)

### Community 18 - "gerar_fundos.py"
Cohesion: 0.05
Nodes (33): aplicar_borda_papel(), aplicar_temperatura(), carregar_imagem(), construir_workflow(), _coracao(), descarregar(), desenhar_cartao(), desenhar_esboco() (+25 more)

### Community 19 - "numpy"
Cohesion: 0.11
Nodes (13): compor(), main(), pose_normalizada(), alpha_do_creme(), contact_sheet(), descontaminar(), fatiar(), main() (+5 more)

### Community 20 - "EDL Beat Geometry"
Cohesion: 0.12
Nodes (21): assignParents(), beatGeometry(), capBeats(), CHECK, CONFIG_FILE, foldShots(), framingFor(), FRAMINGS (+13 more)

### Community 21 - "Channel Classification"
Cohesion: 0.09
Nodes (18): cadences, CHANNELS, durations, HERE, LANG, [nA, nB], niches, OUT_DIR (+10 more)

### Community 22 - "Motion Card Builder"
Cohesion: 0.22
Nodes (20): arrangeLayer(), backingLinesForScene(), backingSourceForScene(), buildCaptionA(), buildCaptionB(), buildLayerStack(), buildLowerThird(), buildMotionOverMedia() (+12 more)

### Community 23 - "Avatar Base Generator"
Cohesion: 0.18
Nodes (20): BASES_V2, ROOT, aguardarResultado(), baixarImagem(), buscarObjectInfo(), carregarWorkflow(), construirPrompt(), resolverTodosValores() (+12 more)

### Community 24 - "Fresh Channel Finder"
Cohesion: 0.12
Nodes (12): candidates, confirmed, DAYS, floor, MIN_VIEWS, OUT, pick, QUERIES (+4 more)

### Community 25 - "Analyze and Generate"
Cohesion: 0.16
Nodes (19): analyzeReference(), arg(), buildScriptFromFacts(), EDGE_TTS, EFFECT_CLI, extractColorTempo(), FFMPEG, FFPROBE (+11 more)

### Community 26 - "pathlib"
Cohesion: 0.05
Nodes (14): caixa(), main(), render_char(), render(), extract_frame(), main(), contactos(), main() (+6 more)

### Community 27 - "Luninha e Fridoca Story"
Cohesion: 0.15
Nodes (17): Contrato de Direção (active_speaker / frida_state / luna_state), PRESENTERS, Apresentadoras Frida (bulldog) e Luna (dachshund), CraftVideos — workspace do pipeline de clonagem, ffmpeg concat list — Luninha e Fridóca (10 cenas + silêncios alternados), Avatar Wav2Lip cena-05 v2 — 600×704, 25fps, 22,84 s (rosto placeholder), Catálogo de avatares cartoon 2D (Quatro Estações), Avatar Buldogue inglês (id buldogue-ingles, padrão atual) (+9 more)

### Community 28 - "Script Generation"
Cohesion: 0.12
Nodes (17): child, arg(), attempt(), env, ENV_PATH, finish(), FORMAT_PATH, freeIds (+9 more)

### Community 29 - "Card Scaffolding"
Cohesion: 0.31
Nodes (17): ARCHETYPE_NAMES, archetypeFor(), ARCHETYPES, cmds(), fullGraphic(), mono(), neonGrid(), neonRect() (+9 more)

### Community 30 - "Runtime Detection"
Cohesion: 0.12
Nodes (18): detectVRAM(), findFfmpeg(), httpGet(), httpPost(), killTree(), pythonEnv(), server(), fetchBroll() (+10 more)

### Community 31 - "Train Scene React Code"
Cohesion: 0.17
Nodes (18): Especificação Técnica — As Quatro Estações (revisão 2, Curador-Prompts → Diretor-Arte), Direção de luz: interior tungstênio 2700K fixo × exterior variável por estação, Shader dissolucaoEstacoes — dissolve em bandas horizontais alinhadas ao horizonte, Transições de estação T1–T4 (frames 604/1323/2042/2749), CORES_VAGAO, deslizarPassagem(), EstacaoTrem, montarParticulas() (+10 more)

### Community 32 - "Bot Chain and Audio v1"
Cohesion: 0.15
Nodes (28): VoiceCraft (servidor TTS local :8090), voice, VoiceCraft: cascata de 10 provedores TTS, Piper TTS (voz offline gratuita do OpenMontage), Bot 4 — Especialista-Áudio e Avatar, AGENTS.md — mapa vivo do ecossistema Video Orchestrator, Relatório técnico Áudio e Avatar v1 (backup 106,632 s, 2026-11-16), Avatar Wav2Lip v1 — 600x704, 25fps, 15,0 s, placeholder s0.jpg (+20 more)

### Community 33 - "fatiar_grelha.py"
Cohesion: 0.06
Nodes (9): fatiar(), main(), sem_fundo(), clean(), is_background(), main(), sem_fundo(), main() (+1 more)

### Community 34 - "Card Config"
Cohesion: 0.17
Nodes (14): applyOverride(), CARD_ENGINES, DEFAULTS, flatKey(), loadConfig(), RAW_CONFIG, rawConfig(), redactConfig() (+6 more)

### Community 35 - "Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)"
Cohesion: 0.12
Nodes (16): 0. Resumo executivo, 10. Limites que ficam escritos, 11. Ficheiros desta entrega, 1. Porque não se usa avatar neuronal, 2. Janela de análise: 40 ms, passo 1 frame, 3. Normalização e limiares (valores medidos, não inventados), 4. Quantos níveis: 3 (não 4), 6. Quem fala (vem de `beats.json`, `speaker`) (+8 more)

### Community 36 - "build_erase_mask"
Cohesion: 0.13
Nodes (8): build_alpha(), build_erase_mask(), _components(), inpaint(), load_char(), _lum(), _pinkish(), _poly_mask()

### Community 37 - "CLI Helper Wrapper"
Cohesion: 0.18
Nodes (13): Explainer effects kit (9 composições EffectCraft), Kit de efeitos do explainer (E1–E9), CLI_PATH, __dirname, explain(), __filename, { fileURLToPath }, { join, dirname } (+5 more)

### Community 38 - "Smart Render CLI"
Cohesion: 0.26
Nodes (13): ARGS, CLI_PATH, defaultOutPath(), __dirname, __filename, listCompositionsFromProject(), main(), PROJECT_PATH (+5 more)

### Community 40 - "Python CV/Blender Scripts"
Cohesion: 0.33
Nodes (4): carregar_rgb(), correr_pipeline(), main(), preparar_repo()

### Community 41 - "Preflight Checks"
Cohesion: 0.18
Nodes (14): DRIVERS_GENERICOS, formatPreflight(), resolvePath(), runPreflight(), speakerOf(), templatesDoScript(), ensureSeamlessLoop(), probeDuration() (+6 more)

### Community 42 - "Studio Catalog"
Cohesion: 0.19
Nodes (13): apps, artDir, byCat, categoryOf(), exists(), frontmatter(), modules, OM (+5 more)

### Community 43 - "Channel Scanner"
Cohesion: 0.18
Nodes (11): LIMIT, main(), MAX_CHANNELS, OUT, parseJsonLines(), pool(), run(), SAMPLES (+3 more)

### Community 44 - "gerar_timeline.mjs"
Cohesion: 0.07
Nodes (33): ALIAS_MOV, AQUI, avisos, banco, beatsPlano, cenaPorNome, cenasPlano, direcaoArte (+25 more)

### Community 45 - "EffectCraft Render"
Cohesion: 0.26
Nodes (14): selectedTangentsSmoothed (suavização de tangentes), ARTCRAFT_CLI, cli(), defaultOutPathForComp(), __dirname, __filename, main(), parseArgs() (+6 more)

### Community 46 - "Cadeia de produção com 6 bots (sala OpenBot)"
Cohesion: 0.46
Nodes (7): Cadeia de produção com 6 bots (sala OpenBot), Bot 1 — Curador-Prompts, Bot 5 — Dev-3D-Craft, Bot 6 — Dev-Motion-QA, Bot 2 — Diretor-Arte, Bot 3 — Especialista-ComfyUI, Ficha de personagens — Luna e Frida no Espaço Sideral

### Community 47 - "espec-planos.md"
Cohesion: 0.16
Nodes (13): Agente Artista-desenho, Elenco de 7 agentes (Curador-Prompts a Artista-desenho), Agente Curador-Prompts, Agente Dev-3D-Craft, Agente Dev-Motion-QA, Agente Diretor-Arte, Agente Especialista-Áudio e Avatar, Agente Especialista-ComfyUI (+5 more)

### Community 48 - "Plano de lip-sync — “O Parque dos Pets” (Frida & Luna)"
Cohesion: 0.25
Nodes (12): Regras de ouro (8) da cadeia Frida & Luna, Sinal vem de audio/voz.wav (Demucs), contraste 16,6 dB, Histerese ±0,06 e permanência mínima de 2 frames, Janela de análise 40 ms (1 764 amostras), passo 1 frame, Só 5 segmentos / 437 frames (7,4%) têm boca animada, Regra das 451 palavras (força nível ≥1 no miolo da palavra), Método RMS por energia (não Wav2Lip nem LivePortrait), Três níveis de boca (fechada / meia / aberta) (+4 more)

### Community 49 - "Studio Panel Builder"
Cohesion: 0.23
Nodes (12): appCard(), byCat, cat, catBlock(), cats, compChips, esc(), ICON (+4 more)

### Community 50 - "Pipeline Orchestrator"
Cohesion: 0.23
Nodes (5): main(), runBlenderCard(), raw, CraftPipeline, main()

### Community 51 - "build_sequence_plan.py"
Cohesion: 0.23
Nodes (6): agrupar_cenas(), carregar_beats(), construir_plano(), frame_de(), main(), validar()

### Community 52 - "Channel Scoring Pipeline"
Cohesion: 0.21
Nodes (9): loadSamples(), main(), OUT, pipelineFor(), SAMPLES, SCAN, scoreChannel(), THRESHOLD (+1 more)

### Community 53 - "math"
Cohesion: 0.11
Nodes (18): beat_at(), bg_1080(), main(), sprite(), eye_espiral(), carregar(), compor(), main() (+10 more)

### Community 54 - "reconstruir_ciclos.py"
Cohesion: 0.13
Nodes (17): assinatura(), distancia(), main(), continuidade(), corr(), main(), continuidade(), corr() (+9 more)

### Community 55 - "Personagens — ficha técnica (aprovada 2026-11-17)"
Cohesion: 0.48
Nodes (5): As 11 cenas (hook → final), 44 frases com tempos, falante, expressões e acção, Frida — buldogue inglês de pé, colar de pérolas, Luna — salsicha (dachshund) de pé, bandana roxa, Proporção Frida:Luna (1,00 : 0,50)

### Community 56 - "O Parque dos Pets — beat sheet"
Cohesion: 0.17
Nodes (12): abertura —   16.8s →   27.6s ( 10.8s), bolinhas —  111.8s →  125.7s ( 13.8s), carrossel —   94.2s →  110.8s ( 16.6s), espelhos —  141.6s →  156.1s ( 14.5s), final —  169.8s →  190.4s ( 20.6s), hook —    3.9s →   15.3s ( 11.5s), montanha —   44.2s →   75.9s ( 31.7s), moral —  157.0s →  168.7s ( 11.7s) (+4 more)

### Community 57 - "qbez"
Cohesion: 0.17
Nodes (6): eye_fechado(), mouth_franzida(), mouth_lingua(), mouth_sorriso(), mouth_sorriso_grande(), qbez()

### Community 58 - "TAREFAS DO TIME — historinha "Luna e Frida no Espaço Sideral""
Cohesion: 0.18
Nodes (10): 1. Artista-desenho — ESTAVA PARADO, AGORA TRABALHANDO (gargalo desbloqueado), 2. Curador-Prompts, 3. Especialista-ComfyUI, 4. Especialista-Audio-Avatar, 5. Dev-3D-Craft — estado real corrigido, 6. Dev-Motion-QA, 7. Organizador, Estado real verificado em disco (fatos, não achismos) (+2 more)

### Community 59 - "_iris"
Cohesion: 0.18
Nodes (6): eye_aberto(), eye_lado(), eye_meio_fechado(), _fill(), eye_muito_aberto(), _iris()

### Community 60 - "Canvas"
Cohesion: 0.22
Nodes (10): Identidade visual fixa, Banda dos apresentadores em y=771 (0,714 da altura), Ordem obrigatória de 6 camadas (fundo → grão/vinheta), Formato 9:16 com a mesma timeline (5 882 frames), Paleta de seis cores fixas + três acentos, Oito portões de QA (grep useFrame, soma 5 882, paleta, contact sheet, LUFS), Regra do contorno (9/5/7 px, #2A1A12, tremor de mão ±1,5 px), Temperatura de luz por cena (11 valores, curva dia→noite) (+2 more)

### Community 61 - "Clone Engine Notes"
Cohesion: 0.29
Nodes (5): Cache de narração por fingerprint (narrationFingerprint), yt-ref-anatomy.mjs (medição de referência sem dependências), yt-clone-build.mjs (motor de produção do clone), Corrupção de yt-clone-build.mjs (3 harnesses, 13-11-2026), Medidor de formato (yt-format-profile.mjs, exemplo Jazzghost)

### Community 62 - "Studio CLI"
Cohesion: 0.22
Nodes (7): all(), cat, catalog, groups, HERE, items(), CATALOG

### Community 63 - "Factory Contract Principles"
Cohesion: 0.27
Nodes (9): Uma frase com palavra em laranja (textStyle.mode caption), Layout por plano (sceneLayout, splitRatio, textSide), Referência medida ref5 (yccXYW5liLE, ref1080.mp4), Anatomia medida: 33 planos, 31,9 cortes/min, divisão 17–79%, Layout dividido topo/baixo (formato do nicho), 9 composições EffectCraft E1–E9 (whiteboard, caption, neon grid, ui panel, split, …), Página de resultado — Explainer effects (9 composições), Short de referência yccXYW5liLE (60,23 s, 33 planos, ritmo 1,83 s/plano, acento #FF6A00) (+1 more)

### Community 64 - "manifest.json"
Cohesion: 0.20
Nodes (9): falhas, fundos, gerador, projeto, resolucao_padrao, altura, largura, servidor (+1 more)

### Community 65 - "render"
Cohesion: 0.20
Nodes (5): apply_green(), draw_brow(), _ellipse_mask(), _filter_line(), render()

### Community 66 - "O Parque dos Pets — especificação de planos"
Cohesion: 0.20
Nodes (10): Fidelidade ao original (o que se copia e o que não se copia), Legenda, Notas de execução, O Parque dos Pets — especificação de planos, O que este documento não decide, Os 44 planos, Planos hero (9), Referências usadas (só padrão, nunca fotorealismo) (+2 more)

### Community 67 - "Factory Map Docs"
Cohesion: 0.32
Nodes (7): Radar diário de canais (tarefa ArtCraftRadar 09:00), CONTRATO DO PROJETO — Fábrica de Canais, Manual Visual — Mapa da Fábrica de Canais, Caminho do vídeo em 10 passos (radar → publicar), ArtCraft Dark Channel Clone System (documentação técnica), yt-daemon HTTP :8799 (/clone /settings /queue), Dashboard visual (337 canais, thumbs base64)

### Community 68 - "Channel Classifier Core"
Cohesion: 0.29
Nodes (7): Classificação Dark em taxonomy.json (flags, não nicho), EMPTY_AI, YT_CATEGORY_TO_NICHE, classifier, TAXONOMY_PATH, classifier, Classificação Dark v3 (duas camadas: nicho + IA)

### Community 69 - "Lint Scope Analysis"
Cohesion: 0.43
Nodes (5): maskJs(), topLevelFunctions(), declaredIn(), identifiers(), KEYWORDS

### Community 70 - "Layout Tests"
Cohesion: 0.35
Nodes (10): layoutMetrics(), sceneLayout(), baseCfg, textAnchorY(), sceneKicker(), buildMotionCards(), buildRemotionCards(), buildSceneClips() (+2 more)

### Community 71 - "OpenMontage Catalog"
Cohesion: 0.29
Nodes (7): compositions, pipelines, OpenMontage: 98 skills utilizáveis (§3.2), 13 pipelines do OpenMontage, 13 composições Remotion catalogadas, OpenMontage (produção agêntica de vídeo, AGPLv3), Teste Remotion (TalkingHead com Frida, 90 frames)

### Community 72 - "Remotion Motion Render"
Cohesion: 0.39
Nodes (6): t0, REMOTION_CLI, REMOTION_COMPOSER, remotionAvailable(), renderKineticCard(), runNode()

### Community 73 - "VoiceCraft Status and LLM Rules"
Cohesion: 0.29
Nodes (6): pad(), rows, DEFAULT_CHAIN, isFree(), Manual Animado (deck HTML de 9 páginas da Fábrica), Estado 2026-11-15 (yryryr, Wav2Lip, loop do avatar, telemetria)

### Community 74 - "World Ranking Export"
Cohesion: 0.36
Nodes (6): cloneability(), fetchWiki(), main(), OUT, SAMPLE, stripTags()

### Community 75 - "DIREÇÃO DE ARTE — historinha "Luna e Frida no Espaço Sideral""
Cohesion: 0.25
Nodes (7): 1. Estilo final — FECHADO, 2. Nomes, 3. FPS / frames / resolução, 4. Paleta (proposta, sujeita à lousa crítica), 5. Critério de aceite — lousa crítica (obrigatório), 6. O que cada um faz agora (distribuição de demandas), DIREÇÃO DE ARTE — historinha "Luna e Frida no Espaço Sideral"

### Community 76 - "shutil"
Cohesion: 0.11
Nodes (12): avaliar(), main(), corrigir(), largura(), main(), aplicar(), bbox(), main() (+4 more)

### Community 77 - "subprocess"
Cohesion: 0.10
Nodes (16): BASE_DO_TEMPLATE, PASTA_DRIVERS, main(), main(), ler_png(), main(), is_blank(), main() (+8 more)

### Community 78 - "Mascot SVG Artwork"
Cohesion: 0.25
Nodes (9): Mascot Avatar — Flat Four Seasons (SVG artwork), Mouth Group (boca), Right Eye Group (olho-direito), Left Eye Group (olho-esquerdo), Flat Seasonal Palette (cream #F4E9D8, teal #2F6F6A, mustard #D9A441, rust #B5532E, skin #E8B4A0, dark #2B2118), Mascot Costume: round rust hat with teal band and mustard scarf, 10 inserts de detalhe (I1–I10, 34% do tempo sobre o master), Paleta Grand Budapest (rosa empoeirado #E3A9A6, mostarda #D9A441, esmeralda) (+1 more)

### Community 79 - "Episodio.tsx"
Cohesion: 0.16
Nodes (20): react, remotion, cameraNoFundo(), clamp01(), Episodio(), Espera(), Legenda(), Personagem() (+12 more)

### Community 80 - "Prompts e método das grelhas de expressões (Frida & Luna)"
Cohesion: 0.29
Nodes (6): Armadilhas observadas na geração, Bloco de estilo comum (idêntico em todas as chamadas), Como a grelha é realmente produzida, Ordem das 20 expressões (leitura esquerda->direita, cima->baixo), Personagens, Prompts e método das grelhas de expressões (Frida & Luna)

### Community 81 - "package.json"
Cohesion: 0.09
Nodes (23): react-dom, @remotion/cli, @types/react, typescript, dependencies, react@18.3.1, react-dom@18.3.1, remotion@4.0.484 (+15 more)

### Community 82 - "REFERÊNCIA EXCLUSIVA — canal @FridaeLuna (172 imagens do canal)"
Cohesion: 0.33
Nodes (5): Arquivado (NÃO usar como referência), Como baixar mais (o canal tem 1000+ imagens), O que as imagens do canal mostram (o padrão a seguir), O que é a referência, REFERÊNCIA EXCLUSIVA — canal @FridaeLuna (172 imagens do canal)

### Community 83 - "KIT DE REFERÊNCIA — Luna e Frida (padrão "Pixel Disney" do vídeo original)"
Cohesion: 0.33
Nodes (5): 1. Referência direta do vídeo original (frames 1280x720), 2. Folhas de referência geradas no ComfyUI local (SD 1.5, gratuito), 3. Como usar no Blender (pipeline acordado), 4. Regras que continuam valendo, KIT DE REFERÊNCIA — Luna e Frida (padrão "Pixel Disney" do vídeo original)

### Community 84 - "Classifier Functions"
Cohesion: 0.70
Nodes (5): createClassifier(), applyOverride(), classifyChannel(), scoreAi(), verdictOf()

### Community 86 - "Plano de lip-sync — “O Parque dos Pets” (Frida & Luna) (2)"
Cohesion: 0.40
Nodes (5): 5.1 Estrutura de sprite exigida ao Artista-desenho, 5.2 Pose → tratamento da boca, 5.3 Poses que já têm a boca aberta no desenho, 5.4 Movimento secundário (não áudio), 5. Como casar com as poses das folhas de expressão

### Community 87 - "validar_ciclo.py"
Cohesion: 0.16
Nodes (12): avaliar(), main(), serie(), cortar(), main(), validar(), carregar(), generico() (+4 more)

### Community 88 - "Stems — O Parque dos Pets"
Cohesion: 0.50
Nodes (4): Ficheiros, Limites (a declarar a quem montar a timeline), Qualidade medida (44 janelas de fala de `ref/words.json`), Stems — O Parque dos Pets

### Community 89 - "Master Studio Skills"
Cohesion: 0.67
Nodes (3): OUT, Master Studio (painel gerado de studio.catalog.json), 92 skills por área (Master Studio)

### Community 91 - "json"
Cohesion: 0.14
Nodes (21): 7. Mapa de ferramentas, ciclo(), comparar(), descarregar(), episodio(), estado(), estado_curto(), experimentar() (+13 more)

### Community 92 - "expressoes_v3.py"
Cohesion: 0.16
Nodes (14): _anchors(), arc3(), draw_brow(), eye_fechado(), mouth_aberta(), mouth_franzida(), mouth_lingua(), mouth_ondulada() (+6 more)

### Community 93 - "re"
Cohesion: 0.15
Nodes (9): bloco_micro(), blocos(), descarregar(), main(), submeter(), main(), movimento_da_accao(), detectar() (+1 more)

### Community 94 - "Prompts — os 13 movimentos em falta (Frida e Luna)"
Cohesion: 0.11
Nodes (18): 10. Frida — olhar, 11. Luna — olhar, 12. Frida — abraçar, 13. Luna — abraçar, 1. Frida — escuta (PRIORIDADE MÁXIMA, 31 beats), 2. Luna — escuta (PRIORIDADE MÁXIMA, 33 beats), 3. Frida — fala (PRIORIDADE ALTA), 4. Frida — corrida (+10 more)

### Community 95 - "flow_fetch_proj.py"
Cohesion: 0.19
Nodes (10): _classify_screen(), _gemini_tts_key(), generate_audio_gemini(), _generic_prompt(), _norm_ascii(), _read_env_value(), _simplified_prompt(), _soften_prompt() (+2 more)

### Community 96 - "submit_flow_prompt"
Cohesion: 0.16
Nodes (9): attach_reference(), _dismiss_overlays(), editor(), _loc_first_visible(), select_image_mode(), select_x1(), submit_flow_prompt(), ler_editor() (+1 more)

### Community 97 - "grab_image"
Cohesion: 0.13
Nodes (9): _bytes_igual_ref(), count_dl(), _enforce_characters(), _enforce_image_only(), fetch_url(), grab_image(), on_resp(), _imagem_repetida() (+1 more)

### Community 98 - "load_char"
Cohesion: 0.16
Nodes (9): contact_sheet(), erase_shapes(), face_sheet(), _font(), load_char(), local_colour_model(), main(), mask_shapes() (+1 more)

### Community 99 - ".artcraft/media.mjs"
Cohesion: 0.21
Nodes (10): discoverTools(), findInTree(), flag(), KNOWN, requireTool(), SCAN_ROOTS, TOOLS, which() (+2 more)

### Community 101 - "run_setup_learning"
Cohesion: 0.18
Nodes (8): get_page(), _login_with_user_confirmation(), needs_login(), _prompt_user_confirm(), run_check(), run_login(), run_setup_learning(), _save_flow_state()

### Community 102 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, module, moduleResolution, noEmit, resolveJsonModule (+4 more)

### Community 103 - "diffuse_fill"
Cohesion: 0.17
Nodes (6): column_fill(), diffuse_fill(), _down_weighted(), inpaint(), inpaint_zone(), _jacobi()

### Community 104 - "grab_media"
Cohesion: 0.18
Nodes (8): _copiar_para_banco(), dismiss_ads_and_permissions(), grab_media(), grab_text(), is_generating(), LoginRequired, open_fresh(), save_bytes()

### Community 105 - "Motor Flow — gerar movimento, baixar, cortar, guardar"
Cohesion: 0.17
Nodes (11): 1. Chrome com sessão (uma vez), 2. Gerar o movimento no Flow, 3. Baixar (o que faltava), 4. Cortar e alinhar, 5. Registar no banco e renderizar, Motor Flow — gerar movimento, baixar, cortar, guardar, O porteiro (obrigatório antes de animar), Porque só 7,5 ou 10 fps (+3 more)

### Community 106 - "Parte 1 - Piscar (a personagem não pode parecer um robô)"
Cohesion: 0.18
Nodes (10): 1.1 O que as 16 folhas realmente tem, 1.2 Já existe um piscar verdadeiro no banco, 1.3 Esquema concreto a aplicar, 1.4 Limites do piscar, 2.1 Medição de todos os ciclos registados, 2.3 Os 3 ciclos a gerar a seguir (por beats desbloqueados), 2.4 Entradas a remover por serem coxas, 2.5 Limites honestos (+2 more)

### Community 107 - "render"
Cohesion: 0.25
Nodes (10): drop_pts(), eye_coracao(), _glint(), heart_pts(), render(), x_coracoes(), x_lagrima(), x_rubor() (+2 more)

### Community 108 - "main"
Cohesion: 0.29
Nodes (9): cdp_alive(), default_profile(), latest_project(), launch_chrome(), load_prompts(), main(), resolve_project_dir(), _resolve_project_dir() (+1 more)

### Community 109 - "Processo de produção — vídeo animado a partir de uma fonte"
Cohesion: 0.18
Nodes (10): Estado deste episódio (onde estamos), Fase 0 — Entender a fonte (antes de desenhar qualquer coisa), Fase 1 — Travar o personagem (aqui falhámos), Fase 2 — Inventário de movimentos (planeamento), Fase 3 — Geração no Flow, Fase 4 — Corte, validação e banco, Fase 5 — Animação, Fase 6 — QA final (+2 more)

### Community 110 - "preparar_publico.mjs"
Cohesion: 0.20
Nodes (10): alvo, AQUI, copiarPasta(), destinoBg, garante(), gerado, origemAudio, origemBg (+2 more)

### Community 111 - "CONTRATO — Animação Frida & Luna (O Parque dos Petes)"
Cohesion: 0.20
Nodes (9): 1. Personagens — identidade única, 2. Continuidade — regras duras, 3. Regras do sprite (folha de movimento), 4. Google Flow — como usar, 5. Narração → movimento (camada semântica), 6. Portas de validação (todas obrigatórias, nesta ordem), 8. Zaões honestas, 9. Histórico de decisões do utilizador (18/11/2026) (+1 more)

### Community 112 - "Entrega do Artista de Desenho — Luna e Frida (2D à mão)"
Cohesion: 0.20
Nodes (9): 1. Veredito, 2. Arquivos entregues, 3. Como foi feito (reprodutível, sem IA de imagem), 4. Referência usada, 5. Características fixadas (para quem for animationar), 6. O que eu já gastei das 2 iterações, 7. Pendências que dependem de terceiros, 8. O que eu não verifiquei (+1 more)

### Community 113 - "REGRAS DE RENDER — As Quatro Estações"
Cohesion: 0.20
Nodes (9): Armadilha do gerador de timeline, Base de tempo (definitiva, v2), Comando de render que funciona, Correções de paleta achadas no QA do primeiro MP4, Falha que foi corrigida no código (não reverter), Limpeza entre tentativas, Pendências reais deste vídeo, REGRAS DE RENDER — As Quatro Estações (+1 more)

### Community 114 - "B) Regras de representação"
Cohesion: 0.20
Nodes (9): A) Tabela por cena, B) Regras de representação, C) Checklist de QA — reprova uma cena se…, D) Limites honestos, Direcção de arte — *O Parque dos Pets* (Frida & Luna), Escuta (idle) — 5 movimentos mensuráveis, Expressões — mapeamento obrigatório (das 8 folhas existentes), Fala sem lip-sync (+1 more)

### Community 115 - "Prompts — 8 expressões da Frida e da Luna"
Cohesion: 0.22
Nodes (8): A) Grelha da FRIDA — 8 células (4 colunas × 2 linhas), B) Grelha da LUNA — 8 células (4 × 2), C) Versões individuais (se preferires uma imagem por expressão), D) Negative prompt (colar no campo negativo, se houver), E) O que me interessa na entrega, Paleta, Prompts — 8 expressões da Frida e da Luna, Regras que o prompt tem de impor (é o que falhou antes)

### Community 116 - "Prompts — ciclos de movimento da Frida (a nossa, creme com pérolas)"
Cohesion: 0.22
Nodes (8): 1. Marcha (ciclo de 8 frames) — a mais importante, 2. Corrida (ciclo de 8 frames), 3. Salto (6 frames), 4. Falar / idle (6 frames), 5. Festa / dança (8 frames), Depois de gerar, Negativo (colar no campo negativo), Prompts — ciclos de movimento da Frida (a nossa, creme com pérolas)

### Community 117 - "FundosVivos.tsx"
Cohesion: 0.53
Nodes (8): Brilho(), Confete(), Folha(), FundosVivos(), Passaro(), Props, rnd(), Vento()

### Community 118 - "yt-audit.mjs"
Cohesion: 0.29
Nodes (5): DASH, DATA, fail(), ok(), PORT

### Community 119 - "apply_green"
Cohesion: 0.29
Nodes (5): apply_green(), build_alpha(), ellipse_mask(), lum_of(), sample_palette()

### Community 120 - "draw_iris"
Cohesion: 0.25
Nodes (6): draw_iris(), eye_aberto(), eye_lado(), eye_meio_fechado(), body(), eye_muito_aberto()

### Community 121 - "Micro-movimentos obrigatórios — regra do motor"
Cohesion: 0.25
Nodes (7): Bloco para injectar no prompt (inglês), Frida — regiões obrigatórias, Luna — regiões obrigatórias, Micro-movimentos obrigatórios — regra do motor, Negativo — acrescentar, Princípio, Verificação no motor

### Community 122 - "Desenhos da historinha — Luna e Frida (2D à mão)"
Cohesion: 0.29
Nodes (6): Características fixadas dos personagens, Como foi feito (reprodutível), Desenhos da historinha — Luna e Frida (2D à mão), O que ainda falta (por honestidade), O que tem nesta pasta, Referência usada

### Community 123 - "AGENTES.md"
Cohesion: 0.29
Nodes (6): Agentes — Frida & Luna (recriados do OpenBot), Decisão herdada: clonar estrutura, nunca conteúdo, Decisões herdadas que continuam válidas, Elenco, Estado por agente (herdado do canal antigo), Regras de ouro (válidas para todos)

### Community 124 - "Prompt — ciclo de marcha v3 (perfil puro, duas pernas)"
Cohesion: 0.29
Nodes (6): As três regras que faltavam, Bloco para colar (positivo), Como verificar quando chegar (antes de animar), Diagnóstico que este prompt corrige (medido, não suposto), Negativo, Prompt — ciclo de marcha v3 (perfil puro, duas pernas)

### Community 125 - "_flow_target_url"
Cohesion: 0.29
Nodes (3): _flow_target_url(), _load_flow_state(), validate_flow_ready()

### Community 126 - "O Parque dos Pets — Remotion"
Cohesion: 0.29
Nodes (6): 1. Gerar o timeline, 2. Preparar os assets, 3. Verificar e renderizar, 4. Contrato do `timeline.json`, Limites honestos, O Parque dos Pets — Remotion

### Community 127 - "heart_pts"
Cohesion: 0.33
Nodes (3): eye_coracao(), heart_pts(), x_coracoes()

### Community 129 - "Prompt — ciclo de marcha (v2, frame a frame)"
Cohesion: 0.40
Nodes (4): Bloco para colar (positivo), Depois de gerar, Negativo, Prompt — ciclo de marcha (v2, frame a frame)

### Community 130 - "Personagens — ficha técnica (aprovada 2026-11-17)"
Cohesion: 0.40
Nodes (5): Decisão do utilizador, Ficheiros canónicos, O que nenhum agente pode fazer, Personagens — ficha técnica (aprovada 2026-11-17), Proporção (regra dura)

### Community 132 - "Folha de piscar — Luna (e Frida, se precisar)"
Cohesion: 0.50
Nodes (3): Folha de piscar — Luna (e Frida, se precisar), Frida — piscar (só se o idle não servir), Luna — piscar (8 quadros, prioridade alta)

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
- **12 isolated node(s):** `Decisão herdada: clonar estrutura, nunca conteúdo`, `Agente Dev-3D-Craft`, `Agente Dev-Motion-QA`, `Agente Diretor-Arte`, `Agente Especialista-ComfyUI` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 858 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md — mapa vivo do ecossistema Video Orchestrator` connect `Bot Chain and Audio v1` to `ArtCraft Dispatcher CLI`, `OpenMontage Catalog`, `Cadeia de produção com 6 bots (sala OpenBot)`, `Episodio.tsx`, `AGENTES.md`, `Train Scene React Code`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **What connects `Decisão herdada: clonar estrutura, nunca conteúdo`, `Agente Dev-3D-Craft`, `Agente Dev-Motion-QA` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `blender_diorama.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0649452269170579 - nodes in this community are weakly interconnected._
- **Why does `===============================================================================…` connect `Runtime Detection` to `Python CV/Blender Scripts`, `Avatar Base Generator`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Should `yt-clone-build Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.05384615384615385 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `STOP_MARKS` and `re`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Mix de prévia v2 — 163,415 s, -14,0 LUFS, valsa a -22 dB` and `Gates de qualidade Q1–Q8`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._