"""Fatiar as grelhas de expressões da Frida e da Luna em sprites PNG com alfa.

Manual de uso
-------------
    py fatiar.py            # fatia as duas grelhas e monta o contact sheet

Entradas   chars/frida-expressoes.png   grelha 4 colunas x 5 linhas (2048x2560)
           chars/luna-expressoes.png    grelha 4 colunas x 5 linhas (2048x2560)
Saídas     chars/poses/<personagem>/<expressao>.png      512x512, alfa, fundo limpo
           chars/poses/manifest.json                     personagem, expressão, ficheiro, w/h
           chars/poses/_contact.png                      as 40 poses com o nome por baixo

Mapa 4x5 explícito e margem de segurança
----------------------------------------
A grelha não traz linhas de corte: a célula é calculada por divisão exacta
(largura/4, altura/5) e encolhida por 4% para não apanhar a cauda ou a orelha da
pose vizinha. O passo seguinte procura a caixa do desenho dentro dessa janela, o que
absorve qualquer desalinhamento residual.

Uma única janela de recorte para as 20 células
----------------------------------------------
Cortar cada célula à sua própria caixa (o óbvio) fazia cada cão encher o quadrado e
umas poses saíam maiores que as outras (a "mischievous" ficava minúscula ao lado da
"happy"). Aqui calcula-se a união das 20 caixas e todas as poses são recortadas por
essa mesma janela: escala e enquadramento idênticos, como uma folha de poses deve ser.

Fundo creme -> alfa, sem comer as patas
---------------------------------------
1. Candidato a fundo = pixel a menos de TOL_ALTA de distância do creme.
2. Só se apaga o creme LIGADO À BORDA da imagem (scipy.ndimage.label). A barriga e as
   patas da Frida são creme e ficam intactas: estão cercadas de traço castanho e não têm
   caminho livre até à borda.
3. Coroa de transição -> alfa parcial de 0 (colado ao creme) a 1 (longe do creme).
   A rampa invertida (o primeiro erro) deixava um véu de 0,99 sobre o fundo.
4. Sombra do chão: o FLUX desenha sempre uma elipse taupe debaixo das patas. Regra por
   coluna — a última linha "sólida" (pelo saturado ou creme grosso) é o fundo real da
   pata; abaixo disso só há sombra. A abertura vertical de 5 px impede que a própria
   linha fina da sombra conte como sólido e se proteja a si mesma.
5. Descontaminação: a cor da coroa passa a vir do pixel opaco mais próximo, senão o
   sprite mostra um halo creme de 1-2 px quando é composto sobre fundo escuro.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = Path(__file__).resolve().parent
POSES = HERE / "poses"

CREME = np.array([251, 243, 228], dtype=np.int32)  # fundo das grelhas
COLS, ROWS = 4, 5                                   # mapa explícito da grelha
MARGEM = 0.04                                       # margem de segurança por célula
ALTURA_FINAL = 512                                  # lado do sprite quadrado
TOL_BAIXA, TOL_ALTA = 24, 64                        # tolerância ao fundo creme

# Ordem de leitura da grelha (esquerda->direita, cima->baixo). É o contrato do manifesto:
# não inventar poses que não estejam nesta lista.
EXPRESSOES = [
    "happy", "sad", "angry", "excited",
    "scared", "tired", "confused", "proud",
    "surprised", "shy", "silly", "sick",
    "worried", "mischievous", "loved", "bored",
    "grumpy", "jealous", "calm", "lovestruck",
]

GRELHAS = {"frida": "frida-expressoes.png", "luna": "luna-expressoes.png"}


# --------------------------------------------------------------------- alfa
def alpha_do_creme(rgba: np.ndarray) -> np.ndarray:
    """Devolve a máscara alfa (float 0..1) que remove creme + sombra do chão."""
    rgb = rgba[..., :3].astype(np.int32)  # int32: o quadrado da diferença estoura int16
    dist = np.sqrt(((rgb - CREME) ** 2).sum(axis=2)).astype(np.float32)

    # 1) candidatos a fundo, 2) só os ligados à borda
    cand = dist < TOL_ALTA
    rotulos, _ = ndimage.label(cand, structure=np.ones((3, 3), bool))
    das_bordas = np.concatenate([rotulos[0, :], rotulos[-1, :], rotulos[:, 0], rotulos[:, -1]])
    ids = set(np.unique(das_bordas)) - {0}
    fundo = np.isin(rotulos, list(ids)) if ids else np.zeros_like(cand)

    alfa = np.where(fundo, 0.0, 1.0).astype(np.float32)

    # 3) coroa de transição: 0 junto ao creme -> 1 longe dele
    coroa = fundo & (dist > TOL_BAIXA)
    alfa[coroa] = np.clip((dist[coroa] - TOL_BAIXA) / (TOL_ALTA - TOL_BAIXA), 0.0, 1.0)

    # 4) sombra do chão: o FLUX desenha sempre uma elipse debaixo das patas, e nem sempre
    #    é cinzenta (há poses com sombra laranja). A regra de cor falhava. Regra estrutural:
    #    todo o desenho tem traço castanho-escuro a fechar a forma, logo, em cada coluna,
    #    a última linha com traço é o fundo real da figura. Tudo o que estiver abaixo disso
    #    é sombra, seja qual for a cor. Coordenadas dentro do corpo nunca são atingidas
    #    porque ficam acima do último traço da sua coluna.
    #    O traço da personagem é castanho-escuro (~145,53,32 -> média 77) enquanto o pelo
    #    tem média 130+ e o creme 237: média < 150 apanha o traço e nunca o creme.
    maxc = rgb.max(axis=2).astype(np.float32)
    traco = (~fundo) & (rgb.mean(axis=2) < 150)
    linhas = np.arange(traco.shape[0])[:, None]
    y_traco = np.where(traco, linhas, -1).max(axis=0)[None, :]
    alfa[(linhas > y_traco + 2) & ~traco] = 0.0

    # 5) molduras e vinhetas: alguns raws trazem um cartão creme com cantos redondos,
    #    mais escuro que o fundo e longe do cão. Se sobreviver, incha a caixa do conteúdo
    #    e o cão é escalado para baixo. Fica a maior componente e tudo o que estiver
    #    perto dela (corações flutuantes, gotas de suor); o resto cai.
    forte = alfa > 0.5
    rot, n = ndimage.label(forte, structure=np.ones((3, 3), bool))
    if n > 1:
        areas = ndimage.sum(forte, rot, index=np.arange(1, n + 1))
        principal = int(np.argmax(areas)) + 1
        ys, xs = np.where(rot == principal)
        fx, fy = 0.12 * (xs.max() - xs.min() + 1), 0.12 * (ys.max() - ys.min() + 1)
        manter = np.zeros(n + 1, bool)
        manter[principal] = True
        for rid in range(1, n + 1):
            if rid == principal:
                continue
            ys2, xs2 = np.where(rot == rid)
            if (xs2.min() >= xs.min() - fx and xs2.max() <= xs.max() + fx
                    and ys2.min() >= ys.min() - fy and ys2.max() <= ys.max() + fy):
                manter[rid] = True
        sobras = ndimage.binary_dilation(~manter[rot] & forte, iterations=3)
        alfa[sobras] = 0.0

    # suaviza a aresta sem furar o interior
    alfa = ndimage.gaussian_filter(alfa, 0.6)
    alfa[ndimage.binary_erosion(alfa > 0.5, iterations=2)] = 1.0
    # o creme não é uniforme e deixa um véu de alfa baixo: abaixo de 0,22 é ruído
    alfa[alfa < 0.22] = 0.0
    return np.clip(alfa, 0.0, 1.0)


def descontaminar(rgba: np.ndarray, alfa: np.ndarray) -> None:
    """Troca a cor da coroa anti-aliased pela cor do pixel opaco mais próximo.

    Sem isto a coroa guarda a mistura com o creme e, sobre fundo escuro, o sprite ganha
    um halo creme de 1-2 px. A aresta fica suave em qualquer fundo.
    """
    opaco = alfa > 0.9
    if not opaco.any():
        return
    indice = ndimage.distance_transform_edt(~opaco, return_distances=False, return_indices=True)
    cor = rgba[..., :3]
    coroa = (alfa > 0.02) & ~opaco
    if coroa.any():
        mais_perto = cor[indice[0], indice[1]]
        cor[coroa] = mais_perto[coroa]


def preparar(celula: Image.Image) -> tuple[np.ndarray, np.ndarray, tuple[int, int, int, int]]:
    """Célula -> (rgba com alfa, alfa, caixa do conteúdo denso)."""
    rgba = np.array(celula.convert("RGBA"))
    alfa = alpha_do_creme(rgba)
    descontaminar(rgba, alfa)
    rgba[..., 3] = (alfa * 255).astype(np.uint8)

    # caixa do conteúdo "denso": ignora a linha de 1 px que sobra da sombra
    forte = alfa > 0.5
    linhas = np.where(forte.sum(axis=1) > 2)[0]
    colunas = np.where(forte.sum(axis=0) > 2)[0]
    if len(linhas) == 0 or len(colunas) == 0:
        return rgba, alfa, (0, 0, rgba.shape[1], rgba.shape[0])
    return rgba, alfa, (int(colunas.min()), int(linhas.min()),
                        int(colunas.max()) + 1, int(linhas.max()) + 1)


def recortar(rgba: np.ndarray, caixa: tuple[int, int, int, int]) -> Image.Image:
    """Recorta pela janela comum, centra num quadrado e reduz para ALTURA_FINAL."""
    x0, y0, x1, y1 = caixa
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(rgba.shape[1], x1), min(rgba.shape[0], y1)
    recorte = Image.fromarray(rgba, "RGBA").crop((x0, y0, x1, y1))

    lado = max(recorte.size)
    tela = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    tela.paste(recorte, ((lado - recorte.width) // 2, (lado - recorte.height) // 2), recorte)
    return tela.resize((ALTURA_FINAL, ALTURA_FINAL), Image.LANCZOS)


# ------------------------------------------------------------------ fatiar
def fatiar(personagem: str, origem: Path) -> list[dict]:
    grelha = Image.open(origem).convert("RGBA")
    larg, alt = grelha.size
    cw, ch = larg / COLS, alt / ROWS
    destino = POSES / personagem
    destino.mkdir(parents=True, exist_ok=True)

    # 1ª passagem: alfa e caixa de cada célula
    celulas = []
    for i, expressao in enumerate(EXPRESSOES):
        r, c = divmod(i, COLS)
        janela = (
            round(c * cw + cw * MARGEM),
            round(r * ch + ch * MARGEM),
            round((c + 1) * cw - cw * MARGEM),
            round((r + 1) * ch - ch * MARGEM),
        )
        celulas.append((expressao, *preparar(grelha.crop(janela))))

    # janela comum = união das caixas -> mesma escala e enquadramento em todas as poses
    x0 = min(cx[0] for _, _, _, cx in celulas)
    y0 = min(cx[1] for _, _, _, cx in celulas)
    x1 = max(cx[2] for _, _, _, cx in celulas)
    y1 = max(cx[3] for _, _, _, cx in celulas)
    comum = (x0, y0, x1, y1)

    registos = []
    for expressao, rgba, _alfa, _caixa in celulas:
        sprite = recortar(rgba, comum)
        ficheiro = destino / f"{expressao}.png"
        sprite.save(ficheiro)
        registos.append({
            "personagem": personagem,
            "expressao": expressao,
            "ficheiro": f"poses/{personagem}/{expressao}.png",
            "w": sprite.width,
            "h": sprite.height,
        })
        print(f"  {ficheiro.relative_to(HERE)}  {sprite.width}x{sprite.height}")
    print(f"  janela comum: {comum[2]-comum[0]}x{comum[3]-comum[1]} px da grelha")
    return registos


# ----------------------------------------------------------- contact sheet
def contact_sheet(registos: list[dict], saida: Path) -> None:
    """Uma folha só, com o nome por baixo de cada pose, para aprovação de uma vez."""
    por_pers = {p: [r for r in registos if r["personagem"] == p] for p in GRELHAS}
    cols, cel, legenda, faixa = 5, 224, 34, 52

    blocos = {p: math.ceil(len(v) / cols) for p, v in por_pers.items()}
    larg = cols * cel
    alt = sum(faixa + blocos[p] * (cel + legenda) for p in por_pers)
    folha = Image.new("RGB", (larg, alt), (251, 243, 228))
    desenho = ImageDraw.Draw(folha)

    try:
        fonte = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 19)
        fonte_titulo = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 26)
    except OSError:
        fonte = fonte_titulo = ImageFont.load_default()

    y = 0
    for personagem, lista in por_pers.items():
        desenho.rectangle([0, y, larg, y + faixa], fill=(240, 229, 208))
        desenho.text((16, y + 13), f"{personagem.upper()} — {len(lista)} expressões",
                     font=fonte_titulo, fill=(74, 48, 30))
        y += faixa

        for i, reg in enumerate(lista):
            cx = (i % cols) * cel
            cy = y + (i // cols) * (cel + legenda)
            sprite = Image.open(HERE / reg["ficheiro"]).convert("RGBA")
            sprite.thumbnail((cel - 12, cel - 12), Image.LANCZOS)
            folha.paste(sprite, (cx + (cel - sprite.width) // 2, cy + (cel - sprite.height) // 2), sprite)
            nome = reg["expressao"]
            tw = desenho.textlength(nome, font=fonte)
            desenho.text((cx + (cel - tw) / 2, cy + cel - 2), nome, font=fonte, fill=(90, 58, 34))
        y += blocos[personagem] * (cel + legenda)

    folha.save(saida)
    print(f"contact sheet -> {saida.relative_to(HERE)}  {folha.width}x{folha.height}")


def main() -> int:
    todos: list[dict] = []
    for personagem, ficheiro in GRELHAS.items():
        origem = HERE / ficheiro
        if not origem.exists():
            print(f"FALTA {origem}")
            return 1
        print(f"{personagem}: {origem.name} ({Image.open(origem).size[0]}x{Image.open(origem).size[1]})")
        todos += fatiar(personagem, origem)

    (POSES / "manifest.json").write_text(
        json.dumps(
            {
                "gerado_de": {"frida": "frida-expressoes.png", "luna": "luna-expressoes.png"},
                "grelha": {"colunas": COLS, "linhas": ROWS, "margem": MARGEM},
                "altura_sprite": ALTURA_FINAL,
                "total": len(todos),
                "poses": todos,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"manifest -> poses/manifest.json ({len(todos)} poses)")
    contact_sheet(todos, POSES / "_contact.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
