"""Remove sombras de contacto desenhadas nos sprites.

A sombra e criada na animacao (depende do chao de cada cena), por isso nao pode vir no
sprite. Detecta pixeis cinzentos/dessaturados na faixa inferior (onde o Flow desenha a
oval) e anula o alfa. Nao toca nas cores quentes da personagem.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def limpar(p: Path) -> bool:
    a = np.array(Image.open(p).convert("RGBA"))
    h, w, _ = a.shape
    y0 = int(h * 0.88)
    faixa = a[y0:, :, :3].astype(np.int16)
    alfa = a[y0:, :, 3]
    mx = faixa.max(axis=2)
    mn = faixa.min(axis=2)
    sat = mx - mn
    # O Flow desenha a sombra de duas formas: oval CINZENTO escuro ou oval CREME CLARO
    # entre as patas. O creme tem baixa saturacao mas alto brilho — o filtro antigo so
    # apanhava o cinzento (mx<215) e por isso a Luna continuava com o circulo.
    cinza = (sat < 45) & (mx < 215)
    creme = (sat < 55) & (mx >= 215) & (mn > 150)
    semi = (alfa > 0) & (alfa < 210) & (sat < 65)
    alvo = cinza | creme | semi
    alvo &= alfa > 0
    if not alvo.any():
        return False
    a[y0:, :, 3][alvo] = 0
    Image.fromarray(a, "RGBA").save(p)
    return True


def main():
    pastas = [Path(x) for x in sys.argv[1:]]
    total = 0
    for pasta in pastas:
        for f in sorted(pasta.glob("f*.png")):
            if limpar(f):
                total += 1
        print(f"{pasta}: processada")
    print(f"{total} quadros com sombra removida")


if __name__ == "__main__":
    main()
