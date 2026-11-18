"""Diagnostica a cor da sombra oval na faixa inferior de um sprite."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

p = Path(sys.argv[1])
a = np.array(Image.open(p).convert("RGBA"))
h, w, _ = a.shape
faixa = a[int(h * 0.80):, :, :]
m = faixa[:, :, 3] > 30
px = faixa[m, :3].astype(int)
if len(px):
    mx = px.max(axis=1)
    mn = px.min(axis=1)
    sat = mx - mn
    print("pixeis:", len(px))
    print("media RGB:", px.mean(axis=0).round(1))
    print("saturacao: min", sat.min(), "mediana", np.median(sat), "max", sat.max())
    print("brilho max: min", mx.min(), "mediana", np.median(mx), "max", mx.max())
    for lim in (15, 25, 40, 60):
        print(f"  sat<{lim}: {(sat < lim).mean() * 100:.1f}%  "
              f"sat<{lim} e max<235: {((sat < lim) & (mx < 235)).mean() * 100:.1f}%")
