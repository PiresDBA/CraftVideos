# CraftVideos

Espaco de trabalho do pipeline de clonagem de canais para YouTube — estrutura
clonada, **conteúdo nunca copiado**.

O objectivo do motor é reproduzir a *estrutura* editorial de um canal (ritmo,
cortes, divisão do ecrã em bandas, tipografia, voz) com material gerado de
raiz: a banda de cima é tipografia cinética Remotion original e o apresentador
é um avatar sintético. O footage do canal de referência nunca entra no
resultado.

## O que está aqui

| Caminho | O que é |
|---|---|
| `.artcraft/yt-clone-build.mjs` | o motor: guião → voz → avatar → cartões → cenas → MP4 |
| `.artcraft/clone/lib/` | a lógica pura, extraída em módulos testáveis |
| `.artcraft/clone/README.md` | arquitectura da refactorização e regras do pipeline |
| `.artcraft/yt-motion-remotion.mjs` | renderizador da banda de cima (Remotion) |
| `clone.config.json` | **toda** a parametrização (nada está preso no código) |
| `work/clones/<slug>/` | builds, manifestos, relatórios e o plano de cada clone |

## Como se corre

```sh
# 1. planear e validar (não escreve nada, não gasta nada)
node .artcraft/yt-clone-build.mjs --validate

# 2. build de um idioma
node .artcraft/yt-clone-build.mjs --slug ref5-clone \
  --script work/clones/ref5-clone/script.json \
  --set 'languages.supported=["pt-BR"]' \
  --set 'languages.subtitleLanguages=["pt-BR"]' \
  --wav2lip --driving-video D:\CRAFT\work\reference\ref5\ref1080.mp4

# 3. testes
node --test ".artcraft/clone/lib/*.test.mjs"
```

## Regras de conduta

- **Estrutura, nunca conteúdo.** Zero footage do canal de referência nos
  entregáveis.
- **Nada pago.** OpenRouter só em FREE tier; as vozes Gemini do VoiceCraft
  são gratuitas.
- **Nada preso no código.** Tudo se parametriza em `clone.config.json` ou por
  `--set chave=valor`.
- **Nunca apagar trabalho.** O motor guarda backups, caches e cópias
  anteriores; uma opção nova entra sempre *a mais*, nunca por cima.
