"""Estabiliza os frames de um ciclo: ancora pelo centro do tronco.

O problema: nos desenhos gerados, o corpo deriva lateralmente dentro da linha, por isso o
ciclo nao fecha e a animacao parece uma passadeira (salto a cada fim de linha).

Solucao: em cada frame, calcula o centro horizontal do tronco (excluindo as pernas) e
desloca o frame para esse centro ficar sempre no mesmo x. A linha de base (pes) mantem-se.

Uso: py estabilizar_ciclo.py <pasta-entrada> <pasta-saida>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def centro_tronco(a: np.ndarray) -> float:
    h, w = a.shape
    tronco = a[int(h * 0.30):int(h * 0.72), :]
    ys, xs = np.nonzero(tronco)
    return float(xs.mean()) if len(xs) else w / 2


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.png"):
        f.unlink()

    frames = [Image.open(p).convert("RGBA") for p in sorted(src.glob("*.png"))]
    alvos = [centro_tronco(np.array(f)[:, :, 3]) for f in frames]
    alvo = float(np.median(alvos))
    print(f"{len(frames)} frames | centro alvo = {alvo:.1f}")

    for i, (f, cx) in enumerate(zip(frames, alvos)):
        dx = int(round(alvo - cx))
        canvas = Image.new("RGBA", f.size, (0, 0, 0, 0))
        canvas.paste(f, (dx, 0), f)
        canvas.save(dst / f"f{i:02d}.png")
        print(f"  f{i:02d}: desvio {dx:+d} px")

    print("feito ->", dst)


if __name__ == "__main__":
    main()
