"""Normaliza a cor dos frames de um ciclo para o tom do primeiro desenho.

Porque: cada frame foi gerado separadamente e traz um tom ligeiramente diferente. A trocar
a 10-15 fps isso le-se como cintilacao ("as pernas mudam de cor"). Aqui cada frame e
reconvertido para a media/desvio do frame de referencia (transferencia de Reinhard),
usando apenas os pixeis opacos.

Uso: py normalizar_cores.py <pasta-entrada> <pasta-saida>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def estatisticas(rgb: np.ndarray, alpha: np.ndarray):
    mask = alpha > 40
    px = rgb[mask].astype(np.float32)
    return px.mean(axis=0), px.std(axis=0) + 1e-6


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.png"):
        f.unlink()

    ficheiros = sorted(src.glob("*.png"))
    base = np.array(Image.open(ficheiros[0]).convert("RGBA"))
    mu0, sd0 = estatisticas(base[:, :, :3], base[:, :, 3])
    print(f"{len(ficheiros)} frames | referencia: mu={mu0.round(1)} sd={sd0.round(1)}")

    for p in ficheiros:
        arr = np.array(Image.open(p).convert("RGBA"))
        rgb, alpha = arr[:, :, :3], arr[:, :, 3]
        mu, sd = estatisticas(rgb, alpha)

        out = rgb.astype(np.float32)
        out = (out - mu) / sd * sd0 + mu0
        out = np.clip(out, 0, 255).astype(np.uint8)

        # preserva os pixeis transparentes como estavam
        out[alpha == 0] = rgb[alpha == 0]
        Image.fromarray(np.dstack([out, alpha]), "RGBA").save(dst / p.name)

    print("feito ->", dst)


if __name__ == "__main__":
    main()
