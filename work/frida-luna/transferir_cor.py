"""Transfere a cor média/desvio da referência aprovada para um ciclo.

Não redesenha a personagem: só alinha a estatística de cor (Reinhard) dos pixeis opacos.
Usado quando uma folha do Flow é da personagem certa mas veio com tom ligeiramente diferente.

Uso: py transferir_cor.py <pasta-ciclo> <imagem-referencia>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def stats(rgb, alpha):
    m = alpha > 40
    px = rgb[m].astype(np.float32)
    return px.mean(axis=0), px.std(axis=0) + 1e-6


def main():
    pasta, ref = Path(sys.argv[1]), Path(sys.argv[2])
    base = np.array(Image.open(ref).convert("RGBA"))
    mr, sr = stats(base[:, :, :3], base[:, :, 3])
    for f in sorted(pasta.glob("*.png")):
        a = np.array(Image.open(f).convert("RGBA"))
        m0, s0 = stats(a[:, :, :3], a[:, :, 3])
        out = (a[:, :, :3].astype(np.float32) - m0) / s0 * sr + mr
        out = np.clip(out, 0, 255).astype(np.uint8)
        out[a[:, :, 3] == 0] = a[:, :, :3][a[:, :, 3] == 0]
        Image.fromarray(np.dstack([out, a[:, :, 3]]), "RGBA").save(f)
    print(f"cor transferida de {ref.name} para {pasta.name}")


if __name__ == "__main__":
    main()
