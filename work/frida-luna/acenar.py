#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""acenar.py — gesto de TCHAU para Frida e Luna (rig 2D, sem pixéis novos).

O braço é extraído INTEIRO (ombro→pata) da pose aprovada, com a ALFA REAL.
Na base, a zona do braço é limpa (Frida: transparência — o braço está na
silhueta; Luna: preenchimento pelo pixél vizinho — o braço está sobre a barriga).
A peça do braço roda em torno do OMBRO com amplitude grande e oscila (tchau).
Nunca se roda o frame inteiro, nunca se desenham pixéis novos, nunca se aplica
filtro de sombra por cor. Micro-movimentos (orelha, olho, bochecha, rabo) vivem.

Saída: _acenar/<quem>/f00..f09.png + card/_acenar-<quem>.png
Uso:
    py acenar.py --explorar        # folha de ângulos para calibração
    py acenar.py                   # gera os dois ciclos
"""
from __future__ import annotations

import math
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

BASE = Path(r"D:\CRAFT\work\frida-luna")
sys.path.insert(0, str(BASE))
import rig_novo  # noqa: E402  (CAIXA, PECAS)

OUT = BASE / "_acenar"
CARD = BASE / "card"
N = 10

# --- geometria do braço de cada personagem (coords do sprite aprovado) --------
# x_left: fronteira interior do braço (a linha escura contra o corpo), por linha y.
# y0..y1: extensão vertical do braço (ombro -> pata).
# piv: OMBRO (centro de rotação).
BRACO = {
    "frida": dict(
        xlos=[(98, 149.0), (110, 145.0), (130, 140.0), (172, 140.0)],
        y0=99, y1=177,
        piv=(150.0, 104.0),
        keep_top=13,              # toco do ombro fica na base (liga o braço ao corpo)
        erase_x_shift=6,          # mantém faixa castanha da lateral
        fill_brown=False,         # preencher com a cor VIZINHA REAL (barriga creme à esquerda)
        base="preencher",
    ),
    "luna": dict(
        xlos=[(137, 119.0), (150, 112.0), (165, 105.0), (182, 104.0)],
        y0=137, y1=181,
        piv=(125.0, 141.0),
        keep_top=9,               # toco do ombro fica na base
        base="preencher",         # braço está ONTOP da barriga
    ),
}

# Ângulo do braço em cada frame (graus, + = anti-horário visual = levantar à direita).
# sobe -> 3 batidas -> desce; f00 em repouso fecha o loop e garante continuidade.
ANGULOS = {
    "frida": [0, 70, 130, 180, 162, 180, 162, 180, 120, 55],
    "luna":  [0, 50, 80, 175, 150, 175, 150, 175, 80, 45],
}

# micro-movimentos (pequenos, derivados do rig_novo)
MICRO = {
    "orelha": 3.0, "olhar": 1.5, "bochecha": 1.0, "cauda": 3.0, "cabeca": 0.5,
}


def _interp(y, pontos):
    ys = [p[0] for p in pontos]
    xs = [p[1] for p in pontos]
    return float(np.interp(y, ys, xs))


def rodar_braco(peca, piv_local, piv_global, ang):
    """Roda a peça sem a cortar: tela quadrada ancorada no ombro."""
    if abs(ang) < 0.01:
        return peca.copy(), int(round(piv_global[0] - piv_local[0])), \
               int(round(piv_global[1] - piv_local[1]))
    r = max(math.hypot(piv_local[0] - cx, piv_local[1] - cy)
            for cx in (0, peca.width) for cy in (0, peca.height))
    S = 2 * int(math.ceil(r)) + 10
    meio = S // 2
    tela = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    tela.paste(peca, (meio - int(round(piv_local[0])), meio - int(round(piv_local[1]))))
    rot = tela.rotate(ang, resample=Image.BICUBIC, expand=False, fillcolor=(0, 0, 0, 0))
    return rot, int(round(piv_global[0] - meio)), int(round(piv_global[1] - meio))


def extrair_braco(quem, src):
    """Devolve (peca RGBA, base RGBA sem o braço, piv_local, bbox)."""
    g = BRACO[quem]
    W, H = rig_novo.CAIXA[quem]
    al = src[:, :, 3]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    xl = np.interp(yy.ravel(), [p[0] for p in g["xlos"]],
                   [p[1] for p in g["xlos"]]).reshape(H, W)
    # abaixo de y=172 só existe a PONTA DA PATA (x>=152); a perna fica em x<152
    if quem == "frida":
        ponta = yy > 172
        xl[ponta] = np.maximum(xl[ponta], 152.0)
    # A PEÇA QUE RODA INCLUI A PATA INTEIRA — se a pata for excluída fica um
    # buraco transparente no corpo (defeito rejeitado pelo utilizador). Para não
    # bater na borda, reduz-se a amplitude do balanço em vez de cortar a pata.
    mask_all = (xx >= xl - 1.0) & (yy >= g["y0"]) & (yy <= g["y1"]) & (al > 20)
    mask = mask_all
    ys, xs = np.nonzero(mask)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1

    crop = src[y0:y1, x0:x1].copy()
    m = mask[y0:y1, x0:x1]
    crop[..., 3] = np.where(m, al[y0:y1, x0:x1], 0).astype(np.uint8)
    peca = Image.fromarray(crop, "RGBA")
    piv = (g["piv"][0] - x0, g["piv"][1] - y0)

    # BASE: apagar o braço em repouso e preencher replicando a coluna da MESMA
    # linha 3 px à esquerda da fronteira do braço (xl). Isto preserva a cor
    # local da lateral do corpo em cada altura (creme no meio, castanho em cima)
    # SEM puxar o contorno escuro da direita — causa dos risos rejeitados.
    base = src.copy()
    shift = g.get("erase_x_shift", 0)
    erase = mask_all & (xx >= xl - 1.0 + shift) & (yy >= g["y0"] + g["keep_top"])
    if erase.any():
        # origem: mesma linha y, coluna 4 px à esquerda da fronteira
        src_x = np.clip((xl - 4).astype(int), 0, W - 1)
        col = np.clip(src_x[..., None], 0, W - 1)
        lin = np.arange(H)[:, None]
        fill = base[lin, col]                 # copia a cor local da lateral
        base[erase] = fill[erase]
    return peca, Image.fromarray(base, "RGBA"), piv, (x0, y0, x1, y1), mask


def _micro(quem, i):
    """Devolve {(nome, box): imagem} das peças com micro-movimento neste frame."""
    src = Image.open(BASE / "chars" / "poses-v3" / quem / "happy.png").convert("RGBA")
    srcarr = np.array(src)
    fase = (i / N) * math.tau
    s, c = math.sin(fase), math.cos(fase)
    out = {}
    nomes = ("orelha", "olho", "bochecha", "nariz") if quem == "luna" else \
            ("orelha", "olho", "bochecha", "rabo")
    for nome, box in rig_novo.PECAS[quem]:
        if not any(n in nome for n in nomes):
            continue
        x0, y0, x1, y1, px, py, z, tipo = box
        x1, y1 = min(x1, src.width), min(y1, src.height)
        crop = src.crop((x0, y0, x1, y1)).convert("RGBA")
        # alfa real com elipse suave, igual ao rig_novo (sem pixéis novos)
        peca = rig_novo._alfa_real(srcarr, (x0, y0, x1, y1, px, py, z, tipo))
        if tipo == "rot":
            ang = MICRO["orelha"] * s if "orelha" in nome else MICRO["cabeca"] * s
            if "rabo" in nome or nome == "cauda":
                ang = MICRO["cauda"] * s
            peca = peca.rotate(ang, resample=Image.BICUBIC,
                               center=(px - x0, py - y0), expand=False,
                               fillcolor=(0, 0, 0, 0))
        else:
            amp = MICRO["olhar"] if "olho" in nome else MICRO["bochecha"]
            dx = int(round(amp * c))
            dy = int(round(0.5 * s))
            tmp = Image.new("RGBA", peca.size, (0, 0, 0, 0))
            tmp.paste(peca, (dx, dy))
            peca = tmp
        out[(nome, x0, y0)] = peca
    return out


def gerar(quem, angulos=None):
    angulos = angulos or ANGULOS[quem]
    W, H = rig_novo.CAIXA[quem]
    src = np.array(Image.open(BASE / "chars" / "poses-v3" / quem / "happy.png").convert("RGBA"))
    peca, base, piv, bbox, mask = extrair_braco(quem, src)
    x0, y0, x1, y1 = bbox
    dest = OUT / quem
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    pivg = BRACO[quem]["piv"]
    for i, ang in enumerate(angulos):
        frame = base.copy()
        rod, rx, ry = rodar_braco(peca, piv, pivg, ang)
        # por cima: braço rodado e micro-movimentos
        frame.alpha_composite(rod, (rx, ry))
        for (nome, mx, my), p in _micro(quem, i).items():
            frame.alpha_composite(p, (mx, my))
        frame.save(dest / f"f{i:02d}.png")
    return dest


def folha(quem, dest):
    W, H = rig_novo.CAIXA[quem]
    fs = sorted(dest.glob("f*.png"))
    sheet = Image.new("RGB", (len(fs) * (W + 8) + 8, H + 34), (238, 236, 232))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(fs):
        im = Image.open(f).convert("RGBA")
        x = 8 + i * (W + 8)
        sheet.paste(im, (x, 24), im)
        d.text((x + 2, 5), f"f{i:02d} {ANGULOS[quem][i]:+d}", fill=(20, 20, 20))
    out = CARD / f"_acenar-{quem}.png"
    sheet.save(out)
    return out


def explorar():
    CARD.mkdir(parents=True, exist_ok=True)
    angs = [0, 60, 100, 130, 150, 160, 170, 180, -60]
    for quem in ("frida", "luna"):
        src = np.array(Image.open(BASE / "chars" / "poses-v3" / quem / "happy.png").convert("RGBA"))
        peca, base, piv, bbox, mask = extrair_braco(quem, src)
        x0, y0, _, _ = bbox
        W, H = rig_novo.CAIXA[quem]
        sheet = Image.new("RGB", (len(angs) * (W + 6), H + 40), (235, 233, 229))
        d = ImageDraw.Draw(sheet)
        pivg = BRACO[quem]["piv"]
        for j, ang in enumerate(angs):
            fr = base.copy()
            rod, rx, ry = rodar_braco(peca, piv, pivg, ang)
            fr.alpha_composite(rod, (rx, ry))
            x = 3 + j * (W + 6)
            sheet.paste(fr.convert("RGB"), (x, 34))
            d.text((x + 2, 6), f"{ang:+d}", fill=(0, 0, 0))
        out = CARD / f"_explorar-braco-{quem}.png"
        sheet.save(out)
        # peça isolada, ampliada
        p = peca.resize((peca.width * 3, peca.height * 3), Image.NEAREST)
        pbg = Image.new("RGB", p.size, (235, 233, 229))
        pbg.paste(p, (0, 0), p)
        pbg.save(CARD / f"_explorar-peca-{quem}.png")
        print("explorar:", out, "piv", piv, "bbox", bbox)


def main():
    CARD.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    if "--explorar" in sys.argv:
        explorar()
        return
    for quem in ("frida", "luna"):
        dest = gerar(quem)
        sheet = folha(quem, dest)
        print(f"{quem}: {len(list(dest.glob('f*.png')))} frames -> {dest}")
        print(f"  folha: {sheet}")


if __name__ == "__main__":
    main()
