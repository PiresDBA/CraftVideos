# Motor Flow — gerar movimento, baixar, cortar, guardar

Pipeline oficial (validado 18/11/2026). Não depende de cliques humanos nem de downloads
bloqueados: usa a **sessão autenticada do Chrome** por CDP e pede os bytes da imagem.

## 1. Chrome com sessão (uma vez)

```powershell
# perfil dedicado (o Chrome 136+ só abre a porta de depuração com --user-data-dir)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=18800 `
  --user-data-dir=C:\videomaker\.chrome-gemini-profile `
  https://flow.google.com
```

Login Google nessa janela **uma única vez**. A sessão fica no perfil.

## 2. Gerar o movimento no Flow

`D:\CRAFT\tools\flow_fetch.py` (já existente) ou pelo modo Agente do Flow. Regras do prompt:

- pedir **uma tira horizontal** de N frames (não N imagens soltas);
- nomear o ciclo (contacto → baixo → passagem → cima → contacto oposto…);
- dizer que a personagem é **idêntica** em todos os frames e que os pés estão na mesma base;
- anexar a folha aprovada como referência (`--ref-image`);
- negativo: texto, números, moldura, sombra, contorno branco.

## 3. Baixar (o que faltava)

```powershell
cd C:\Users\Pires\StickFilms\.tools
node flow_dl_all.mjs "https://flow.google.com/u/0/project/<ID>" "D:\CRAFT\work\frida-luna\chars\folhas\_flow" --n 10 --cdp http://127.0.0.1:18800
```

**Porque funciona:** `ctx.request.get(src)` herda os cookies do Chrome — não usa o menu ⋮,
não passa pelo bloqueio de "downloads automáticos" e não precisa de gerar de novo.

- `flow_dl.mjs` → uma imagem (`--indice -1` = última)
- `flow_dl_all.mjs` → as N primeiras, para eu escolher por conteúdo

## 4. Cortar e alinhar

```powershell
py D:\CRAFT\work\frida-luna\ciclo_de_tira.py "…\_flow\flow-05.webp" "…\movimentos\frida\marcha-8f"
```

- remove o fundo por flood-fill a partir das bordas;
- separa as figuras por **componentes conectados**;
- normaliza **todas** para a mesma altura (mediana) e a mesma **linha de base** (pés no
  mesmo y), centradas no eixo dos pés. É isto que impede o "saltar" entre frames.

## 5. Registar no banco e renderizar

```powershell
cd D:\CRAFT\work\frida-luna
py movimentos.py registar frida marcha-8f "…\movimentos\frida\marcha-8f" 10 `
   --fonte "Flow filmstrip 18/11 (flow-05.webp), recortado e alinhado"
py movimentos.py render frida marcha-8f 4 "card\cartao-frida-4s.mp4" --altura 700
py movimentos.py listar
```

O banco fica em `movimentos/manifest.json` com proveniência (ficheiro de origem, data, nota)
e os frames em `movimentos/<personagem>/<movimento>/`.

## Regras que se provaram

| regra | porquê |
| --- | --- |
| tira horizontal, não imagens soltas | a ordem do ciclo deixa de ser adivinhação |
| altura mediana + base alinhada | sem isso cada frame "respira" e salta |
| frames inteiros (sem crossfade) | a mistura de dois desenhos cria fantasmas (pernas duplicadas) |
| avanço = passada × fase | o pé não derrapa no chão |
| soma com bob e sombra | dá peso; sem isto o boneco flutua |
| proporção Frida 1,00 · Luna 0,72 | o "dobro" é de massa, não de altura |
