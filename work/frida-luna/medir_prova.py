"""Mede objectivamente os quadros da prova de animação.

Para cada quadro: conta pixéis opacos (presença de personagem), mede a altura
da mancha de cada personagem (estabilidade de tamanho) e compara quadros
consecutivos (movimento real, não imagem parada).
"""
import numpy as np
from PIL import Image

TS = (1, 6, 12, 18, 24)
# janelas aproximadas de cada personagem no quadro 960x540 (x0,x1,y0,y1)
FRIDA = (660, 880, 230, 540)
LUNA = (40, 250, 250, 540)


def altura(im, caixa):
    x0, x1, y0, y1 = caixa
    a = np.array(im.convert("RGBA"))[y0:y1, x0:x1]
    # fundo é vivido/colorido; personagem tem contorno escuro + branco/creme
    # usa saturação baixa ou escuridão para isolar o desenho
    rgb = a[:, :, :3].astype(int)
    escuro = rgb.mean(axis=2) < 110
    branco = (rgb.min(axis=2) > 200) & (rgb.max(axis=2) - rgb.min(axis=2) < 60)
    m = escuro | branco
    ys = np.nonzero(m)[0]
    return (ys.max() - ys.min() + 1) if len(ys) else 0, int(m.sum())


ims = [Image.open(f"card/_prova-{t}.png").convert("RGBA") for t in TS]
print("quadro | Frida alt/px | Luna alt/px | diff ao anterior")
prev = None
for t, im in zip(TS, ims):
    hf, pf = altura(im, FRIDA)
    hl, pl = altura(im, LUNA)
    dif = ""
    if prev is not None:
        a = np.array(im.convert("RGB")).astype(int)
        b = np.array(prev.convert("RGB")).astype(int)
        d = np.abs(a - b).mean()
        mudou = (np.abs(a - b) > 12).mean() * 100
        dif = f"{d:5.2f}  {mudou:5.1f}% pixéis"
    print(f"t={t:>2}s  |   {hf:3d} / {pf:5d}   |   {hl:3d} / {pl:5d}   | {dif}")
    prev = im
