"""Força a MESMA caixa de sprite para todos os quadros de uma personagem.

O utilizador pediu: sobrepor as figuras como transparência e ajustar todas para a mesma
altura e largura. Isto elimina a variação em que a Frida aparece mais larga/baixa conforme
o ciclo. Aplica-se a todos os ciclos e também às expressões aprovadas, para que a medição
de continuidade compare coisas processadas da mesma forma.

Uso: py fixar_proporcoes.py
"""
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"D:\CRAFT\work\frida-luna")
# caixa alvo por personagem (altura, fator largura/altura da referência aprovada)
ALVO = {"frida": (231, 0.75), "luna": (265, 0.63)}


def bbox(im):
    a = np.array(im.convert("RGBA"))
    m = a[:, :, 3] > 60
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def aplicar(pasta, quem, H, W):
    fs = sorted(pasta.glob("*.png"))
    fs = [f for f in fs if f.name.startswith("f") or f.stem in
          ("angry", "excited", "happy", "loved", "sad", "scared", "silly", "surprised")]
    if not fs:
        return False
    tmp = pasta.parent / ("_fx_" + pasta.name)
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()
    for f in fs:
        im = Image.open(f).convert("RGBA")
        bb = bbox(im)
        if bb is None:
            shutil.copyfile(f, tmp / f.name)
            continue
        fig = im.crop(bb)
        # escala independente em x e y: a caixa visível passa a ser IDÊNTICA em todos
        fig = fig.resize((W, H), Image.LANCZOS)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(fig, (0, 0), fig)
        canvas.save(tmp / f.name)
    for f in fs:
        f.unlink()
    for f in tmp.glob("*.png"):
        f.rename(pasta / f.name)
    tmp.rmdir()
    return True


def main():
    n = 0
    for quem, (H, aspect) in ALVO.items():
        W = round(H * aspect)
        pastas = [BASE / "chars" / "poses-v3" / quem]
        for raiz in (BASE / "movimentos" / quem, BASE / "_novos"):
            if raiz.exists():
                if raiz.name == quem:
                    pastas += [p for p in raiz.iterdir() if p.is_dir()]
                else:
                    pastas += [p for p in raiz.glob(f"{quem}-*") if p.is_dir()]
        for pasta in pastas:
            if aplicar(pasta, quem, H, W):
                print(f"  {pasta.relative_to(BASE)} -> {W}x{H}")
                n += 1
    print(f"{n} pastas com caixa fixa")


if __name__ == "__main__":
    main()
