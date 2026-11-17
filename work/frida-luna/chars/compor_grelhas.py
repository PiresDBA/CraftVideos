"""Compor as grelhas 4x5 de expressões a partir das poses geradas uma a uma.

Manual de uso
-------------
    py compor_grelhas.py

Entradas   chars/_raw/<personagem>/<expressao>.png   (gen_poses.py)
Saídas     chars/frida-expressoes.png   1792x2240? -> 2048x2560, 4 colunas x 5 linhas
           chars/luna-expressoes.png

Porque é que a grelha é composta em vez de gerada
-------------------------------------------------
O FLUX foi convidado duas vezes a desenhar a grelha completa: (1) devolveu 16 células em
vez de 20, com sombra no chão e o colar reduzido a um pendente; (2) devolveu uma imagem
vazia. Contagens altas de células não são cumpridas. Aqui cada pose é gerada sozinha com
o bloco de personagem fixo e a grelha é montada pixel a pixel — 20 células garantidas,
sem texto, sem linhas de grelha e sem molduras.

Normalização: cada pose é limpa com o mesmo alpha do fatiar.py, cortada ao conteúdo e
escalada para ocupar 78% da altura da célula, com a base das patas no mesmo y. É isso que
mantém as proporções iguais em todas as células.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from fatiar import COLS, ROWS, EXPRESSOES, CREME, alpha_do_creme, descontaminar  # noqa: E402

HERE = Path(__file__).resolve().parent
RAW = HERE / "_raw"
CELULA = 512          # lado da célula; o fatiar.py corta a 512 -> escala 1:1
OCUPA = 0.78          # fração da altura da célula que o desenho ocupa
BASE = 0.90           # onde fica a base das patas (0 = topo, 1 = fundo da célula)


def pose_normalizada(caminho: Path) -> Image.Image:
    """Pose com fundo limpo, sombra removida e enquadramento uniforme."""
    rgba = np.array(Image.open(caminho).convert("RGBA"))
    alfa = alpha_do_creme(rgba)
    descontaminar(rgba, alfa)
    rgba[..., 3] = (alfa * 255).astype(np.uint8)

    ys, xs = np.where(alfa > 0.02)
    if len(ys) == 0:
        raise RuntimeError(f"pose vazia: {caminho}")
    recorte = Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    escala = OCUPA * CELULA / recorte.height
    novo = recorte.resize(
        (max(1, round(recorte.width * escala)), round(recorte.height * escala)), Image.LANCZOS
    )
    if novo.width > CELULA * 0.94:  # pose muito larga (ex.: cauda esticada) -> cabe na largura
        escala = CELULA * 0.94 / novo.width
        novo = novo.resize((round(novo.width * escala), max(1, round(novo.height * escala))), Image.LANCZOS)
    return novo


def compor(personagem: str, saida: Path) -> tuple[int, int]:
    grelha = Image.new("RGB", (COLS * CELULA, ROWS * CELULA), tuple(int(c) for c in CREME))
    for i, expressao in enumerate(EXPRESSOES):
        origem = RAW / personagem / f"{expressao}.png"
        if not origem.exists():
            raise FileNotFoundError(f"falta a pose {origem} — correr gen_poses.py")
        pose = pose_normalizada(origem)
        r, c = divmod(i, COLS)
        x = c * CELULA + (CELULA - pose.width) // 2
        y = r * CELULA + round(BASE * CELULA) - pose.height
        grelha.paste(pose, (x, y), pose)
    grelha.save(saida)
    return grelha.size


def main() -> int:
    for personagem in ("frida", "luna"):
        saida = HERE / f"{personagem}-expressoes.png"
        size = compor(personagem, saida)
        print(f"{saida.name}: {size[0]}x{size[1]}  ({COLS} colunas x {ROWS} linhas = {COLS*ROWS} células)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
