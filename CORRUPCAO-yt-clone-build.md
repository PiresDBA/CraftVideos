# ARQUIVO CORROMPIDO — `.artcraft/yt-clone-build.mjs`

**Estado:** corrompido. Não executar. `node --check` falha com
`SyntaxError: Unexpected end of input`.

| Item | Valor |
| --- | --- |
| Ficheiro | `.artcraft/yt-clone-build.mjs` |
| Tamanho original | ~2740 linhas |
| Tamanho atual | **35 linhas** (1981 bytes) |
| Momento da corrupção | 2026-11-13 17:37:14 |
| Causa | três harnesses a escrever no mesmo projeto ao mesmo tempo |

## O que sobrou

Não é o início do ficheiro: é um fragmento do **meio**. Ficou apenas a função
`writeSceneASS(...)` isolada — sem cabeçalho, sem os `import`, sem `main()`, sem
`buildMotionCards()`, sem `buildCards()`, sem `sceneFilter()`, sem configuração de
argumentos. O ficheiro não fecha o bloco e não tem nada que o possa executar.

Note-se que o `writeSceneASS` sobrevivente contém código que não existia na versão
anterior (`hasTopMedia`, `topBandRatio`, `captionWords`, `keyWords`): a versão
destruída era **mais recente** do que qualquer cópia que tenhamos visto.

## Como se sabe que não foi um bug do código

A linha temporal está documentada:

| Hora | Ficheiro / evento |
| --- | --- |
| 11:48–11:51 | build completo e funcional: `work/clones/ycc-kit/out/final_pt-BR.mp4` (68,3 s) |
| 17:15 | `work/clones/ref5-clone/plan-remotion.json` |
| 17:24–17:25 | `.artcraft/yt-motion-remotion.mjs`, `.artcraft/teste-motivo-remotion.mjs`, `OpenMontage/remotion-composer/src/Explainer.tsx` |
| **17:37** | **`yt-clone-build.mjs` sobrescrito com 35 linhas** |

Três processos distintos a editar o mesmo diretório. Nenhum deles tinha
versionamento nem bloqueio, por isso a última escrita ganhou.

## Tentativas de restauro (todas falhadas)

1. Cópias no projeto ou no `%LOCALAPPDATA%\Temp` — nenhuma.
2. Git — o projeto não era um repositório.
3. Histórico local do VS Code (72 entradas) — nenhuma menciona `CRAFT` nem `yt-clone`.
4. Reciclagem de `D:` — vazia.
5. Cópias de sombra (VSS): existem 3, **todas do volume `C:`** (12/11). O projeto vive
   em `D:`, e `vssadmin list shadows /for=D:` devolve "Nenhum item que atenda a consulta".
6. `.bak`, `*~`, `.swp`, `.orig` em `D:\CRAFT` — nenhum.

**Conclusão:** os bytes originais foram sobrescritos. Não há restauro possível, só
reconstrução.

## O que continua intacto (verificado)

- Os outros 29 `.mjs` de `.artcraft/` passam `node --check`.
- `clone.config.json`, `taxonomy.json`, os dois `manifest.json`, `effect-plan.json`: JSON válido.
- `.artcraft/card-scaffold.mjs` (248 linhas) — os cinco arquétipos de cartão.
- `work/clone-tooling/explainer-effects.mjs` (513 linhas) — o kit das 9 composições.
- `work/explainer-study/preview/` — a página de resultados e o servidor (`serve.mjs`).
- Vídeos: `ycc-kit` (3,0 MB), `ycc-fix` (2,6 MB), `demo_effects_reel.mp4` (804 KB).
- Zero ficheiros de 0 bytes em todo o projeto.

## Cópia de segurança

Este estado está em `backups/` (data no nome da pasta) e no commit inicial do
repositório git local criado a seguir.

## Regra para não repetir

Um só harness escreve num ficheiro de cada vez. Antes de refactor grande:
`git add -A && git commit`, ou uma cópia datada em `backups/`.
