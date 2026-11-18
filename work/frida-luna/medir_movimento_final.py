"""Mede o movimento real nos beats com acao nomeada do preview final."""
import numpy as np
from PIL import Image

# janela da Luna no quadro 960x540 (ella fica à esquerda nestes beats)
LUNA = (40, 280, 250, 540)
FRIDA = (660, 900, 230, 540)


def diff(a, b, caixa):
    x0, x1, y0, y1 = caixa
    A = np.array(a.convert("RGB"))[y0:y1, x0:x1].astype(int)
    B = np.array(b.convert("RGB"))[y0:y1, x0:x1].astype(int)
    d = np.abs(A - B)
    return 100 * (d > 12).mean(), d.mean()


ims = {t: Image.open(f"card/_final-{t}.png").convert("RGB") for t in (6, 12, 18, 24)}
for t0, t1 in ((6, 12), (12, 18), (18, 24)):
    # só comparamos dentro do MESMO beat aproximado (sem troca de cena brusca)
    for nome, caixa in (("Luna", LUNA), ("Frida", FRIDA)):
        pct, med = diff(ims[t0], ims[t1], caixa)
        print(f"t={t0}->{t1}s  {nome:6}: {pct:5.1f}% pixéis mudaram (média {med:5.2f})")
