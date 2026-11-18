"""Mede movimento por personagem numa amostra renderizada (sem IA)."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

pasta = Path(sys.argv[1])
fs = sorted(pasta.glob("q_*.png"))
a = [np.asarray(Image.open(p).convert("L"), dtype=np.float32) for p in fs]
regioes = {"frida": (560, 840, 180, 500), "luna": (160, 400, 180, 500)}
for nome, (x0, x1, y0, y1) in regioes.items():
    ds = [float(np.abs(a[i][y0:y1, x0:x1] - a[i + 1][y0:y1, x0:x1]).mean())
          for i in range(len(a) - 1)]
    vivos = sum(1 for v in ds if v > 0.15)
    print(f"{nome:6} movimento medio {np.mean(ds):.3f} | max {max(ds):.3f} | "
          f"frames com movimento {vivos}/{len(ds)}")
