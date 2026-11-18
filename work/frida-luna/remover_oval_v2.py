#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remove a oval creme de QUALQUER frame, preservando o contorno e SEM deixar buracos.

Método: a oval é uma mancha CLARA (creme, baixa saturação, valor alto) que toca
a base da imagem. Remove-se só essa mancha; depois preenchem-se micro-regiões
transparentes fechadas com a cor vizinha (sem tocar em transparência ligada à borda).
"""
import numpy as np
from PIL import Image
from scipy import ndimage


def remover(im, verbose=False):
    a = np.array(im.convert('RGBA')).copy()
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(int)
    al = a[..., 3]
    y0 = int(h * 0.84)                      # faixa dos pés
    faixa = rgb[y0:]
    # cor creme dominante na faixa (pixéis claros e pouco saturados)
    faixa_hsv = faixa.max(axis=2) - faixa.min(axis=2)
    claros = faixa[(faixa.min(axis=2) > 168) & (faixa_hsv < 70) & (al[y0:] > 80)]
    if len(claros) < 20:
        return im, 0
    cor = np.median(claros, axis=0)
    dif = np.abs(faixa - cor).max(axis=2)
    alvo = (dif <= 46) & (faixa.min(axis=2) > 162) & (al[y0:] > 50)
    #.remove só componentes ligadas à base da imagem (a oval), não o corpo
    lab, n = ndimage.label(alvo, np.ones((3, 3)))
    removidos = 0
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(xs) < 40:
            continue
        toca_base = ys.max() >= (h - y0) - 5
        larga = (xs.max() - xs.min()) > w * 0.22
        if toca_base or larga:
            a[y0 + ys, xs, 3] = 0
            removidos += len(xs)
    # fechar micro-buracos (transparência FECHADA, não ligada à borda)
    m = a[..., 3] <= 40
    lab2, n2 = ndimage.label(m, np.ones((3, 3)))
    borda = set(np.unique(np.concatenate([lab2[0,:], lab2[-1,:], lab2[:,0], lab2[:,-1]])))
    for i in range(1, n2 + 1):
        if i in borda:
            continue
        ys, xs = np.nonzero(lab2 == i)
        if len(xs) > 300:
            continue
        # vizinhança opaca
        viz = []
        for dy in (-2,-1,0,1,2):
            for dx in (-2,-1,0,1,2):
                yy, xx = ys+dy, xs+dx
                ok = (yy>=0)&(yy<h)&(xx>=0)&(xx<w)
                vv = a[yy[ok], xx[ok], 3] > 128
                if vv.any():
                    viz.append(a[yy[ok], xx[ok], :3][vv])
        if viz:
            cor2 = np.median(np.vstack(viz), axis=0).astype(np.uint8)
            a[ys, xs, :3] = cor2
            a[ys, xs, 3] = 255
    return Image.fromarray(a, 'RGBA'), removidos


if __name__ == '__main__':
    import sys
    im = Image.open(sys.argv[1]).convert('RGBA')
    out, n = remover(im)
    A = np.array(im).astype(int); B = np.array(out).astype(int)
    cont = (A[...,:3].mean(axis=2) < 110) & (A[...,3] > 100)
    dano = int((cont & (np.abs(A[...,3]-B[...,3])>60)).sum())
    print(f'{sys.argv[1]}: removidos={n} dano_contorno={dano}')
    out.save(sys.argv[2])
