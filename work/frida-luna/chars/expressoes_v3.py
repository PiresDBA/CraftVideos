# -*- coding: utf-8 -*-
"""
=====================================================================
  EXPRESSOES_V3.PY  —  Frida & Luna, 20 expressoes por personagem
=====================================================================

O que mudou em relacao a v2 (que o utilizador reprovou)
------------------------------------------------------
1. APAGAR PRIMEIRO.  A v2 desenhava por cima do rosto: a elipse apagada
   tinha o mesmo tamanho do olho novo, por isso o contorno escuro antigo
   ficava a espreitar por fora e lia-se como borrao.  Aqui cada zona
   (olho / sobrolho / boca) e apagada com folga e PREENCHIDA com a cor de
   pelagem local antes de se desenhar seja o que for.
2. OLHOS DE DESENHO.  Oval com contorno da propria arte, interior branco,
   iris castanho-escura grande, um brilho.  Nunca uma mancha.
3. SOBRANCELHAS DE UM TRACO.  Espessura afinada igual ao contorno da arte.
4. BOCA COM ARCO LIMPO (arco definido por 3 pontos: canto, barriga, canto).
5. EXTRAS DISCRETOS.

Contrato tecnico
----------------
BASE UNICA     cada pose parte de `blank`, que e a base aprovada com as
               feicoes antigas apagadas.  Fora da mascara de apagamento os
               pixeis sao *exactamente* os da folha aprovada (verificado no
               fim: `--verificar` compara e reporta o desvio).
PREENCHIMENTO  difusao (Laplace) multiescala com fronteira restrita a pele
               valida -> herda cor e gradiente locais sem arrastar tinta.
TRACO          uma so espessura e uma so cor, ambas amostradas da arte.
ESCALA         desenho a 4x, reduzido por BOX; saida RGBA 512 px de altura.

Uso
    D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe chars/expressoes_v3.py
    ...            --only frida     --sheet     --debug
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
BASE_DIR = HERE / "base"
OUT_DIR = HERE / "expressoes-v3"
SS = 4
FINAL_H = 512
LW = 7.0            # espessura do traco (px a 340 de largura) — medido na arte
FINAL_W = int(round(340 * FINAL_H / 640))

# --------------------------------------------------------------------------
# 1. GEOMETRIA MEDIDA NA FOLHA APROVADA  (px da base 340x640)
# --------------------------------------------------------------------------
#  olhos      c = centro, r = meia-largura/meia-altura do TRAco (borda externa)
#  sobrolho   out/inn = pontas externa/interna do traco; w = espessura maxima
#  boca       c = ancora, w = largura entre cantos
GEOM = {
    "frida": dict(
        olhos=[dict(c=(134.0, 139.0), r=(27.5, 25.0)),
               dict(c=(235.5, 121.0), r=(18.5, 27.5), clip=dict(xmax=253.0))],
        sobrolho=[dict(out=(108.0, 115.0), inn=(143.0, 88.0), w=10.0),
                  dict(out=(245.0, 100.0), inn=(215.0, 81.0), w=9.0)],
        # boca: cantos medidos na arte (o focinho e 3/4, logo assimetrico)
        boca=dict(left=(166.0, 234.0), right=(272.0, 223.0),
                  mid=(218.0, 242.0), nariz=(218.0, 197.0), filtro=0.0),
        apagar_boca=[
            ("band", ([(203.0, 200.0), (180.0, 218.0), (159.0, 239.0)], 13.0)),
            ("band", ([(238.0, 205.0), (258.0, 213.0), (280.0, 219.0)], 13.0)),
            ("band", ([(159.0, 235.0), (218.0, 243.0), (280.0, 218.0)], 12.0)),
            ("ell", (218.0, 210.0, 28.0, 26.0)),        # lingua
            ("ell", (208.0, 223.0, 17.0, 13.0)),        # ponta da prega esq.
            ("ell", (252.0, 217.0, 13.0, 10.0)),        # ponta da prega dir.
        ],
        bochecha=[dict(p=(112.0, 190.0), r=(20.0, 14.0)),
                  dict(p=(274.0, 152.0), r=(20.0, 13.0))],
        verde=dict(c=(182.0, 150.0), r=(150.0, 108.0), ymax=252.0),
        extras=dict(lagrima=(24.0, 34.0), suor=(30.0, -34.0),
                    coracoes=[(-10.0, -112.0, 15.0), (30.0, -132.0, 11.0),
                              (-46.0, -96.0, 9.0)],
                    zzz=[(34.0, -120.0, 15.0), (58.0, -140.0, 12.0),
                         (78.0, -156.0, 10.0)]),
    ),
    "luna": dict(
        olhos=[dict(c=(114.5, 96.0), r=(24.0, 31.0)),
               dict(c=(214.5, 96.5), r=(23.5, 30.5), clip=dict(xmax=236.0))],
        sobrolho=[dict(out=(99.0, 74.0), inn=(137.0, 60.0), w=9.0),
                  dict(out=(233.0, 72.0), inn=(197.0, 58.0), w=9.0)],
        boca=dict(left=(101.0, 160.0), right=(227.0, 161.0),
                  mid=(166.0, 200.0), nariz=(166.0, 176.0), filtro=0.0),
        apagar_boca=[
            ("band", ([(101.0, 160.0), (120.0, 175.0), (143.0, 192.0),
                       (167.0, 201.0), (192.0, 190.0), (214.0, 173.0),
                       (227.0, 161.0)], 15.0)),        # sorriso em w
            ("band", ([(166.0, 168.0), (166.0, 194.0)], 15.0)),    # filtro
            ("ell", (167.0, 199.0, 20.0, 11.0)),       # lingua
        ],
        bochecha=[dict(p=(96.0, 142.0), r=(18.0, 12.0)),
                  dict(p=(242.0, 140.0), r=(18.0, 12.0))],
        verde=dict(c=(168.0, 112.0), r=(112.0, 100.0), ymax=214.0),
        extras=dict(lagrima=(22.0, 32.0), suor=(28.0, -32.0),
                    coracoes=[(-6.0, -104.0, 13.0), (32.0, -124.0, 10.0),
                              (-40.0, -88.0, 8.0)],
                    zzz=[(34.0, -108.0, 13.0), (56.0, -126.0, 11.0),
                         (74.0, -142.0, 9.0)]),
    ),
}

# --------------------------------------------------------------------------
# 2. PALETA — tudo amostrado da propria arte em `sample_palette()`
# --------------------------------------------------------------------------
PAL_FALLBACK = dict(
    contorno=(56, 16, 14), iris=(52, 26, 22), pupila=(26, 10, 8),
    esclera=(253, 249, 242), lingua=(209, 56, 86), boca_cor=(88, 18, 32),
    blush=(250, 160, 165), dentes=(255, 250, 240), coracao=(226, 58, 92),
    lagrima=(104, 188, 236), suor=(156, 210, 242), zzz=(58, 82, 150),
    brilho=(255, 238, 168),
)


# --------------------------------------------------------------------------
# 3. AS 20 POSES
# --------------------------------------------------------------------------
POSES = {
    # nome          olhos                     sobrolhos      boca
    "happy":       dict(olhos="aberto",       sobrolhos="neutro",      boca="sorriso"),
    "sad":         dict(olhos="aberto",       sobrolhos="triste",      boca="franzida", extras=["lagrima"], olho_dy=3.0),
    "angry":       dict(olhos="meio_fechado", sobrolhos="zangado",     boca="aberta", extras=[], lid=0.34, boca_escala=0.92, dentes=True),
    "excited":     dict(olhos="muito_aberto", sobrolhos="levantado",   boca="sorriso_grande", extras=["brilhos"]),
    "scared":      dict(olhos="muito_aberto", sobrolhos="triste",      boca="aberta", extras=["suor"], iris=0.52, boca_escala=0.58, boca_alt=1.45),
    "tired":       dict(olhos="meio_fechado", sobrolhos="triste",      boca="franzida", extras=["zzz"], lid=0.62, lisa=True),
    "confused":    dict(olhos="espiral",      sobrolhos="desconfiado", boca="ondulada", extras=[]),
    "proud":       dict(olhos="meio_fechado", sobrolhos="levantado",   boca="sorriso_grande", extras=["brilhos"], lid=0.46),
    "surprised":   dict(olhos="muito_aberto", sobrolhos="levantado",   boca="aberta", extras=[], iris=0.66, boca_escala=0.80, boca_alt=1.15),
    "shy":         dict(olhos="meio_fechado", sobrolhos="triste",      boca="sorriso", extras=["rubor"], lid=0.52),
    "silly":       dict(olhos=["fechado", "muito_aberto"], sobrolhos="levantado", boca="lingua", extras=[]),
    "sick":        dict(olhos="meio_fechado", sobrolhos="triste",      boca="ondulada", extras=["verde", "suor"], lid=0.50),
    "worried":     dict(olhos="aberto",       sobrolhos="desconfiado", boca="franzida", extras=["suor"]),
    "mischievous": dict(olhos="lado",         sobrolhos="desconfiado", boca="sorriso_grande", extras=[], olho_dx=7.0),
    "loved":       dict(olhos="coracao",      sobrolhos="neutro",      boca="sorriso_grande", extras=["coracoes"]),
    "bored":       dict(olhos="meio_fechado", sobrolhos="neutro",      boca="franzida", extras=[], lid=0.70, lisa=True),
    "grumpy":      dict(olhos="meio_fechado", sobrolhos="zangado",     boca="franzida", extras=[], lid=0.56),
    "jealous":     dict(olhos="lado",         sobrolhos="zangado",     boca="franzida", extras=[], olho_dx=-7.0, lisa=True),
    "calm":        dict(olhos="fechado",      sobrolhos="neutro",      boca="sorriso", extras=[]),
    "lovestruck":  dict(olhos="coracao",      sobrolhos="levantado",   boca="sorriso_grande", extras=["coracoes", "rubor", "brilhos"]),
}


# ==========================================================================
# 4. UTILITARIOS GEOMETRICOS
# ==========================================================================
def qbez(p0, p1, p2, n=32):
    out = []
    for i in range(n):
        t = i / (n - 1)
        u = 1.0 - t
        out.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return out


def arc3(p0, pm, p1, n=36):
    """Arco que passa exactamente por p0, pm (barriga) e p1."""
    cx = 2.0 * pm[0] - 0.5 * (p0[0] + p1[0])
    cy = 2.0 * pm[1] - 0.5 * (p0[1] + p1[1])
    return qbez(p0, (cx, cy), p1, n)


def scale_about(pts, cx, cy, k):
    return [(cx + (p[0] - cx) * k, cy + (p[1] - cy) * k) for p in pts]


def centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def heart_pts(cx, cy, size, n=90):
    pts = []
    for i in range(n):
        t = 2.0 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = (13 * math.cos(t) - 5 * math.cos(2 * t)
             - 2 * math.cos(3 * t) - math.cos(4 * t))
        k = size / 17.0
        pts.append((cx + x * k, cy - y * k))
    return pts


def drop_pts(x, y, r, n=40):
    """Gota: circulo em baixo, ponta em cima (liquido)."""
    pts = []
    for i in range(n):
        a = 2.0 * math.pi * i / n                 # 0 = direita
        sx, sy = math.cos(a), math.sin(a)
        lift = max(0.0, -sy)                      # so a metade de cima estica
        rr = r * (1.0 + 1.55 * lift ** 1.6)
        pts.append((x + rr * sx * (1.0 - 0.45 * lift),
                    y + r * sy - r * 1.30 * lift))
    return pts


def star_pts(cx, cy, r, n=4, rot=-math.pi / 2, inner=0.30):
    pts = []
    for k in range(n * 2):
        a = rot + math.pi * k / n
        rr = r if k % 2 == 0 else r * inner
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


# ==========================================================================
# 5. CANVAS (supersampling, traco uniforme, recorte)
# ==========================================================================
class Canvas:
    def __init__(self, w, h, ss=SS):
        self.w, self.h, self.ss = w, h, ss
        self.img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def _p(self, p):
        return (p[0] * self.ss, p[1] * self.ss)

    def _w(self, v):
        return max(1, int(round(v * self.ss)))

    def poly(self, pts, fill=None, outline=None, w=1):
        self.d.polygon([self._p(p) for p in pts], fill=fill,
                       outline=outline, width=self._w(w))

    def ell(self, cx, cy, rx, ry, fill=None, outline=None, w=1):
        a = self._p((cx - rx, cy - ry))
        b = self._p((cx + rx, cy + ry))
        self.d.ellipse([a[0], a[1], b[0], b[1]], fill=fill,
                       outline=outline, width=self._w(w))

    def line(self, pts, w, fill):
        pp = [self._p(p) for p in pts]
        self.d.line(pp, fill=fill, width=self._w(w), joint="curve")
        r = w * self.ss / 2.0
        for q in (pp[0], pp[-1]):
            self.d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=fill)

    def tapered(self, pts, wmax, fill, wend=0.38, bump=0.55):
        n = len(pts)
        if n < 3:
            self.line(pts, wmax, fill)
            return
        left, right = [], []
        for i, p in enumerate(pts):
            t = i / (n - 1)
            q = pts[min(i + 1, n - 1)]
            o = pts[max(i - 1, 0)]
            dx, dy = q[0] - o[0], q[1] - o[1]
            ln = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / ln, dx / ln
            w = wmax * (wend + (1.0 - wend) * math.sin(math.pi * t) ** bump)
            left.append((p[0] + nx * w / 2, p[1] + ny * w / 2))
            right.append((p[0] - nx * w / 2, p[1] - ny * w / 2))
        self.poly(left + right[::-1], fill=fill)

    def outlined(self, pts, fill, line_col, grow=1.12):
        """Preenchimento + contorno de espessura uniforme (sem costuras)."""
        cx, cy = centroid(pts)
        self.poly(scale_about(pts, cx, cy, grow), fill=line_col)
        self.poly(pts, fill=fill)

    def compose_clip(self, fn, keep):
        """Desenha numa camada e recorta com a mascara `keep` (imagem L a 4x)."""
        tmp = Canvas(self.w, self.h, self.ss)
        fn(tmp)
        a = tmp.img.getchannel("A")
        tmp.img.putalpha(ImageChops.multiply(a, keep))
        self.img.alpha_composite(tmp.img)


# ==========================================================================
# 6. APAGAMENTO (mascara + preenchimento por difusao multiescala)
# ==========================================================================
def lum_of(rgb):
    return rgb.mean(2)


def ellipse_mask(shape, cx, cy, rx, ry):
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0


def mask_shapes(shape, shapes):
    """Rasteriza a lista de formas (ell/band/poly) numa imagem L a `SS`x."""
    h, w = shape
    im = Image.new("L", (w * SS, h * SS), 0)
    d = ImageDraw.Draw(im)
    for item in shapes:
        kind = item[0]
        if kind == "ell":
            cx, cy, rx, ry = item[1]
            lim = item[2] if len(item) > 2 else {}
            x0, y0 = (cx - rx) * SS, (cy - ry) * SS
            x1, y1 = (cx + rx) * SS, (cy + ry) * SS
            if "xmax" in lim:                     # recorte (orelha)
                x1 = min(x1, lim["xmax"] * SS)
            if x1 > x0:
                d.ellipse([x0, y0, x1, y1], fill=255)
        elif kind == "band":
            pts, wd = item[1]
            pp = [(p[0] * SS, p[1] * SS) for p in pts]
            d.line(pp, fill=255, width=max(1, int(round(wd * SS))), joint="curve")
            r = wd * SS / 2.0
            for q in (pp[0], pp[-1]):
                d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=255)
        elif kind == "poly":
            d.polygon([(p[0] * SS, p[1] * SS) for p in item[1]], fill=255)
    small = im.resize((w, h), Image.BOX)          # alfa suave (anti-aliased)
    return np.asarray(small).astype(np.float32) / 255.0


def _jacobi(work, hole, iters):
    """Difusao de Laplace dentro do buraco; a fronteira fica fixa."""
    for _ in range(iters):
        avg = (np.roll(work, 1, 0) + np.roll(work, -1, 0) +
               np.roll(work, 1, 1) + np.roll(work, -1, 1)) * 0.25
        work[hole] = avg[hole]
    return work


def column_fill(rgb, hole, ok):
    """Semeia o buraco por interpolacao vertical por coluna.

    Na arte plana as sombras e a listra sao verticais: herdar a cor da coluna
    logo acima/abaixo do buraco conserva essa estrutura (o que a difusao
    sozinha nao faz, porque espalha a media de toda a volta).
    """
    h, w = hole.shape
    ys = np.arange(h)[:, None]
    v = ok & ~hole
    above = np.maximum.accumulate(np.where(v, ys, -1), axis=0)
    big = h + 1
    below = np.minimum.accumulate(np.where(v, ys, big)[::-1], axis=0)[::-1]
    yh, xh = np.where(hole)
    ya = above[yh, xh]
    yb = below[yh, xh]
    out = rgb.astype(np.float32).copy()
    col = rgb.astype(np.float32)

    both = (ya >= 0) & (yb < h) & (yb > ya)
    t = np.zeros(len(yh), np.float32)
    t[both] = (yh[both] - ya[both]) / np.maximum(1.0, (yb[both] - ya[both]))
    val = np.zeros((len(yh), 3), np.float32)
    val[both] = (col[ya[both], xh[both]] * (1 - t[both])[:, None] +
                 col[yb[both], xh[both]] * t[both][:, None])
    only_a = (ya >= 0) & ~both
    only_b = (yb < h) & ~both & ~only_a
    val[only_a] = col[ya[only_a], xh[only_a]]
    val[only_b] = col[yb[only_b], xh[only_b]]
    rest = ~(both | only_a | only_b)
    if rest.any():                              # sem fonte na coluna
        mean = col[ok].mean(0) if ok.any() else col[hole].mean(0)
        val[rest] = mean
    out[yh, xh] = val
    return out


def _down_weighted(a, w, hs, ws):
    """Reducao 2x2 ponderada: so contribuem pixeis validos (nunca a tinta)."""
    aw = (a * w[..., None])[:hs * 2, :ws * 2].reshape(hs, 2, ws, 2, -1).sum((1, 3))
    ww = w[:hs * 2, :ws * 2].reshape(hs, 2, ws, 2).sum((1, 3))
    out = aw / np.maximum(ww, 1e-6)[..., None]
    if (ww <= 0).any():                          # sem fonte: usa a media valida
        good = ww > 0
        if good.any():
            out[~good] = out[good].mean(0)
        else:
            out[~good] = 0.0
    return out, ww


def diffuse_fill(img, hole, ok, levels=4, coarse=300, fine=40):
    """Difusao multiescala; a restricao ignora os pixeis invalidos."""
    if levels == 0 or hole.sum() == 0:
        return _jacobi(img.copy(), hole, coarse)
    hs, ws = hole.shape[0] // 2, hole.shape[1] // 2
    if hs < 3 or ws < 3:
        return _jacobi(img.copy(), hole, coarse)
    small, ww = _down_weighted(img, ok.astype(np.float32), hs, ws)
    small_hole = hole[:hs * 2, :ws * 2].reshape(hs, 2, ws, 2).max((1, 3))
    small_ok = (ww > 0) & ~small_hole
    filled = diffuse_fill(small, small_hole, small_ok, levels - 1, coarse, fine)
    up = np.asarray(Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8))
                    .resize((hole.shape[1], hole.shape[0]), Image.BILINEAR)
                    ).astype(np.float32)
    work = img.copy()
    work[hole] = up[hole]
    return _jacobi(work, hole, fine)


def local_colour_model(rgb, ring, max_cols=3, lmin=108):
    """Cores dominantes do anel em volta do buraco.

    `lmin` descarta castanhos escuros (orelha, sombra, contorno): so pelagem e
    focinho servem de fonte, que e o que impede o preenchimento de sair sujo.
    """
    if ring.sum() < 40:
        return None
    c = rgb[ring].astype(np.int32)
    q = c // 26
    key = q[:, 0] * 100000 + q[:, 1] * 1000 + q[:, 2]
    vals, counts = np.unique(key, return_counts=True)
    order = np.argsort(-counts)[:max_cols]
    cols = []
    for o in order:
        sel = key == vals[o]
        cols.append(np.median(c[sel], axis=0))
    cols = np.array(cols, np.float32)
    bright = cols[cols.mean(1) > lmin]
    if len(bright) == 0:                      # nada claro: usa o mais claro
        bright = cols[[int(np.argmax(cols.mean(1)))]]
    return bright


def inpaint_zone(rgb, alpha_mask, zone, model, tol=60.0):
    """Uma zona: difusao com fronteira restrita as cores dominantes do anel."""
    d = rgb.astype(np.int32)
    if model is None:
        valid = None
    else:
        dist = np.min(np.abs(d[..., None, :] - model[None, None, :, :]).sum(-1), axis=-1)
        valid = dist < tol
    sub = inpaint(rgb, alpha_mask, valid)
    return np.where(zone[..., None], sub, rgb)


def inpaint(zones_rgb, alpha_mask, valid):
    """Preenche uma zona (alpha_mask) com pelagem local por difusao."""
    hole = alpha_mask > 0.004
    if not hole.any():
        return zones_rgb
    ys, xs = np.where(hole)
    pad = 10
    y0, y1 = max(0, ys.min() - pad), min(zones_rgb.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(zones_rgb.shape[1], xs.max() + pad + 1)
    sub = zones_rgb[y0:y1, x0:x1].astype(np.float32)
    m = hole[y0:y1, x0:x1]

    ok = ~m                                     # so vizinhos validos servem
    if valid is not None:
        ok = ok & valid[y0:y1, x0:x1]
    if ok.sum() < 40:
        ok = ~m
    init = column_fill(sub.astype(np.uint8), m, ok).astype(np.float32)
    filled = diffuse_fill(init, m, ok, levels=3, coarse=220, fine=26)

    a = alpha_mask[y0:y1, x0:x1][..., None]
    out = zones_rgb.copy()
    out[y0:y1, x0:x1] = np.clip(sub * (1.0 - a) + filled * a, 0, 255).astype(np.uint8)
    return out


def build_alpha(rgb):
    """Alfa por flood-fill do fundo creme (a folha nao tem halo)."""
    lum = lum_of(rgb)
    sat = rgb.max(2).astype(np.int16) - rgb.min(2).astype(np.int16)
    bgish = (lum > 200) & (sat < 34)
    lab, _ = ndi.label(bgish)
    edge = np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))
    edge = edge[edge > 0]
    bg = np.isin(lab, edge)
    bg = ndi.binary_dilation(bg, iterations=1)
    a = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), "L")
    return np.asarray(a.filter(ImageFilter.GaussianBlur(0.7)))


def erase_shapes(who):
    """Tudo o que tem de desaparecer antes de desenhar."""
    g = GEOM[who]
    shapes = []
    for e in g["olhos"]:                        # olho inteiro + folga (a
        cx, cy = e["c"]                         # forma da arte nao e uma
        rx, ry = e["r"]                         # elipse perfeita -> folga)
        shapes.append(("ell", (cx, cy, rx * 1.16 + 2.0, ry * 1.10 + 2.0),
                       e.get("clip", {})))
    for b in g["sobrolho"]:                     # traco do sobrolho + folga
        shapes.append(("band", ([b["out"], b["inn"]], b["w"] + 7.0)))
    shapes += g["apagar_boca"]
    return shapes


def sample_palette(rgb, who):
    """Amostra contorno / iris / esclera da propria arte."""
    g = GEOM[who]
    lum = lum_of(rgb)
    pal = dict(PAL_FALLBACK)

    head = np.zeros(lum.shape, bool)
    head[:300, :] = True
    stroke = head & (lum < 48)
    if stroke.sum() > 200:
        pal["contorno"] = tuple(int(v) for v in np.median(rgb[stroke], axis=0))

    eye = np.zeros(lum.shape, bool)
    for e in g["olhos"]:
        cx, cy = e["c"]
        rx, ry = e["r"]
        eye |= ellipse_mask(lum.shape, cx, cy, rx - 2, ry - 2)
    iris = eye & (lum < 105)
    if iris.sum() > 300:
        pal["iris"] = tuple(int(v) for v in np.median(rgb[iris], axis=0))
    white = eye & (lum > 232) & (np.abs(rgb[..., 2].astype(int) - rgb[..., 1]) < 60)
    if white.sum() > 60:
        pal["esclera"] = tuple(int(v) for v in np.median(rgb[white], axis=0))

    c = np.array(pal["contorno"], float)
    # a iris tem de se distinguir da pupila: clareia-se um pouco o castanho
    # amostrado (nunca inventar preto puro)
    iris = np.array(pal["iris"], float)
    pal["iris"] = tuple(int(v) for v in np.clip(
        iris * 0.62 + np.array([138.0, 84.0, 58.0]) * 0.38, 0, 255))
    pal["pupila"] = tuple(int(v) for v in np.clip(iris * 0.72, 0, 255))
    return pal


_CACHE = {}


def load_char(who):
    if who in _CACHE:
        return _CACHE[who]
    im = Image.open(BASE_DIR / f"{who}.png").convert("RGB")
    if im.size != (340, 640):
        raise SystemExit(f"base {who} inesperada: {im.size}")
    rgb = np.asarray(im).astype(np.uint8)
    pal = sample_palette(rgb, who)
    alpha = build_alpha(rgb)
    # preenche FORMA a forma: cada uma com o modelo de cor da SUA volta
    blank = rgb.copy()
    full = np.zeros(rgb.shape[:2], np.float32)
    for op in erase_shapes(who):
        z = mask_shapes(rgb.shape[:2], [op])
        full = np.maximum(full, z)
        zone = z > 0.05
        if zone.sum() < 20:
            continue
        band = (ndi.binary_dilation(zone, iterations=10) &
                ~ndi.binary_dilation(zone, iterations=2))
        model = local_colour_model(rgb, band)
        blank = inpaint_zone(blank, z, zone, model)
    _CACHE[who] = dict(rgb=rgb, blank=blank, alpha=alpha, mask=full, pal=pal)
    return _CACHE[who]


# ==========================================================================
# 7. OLHOS
# ==========================================================================
def _glint(c, x, y, rx, ry, col=(255, 255, 255)):
    c.ell(x, y, rx, ry, fill=col)


def draw_iris(c, cx, cy, ri, pal, kind="normal"):
    c.ell(cx, cy, ri, ri, fill=pal["iris"])
    c.ell(cx, cy, ri * 0.60, ri * 0.60, fill=pal["pupila"])
    _glint(c, cx - ri * 0.38, cy - ri * 0.42, ri * 0.30, ri * 0.26)


def eye_aberto(c, e, pal, lw=LW, iris=0.72, sh=(0.0, 0.0), **_):
    cx, cy = e["c"]
    rx, ry = e["r"]
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    ri = min(rx, ry) * iris
    draw_iris(c, cx + sh[0], cy + ry * 0.08 + sh[1], ri, pal)


def eye_muito_aberto(c, e, pal, lw=LW, iris=0.66, **_):
    cx, cy = e["c"]
    rx, ry = e["r"][0] * 1.03, e["r"][1] * 1.03
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    draw_iris(c, cx, cy - ry * 0.02, min(rx, ry) * iris, pal)


def eye_fechado(c, e, pal, lw=LW, **_):
    """Arco unico para baixo (cantos descem) — o olho fechado da arte."""
    cx, cy = e["c"]
    rx, ry = e["r"]
    pts = arc3((cx - rx * 0.94, cy + ry * 0.22),
               (cx, cy - ry * 0.62),
               (cx + rx * 0.94, cy + ry * 0.22), 34)
    c.tapered(pts, lw * 1.45, pal["contorno"], wend=0.34)


def eye_meio_fechado(c, e, pal, lw=LW, lid=0.45, iris=0.80, sh=(0.0, 0.0), side=0, **_):
    """Palpebra a cortar o olho por cima; so a parte de baixo aparece."""
    cx, cy = e["c"]
    rx, ry = e["r"]
    yl = cy + ry * (2.0 * lid - 1.0)            # altura da palpebra
    tilt = 0.16 * ry * (-1.0 if side == 0 else 1.0)

    def lid_y(x):
        return yl + tilt * (x - cx) / rx

    keep = Image.new("L", (c.w * SS, c.h * SS), 0)
    kd = ImageDraw.Draw(keep)
    poly = [(cx - rx - 6, lid_y(cx - rx - 6)), (cx + rx + 6, lid_y(cx + rx + 6)),
            (cx + rx + 6, cy + ry + 6), (cx - rx - 6, cy + ry + 6)]
    kd.polygon([(p[0] * SS, p[1] * SS) for p in poly], fill=255)

    def body(t):
        t.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
        draw_iris(t, cx + sh[0], yl + ry * 0.30 + sh[1], min(rx, ry) * iris, pal)

    c.compose_clip(body, keep)
    lid_line = [(cx - rx - 1.0, lid_y(cx - rx - 1.0)),
                (cx, lid_y(cx) - ry * 0.06),
                (cx + rx + 1.0, lid_y(cx + rx + 1.0))]
    c.line(lid_line, lw, pal["contorno"])


def eye_coracao(c, e, pal, lw=LW, **_):
    cx, cy = e["c"]
    rx, ry = e["r"]
    s = min(rx, ry) * 0.92
    pts = heart_pts(cx, cy + s * 0.10, s)
    c.outlined(pts, pal["coracao"], pal["contorno"], grow=1.16)
    _glint(c, cx - s * 0.36, cy - s * 0.10, s * 0.16, s * 0.12, (255, 236, 242))


def eye_espiral(c, e, pal, lw=LW, **_):
    cx, cy = e["c"]
    rx, ry = e["r"]
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    pts = []
    n, turns = 110, 2.6
    for i in range(n):
        t = i / (n - 1)
        a = -math.pi / 2 + t * turns * 2 * math.pi
        rr = (1.0 - 0.92 * t) * 0.74
        pts.append((cx + rx * rr * math.cos(a), cy + ry * rr * math.sin(a)))
    c.tapered(pts, lw * 0.55, pal["contorno"], wend=1.0, bump=0.0)


def eye_lado(c, e, pal, lw=LW, dx=6.0, iris=0.80, **_):
    cx, cy = e["c"]
    rx, ry = e["r"]
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    ri = min(rx, ry) * iris
    lim = max(0.0, rx - ri - lw * 0.55)
    draw_iris(c, cx + max(-lim, min(lim, dx)), cy + ry * 0.04, ri, pal)


EYES = {
    "aberto": eye_aberto,
    "muito_aberto": eye_muito_aberto,
    "fechado": eye_fechado,
    "meio_fechado": eye_meio_fechado,
    "coracao": eye_coracao,
    "espiral": eye_espiral,
    "lado": eye_lado,
}


# ==========================================================================
# 8. SOBROLHOS  (um traco so, inclinacao = emocao)
# ==========================================================================
BROWS = {                      # (dy_interno, dy_externo, arco, espessura)
    "neutro":      (0.0, 0.0, 2.5, 1.00),
    "triste":      (-6.0, 4.0, 1.5, 0.95),
    "zangado":     (7.0, -4.0, 0.5, 1.06),
    "levantado":   (-7.0, -7.0, 5.0, 0.92),
    "desconfiado": (-5.0, 1.0, 3.0, 0.98),
}


def draw_brow(c, b, variant, idx, pal, lw=LW):
    d_in, d_out, arch, k = BROWS[variant]
    if variant == "desconfiado":
        d_in, d_out, arch = (-6.0, 0.0, 4.0) if idx == 0 else (4.0, -3.0, 0.5)
    p_out = (b["out"][0], b["out"][1] + d_out)
    p_in = (b["inn"][0], b["inn"][1] + d_in)
    mid = ((p_out[0] + p_in[0]) / 2.0, (p_out[1] + p_in[1]) / 2.0 - arch)
    pts = arc3(p_out, mid, p_in, 30)
    c.tapered(pts, b["w"] * k, pal["contorno"], wend=0.34, bump=0.5)


# ==========================================================================
# 9. BOCA      (ancoras da arte: canto esq, centro, canto dir — nunca a mao)
# ==========================================================================
def _anchors(m, esc=1.0, lift=0.0, dm=0.0):
    """Cantos + centro com deslocamento; `esc` abre/fecha a boca."""
    mx = (m["left"][0] + m["right"][0]) * 0.5
    my = (m["left"][1] + m["right"][1]) * 0.5
    L = (mx + (m["left"][0] - mx) * esc, my + (m["left"][1] - my) * esc + lift)
    R = (mx + (m["right"][0] - mx) * esc, my + (m["right"][1] - my) * esc + lift)
    M = (mx, m["mid"][1] + dm)
    return L, M, R


def mouth_sorriso(c, m, pal, lw=LW, esc=1.0, alt=1.0, **_):
    L, M, R = _anchors(m, esc)
    pts = arc3(L, M, R, 40)
    c.tapered(pts, lw * 1.26, pal["contorno"], wend=0.30)
    for s, P in ((-1, L), (1, R)):              # cantos com o gancho da arte
        c.line([P, (P[0] + s * 3.0, P[1] - 6.0)], lw * 0.50, pal["contorno"])
    return (M[0], M[1] - lw * 0.5)


def mouth_sorriso_grande(c, m, pal, lw=LW, esc=1.0, alt=1.0, **_):
    """Sorriso grande: interior escuro + lingua + cantos levantados."""
    L, M, R = _anchors(m, esc, lift=-5.0, dm=7.0 * alt)
    lo = arc3(L, M, R, 44)
    up = [(L[0] + (M[0] - L[0]) * 0.5, M[1] - 13.0 * alt),
          (R[0] + (M[0] - R[0]) * 0.5, M[1] - 13.0 * alt)]
    hi = arc3(L, (M[0], M[1] - 15.0 * alt), R, 44)
    body = lo + hi[::-1]
    c.poly(body, fill=pal["boca_cor"])
    c.ell(M[0], M[1] - 3.0 * alt, 15.0 * alt, 7.0 * alt, fill=pal["lingua"])
    c.poly(body, outline=pal["contorno"], w=lw)
    for s, P in ((-1, L), (1, R)):
        c.line([P, (P[0] + s * 4.0, P[1] - 7.0)], lw * 0.55, pal["contorno"])
    return (M[0], M[1] - 9.0 * alt)


def mouth_aberta(c, m, pal, lw=LW, esc=1.0, alt=1.0, dentes=False, **_):
    L, M, R = _anchors(m, esc)
    span = abs(R[0] - L[0])
    rx = span * 0.155 * alt
    ry = rx * 1.12
    cy = M[1] - 3.0 * alt
    c.ell(M[0], cy, rx, ry, fill=pal["boca_cor"], outline=pal["contorno"], w=lw)
    c.ell(M[0], cy + ry * 0.52, rx * 0.58, ry * 0.38, fill=pal["lingua"])
    if dentes:
        c.poly([(M[0] - rx * 0.72, cy - ry * 0.68), (M[0] + rx * 0.72, cy - ry * 0.68),
                (M[0] + rx * 0.58, cy - ry * 0.26), (M[0] - rx * 0.58, cy - ry * 0.26)],
               fill=pal["dentes"])
    return (M[0], cy - ry)


def mouth_lingua(c, m, pal, lw=LW, esc=1.0, alt=1.0, **_):
    L, M, R = _anchors(m, esc)
    pts = arc3(L, M, R, 38)
    c.tapered(pts, lw * 1.12, pal["contorno"], wend=0.32)
    r = abs(R[0] - L[0]) * 0.075
    c.outlined(drop_pts(M[0], M[1] + r * 0.9, r, 34)[::-1], pal["lingua"],
               pal["contorno"], grow=1.22)
    return (M[0], M[1])


def mouth_franzida(c, m, pal, lw=LW, esc=1.0, alt=1.0, lisa=False, **_):
    """Arco para baixo (cantos descem, centro sobe) — sempre dentro do focinho."""
    mx = (m["left"][0] + m["right"][0]) * 0.5
    mid_y = m["mid"][1]
    if lisa:                                    # quase recta
        L = (m["left"][0], mid_y + 2.0)
        R = (m["right"][0], mid_y + 2.0)
        pts = arc3(L, (mx, mid_y - 4.0), R, 32)
        c.tapered(pts, lw * 0.80, pal["contorno"], wend=0.52)
        return (mx, mid_y - 4.0)
    L = (m["left"][0], mid_y + 7.0)
    R = (m["right"][0], mid_y + 5.0)
    pts = arc3(L, (mx, mid_y - 14.0), R, 34)
    c.tapered(pts, lw * 1.05, pal["contorno"], wend=0.38)
    c.line([(mx, mid_y - 20.0), (mx, mid_y - 28.0)], lw * 0.48, pal["contorno"])
    return (mx, mid_y - 14.0)


def mouth_ondulada(c, m, pal, lw=LW, esc=1.0, alt=1.0, **_):
    L, _, R = _anchors(m, esc)
    span = abs(R[0] - L[0])
    amp = 8.0 * alt
    my = m["mid"][1] - 2.0
    pts, n = [], 80
    for i in range(n):
        t = i / (n - 1)
        pts.append((L[0] + t * span, my + amp * math.sin(t * 3.0 * 2 * math.pi)))
    c.tapered(pts, lw * 0.90, pal["contorno"], wend=0.42)
    return ((L[0] + R[0]) * 0.5, my)


MOUTHS = {
    "sorriso": mouth_sorriso,
    "sorriso_grande": mouth_sorriso_grande,
    "aberta": mouth_aberta,
    "lingua": mouth_lingua,
    "franzida": mouth_franzida,
    "ondulada": mouth_ondulada,
}


# ==========================================================================
# 10. EXTRAS
# ==========================================================================
def x_lagrima(c, pal, p, s=1.0, **__):
    x, y = p
    c.outlined(drop_pts(x, y, 5.4 * s, 34)[::-1], pal["lagrima"],
               pal["contorno"], grow=1.24)
    _glint(c, x - 1.6 * s, y + 0.6 * s, 1.5 * s, 1.2 * s)


def x_suor(c, pal, p, s=1.0, **__):
    x, y = p
    c.outlined(drop_pts(x, y, 6.0 * s, 34)[::-1], pal["suor"],
               pal["contorno"], grow=1.22)
    _glint(c, x - 1.8 * s, y + 0.8 * s, 1.6 * s, 1.3 * s)


def x_coracoes(c, pal, spots, **__):
    for (x, y, s) in spots:
        c.outlined(heart_pts(x, y, s), pal["coracao"], pal["contorno"], grow=1.15)
        _glint(c, x - s * 0.36, y - s * 0.14, s * 0.17, s * 0.13, (255, 236, 242))


def x_zzz(c, pal, spots, **__):
    for (x, y, s) in spots:
        w = s * 0.92
        pts = [(x, y), (x + w, y), (x, y + w), (x + w, y + w)]
        c.line(pts, 8.2, (255, 253, 246))
        c.line(pts, 4.6, pal["zzz"])


def x_rubor(c, pal, cheeks, **__):
    layer = Image.new("RGBA", (c.w, c.h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for ck in cheeks:
        x, y = ck["p"]
        rx, ry = ck["r"]
        d.ellipse([x - rx, y - ry, x + rx, y + ry],
                  fill=pal["blush"] + (150,))
    layer = layer.filter(ImageFilter.GaussianBlur(4.0))
    layer = layer.resize(c.img.size, Image.BILINEAR)
    c.img.alpha_composite(layer)


def x_brilhos(c, pal, spots, eye_box, **__):
    (x0, y0, x1, y1) = eye_box
    for (dx, dy, k) in spots:
        x = x0 + dx * (x1 - x0)
        y = y0 + dy * (y1 - y0)
        r = 9.0 * k
        c.poly(scale_about(star_pts(x, y, r), x, y, 1.55), fill=(255, 252, 240))
        c.poly(star_pts(x, y, r), fill=pal["brilho"])
        c.poly(star_pts(x, y, r * 0.45), fill=(255, 255, 250))


EXTRAS = {
    "lagrima": x_lagrima,
    "suor": x_suor,
    "coracoes": x_coracoes,
    "zzz": x_zzz,
    "rubor": x_rubor,
    "brilhos": x_brilhos,
}


def apply_green(rgb, g, alpha, eyes=None):
    """Veu verde so na pelagem: o contorno (escuro) e o branco do olho ficam."""
    h, w = rgb.shape[:2]
    ell = ellipse_mask((h, w), g["c"][0], g["c"][1], g["r"][0], g["r"][1])
    yy = np.mgrid[0:h, 0:w][0]
    ell &= yy < g["ymax"]
    if eyes:                                    # nao tinge a esclera
        for e in eyes:
            cx, cy = e["c"]
            rx, ry = e["r"]
            ell &= ~ellipse_mask((h, w), cx, cy, rx * 1.25, ry * 1.25)
    m = Image.fromarray((ell * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(8))
    veil = (np.asarray(m).astype(np.float32) / 255.0)
    veil *= (lum_of(rgb) > 86).astype(np.float32)      # nao pinta o traco
    a = (veil * 0.34)[..., None]
    verde = np.array([150.0, 186.0, 132.0])
    out = np.clip(rgb * (1.0 - a) + verde * a, 0, 255).astype(np.uint8)
    keep = np.stack([veil > 0.002] * 3, -1) & (alpha[..., None] > 0)
    return np.where(keep, out, rgb)


# ==========================================================================
# 11. RENDER
# ==========================================================================
def render(who, spec):
    d = load_char(who)
    pal = d["pal"]
    g = GEOM[who]
    rgb = d["blank"].copy()

    c = Canvas(340, 640)
    olhos = spec["olhos"]
    if isinstance(olhos, str):
        olhos = [olhos, olhos]
    kw = dict(lid=spec.get("lid", 0.45), dx=spec.get("olho_dx", 6.0),
              iris=spec.get("iris", 0.80), sh=(0.0, spec.get("olho_dy", 0.0)))

    for i, (style, eye) in enumerate(zip(olhos, g["olhos"])):
        fn = EYES[style]
        if fn is eye_meio_fechado:
            fn(c, eye, pal, side=i, **kw)
        elif fn is eye_lado:
            fn(c, eye, pal, dx=kw["dx"] * (1 if i == 0 else -1), iris=kw["iris"])
        else:
            fn(c, eye, pal, **{k: v for k, v in kw.items() if k != "dx"})
        draw_brow(c, g["sobrolho"][i], spec["sobrolhos"], i, pal)

    m = g["boca"]
    meet = MOUTHS[spec["boca"]](c, m, pal, esc=spec.get("boca_escala", 1.0),
                                alt=spec.get("boca_alt", 1.0),
                                lisa=spec.get("lisa", False),
                                dentes=spec.get("dentes", False))
    nx, ny = m["nariz"]
    filtro = m.get("filtro", 0.0)
    if filtro > 0.0:                            # vinco curto nariz->labio
        c.line([(nx, ny), (meet[0], ny + filtro)], LW * 0.58, pal["contorno"])

    ex = g["extras"]
    eye0 = g["olhos"][0]
    for name in spec.get("extras", []):
        if name == "verde":
            continue
        if name == "lagrima":
            x_lagrima(c, pal, (eye0["c"][0] - eye0["r"][0] * 0.55 + ex["lagrima"][0],
                               eye0["c"][1] + eye0["r"][1] * 0.85 + ex["lagrima"][1] * 0.2),
                      s=1.0)
        elif name == "suor":
            x_suor(c, pal, (eye0["c"][0] + eye0["r"][0] + ex["suor"][0],
                            eye0["c"][1] - eye0["r"][1] + ex["suor"][1]), s=1.0)
        elif name == "coracoes":
            bx, by = g["olhos"][0]["c"]
            x_coracoes(c, pal, [(bx + dx, by + dy, s) for dx, dy, s in ex["coracoes"]])
        elif name == "zzz":
            bx, by = g["olhos"][1]["c"]
            x_zzz(c, pal, [(bx + dx, by + dy, s) for dx, dy, s in ex["zzz"]])
        elif name == "rubor":
            x_rubor(c, pal, g["bochecha"])
        elif name == "brilhos":
            x0 = eye0["c"][0] - eye0["r"][0]
            x1 = g["olhos"][1]["c"][0] + g["olhos"][1]["r"][0]
            y0 = min(e["c"][1] - e["r"][1] for e in g["olhos"])
            y1 = max(e["c"][1] + e["r"][1] for e in g["olhos"])
            x_brilhos(c, pal, [(-0.02, -0.30, 1.0), (1.03, -0.06, 0.62)],
                      (x0, y0, x1, y1))

    layer = c.img.resize((340, 640), Image.BOX)
    base = Image.fromarray(rgb).convert("RGBA")
    base.putalpha(Image.fromarray(d["alpha"], "L"))
    fig = Image.alpha_composite(base, layer)

    if "verde" in spec.get("extras", []):
        arr = apply_green(np.asarray(fig.convert("RGB")), g["verde"],
                          np.asarray(fig.getchannel("A")), g["olhos"])
        fig = Image.fromarray(np.dstack([arr, np.asarray(fig.getchannel("A"))]), "RGBA")

    return fig.resize((FINAL_W, FINAL_H), Image.LANCZOS)


# ==========================================================================
# 12. VERIFICACAO (corpo identico)
# ==========================================================================
def verify(who):
    """Confirma que fora da mascara de apagamento nada mudou na base."""
    d = load_char(who)
    diff = np.abs(d["blank"].astype(int) - d["rgb"].astype(int)).max(2)
    inside = d["mask"] > 0.004
    outside = diff[~inside]
    return dict(pixels_apagados=int(inside.sum()),
                desvio_maximo_fora=int(outside.max()),
                desvio_medio_fora=float(outside.mean()),
                contorno="#%02X%02X%02X" % d["pal"]["contorno"],
                iris="#%02X%02X%02X" % d["pal"]["iris"],
                esclera="#%02X%02X%02X" % d["pal"]["esclera"])


# ==========================================================================
# 13. CONTACT SHEETS
# ==========================================================================
def _font(size, bold=True):
    for n in (["arialbd.ttf", "seguisb.ttf", "arial.ttf"] if bold else ["arial.ttf"]):
        try:
            return ImageFont.truetype(str(Path("C:/Windows/Fonts") / n), size)
        except Exception:
            continue
    return ImageFont.load_default()


def contact_sheet(paths, out):
    cols, rows = 5, 4
    cw, ch = 250, 390
    pad, top = 12, 62
    W = cols * 2 * cw + pad * 3
    H = top + rows * ch + pad
    sheet = Image.new("RGB", (W, H), (244, 233, 216))
    d = ImageDraw.Draw(sheet)
    names = list(POSES.keys())
    f_t, f_l = _font(34), _font(20)
    ih = ch - 52
    for block, who in enumerate(("frida", "luna")):
        bx = pad + block * (cols * cw + pad)
        d.text((bx + 8, 12), who.upper(), font=f_t, fill=(74, 32, 20))
        for i, name in enumerate(names):
            r, ci = divmod(i, cols)
            x, y = bx + ci * cw, top + r * ch
            d.rounded_rectangle([x + 4, y + 4, x + cw - 4, y + ch - 8], 14,
                                fill=(252, 246, 236), outline=(214, 194, 170))
            im = paths[(who, name)]
            k = ih / im.height
            im2 = im.resize((max(1, int(im.width * k)), ih), Image.LANCZOS)
            sheet.paste(im2, (x + (cw - im2.width) // 2, y + 10), im2)
            tw = d.textlength(name, font=f_l)
            d.text((x + (cw - tw) / 2, y + ch - 40), name, font=f_l, fill=(92, 44, 26))
    sheet.save(out)
    return sheet


def face_sheet(paths, out, k=2.2):
    """Grelha de caras a 2.2x — para a auto-revisao do desenho."""
    cols, rows = 5, 4
    cw, ch = int(FINAL_W * k) + 14, int(FINAL_H * 0.34 * k) + 40
    W, H = cols * 2 * cw + 20, rows * ch + 46
    sheet = Image.new("RGB", (W, H), (250, 246, 238))
    d = ImageDraw.Draw(sheet)
    f_l = _font(18)
    names = list(POSES.keys())
    for block, who in enumerate(("frida", "luna")):
        for i, name in enumerate(names):
            r, ci = divmod(i, cols)
            x = block * (cols * cw) + 10 + ci * cw
            y = 40 + r * ch
            im = paths[(who, name)]
            crop = im.crop((0, 0, im.width, int(im.height * 0.34)))
            im2 = crop.resize((int(crop.width * k), int(crop.height * k)), Image.LANCZOS)
            sheet.paste(im2, (x, y), im2)
            d.text((x + 4, y + im2.height + 2), f"{who[:1]}:{name}", font=f_l,
                   fill=(80, 40, 24))
    sheet.save(out)
    return sheet


# ==========================================================================
# 14. MAIN
# ==========================================================================
def main(argv):
    only = None
    for i, a in enumerate(argv):
        if a == "--only":
            only = argv[i + 1]
    debug = "--debug" in argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    whos = [only] if only else ["frida", "luna"]
    manifest = {"gerado_por": "chars/expressoes_v3.py", "escala": SS,
                "altura_final": FINAL_H, "traco_px": LW,
                "metodo": ("apaga a feicao (mascara geometrica medida na arte) -> "
                           "preenche com a pelagem local (interpolacao por coluna "
                           "+ difusao multiescala, fontes restritas as cores do "
                           "anel) -> so depois desenha a feicao nova"),
                "verificacao": ("fora da mascara de apagamento os pixeis sao "
                                "identicos a folha aprovada; o corpo e o mesmo em "
                                "todas as 20 poses"),
                "bases": {}, "poses": {}}
    paths = {}

    for who in whos:
        (OUT_DIR / who).mkdir(parents=True, exist_ok=True)
        info = verify(who)
        manifest["bases"][who] = dict(ficheiro=f"base/{who}.png",
                                      tamanho_base=[340, 640],
                                      olhos=GEOM[who]["olhos"],
                                      boca=GEOM[who]["boca"], **info)
        print(f"[{who}] apagados {info['pixels_apagados']} px | desvio fora da "
              f"mascara {info['desvio_maximo_fora']} | contorno "
              f"{info['contorno']} iris {info['iris']}")
        for name, spec in POSES.items():
            im = render(who, spec)
            im.save(OUT_DIR / who / f"{name}.png")
            paths[(who, name)] = im
            manifest["poses"].setdefault(name, {})[who] = spec
        print(f"[{who}] {len(POSES)} expressoes -> {OUT_DIR / who}")

    with open(OUT_DIR / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    if len(whos) == 2:
        sp = OUT_DIR / "_contact.png"
        contact_sheet(paths, sp)
        print("contact ->", sp)
        face_sheet(paths, OUT_DIR / "_faces.png")

    if debug:
        for who in whos:
            d = load_char(who)
            vis = d["rgb"].copy()
            a = d["mask"][..., None]
            vis = (d["rgb"] * (1 - a) + np.array([255, 0, 0]) * a).astype(np.uint8)
            Image.fromarray(vis[:300]).resize((680, 600), Image.LANCZOS).save(
                HERE / f"_dbg_mask_{who}.png")
            Image.fromarray(d["blank"][:300]).resize((680, 600), Image.LANCZOS).save(
                HERE / f"_dbg_blank_{who}.png")
        print("debug -> _dbg_mask_*.png / _dbg_blank_*.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))











