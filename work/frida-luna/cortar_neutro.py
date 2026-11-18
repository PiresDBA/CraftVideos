#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cortador robusto para folhas do Flow com fundo NEUTRO (branco/creme/cinza/xadrez).

O cortar_mascara.py usa 'cor da borda' e falha em fundo xadrez (os tons de cinza
nao ligam todos). Aqui o fundo e definido por ser NEUTRO: R~G~B e claro.
As personagens sao coloridas (castanho, creme quente, bandana roxa, colar de
perolas) ou escuras (contorno) — entram na mascara.

Resultado: um PNG por figura, recortado ao bbox, com canal alpha real.

Uso: py cortar_neutro.py <imagem> <pasta-saida> <frida|luna>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

BASE = Path(r"D:\CRAFT\work\frida-luna")
ALVO = {"frida": (173, 231), "luna": (167, 265)}


def mascara(im):
    a = np.array(im.convert("RGB")).astype(np.int16)
    mx, mn = a.max(axis=2), a.min(axis=2)
    # fundo neutro: R~G~B e claro. figura: saturada ou escura.
    # mx<125: so contornos quase pretos. Fundos xadrez podem ter cinza 155-160.
    fig = ((mx - mn) > 10) | (mx < 125)
    fig = ndi.binary_closing(fig, np.ones((3, 3)), iterations=1)
    fig = ndi.binary_opening(fig, np.ones((2, 2)), iterations=1)
    return fig


def recortar(imagem, dest, quem, area_min=1400):
    im = Image.open(imagem).convert("RGBA")
    src = np.array(im)
    fig = mascara(im)
    rot, n = ndi.label(fig)
    if n == 0:
        return 0
    areas = ndi.sum(fig, rot, index=range(1, n + 1))
    caixas = ndi.find_objects(rot)
    comps = []
    for i, area in enumerate(areas):
        if area < area_min:
            continue
        sl = caixas[i]
        if sl is None:
            continue
        yc = (sl[0].start + sl[0].stop) / 2
        comps.append((i + 1, float(area), sl, yc))
    if not comps:
        return 0

    # folhas de 2 filas: aproveitar TODAS as figuras (a animacao so usa os frames,
    # nao importa a disposicao original). Ordenar por fila (topo -> baixo) e por x.
    ys = sorted(c[3] for c in comps)
    faixas = []
    atual = [ys[0]]
    for y in ys[1:]:
        if y - atual[-1] > im.height * 0.18:
            faixas.append(atual)
            atual = [y]
        else:
            atual.append(y)
    faixas.append(atual)
    limites = [(min(f), max(f)) for f in faixas]
    ordenados = []
    for y0, y1 in limites:
        fila = [c for c in comps if y0 - 1 <= c[3] <= y1 + 1]
        fila.sort(key=lambda c: c[2][1].start)
        ordenados += fila
    comps = ordenados

    if dest.exists():
        for f in dest.glob("*.png"):
            f.unlink()
    else:
        dest.mkdir(parents=True)

    W, H = ALVO[quem]
    out = []
    for k, area, sl, _ in comps:
        m = (rot[sl] == k)
        rgba = np.dstack([src[sl][:, :, :3], np.where(m, src[sl][:, :, 3], 0).astype(np.uint8)])
        f = Image.fromarray(rgba, "RGBA")
        ys2, xs2 = np.nonzero(m)
        if len(xs2) < 300:
            continue
        x0, x1 = xs2.min(), xs2.max() + 1
        y0, y1 = ys2.min(), ys2.max() + 1
        f = f.crop((x0, y0, x1, y1))
        # margem transparente de 12% de cada lado: garante borda com alpha=0
        # (o validador exige >=85%) e respiração em redor da figura.
        mx = max(2, round(f.width * 0.12))
        my = max(2, round(f.height * 0.12))
        padded = Image.new("RGBA", (f.width + 2 * mx, f.height + 2 * my), (0, 0, 0, 0))
        padded.paste(f, (mx, my), f)
        out.append(padded)
    for i, f in enumerate(out):
        f.resize((W, H), Image.LANCZOS).save(dest / f"f{i:02d}.png")
    return len(out)


def main():
    imagem, dest, quem = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    n = recortar(imagem, dest, quem)
    print(f"{n} figuras -> {dest}")


if __name__ == "__main__":
    main()
