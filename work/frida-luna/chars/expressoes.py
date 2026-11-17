# -*- coding: utf-8 -*-
"""
=====================================================================
 EXPRESSOES.PY  —  sistema parametrico de expressoes (Frida & Luna)
=====================================================================

MANUAL DE USO
-------------

O que faz
    Le a base aprovada (`chars/base/<quem>.png`, 340x640, vista 3/4),
    APAGA os tracos da cara (olhos, sobrolhos, boca) e VOLTA A DESENHAR
    esses tracos a partir de parametros. O corpo nao e tocado: e o mesmo
    pixel da folha aprovada em todas as 20 poses. E por isso que as
    expressoes sao consistentes -- nao ha geracao por pose.

    Nada de IA, nada de SVG, nada de rede. So PIL + numpy + scipy.

Como correr
    D:\\Comfy\\ComfyUI\\venv\\Scripts\\python.exe chars/expressoes.py
    ...            --debug      # dump do "miolo": base apagada + mascara
    ...            --only frida # so um personagem
    ...            --sheet      # reconstroi a contact sheet

Saida
    chars/expressoes-v2/<quem>/<pose>.png   RGBA, 512 px de altura, fundo transparente
    chars/expressoes-v2/manifest.json       mapa pose -> parametros
    chars/expressoes-v2/_contact.png        40 celulas etiquetadas

Como a consistencia e garantida (contrato tecnico)
    1. BASE UNICA   -- cada pose faz `base.copy()`. Zero alteracoes ao corpo.
    2. APAGAMENTO   -- olhos: elipse medida (o que esta dentro sai);
       sobrolhos: componentes escuros isolados; boca: componentes escuros/rosa
       dentro de um poligono tracado a mao + elipse de proteccao do nariz.
       O preenchimento e harmonico (Laplace em piramide) -> herda exactamente
       a cor e o gradiente da pelagem local.
    3. ANCORAGEM    -- os olhos desenhados usam o CENTRO e o RAIO medidos na
       folha aprovada, logo caem exactamente sobre os olhos originais.
    4. TRACO UNICO  -- uma so espessura (LW) e uma so cor de contorno
       (amostrada da arte: #38100E / #3A100F) para todas as 40 figuras.
    5. SEM ESCALA   -- o desenho e feito a 4x (anti-aliasing por BOX 4:1) e
       so no fim reduzido para 512 px; a espessura relativa nao muda.

Como acrescentar uma pose
    1. Escreve uma linha em POSES com olhos / sobrolhos / boca / extras.
    2. Valores validos:
         olhos      aberto | fechado | muito_aberto | meio_fechado |
                    coracao | espiral | lado
         sobrolhos  neutro | triste | zangado | levantado | desconfiado
         boca       sorriso | sorriso_grande | aberta | lingua |
                    franzida | ondulada
         extras     lagrima | suor | coracoes | zzz | rubor | verde | brilhos
       (olhos aceita par: ["fechado", "muito_aberto"] para piscar)
    3. Volta a correr. Na duvida ver `--debug`, que mostra o que foi apagado.

Notas de regra (PERSONAGENS.md)
    - Proporcao Frida:Luna = 1,00:0,50 -- nao e tocada por este script: cada
      figura sai na sua propria altura normalizada (base), e a diferenca de
      massa aparece na composicao das cenas, nao aqui.
    - Nao se redesenha o corpo para "combinar" com a expressao.
=====================================================================
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage as ndi

# --------------------------------------------------------------------------
# 0. CAMINHOS E CONSTANTES GERAIS
# --------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent          # .../chars
BASE_DIR = HERE / "base"                        # bases recortadas (340x640)
OUT_DIR = HERE / "expressoes-v2"                # destino das expressoes
SS = 4                                          # supersampling do desenho
FINAL_H = 512                                   # altura final (px)
LW = 5.2                                        # espessura base do traco (px @340)
DARK = 80                                       # limiar do nucleo do traco

# --------------------------------------------------------------------------
# 1. PALETA + GEOMETRIA  (tudo em coordenadas da base, 340x640)
# --------------------------------------------------------------------------
#  `olhos`  -> centro e raio EXACTOS medidos na folha aprovada (nao inventar!)
#  `tilt`   -> inclinacao natural do sobrolho na arte (interno sobe)
#  `apagar` -> olhos: elipses medidas; sobrolhos: caças+componentes;
#              boca: poligonos tracados + sementes + proteccao do nariz
CFG = {
    "frida": dict(
        # --- cores amostradas da propria arte ------------------------------
        contorno=(56, 16, 14),      # #38100E  contorno do desenho
        iris=(46, 8, 18),           # #2E0812  iris castanho-escuro
        pupila=(20, 4, 8),          # mais escuro, centro da pupila
        esclera=(255, 253, 248),    # branco quente
        lingua=(209, 56, 86),       # #D13856
        boca_cor=(92, 20, 34),      # interior da boca
        blush=(253, 154, 159),      # #FD9A9F blush da arte
        dentes=(255, 249, 238),
        coracao=(226, 58, 92),
        lagrima_cor=(92, 184, 234),
        suor_cor=(150, 206, 240),
        zzz_cor=(64, 86, 146),
        brilho=(255, 244, 196),
        # --- olhos (centro, raios) ----------------------------------------
        olhos=[dict(c=(131.5, 142.5), r=(25.5, 29.5)),
               dict(c=(237.0, 127.0), r=(20.5, 30.0))],
        # --- sobrolhos (centro, largura) + inclinacao natural --------------
        sobrolho=[dict(c=(127.0, 101.0), w=33.0),
                  dict(c=(233.0, 82.0), w=33.0)],
        tilt=(-9.0, 7.0),
        # --- boca: ancora, largura, base do nariz (filtro) ------------------
        boca=dict(mx=222.0, my=214.0, w=100.0, filtro=(216.0, 181.0)),
        # --- apagamento ----------------------------------------------------
        apagar=dict(
            olhos=[(131.5, 142.5, 27.5, 31.5), (237.0, 127.0, 22.5, 32.0)],
            sobrolhos=[((104, 84, 150, 118), (127, 101)),
                        ((212, 68, 254, 96), (233, 82))],
            vincos=[([(200, 94), (252, 88), (254, 118), (202, 128)], (222, 108))],
            boca=dict(
                polys=[[(190, 184), (268, 184), (274, 196), (280, 206),
                        (282, 218), (276, 230), (262, 234), (248, 230),
                        (240, 226), (228, 231), (212, 234), (198, 235),
                        (186, 232), (182, 220), (184, 202)]],
                sementes=[(222, 205), (220, 200)],
                protege=[(224.0, 156.0, 31.0, 24.0)]),
        ),
        # --- extras: onde caem ---------------------------------------------
        lagrima=dict(p=(144.0, 181.0), s=1.30),
        suor=dict(p=(258.0, 66.0), s=1.05),
        coracoes=[dict(p=(150.0, 20.0), s=15.0),
                  dict(p=(188.0, 6.0), s=11.0),
                  dict(p=(116.0, 38.0), s=9.0)],
        zzz=[dict(p=(252.0, 40.0), s=16.0),
             dict(p=(276.0, 22.0), s=13.0),
             dict(p=(296.0, 6.0), s=10.0)],
        rubor=[dict(p=(103.0, 186.0), r=(18.0, 12.0)),
               dict(p=(274.0, 152.0), r=(19.0, 12.0))],
        verde=dict(c=(172.0, 158.0), r=(150.0, 122.0), corte=242.0),
    ),
    "luna": dict(
        contorno=(58, 16, 15),      # #3A100F
        iris=(20, 16, 28),          # #14101C
        pupila=(10, 6, 14),
        esclera=(252, 251, 255),
        lingua=(196, 58, 92),
        boca_cor=(78, 18, 32),
        blush=(242, 160, 166),
        dentes=(255, 250, 240),
        coracao=(226, 58, 92),
        lagrima_cor=(92, 184, 234),
        suor_cor=(150, 206, 240),
        zzz_cor=(64, 86, 146),
        brilho=(255, 244, 196),
        olhos=[dict(c=(115.0, 95.5), r=(26.5, 32.0)),
               dict(c=(212.0, 94.0), r=(27.0, 33.0))],
        sobrolho=[dict(c=(116.0, 37.0), w=33.0),
                  dict(c=(217.0, 41.0), w=30.0)],
        tilt=(-11.0, 9.0),
        boca=dict(mx=168.0, my=189.0, w=96.0, filtro=(170.0, 179.0)),
        apagar=dict(
            olhos=[(115.0, 95.5, 28.5, 34.0), (212.0, 94.0, 29.0, 35.0)],
            sobrolhos=[((96, 22, 138, 54), (116, 37)),
                        ((198, 24, 238, 60), (217, 41))],
            vincos=[],
            boca=dict(
                polys=[
                    [(138, 168), (200, 168), (203, 194), (192, 210),
                     (150, 210), (140, 194)],                       # cavidade+lingua
                    [(88, 142), (116, 132), (164, 178), (138, 200)],  # linha esq.
                    [(228, 140), (240, 148), (204, 186), (196, 176)],  # linha dir.
                ],
                sementes=[(170, 190), (160, 198)],
                protege=[(168.0, 150.0, 40.0, 27.0)]),
        ),
        lagrima=dict(p=(128.0, 128.0), s=0.85),
        suor=dict(p=(198.0, 58.0), s=0.85),
        coracoes=[dict(p=(214.0, 14.0), s=13.0),
                  dict(p=(242.0, -2.0), s=9.0),
                  dict(p=(252.0, 32.0), s=8.0)],
        zzz=[dict(p=(232.0, 44.0), s=14.0),
             dict(p=(254.0, 26.0), s=11.0),
             dict(p=(272.0, 9.0), s=9.0)],
        rubor=[dict(p=(100.0, 128.0), r=(15.0, 10.0)),
               dict(p=(240.0, 126.0), r=(15.0, 10.0))],
        verde=dict(c=(168.0, 140.0), r=(112.0, 104.0), corte=204.0),
    ),
}

# --------------------------------------------------------------------------
# 2. AS 20 POSES  (so isto muda entre figuras)
# --------------------------------------------------------------------------
POSES = {
    "happy":       dict(olhos="aberto",        sobrolhos="neutro",      boca="sorriso",        extras=[]),
    "sad":         dict(olhos="aberto",        sobrolhos="triste",      boca="franzida",       extras=["lagrima"], olho_dy=2.5),
    "angry":       dict(olhos="meio_fechado",  sobrolhos="zangado",     boca="aberta",         extras=[], lid=0.30, boca_escala=0.62, dentes=True),
    "excited":     dict(olhos="muito_aberto",  sobrolhos="levantado",   boca="sorriso_grande", extras=["brilhos"]),
    "scared":      dict(olhos="muito_aberto",  sobrolhos="triste",      boca="aberta",         extras=["suor"], boca_escala=0.72, boca_alt=1.5),
    "tired":       dict(olhos="meio_fechado",  sobrolhos="triste",      boca="franzida",       extras=["zzz"], lid=0.56),
    "confused":    dict(olhos="espiral",       sobrolhos="desconfiado", boca="ondulada",       extras=[]),
    "proud":       dict(olhos="meio_fechado",  sobrolhos="levantado",   boca="sorriso",        extras=["brilhos"], lid=0.42),
    "surprised":   dict(olhos="muito_aberto",  sobrolhos="levantado",   boca="aberta",         extras=[], boca_escala=0.78, boca_alt=1.25),
    "shy":         dict(olhos="meio_fechado",  sobrolhos="triste",      boca="sorriso",        extras=["rubor"], lid=0.50),
    "silly":       dict(olhos=["fechado", "muito_aberto"], sobrolhos="levantado", boca="lingua", extras=[]),
    "sick":        dict(olhos="meio_fechado",  sobrolhos="triste",      boca="ondulada",       extras=["verde", "suor"], lid=0.46),
    "worried":     dict(olhos="aberto",        sobrolhos="desconfiado", boca="franzida",       extras=["suor"]),
    "mischievous": dict(olhos="lado",          sobrolhos="desconfiado", boca="sorriso_grande", extras=[], olho_dx=6),
    "loved":       dict(olhos="coracao",       sobrolhos="neutro",      boca="sorriso",        extras=["coracoes"]),
    "bored":       dict(olhos="meio_fechado",  sobrolhos="neutro",      boca="franzida",       extras=[], lid=0.66, lisa=True),
    "grumpy":      dict(olhos="meio_fechado",  sobrolhos="zangado",     boca="franzida",       extras=[], lid=0.60),
    "jealous":     dict(olhos="lado",          sobrolhos="zangado",     boca="franzida",       extras=[], olho_dx=-6, lisa=True),
    "calm":        dict(olhos="fechado",       sobrolhos="neutro",      boca="sorriso",        extras=[]),
    "lovestruck":  dict(olhos="coracao",       sobrolhos="levantado",   boca="sorriso_grande", extras=["coracoes", "rubor", "brilhos"]),
}


# ==========================================================================
# 3. UTILITARIOS GEOMETRICOS
# ==========================================================================
def qbez(p0, p1, p2, n=28):
    """Bezier quadratica -> lista de pontos (n amostras)."""
    out = []
    for i in range(n):                      # i = indice da amostra
        t = i / (n - 1)                     # t em [0,1]
        u = 1.0 - t                         # complementar
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        out.append((x, y))
    return out


def heart_pts(cx, cy, size, n=88):
    """Contorno de um coracao (curva classica), centrado em (cx,cy)."""
    pts = []
    for i in range(n):
        t = 2.0 * math.pi * i / n                       # volta completa
        x = 16 * math.sin(t) ** 3                       # lobulos
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        k = size / 17.0                                 # normaliza para `size`
        pts.append((cx + x * k, cy - y * k))            # y invertido (ecra)
    return pts


def star_pts(cx, cy, r, inner=0.28, n=4, rot=-math.pi / 2):
    """Estrela de brilho: 8 vertices alternando raio externo/interno."""
    pts = []
    for k in range(n * 2):                              # 8 pontos para n=4
        ang = rot + math.pi * k / n                     # passo angular
        rr = r if k % 2 == 0 else r * inner             # alterna ponta/ vale
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    return pts


# ==========================================================================
# 4. CANVAS — desenho a 4x com traco de espessura constante
# ==========================================================================
class Canvas:
    """Camada RGBA em supersampling; todas as coordenadas em px da base."""

    def __init__(self, w, h, ss=SS):
        self.ss = ss                                    # factor de ampliacao
        self.img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.spark = (170.0, 140.0, 70.0, 40.0)         # ancora dos brilhos

    # -- conversoes --------------------------------------------------------
    def _p(self, p):
        return (p[0] * self.ss, p[1] * self.ss)

    def _w(self, v):
        return max(1, int(round(v * self.ss)))

    # -- primitivas --------------------------------------------------------
    def poly(self, pts, fill=None, outline=None, w=1):
        self.d.polygon([self._p(p) for p in pts], fill=fill,
                       outline=outline, width=self._w(w))

    def ell(self, cx, cy, rx, ry, fill=None, outline=None, w=1):
        a = self._p((cx - rx, cy - ry))                 # canto superior esquerdo
        b = self._p((cx + rx, cy + ry))                 # canto inferior direito
        self.d.ellipse([a[0], a[1], b[0], b[1]], fill=fill,
                       outline=outline, width=self._w(w))

    def line(self, pts, w, fill):
        """Polilinha de largura constante, pontas redondas."""
        pp = [self._p(p) for p in pts]
        self.d.line(pp, fill=fill, width=self._w(w), joint="curve")
        r = w * self.ss / 2.0                           # raio da ponta
        for q in (pp[0], pp[-1]):                       # caps redondos
            self.d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=fill)

    def tapered(self, pts, wmax, fill, wend=0.40, bump=0.6):
        """Traco com espessura variavel (grosso no meio, fino nas pontas)."""
        n = len(pts)
        if n < 3:                                       # degenerado -> linha simples
            self.line(pts, wmax, fill)
            return
        left, right = [], []
        for i, p in enumerate(pts):
            t = i / (n - 1)                             # posicao ao longo do traco
            q = pts[min(i + 1, n - 1)]                  # ponto seguinte
            o = pts[max(i - 1, 0)]                      # ponto anterior
            dx, dy = q[0] - o[0], q[1] - o[1]           # tangente local
            ln = math.hypot(dx, dy) or 1.0              # comprimento
            nx, ny = -dy / ln, dx / ln                  # normal unitaria
            w = wmax * (wend + (1.0 - wend) * math.sin(math.pi * t) ** bump)
            left.append((p[0] + nx * w / 2, p[1] + ny * w / 2))
            right.append((p[0] - nx * w / 2, p[1] - ny * w / 2))
        self.poly(left + right[::-1], fill=fill)        # poligono fechado

    def pasted_clip(self, draw_fn, clip_poly):
        """Desenha numa camada temporaria e recorta pela polilinha dada."""
        tmp = Canvas(self.img.width // self.ss, self.img.height // self.ss, self.ss)
        draw_fn(tmp)                                    # desenha o conteudo
        mask = Image.new("L", tmp.img.size, 0)          # mascara de recorte
        ImageDraw.Draw(mask).polygon([tmp._p(p) for p in clip_poly], fill=255)
        keep = Image.composite(tmp.img.getchannel("A"),
                               Image.new("L", tmp.img.size, 0), mask)
        tmp.img.putalpha(keep)                          # aplica o recorte
        self.img.alpha_composite(tmp.img)               # junta a camada


# ==========================================================================
# 5. APAGAMENTO DOS TRACOS (inpainting harmonico, sem IA)
# ==========================================================================
def _lum(rgb):
    """Luminancia em 0..255."""
    return rgb.mean(axis=2)


def _pinkish(rgb):
    """Mascara do rosa (lingua): vermelho alto, azul acima do verde."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    return (r > 145) & (r - g > 50) & (b > g + 4) & (g < 150)


def _poly_mask(shape, polys):
    """Mascara booleana da uniao de poligonos."""
    im = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon([(float(x), float(y)) for x, y in p], fill=255)
    return np.asarray(im) > 127


def _components(src, region, seeds, pad=3):
    """Componentes de `src` dentro de `region` que tocam uma das sementes."""
    lab, _ = ndi.label(src & region, structure=np.ones((3, 3)))   # 8-conectividade
    ids = set()
    for sx, sy in seeds:
        sl = lab[max(0, sy - pad):sy + pad + 1, max(0, sx - pad):sx + pad + 1]
        ids.update(int(v) for v in np.unique(sl) if v > 0)        # etiquetas tocadas
    if not ids:
        return np.zeros(src.shape, bool)
    return np.isin(lab, list(ids))                                 # so essas


def _ellipse_mask(shape, ell, pad=0.0):
    """Mascara booleana de uma elipse (cx,cy,rx,ry) com folga."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy, rx, ry = ell
    return ((xx - cx) / (rx + pad)) ** 2 + ((yy - cy) / (ry + pad)) ** 2 <= 1.0


def build_erase_mask(who, rgb):
    """Mascara de pixeis a apagar + mapa de fontes validas para o preenchimento.

    Fontes: pele (saturada, nem escura nem branca) nas zonas de olho/sobrolho;
    cor clara (o focinho) na zona da boca. Assim o preenchimento nunca puxa
    tinta escura de um contorno proximo.
    """
    cfg = CFG[who]
    lum = _lum(rgb)
    sat = rgb.max(2).astype(np.int16) - rgb.min(2).astype(np.int16)
    dark = lum < DARK                                   # nucleo do traco
    pink = _pinkish(rgb)                                # lingua
    notstroke = (lum > 105) & ~pink                     # tudo menos traco/lingua
    fur = notstroke & (sat > 55) & (lum < 152)          # pele (nao o focinho claro)
    pale = notstroke                                    # cor local (focinho/tan)
    m = np.zeros(lum.shape, bool)

    for (cx, cy, rx, ry) in cfg["apagar"]["olhos"]:     # olhos: elipse medida
        m |= _ellipse_mask(lum.shape, (cx, cy, rx, ry))

    reg_sb = np.zeros(lum.shape, bool)                  # zona dos sobrolhos
    for box, seed in cfg["apagar"]["sobrolhos"]:
        x0, y0, x1, y1 = box
        reg_sb[y0:y1, x0:x1] = True
        m |= _components(dark, reg_sb, [seed])

    for poly, seed in cfg["apagar"].get("vincos", []):  # vincos de palpebra
        reg = _poly_mask(lum.shape, [poly])
        m |= _components(dark, reg, [seed])

    b = cfg["apagar"]["boca"]                           # boca: poligono + componentes
    reg_bc = _poly_mask(lum.shape, b["polys"])
    m |= _components(dark | pink, reg_bc, b["sementes"])
    prot = np.zeros(lum.shape, bool)                    # protege o nariz...
    for e in b["protege"]:
        prot |= _ellipse_mask(lum.shape, e)
    for (cx, cy, rx, ry) in cfg["apagar"]["olhos"]:     # ...mas nunca os olhos
        prot &= ~_ellipse_mask(lum.shape, (cx, cy, rx + 1.0, ry + 1.0))
    m &= ~prot

    m = ndi.binary_dilation(m, iterations=2)            # folga anti-residuo

    src = np.ones(lum.shape, bool)                      # mapa de fontes
    zona_olhos = np.zeros(lum.shape, bool)              # zona alargada dos olhos
    for (cx, cy, rx, ry) in cfg["apagar"]["olhos"]:
        zona_olhos |= _ellipse_mask(lum.shape, (cx, cy, rx + 6, ry + 6))
    zona_olhos |= ndi.binary_dilation(reg_sb, iterations=22)
    src[zona_olhos] = fur[zona_olhos]                   # ai so pele serve
    zona_boca = ndi.binary_dilation(reg_bc, iterations=10)
    src[zona_boca] = pale[zona_boca]                    # ai so cor clara serve
    src[prot] = False                                   # o nariz nunca e fonte
    return m, src


def _down2(a):
    """Reduz para metade por media 2x2 (piramide)."""
    h, w = a.shape[:2]
    h2, w2 = (h // 2) * 2, (w // 2) * 2
    a = a[:h2, :w2]
    c = a.shape[2] if a.ndim == 3 else 1
    return a.reshape(h2 // 2, 2, w2 // 2, 2, c).mean(axis=(1, 3))


def _up2(a, size):
    """Amplia com bilinear ate `size` = (altura, largura)."""
    chans = []
    for i in range(a.shape[2]):
        img = Image.fromarray(a[..., i].astype(np.float32), mode="F")
        chans.append(np.asarray(img.resize((size[1], size[0]), Image.BILINEAR)))
    return np.stack(chans, axis=-1)


def inpaint(rgb, mask, src=None, blur=2.4):
    """Preenchimento por vizinho-mais-proximo (Voronoi) + suavizacao interior.

    Para arte plana (cartoon) e o metodo certo: cada pixel apagado herda a cor
    de um pixel BOM proximo. `src` diz que cores podem servir de fonte (pele
    nas zonas de olho/sobrolho, cor clara na zona da boca), o que impede que um
    contorno escuro vizinho se arraste para dentro da area apagada.
    """
    ys, xs = np.where(mask)
    if ys.size == 0:
        return rgb
    y0, y1 = max(0, ys.min() - 4), min(rgb.shape[0], ys.max() + 5)
    x0, x1 = max(0, xs.min() - 4), min(rgb.shape[1], xs.max() + 5)
    sub = rgb[y0:y1, x0:x1].astype(np.float32)          # regiao de trabalho
    m = mask[y0:y1, x0:x1]

    allowed = ~m                                        # fontes possiveis
    if src is not None:
        allowed = allowed & src[y0:y1, x0:x1]
        if not allowed.any():                           # fallback de seguranca
            allowed = ~m
    ind = ndi.distance_transform_edt(~allowed, return_distances=False,
                                     return_indices=True)
    fill = sub[ind[0], ind[1]]                          # cor da fonte mais perto
    dist = ndi.distance_transform_edt(~allowed)         # distancia a fonte

    sm = Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8), "RGB")
    sm = sm.filter(ImageFilter.GaussianBlur(blur))      # suaviza o interior
    smooth = np.asarray(sm).astype(np.float32)

    w = np.clip((dist - 1.2) / 2.2, 0.0, 1.0)[..., None]   # 0 no bordo, 1 dentro
    res = fill * (1.0 - w) + smooth * w
    out = rgb.copy()
    out[y0:y1, x0:x1] = np.clip(
        np.where(m[..., None], res, sub), 0, 255).astype(np.uint8)
    return out


def build_alpha(who, rgb):
    """Alfa por flood-fill do fundo creme (a folha limpa nao tem halo)."""
    lum = _lum(rgb)
    sat = rgb.max(2).astype(np.int16) - rgb.min(2).astype(np.int16)
    bgish = (lum > 200) & (sat < 32)                    # creme do fundo
    lab, _ = ndi.label(bgish)                           # componentes do fundo
    edge = np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))
    edge = edge[edge > 0]
    bg = np.isin(lab, edge)                             # so o fundo que toca a borda
    bg = ndi.binary_dilation(bg, iterations=1)          # come o anti-aliasing
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.7))
    return np.asarray(a)


# ==========================================================================
# 6. OLHOS
# ==========================================================================
def _iris(c, cx, cy, ri, pal, sh=(0.0, 0.0), hi=1.0):
    """Iris + pupila + brilhos (usado por varias formas de olho)."""
    ix, iy = cx + sh[0], cy + sh[1]                     # centro da iris
    c.ell(ix, iy, ri, ri, fill=pal["iris"])             # iris
    c.ell(ix, iy, ri * 0.58, ri * 0.58, fill=pal["pupila"])   # pupila
    if hi > 0:                                          # brilhos (luz de cima-esq.)
        c.ell(ix - ri * 0.40, iy - ri * 0.44, ri * 0.30 * hi, ri * 0.23 * hi,
              fill=pal["esclera"])                      # brilho grande
        c.ell(ix + ri * 0.42, iy + ri * 0.40, ri * 0.14 * hi, ri * 0.12 * hi,
              fill=pal["esclera"])                      # brilho pequeno


def eye_aberto(c, e, pal, lw=LW, ir=0.76, sh=(0.0, 0.0), **_):
    """Olho normal: esclera branca, contorno grosso, iris grande."""
    cx, cy = e["c"]                                     # centro medido na arte
    rx, ry = e["r"]                                     # raios medidos
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    _iris(c, cx, cy + ry * 0.09, min(rx, ry) * ir, pal,
          sh=(sh[0] - 2.0, sh[1] + 1.5))                 # iris baixa/esquerda


def eye_muito_aberto(c, e, pal, lw=LW, **_):
    """Olho arregalado: esclera maior, iris mais pequena (muito branco)."""
    cx, cy = e["c"]
    rx, ry = e["r"][0] * 1.04, e["r"][1] * 1.04         # cresce 4%
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    _iris(c, cx, cy + ry * 0.02, min(rx, ry) * 0.62, pal)   # iris pequena


def eye_meio_fechado(c, e, pal, lid=0.45, lw=LW, sh=(0.0, 0.0), **_):
    """Olho com a palpebra em cima: metade de baixo visivel + linha da palpebra."""
    cx, cy = e["c"]
    rx, ry = e["r"]
    ylid = cy + ry * (2.0 * lid - 1.0)                  # altura da palpebra
    d = max(-0.97, min(0.97, (ylid - cy) / ry))         # seno do corte
    u0 = math.asin(d)                                   # angulo do corte
    poly, n = [], 44
    for i in range(n + 1):                              # arco inferior visivel
        u = u0 + (math.pi - 2 * u0) * i / n
        poly.append((cx + rx * math.cos(u), cy + ry * math.sin(u)))

    def _fill(t):                                       # interior recortado
        t.ell(cx, cy, rx, ry, fill=pal["esclera"])
        _iris(t, cx, ylid + ry * 0.26, min(rx, ry) * 0.72, pal, sh=sh)

    c.pasted_clip(_fill, poly)
    c.line(poly, lw, pal["contorno"])                   # contorno do arco
    c.line([poly[0], (cx, ylid + ry * 0.08), poly[-1]], lw, pal["contorno"])


def eye_fechado(c, e, pal, lw=LW, **_):
    """Olho fechado: curva unica a rir (arco para cima)."""
    cx, cy = e["c"]
    rx, ry = e["r"]
    pts = qbez((cx - rx * 0.95, cy + ry * 0.30),
               (cx, cy - ry * 0.85),
               (cx + rx * 0.95, cy + ry * 0.30), 30)
    c.tapered(pts, lw * 1.40, pal["contorno"], wend=0.35)


def eye_coracao(c, e, pal, lw=LW, **_):
    """Olhos de coracao: coracao cheio com contorno e brilho."""
    cx, cy = e["c"]
    rx, ry = e["r"]
    s = min(rx, ry) * 1.02                              # tamanho do coracao
    c.poly(heart_pts(cx, cy + s * 0.16, s * 1.02),
           fill=pal["coracao"], outline=pal["contorno"], w=lw)
    c.ell(cx - s * 0.34, cy - s * 0.18, s * 0.17, s * 0.13, fill=(255, 235, 238))


def eye_espiral(c, e, pal, lw=LW, **_):
    """Olho tonto: esclera com espiral escura por dentro."""
    cx, cy = e["c"]
    rx, ry = e["r"]
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    pts, turns, n = [], 3.0, 120
    for i in range(n):
        t = i / (n - 1)                                 # 0..1
        ang = t * turns * 2 * math.pi                   # angulo da espiral
        rr = 1.0 - 0.90 * t                             # raio decrescente
        pts.append((cx + rx * 0.78 * rr * math.cos(ang),
                    cy + ry * 0.78 * rr * math.sin(ang)))
    c.line(pts, lw * 0.62, pal["contorno"])             # linha da espiral


def eye_lado(c, e, pal, lw=LW, dx=5.0, **_):
    """Olhar de lado: iris encostada a uma das bordas."""
    cx, cy = e["c"]
    rx, ry = e["r"]
    c.ell(cx, cy, rx, ry, fill=pal["esclera"], outline=pal["contorno"], w=lw)
    ri = min(rx, ry) * 0.80
    lim = max(0.0, rx - ri - lw * 0.6)
    d = max(-lim, min(lim, dx))
    _iris(c, cx + d, cy + ry * 0.04, ri, pal, hi=0.85)


EYES = {
    "aberto": eye_aberto,
    "muito_aberto": eye_muito_aberto,
    "meio_fechado": eye_meio_fechado,
    "fechado": eye_fechado,
    "coracao": eye_coracao,
    "espiral": eye_espiral,
    "lado": eye_lado,
}


# ==========================================================================
# 7. SOBROLHOS
# ==========================================================================
# deltas aplicados a inclinacao natural (dy_interno, dy_externo, arco, espessura, subida)
BROWS = {
    "neutro":      (0.0, 0.0, 4.0, 1.00, 0.0),
    "triste":      (-5.0, 4.0, 2.5, 1.00, -2.0),
    "zangado":     (14.0, -12.0, 1.5, 1.10, 1.0),
    "levantado":   (-3.0, -3.0, 7.0, 0.95, -8.0),
    "desconfiado": (-4.0, 0.0, 6.0, 1.00, -3.0),
}


def draw_brow(c, b, variant, idx, pal, tilt, lw=LW):
    """Sobrolho: bezier de grossura variavel; `idx` decide a assimetria."""
    cx, cy = b["c"]
    w = b["w"]
    d_in, d_out, arch, k, lift = BROWS[variant]
    side = 1.0 if idx == 0 else -1.0            # lado do nariz (interno)
    if variant == "desconfiado" and idx == 1:   # sobrolho direito baixa e achata
        d_in, d_out, arch, lift = 2.0, 0.0, 2.0, 2.0
    inner = (cx + side * w * 0.50, cy + tilt[0] + d_in + lift)
    outer = (cx - side * w * 0.50, cy + tilt[1] + d_out + lift)
    ctrl = (cx - side * w * 0.06, cy - arch + lift - 1.0)
    pts = qbez(outer, ctrl, inner, 26)
    c.tapered(pts, lw * 1.70 * k, pal["contorno"], wend=0.52, bump=0.55)


# ==========================================================================
# 8. BOCA
# ==========================================================================
def _filter_line(c, x, y0, y1, pal, lw=LW):
    """Filtro (linha do nariz ate a boca) — mantem a leitura da arte."""
    c.line([(x, y0), (x, y1)], lw * 0.95, pal["contorno"])


def mouth_sorriso(c, mx, my, w, pal, lw=LW, deep=1.0, **_):
    """Sorriso suave: arco para baixo, fino nas pontas."""
    h = w * 0.22
    pts = qbez((mx - w * 0.50, my - h * 0.45),
               (mx, my + h * 1.75 * deep),
               (mx + w * 0.50, my - h * 0.45), 32)
    c.tapered(pts, lw * 1.55, pal["contorno"], wend=0.30)


def mouth_sorriso_grande(c, mx, my, w, pal, lw=LW, **_):
    """Sorriso grande: mais largo, mais fundo e com cantos levantados."""
    h = w * 0.26
    pts = qbez((mx - w * 0.56, my - h * 0.95),
               (mx, my + h * 1.85),
               (mx + w * 0.56, my - h * 0.95), 36)
    c.tapered(pts, lw * 1.65, pal["contorno"], wend=0.28)
    for s in (-1, 1):                                   # tracos nos cantos
        cx0 = mx + s * w * 0.56
        c.line([(cx0, my - h * 0.95), (cx0 + s * w * 0.075, my - h * 1.42)],
               lw * 0.75, pal["contorno"])


def mouth_aberta(c, mx, my, w, pal, lw=LW, escala=0.7, alt=1.25, dentes=False, **_):
    """Boca aberta: oval cheia, lingua em baixo, dentes opcionais."""
    rx = w * 0.30 * escala
    ry = rx * alt
    c.ell(mx, my + ry * 0.18, rx, ry, fill=pal["boca_cor"],
          outline=pal["contorno"], w=lw)
    c.ell(mx, my + ry * 0.62, rx * 0.60, ry * 0.38, fill=pal["lingua"])   # lingua
    if dentes:                                                            # dentes
        c.poly([(mx - rx * 0.70, my - ry * 0.58), (mx + rx * 0.70, my - ry * 0.58),
                (mx + rx * 0.56, my - ry * 0.22), (mx - rx * 0.56, my - ry * 0.22)],
               fill=pal["dentes"])


def mouth_lingua(c, mx, my, w, pal, lw=LW, **_):
    """Boca com lingua de fora: sorriso + lingua pendurada."""
    mouth_sorriso(c, mx, my - w * 0.02, w * 0.70, pal, lw=lw)
    rx, ry = w * 0.150, w * 0.150
    c.ell(mx, my + ry * 0.80, rx, ry, fill=pal["lingua"],
          outline=pal["contorno"], w=lw * 0.9)
    c.line([(mx, my + ry * 0.28), (mx, my + ry * 1.32)], lw * 0.7, pal["contorno"])


def mouth_franzida(c, mx, my, w, pal, lw=LW, lisa=False, **_):
    """Boca franzida: arco para cima (triste) + vinco central."""
    h = w * 0.15
    if lisa:                                            # variante quase recta
        c.tapered([(mx - w * 0.38, my), (mx, my + h * 0.10), (mx + w * 0.38, my)],
                  lw * 1.35, pal["contorno"], wend=0.55)
    else:
        pts = qbez((mx - w * 0.40, my + h * 0.90),
                   (mx, my - h * 2.20),
                   (mx + w * 0.40, my + h * 0.90), 30)
        c.tapered(pts, lw * 1.40, pal["contorno"], wend=0.36)
    c.line([(mx, my - h * 0.80), (mx, my - h * 1.90)], lw * 0.70, pal["contorno"])


def mouth_ondulada(c, mx, my, w, pal, lw=LW, **_):
    """Boca ondulada (enjoado): onda sinusoidal."""
    pts, n = [], 60
    for i in range(n):
        t = i / (n - 1)                                 # 0..1
        pts.append((mx - w * 0.46 + t * w * 0.92,
                    my + math.sin(t * 2.5 * 2 * math.pi) * w * 0.055))
    c.tapered(pts, lw * 1.25, pal["contorno"], wend=0.38)


MOUTHS = {
    "sorriso": mouth_sorriso,
    "sorriso_grande": mouth_sorriso_grande,
    "aberta": mouth_aberta,
    "lingua": mouth_lingua,
    "franzida": mouth_franzida,
    "ondulada": mouth_ondulada,
}


# ==========================================================================
# 9. EXTRAS
# ==========================================================================
def x_lagrima(c, pal, p, s=1.0, **__):
    """Lagrima: gota azul a escorrer sob o olho."""
    x, y = p
    w = 7.0 * s
    c.poly([(x, y - w * 1.5), (x + w * 0.55, y + w * 0.25),
            (x + w * 0.30, y + w * 0.85), (x - w * 0.30, y + w * 0.85),
            (x - w * 0.55, y + w * 0.25)],
           fill=pal["lagrima_cor"], outline=pal["contorno"], w=2.6)
    c.ell(x - w * 0.16, y + w * 0.30, w * 0.16, w * 0.22, fill=(255, 255, 255))


def x_suor(c, pal, p, s=1.0, **__):
    """Gota de suor: gota azul-claro na fonte."""
    x, y = p
    w = 8.0 * s
    c.poly([(x, y - w * 1.55), (x + w * 0.62, y + w * 0.20),
            (x + w * 0.34, y + w * 0.90), (x - w * 0.34, y + w * 0.90),
            (x - w * 0.62, y + w * 0.20)],
           fill=pal["suor_cor"], outline=pal["contorno"], w=2.8)
    c.ell(x - w * 0.20, y + w * 0.28, w * 0.17, w * 0.24, fill=(255, 255, 255))


def x_coracoes(c, pal, spots, **__):
    """Coracoes a flutuar (com halo branco para ler sobre a pelagem)."""
    for sp in spots:
        x, y, s = sp["p"][0], sp["p"][1], sp["s"]
        c.poly(heart_pts(x, y, s * 1.42), fill=(255, 255, 255))      # halo
        c.poly(heart_pts(x, y, s * 1.10), fill=pal["coracao"],
               outline=pal["contorno"], w=3.0)
        c.ell(x - s * 0.30, y - s * 0.22, s * 0.18, s * 0.13, fill=(255, 240, 244))


def x_zzz(c, pal, spots, **__):
    """Zzz do sono, com halo branco."""
    for sp in spots:
        x, y, s = sp["p"][0], sp["p"][1], sp["s"]
        w = s * 0.85
        pts = [(x, y), (x + w, y), (x, y + w), (x + w, y + w)]
        c.line(pts, 5.0, (255, 255, 255))                            # halo
        c.line(pts, 2.8, pal["zzz_cor"])


def x_rubor(c, pal, cheeks, **__):
    """Rubor extra: manchas rosa translucidas nas bochechas."""
    layer = Canvas(c.img.width // c.ss, c.img.height // c.ss, c.ss)
    for ck in cheeks:
        x, y = ck["p"]
        rx, ry = ck["r"]
        layer.ell(x, y, rx, ry, fill=pal["blush"] + (140,))
    small = layer.img.resize((layer.img.width // c.ss, layer.img.height // c.ss),
                             Image.LANCZOS)
    small = small.filter(ImageFilter.GaussianBlur(1.0))               # suaviza
    c.img.alpha_composite(small.resize(c.img.size, Image.LANCZOS))


def x_brilhos(c, pal, spots=None, **__):
    """Brilhos (encantado): estrelinhas amarelas com halo branco."""
    if not spots:
        spots = [(-0.95, -0.55, 1.00), (0.85, -0.30, 0.62)]
    sx, sy, sw, sh = c.spark
    for (dx, dy, k) in spots:
        x, y = sx + dx * sw, sy + dy * sh
        r = 7.0 * k
        c.poly(star_pts(x, y, r * 1.55), fill=(255, 255, 255))       # halo
        c.poly(star_pts(x, y, r), fill=pal["brilho"],
               outline=pal["contorno"], w=2.2)


EXTRAS = {
    "lagrima": x_lagrima,
    "suor": x_suor,
    "coracoes": x_coracoes,
    "zzz": x_zzz,
    "rubor": x_rubor,
    "brilhos": x_brilhos,
}


def apply_green(rgb, cfg):
    """Tonalidade esverdeada (doente), limitada a cara e com corte no pescoco."""
    h, w = rgb.shape[:2]
    ell = _ellipse_mask((h, w), (cfg["verde"]["c"][0], cfg["verde"]["c"][1],
                                 cfg["verde"]["r"][0], cfg["verde"]["r"][1]))
    yy = np.mgrid[0:h, 0:w][0]
    ell &= yy < cfg["verde"]["corte"]                   # nao desce ao corpo
    m = Image.fromarray((ell * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(6))                    # bordo suave
    a = (np.asarray(m).astype(np.float32) / 255.0)[..., None] * 0.45
    tint = rgb.astype(np.float32) * np.array([0.90, 1.06, 0.82])
    return np.clip(rgb * (1 - a) + tint * a, 0, 255).astype(np.uint8)


# ==========================================================================
# 10. RENDER
# ==========================================================================
_CACHE = {}


def load_char(who):
    """Carrega base, constroi alfa e a versao sem tracos (uma vez)."""
    if who in _CACHE:
        return _CACHE[who]
    im = Image.open(BASE_DIR / f"{who}.png").convert("RGB")
    if im.size != (340, 640):                           # sanidade da base
        raise SystemExit(f"base {who} inesperada: {im.size}")
    rgb = np.asarray(im).astype(np.uint8)
    alpha = build_alpha(who, rgb)                        # fundo -> transparente
    mask, src = build_erase_mask(who, rgb)               # tracos + fontes
    blank = inpaint(rgb, mask, src)                      # cara "limpa"
    _CACHE[who] = dict(rgb=rgb, blank=blank, alpha=alpha, mask=mask)
    return _CACHE[who]


def render(who, spec):
    """Devolve a imagem final (RGBA 272x512) com a expressao pedida."""
    cfg = CFG[who]
    data = load_char(who)
    rgb = data["blank"].copy()                          # corpo intocado

    c = Canvas(340, 640)                                # camada de desenho (4x)
    ex = sum(e["c"][0] for e in cfg["olhos"]) / 2.0     # centro medio dos olhos
    ey = sum(e["c"][1] for e in cfg["olhos"]) / 2.0
    c.spark = (ex, ey, cfg["olhos"][0]["r"][0] * 3.4, cfg["olhos"][0]["r"][1] * 1.8)

    olhos = spec["olhos"]                               # um ou dois estilos
    if isinstance(olhos, str):
        olhos = [olhos, olhos]
    kw = dict(lid=spec.get("lid", 0.45), dx=spec.get("olho_dx", 5.0),
              sh=(0.0, spec.get("olho_dy", 0.0)))
    for i, (style, eye) in enumerate(zip(olhos, cfg["olhos"])):
        EYES[style](c, eye, cfg, **kw)                  # olho i
        draw_brow(c, cfg["sobrolho"][i], spec["sobrolhos"], i, cfg, cfg["tilt"])

    b = cfg["boca"]                                     # boca
    mx, my, bw = b["mx"], b["my"], b["w"]
    MOUTHS[spec["boca"]](c, mx, my, bw, cfg,
                         escala=spec.get("boca_escala", 0.72),
                         alt=spec.get("boca_alt", 1.3),
                         lisa=spec.get("lisa", False),
                         dentes=spec.get("dentes", False))
    if spec["boca"] not in ("aberta", "lingua"):        # filtro do nariz
        _filter_line(c, mx, b["filtro"][1], my - 2.0, cfg)

    for name in spec.get("extras", []):                 # extras
        if name == "verde":
            continue                                    # tratado depois
        fn = EXTRAS[name]
        if fn is x_lagrima:
            fn(c, cfg, cfg["lagrima"]["p"], s=cfg["lagrima"]["s"])
        elif fn is x_suor:
            fn(c, cfg, cfg["suor"]["p"], s=cfg["suor"]["s"])
        elif fn is x_coracoes:
            fn(c, cfg, cfg["coracoes"])
        elif fn is x_zzz:
            fn(c, cfg, cfg["zzz"])
        elif fn is x_rubor:
            fn(c, cfg, cfg["rubor"])
        else:
            fn(c, cfg)

    layer = c.img.resize((340, 640), Image.BOX)         # anti-alias 4:1 exacto
    base = Image.fromarray(rgb).convert("RGBA")
    base.putalpha(Image.fromarray(data["alpha"], "L"))
    fig = Image.alpha_composite(base, layer)

    if "verde" in spec.get("extras", []):               # tinge a cara
        arr = apply_green(np.asarray(fig.convert("RGB")), cfg)
        al = np.asarray(fig.getchannel("A"))
        fig = Image.fromarray(np.dstack([arr, al]), "RGBA")

    return fig.resize((int(round(340 * FINAL_H / 640)), FINAL_H), Image.LANCZOS)


# ==========================================================================
# 11. CONTACT SHEET
# ==========================================================================
def _font(size, bold=True):
    """Fonte do sistema, com recurso seguro."""
    names = ["arialbd.ttf", "seguisb.ttf", "arial.ttf"] if bold else ["arial.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(str(Path("C:/Windows/Fonts") / n), size)
        except Exception:
            continue
    return ImageFont.load_default()


def contact_sheet(paths, path_out):
    """40 celulas: 5 colunas por personagem, 4 linhas, etiqueta em cada."""
    cols, rows = 5, 4
    cw, ch = 200, 300                                   # celula (com etiqueta)
    pad, top = 10, 66
    W = cols * 2 * cw + pad * 3
    H = top + rows * ch + pad
    sheet = Image.new("RGB", (W, H), (244, 233, 216))
    d = ImageDraw.Draw(sheet)
    names = list(POSES.keys())
    f_title, f_lab = _font(30), _font(17)
    for block, who in enumerate(("frida", "luna")):
        bx = pad + block * (cols * cw + pad)
        d.text((bx + 8, 14), who.upper(), font=f_title, fill=(74, 32, 20))
        for i, name in enumerate(names):
            r, cidx = divmod(i, cols)
            x = bx + cidx * cw
            y = top + r * ch
            d.rounded_rectangle([x + 4, y + 4, x + cw - 4, y + ch - 4], 12,
                                fill=(252, 246, 236), outline=(214, 194, 170))
            im = paths[(who, name)]
            k = 250.0 / im.height                       # cabe na celula
            im2 = im.resize((max(1, int(im.width * k)), 250), Image.LANCZOS)
            sheet.paste(im2, (x + (cw - im2.width) // 2, y + 8), im2)
            tw = d.textlength(name, font=f_lab)
            d.text((x + (cw - tw) / 2, y + ch - 34), name, font=f_lab,
                   fill=(92, 44, 26))
    sheet.save(path_out)
    return sheet


# ==========================================================================
# 12. MAIN
# ==========================================================================
def main(argv):
    debug = "--debug" in argv
    only = None
    for i, a in enumerate(argv):
        if a == "--only":
            only = argv[i + 1]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    whos = [only] if only else ["frida", "luna"]
    manifest = {"gerado_por": "chars/expressoes.py", "escala": SS,
                "altura_final": FINAL_H, "traco_px": LW,
                "bases": {}, "poses": {}}
    paths = {}

    for who in whos:
        (OUT_DIR / who).mkdir(parents=True, exist_ok=True)
        data = load_char(who)
        manifest["bases"][who] = {
            "ficheiro": f"base/{who}.png",
            "tamanho_base": [340, 640],
            "contorno": "#%02X%02X%02X" % CFG[who]["contorno"],
            "olhos": CFG[who]["olhos"],
            "boca": CFG[who]["boca"],
            "pixeis_apagados": int(data["mask"].sum()),
        }
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
        print("contact sheet ->", sp)

    if debug:
        for who in whos:
            data = load_char(who)
            vis = data["blank"].copy()
            vis[data["mask"]] = (255, 0, 0)              # pinta o que se apagou
            im = Image.fromarray(vis).crop((0, 0, 340, 340))
            im.resize((im.width * 2, im.height * 2), Image.NEAREST).save(
                HERE / f"_dbg_apagado_{who}.png")
            bl = Image.fromarray(data["blank"]).crop((0, 0, 340, 340))
            bl.resize((bl.width * 2, bl.height * 2), Image.LANCZOS).save(
                HERE / f"_dbg_limpo_{who}.png")
            print("debug ->", HERE / f"_dbg_apagado_{who}.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
