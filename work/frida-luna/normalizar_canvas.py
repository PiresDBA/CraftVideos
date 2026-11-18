"""Normaliza o canvas de todos os frames de um ciclo para a caixa da figura.

Porque: se um frame do ciclo tiver várias personagens ou muito espaço vazio, o canvas
fica largo e o Remotion (object-fit: contain) escala pela LARGURA, tornando a figura
visível muito menor que nos outros ciclos. Isto causava a Frida mudar de tamanho.

Para cada ciclo:
1. mede a caixa de conteúdo (alfa) de todos os frames;
2. usa a MEDIANA da largura e da altura como canvas comum (com 6 px de margem);
3. recorta cada figura, redimensiona para caber nesse canvas e ancora os pés no fundo.
"""
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")


def caixa(im):
    a = np.array(im.convert("RGBA"))
    m = a[:, :, 3] > 60
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def normalizar(pasta):
    fs = sorted(pasta.glob("f*.png"))
    if len(fs) < 4:
        return False
    imgs = [Image.open(f).convert("RGBA") for f in fs]
    boxes = [caixa(i) for i in imgs]
    if any(b is None for b in boxes):
        return False
    largos = [b[2] - b[0] for b in boxes]
    altos = [b[3] - b[1] for b in boxes]
    W = int(np.median(largos)) + 6
    H = int(np.median(altos)) + 6
    if all(i.size == (W, H) for i in imgs):
        return False

    tmp = pasta.parent / ("_tmp_" + pasta.name)
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()
    for f, im, b in zip(fs, imgs, boxes):
        fig = im.crop(b)
        s = min(W / fig.width, H / fig.height)
        new = (max(1, round(fig.width * s)), max(1, round(fig.height * s)))
        fig = fig.resize(new, Image.LANCZOS)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(fig, ((W - new[0]) // 2, H - new[1]), fig)
        canvas.save(tmp / f.name)
    for f in fs:
        f.unlink()
    for f in tmp.glob("*.png"):
        f.rename(pasta / f.name)
    tmp.rmdir()
    print(f"  {pasta.relative_to(BASE)}: canvas -> {W}x{H}")
    return True


def main():
    n = 0
    for raiz in (BASE / "movimentos", BASE / "_novos"):
        for pasta in sorted(raiz.glob("*/*")):
            if pasta.is_dir() and any(pasta.glob("f*.png")):
                if normalizar(pasta):
                    n += 1
    print(f"{n} ciclos normalizados")


if __name__ == "__main__":
    main()
