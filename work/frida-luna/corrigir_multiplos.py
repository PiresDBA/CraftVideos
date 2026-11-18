"""Substitui quadros de ciclo que contêm várias personagens encostadas.

Detecção: largura do quadro > 1,8x a mediana da largura do ciclo. O Flow ás vezes
desenha 2-3 cópias encostadas; o recorte por componentes não as separa e o quadro
entra no banco com várias personagens. A correção substitui pelo vizinho são.
"""
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")


def largura(p):
    a = np.array(Image.open(p).convert("RGBA"))[:, :, 3] > 60
    ys, xs = np.nonzero(a)
    return (xs.max() - xs.min() + 1) if len(xs) else 0


def corrigir(pasta):
    fs = sorted(pasta.glob("f*.png"))
    if len(fs) < 4:
        return 0
    larguras = [largura(p) for p in fs]
    med = float(np.median(larguras))
    trocados = 0
    for i, (p, w) in enumerate(zip(fs, larguras)):
        if w > med * 1.8:
            viz = fs[i - 1] if i > 0 else fs[i + 1]
            print(f"  {p.name}: {w} px vs mediana {med:.0f} -> copia de {viz.name}")
            shutil.copyfile(viz, p)
            trocados += 1
    return trocados


def main():
    total = 0
    for raiz in (BASE / "movimentos", BASE / "_novos"):
        for pasta in sorted(raiz.glob("*/*")):
            if pasta.is_dir() and any(pasta.glob("f*.png")):
                n = corrigir(pasta)
                if n:
                    print(f"{pasta.relative_to(BASE)}: {n} quadro(s)")
                total += n
    print(f"total: {total} quadros substituidos")


if __name__ == "__main__":
    main()
